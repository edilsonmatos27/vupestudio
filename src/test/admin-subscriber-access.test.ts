import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  getAccess: vi.fn(),
  assertAdmin: vi.fn(),
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
      handler: (h: (d: unknown) => unknown) => (input: { data?: unknown }) =>
        h({ ...input, data: validate(input.data) }),
    };
    return b;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/lib/server-utils.server", () => ({
  supabaseAdmin: { from: db.from, rpc: db.rpc },
  getAccess: db.getAccess,
  assertAdmin: db.assertAdmin,
}));
import { adminListSubscribers } from "@/functions/admin.functions";
const end = "2026-12-02T19:08:44Z";
beforeEach(() => {
  vi.clearAllMocks();
  db.assertAdmin.mockResolvedValue(undefined);
  db.rpc.mockResolvedValue({ data: [{ available: 49, reserved: 0 }], error: null });
  db.getAccess.mockResolvedValue({
    ok: true,
    code: "paid",
    billing_type: "one_time",
    plan_id: "paid-plan",
    paid_through: end,
  });
  db.from.mockImplementation((table: string) => {
    const data =
      table === "profiles"
        ? [{ id: "user", name: "Cliente", status: "active", selected_plan_id: "old-plan" }]
        : table === "plans"
          ? [
              { id: "old-plan", name: "Antigo" },
              { id: "paid-plan", name: "Pro" },
            ]
          : table === "trials"
            ? [{ user_id: "user", ends_at: "2026-11-01T00:00:00Z", snapshot: { granted: true } }]
            : [];
    const q = {
      select: () => q,
      order: () => q,
      limit: () => q,
      or: () => q,
      in: () => q,
      then: (resolve: (r: unknown) => unknown) =>
        Promise.resolve({ data, error: null }).then(resolve),
    };
    return q;
  });
});
const run = () =>
  adminListSubscribers({ data: {}, context: { userId: "admin", supabase: {} } } as never);
describe("admin subscriber access display", () => {
  it("shows a paid prepaid purchase even with an expired trial and no subscription", async () => {
    const rows = await run();
    expect(rows[0]).toMatchObject({
      plan: "Pro",
      access_state: "paid",
      billing_type: "one_time",
      paid_through: end,
      available: 49,
    });
    expect(db.getAccess).toHaveBeenCalledWith("user");
    expect(db.from).not.toHaveBeenCalledWith("subscriptions");
  });
  it("keeps recurring paid access visible", async () => {
    db.getAccess.mockResolvedValue({
      code: "paid",
      billing_type: "recurring",
      plan_id: "paid-plan",
      paid_through: end,
    });
    expect((await run())[0]).toMatchObject({
      access_state: "paid",
      billing_type: "recurring",
      paid_through: end,
    });
  });
  it.each(["trial_expired", "blocked", "no_access"])(
    "uses authoritative %s instead of inferring status from browser time",
    async (code) => {
      db.getAccess.mockResolvedValue({ code, plan_id: "old-plan" });
      expect((await run())[0]).toMatchObject({
        access_state: code,
        plan: "Antigo",
        paid_through: null,
        billing_type: null,
      });
    },
  );
  it("retains the server-side admin gate", async () => {
    db.assertAdmin.mockRejectedValue(new Error("Acesso restrito"));
    await expect(run()).rejects.toThrow("Acesso restrito");
    expect(db.from).not.toHaveBeenCalled();
  });
});

it("shows the manual access expiry without presenting it as a paid subscription", async () => {
  db.getAccess.mockResolvedValue({ code: "manual", plan_id: "paid-plan", manual_ends_at: end });
  expect((await run())[0]).toMatchObject({
    access_state: "manual",
    plan: "Pro",
    paid_through: end,
    billing_type: null,
  });
});
