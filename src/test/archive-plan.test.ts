import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({
  assertAdmin: vi.fn(),
  audit: vi.fn(),
  from: vi.fn(),
  update: vi.fn(),
  filter: vi.fn(),
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
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/lib/server-utils.server", () => ({
  assertAdmin: db.assertAdmin,
  audit: db.audit,
  supabaseAdmin: { from: db.from },
}));
import { adminArchivePlan } from "@/functions/plans.functions";
const id = "11111111-1111-4111-8111-111111111111";
let saved: { id: string; name: string } | null;
let error: Error | null;
beforeEach(() => {
  vi.clearAllMocks();
  db.assertAdmin.mockResolvedValue(undefined);
  db.audit.mockResolvedValue(undefined);
  saved = { id, name: "Plano de teste publicado" };
  error = null;
  db.from.mockImplementation(() => {
    const q = {
      update: (patch: unknown) => {
        db.update(patch);
        return q;
      },
      eq: () => q,
      is: (...args: unknown[]) => {
        db.filter(...args);
        return q;
      },
      select: () => q,
      maybeSingle: async () => ({ data: saved, error }),
    };
    return q;
  });
});
const run = () =>
  adminArchivePlan({ data: { id }, context: { userId: "admin", supabase: {} } } as never);
describe("admin archive plan", () => {
  it("archives a published plan without deleting prices, subscriptions or invoices", async () => {
    await expect(run()).resolves.toEqual({ ok: true });
    expect(db.from).toHaveBeenCalledExactlyOnceWith("plans");
    expect(db.update).toHaveBeenCalledWith({ status: "inactive", archived_at: expect.any(String) });
    expect(db.filter).toHaveBeenCalledWith("archived_at", null);
    expect(db.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "plan_archived", target_id: id, actor_id: "admin" }),
    );
  });
  it("rejects non-admins before accessing any plan", async () => {
    db.assertAdmin.mockRejectedValue(new Error("Acesso restrito"));
    await expect(run()).rejects.toThrow("Acesso restrito");
    expect(db.from).not.toHaveBeenCalled();
  });
  it("reports a failed archive without auditing success", async () => {
    error = new Error("Database unavailable");
    await expect(run()).rejects.toThrow("Não foi possível arquivar");
    expect(db.audit).not.toHaveBeenCalled();
  });
  it("does not report success for missing or already archived plans", async () => {
    saved = null;
    await expect(run()).rejects.toThrow("já arquivado");
    expect(db.audit).not.toHaveBeenCalled();
  });
});
