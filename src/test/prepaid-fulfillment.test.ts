import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), audit: vi.fn() }));
vi.mock("@/lib/server-utils.server", () => ({
  supabaseAdmin: { from: db.from, rpc: db.rpc },
  audit: db.audit,
  AppError: class extends Error {
    constructor(_code: string, message: string) {
      super(message);
    }
  },
}));
import { processStripeEvent, syncInvoice } from "@/lib/stripe.server";
const purchase = {
  id: "purchase",
  user_id: "user",
  mode: "live",
  plan_id: "plan",
  status: "pending",
  stripe_customer_id: "cus",
  stripe_price_id: "price",
  stripe_session_id: "cs",
  amount_cents: 1990,
  currency: "brl",
};
let session: any;
let invoice: any;
beforeEach(() => {
  vi.clearAllMocks();
  session = {
    id: "cs",
    mode: "payment",
    status: "complete",
    payment_status: "paid",
    livemode: true,
    customer: "cus",
    invoice: "in",
    metadata: { user_id: "user", purchase_id: "purchase" },
    amount_total: 1990,
    currency: "brl",
    line_items: { data: [{ price: { id: "price" }, quantity: 1 }] },
    payment_intent: { latest_charge: { refunded: false, disputed: false, amount_refunded: 0 } },
  };
  invoice = {
    id: "in",
    livemode: true,
    customer: "cus",
    subscription: null,
    status: "paid",
    amount_due: 1990,
    amount_paid: 1990,
    currency: "brl",
    charge: null,
    metadata: { user_id: "user", purchase_id: "purchase" },
    lines: {
      data: [
        { amount: 1990, price: { id: "price" }, period: { start: 1793610000, end: 1793610000 } },
      ],
    },
  };
  db.rpc.mockResolvedValue({ data: "granted", error: null });
  db.audit.mockResolvedValue(undefined);
  db.from.mockImplementation((table: string) => {
    const q = {
      select: () => q,
      eq: () => q,
      upsert: () => q,
      update: () => q,
      single: async () => ({ data: table === "plans" ? { id: "plan" } : purchase, error: null }),
      maybeSingle: async () => ({
        data: table === "plan_prices" ? { plan_id: "plan" } : null,
        error: null,
      }),
      then: (resolve: (r: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve),
    };
    return q;
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("/v1/invoices/in")) return Response.json(invoice);
      if (url.includes("/v1/checkout/sessions/cs")) return Response.json(session);
      throw new Error("Unexpected Stripe request: " + url);
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());
describe("prepaid Stripe fulfillment", () => {
  it("re-fetches a paid session AND invoice before granting through SQL", async () => {
    await processStripeEvent("live", "fixture", {
      type: "checkout.session.async_payment_succeeded",
      data: { object: { id: "cs", mode: "payment" } },
    });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/v1/invoices/in"),
      expect.anything(),
    );
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("expand%5B%5D=line_items"),
      expect.anything(),
    );
    expect(db.rpc).toHaveBeenCalledExactlyOnceWith("apply_prepaid_invoice", {
      _purchase: "purchase",
      _invoice: "in",
    });
    expect(db.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "prepaid_payment_applied" }),
    );
  });
  it("does not grant an unpaid delayed checkout or trust its success event", async () => {
    session.payment_status = "unpaid";
    await processStripeEvent("live", "fixture", {
      type: "checkout.session.async_payment_succeeded",
      data: { object: { id: "cs", mode: "payment" } },
    });
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it("does not grant a draft/open invoice", async () => {
    invoice.status = "open";
    await syncInvoice("live", "fixture", "in");
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it("revokes a reversed payment instead of granting on a webhook replay", async () => {
    session.payment_intent.latest_charge.refunded = true;
    await syncInvoice("live", "fixture", "in");
    expect(db.rpc).toHaveBeenCalledWith(
      "revoke_prepaid_invoice",
      expect.objectContaining({ _invoice: "in" }),
    );
    expect(db.rpc).not.toHaveBeenCalledWith("apply_prepaid_invoice", expect.anything());
  });
  it("propagates grant failures so Stripe can retry the webhook", async () => {
    db.rpc.mockResolvedValue({ data: null, error: new Error("Database unavailable") });
    await expect(syncInvoice("live", "fixture", "in")).rejects.toThrow("Falha ao liberar");
    expect(db.audit).not.toHaveBeenCalled();
  });
});
