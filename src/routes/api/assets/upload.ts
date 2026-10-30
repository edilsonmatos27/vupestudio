import { createFileRoute } from "@tanstack/react-router";

const ROLES = ["main", "style", "element", "logo", "source", "overlay"] as const;

export const Route = createFileRoute("/api/assets/upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const U = await import("@/lib/server-utils.server");
        try {
          const { userId } = await U.userFromRequest(request);
          const db = U.supabaseAdmin;
          const { data: profile } = await db.from("profiles").select("status").eq("id", userId).single();
          if (profile?.status === "blocked") throw new U.AppError("blocked", "Sua conta está bloqueada.", 403);
          const form = await request.formData();
          const file = form.get("file");
          const role = String(form.get("role") ?? "");
          if (!(file instanceof File)) throw new U.AppError("bad_request", "Arquivo ausente.");
          if (!ROLES.includes(role as never)) throw new U.AppError("bad_request", "Tipo de upload inválido.");
          if (file.size > 10 * 1024 * 1024) throw new U.AppError("too_large", "Arquivo acima de 10 MB.");
          if (file.size === 0) throw new U.AppError("bad_request", "Arquivo vazio.");
          const bytes = new Uint8Array(await file.arrayBuffer());
          const mime = U.detectImageMime(bytes);
          if (!mime) throw new U.AppError("bad_type", "Formato não suportado. Use PNG, JPG ou WEBP.");

          let parentId: string | null = null;
          let projectId: string | null = null;
          let kind: "upload" | "overlay" = "upload";
          if (role === "overlay") {
            // Deterministic logo overlay = a new version of an existing result; requires valid access.
            const access = await U.getAccess(userId);
            if (!access.ok) throw new U.AppError("no_access", access.code === "trial_expired" ? "Seu período de teste terminou. Escolha um plano e conclua o pagamento para continuar usando o Vupe Studio." : "Acesso indisponível para novas edições.", 403);
            parentId = String(form.get("parentAssetId") ?? "");
            const { data: parent } = await db.from("assets").select("id, project_id").eq("id", parentId).eq("user_id", userId).is("deleted_at", null).maybeSingle();
            if (!parent) throw new U.AppError("not_found", "Imagem de origem não encontrada.", 404);
            projectId = parent.project_id;
            kind = "overlay";
          }
          const id = crypto.randomUUID();
          const ext = U.EXT[mime]!;
          const path = `${userId}/${kind === "overlay" ? "results" : "uploads"}/${id}.${ext}`;
          const { error } = await db.storage.from("vupe-assets").upload(path, bytes, { contentType: mime });
          if (error) throw new U.AppError("storage", "Falha ao armazenar o arquivo. Tente novamente.", 502);
          const safeName = (file.name || `arquivo.${ext}`).replace(/[^\w.\- ]+/g, "_").slice(0, 100);
          const { error: insErr } = await db.from("assets").insert({
            id,
            user_id: userId,
            kind,
            role,
            parent_asset_id: parentId,
            project_id: projectId,
            storage_path: path,
            mime,
            size_bytes: bytes.length,
            filename: kind === "overlay" ? `vupe-logomarca-${id.slice(0, 8)}.${ext}` : safeName,
          });
          if (insErr) {
            await db.storage.from("vupe-assets").remove([path]);
            throw new U.AppError("db", "Falha ao registrar o arquivo.", 500);
          }
          if (kind === "overlay") {
            // Register the deterministic overlay as its own history entry (no credits charged).
            const { data: op } = await db
              .from("operations")
              .insert({ user_id: userId, project_id: projectId, type: "logo_overlay", status: "succeeded", model: "composição determinística", params: { parent_asset_id: parentId }, input_asset_ids: parentId ? [parentId] : [], requested_count: 1, credits_per_item: 0, charged: false, idempotency_key: `overlay:${id}` })
              .select("id")
              .single();
            if (op) {
              const { data: item } = await db
                .from("operation_items")
                .insert({ operation_id: op.id, user_id: userId, idx: 0, status: "succeeded", asset_id: id, source_asset_id: parentId, finished_at: new Date().toISOString() })
                .select("id")
                .single();
              await db.from("assets").update({ operation_id: op.id, operation_item_id: item?.id ?? null }).eq("id", id);
            }
          }
          return Response.json({ id, mime, url: await U.signedUrl(path), filename: safeName });
        } catch (e) {
          return U.jsonError(e);
        }
      },
    },
  },
});
