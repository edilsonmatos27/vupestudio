import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ComponentType } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  list: vi.fn(),
  remove: vi.fn(),
  archive: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@/functions/plans.functions", () => ({
  adminListPlans: api.list,
  adminDeletePlan: api.remove,
  adminArchivePlan: api.archive,
  adminReorderPlans: vi.fn(),
  adminSavePlan: vi.fn(),
  adminSetPlanStatus: vi.fn(),
  adminSyncPlanStripe: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: api.success, error: api.error } }));

import { Route } from "@/routes/_authenticated/admin/planos";

const plan = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Plano experimental",
  status: "draft",
  price_cents: 2900,
  billing_interval: "month",
  credits_per_cycle: 30,
  max_batch: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  api.list.mockResolvedValue({ plans: [plan], prices: [], mode: "test" });
});
afterEach(cleanup);

async function openConfirmation() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Page = Route.options.component as ComponentType;
  render(
    <QueryClientProvider client={client}>
      <Page />
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Excluir plano Plano experimental" }));
  const dialog = await screen.findByRole("alertdialog");
  expect(within(dialog).getByRole("heading")).toHaveTextContent("Plano experimental");
  return { client, dialog };
}

describe("admin delete plan confirmation", () => {
  it("does not delete when the admin cancels", async () => {
    const { dialog } = await openConfirmation();
    expect(api.remove).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(api.remove).not.toHaveBeenCalled();
    expect(screen.getByText(plan.name)).toBeInTheDocument();
  });

  it("blocks duplicate submissions, closes after success and refreshes both plan lists", async () => {
    let finish!: (value: { ok: boolean }) => void;
    api.remove.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const { client, dialog } = await openConfirmation();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const confirm = within(dialog).getByRole("button", { name: "Excluir plano" });
    fireEvent.click(confirm);
    await waitFor(() => expect(confirm).toBeDisabled());
    fireEvent.click(confirm);
    expect(api.remove).toHaveBeenCalledExactlyOnceWith({ data: { id: plan.id } });
    api.list.mockResolvedValue({ plans: [], prices: [], mode: "test" });
    finish({ ok: true });
    await screen.findByText("Nenhum plano");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["admin-plans"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["public-plans"] });
    expect(api.success).toHaveBeenCalledWith("Plano excluído.");
  });

  it("shows the server refusal and keeps the plan and confirmation available", async () => {
    api.remove.mockRejectedValue(new Error("Este plano possui cadastros vinculados."));
    const { dialog } = await openConfirmation();
    fireEvent.click(within(dialog).getByRole("button", { name: "Excluir plano" }));
    await waitFor(() =>
      expect(api.error).toHaveBeenCalledWith("Este plano possui cadastros vinculados."),
    );
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Excluir plano" })).toBeEnabled();
    expect(api.success).not.toHaveBeenCalled();
    expect(api.list).toHaveBeenCalledOnce();
  });
});

describe("admin archive published plan confirmation", () => {
  it("allows archiving a Stripe-published plan only after confirmation", async () => {
    api.list.mockResolvedValue({
      plans: [{ ...plan, status: "inactive", stripe_price_id_test: "price_fixture" }],
      prices: [],
      mode: "test",
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const Page = Route.options.component as ComponentType;
    render(
      <QueryClientProvider client={client}>
        <Page />
      </QueryClientProvider>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Arquivar plano Plano experimental" }),
    );
    let dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/não cancela a renovação/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    expect(api.archive).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Arquivar plano Plano experimental" }));
    dialog = await screen.findByRole("alertdialog");
    api.archive.mockResolvedValue({ ok: true });
    api.list.mockResolvedValue({ plans: [], prices: [], mode: "test" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Arquivar plano" }));
    await screen.findByText("Nenhum plano");
    expect(api.archive).toHaveBeenCalledExactlyOnceWith({ data: { id: plan.id } });
    expect(api.remove).not.toHaveBeenCalled();
  });
});
