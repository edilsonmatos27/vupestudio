import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  grant: vi.fn(),
  revoke: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  list: vi.fn(),
}));
vi.mock("@/functions/admin.functions", () => ({
  adminGrantManualAccess: mocks.grant,
  adminRevokeManualAccess: mocks.revoke,
}));
vi.mock("@/functions/account.functions", () => ({ listPublicPlans: mocks.list }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));
import { ManualAccessPanel } from "@/components/manual-access-panel";
const userId = "11111111-1111-4111-8111-111111111111",
  planId = "22222222-2222-4222-8222-222222222222";
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("crypto", { randomUUID: () => "33333333-3333-4333-8333-333333333333" });
  mocks.list.mockResolvedValue([{ id: planId, name: "Pro" }]);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function mount(blocked = false, grants: Parameters<typeof ManualAccessPanel>[0]["grants"] = []) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ManualAccessPanel userId={userId} blocked={blocked} defaultPlanId={planId} grants={grants} />
    </QueryClientProvider>,
  );
  return client;
}
describe("manual access panel", () => {
  it("requires a reason and sends the chosen validity and credits only on confirmation", async () => {
    const client = mount();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    fireEvent.click(screen.getByRole("button", { name: "Liberar acesso manual" }));
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(within(dialog).getByRole("combobox")).toHaveTextContent("Pro"));
    const confirm = within(dialog).getByRole("button", { name: "Confirmar liberação" });
    expect(confirm).toBeDisabled();
    expect(mocks.grant).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Validade em dias"), { target: { value: "7" } });
    fireEvent.change(screen.getByLabelText("Créditos a conceder"), { target: { value: "12" } });
    fireEvent.change(screen.getByLabelText("Motivo da liberação"), {
      target: { value: "Cortesia de lançamento" },
    });
    mocks.grant.mockResolvedValue({ ok: true });
    fireEvent.click(confirm);
    await waitFor(() => expect(mocks.success).toHaveBeenCalled());
    expect(mocks.grant).toHaveBeenCalledExactlyOnceWith({
      data: {
        id: "33333333-3333-4333-8333-333333333333",
        userId,
        planId,
        days: 7,
        credits: 12,
        reason: "Cortesia de lançamento",
      },
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["admin-subscriber", userId] });
  });
  it("does not grant when cancelled or when the account is blocked", async () => {
    mount(true);
    expect(screen.getByRole("button", { name: "Liberar acesso manual" })).toBeDisabled();
    cleanup();
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Liberar acesso manual" }));
    fireEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancelar" }),
    );
    expect(mocks.grant).not.toHaveBeenCalled();
  });
  it("keeps server failures visible and preserves the request ID for a safe retry", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Liberar acesso manual" }));
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(within(dialog).getByRole("combobox")).toHaveTextContent("Pro"));
    fireEvent.change(screen.getByLabelText("Motivo da liberação"), {
      target: { value: "Cortesia" },
    });
    mocks.grant.mockRejectedValue(new Error("Falha no banco"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirmar liberação" }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith("Falha no banco"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
  it("requires confirmation before revoking a grant", async () => {
    mount(false, [
      {
        id: "grant",
        expires_at: "2026-12-01T00:00:00Z",
        credits: 50,
        reason: "Cortesia",
        revoked_at: null,
      },
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Revogar liberação" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(mocks.revoke).not.toHaveBeenCalled();
    mocks.revoke.mockResolvedValue({ ok: true });
    fireEvent.click(within(dialog).getByRole("button", { name: "Revogar" }));
    await waitFor(() =>
      expect(mocks.revoke).toHaveBeenCalledExactlyOnceWith({ data: { id: "grant" } }),
    );
  });
});
