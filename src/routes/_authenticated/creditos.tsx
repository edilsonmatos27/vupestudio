import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Coins, Loader2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { adminAdjustCredits, adminUserCredits, myCredits } from "@/functions/credits.functions";
import { adminListSubscribers } from "@/functions/admin.functions";
import { useMe } from "@/hooks/use-me";
import { errorMessage, formatDate, newKey } from "@/lib/client-api";
import { NO_CREDITS_MESSAGE } from "@/lib/models";

export const Route = createFileRoute("/_authenticated/creditos")({
  head: () => ({ meta: [{ title: "Créditos disponíveis — Vupe Studio" }, { name: "description", content: "Saldo, reservas e histórico de créditos." }] }),
  component: CreditsPage,
});

const SOURCE: Record<string, string> = { trial: "Teste", subscription: "Assinatura", upgrade: "Upgrade", manual: "Manual" };
const KIND: Record<string, string> = { grant: "Concessão", reserve: "Reserva", release: "Liberação", consume: "Consumo", expire: "Expiração", debit_manual: "Retirada manual" };

type CreditsData = Awaited<ReturnType<typeof adminUserCredits>>;

function CreditsView({ data }: { data: CreditsData & { nextGrant?: { at: string; amount: number } | null } }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-3xl border bg-card p-5 shadow-soft"><p className="text-sm text-muted-foreground">Disponível</p><p className="mt-1 font-display text-4xl font-bold">{data.balance.available}</p></div>
        <div className="rounded-3xl border bg-card p-5 shadow-soft"><p className="text-sm text-muted-foreground">Reservado em operações</p><p className="mt-1 font-display text-4xl font-bold">{data.balance.reserved}</p></div>
        <div className="rounded-3xl border bg-card p-5 shadow-soft">
          <p className="text-sm text-muted-foreground">Próxima concessão</p>
          <p className="mt-1 font-display text-xl font-bold">{data.nextGrant ? `${data.nextGrant.amount} em ${formatDate(data.nextGrant.at, false)}` : "—"}</p>
          <p className="text-xs text-muted-foreground">Após confirmação do pagamento da renovação.</p>
        </div>
      </div>
      {data.balance.available === 0 && <p className="rounded-2xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">{NO_CREDITS_MESSAGE}</p>}
      <div className="rounded-3xl border bg-card p-5">
        <h2 className="mb-3 text-lg font-semibold">Origem dos créditos</h2>
        {!data.buckets.length ? <p className="text-sm text-muted-foreground">Nenhuma concessão ainda.</p> : (
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="text-left text-muted-foreground"><tr><th className="py-2">Origem</th><th>Concedido</th><th>Restante</th><th>Expira</th><th>Data</th></tr></thead>
            <tbody>{data.buckets.map((b: any) => <tr key={b.id} className="border-t"><td className="py-2">{SOURCE[b.source] ?? b.source}</td><td>{b.granted}</td><td>{b.remaining}</td><td>{b.expires_at ? formatDate(b.expires_at) : "Não expira"}</td><td>{formatDate(b.created_at)}</td></tr>)}</tbody>
          </table></div>
        )}
        <p className="mt-3 text-xs text-muted-foreground">Franquias de assinatura não acumulam entre ciclos. Créditos de teste não migram para o período pago. Créditos manuais não expiram.</p>
      </div>
      <div className="rounded-3xl border bg-card p-5">
        <h2 className="mb-3 text-lg font-semibold">Histórico</h2>
        {!data.ledger.length ? <p className="text-sm text-muted-foreground">Sem movimentações.</p> : (
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="text-left text-muted-foreground"><tr><th className="py-2">Data</th><th>Tipo</th><th>Quantidade</th><th>Motivo</th></tr></thead>
            <tbody>{data.ledger.map((l: any) => <tr key={l.id} className="border-t"><td className="py-2 whitespace-nowrap">{formatDate(l.created_at)}</td><td>{KIND[l.kind] ?? l.kind}</td><td className={l.delta > 0 ? "text-success" : l.delta < 0 ? "text-destructive" : ""}>{l.delta > 0 ? `+${l.delta}` : l.delta}</td><td className="text-muted-foreground">{l.reason}</td></tr>)}</tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}

function AdminCredits() {
  const qc = useQueryClient();
  const subs = useQuery({ queryKey: ["admin-subscribers", ""], queryFn: () => adminListSubscribers({ data: {} }) });
  const [userId, setUserId] = useState<string>("");
  const data = useQuery({ queryKey: ["admin-credits", userId], queryFn: () => adminUserCredits({ data: { id: userId } }), enabled: !!userId });
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [direction, setDirection] = useState<"add" | "remove">("add");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const keyRef = useRef(newKey());

  const apply = async () => {
    const n = Number(amount);
    setBusy(true);
    try {
      await adminAdjustCredits({ data: { userId, amount: n, direction, reason, idempotencyKey: keyRef.current } });
      keyRef.current = newKey();
      toast.success(direction === "add" ? "Créditos adicionados." : "Créditos retirados.");
      setAmount("");
      setReason("");
      await qc.invalidateQueries({ queryKey: ["admin-credits", userId] });
      qc.invalidateQueries({ queryKey: ["admin-subscribers"] });
    } catch (e) {
      keyRef.current = newKey();
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  };
  const valid = userId && /^\d+$/.test(amount) && Number(amount) > 0 && reason.trim().length >= 3;

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border bg-card p-5 shadow-soft">
        <h2 className="mb-4 text-lg font-semibold">Gerenciar créditos de um assinante</h2>
        <div className="grid gap-4 md:grid-cols-[1fr_140px_140px]">
          <div className="space-y-1.5">
            <Label>Assinante</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger><SelectValue placeholder={subs.isLoading ? "Carregando…" : "Escolha"} /></SelectTrigger>
              <SelectContent>{subs.data?.map((s) => <SelectItem key={s.id} value={s.id}>{s.name || s.email} · {s.email} · {s.available} disp.</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Operação</Label>
            <Select value={direction} onValueChange={(v) => setDirection(v as "add" | "remove")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="add">Adicionar</SelectItem><SelectItem value="remove">Retirar</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Quantidade</Label><Input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} placeholder="Inteiro positivo" /></div>
          <div className="space-y-1.5 md:col-span-3"><Label>Motivo (obrigatório)</Label><Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Créditos manuais não expiram e não reativam teste vencido nem assinatura inadimplente.</p>
        <Button className="mt-4" disabled={!valid || busy} onClick={() => (direction === "remove" ? setConfirm(true) : apply())}>
          {busy && <Loader2 className="animate-spin" />} {direction === "add" ? "Adicionar créditos" : "Retirar créditos"}
        </Button>
      </div>
      {userId && (data.isLoading ? <LoadingState /> : data.error ? <ErrorState message={errorMessage(data.error)} /> : data.data && <CreditsView data={data.data} />)}
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retirar {amount} crédito(s)?</AlertDialogTitle>
            <AlertDialogDescription>A retirada só acontece se houver saldo disponível suficiente; reservas de operações em andamento não podem ser retiradas.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={apply}>Confirmar retirada</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CreditsPage() {
  const { data: me } = useMe();
  const q = useQuery({ queryKey: ["my-credits"], queryFn: () => myCredits(), enabled: !!me && !me.isAdmin });
  return (
    <div>
      <PageHeader title="Créditos disponíveis" description="Cada imagem gerada, editada ou variada com sucesso consome 1 crédito. Vetorização não consome créditos." />
      {!me ? <LoadingState /> : me.isAdmin ? <AdminCredits /> : q.isLoading ? <LoadingState /> : q.error ? <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} /> : q.data ? <CreditsView data={q.data} /> : <EmptyState icon={<Coins className="size-5" />} title="Sem dados" />}
    </div>
  );
}
