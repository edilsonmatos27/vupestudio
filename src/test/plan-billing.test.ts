import { describe, expect, it } from "vitest";
import { planPeriodLabel, validatePrepaidPayment } from "@/lib/plan-billing";

function fixture() {
  const purchase = {
    id: "order",
    user_id: "user",
    mode: "live",
    stripe_customer_id: "cus",
    stripe_price_id: "price",
    stripe_session_id: "cs",
    amount_cents: 1990,
    currency: "brl",
  };
  const session = {
    id: "cs",
    customer: "cus",
    livemode: true,
    mode: "payment",
    status: "complete",
    payment_status: "paid",
    invoice: "in",
    amount_total: 1990,
    currency: "brl",
    metadata: { purchase_id: "order", user_id: "user" },
    line_items: { data: [{ price: { id: "price" }, quantity: 1 }] },
    payment_intent: { latest_charge: { refunded: false, disputed: false, amount_refunded: 0 } },
  };
  const invoice = {
    id: "in",
    customer: "cus",
    livemode: true,
    status: "paid",
    subscription: null,
    amount_paid: 1990,
    currency: "brl",
    metadata: { purchase_id: "order", user_id: "user" },
  };
  return { purchase, session, invoice };
}

describe("prepaid payment verification", () => {
  it("accepts the matching paid session and paid invoice", () => {
    const { purchase, session, invoice } = fixture();
    expect(validatePrepaidPayment(purchase, session, invoice, "live")).toEqual({
      reversed: false,
      amountRefunded: 0,
    });
  });
  it.each([
    ["payment_status", "unpaid"],
    ["status", "open"],
    ["mode", "subscription"],
    ["livemode", false],
    ["customer", "another"],
    ["amount_total", 1],
    ["currency", "usd"],
    ["invoice", "another"],
    ["id", "another"],
  ])("rejects session mismatch %s", (field, value) => {
    const { purchase, session, invoice } = fixture();
    Object.assign(session, { [field]: value });
    expect(() => validatePrepaidPayment(purchase, session, invoice, "live")).toThrow();
  });
  it.each([
    ["status", "open"],
    ["amount_paid", 1],
    ["currency", "usd"],
    ["customer", "another"],
    ["livemode", false],
    ["subscription", "sub"],
  ])("rejects invoice mismatch %s", (field, value) => {
    const { purchase, session, invoice } = fixture();
    Object.assign(invoice, { [field]: value });
    expect(() => validatePrepaidPayment(purchase, session, invoice, "live")).toThrow();
  });
  it("rejects tampered metadata, product price, quantity and missing charge verification", () => {
    for (const tamper of [
      (f: ReturnType<typeof fixture>) => {
        f.session.metadata.user_id = "another";
      },
      (f: ReturnType<typeof fixture>) => {
        f.invoice.metadata.purchase_id = "another";
      },
      (f: ReturnType<typeof fixture>) => {
        f.session.line_items.data[0]!.price.id = "another";
      },
      (f: ReturnType<typeof fixture>) => {
        f.session.line_items.data[0]!.quantity = 2;
      },
      (f: ReturnType<typeof fixture>) => {
        Object.assign(f.session, { payment_intent: null });
      },
    ]) {
      const f = fixture();
      tamper(f);
      expect(() => validatePrepaidPayment(f.purchase, f.session, f.invoice, "live")).toThrow();
    }
  });
  it("detects full refunds and disputes on replays, while recording partial refunds", () => {
    const f = fixture();
    f.session.payment_intent.latest_charge.amount_refunded = 500;
    expect(validatePrepaidPayment(f.purchase, f.session, f.invoice, "live")).toEqual({
      reversed: false,
      amountRefunded: 500,
    });
    f.session.payment_intent.latest_charge.refunded = true;
    expect(validatePrepaidPayment(f.purchase, f.session, f.invoice, "live").reversed).toBe(true);
    f.session.payment_intent.latest_charge.refunded = false;
    f.session.payment_intent.latest_charge.disputed = true;
    expect(validatePrepaidPayment(f.purchase, f.session, f.invoice, "live").reversed).toBe(true);
  });
  it("does not mix test and live purchases", () => {
    const f = fixture();
    f.purchase.mode = "test";
    expect(() => validatePrepaidPayment(f.purchase, f.session, f.invoice, "live")).toThrow();
  });
});

describe("plan descriptions", () => {
  it("distinguishes validity from automatic renewal", () => {
    expect(planPeriodLabel({ billing_type: "one_time", billing_interval: "month" })).toBe(
      "por 1 mês",
    );
    expect(planPeriodLabel({ billing_type: "one_time", billing_interval: "year" })).toBe(
      "por 1 ano",
    );
    expect(planPeriodLabel({ billing_interval: "month" })).toBe("/mês");
    expect(planPeriodLabel({ billing_type: "recurring", billing_interval: "year" })).toBe("/ano");
  });
});
