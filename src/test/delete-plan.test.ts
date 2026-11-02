import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertAdmin: vi.fn(),
  audit: vi.fn(),
  from: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate = (data: unknown) => data;
    const builder = {
      middleware: () => builder,
      inputValidator: (validator: typeof validate) => {
        validate = validator;
        return builder;
      },
      handler: (handler: (input: unknown) => unknown) => (input: { data: unknown }) =>
        handler({ ...input, data: validate(input.data) }),
    };
    return builder;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/lib/server-utils.server", () => ({
  assertAdmin: mocks.assertAdmin,
  audit: mocks.audit,
  supabaseAdmin: { from: mocks.from },
}));

import { adminDeletePlan } from "@/functions/plans.functions";

const id = "11111111-1111-4111-8111-111111111111";
const initialPlan = {
  id,
  name: "Plano de teste",
  status: "draft",
  updated_at: "2026-11-02T12:00:00Z",
  stripe_price_id_test: null,
  stripe_price_id_live: null,
};
let plan: Record<string, unknown> | null;
let readError: unknown;
let deleteError: unknown;
let deleted: { id: string } | null;
let linkTable: string | null;
let failedTable: string | null;
const deletion = vi.fn();
const deleteFilters = vi.fn();
const run = () =>
  adminDeletePlan({ data: { id }, context: { userId: "admin", supabase: {} } } as never);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.assertAdmin.mockResolvedValue(undefined);
  mocks.audit.mockResolvedValue(undefined);
  plan = { ...initialPlan };
  readError = deleteError = null;
  deleted = { id };
  linkTable = failedTable = null;
  mocks.from.mockImplementation((table: string) => {
    let removing = false;
    const query = {
      select: () => query,
      eq: (column: string, value: unknown) => {
        if (removing) deleteFilters(column, value);
        return query;
      },
      contains: () => query,
      delete: () => {
        removing = true;
        deletion();
        return query;
      },
      maybeSingle: async () =>
        removing ? { data: deleted, error: deleteError } : { data: plan, error: readError },
      limit: async () => ({
        data: table === linkTable ? [{ id: "linked" }] : [],
        error: table === failedTable ? new Error("Database unavailable") : null,
      }),
    };
    return query;
  });
});

describe("admin plan deletion", () => {
  it("rejects a non-admin before reading or deleting data", async () => {
    mocks.assertAdmin.mockRejectedValue(new Error("Acesso restrito"));
    await expect(run()).rejects.toThrow("Acesso restrito");
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it.each(["draft", "inactive"])(
    "deletes an unused %s plan and records an audit",
    async (status) => {
      plan!["status"] = status;
      await expect(run()).resolves.toEqual({ ok: true });
      expect(deletion).toHaveBeenCalledOnce();
      expect(deleteFilters.mock.calls).toEqual([
        ["id", id],
        ["status", status],
        ["updated_at", initialPlan.updated_at],
      ]);
      expect(mocks.audit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "plan_deleted",
          actor_id: "admin",
          target_id: id,
        }),
      );
    },
  );

  it("requires deactivation before deletion", async () => {
    plan!["status"] = "active";
    await expect(run()).rejects.toThrow("Desative");
    expect(deletion).not.toHaveBeenCalled();
  });

  it.each(["stripe_price_id_test", "stripe_price_id_live"])(
    "preserves published %s prices",
    async (column) => {
      plan![column] = "price_fixture";
      await expect(run()).rejects.toThrow("publicado na Stripe");
      expect(deletion).not.toHaveBeenCalled();
    },
  );

  it.each([
    "profiles",
    "trials",
    "subscriptions",
    "invoices",
    "agents",
    "plan_prices",
    "prepaid_purchases",
  ])("preserves plans referenced by %s (including historical prices)", async (table) => {
    linkTable = table;
    await expect(run()).rejects.toThrow("vinculados ou preços");
    expect(deletion).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("fails closed when a reference lookup fails", async () => {
    failedTable = "subscriptions";
    await expect(run()).rejects.toThrow("verificar os vínculos");
    expect(deletion).not.toHaveBeenCalled();
  });

  it("reports missing plans and lookup errors", async () => {
    plan = null;
    await expect(run()).rejects.toThrow("não encontrado");
    readError = new Error("Database unavailable");
    await expect(run()).rejects.toThrow("verificar o plano");
    expect(deletion).not.toHaveBeenCalled();
  });

  it("refuses stale deletion after a concurrent plan edit", async () => {
    deleted = null;
    await expect(run()).rejects.toThrow("foi alterado");
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("does not report success or audit a failed deletion", async () => {
    deleteError = new Error("Delete failed");
    await expect(run()).rejects.toThrow("Não foi possível excluir");
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("rejects malformed plan IDs", async () => {
    await expect(async () => adminDeletePlan({ data: { id: "invalid" } })).rejects.toThrow();
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
