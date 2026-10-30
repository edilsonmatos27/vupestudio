import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ q: z.string().max(100).optional(), sort: z.enum(["recent", "name", "created"]).optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const U = await import("@/lib/server-utils.server");
    let q = U.supabaseAdmin.from("projects").select("*").eq("user_id", context.userId).is("deleted_at", null);
    if (data.q) q = q.ilike("name", `%${data.q.replace(/[%_]/g, "")}%`);
    q = data.sort === "name" ? q.order("name") : data.sort === "created" ? q.order("created_at", { ascending: false }) : q.order("updated_at", { ascending: false });
    const { data: projects } = await q.limit(200);
    const ids = (projects ?? []).map((p) => p.id);
    const { data: counts } = ids.length
      ? await U.supabaseAdmin.from("assets").select("project_id").in("project_id", ids).is("deleted_at", null)
      : { data: [] as { project_id: string | null }[] };
    return (projects ?? []).map((p) => ({ ...p, asset_count: (counts ?? []).filter((c) => c.project_id === p.id).length }));
  });

export const createProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ name: z.string().trim().min(1).max(120), description: z.string().max(500).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const U = await import("@/lib/server-utils.server");
    const { data: p, error } = await U.supabaseAdmin.from("projects").insert({ user_id: context.userId, name: data.name, description: data.description ?? null }).select("*").single();
    if (error) throw new Error("Não foi possível criar o projeto.");
    return p;
  });

export const updateProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), name: z.string().trim().min(1).max(120), description: z.string().max(500).nullable().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const U = await import("@/lib/server-utils.server");
    const { data: p, error } = await U.supabaseAdmin
      .from("projects")
      .update({ name: data.name, ...(data.description !== undefined ? { description: data.description } : {}) })
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error || !p) throw new Error("Projeto não encontrado.");
    return p;
  });

export const deleteProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const U = await import("@/lib/server-utils.server");
    const db = U.supabaseAdmin;
    const now = new Date().toISOString();
    const { data: p } = await db.from("projects").update({ deleted_at: now }).eq("id", data.id).eq("user_id", context.userId).is("deleted_at", null).select("id").maybeSingle();
    if (!p) throw new Error("Projeto não encontrado.");
    // In-flight operations finish but their results are detached from the deleted project.
    await db.from("operations").update({ project_id: null }).eq("project_id", data.id);
    await db.from("assets").update({ deleted_at: now }).eq("project_id", data.id).is("deleted_at", null);
    const purged = await U.purgeDeletedAssets(context.userId);
    return { ok: true, purged };
  });

export const getProject = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const U = await import("@/lib/server-utils.server");
    const db = U.supabaseAdmin;
    const { data: p } = await db.from("projects").select("*").eq("id", data.id).eq("user_id", context.userId).is("deleted_at", null).maybeSingle();
    if (!p) throw new Error("Projeto não encontrado.");
    const { data: ops } = await db
      .from("operations")
      .select("id, type, status, agent_name, model, user_instructions, created_at, charged")
      .eq("project_id", data.id)
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(100);
    const { data: assets } = await db
      .from("assets")
      .select("id, kind, mime, filename, storage_path, parent_asset_id, operation_id, created_at")
      .eq("project_id", data.id)
      .eq("user_id", context.userId)
      .is("deleted_at", null)
      .neq("kind", "upload")
      .order("created_at", { ascending: false })
      .limit(200);
    const withUrls = await Promise.all((assets ?? []).map(async (a) => ({ ...a, url: await U.signedUrl(a.storage_path) })));
    return { project: p, operations: ops ?? [], assets: withUrls };
  });
