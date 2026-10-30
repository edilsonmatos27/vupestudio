import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { EmptyState, ErrorState, LoadingState, PageHeader, StatusBadge } from "@/components/states";
import { adminListPayments } from "@/functions/admin.functions";
import { errorMessage, formatBRL, formatDate } from "@/lib/client-api";

export const Route = createFileRoute("/_authenticated/admin/pagamentos")({
  head: () => ({ meta: [{ title: "Pagamentos — Vupe Studio" }, { name: "description", content: "Faturas e transações recebidas da Stripe." }] }),
  component: Payments,
});

function Payments() {
  const q = useQuery({ queryKey: ["admin-payments"], queryFn: () => adminListPayments() });
  return (
    <div>
      <PageHeader title="Pagamentos" description={`Faturas sincronizadas da Stripe (somente leitura)${q.data ? ` · ambiente ${q.data.mode === "test" ? "de teste" : "de produção"}` : ""}. A situação só muda por confirmação da Stripe.`} />
      {q.isLoading ? <LoadingState /> : q.error ? <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} /> : !q.data?.rows.length ? <EmptyState title="Nenhuma fatura neste ambiente" /> : (
        <div className="overflow-x-auto rounded-2xl border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-left text-muted-foreground"><tr><th className="p-3">Data</th><th>Assinante</th><th>Plano</th><th>Valor</th><th>Moeda</th><th>Situação</th><th>Motivo</th><th>Fatura Stripe</th><th>Assinatura</th></tr></thead>
            <tbody>{q.data.rows.map((i) => (
              <tr key={i.id} className="border-t">
                <td className="p-3 whitespace-nowrap">{formatDate(i.paid_at ?? i.created_at)}</td>
                <td>{i.profile?.name || i.profile?.email || "—"}</td>
                <td>{i.plan_name}</td>
                <td>{formatBRL(i.status === "paid" ? i.amount_paid : i.amount_due, i.currency)}{i.amount_refunded ? ` (estorno ${formatBRL(i.amount_refunded, i.currency)})` : ""}</td>
                <td className="uppercase">{i.currency}</td>
                <td><StatusBadge status={i.status} />{i.disputed && <span className="ml-1 text-xs text-destructive">disputa</span>}</td>
                <td className="text-xs">{i.billing_reason}</td>
                <td className="text-xs">{i.stripe_invoice_id}</td>
                <td className="text-xs">{i.stripe_subscription_id}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
