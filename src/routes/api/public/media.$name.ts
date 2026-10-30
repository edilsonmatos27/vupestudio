import { createFileRoute } from "@tanstack/react-router";

// Serves only non-sensitive public media (branding and agent illustrations) from the private media bucket.
export const Route = createFileRoute("/api/public/media/$name")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const name = params.name;
        if (!/^[0-9a-f-]{36}\.(png|jpg|webp)$/.test(name)) return new Response("Not found", { status: 404 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.storage.from("vupe-media").download(`public/${name}`);
        if (error || !data) return new Response("Not found", { status: 404 });
        const type = name.endsWith(".png") ? "image/png" : name.endsWith(".jpg") ? "image/jpeg" : "image/webp";
        return new Response(data, {
          headers: { "Content-Type": type, "Cache-Control": "public, max-age=86400, immutable", "X-Content-Type-Options": "nosniff" },
        });
      },
    },
  },
});
