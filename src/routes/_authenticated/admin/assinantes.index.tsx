import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Users } from "lucide-react";
import { EmptyState, ErrorState, LoadingState, PageHeader, StatusBadge } from "@/components/states";
import { Input } from "@/components/ui/input";
import { adminListSubscribers } from "@/functions/admin.functions";
import { errorMessage, formatDate } from "@/lib/client-api";

export const Route = createFileRoute("/_authenticated/admin/assinantes/")({
  head: () => ({
    meta: [
      { title: "Assinantes — Vupe Studio" },
      { name: "description", content: "Gestão de assinantes." },
    ],
  }),
  component: Subscribers,
});

function Subscribers() {
  const [q, setQ] = useState("");
  const list = useQuery({
    queryKey: ["admin-subscribers", q],
    queryFn: () => adminListSubscribers({ data: { q: q || undefined } }),
  });
  return (
    <div>
      <PageHeader
        title="Assinantes"
        description="Pesquise por nome ou e-mail e abra os detalhes."
      />
      <Input
        placeholder="Pesquisar…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="mb-4 max-w-sm"
      />
      {list.isLoading ? (
        <LoadingState />
      ) : list.error ? (
        <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} />
      ) : !list.data?.length ? (
        <EmptyState icon={<Users className="size-5" />} title="Nenhum assinante encontrado" />
      ) : (
        <div className="overflow-x-auto rounded-2xl border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-left text-muted-foreground">
              <tr>
                <th className="p-3">Nome</th>
                <th>E-mail</th>
                <th>Cadastro</th>
                <th>Plano</th>
                <th>Situação</th>
                <th>Teste até</th>
                <th>Acesso pago até</th>
                <th>Saldo</th>
                <th>Reservas</th>
              </tr>
            </thead>
            <tbody>
              {list.data.map((s) => (
                <tr key={s.id} className="border-t hover:bg-secondary/40">
                  <td className="p-3">
                    <Link
                      to="/admin/assinantes/$id"
                      params={{ id: s.id }}
                      className="font-semibold text-primary"
                    >
                      {s.name || "—"}
                    </Link>
                    {s.is_admin && (
                      <span className="ml-2">
                        <StatusBadge status="admin" />
                      </span>
                    )}
                  </td>
                  <td>{s.email}</td>
                  <td>{formatDate(s.created_at, false)}</td>
                  <td>
                    {s.plan}
                    {s.billing_type === "one_time" && (
                      <span className="ml-2 text-xs text-muted-foreground">Avulso</span>
                    )}
                  </td>
                  <td>
                    {s.status === "blocked" ? (
                      <StatusBadge status="blocked" />
                    ) : (
                      <StatusBadge status={s.access_state} />
                    )}
                  </td>
                  <td>{formatDate(s.trial_ends_at)}</td>
                  <td>{formatDate(s.paid_through)}</td>
                  <td>{s.available}</td>
                  <td>{s.reserved}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
