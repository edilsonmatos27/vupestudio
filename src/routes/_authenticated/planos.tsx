import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { ErrorState, LoadingState, PageHeader, StatusBadge } from "@/components/states";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { listPublicPlans } from "@/functions/account.functions";
import { changePlan, createCheckout, createPortal, myBilling, previewPlanChange, syncCheckoutSession } from "@/functions/billing.functions";
import { useMe } from "@/hooks/use-me";
import { errorMessage, formatBRL, formatDate } from "@/lib/client-api";
import { FEATURES } from "@/lib/models";

export const Route = createFileRoute("/_authenticated/planos")({
  validateSearch: (s) => z.object({ checkout: z.string().optional(), session_id: z.string().optional() }).parse(s),
  head: () => ({ meta: [{ title: "Planos — Vupe Studio" }, { name: "description", content: "Seu plano, assinatura e opções de mudança." }] }),
  component: PlansPage,
});

function openExternal(url: string) {
  // Stripe pages cannot run inside the editor preview frame; open at top level or in a new tab.
  try {
    if (window.top && window.top !== window.self) {
      window.open(url, "_blank", "noopener");
      return;
    }
  } catch {}
  window.location.href = url;
}

function CheckoutReturn({ sessionId }: { sessionId: string }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [state, setState] = useState<"checking" | "paid" | "pending" | "error">("checking");
  const [msg, setMsg] = useState("");
  useEffect(() => {
    let alive = true;
    let tries = 0;
    const tick = async () => {
      tries++;
      try {
        const r = await syncCheckoutSession({ data: { sessionId } });
        if (!alive) return;
        if (r.access.code === "paid") {
          setState("paid");
          qc.invalidateQueries();
          return;
        }
        if (tries < 12) setTimeout(tick, 5000);
        else {
          setState("pending");
          setMsg(r.paymentStatus === "unpaid" ? "O pagamento ainda não foi confirmado pela Stripe." : "Aguardando a confirmação da fatura.");
        }
      } catch (e) {
        if (!alive) return;
        setState("error");
        setMsg(errorMessage(e));
      }
    };
    tick();
    return () => {
      alive = false;
    };
  }, [sessionId, qc]);
  return (
    <div className="mb-6 rounded-2xl border bg-card p-5 shadow-soft">
      {state === "checking" && <p className="flex items-center gap-2 text-sm"><Loader2 className="size-4 animate-spin text-primary" /> Confirmando o pagamento com a Stripe… Os recursos só são liberados após a confirmação da fatura.</p>}
      {state === "paid" && <p className="flex items-center gap-2 text-sm text-success"><CheckCircle2 className="size-4" /> Pagamento confirmado. Sua assinatura está ativa.</p>}
      {state === "pending" && <p className="text-sm">{msg} Você receberá acesso automaticamente assim que a confirmação chegar. <Button variant="link" className="h-auto p-0" onClick={() => navigate({ to: "/planos", search: {} })}>Atualizar</Button></p>}
      {state === "error" && <p className="text-sm text-destructive">{msg}</p>}
    </div>
  );
}

function PlansPage() {
  const { checkout, session_id } = Route.useSearch();
  const qc = useQueryClient();
  const { data: me, isLoading } = useMe();
  const plans = useQuery({ queryKey: ["public-plans"], queryFn: () => listPublicPlans() });
  const billing = useQuery({ queryKey: ["my-billing"], queryFn: () => myBilling() });
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ planId: string; kind: string; amountDue: number; currency: string; effectiveAt: string | null; targetName: string } | null>(null);

  if (isLoading || plans.isLoading) return <LoadingState />;
  if (plans.error) return <ErrorState message={errorMessage(plans.error)} onRetry={() => plans.refetch()} />;
  const sub = me?.subscription;
  const hasPaidSub = sub && ["active", "past_due", "trialing", "incomplete", "unpaid"].includes(sub.stripe_status);

  const subscribe = async (planId: string) => {
    setBusy(planId);
    try {
      const { url } = await createCheckout({ data: { planId } });
      openExternal(url);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  const askChange = async (planId: string) => {
    setBusy(planId);
    try {
      const p = await previewPlanChange({ data: { planId } });
      setPreview({ planId, ...p });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  const doChange = async () => {
    if (!preview) return;
    setBusy(preview.planId);
    try {
      const r = await changePlan({ data: { planId: preview.planId } });
      toast.success(r.kind === "upgrade" ? "Upgrade solicitado. Os novos benefícios entram após a confirmação do pagamento." : "Mudança agendada para o próximo ciclo.");
      qc.invalidateQueries();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
      setPreview(null);
    }
  };
  const portal = async () => {
    setBusy("portal");
    try {
      const { url } = await createPortal();
      openExternal(url);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <PageHeader title="Planos" description="Seu plano atual, situação da assinatura e opções de mudança." actions={hasPaidSub ? <Button variant="outline" onClick={portal} disabled={busy === "portal"}>{busy === "portal" && <Loader2 className="animate-spin" />} Gerenciar pagamento e cancelamento</Button> : undefined} />
      {checkout === "retorno" && session_id && <CheckoutReturn sessionId={session_id} />}
      {checkout === "cancelado" && <p className="mb-6 rounded-2xl border bg-card p-4 text-sm">Checkout cancelado. Nenhuma cobrança foi feita.</p>}

      {me && !me.isAdmin && (
        <div className="mb-8 grid gap-4 sm:grid-cols-4">
          <div className="rounded-3xl border bg-card p-5"><p className="text-sm text-muted-foreground">Plano</p><p className="mt-1 font-display text-xl font-bold">{me.plan?.name ?? "—"}</p></div>
          <div className="rounded-3xl border bg-card p-5"><p className="text-sm text-muted-foreground">Situação</p><div className="mt-2"><StatusBadge status={sub?.access_state ?? me.access.code} /></div></div>
          <div className="rounded-3xl border bg-card p-5"><p className="text-sm text-muted-foreground">Créditos</p><p className="mt-1 font-display text-xl font-bold">{me.balance.available}</p></div>
          <div className="rounded-3xl border bg-card p-5">
            <p className="text-sm text-muted-foreground">{sub?.cancel_at_period_end ? "Acesso até" : "Próxima renovação"}</p>
            <p className="mt-1 font-display text-xl font-bold">{sub?.current_period_end ? formatDate(sub.current_period_end, false) : me.access.code === "trial" ? `Teste até ${formatDate(me.access.trial_ends_at, false)}` : "—"}</p>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {plans.data?.map((p) => {
          const isCurrent = sub?.plan_id === p.id && hasPaidSub;
          return (
            <div key={p.id} className={`flex flex-col rounded-3xl border bg-card p-6 shadow-soft ${p.highlight ? "ring-2 ring-primary" : ""}`}>
              <div className="flex items-center justify-between"><h3 className="text-xl font-semibold">{p.name}</h3>{isCurrent && <StatusBadge status="active" />}</div>
              <p className="mt-1 text-sm text-muted-foreground">{p.description}</p>
              <p className="mt-4 font-display text-3xl font-bold">{formatBRL(p.price_cents)}{p.price_cents !== null && <span className="text-base font-medium text-muted-foreground">/{p.billing_interval === "month" ? "mês" : "ano"}</span>}</p>
              <ul className="mt-4 flex-1 space-y-1.5 text-sm">
                <li>{p.credits_per_cycle} créditos por ciclo</li>
                <li>Até {p.max_batch} resultado(s) por operação</li>
                {FEATURES.map((f) => <li key={f.id} className={p.allowed_features.includes(f.id) ? "" : "text-muted-foreground line-through"}>{f.label}</li>)}
              </ul>
              {me?.isAdmin ? (
                <p className="mt-6 text-xs text-muted-foreground">Admin master não precisa assinar.</p>
              ) : !p.checkout_available ? (
                <Button className="mt-6" variant="outline" disabled>Pagamento ainda não disponível</Button>
              ) : isCurrent ? (
                <Button className="mt-6" variant="outline" disabled>Plano atual</Button>
              ) : hasPaidSub ? (
                <Button className="mt-6" variant="outline" onClick={() => askChange(p.id)} disabled={busy === p.id}>{busy === p.id && <Loader2 className="animate-spin" />} Mudar para este plano</Button>
              ) : (
                <Button className="mt-6" variant="hero" onClick={() => subscribe(p.id)} disabled={busy === p.id}>{busy === p.id && <Loader2 className="animate-spin" />} Assinar</Button>
              )}
            </div>
          );
        })}
      </div>

      {!!billing.data?.invoices.length && (
        <div className="mt-8 rounded-3xl border bg-card p-5">
          <h2 className="mb-3 text-lg font-semibold">Faturas</h2>
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="text-left text-muted-foreground"><tr><th className="py-2">Data</th><th>Valor</th><th>Situação</th><th /></tr></thead>
            <tbody>{billing.data.invoices.map((i) => (
              <tr key={i.stripe_invoice_id} className="border-t"><td className="py-2">{formatDate(i.created_at)}</td><td>{formatBRL(i.status === "paid" ? i.amount_paid : i.amount_due, i.currency)}</td><td><StatusBadge status={i.status} /></td><td>{i.hosted_invoice_url && <a className="text-primary underline" href={i.hosted_invoice_url} target="_blank" rel="noreferrer">Ver fatura</a>}</td></tr>
            ))}</tbody>
          </table></div>
        </div>
      )}

      <AlertDialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mudar para {preview?.targetName}?</AlertDialogTitle>
            <AlertDialogDescription>
              {preview?.kind === "upgrade"
                ? `Upgrade imediato com cobrança proporcional de ${formatBRL(preview.amountDue, preview.currency)} (valor calculado pela Stripe). A diferença de créditos é concedida somente após o pagamento confirmado.`
                : `Downgrade a partir do próximo ciclo (${formatDate(preview?.effectiveAt, false)}). Você mantém o plano atual até lá.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={doChange}>Confirmar</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
