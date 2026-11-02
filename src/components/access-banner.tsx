import { Link } from "@tanstack/react-router";
import { Clock, Lock } from "lucide-react";
import { useEffect, useState } from "react";
import { useMe } from "@/hooks/use-me";
import { TRIAL_EXPIRED_MESSAGE } from "@/lib/models";
import { formatDate } from "@/lib/client-api";
import { Button } from "@/components/ui/button";

/** Informative countdown only — the server re-checks the clock on every operation. */
export function useCountdown(target: string | null | undefined, serverNow?: string) {
  const [offset] = useState(() => (serverNow ? new Date(serverNow).getTime() - Date.now() : 0));
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() + offset), 1000);
    return () => clearInterval(t);
  }, [offset]);
  if (!target) return null;
  const ms = new Date(target).getTime() - now;
  if (ms <= 0) return { expired: true, label: "encerrado" };
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return { expired: false, label: d > 0 ? `${d}d ${h}h ${m}min` : `${h}h ${m}min ${s}s` };
}

export function AccessBanner() {
  const { data: me, refetch } = useMe();
  const cd = useCountdown(
    me?.access.code === "trial" ? me.access.trial_ends_at : null,
    me?.serverNow,
  );
  useEffect(() => {
    if (cd?.expired) refetch();
  }, [cd?.expired, refetch]);
  if (!me || me.isAdmin) return null;
  const code = me.access.code;
  if (code === "trial" && cd) {
    return (
      <div className="mb-6 flex flex-col gap-3 rounded-2xl border bg-accent/60 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-accent-foreground">
          <Clock className="size-4" />
          <span>
            Período de teste do plano <b>{me.plan?.name ?? "—"}</b> · termina em{" "}
            {formatDate(me.access.trial_ends_at)} · restam <b>{cd.label}</b>
          </span>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link to="/planos">Assinar agora</Link>
        </Button>
      </div>
    );
  }
  if (code === "trial_expired" || code === "no_access") {
    return (
      <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Lock className="mt-0.5 size-5 text-destructive" />
          <div className="text-sm">
            <p className="font-semibold">
              {code === "trial_expired"
                ? TRIAL_EXPIRED_MESSAGE
                : "Você não possui teste válido nem período pago vigente."}
            </p>
            <p className="mt-1 text-muted-foreground">
              Plano escolhido: <b>{me.plan?.name ?? "—"}</b>
              {me.trial?.granted && (
                <>
                  {" "}
                  · teste de {formatDate(me.trial.started_at)} a {formatDate(me.trial.ends_at)}
                </>
              )}{" "}
              · Seus arquivos continuam disponíveis para visualizar e baixar.
            </p>
          </div>
        </div>
        <Button asChild variant="hero" size="sm">
          <Link to="/planos">Assinar</Link>
        </Button>
      </div>
    );
  }
  if (code === "blocked") {
    return (
      <div className="mb-6 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
        <b>Conta bloqueada pelo administrador.</b> {me.access.reason}
      </div>
    );
  }
  if (me.subscription?.access_state === "payment_failed") {
    return (
      <div className="mb-6 rounded-2xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
        O último pagamento falhou. Você mantém acesso até {formatDate(me.subscription.paid_through)}
        .{" "}
        <Link to="/planos" className="font-semibold underline">
          Atualizar pagamento
        </Link>
      </div>
    );
  }
  return null;
}
