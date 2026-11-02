import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listPublicPlans } from "@/functions/account.functions";
import { adminGrantManualAccess, adminRevokeManualAccess } from "@/functions/admin.functions";
import { errorMessage, formatDate } from "@/lib/client-api";

type Grant = {
  id: string;
  expires_at: string;
  credits: number;
  reason: string;
  revoked_at: string | null;
};
export function ManualAccessPanel({
  userId,
  blocked,
  defaultPlanId,
  grants,
}: {
  userId: string;
  blocked: boolean;
  defaultPlanId: string | null | undefined;
  grants: Grant[];
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [requestId, setRequestId] = useState("");
  const [planId, setPlanId] = useState("");
  const [days, setDays] = useState("30");
  const [credits, setCredits] = useState("50");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const plans = useQuery({
    queryKey: ["public-plans"],
    queryFn: () => listPublicPlans(),
    enabled: open,
  });
  const selectedPlan =
    planId ||
    (plans.data?.some((p) => p.id === defaultPlanId) ? defaultPlanId : plans.data?.[0]?.id) ||
    "";
  const valid =
    !!selectedPlan &&
    Number.isInteger(Number(days)) &&
    Number(days) >= 1 &&
    Number(days) <= 3650 &&
    credits.trim() !== "" &&
    Number.isInteger(Number(credits)) &&
    Number(credits) >= 0 &&
    Number(credits) <= 1000000 &&
    reason.trim().length >= 3;
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["admin-subscriber", userId] });
    void qc.invalidateQueries({ queryKey: ["admin-subscribers"] });
  };
  const grant = async () => {
    if (!valid || busy) return;
    setBusy(true);
    try {
      await adminGrantManualAccess({
        data: {
          id: requestId,
          userId,
          planId: selectedPlan,
          days: Number(days),
          credits: Number(credits),
          reason,
        },
      });
      toast.success("Acesso manual liberado.");
      setOpen(false);
      setReason("");
      refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const revoke = async () => {
    if (!revokeId || busy) return;
    setBusy(true);
    try {
      await adminRevokeManualAccess({ data: { id: revokeId } });
      toast.success("Liberação manual revogada.");
      setRevokeId(null);
      refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="mt-8 rounded-3xl border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Acesso manual</h2>
          <p className="text-sm text-muted-foreground">
            Libere um período de cortesia sem exigir pagamento.
          </p>
        </div>
        <Button
          disabled={blocked || busy}
          onClick={() => {
            setRequestId(crypto.randomUUID());
            setOpen(true);
          }}
        >
          Liberar acesso manual
        </Button>
      </div>
      {blocked && (
        <p className="mt-2 text-sm text-muted-foreground">
          Desbloqueie a conta antes de liberar o acesso.
        </p>
      )}
      {grants.map((g) => (
        <div
          key={g.id}
          className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 text-sm"
        >
          <div>
            <p>
              {g.revoked_at ? "Revogado" : "Validade"}: {formatDate(g.revoked_at || g.expires_at)} ·{" "}
              {g.credits} créditos
            </p>
            <p className="text-muted-foreground">{g.reason}</p>
          </div>
          {!g.revoked_at && (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => setRevokeId(g.id)}>
              Revogar liberação
            </Button>
          )}
        </div>
      ))}
      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Liberar acesso manual</DialogTitle>
            <DialogDescription>
              O prazo começa agora. Uma nova liberação substitui a anterior e seus créditos
              restantes. Não cria pagamento ou assinatura na Stripe.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="manual-plan">Plano e recursos</Label>
              <Select value={selectedPlan} onValueChange={setPlanId}>
                <SelectTrigger id="manual-plan">
                  <SelectValue placeholder="Escolha um plano" />
                </SelectTrigger>
                <SelectContent>
                  {plans.data?.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {plans.isError && (
                <p className="text-sm text-destructive">Não foi possível carregar os planos.</p>
              )}
              {!plans.isLoading && !plans.isError && !plans.data?.length && (
                <p className="text-sm text-muted-foreground">
                  Ative um plano para liberar acesso manual.
                </p>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="manual-days">Validade em dias</Label>
                <Input
                  id="manual-days"
                  type="number"
                  min={1}
                  max={3650}
                  step={1}
                  value={days}
                  onChange={(e) => setDays(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="manual-credits">Créditos a conceder</Label>
                <Input
                  id="manual-credits"
                  type="number"
                  min={0}
                  max={1000000}
                  step={1}
                  value={credits}
                  onChange={(e) => setCredits(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="manual-reason">Motivo da liberação</Label>
              <Textarea
                id="manual-reason"
                maxLength={300}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ex.: cortesia de lançamento"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Os créditos concedidos vencem junto com este acesso. Informar zero mantém apenas o
              saldo já existente.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              disabled={busy || !valid || plans.isLoading || plans.isError}
              onClick={() => void grant()}
            >
              {busy && <Loader2 className="animate-spin" />} Confirmar liberação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!revokeId} onOpenChange={(o) => !o && !busy && setRevokeId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revogar acesso manual?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta liberação e seus créditos restantes serão encerrados. Períodos pagos ou testes
              ainda válidos continuam sujeitos às suas próprias regras.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                void revoke();
              }}
            >
              {busy && <Loader2 className="animate-spin" />} Revogar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
