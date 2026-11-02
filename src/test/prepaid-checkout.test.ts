import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  request: vi.fn(),
  access: vi.fn(),
  audit: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate = (d: unknown) => d;
    const b = {
      middleware: () => b,
      inputValidator: (v: typeof validate) => {
        validate = v;
        return b;
      },
      handler: (h: (d: unknown) => unknown) => (input: { data: unknown }) =>
        h({ ...input, data: validate(input.data) }),
    };
    return b;
  },
}));
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => new Request("https://vupe.example/planos"),
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/lib/server-utils.server", () => ({
  supabaseAdmin: { from: mocks.from },
  getAccess: mocks.access,
  audit: mocks.audit,
}));
vi.mock("@/lib/stripe.server", () => ({
  currentMode: async () => "live",
  getStripeSecrets: async () => ({ secretKey: "fixture" }),
  stripeRequest: mocks.request,
}));
import { createCheckout } from "@/functions/billing.functions";
const id = "11111111-1111-4111-8111-111111111111";
let billingType = "one_time";
let activeSubscription = false;
let updateFailure = false;
const insert = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  billingType = "one_time";
  activeSubscription = false;
  updateFailure = false;
  mocks.access.mockResolvedValue({ code: "trial" });
  mocks.audit.mockResolvedValue(undefined);
  mocks.request.mockResolvedValue({ id: "cs_fixture", url: "https://checkout.stripe.com/fixture" });
  mocks.from.mockImplementation((table: string) => {
    let updating = false;
    const q = {
      select: () => q,
      eq: () => q,
      in: () => q,
      order: () => q,
      limit: () => q,
      insert: (data: unknown) => {
        insert(table, data);
        return q;
      },
      update: () => {
        updating = true;
        return q;
      },
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve({ error: updating && updateFailure ? new Error("db") : null }).then(
          resolve,
        ),
      single: async () => ({
        data:
          table === "profiles"
            ? { status: "active" }
            : table === "plans"
              ? {
                  id,
                  status: "active",
                  billing_type: billingType,
                  billing_interval: "month",
                  stripe_price_id_live: "price_fixture",
                  price_cents: 1990,
                  currency: "brl",
                  credits_per_cycle: 50,
                  allowed_features: ["edit"],
                  allowed_models: [],
                  max_batch: 3,
                }
              : { id: "purchase_fixture" },
        error: null,
      }),
      maybeSingle: async () => ({
        data:
          table === "subscriptions"
            ? activeSubscription
              ? { id: "sub" }
              : null
            : { stripe_customer_id: "cus_fixture" },
        error: null,
      }),
    };
    return q;
  });
});
const run = () => createCheckout({ data: { planId: id }, context: { userId: "user" } } as never);
describe("prepaid checkout creation", () => {
  it("creates a payment session, snapshots the purchase, and requests its paid invoice", async () => {
    await expect(run()).resolves.toEqual({ url: "https://checkout.stripe.com/fixture" });
    expect(insert).toHaveBeenCalledWith(
      "prepaid_purchases",
      expect.objectContaining({
        user_id: "user",
        mode: "live",
        amount_cents: 1990,
        credits: 50,
        features: ["edit"],
        billing_interval: "month",
      }),
    );
    const params = mocks.request.mock.calls[0]![3];
    expect(params.mode).toBe("payment");
    expect(params.subscription_data).toBeUndefined();
    expect(params.invoice_creation).toEqual({
      enabled: true,
      invoice_data: { metadata: params.metadata },
    });
    expect(params.payment_intent_data.metadata.purchase_id).toBe("purchase_fixture");
    expect(params.payment_method_types).toBeUndefined();
  });
  it("keeps the existing subscription checkout unchanged", async () => {
    billingType = "recurring";
    await run();
    const params = mocks.request.mock.calls[0]![3];
    expect(params.mode).toBe("subscription");
    expect(params.subscription_data.metadata.plan_id).toBe(id);
    expect(params.invoice_creation).toBeUndefined();
    expect(insert).not.toHaveBeenCalled();
  });
  it("prevents double billing while a subscription or prepaid period is active", async () => {
    activeSubscription = true;
    await expect(run()).rejects.toThrow("já possui uma assinatura");
    activeSubscription = false;
    mocks.access.mockResolvedValue({ code: "paid", billing_type: "one_time" });
    await expect(run()).rejects.toThrow("período avulso ativo");
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it("does not return a payment URL when session binding fails", async () => {
    updateFailure = true;
    await expect(run()).rejects.toThrow("vincular a sessão");
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});
