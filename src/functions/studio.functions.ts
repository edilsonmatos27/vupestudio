import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { MODEL_CATALOG, NO_CREDITS_MESSAGE, TRIAL_EXPIRED_MESSAGE, findModel, type Task } from "@/lib/models";

function accessMessage(code: string, reason?: string) {
  switch (code) {
    case "trial_expired":
      return TRIAL_EXPIRED_MESSAGE;
    case "blocked":
      return `Sua conta está bloqueada pelo administrador${reason ? `: ${reason}` : "."}`;
    case "no_access":
      return "Você não possui teste válido nem assinatura paga vigente. Escolha um plano e conclua o pagamento para continuar.";
    default:
      return "Acesso indisponível.";
  }
}

/** Options the caller may use right now (validated again on every operation). */
export const studioOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const U = await import("@/lib/server-utils.server");
    const [access, settings] = await Promise.all([U.getAccess(context.userId), U.getSettings()]);
    const enabled = settings.ai_models as Record<string, { enabled: boolean }>;
    const allowedModels = (access.models ?? []) as string[];
    const models = MODEL_CATALOG.filter((m) => enabled[m.id]?.enabled && (access.code === "admin" || !allowedModels.length || allowedModels.includes(m.id)));
    const { data: projects } = await U.supabaseAdmin.from("projects").select("id, name").eq("user_id", context.userId).is("deleted_at", null).order("updated_at", { ascending: false });
    return {
      access,
      accessMessage: access.ok ? null : accessMessage(access.code, access.reason),
      models,
      defaults: settings.ai_defaults as Record<string, string>,
      maxBatch: access.code === "admin" ? 3 : Math.min(3, access.max_batch ?? 1),
      features: access.code === "admin" ? ["invent", "edit", "compose", "variation", "vectorize"] : ((access.features ?? []) as string[]),
      projects: projects ?? [],
    };
  });

const opSchema = z.object({
  type: z.enum(["invent", "edit", "compose", "variation"]),
  model: z.string().max(100),
  agentId: z.string().uuid().nullable().optional(),
  instructions: z.string().max(4000).default(""),
  aspect: z.string().max(10).optional(),
  quality: z.string().max(10).optional(),
  transparent: z.boolean().optional(),
  count: z.number().int().min(1).max(3).default(1),
  projectId: z.string().uuid().nullable().optional(),
  inputs: z
    .object({
      main: z.array(z.string().uuid()).max(3).default([]),
      style: z.array(z.string().uuid()).max(2).default([]),
      element: z.array(z.string().uuid()).max(4).default([]),
      logo: z.array(z.string().uuid()).max(1).default([]),
    })
    .default({}),
  sourceAssetId: z.string().uuid().nullable().optional(),
  idempotencyKey: z.string().uuid(),
});

export const createOperation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => opSchema.parse(d))
  .handler(async ({ data, context }) => {
    const U = await import("@/lib/server-utils.server");
    const db = U.supabaseAdmin;
    const uid = context.userId;

    const { data: dup } = await db.from("operations").select("id").eq("user_id", uid).eq("idempotency_key", data.idempotencyKey).maybeSingle();
    if (dup) return { operationId: dup.id, duplicate: true };

    const [access, settings] = await Promise.all([U.getAccess(uid), U.getSettings()]);
    if (!access.ok) throw new Error(accessMessage(access.code, access.reason));
    const admin = access.code === "admin";
    if (!admin && !(access.features ?? []).includes(data.type)) throw new Error("Este recurso não está incluído no seu plano.");

    const model = findModel(data.model);
    const enabled = settings.ai_models as Record<string, { enabled: boolean }>;
    if (!model || !enabled[model.id]?.enabled) throw new Error("Modelo indisponível. Escolha outro modelo.");
    if (!model.tasks.includes(data.type as Task)) throw new Error("Este modelo não suporta esta operação.");
    const allowedModels = (access.models ?? []) as string[];
    if (!admin && allowedModels.length && !allowedModels.includes(model.id)) throw new Error("Este modelo não está incluído no seu plano.");
    if (data.aspect && model.aspects.length && !model.aspects.includes(data.aspect)) throw new Error("Proporção não suportada pelo modelo.");
    if (data.quality && !model.qualities.includes(data.quality)) throw new Error("Qualidade não suportada pelo modelo.");
    if (data.transparent && !model.transparency) throw new Error("Este modelo não gera fundo transparente.");

    const { count: recent } = await db.from("operations").select("id", { count: "exact", head: true }).eq("user_id", uid).gte("created_at", new Date(Date.now() - 60000).toISOString());
    if ((recent ?? 0) >= 10) throw new Error("Muitas operações em sequência. Aguarde um minuto.");

    const ins = data.inputs;
    const allIds = [...ins.main, ...ins.style, ...ins.element, ...ins.logo, ...(data.sourceAssetId ? [data.sourceAssetId] : [])];
    if (allIds.length) {
      const { data: owned } = await db.from("assets").select("id, mime").eq("user_id", uid).is("deleted_at", null).in("id", allIds);
      const ok = new Set((owned ?? []).filter((a) => a.mime !== "image/svg+xml").map((a) => a.id));
      if (allIds.some((id) => !ok.has(id))) throw new Error("Um dos arquivos enviados não está disponível.");
    }
    const maxBatch = admin ? 3 : Math.min(3, access.max_batch ?? 1);
    let items: { source_asset_id: string | null }[] = [];
    if (data.type === "edit") {
      if (!ins.main.length) throw new Error("Envie a imagem principal para editar.");
      items = ins.main.length > 1 ? ins.main.map((id) => ({ source_asset_id: id })) : Array.from({ length: data.count }, () => ({ source_asset_id: ins.main[0]! }));
    } else if (data.type === "variation") {
      if (!data.sourceAssetId) throw new Error("Selecione a imagem para gerar variações.");
      items = Array.from({ length: data.count }, () => ({ source_asset_id: data.sourceAssetId! }));
    } else if (data.type === "compose") {
      if (!ins.main.length && !ins.element.length && !ins.logo.length && !ins.style.length) throw new Error("Envie ao menos uma imagem para a composição.");
      if (data.instructions.trim().length < 3) throw new Error("Descreva como a composição deve ficar.");
      items = Array.from({ length: data.count }, () => ({ source_asset_id: ins.main[0] ?? null }));
    } else {
      if (data.instructions.trim().length < 3 && !data.agentId) throw new Error("Descreva a imagem que deseja criar.");
      items = Array.from({ length: data.count }, () => ({ source_asset_id: null }));
    }
    if (items.length > maxBatch) throw new Error(`Seu plano permite até ${maxBatch} resultado(s) por operação.`);
    const perItemImages = 1 + ins.style.length + ins.element.length + ins.logo.length;
    if (perItemImages > model.maxInputImages) throw new Error("Imagens demais para este modelo.");

    let agent: { id: string; name: string; current_version: number; purpose: string; allowed_plan_ids: string[] } | null = null;
    let agentVersionId: string | null = null;
    if (data.agentId) {
      const { data: a } = await db.from("agents").select("id, name, current_version, purpose, allowed_plan_ids, status, deleted_at").eq("id", data.agentId).maybeSingle();
      if (!a || a.status !== "active" || a.deleted_at) throw new Error("Agente indisponível.");
      if (!admin && a.allowed_plan_ids.length && (!access.plan_id || !a.allowed_plan_ids.includes(access.plan_id))) throw new Error("Este agente não está incluído no seu plano.");
      const expected = data.type === "invent" ? "invent" : "create";
      if (a.purpose !== expected) throw new Error("Este agente não é compatível com esta bancada.");
      agent = a;
      const { data: v } = await db.from("agent_versions").select("id").eq("agent_id", a.id).eq("version", a.current_version).single();
      agentVersionId = v?.id ?? null;
    }
    if (data.projectId) {
      const { data: p } = await db.from("projects").select("id").eq("id", data.projectId).eq("user_id", uid).is("deleted_at", null).maybeSingle();
      if (!p) throw new Error("Projeto não encontrado.");
    }

    const { data: op, error } = await db
      .from("operations")
      .insert({
        user_id: uid,
        project_id: data.projectId ?? null,
        type: data.type === "compose" ? "compose" : data.type,
        status: "queued",
        agent_id: agent?.id ?? null,
        agent_name: agent?.name ?? null,
        agent_version: agent?.current_version ?? null,
        agent_version_id: agentVersionId,
        model: model.id,
        user_instructions: data.instructions,
        params: { aspect: data.aspect ?? null, quality: data.quality ?? null, transparent: !!data.transparent, inputs: ins, model_version: model.version, model_family: model.family },
        input_asset_ids: allIds,
        requested_count: items.length,
        credits_per_item: 1,
        charged: !admin,
        idempotency_key: data.idempotencyKey,
      })
      .select("id")
      .single();
    if (error || !op) {
      const { data: again } = await db.from("operations").select("id").eq("user_id", uid).eq("idempotency_key", data.idempotencyKey).maybeSingle();
      if (again) return { operationId: again.id, duplicate: true };
      throw new Error("Não foi possível registrar a operação.");
    }
    await db.from("operation_items").insert(items.map((it, idx) => ({ operation_id: op.id, user_id: uid, idx, source_asset_id: it.source_asset_id })));
    if (!admin) {
      const { error: rErr } = await db.rpc("reserve_operation_credits", { _op: op.id });
      if (rErr) {
        await db.from("operations").delete().eq("id", op.id);
        throw new Error(rErr.message.includes("INSUFFICIENT_CREDITS") ? NO_CREDITS_MESSAGE : "Não foi possível reservar créditos.");
      }
    }
    return { operationId: op.id, duplicate: false };
  });

async function refreshOperationStatus(db: any, opId: string) {
  const { data: items } = await db.from("operation_items").select("status").eq("operation_id", opId);
  const list = (items ?? []) as { status: string }[];
  const pending = list.some((i) => ["queued", "running", "storing"].includes(i.status));
  const ok = list.filter((i) => i.status === "succeeded").length;
  const status = pending ? "running" : ok === list.length ? "succeeded" : ok > 0 ? "partial" : "failed";
  await db.from("operations").update({ status }).eq("id", opId);
}

function buildPrompt(op: any, basePrompt: string | null, roles: string[]) {
  const sys = [
    "SYSTEM REQUIREMENTS (highest priority): produce exactly one finished image. Do not add watermarks or captions unless requested. Do not reproduce third-party trademarks or real identifiable people beyond the supplied inputs.",
  ];
  if (op.type === "edit") sys.push("This is an EDIT of the first input image: apply only the requested changes and preserve everything else. If people appear, preserve their identity, facial features, skin tone, body proportions and expression as faithfully as possible.");
  if (op.type === "variation") sys.push("Create a VARIATION of the first input image: keep the same subject and overall concept, vary composition, angle, lighting or details. Preserve identity of any person shown.");
  if (op.type === "compose") sys.push("This is a COMPOSITION: combine the supplied elements into one coherent scene following the user's instructions. Keep product geometry, labels and colors of supplied products unchanged.");
  const parts = [sys.join(" ")];
  if (op.user_instructions?.trim()) parts.push(`USER INSTRUCTIONS (second priority):\n${op.user_instructions.trim()}`);
  if (basePrompt) parts.push(`DEFAULT STYLE GUIDANCE (lower priority than the user instructions):\n${basePrompt}`);
  if (roles.length) parts.push(`INPUT IMAGES, in order:\n${roles.map((r, i) => `Image ${i + 1}: ${r}`).join("\n")}`);
  if (op.params?.transparent) parts.push("Output must have a transparent background.");
  return parts.join("\n\n");
}

export const runItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ itemId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const U = await import("@/lib/server-utils.server");
    const G = await import("@/lib/image-gateway.server");
    const db = U.supabaseAdmin;
    const { data: claimed } = await db
      .from("operation_items")
      .update({ status: "running", started_at: new Date().toISOString() })
      .eq("id", data.itemId)
      .eq("user_id", context.userId)
      .eq("status", "queued")
      .select("*")
      .maybeSingle();
    if (!claimed) {
      const { data: cur } = await db.from("operation_items").select("id, status, error").eq("id", data.itemId).eq("user_id", context.userId).maybeSingle();
      if (!cur) throw new Error("Item não encontrado.");
      return { status: cur.status, error: cur.error, alreadyProcessed: true };
    }
    const item = claimed;
    const { data: op } = await db.from("operations").select("*").eq("id", item.operation_id).single();
    await db.from("operations").update({ status: "running" }).eq("id", op!.id).in("status", ["queued"]);

    const fail = async (msg: string, status: "failed" | "uncertain" = "failed") => {
      await db.from("operation_items").update({ status, error: msg, finished_at: new Date().toISOString() }).eq("id", item.id);
      if (item.reservation_id) await db.rpc("release_reservation", { _res: item.reservation_id, _reason: `Falha: ${msg.slice(0, 120)}` });
      await refreshOperationStatus(db, op!.id);
      return { status, error: msg, alreadyProcessed: false };
    };

    if (op!.charged && !item.reservation_id) return fail("Reserva de créditos ausente.");
    const model = findModel(op!.model);
    if (!model) return fail("Modelo não encontrado.");

    // Load inputs in a fixed order with explicit roles
    const params = op!.params as any;
    const ins = params.inputs ?? { main: [], style: [], element: [], logo: [] };
    const ordered: { id: string; role: string }[] = [];
    if (item.source_asset_id) ordered.push({ id: item.source_asset_id, role: op!.type === "compose" ? "main image / base scene" : "main image (the one to transform)" });
    for (const id of ins.element ?? []) ordered.push({ id, role: "element to include in the composition (product, object, person or environment)" });
    for (const id of ins.style ?? []) ordered.push({ id, role: "style reference only: borrow visual language, palette and mood; do NOT copy its people, text or brand marks" });
    for (const id of ins.logo ?? []) ordered.push({ id, role: "brand logo to place in the image; keep its shapes, colors and text as close as possible" });
    if (op!.type === "invent") for (const id of ins.main ?? []) if (!ordered.some((o) => o.id === id)) ordered.push({ id, role: "reference image" });

    const images: { bytes: Uint8Array; mime: string; name: string }[] = [];
    for (const o of ordered) {
      const { data: a } = await db.from("assets").select("storage_path, mime, filename, deleted_at").eq("id", o.id).eq("user_id", context.userId).maybeSingle();
      if (!a || a.deleted_at) return fail("Um arquivo de entrada foi removido.");
      const { data: blob, error } = await db.storage.from("vupe-assets").download(a.storage_path);
      if (error || !blob) return fail("Não foi possível ler um arquivo de entrada.");
      images.push({ bytes: new Uint8Array(await blob.arrayBuffer()), mime: a.mime, name: a.filename });
    }

    let basePrompt: string | null = null;
    if (op!.agent_version_id) {
      const { data: v } = await db.from("agent_versions").select("base_prompt").eq("id", op!.agent_version_id).maybeSingle();
      basePrompt = v?.base_prompt ?? null;
    }
    const prompt = buildPrompt(op, basePrompt, ordered.map((o) => o.role));

    let bytes: Uint8Array;
    try {
      bytes = await G.runImageModel(model, prompt, images, { aspect: params.aspect ?? undefined, quality: params.quality ?? undefined, transparent: !!params.transparent });
    } catch (e) {
      const msg = e instanceof G.GatewayError ? e.message : "Falha inesperada no serviço de IA.";
      if (!(e instanceof G.GatewayError)) console.error("image model error", e);
      return fail(msg);
    }

    await db.from("operation_items").update({ status: "storing", ai_returned_at: new Date().toISOString() }).eq("id", item.id);
    const mime = U.detectImageMime(bytes) ?? "image/png";
    const ext = U.EXT[mime] ?? "png";
    const assetId = crypto.randomUUID();
    const path = `${context.userId}/results/${assetId}.${ext}`;
    let stored = false;
    // Retry persistence before ever calling the model again.
    for (let attempt = 1; attempt <= 3 && !stored; attempt++) {
      const { error } = await db.storage.from("vupe-assets").upload(path, bytes, { contentType: mime, upsert: true });
      await db.from("operation_items").update({ storage_attempts: attempt }).eq("id", item.id);
      if (!error) stored = true;
      else await new Promise((r) => setTimeout(r, 400 * attempt));
    }
    if (!stored) return fail("A imagem foi gerada, mas não pôde ser salva. Nenhum crédito foi cobrado.");

    const { data: proj } = op!.project_id
      ? await db.from("projects").select("id").eq("id", op!.project_id).is("deleted_at", null).maybeSingle()
      : { data: null };
    const { error: aErr } = await db.from("assets").insert({
      id: assetId,
      user_id: context.userId,
      project_id: proj?.id ?? null,
      operation_id: op!.id,
      operation_item_id: item.id,
      parent_asset_id: item.source_asset_id,
      kind: "result",
      storage_path: path,
      mime,
      size_bytes: bytes.length,
      filename: `vupe-${op!.type}-${assetId.slice(0, 8)}.${ext}`,
    });
    if (aErr) {
      await db.storage.from("vupe-assets").remove([path]);
      return fail("Falha ao registrar o arquivo. Nenhum crédito foi cobrado.");
    }
    if (item.reservation_id) await db.rpc("consume_reservation", { _res: item.reservation_id });
    await db.from("operation_items").update({ status: "succeeded", asset_id: assetId, finished_at: new Date().toISOString(), error: null }).eq("id", item.id);
    if (proj?.id) await db.from("projects").update({ updated_at: new Date().toISOString() }).eq("id", proj.id);
    await refreshOperationStatus(db, op!.id);
    return { status: "succeeded", error: null, alreadyProcessed: false };
  });

async function hydrateOps(U: any, ops: any[]) {
  const db = U.supabaseAdmin;
  const ids = ops.map((o) => o.id);
  if (!ids.length) return [];
  const { data: items } = await db.from("operation_items").select("id, operation_id, idx, status, error, asset_id, reservation_id").in("operation_id", ids).order("idx");
  const assetIds = (items ?? []).map((i: any) => i.asset_id).filter(Boolean);
  const { data: assets } = assetIds.length
    ? await db.from("assets").select("id, storage_path, mime, filename, deleted_at, project_id, kind").in("id", assetIds)
    : { data: [] };
  const urls = new Map<string, string | null>();
  await Promise.all((assets ?? []).filter((a: any) => !a.deleted_at).map(async (a: any) => urls.set(a.id, await U.signedUrl(a.storage_path))));
  return ops.map((o) => ({
    ...o,
    items: (items ?? [])
      .filter((i: any) => i.operation_id === o.id)
      .map((i: any) => {
        const a = (assets ?? []).find((x: any) => x.id === i.asset_id);
        return {
          id: i.id,
          idx: i.idx,
          status: i.status,
          error: i.error,
          asset: a && !a.deleted_at ? { id: a.id, mime: a.mime, filename: a.filename, url: urls.get(a.id) ?? null, kind: a.kind, project_id: a.project_id } : null,
          deleted: !!a?.deleted_at,
        };
      }),
  }));
}

const OP_COLS = "id, type, status, agent_name, agent_version, model, user_instructions, params, requested_count, credits_per_item, charged, project_id, created_at, error";

export const getOperation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const U = await import("@/lib/server-utils.server");
    const { data: op } = await U.supabaseAdmin.from("operations").select(OP_COLS).eq("id", data.id).eq("user_id", context.userId).maybeSingle();
    if (!op) throw new Error("Operação não encontrada.");
    return (await hydrateOps(U, [op]))[0];
  });

export const listHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ type: z.enum(["all", "invent", "edit", "compose", "variation", "vectorize", "logo_overlay"]).default("all"), projectId: z.string().uuid().optional(), limit: z.number().int().min(1).max(100).default(40) }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const U = await import("@/lib/server-utils.server");
    let q = U.supabaseAdmin.from("operations").select(OP_COLS).eq("user_id", context.userId).order("created_at", { ascending: false }).limit(data.limit);
    if (data.type !== "all") q = q.eq("type", data.type);
    if (data.projectId) q = q.eq("project_id", data.projectId);
    const { data: ops } = await q;
    return hydrateOps(U, ops ?? []);
  });

export const deleteAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const U = await import("@/lib/server-utils.server");
    const { data: a } = await U.supabaseAdmin.from("assets").update({ deleted_at: new Date().toISOString() }).eq("id", data.id).eq("user_id", context.userId).is("deleted_at", null).select("id").maybeSingle();
    if (!a) throw new Error("Arquivo não encontrado.");
    await U.purgeDeletedAssets(context.userId);
    return { ok: true };
  });

export const assetDownloadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const U = await import("@/lib/server-utils.server");
    const { data: a } = await U.supabaseAdmin.from("assets").select("storage_path, filename").eq("id", data.id).eq("user_id", context.userId).is("deleted_at", null).maybeSingle();
    if (!a) throw new Error("Arquivo não encontrado.");
    const url = await U.signedUrl(a.storage_path, a.filename, 300);
    if (!url) throw new Error("Não foi possível gerar o download.");
    return { url, filename: a.filename };
  });

export const moveAssetToProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ assetId: z.string().uuid(), projectId: z.string().uuid().nullable() }).parse(d))
  .handler(async ({ data, context }) => {
    const U = await import("@/lib/server-utils.server");
    if (data.projectId) {
      const { data: p } = await U.supabaseAdmin.from("projects").select("id").eq("id", data.projectId).eq("user_id", context.userId).is("deleted_at", null).maybeSingle();
      if (!p) throw new Error("Projeto não encontrado.");
    }
    const { data: a } = await U.supabaseAdmin.from("assets").update({ project_id: data.projectId }).eq("id", data.assetId).eq("user_id", context.userId).is("deleted_at", null).select("id").maybeSingle();
    if (!a) throw new Error("Arquivo não encontrado.");
    return { ok: true };
  });

// ---------------- Vectorization (local tracing in the browser, authorized & stored by the server) ----------------
export const startVectorize = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ sourceAssetId: z.string().uuid(), mode: z.enum(["logo", "drawing", "fewcolors", "illustration"]), projectId: z.string().uuid().nullable().optional(), idempotencyKey: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const U = await import("@/lib/server-utils.server");
    const db = U.supabaseAdmin;
    const access = await U.getAccess(context.userId);
    if (!access.ok) throw new Error(accessMessage(access.code, access.reason));
    if (access.code !== "admin" && !(access.features ?? []).includes("vectorize")) throw new Error("A vetorização não está incluída no seu plano.");
    const { data: src } = await db.from("assets").select("id, storage_path, mime").eq("id", data.sourceAssetId).eq("user_id", context.userId).is("deleted_at", null).maybeSingle();
    if (!src || src.mime === "image/svg+xml") throw new Error("Arquivo de origem inválido.");
    if (data.projectId) {
      const { data: p } = await db.from("projects").select("id").eq("id", data.projectId).eq("user_id", context.userId).is("deleted_at", null).maybeSingle();
      if (!p) throw new Error("Projeto não encontrado.");
    }
    const { data: existing } = await db.from("operations").select("id").eq("user_id", context.userId).eq("idempotency_key", data.idempotencyKey).maybeSingle();
    let opId = existing?.id;
    if (!opId) {
      const { data: op, error } = await db
        .from("operations")
        .insert({ user_id: context.userId, project_id: data.projectId ?? null, type: "vectorize", status: "running", model: "imagetracerjs-1.2.6", params: { mode: data.mode }, input_asset_ids: [src.id], requested_count: 1, credits_per_item: 0, charged: false, idempotency_key: data.idempotencyKey })
        .select("id")
        .single();
      if (error || !op) throw new Error("Não foi possível iniciar a vetorização.");
      opId = op.id;
      await db.from("operation_items").insert({ operation_id: op.id, user_id: context.userId, idx: 0, status: "running", source_asset_id: src.id, started_at: new Date().toISOString() });
    }
    const { data: item } = await db.from("operation_items").select("id, status").eq("operation_id", opId).eq("idx", 0).single();
    return { operationId: opId, itemId: item!.id, sourceUrl: await U.signedUrl(src.storage_path) };
  });

export const saveVector = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ itemId: z.string().uuid(), svg: z.string().min(20).max(8 * 1024 * 1024) }).parse(d))
  .handler(async ({ data, context }) => {
    const U = await import("@/lib/server-utils.server");
    const { sanitizeSvg, SvgSanitizeError } = await import("@/lib/svg-sanitize");
    const db = U.supabaseAdmin;
    const { data: item } = await db.from("operation_items").select("*").eq("id", data.itemId).eq("user_id", context.userId).eq("status", "running").maybeSingle();
    if (!item) throw new Error("Vetorização não encontrada ou já concluída.");
    const { data: op } = await db.from("operations").select("id, type, project_id").eq("id", item.operation_id).single();
    if (op?.type !== "vectorize") throw new Error("Operação inválida.");
    let clean: string;
    try {
      clean = sanitizeSvg(data.svg).svg;
    } catch (e) {
      const msg = e instanceof SvgSanitizeError ? e.message : "SVG inválido.";
      await db.from("operation_items").update({ status: "failed", error: msg, finished_at: new Date().toISOString() }).eq("id", item.id);
      await refreshOperationStatus(db, op.id);
      throw new Error(msg);
    }
    const bytes = new TextEncoder().encode(clean);
    const assetId = crypto.randomUUID();
    const path = `${context.userId}/vectors/${assetId}.svg`;
    let stored = false;
    for (let i = 1; i <= 3 && !stored; i++) {
      const { error } = await db.storage.from("vupe-assets").upload(path, bytes, { contentType: "image/svg+xml", upsert: true });
      if (!error) stored = true;
    }
    if (!stored) {
      await db.from("operation_items").update({ status: "failed", error: "Falha ao salvar o SVG.", finished_at: new Date().toISOString() }).eq("id", item.id);
      await refreshOperationStatus(db, op.id);
      throw new Error("Falha ao salvar o SVG.");
    }
    const { data: proj } = op.project_id ? await db.from("projects").select("id").eq("id", op.project_id).is("deleted_at", null).maybeSingle() : { data: null };
    await db.from("assets").insert({ id: assetId, user_id: context.userId, project_id: proj?.id ?? null, operation_id: op.id, operation_item_id: item.id, parent_asset_id: item.source_asset_id, kind: "vector", storage_path: path, mime: "image/svg+xml", size_bytes: bytes.length, filename: `vupe-vetor-${assetId.slice(0, 8)}.svg` });
    await db.from("operation_items").update({ status: "succeeded", asset_id: assetId, finished_at: new Date().toISOString() }).eq("id", item.id);
    await refreshOperationStatus(db, op.id);
    return { assetId, url: await U.signedUrl(path) };
  });

export const failVector = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ itemId: z.string().uuid(), error: z.string().max(300) }).parse(d))
  .handler(async ({ data, context }) => {
    const U = await import("@/lib/server-utils.server");
    const { data: item } = await U.supabaseAdmin.from("operation_items").update({ status: "failed", error: data.error, finished_at: new Date().toISOString() }).eq("id", data.itemId).eq("user_id", context.userId).eq("status", "running").select("operation_id").maybeSingle();
    if (item) await refreshOperationStatus(U.supabaseAdmin, item.operation_id);
    return { ok: true };
  });

export const dashboardData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const U = await import("@/lib/server-utils.server");
    const db = U.supabaseAdmin;
    const [{ data: assets }, { data: projects }, { data: ops }] = await Promise.all([
      db.from("assets").select("id, storage_path, mime, filename, kind, created_at").eq("user_id", context.userId).is("deleted_at", null).neq("kind", "upload").order("created_at", { ascending: false }).limit(8),
      db.from("projects").select("id, name, updated_at").eq("user_id", context.userId).is("deleted_at", null).order("updated_at", { ascending: false }).limit(6),
      db.from("operations").select("id, type, status, created_at, agent_name, model").eq("user_id", context.userId).order("created_at", { ascending: false }).limit(6),
    ]);
    return {
      assets: await Promise.all((assets ?? []).map(async (a) => ({ ...a, url: await U.signedUrl(a.storage_path) }))),
      projects: projects ?? [],
      operations: ops ?? [],
    };
  });
