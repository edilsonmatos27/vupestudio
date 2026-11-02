import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function origin() {
  const req = getRequest();
  const o = req?.headers.get("origin");
  if (o) return o;
  const u = new URL(req!.url);
  return `${u.protocol}//${u.host}`;
}

async function ensureCustomer(
  U: any,
  S: any,
  mode: "test" | "live",
  secretKey: string,
  userId: string,
) {
  const { data: existing } = await U.supabaseAdmin
    .from("stripe_customers")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .eq("mode", mode)
    .maybeSingle();
  if (existing) return existing.stripe_customer_id as string;
  const { data: profile } = await U.supabaseAdmin
    .from("profiles")
    .select("email, name")
    .eq("id", userId)
    .single();
  const c = await S.stripeRequest(secretKey, "POST", "/v1/customers", {
    email: profile.email,
    name: profile.name || undefined,
    metadata: { user_id: userId },
  });
  await U.supabaseAdmin
    .from("stripe_customers")
    .insert({ user_id: userId, mode, stripe_customer_id: c.id });
  return c.id as string;
}

async function activeSub(U: any, userId: string, mode: string) {
  const { data } = await U.supabaseAdmin
    .from("subscriptions")
    .select("*")
    .eq("user_id", userId)
    .eq("mode", mode)
    .in("stripe_status", ["active", "trialing", "past_due", "incomplete", "unpaid"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

export const createCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ planId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const U = await import("@/lib/server-utils.server");
    const S = await import("@/lib/stripe.server");
    const db = U.supabaseAdmin;
    const { data: profile } = await db
      .from("profiles")
      .select("status")
      .eq("id", context.userId)
      .single();
    if (profile?.status === "blocked")
      throw new Error("Sua conta está bloqueada. Fale com o administrador.");
    const mode = await S.currentMode();
    const { data: plan } = await db.from("plans").select("*").eq("id", data.planId).single();
    if (!plan || plan.status !== "active")
      throw new Error("Este plano não está disponível para novas adesões.");
    const priceId = mode === "test" ? plan.stripe_price_id_test : plan.stripe_price_id_live;
    if (!priceId) throw new Error("Este plano ainda não tem preço configurado na Stripe.");
    const existing = await activeSub(U, context.userId, mode);
    if (existing) throw new Error("Você já possui uma assinatura. Use a opção de mudar de plano.");
    const access = await U.getAccess(context.userId);
    if (access.code === "paid" && access.billing_type === "one_time")
      throw new Error(
        "Você já possui um período avulso ativo. Aguarde o término para comprar novamente.",
      );
    const { secretKey } = await S.getStripeSecrets(mode);
    const customer = await ensureCustomer(U, S, mode, secretKey, context.userId);
    let purchaseId: string | undefined;
    if (plan.billing_type === "one_time") {
      const { data: purchase, error } = await db
        .from("prepaid_purchases")
        .insert({
          user_id: context.userId,
          plan_id: plan.id,
          mode,
          stripe_customer_id: customer,
          stripe_price_id: priceId,
          amount_cents: plan.price_cents!,
          currency: plan.currency,
          billing_interval: plan.billing_interval,
          credits: plan.credits_per_cycle,
          features: plan.allowed_features,
          models: plan.allowed_models,
          max_batch: plan.max_batch,
        })
        .select("id")
        .single();
      if (error || !purchase) throw new Error("Não foi possível iniciar a compra avulsa.");
      purchaseId = purchase.id;
    }
    const metadata = {
      user_id: context.userId,
      plan_id: plan.id,
      ...(purchaseId ? { purchase_id: purchaseId } : {}),
    };
    const base = origin();
    const session = await S.stripeRequest(secretKey, "POST", "/v1/checkout/sessions", {
      mode: purchaseId ? "payment" : "subscription",
      customer,
      client_reference_id: context.userId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${base}/planos?checkout=retorno&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/planos?checkout=cancelado`,
      metadata,
      subscription_data: purchaseId ? undefined : { metadata },
      payment_intent_data: purchaseId ? { metadata } : undefined,
      invoice_creation: purchaseId ? { enabled: true, invoice_data: { metadata } } : undefined,
      locale: "pt-BR",
    });
    if (purchaseId) {
      const { error } = await db
        .from("prepaid_purchases")
        .update({ stripe_session_id: session.id })
        .eq("id", purchaseId);
      if (error)
        throw new Error("Não foi possível vincular a sessão de pagamento. Tente novamente.");
    }
    await U.audit({
      actor_id: context.userId,
      action: "checkout_created",
      target_type: "plan",
      target_id: plan.id,
      details: { mode, session: session.id },
    });
    return { url: session.url as string };
  });

/** Called after returning from checkout: re-reads authoritative state from Stripe (no trust in the URL). */
export const syncCheckoutSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ sessionId: z.string().min(5).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    const U = await import("@/lib/server-utils.server");
    const S = await import("@/lib/stripe.server");
    const mode = await S.currentMode();
    const { secretKey } = await S.getStripeSecrets(mode);
    const session = await S.stripeRequest(
      secretKey,
      "GET",
      `/v1/checkout/sessions/${encodeURIComponent(data.sessionId)}`,
    );
    if (session.metadata?.user_id !== context.userId)
      throw new Error("Sessão de pagamento não pertence a esta conta.");
    if (session.subscription) {
      const r = await S.syncSubscription(mode, secretKey, session.subscription);
      const latest = r?.stripe?.latest_invoice;
      if (latest)
        await S.syncInvoice(mode, secretKey, typeof latest === "string" ? latest : latest.id);
    }
    if (session.mode === "payment") await S.syncOneTimeCheckout(mode, secretKey, session.id);
    const access = await U.getAccess(context.userId);
    return {
      sessionStatus: session.status as string,
      paymentStatus: session.payment_status as string,
      access,
    };
  });

export const createPortal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const U = await import("@/lib/server-utils.server");
    const S = await import("@/lib/stripe.server");
    const mode = await S.currentMode();
    const { data: c } = await U.supabaseAdmin
      .from("stripe_customers")
      .select("stripe_customer_id")
      .eq("user_id", context.userId)
      .eq("mode", mode)
      .maybeSingle();
    if (!c) throw new Error("Nenhuma assinatura encontrada para gerenciar.");
    const { secretKey } = await S.getStripeSecrets(mode);
    const portal = await S.stripeRequest(secretKey, "POST", "/v1/billing_portal/sessions", {
      customer: c.stripe_customer_id,
      return_url: `${origin()}/planos`,
    });
    return { url: portal.url as string };
  });

export const myBilling = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const U = await import("@/lib/server-utils.server");
    const mode = (await U.getSettings()).stripe_mode;
    const { data: invoices } = await U.supabaseAdmin
      .from("invoices")
      .select(
        "stripe_invoice_id, amount_paid, amount_due, currency, status, billing_reason, paid_at, period_end, created_at, hosted_invoice_url",
      )
      .eq("user_id", context.userId)
      .eq("mode", mode)
      .order("created_at", { ascending: false })
      .limit(24);
    return { invoices: invoices ?? [] };
  });

async function planChangeContext(context: { userId: string }, planId: string) {
  const U = await import("@/lib/server-utils.server");
  const S = await import("@/lib/stripe.server");
  const mode = await S.currentMode();
  const sub = await activeSub(U, context.userId, mode);
  if (!sub) throw new Error("Você ainda não possui assinatura paga.");
  const { data: target } = await U.supabaseAdmin
    .from("plans")
    .select("*")
    .eq("id", planId)
    .single();
  if (!target || target.status !== "active") throw new Error("Plano indisponível.");
  if (target.billing_type === "one_time")
    throw new Error(
      "Um plano avulso não pode substituir uma assinatura. Cancele a renovação e aguarde o período atual terminar.",
    );
  const priceId = mode === "test" ? target.stripe_price_id_test : target.stripe_price_id_live;
  if (!priceId) throw new Error("O plano de destino não tem preço configurado.");
  const { data: current } = await U.supabaseAdmin
    .from("plans")
    .select("*")
    .eq("id", sub.plan_id)
    .maybeSingle();
  const { secretKey } = await S.getStripeSecrets(mode);
  const stripeSub = await S.stripeRequest(
    secretKey,
    "GET",
    `/v1/subscriptions/${sub.stripe_subscription_id}`,
  );
  const item = stripeSub.items.data[0];
  const isUpgrade = (target.price_cents ?? 0) > (current?.price_cents ?? 0);
  return { U, S, mode, sub, target, priceId, current, secretKey, stripeSub, item, isUpgrade };
}

export const previewPlanChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ planId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const c = await planChangeContext(context, data.planId);
    if (c.item.price.id === c.priceId) throw new Error("Você já está neste plano.");
    if (!c.isUpgrade) {
      return {
        kind: "downgrade" as const,
        amountDue: 0,
        currency: "brl",
        effectiveAt: c.sub.current_period_end,
        targetName: c.target.name,
      };
    }
    const preview = await c.S.stripeRequest(c.secretKey, "GET", "/v1/invoices/upcoming", {
      customer: c.stripeSub.customer,
      subscription: c.stripeSub.id,
      subscription_items: [{ id: c.item.id, price: c.priceId }],
      subscription_proration_behavior: "always_invoice",
    });
    return {
      kind: "upgrade" as const,
      amountDue: preview.amount_due as number,
      currency: preview.currency as string,
      effectiveAt: new Date().toISOString(),
      targetName: c.target.name,
    };
  });

export const changePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ planId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const c = await planChangeContext(context, data.planId);
    if (c.item.price.id === c.priceId) throw new Error("Você já está neste plano.");
    if (c.isUpgrade) {
      // Upgrade: prorated invoice charged now; the change only applies if the payment succeeds.
      await c.S.stripeRequest(c.secretKey, "POST", `/v1/subscriptions/${c.stripeSub.id}`, {
        items: [{ id: c.item.id, price: c.priceId }],
        proration_behavior: "always_invoice",
        payment_behavior: "pending_if_incomplete",
        metadata: { user_id: context.userId, plan_id: c.target.id },
      });
    } else {
      // Downgrade: new price applies from the next cycle; entitlements follow the next paid invoice.
      await c.S.stripeRequest(c.secretKey, "POST", `/v1/subscriptions/${c.stripeSub.id}`, {
        items: [{ id: c.item.id, price: c.priceId }],
        proration_behavior: "none",
        metadata: { user_id: context.userId, plan_id: c.target.id },
      });
    }
    const r = await c.S.syncSubscription(c.mode, c.secretKey, c.stripeSub.id);
    const latest = r?.stripe?.latest_invoice;
    if (latest)
      await c.S.syncInvoice(c.mode, c.secretKey, typeof latest === "string" ? latest : latest.id);
    await c.U.audit({
      actor_id: context.userId,
      action: c.isUpgrade ? "plan_upgrade" : "plan_downgrade",
      target_type: "plan",
      target_id: c.target.id,
    });
    return { kind: c.isUpgrade ? "upgrade" : "downgrade" };
  });
