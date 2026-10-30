import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ErrorState, LoadingState, StatusBadge } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { adminSetBlocked, adminSubscriberDetail } from "@/functions/admin.functions";
import { errorMessage, formatBRL, formatDate } from "@/lib/client-api";

export const Route = createFileRoute("/_authenticated/admin/assinantes/$id")({
  head: () => ({
    meta: [
      { title: "Assinante — Vupe Studio" },
      { name: "description", content: "Detalhes do assinante." },
    ],
  }),
  component: Detail,
});

function Detail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["admin-subscriber", id],
    queryFn: () => adminSubscriberDetail({ data: { id } }),
  });
  const [dialog, setDialog] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  const d = q.data!;
  const blocked = d.profile?.status === "blocked";

  const toggle = async () => {
    setBusy(true);
    try {
      await adminSetBlocked({ data: { id, blocked: !blocked, reason } });
      toast.success(blocked ? "Conta desbloqueada." : "Conta bloqueada.");
      setDialog(false);
      setReason("");
      qc.invalidateQueries({ queryKey: ["admin-subscriber", id] });
      qc.invalidateQueries({ queryKey: ["admin-subscribers"] });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <Link
        to="/admin/assinantes"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground"
      >
        <ArrowLeft className="size-4" /> Assinantes
      </Link>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">{d.profile?.name || d.profile?.email}</h1>
          <p className="text-muted-foreground">
            {d.profile?.email} · cadastro {formatDate(d.profile?.created_at)}
          </p>
          <div className="mt-2 flex gap-2">
            <StatusBadge status={blocked ? "blocked" : "active"} />
            <StatusBadge status={d.access.code} />
          </div>
          {blocked && (
            <p className="mt-1 text-sm text-destructive">Motivo: {d.profile?.block_reason}</p>
          )}
        </div>
        <Button variant={blocked ? "outline" : "destructive"} onClick={() => setDialog(true)}>
          {blocked ? "Desbloquear conta" : "Bloquear conta"}
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl border bg-card p-5">
          <p className="text-sm text-muted-foreground">Saldo</p>
          <p className="font-display text-3xl font-bold">{d.balance.available}</p>
          <p className="text-xs text-muted-foreground">{d.balance.reserved} reservado(s)</p>
        </div>
        <div className="rounded-3xl border bg-card p-5">
          <p className="text-sm text-muted-foreground">Teste</p>
          <p className="font-semibold">
            {d.trial
              ? `${formatDate(d.trial.started_at)} → ${formatDate(d.trial.ends_at)}`
              : "Não iniciado (e-mail não confirmado)"}
          </p>
          {d.trial && (
            <p className="text-xs text-muted-foreground">
              {d.trial.credits_granted} créditos concedidos
            </p>
          )}
        </div>
        <div className="rounded-3xl border bg-card p-5">
          <p className="text-sm text-muted-foreground">Acesso atual</p>
          <p className="font-semibold">
            {d.access.ok ? "Liberado" : "Bloqueado para novas operações"}
          </p>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Desbloquear a conta não confirma pagamento nem transforma teste vencido em assinatura paga.
      </p>

      <h2 className="mb-2 mt-8 text-lg font-semibold">Assinaturas</h2>
      {!d.subscriptions.length ? (
        <p className="text-sm text-muted-foreground">Nenhuma.</p>
      ) : (
        d.subscriptions.map((s) => (
          <div key={s.id} className="mb-2 rounded-2xl border bg-card p-4 text-sm">
            <div className="flex flex-wrap gap-2">
              <StatusBadge status={s.access_state} />
              <span className="text-muted-foreground">
                Stripe: {s.stripe_status} · {s.mode}
              </span>
            </div>
            <p className="mt-1 text-muted-foreground">
              Pago até {formatDate(s.paid_through)} · período atual até{" "}
              {formatDate(s.current_period_end)}{" "}
              {s.cancel_at_period_end ? "· cancelamento agendado" : ""}
            </p>
          </div>
        ))
      )}

      <h2 className="mb-2 mt-8 text-lg font-semibold">Faturas</h2>
      {!d.invoices.length ? (
        <p className="text-sm text-muted-foreground">Nenhuma.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border bg-card">
          <table className="w-full text-sm">
            <tbody>
              {d.invoices.map((i) => (
                <tr key={i.id} className="border-t first:border-0">
                  <td className="p-3">{formatDate(i.created_at)}</td>
                  <td>{formatBRL(i.amount_paid || i.amount_due, i.currency)}</td>
                  <td>
                    <StatusBadge status={i.status} />
                  </td>
                  <td className="text-xs text-muted-foreground">{i.stripe_invoice_id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="mb-2 mt-8 text-lg font-semibold">Créditos</h2>
      <div className="max-h-80 overflow-auto rounded-2xl border bg-card">
        <table className="w-full text-sm">
          <tbody>
            {d.ledger.map((l) => (
              <tr key={l.id} className="border-t first:border-0">
                <td className="p-2 whitespace-nowrap">{formatDate(l.created_at)}</td>
                <td>{l.kind}</td>
                <td>{l.delta}</td>
                <td className="text-muted-foreground">{l.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Link to="/creditos" className="mt-2 inline-block text-sm font-semibold text-primary">
        Ajustar créditos
      </Link>

      <h2 className="mb-2 mt-8 text-lg font-semibold">Auditoria</h2>
      {!d.audits.length ? (
        <p className="text-sm text-muted-foreground">Sem registros.</p>
      ) : (
        d.audits.map((a) => (
          <p key={a.id} className="text-sm text-muted-foreground">
            {formatDate(a.created_at)} · {a.action} · {a.result}
            {a.reason ? ` · ${a.reason}` : ""}
          </p>
        ))
      )}

      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{blocked ? "Desbloquear conta" : "Bloquear conta"}</DialogTitle>
            <DialogDescription>
              Informe o motivo. A ação fica registrada na auditoria.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Motivo"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={toggle} disabled={busy || reason.trim().length < 3}>
              {busy && <Loader2 className="animate-spin" />} Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
