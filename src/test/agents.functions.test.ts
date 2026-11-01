import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  from: vi.fn(),
  assertAdmin: vi.fn(),
  audit: vi.fn(),
  getAccess: vi.fn(),
  getSettings: vi.fn(),
}));
vi.mock("@/lib/server-utils.server", () => ({
  supabaseAdmin: { from: mock.from },
  assertAdmin: mock.assertAdmin,
  audit: mock.audit,
  getAccess: mock.getAccess,
  getSettings: mock.getSettings,
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
// Invoke the actual handlers and Zod validators without an HTTP server or credentials.
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate = (value: unknown): unknown => value;
    const builder = {
      middleware: () => builder,
      inputValidator: (validator: typeof validate) => {
        validate = validator;
        return builder;
      },
      handler:
        (handler: (args: { data: unknown; context: unknown }) => Promise<unknown>) =>
        async (args: { data?: unknown; context: unknown }) =>
          handler({ ...args, data: validate(args.data) }),
    };
    return builder;
  },
}));

import { adminSetAgentOrder, adminSaveAgent, listMyAgents } from "@/functions/agents.functions";
const id = "11111111-1111-4111-8111-111111111111";
const context = { userId: "admin", supabase: {} };
const call = (fn: unknown, data?: unknown) =>
  (fn as (args: { data: unknown; context: typeof context }) => Promise<unknown>)({ data, context });
function query(data: unknown) {
  const q = {
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    update: vi.fn(),
    order: vi.fn(),
    single: vi.fn(),
    maybeSingle: vi.fn(),
  };
  for (const method of [q.select, q.eq, q.is, q.update]) method.mockReturnValue(q);
  for (const method of [q.single, q.maybeSingle, q.order])
    method.mockResolvedValue({ data, error: null });
  return q;
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("admin agent ordering", () => {
  it("rejects non-admins before reading or writing agents", async () => {
    mock.assertAdmin.mockRejectedValue(new Error("Acesso restrito"));
    await expect(call(adminSetAgentOrder, { id, position: 1 })).rejects.toThrow("Acesso restrito");
    expect(mock.from).not.toHaveBeenCalled();
  });
  it("persists the position without overwriting the model or other settings", async () => {
    const read = query({
      settings: { default_model: "model", display_order: 7 },
      updated_at: "version",
    });
    const write = query({ id });
    mock.from.mockReturnValueOnce(read).mockReturnValueOnce(write);
    await expect(call(adminSetAgentOrder, { id, position: 2 })).resolves.toEqual({ ok: true });
    expect(write.update.mock.calls[0]?.[0].settings).toEqual({
      default_model: "model",
      display_order: 2,
    });
    expect(write.eq).toHaveBeenCalledWith("updated_at", "version");
    expect(mock.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "agent_order_updated" }),
    );
  });
  it("clears a position and preserves unrelated settings", async () => {
    const write = query({ id });
    mock.from
      .mockReturnValueOnce(
        query({ settings: { default_aspect: "1:1", display_order: 2 }, updated_at: "version" }),
      )
      .mockReturnValueOnce(write);
    await call(adminSetAgentOrder, { id, position: null });
    expect(write.update.mock.calls[0]?.[0].settings).toEqual({ default_aspect: "1:1" });
  });
  it("reports concurrent changes instead of reporting a successful save", async () => {
    mock.from
      .mockReturnValueOnce(query({ settings: {}, updated_at: "old" }))
      .mockReturnValueOnce(query(null));
    await expect(call(adminSetAgentOrder, { id, position: 1 })).rejects.toThrow("outra sessão");
    expect(mock.audit).not.toHaveBeenCalled();
  });
  it("rejects invalid positions before touching the database", async () => {
    for (const position of [0, -1, 1.5, "1", 1_000_001])
      await expect(call(adminSetAgentOrder, { id, position })).rejects.toThrow();
    expect(mock.from).not.toHaveBeenCalled();
  });
  it("does not reset order or settings when editing an agent", async () => {
    const write = query({ id });
    mock.from
      .mockReturnValueOnce(
        query({ current_version: 1, name: "Teste", settings: { display_order: 3 } }),
      )
      .mockReturnValueOnce(query({ base_prompt: "prompt" }))
      .mockReturnValueOnce(write);
    await call(adminSaveAgent, {
      id,
      name: "Teste",
      public_description: "",
      image_url: null,
      purpose: "create",
      base_prompt: "prompt",
      allowed_plan_ids: [],
      settings: {},
    });
    expect(write.update.mock.calls[0]?.[0]).not.toHaveProperty("settings");
  });
  it("applies the saved order while retaining plan restrictions", async () => {
    mock.getAccess.mockResolvedValue({ code: "paid", plan_id: "basic" });
    mock.from.mockReturnValue(
      query([
        { id: "a", name: "Anime", settings: {}, allowed_plan_ids: [] },
        { id: "b", name: "Cyberpunk", settings: { display_order: 1 }, allowed_plan_ids: ["pro"] },
        { id: "c", name: "Retrato", settings: { display_order: 2 }, allowed_plan_ids: ["basic"] },
      ]),
    );
    expect(await call(listMyAgents)).toEqual([
      expect.objectContaining({ id: "c" }),
      expect.objectContaining({ id: "a" }),
    ]);
  });
});

describe("retired studio tools", () => {
  it("rejects new invent operations before accessing the database", async () => {
    const { createOperation } = await import("@/functions/studio.functions");
    await expect(
      call(createOperation, { type: "invent", model: "model", idempotencyKey: id }),
    ).rejects.toThrow();
    expect(mock.from).not.toHaveBeenCalled();
  });
  it("does not expose retired capabilities to administrators", async () => {
    const { studioOptions } = await import("@/functions/studio.functions");
    mock.getAccess.mockResolvedValue({
      code: "admin",
      ok: true,
      features: ["invent", "vectorize", "edit"],
    });
    mock.getSettings.mockResolvedValue({ ai_models: {}, ai_defaults: {} });
    mock.from.mockReturnValue(query([]));
    const result = (await call(studioOptions)) as { features: string[] };
    expect(result.features).toEqual(["edit", "compose", "variation"]);
  });
});
