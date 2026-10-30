import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { FEATURES, MODEL_CATALOG } from "@/lib/models";

async function adminCtx(context: { supabase: any; userId: string }) {
  const U = await import("@/lib/server-utils.server");
  await U.assertAdmin(context.supabase, context.userId);
  return U;
}

// ---------------- Settings: trial, AI, branding ----------------
export const adminGetSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const U = await adminCtx(context);
    const s = await U.getSettings();
    const { data: branding } = await U.supabaseAdmin.from("app_branding").select("*").eq("id", true).single();
    return { settings: s, branding, catalog: MODEL_CATALOG, features: FEATURES };
  });

const trialSchema = z.object({
  trial_enabled: z.boolean(),
  trial_duration_minutes: z.number().int().min(0).max(60 * 24 * 365),
  trial_credits: z.number().int().min(0).max(100000),
  trial_features: z.array(z.string()).max(10),
  trial_models: z.array(z.string()).max(20),
});

export const adminSaveTrial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => trialSchema.parse(d))
  .handler(async ({ data, context }) => {
    const U = await adminCtx(context);
    const { error } = await U.supabaseAdmin.from("app_settings").update({ ...data, updated_at: new Date().toISOString() }).eq("id", true);
    if (error) throw new Error("Falha ao salvar as condições de teste.");
    await U.audit({ actor_id: context.userId, action: "settings_trial_updated", details: data });
    return { ok: true };
  });

const aiSchema = z.object({
  ai_models: z.record(z.object({ enabled: z.boolean() })),
  ai_defaults: z.record(z.string()),
});

export const adminSaveAi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => aiSchema.parse(d))
  .handler(async ({ data, context }) => {
    const U = await adminCtx(context);
    for (const id of Object.keys(data.ai_models)) if (!MODEL_CATALOG.some((m) => m.id === id)) throw new Error(`Modelo desconhecido: ${id}`);
    for (const [task, id] of Object.entries(data.ai_defaults)) {
      const m = MODEL_CATALOG.find((x) => x.id === id);
      if (!m || !data.ai_models[id]?.enabled) throw new Error(`O padrão de "${task}" precisa ser um modelo ativo.`);
    }
    const { error } = await U.supabaseAdmin.from("app_settings").update({ ai_models: data.ai_models, ai_defaults: data.ai_defaults, updated_at: new Date().toISOString() }).eq("id", true);
    if (error) throw new Error("Falha ao salvar as configurações de IA.");
    await U.audit({ actor_id: context.userId, action: "settings_ai_updated", details: data });
    return { ok: true };
  });

export const adminCheckCatalog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await adminCtx(context);
    const G = await import("@/lib/image-gateway.server");
    try {
      const ids = await G.listGatewayImageModels();
      return { ok: true, available: ids, checkedAt: new Date().toISOString() };
    } catch (e) {
      return { ok: false, available: [] as string[], error: (e as Error).message, checkedAt: new Date().toISOString() };
    }
  });

export const adminSaveBranding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      display_name: z.string().trim().min(1).max(60),
      logo_url: z.string().max(500).nullable(),
      favicon_url: z.string().max(500).nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const U = await adminCtx(context);
    for (const u of [data.logo_url, data.favicon_url]) if (u && !u.startsWith("/api/public/media/")) throw new Error("Imagem inválida.");
    const { error } = await U.supabaseAdmin.from("app_branding").update({ ...data, updated_at: new Date().toISOString() }).eq("id", true);
    if (error) throw new Error("Falha ao salvar a identidade visual.");
    await U.audit({ actor_id: context.userId, action: "branding_updated", details: data });
    return { ok: true };
  });

// ---------------- Stripe credentials ----------------
export const adminGetStripe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const U = await adminCtx(context);
    const s = await U.getSettings();
    const { data } = await U.supabaseAdmin.from("stripe_credentials").select("mode, publishable_key, secret_key_hint, webhook_secret_hint, api_status, api_tested_at, api_error, webhook_validated_at, updated_at");
    const byMode = Object.fromEntries((data ?? []).map((r) => [r.mode, { ...r, has_secret: !!r.secret_key_hint, has_webhook: !!r.webhook_secret_hint }]));
    return { mode: s.stripe_mode, credentials: byMode as Record<string, any> };
  });

export const adminSaveStripe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      mode: z.enum(["test", "live"]),
      publishable_key: z.string().trim().max(300).optional(),
      secret_key: z.string().trim().max(300).optional(),
      webhook_secret: z.string().trim().max(300).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const U = await adminCtx(context);
    const C = await import("@/lib/crypto.server");
    const pfx = data.mode === "test" ? "test" : "live";
    if (data.publishable_key && !data.publishable_key.startsWith(`pk_${pfx}_`)) throw new Error(`A chave publicável deve começar com pk_${pfx}_`);
    if (data.secret_key && !(data.secret_key.startsWith(`sk_${pfx}_`) || data.secret_key.startsWith(`rk_${pfx}_`))) throw new Error(`A chave secreta deve começar com sk_${pfx}_ ou rk_${pfx}_`);
    if (data.webhook_secret && !data.webhook_secret.startsWith("whsec_")) throw new Error("O segredo do webhook deve começar com whsec_");
    const patch: Record<string, unknown> = { mode: data.mode, updated_by: context.userId, updated_at: new Date().toISOString() };
    const changed: string[] = [];
    if (data.publishable_key) { patch["publishable_key"] = data.publishable_key; changed.push("publishable_key"); }
    if (data.secret_key) {
      patch["secret_key_enc"] = await C.encryptSecret(data.secret_key);
      patch["secret_key_hint"] = C.maskHint(data.secret_key);
      patch["api_status"] = "not_tested";
      patch["api_tested_at"] = null;
      changed.push("secret_key");
    }
    if (data.webhook_secret) {
      patch["webhook_secret_enc"] = await C.encryptSecret(data.webhook_secret);
      patch["webhook_secret_hint"] = C.maskHint(data.webhook_secret);
      patch["webhook_validated_at"] = null;
      changed.push("webhook_secret");
    }
    if (!changed.length) throw new Error("Nenhum campo preenchido. Campos vazios mantêm os valores atuais.");
    const { error } = await U.supabaseAdmin.from("stripe_credentials").upsert(patch as never, { onConflict: "mode" });
    if (error) throw new Error("Falha ao salvar as credenciais.");
    await U.audit({ actor_id: context.userId, action: "stripe_credentials_saved", target_type: "stripe", target_id: data.mode, details: { fields: changed } });
    return { ok: true };
  });

export const adminRemoveStripeField = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ mode: z.enum(["test", "live"]), field: z.enum(["secret_key", "webhook_secret", "publishable_key"]), reason: z.string().trim().min(3).max(300) }).parse(d))
  .handler(async ({ data, context }) => {
    const U = await adminCtx(context);
    const patch: Record<string, unknown> =
      data.field === "secret_key"
        ? { secret_key_enc: null, secret_key_hint: null, api_status: "not_tested", api_tested_at: null }
        : data.field === "webhook_secret"
          ? { webhook_secret_enc: null, webhook_secret_hint: null, webhook_validated_at: null }
          : { publishable_key: null };
    const { error } = await U.supabaseAdmin.from("stripe_credentials").update(patch as never).eq("mode", data.mode);
    if (error) throw new Error("Falha ao remover.");
    await U.audit({ actor_id: context.userId, action: "stripe_credential_removed", target_type: "stripe", target_id: data.mode, reason: data.reason, details: { field: data.field } });
    return { ok: true };
  });

export const adminTestStripe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ mode: z.enum(["test", "live"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const U = await adminCtx(context);
    const S = await import("@/lib/stripe.server");
    const now = new Date().toISOString();
    try {
      const { secretKey } = await S.getStripeSecrets(data.mode);
      const acct = await S.stripeRequest(secretKey, "GET", "/v1/balance");
      const livemode = !!acct.livemode;
      if (livemode !== (data.mode === "live")) throw new Error("A chave não corresponde ao ambiente selecionado.");
      await U.supabaseAdmin.from("stripe_credentials").update({ api_status: "ok", api_tested_at: now, api_error: null }).eq("mode", data.mode);
      await U.audit({ actor_id: context.userId, action: "stripe_api_test", target_id: data.mode });
      return { ok: true, testedAt: now };
    } catch (e) {
      const msg = (e as Error).message;
      await U.supabaseAdmin.from("stripe_credentials").update({ api_status: "error", api_tested_at: now, api_error: msg }).eq("mode", data.mode);
      await U.audit({ actor_id: context.userId, action: "stripe_api_test", target_id: data.mode, result: "failure", details: { error: msg } });
      return { ok: false, error: msg, testedAt: now };
    }
  });

export const adminSetStripeMode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ mode: z.enum(["test", "live"]), reason: z.string().trim().min(3).max(300) }).parse(d))
  .handler(async ({ data, context }) => {
    const U = await adminCtx(context);
    await U.supabaseAdmin.from("app_settings").update({ stripe_mode: data.mode }).eq("id", true);
    await U.audit({ actor_id: context.userId, action: "stripe_mode_changed", target_id: data.mode, reason: data.reason });
    return { ok: true };
  });

// ---------------- Reconciliation ----------------
export const adminReconcile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const U = await adminCtx(context);
    const S = await import("@/lib/stripe.server");
    const mode = await S.currentMode();
    await U.supabaseAdmin.rpc("reconcile_stale_operations");
    const purged = await U.purgeDeletedAssets();
    let synced = 0;
    const errors: string[] = [];
    try {
      const { secretKey } = await S.getStripeSecrets(mode);
      const { data: subs } = await U.supabaseAdmin.from("subscriptions").select("stripe_subscription_id").eq("mode", mode).not("access_state", "eq", "ended").limit(200);
      for (const s of subs ?? []) {
        try {
          const r = await S.syncSubscription(mode, secretKey, s.stripe_subscription_id);
          const latest = r?.stripe?.latest_invoice;
          if (latest) await S.syncInvoice(mode, secretKey, typeof latest === "string" ? latest : latest.id);
          synced++;
        } catch (e) {
          errors.push((e as Error).message);
        }
      }
    } catch (e) {
      errors.push((e as Error).message);
    }
    await U.audit({ actor_id: context.userId, action: "reconcile_run", details: { synced, purged, errors: errors.length } });
    return { synced, purged, errors };
  });

// ---------------- Overview ----------------
export const adminOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const U = await adminCtx(context);
    const db = U.supabaseAdmin;
    const mode = (await U.getSettings()).stripe_mode;
    const now = new Date().toISOString();
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const [subsCount, trialsActive, paid, invoicesPaid, failedOps, consumed, failedInvoices] = await Promise.all([
      db.from("user_roles").select("id", { count: "exact", head: true }).eq("role", "subscriber"),
      db.from("trials").select("user_id", { count: "exact", head: true }).gt("ends_at", now).filter("snapshot->>granted", "eq", "true"),
      db.from("subscriptions").select("id", { count: "exact", head: true }).eq("mode", mode).gt("paid_through", now).neq("access_state", "blocked_billing"),
      db.from("invoices").select("amount_paid, amount_refunded, currency").eq("mode", mode).eq("status", "paid").gte("paid_at", since),
      db.from("operation_items").select("id", { count: "exact", head: true }).in("status", ["failed", "uncertain"]).gte("created_at", since),
      db.from("credit_ledger").select("id", { count: "exact", head: true }).eq("kind", "consume").gte("created_at", since),
      db.from("invoices").select("id", { count: "exact", head: true }).eq("mode", mode).in("status", ["open", "uncollectible"]).gte("created_at", since),
    ]);
    const revenue: Record<string, number> = {};
    for (const i of invoicesPaid.data ?? []) revenue[i.currency] = (revenue[i.currency] ?? 0) + i.amount_paid - i.amount_refunded;
    return {
      mode,
      periodDays: 30,
      subscribers: subsCount.count ?? 0,
      activeTrials: trialsActive.count ?? 0,
      activePaid: paid.count ?? 0,
      paidInvoices: invoicesPaid.data?.length ?? 0,
      revenue,
      failedItems: failedOps.count ?? 0,
      consumedCredits: consumed.count ?? 0,
      openInvoices: failedInvoices.count ?? 0,
    };
  });

// ---------------- Subscribers ----------------
export const adminListSubscribers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ q: z.string().max(120).optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const U = await adminCtx(context);
    const db = U.supabaseAdmin;
    let q = db.from("profiles").select("id, name, email, status, block_reason, selected_plan_id, created_at").order("created_at", { ascending: false }).limit(200);
    if (data.q) q = q.or(`name.ilike.%${data.q.replace(/[%,()]/g, "")}%,email.ilike.%${data.q.replace(/[%,()]/g, "")}%`);
    const { data: profiles } = await q;
    const ids = (profiles ?? []).map((p) => p.id);
    const mode = (await U.getSettings()).stripe_mode;
    const [plans, trials, subs, roles] = await Promise.all([
      db.from("plans").select("id, name"),
      db.from("trials").select("user_id, ends_at, snapshot").in("user_id", ids),
      db.from("subscriptions").select("user_id, access_state, paid_through, plan_id").eq("mode", mode).in("user_id", ids),
      db.from("user_roles").select("user_id, role").in("user_id", ids),
    ]);
    const rows = await Promise.all(
      (profiles ?? []).map(async (p) => {
        const bal = await db.rpc("credit_balance", { _uid: p.id });
        const b = (bal.data as any[])?.[0] ?? { available: 0, reserved: 0 };
        const tr = trials.data?.find((t) => t.user_id === p.id);
        const sub = subs.data?.find((s) => s.user_id === p.id);
        return {
          ...p,
          plan: plans.data?.find((x) => x.id === (sub?.plan_id ?? p.selected_plan_id))?.name ?? "—",
          trial_ends_at: (tr?.snapshot as any)?.granted ? tr?.ends_at : null,
          access_state: sub?.access_state ?? null,
          paid_through: sub?.paid_through ?? null,
          is_admin: !!roles.data?.some((r) => r.user_id === p.id && r.role === "admin"),
          available: b.available,
          reserved: b.reserved,
        };
      }),
    );
    return rows;
  });

export const adminSubscriberDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const U = await adminCtx(context);
    const db = U.supabaseAdmin;
    const [profile, trial, subs, invoices, ledger, bal, access, audits] = await Promise.all([
      db.from("profiles").select("*").eq("id", data.id).single(),
      db.from("trials").select("*").eq("user_id", data.id).maybeSingle(),
      db.from("subscriptions").select("*").eq("user_id", data.id).order("created_at", { ascending: false }),
      db.from("invoices").select("*").eq("user_id", data.id).order("created_at", { ascending: false }).limit(50),
      db.from("credit_ledger").select("*").eq("user_id", data.id).order("created_at", { ascending: false }).limit(100),
      db.rpc("credit_balance", { _uid: data.id }),
      U.getAccess(data.id),
      db.from("audit_log").select("*").eq("target_id", data.id).order("created_at", { ascending: false }).limit(50),
    ]);
    return {
      profile: profile.data,
      trial: trial.data,
      subscriptions: subs.data ?? [],
      invoices: invoices.data ?? [],
      ledger: ledger.data ?? [],
      balance: (bal.data as any[])?.[0] ?? { available: 0, reserved: 0 },
      access,
      audits: audits.data ?? [],
    };
  });

export const adminSetBlocked = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), blocked: z.boolean(), reason: z.string().trim().min(3).max(300) }).parse(d))
  .handler(async ({ data, context }) => {
    const U = await adminCtx(context);
    if (data.id === context.userId) throw new Error("Você não pode bloquear a própria conta.");
    const { error } = await U.supabaseAdmin
      .from("profiles")
      .update({ status: data.blocked ? "blocked" : "active", block_reason: data.blocked ? data.reason : null })
      .eq("id", data.id);
    if (error) throw new Error("Falha ao atualizar a conta.");
    await U.audit({ actor_id: context.userId, action: data.blocked ? "account_blocked" : "account_unblocked", target_type: "user", target_id: data.id, reason: data.reason });
    return { ok: true };
  });

export const adminListSubscriptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const U = await adminCtx(context);
    const db = U.supabaseAdmin;
    const mode = (await U.getSettings()).stripe_mode;
    const { data } = await db.from("subscriptions").select("*").eq("mode", mode).order("created_at", { ascending: false }).limit(300);
    const ids = [...new Set((data ?? []).map((s) => s.user_id))];
    const [profiles, plans, trials] = await Promise.all([
      db.from("profiles").select("id, name, email, status").in("id", ids),
      db.from("plans").select("id, name"),
      db.from("trials").select("user_id, ends_at").in("user_id", ids),
    ]);
    return {
      mode,
      rows: (data ?? []).map((s) => ({
        ...s,
        profile: profiles.data?.find((p) => p.id === s.user_id) ?? null,
        plan_name: plans.data?.find((p) => p.id === s.plan_id)?.name ?? "—",
        trial_ends_at: trials.data?.find((t) => t.user_id === s.user_id)?.ends_at ?? null,
      })),
    };
  });

export const adminListPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const U = await adminCtx(context);
    const db = U.supabaseAdmin;
    const mode = (await U.getSettings()).stripe_mode;
    const { data } = await db.from("invoices").select("*").eq("mode", mode).order("created_at", { ascending: false }).limit(300);
    const ids = [...new Set((data ?? []).map((s) => s.user_id).filter(Boolean))] as string[];
    const [profiles, plans] = await Promise.all([db.from("profiles").select("id, name, email").in("id", ids), db.from("plans").select("id, name")]);
    return {
      mode,
      rows: (data ?? []).map((i) => ({
        ...i,
        profile: profiles.data?.find((p) => p.id === i.user_id) ?? null,
        plan_name: plans.data?.find((p) => p.id === i.plan_id)?.name ?? "—",
      })),
    };
  });

export const adminListAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const U = await adminCtx(context);
    const { data } = await U.supabaseAdmin.from("audit_log").select("*").order("created_at", { ascending: false }).limit(200);
    return data ?? [];
  });

export const adminRecentEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const U = await adminCtx(context);
    const { data } = await U.supabaseAdmin.from("stripe_events").select("*").order("received_at", { ascending: false }).limit(50);
    return data ?? [];
  });
