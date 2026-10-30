// Server-only Stripe integration using the REST API with the admin's own credentials.
// Credentials are stored encrypted (AES-GCM) in the database; they never reach the browser.
import { decryptSecret, hmacSha256Hex, safeEqual } from "./crypto.server";
import { AppError, audit, supabaseAdmin } from "./server-utils.server";

export type StripeMode = "test" | "live";
const API_VERSION = "2024-06-20";

type Params = Record<string, unknown>;

function encode(params: Params, prefix = "", out: string[] = []) {
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (typeof item === "object" && item !== null) encode(item as Params, `${key}[${i}]`, out);
        else out.push(`${encodeURIComponent(`${key}[]`)}=${encodeURIComponent(String(item))}`);
      });
    } else if (typeof v === "object") encode(v as Params, key, out);
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  }
  return out;
}

export class StripeError extends AppError {}

export async function stripeRequest<T = any>(secretKey: string, method: "GET" | "POST" | "DELETE", path: string, params?: Params): Promise<T> {
  let url = `https://api.stripe.com${path}`;
  const init: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Stripe-Version": API_VERSION,
      ...(method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
  };
  const body = params ? encode(params).join("&") : "";
  if (method === "GET" && body) url += (url.includes("?") ? "&" : "?") + body;
  if (method === "POST") init.body = body;
  const res = await fetch(url, init);
  const json = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) {
    const msg = json?.error?.message ? String(json.error.message) : `Stripe respondeu ${res.status}`;
    // Never echo keys; Stripe error messages do not contain the secret but may contain a masked key.
    throw new StripeError("stripe", msg.replace(/sk_(test|live)_[A-Za-z0-9*]+/g, "sk_***"), res.status >= 500 ? 502 : 400);
  }
  return json as T;
}

export async function currentMode(): Promise<StripeMode> {
  const { data } = await supabaseAdmin.from("app_settings").select("stripe_mode").eq("id", true).single();
  return (data?.stripe_mode as StripeMode) ?? "test";
}

export async function getStripeSecrets(mode: StripeMode) {
  const { data } = await supabaseAdmin.from("stripe_credentials").select("*").eq("mode", mode).maybeSingle();
  if (!data?.secret_key_enc) throw new AppError("stripe_not_configured", "A cobrança ainda não foi configurada pelo administrador.", 400);
  return {
    secretKey: await decryptSecret(data.secret_key_enc),
    webhookSecret: data.webhook_secret_enc ? await decryptSecret(data.webhook_secret_enc) : null,
    publishableKey: data.publishable_key,
  };
}

export async function verifyWebhookSignature(payload: string, header: string | null, secret: string) {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const i = p.indexOf("=");
      return [p.slice(0, i), p.slice(i + 1)];
    }),
  ) as Record<string, string>;
  const t = parts["t"];
  const sigs = header.split(",").filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
  if (!t || !sigs.length) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const expected = await hmacSha256Hex(secret, `${t}.${payload}`);
  return sigs.some((s) => safeEqual(s, expected));
}

const ts = (s?: number | null) => (s ? new Date(s * 1000).toISOString() : null);

async function planForPrice(priceId: string | null | undefined, mode: StripeMode) {
  if (!priceId) return null;
  const { data: pp } = await supabaseAdmin.from("plan_prices").select("plan_id").eq("stripe_price_id", priceId).maybeSingle();
  const planId = pp?.plan_id;
  if (planId) {
    const { data } = await supabaseAdmin.from("plans").select("*").eq("id", planId).single();
    return data;
  }
  const col = mode === "test" ? "stripe_price_id_test" : "stripe_price_id_live";
  const { data } = await supabaseAdmin.from("plans").select("*").eq(col, priceId).maybeSingle();
  return data;
}

async function userForCustomer(customerId: string, metaUser?: string | null) {
  if (metaUser) return metaUser;
  const { data } = await supabaseAdmin.from("stripe_customers").select("user_id").eq("stripe_customer_id", customerId).maybeSingle();
  return data?.user_id ?? null;
}

/** Pulls the authoritative subscription state from Stripe and stores it. Never grants a paid period by itself. */
export async function syncSubscription(mode: StripeMode, secretKey: string, subscriptionId: string) {
  const sub = await stripeRequest(secretKey, "GET", `/v1/subscriptions/${subscriptionId}`);
  const userId = await userForCustomer(sub.customer, sub.metadata?.user_id);
  if (!userId) return null;
  const { data: existing } = await supabaseAdmin.from("subscriptions").select("*").eq("stripe_subscription_id", sub.id).maybeSingle();
  const priceId = sub.items?.data?.[0]?.price?.id ?? null;
  const endedAt = ts(sub.ended_at);
  let paidThrough = existing?.paid_through ?? null;
  if (endedAt && paidThrough && new Date(paidThrough) > new Date(endedAt)) paidThrough = endedAt;
  const paidActive = paidThrough && new Date(paidThrough) > new Date();
  let access: string;
  if (existing?.access_state === "blocked_billing") access = "blocked_billing";
  else if (["canceled", "incomplete_expired"].includes(sub.status)) access = "ended";
  else if (["past_due", "unpaid"].includes(sub.status)) access = "payment_failed";
  else if (paidActive) access = sub.cancel_at_period_end ? "cancel_scheduled" : "active_paid";
  else access = "awaiting_payment";

  const row = {
    user_id: userId,
    mode,
    stripe_customer_id: sub.customer,
    stripe_subscription_id: sub.id,
    stripe_status: sub.status,
    access_state: access,
    stripe_price_id: priceId,
    current_period_start: ts(sub.current_period_start),
    current_period_end: ts(sub.current_period_end),
    paid_through: paidThrough,
    cancel_at_period_end: !!sub.cancel_at_period_end,
    canceled_at: ts(sub.canceled_at),
    ended_at: endedAt,
    last_stripe_event_at: new Date().toISOString(),
    plan_id: existing?.plan_id ?? sub.metadata?.plan_id ?? null,
  };
  const { data, error } = await supabaseAdmin
    .from("subscriptions")
    .upsert(row, { onConflict: "stripe_subscription_id" })
    .select("*")
    .single();
  if (error) throw new AppError("db", error.message, 500);
  return { row: data, stripe: sub };
}

/** Confirms an invoice from Stripe; only a paid invoice extends the paid period and grants credits. */
export async function syncInvoice(mode: StripeMode, secretKey: string, invoiceId: string) {
  const inv = await stripeRequest(secretKey, "GET", `/v1/invoices/${invoiceId}`, { expand: ["charge"] });
  const subscriptionId: string | null = inv.subscription ?? null;
  const userId = await userForCustomer(inv.customer, inv.subscription_details?.metadata?.user_id);
  const lines: any[] = inv.lines?.data ?? [];
  const positive = lines.filter((l) => (l.amount ?? 0) > 0);
  const main = positive[positive.length - 1] ?? lines[0];
  const priceId = main?.price?.id ?? null;
  const plan = await planForPrice(priceId, mode);
  const periodEnd = Math.max(...(positive.length ? positive : lines).map((l) => l.period?.end ?? 0));
  const periodStart = Math.min(...(positive.length ? positive : lines).map((l) => l.period?.start ?? Infinity));
  const charge = typeof inv.charge === "object" ? inv.charge : null;

  await supabaseAdmin.from("invoices").upsert(
    {
      stripe_invoice_id: inv.id,
      user_id: userId,
      mode,
      stripe_subscription_id: subscriptionId,
      stripe_customer_id: inv.customer,
      plan_id: plan?.id ?? null,
      stripe_price_id: priceId,
      amount_due: inv.amount_due ?? 0,
      amount_paid: inv.amount_paid ?? 0,
      amount_refunded: charge?.amount_refunded ?? 0,
      currency: inv.currency ?? "brl",
      status: inv.status,
      billing_reason: inv.billing_reason ?? null,
      period_start: Number.isFinite(periodStart) ? ts(periodStart) : null,
      period_end: periodEnd ? ts(periodEnd) : null,
      paid_at: ts(inv.status_transitions?.paid_at),
      disputed: !!charge?.disputed,
      hosted_invoice_url: inv.hosted_invoice_url ?? null,
    },
    { onConflict: "stripe_invoice_id" },
  );

  if (!subscriptionId || !userId) return;
  let synced = await syncSubscription(mode, secretKey, subscriptionId);
  if (!synced) return;

  const refundedFully = charge && charge.refunded;
  if (inv.status === "paid" && !refundedFully && !charge?.disputed && periodEnd) {
    const sub = synced.row;
    const newPaid = new Date(periodEnd * 1000);
    const update: Record<string, unknown> = { stripe_price_id: priceId };
    if (!sub.paid_through || new Date(sub.paid_through) < newPaid) update["paid_through"] = newPaid.toISOString();
    if (plan) update["plan_id"] = plan.id;
    await supabaseAdmin.from("subscriptions").update(update as never).eq("id", sub.id);
    if (plan) {
      await supabaseAdmin.rpc("apply_invoice_credits", {
        _sub: sub.id,
        _invoice: inv.id,
        _billing_reason: inv.billing_reason ?? "",
        _plan_credits: plan.credits_per_cycle,
        _period_start: Number.isFinite(periodStart) ? ts(periodStart)! : new Date().toISOString(),
        _period_end: newPaid.toISOString(),
      });
    }
    synced = await syncSubscription(mode, secretKey, subscriptionId);
  }
}

/**
 * Explicit refund/dispute rule: a full refund or an opened dispute on a subscription invoice
 * revokes the remaining paid period (access_state = blocked_billing) and expires the unreserved
 * subscription credits. Partial refunds are recorded only. Every application is audited.
 */
export async function applyChargeReversal(mode: StripeMode, secretKey: string, chargeId: string, reason: string) {
  const charge = await stripeRequest(secretKey, "GET", `/v1/charges/${chargeId}`);
  if (!charge.invoice) return;
  await syncInvoice(mode, secretKey, charge.invoice);
  const full = charge.refunded || charge.disputed;
  if (!full) {
    await audit({ actor_id: null, action: "stripe_partial_refund", target_type: "invoice", target_id: charge.invoice, reason });
    return;
  }
  const { data: inv } = await supabaseAdmin.from("invoices").select("stripe_subscription_id, user_id").eq("stripe_invoice_id", charge.invoice).maybeSingle();
  if (!inv?.stripe_subscription_id || !inv.user_id) return;
  await supabaseAdmin
    .from("subscriptions")
    .update({ access_state: "blocked_billing", paid_through: new Date().toISOString() })
    .eq("stripe_subscription_id", inv.stripe_subscription_id);
  await supabaseAdmin.rpc("expire_bucket_sources", {
    _uid: inv.user_id,
    _sources: ["subscription", "upgrade"],
    _reason: `Reversão de pagamento (${reason})`,
  });
  await audit({ actor_id: null, action: "stripe_reversal_applied", target_type: "invoice", target_id: charge.invoice, reason });
}

export async function processStripeEvent(mode: StripeMode, secretKey: string, event: any) {
  const obj = event.data?.object ?? {};
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
    case "checkout.session.async_payment_failed": {
      if (obj.customer && obj.metadata?.user_id) {
        await supabaseAdmin
          .from("stripe_customers")
          .upsert({ user_id: obj.metadata.user_id, mode, stripe_customer_id: obj.customer }, { onConflict: "stripe_customer_id" });
      }
      if (obj.subscription) {
        const s = await syncSubscription(mode, secretKey, obj.subscription);
        const latest = s?.stripe?.latest_invoice;
        if (latest) await syncInvoice(mode, secretKey, typeof latest === "string" ? latest : latest.id);
      }
      break;
    }
    case "invoice.paid":
    case "invoice.payment_succeeded":
    case "invoice.payment_failed":
    case "invoice.payment_action_required":
    case "invoice.finalized":
    case "invoice.voided":
    case "invoice.marked_uncollectible":
      if (obj.id) await syncInvoice(mode, secretKey, obj.id);
      break;
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
    case "customer.subscription.paused":
    case "customer.subscription.resumed":
      if (obj.id) await syncSubscription(mode, secretKey, obj.id);
      break;
    case "charge.refunded":
      if (obj.id) await applyChargeReversal(mode, secretKey, obj.id, "estorno");
      break;
    case "charge.dispute.created":
      if (obj.charge) await applyChargeReversal(mode, secretKey, obj.charge, "disputa");
      break;
    default:
      break;
  }
}

export const REQUIRED_WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "invoice.paid",
  "invoice.payment_failed",
  "invoice.payment_action_required",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "charge.refunded",
  "charge.dispute.created",
];
