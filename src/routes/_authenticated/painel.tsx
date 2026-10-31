import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Coins, FolderOpen, PenTool, Sparkles, Wand2, Image as ImageIcon } from "lucide-react";
import { useState } from "react";
import { EmptyState, ErrorState, LoadingState, StatusBadge } from "@/components/states";
import { Lightbox } from "@/components/lightbox";
import { dashboardData } from "@/functions/studio.functions";
import { adminOverview } from "@/functions/admin.functions";
import { useMe } from "@/hooks/use-me";
import { useCountdown } from "@/components/access-banner";
import { errorMessage, formatBRL, formatDate } from "@/lib/client-api";
import { TASK_LABEL } from "@/lib/models";

export const Route = createFileRoute("/_authenticated/painel")({
  head: () => ({
    meta: [
      { title: "Visão geral — Vupe Studio" },
      { name: "description", content: "Resumo do seu estúdio." },
    ],
  }),
  component: Dashboard,
});

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="card-surface rounded-3xl border bg-panel p-5 shadow-soft">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-3xl font-bold">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function AdminOverview() {
  const q = useQuery({ queryKey: ["admin-overview"], queryFn: () => adminOverview() });
  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  const d = q.data!;
  const revenue =
    Object.entries(d.revenue)
      .map(([c, v]) => formatBRL(v, c))
      .join(" · ") || formatBRL(0);
  return (
    <div className="mb-8">
      <h2 className="mb-1 text-lg font-semibold">Visão administrativa</h2>
      <p className="mb-4 text-xs text-muted-foreground">
        Ambiente Stripe: <b>{d.mode === "test" ? "teste" : "produção"}</b> · valores e eventos dos
        últimos {d.periodDays} dias, apenas deste ambiente.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Assinantes cadastrados" value={d.subscribers} />
        <Stat label="Testes ativos" value={d.activeTrials} />
        <Stat label="Ativos pagos" value={d.activePaid} />
        <Stat
          label="Receita confirmada"
          value={revenue}
          hint={`${d.paidInvoices} fatura(s) paga(s), líquido de estornos`}
        />
        <Stat
          label="Créditos consumidos"
          value={d.consumedCredits}
          hint="Itens concluídos com cobrança"
        />
        <Stat
          label="Itens com falha"
          value={d.failedItems}
          hint="Falhas e execuções interrompidas"
        />
        <Stat label="Faturas em aberto" value={d.openInvoices} />
      </div>
    </div>
  );
}

function Dashboard() {
  const { data: me } = useMe();
  const q = useQuery({ queryKey: ["dashboard"], queryFn: () => dashboardData() });
  const [light, setLight] = useState<{ url: string | null; id: string; filename: string } | null>(
    null,
  );
  const cd = useCountdown(
    me?.access.code === "trial" ? me.access.trial_ends_at : null,
    me?.serverNow,
  );
  const hour = new Date().getHours();
  const hello = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  const firstName = (me?.profile?.name || "").split(" ")[0];

  const situation = me?.isAdmin
    ? "Admin master"
    : me?.access.code === "trial"
      ? `Em teste · restam ${cd?.label ?? "…"}`
      : me?.access.code === "paid"
        ? `Assinatura ativa até ${formatDate(me.access.paid_through, false)}`
        : me?.access.code === "trial_expired"
          ? "Teste encerrado"
          : me?.access.code === "blocked"
            ? "Conta bloqueada"
            : "Sem assinatura";

  return (
    <div>
      <div className="panel-featured mb-8 overflow-hidden rounded-3xl p-6 sm:p-8">
        <p className="text-sm text-muted-foreground">
          {hello}
          {firstName ? `, ${firstName}` : ""}
        </p>
        <h1 className="mt-1 text-3xl font-bold">O que vamos criar hoje?</h1>
        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          <span className="rounded-full border bg-card px-3 py-1">
            Plano: <b>{me?.plan?.name ?? "—"}</b>
          </span>
          <span className="rounded-full border bg-card px-3 py-1">{situation}</span>
          {!me?.isAdmin && (
            <span className="rounded-full border bg-card px-3 py-1">
              <Coins className="mr-1 inline size-3.5 text-primary" />
              {me?.balance.available ?? 0} disponíveis · {me?.balance.reserved ?? 0} reservados
            </span>
          )}
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {[
            {
              to: "/inventar",
              icon: Sparkles,
              label: "Inventar imagem",
              text: "Do zero, com descrição e agente",
            },
            { to: "/criar", icon: Wand2, label: "Criar imagem", text: "Editar, compor e variar" },
            { to: "/vetorizar", icon: PenTool, label: "Vetorizar", text: "Converter em SVG" },
          ].map((s) => (
            <Link
              key={s.to}
              to={s.to}
              className="interactive-card flex items-center gap-3 rounded-2xl border bg-panel p-4"
            >
              <div className="flex size-10 items-center justify-center rounded-xl border bg-secondary text-primary">
                <s.icon className="size-5" />
              </div>
              <div>
                <p className="font-semibold">{s.label}</p>
                <p className="text-xs text-muted-foreground">{s.text}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {me?.isAdmin && <AdminOverview />}

      {q.isLoading ? (
        <LoadingState />
      ) : q.error ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Arquivos recentes</h2>
              <Link to="/historico" className="text-sm font-semibold text-primary">
                Ver histórico
              </Link>
            </div>
            {!q.data!.assets.length ? (
              <EmptyState
                icon={<ImageIcon className="size-5" />}
                title="Nenhum arquivo ainda"
                description="Suas criações aparecem aqui."
              />
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {q.data!.assets.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => setLight({ url: a.url, id: a.id, filename: a.filename })}
                    className="overflow-hidden rounded-2xl border bg-checker"
                  >
                    {a.url && (
                      <img
                        src={a.url}
                        alt={a.filename}
                        className="aspect-square w-full object-contain"
                        loading="lazy"
                      />
                    )}
                  </button>
                ))}
              </div>
            )}
            <h2 className="mb-3 mt-6 text-lg font-semibold">Operações recentes</h2>
            {!q.data!.operations.length ? (
              <p className="text-sm text-muted-foreground">Nenhuma operação.</p>
            ) : (
              <div className="divide-y rounded-2xl border bg-card">
                {q.data!.operations.map((o) => (
                  <div key={o.id} className="flex flex-wrap items-center gap-2 p-3 text-sm">
                    <span className="font-semibold">{TASK_LABEL[o.type] ?? o.type}</span>
                    <StatusBadge status={o.status} />
                    <span className="text-muted-foreground">{o.agent_name ?? ""}</span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {formatDate(o.created_at)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Projetos</h2>
              <Link to="/projetos" className="text-sm font-semibold text-primary">
                Todos
              </Link>
            </div>
            {!q.data!.projects.length ? (
              <EmptyState
                icon={<FolderOpen className="size-5" />}
                title="Sem projetos"
                action={
                  <Link to="/projetos" className="text-sm font-semibold text-primary">
                    Criar projeto
                  </Link>
                }
              />
            ) : (
              <div className="space-y-2">
                {q.data!.projects.map((p) => (
                  <Link
                    key={p.id}
                    to="/projetos/$id"
                    params={{ id: p.id }}
                    className="interactive-card flex items-center gap-3 rounded-2xl border bg-panel p-3 text-sm hover:bg-secondary"
                  >
                    <FolderOpen className="size-4 text-primary" />{" "}
                    <span className="flex-1 truncate font-medium">{p.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(p.updated_at, false)}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      <Lightbox
        open={!!light}
        onOpenChange={(o) => !o && setLight(null)}
        src={light?.url ?? null}
        title={light?.filename}
        assetId={light?.id}
        transparentBg
      />
    </div>
  );
}
