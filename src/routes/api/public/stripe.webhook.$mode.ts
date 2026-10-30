import { createFileRoute } from "@tanstack/react-router";

// Stripe webhook. Signature is verified over the raw body with the mode's signing secret
// before anything is processed. Events are deduplicated by id; objects are re-fetched from Stripe.
export const Route = createFileRoute("/api/public/stripe/webhook/$mode")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const mode = params.mode;
        if (mode !== "test" && mode !== "live") return new Response("Not found", { status: 404 });
        const raw = await request.text();
        const S = await import("@/lib/stripe.server");
        const U = await import("@/lib/server-utils.server");
        let secrets: Awaited<ReturnType<typeof S.getStripeSecrets>>;
        try {
          secrets = await S.getStripeSecrets(mode);
        } catch {
          return new Response("Not configured", { status: 503 });
        }
        if (!secrets.webhookSecret) return new Response("Not configured", { status: 503 });
        const valid = await S.verifyWebhookSignature(raw, request.headers.get("stripe-signature"), secrets.webhookSecret);
        if (!valid) return new Response("Invalid signature", { status: 400 });

        let event: any;
        try {
          event = JSON.parse(raw);
        } catch {
          return new Response("Invalid payload", { status: 400 });
        }
        if (!!event.livemode !== (mode === "live")) return new Response("Mode mismatch", { status: 400 });

        const db = U.supabaseAdmin;
        await db.from("stripe_credentials").update({ webhook_validated_at: new Date().toISOString() }).eq("mode", mode);
        const { data: existing } = await db.from("stripe_events").select("status").eq("id", event.id).maybeSingle();
        if (existing?.status === "processed") return Response.json({ received: true, duplicate: true });
        if (!existing) await db.from("stripe_events").insert({ id: event.id, mode, type: event.type });

        try {
          await S.processStripeEvent(mode, secrets.secretKey, event);
          await db.from("stripe_events").update({ status: "processed", processed_at: new Date().toISOString(), error: null }).eq("id", event.id);
          return Response.json({ received: true });
        } catch (e) {
          const msg = (e as Error).message?.slice(0, 500) ?? "error";
          console.error("stripe webhook processing failed", event.type);
          await db.from("stripe_events").update({ status: "error", error: msg }).eq("id", event.id);
          return new Response("Processing error", { status: 500 });
        }
      },
    },
  },
});
