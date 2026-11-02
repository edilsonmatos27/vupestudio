export type BillingType = "recurring" | "one_time";

export function planPeriodLabel(plan: { billing_type?: string; billing_interval: string }) {
  if (plan.billing_type === "one_time")
    return plan.billing_interval === "year" ? "por 1 ano" : "por 1 mês";
  return plan.billing_interval === "year" ? "/ano" : "/mês";
}

/** Shared by the server and payment verification tests; no client-supplied entitlements. */
export function validatePrepaidPayment(
  purchase: {
    id: string;
    user_id: string;
    mode: string;
    stripe_customer_id: string;
    stripe_price_id: string;
    stripe_session_id: string | null;
    amount_cents: number;
    currency: string;
  },
  session: any,
  invoice: any,
  mode: "test" | "live",
) {
  const invoiceId = typeof session.invoice === "string" ? session.invoice : session.invoice?.id;
  const items = session.line_items?.data ?? [];
  const charge = session.payment_intent?.latest_charge;
  if (
    purchase.mode !== mode ||
    !!session.livemode !== (mode === "live") ||
    !!invoice.livemode !== (mode === "live") ||
    session.mode !== "payment" ||
    session.status !== "complete" ||
    session.payment_status !== "paid" ||
    invoice.status !== "paid" ||
    invoice.subscription ||
    invoiceId !== invoice.id ||
    session.id !== purchase.stripe_session_id ||
    session.customer !== purchase.stripe_customer_id ||
    invoice.customer !== purchase.stripe_customer_id ||
    session.metadata?.purchase_id !== purchase.id ||
    invoice.metadata?.purchase_id !== purchase.id ||
    session.metadata?.user_id !== purchase.user_id ||
    invoice.metadata?.user_id !== purchase.user_id ||
    session.amount_total !== purchase.amount_cents ||
    invoice.amount_paid !== purchase.amount_cents ||
    session.currency !== purchase.currency ||
    invoice.currency !== purchase.currency ||
    items.length !== 1 ||
    items[0]?.price?.id !== purchase.stripe_price_id ||
    items[0]?.quantity !== 1 ||
    !charge ||
    typeof charge !== "object"
  )
    throw new Error("Pagamento avulso não confirmado ou divergente.");
  return {
    reversed: !!charge.refunded || !!charge.disputed,
    amountRefunded: charge.amount_refunded ?? 0,
  };
}
