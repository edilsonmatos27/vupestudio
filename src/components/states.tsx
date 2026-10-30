import { AlertTriangle, Inbox, Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

export function LoadingState({ label = "Carregando…" }: { label?: string }) {
  return (
    <div
      className="flex items-center justify-center gap-3 py-16 text-muted-foreground"
      role="status"
    >
      <Loader2 className="size-5 animate-spin text-primary" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 px-6 py-10 text-center">
      <AlertTriangle className="size-6 text-destructive" />
      <p className="max-w-md text-sm text-foreground">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Tentar novamente
        </Button>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed bg-card/50 px-6 py-14 text-center">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-secondary text-muted-foreground">
        {icon ?? <Inbox className="size-5" />}
      </div>
      <div>
        <p className="font-display font-semibold">{title}</p>
        {description && (
          <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    queued: ["Na fila", "bg-secondary text-secondary-foreground"],
    running: ["Processando", "bg-accent text-accent-foreground"],
    storing: ["Salvando", "bg-accent text-accent-foreground"],
    succeeded: ["Concluído", "bg-success/15 text-success"],
    partial: ["Parcial", "bg-warning/20 text-warning-foreground"],
    failed: ["Falhou", "bg-destructive/10 text-destructive"],
    uncertain: ["Interrompido", "bg-warning/20 text-warning-foreground"],
    active: ["Ativo", "bg-success/15 text-success"],
    inactive: ["Inativo", "bg-secondary text-muted-foreground"],
    draft: ["Rascunho", "bg-secondary text-muted-foreground"],
    blocked: ["Bloqueado", "bg-destructive/10 text-destructive"],
    paid: ["Pago", "bg-success/15 text-success"],
    open: ["Em aberto", "bg-warning/20 text-warning-foreground"],
    void: ["Anulada", "bg-secondary text-muted-foreground"],
    uncollectible: ["Incobrável", "bg-destructive/10 text-destructive"],
    awaiting_payment: ["Aguardando pagamento", "bg-warning/20 text-warning-foreground"],
    active_paid: ["Ativo pago", "bg-success/15 text-success"],
    payment_failed: ["Pagamento pendente/falhou", "bg-destructive/10 text-destructive"],
    cancel_scheduled: ["Cancelamento agendado", "bg-warning/20 text-warning-foreground"],
    ended: ["Encerrado", "bg-secondary text-muted-foreground"],
    blocked_billing: ["Bloqueado (estorno/disputa)", "bg-destructive/10 text-destructive"],
    trial: ["Em teste", "bg-accent text-accent-foreground"],
    trial_expired: ["Teste encerrado", "bg-destructive/10 text-destructive"],
    no_access: ["Sem acesso", "bg-secondary text-muted-foreground"],
    admin: ["Admin master", "bg-primary/15 text-primary"],
  };
  const [label, cls] = map[status] ?? [status, "bg-secondary text-secondary-foreground"];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}
    >
      {label}
    </span>
  );
}
