import { createFileRoute } from "@tanstack/react-router";

// Admin-only upload of public media (logo, favicon, agent illustrations).
export const Route = createFileRoute("/api/admin/media")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const U = await import("@/lib/server-utils.server");
        try {
          const { userId, supabase } = await U.userFromRequest(request);
          await U.assertAdmin(supabase, userId);
          const form = await request.formData();
          const file = form.get("file");
          if (!(file instanceof File)) throw new U.AppError("bad_request", "Arquivo ausente.");
          if (file.size > 2 * 1024 * 1024)
            throw new U.AppError("too_large", "Imagem acima de 2 MB.");
          const bytes = new Uint8Array(await file.arrayBuffer());
          const mime = U.detectImageMime(bytes);
          if (!mime) throw new U.AppError("bad_type", "Use PNG, JPG ou WEBP.");
          const name = `${crypto.randomUUID()}.${U.EXT[mime]}`;
          const { error } = await U.supabaseAdmin.storage
            .from("vupe-media")
            .upload(`public/${name}`, bytes, { contentType: mime });
          if (error) throw new U.AppError("storage", "Falha ao salvar a imagem.", 502);
          await U.audit({ actor_id: userId, action: "media_uploaded", target_id: name });
          return Response.json({ url: `/api/public/media/${name}` });
        } catch (e) {
          return U.jsonError(e);
        }
      },
    },
  },
});
