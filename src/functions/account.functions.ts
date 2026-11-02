import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getMe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const U = await import("@/lib/server-utils.server");
    const db = U.supabaseAdmin;
    const uid = context.userId;
    await db.rpc("sweep_expired_credits", { _uid: uid });
    const [profile, admin, access, bal, trial, settings] = await Promise.all([
      db.from("profiles").select("*").eq("id", uid).single(),
      U.isAdmin(uid),
      U.getAccess(uid),
      db.rpc("credit_balance", { _uid: uid }),
      db.from("trials").select("*").eq("user_id", uid).maybeSingle(),
      U.getSettings(),
    ]);
    const { data: sub } = await db
      .from("subscriptions")
      .select("*")
      .eq("user_id", uid)
      .eq("mode", settings.stripe_mode)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const planId = access.plan_id ?? sub?.plan_id ?? profile.data?.selected_plan_id ?? null;
    const { data: plan } = planId
      ? await db
          .from("plans")
          .select(
            "id, name, credits_per_cycle, max_batch, allowed_features, allowed_models, price_cents, billing_interval, billing_type, status",
          )
          .eq("id", planId)
          .maybeSingle()
      : { data: null };
    const balance = (bal.data as { available: number; reserved: number }[] | null)?.[0] ?? {
      available: 0,
      reserved: 0,
    };
    return {
      serverNow: new Date().toISOString(),
      profile: profile.data,
      isAdmin: admin,
      access,
      balance,
      trial: trial.data
        ? {
            started_at: trial.data.started_at,
            ends_at: trial.data.ends_at,
            credits_granted: trial.data.credits_granted,
            granted: !!(trial.data.snapshot as any)?.granted,
          }
        : null,
      subscription: sub
        ? {
            id: sub.id,
            stripe_status: sub.stripe_status,
            access_state: sub.access_state,
            plan_id: sub.plan_id,
            current_period_end: sub.current_period_end,
            paid_through: sub.paid_through,
            cancel_at_period_end: sub.cancel_at_period_end,
          }
        : null,
      plan,
      stripeMode: settings.stripe_mode,
    };
  });

export const updateProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ name: z.string().trim().min(1).max(120) }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .update({ name: data.name })
      .eq("id", context.userId);
    if (error) throw new Error("Não foi possível salvar o perfil.");
    return { ok: true };
  });

export const getPublicBranding = createServerFn({ method: "GET" }).handler(async () => {
  const U = await import("@/lib/server-utils.server");
  const { data } = await U.supabaseAdmin
    .from("app_branding")
    .select("display_name, logo_url, favicon_url")
    .eq("id", true)
    .single();
  return data ?? { display_name: "Vupe Studio", logo_url: null, favicon_url: null };
});

export const listPublicPlans = createServerFn({ method: "GET" }).handler(async () => {
  const U = await import("@/lib/server-utils.server");
  const settings = await U.getSettings();
  const { data } = await U.supabaseAdmin
    .from("plans")
    .select(
      "id, name, description, price_cents, currency, billing_interval, billing_type, credits_per_cycle, allowed_features, max_batch, highlight, sort_order, stripe_price_id_test, stripe_price_id_live",
    )
    .eq("status", "active")
    .is("archived_at", null)
    .order("sort_order");
  return (data ?? []).map(({ stripe_price_id_test, stripe_price_id_live, ...p }) => ({
    ...p,
    checkout_available: !!(settings.stripe_mode === "test"
      ? stripe_price_id_test
      : stripe_price_id_live),
  }));
});

export const getSignupTrialInfo = createServerFn({ method: "GET" }).handler(async () => {
  const U = await import("@/lib/server-utils.server");
  const s = await U.getSettings();
  return {
    enabled: s.trial_enabled && s.trial_duration_minutes > 0,
    minutes: s.trial_duration_minutes,
    credits: s.trial_credits,
  };
});
