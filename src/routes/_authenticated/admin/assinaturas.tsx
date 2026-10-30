import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { EmptyState, ErrorState, LoadingState, PageHeader, StatusBadge } from "@/components/states";
import { adminListSubscriptions } from "@/server/admin.functions";
import { errorMessage, formatDate } from "@/lib/client-api";

export const Route = createFileRoute("/_authenticated/admin/assinaturas")({
  head: () => ({ meta: [{ title: "Assinaturas — Vupe Studio" }, { name: "description", content: "Assinaturas Stripe e direito de acesso." }] }),
  component: Subs,
});

function Subs() {
  const q = useQuery({ queryKey: ["admin-subscriptions"], queryFn: () => adminListSubscriptions() });
  return (
    <div>
      <PageHeader title="Assinaturas" description={`Status original da Stripe e estado de acesso da aplicação${q.data ? ` · ambiente ${q.data.mode === "test" ? "de teste" : "de produção"}` : ""}.`} />
      {q.isLoading ? <LoadingState /> : q.error ? <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} /> : !q.data?.rows.length ? <EmptyState title="Nenhuma assinatura neste ambiente" /> : (
        <div className="overflow-x-auto rounded-2xl border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-left text-muted-foreground"><tr><th className="p-3">Assinante</th><th>Plano</th><th>Cliente Stripe</th><th>Status Stripe</th><th>Acesso</th><th>Início</th><th>Fim do teste</th><th>Pago até</th><th>Renovação</th><th>Cancelamento</th></tr></thead>
            <tbody>{q.data.rows.map((s) => (
              <tr key={s.id} className="border-t">
                <td className="p-3">{s.profile ? <Link to="/admin/assinantes/$id" params={{ id: s.user_id }} className="text-primary">{s.profile.name || s.profile.email}</Link> : "—"}</td>
                <td>{s.plan_name}</td>
                <td className="text-xs">{s.stripe_customer_id}</td>
                <td>{s.stripe_status}</td>
                <td><StatusBadge status={s.access_state} /></td>
                <td>{formatDate(s.created_at, false)}</td>
                <td>{formatDate(s.trial_ends_at, false)}</td>
                <td>{formatDate(s.paid_through)}</td>
                <td>{formatDate(s.current_period_end, false)}</td>
                <td>{s.cancel_at_period_end ? "Agendado" : s.canceled_at ? formatDate(s.canceled_at, false) : "—"}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
