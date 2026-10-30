import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Loader2, Pencil, Plus, RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState, ErrorState, LoadingState, PageHeader, StatusBadge } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { adminListPlans, adminReorderPlans, adminSavePlan, adminSetPlanStatus, adminSyncPlanStripe } from "@/server/plans.functions";
import { errorMessage, formatBRL } from "@/lib/client-api";
import { FEATURES, MODEL_CATALOG } from "@/lib/models";

export const Route = createFileRoute("/_authenticated/admin/planos")({
  head: () => ({ meta: [{ title: "Planos (admin) — Vupe Studio" }, { name: "description", content: "Criação e gestão de planos." }] }),
  component: AdminPlans,
});

type Form = {
  id?: string; name: string; description: string; price: string; billing_interval: "month" | "year"; credits_per_cycle: string;
  allowed_features: string[]; allowed_models: string[]; max_batch: number; highlight: boolean;
  trial_custom: boolean; trial_enabled: boolean; trial_minutes: string; trial_credits: string;
};

const blank: Form = { name: "", description: "", price: "", billing_interval: "month", credits_per_cycle: "50", allowed_features: FEATURES.map((f) => f.id), allowed_models: [], max_batch: 1, highlight: false, trial_custom: false, trial_enabled: true, trial_minutes: "4320", trial_credits: "10" };

function AdminPlans() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-plans"], queryFn: () => adminListPlans() });
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-plans"] });
    qc.invalidateQueries({ queryKey: ["public-plans"] });
  };

  const openEdit = (p?: any) => {
    if (!p) return setForm({ ...blank });
    const t = p.trial_override as any;
    setForm({
      id: p.id, name: p.name, description: p.description, price: p.price_cents === null ? "" : (p.price_cents / 100).toFixed(2).replace(".", ","),
      billing_interval: p.billing_interval, credits_per_cycle: String(p.credits_per_cycle), allowed_features: p.allowed_features, allowed_models: p.allowed_models,
      max_batch: p.max_batch, highlight: p.highlight, trial_custom: !!t, trial_enabled: t?.enabled ?? true, trial_minutes: String(t?.duration_minutes ?? 4320), trial_credits: String(t?.credits ?? 10),
    });
  };

  const save = async () => {
    if (!form) return;
    const priceStr = form.price.trim().replace(/\./g, "").replace(",", ".");
    const price = priceStr === "" ? null : Math.round(Number(priceStr) * 100);
    if (price !== null && (!Number.isFinite(price) || price < 0)) { toast.error("Preço inválido."); return; }
    setBusy("save");
    try {
      const r = await adminSavePlan({
        data: {
          id: form.id, name: form.name, description: form.description, price_cents: price, billing_interval: form.billing_interval,
          credits_per_cycle: Number(form.credits_per_cycle) || 0, allowed_features: form.allowed_features, allowed_models: form.allowed_models,
          max_batch: form.max_batch, highlight: form.highlight,
          trial_override: form.trial_custom ? { enabled: form.trial_enabled, duration_minutes: Number(form.trial_minutes) || 0, credits: Number(form.trial_credits) || 0 } : null,
        },
      });
      toast.success(r.priceChanged ? "Plano salvo. O preço mudou: publique um novo preço na Stripe (contratos atuais mantêm o preço antigo)." : "Plano salvo.");
      setForm(null);
      refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const setStatus = async (id: string, status: "draft" | "active" | "inactive") => {
    setBusy(id + status);
    try {
      await adminSetPlanStatus({ data: { id, status } });
      toast.success(status === "active" ? "Plano ativado." : status === "inactive" ? "Plano desativado: novas adesões bloqueadas; assinaturas atuais continuam." : "Plano voltou a rascunho.");
      refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  const sync = async (id: string) => {
    setBusy(id + "sync");
    try {
      const r = await adminSyncPlanStripe({ data: { id } });
      toast.success(`Preço publicado na Stripe (${r.mode === "test" ? "teste" : "produção"}).`);
      refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  const move = async (idx: number, dir: -1 | 1) => {
    const ids = q.data!.plans.map((p) => p.id);
    const j = idx + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[idx], ids[j]] = [ids[j]!, ids[idx]!];
    setBusy("order");
    try {
      await adminReorderPlans({ data: { ids } });
      refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <PageHeader title="Planos" description="Rascunhos não aparecem no cadastro. O checkout só é liberado quando o preço está publicado na Stripe do ambiente ativo." actions={<Button onClick={() => openEdit()}><Plus /> Novo plano</Button>} />
      {q.isLoading ? <LoadingState /> : q.error ? <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} /> : !q.data?.plans.length ? <EmptyState title="Nenhum plano" /> : (
        <div className="space-y-3">
          {q.data.plans.map((p, i) => {
            const priceId = q.data.mode === "test" ? p.stripe_price_id_test : p.stripe_price_id_live;
            return (
              <div key={p.id} className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-4 shadow-soft">
                <div className="flex flex-col">
                  <Button size="icon" variant="ghost" className="size-7" disabled={i === 0 || busy === "order"} onClick={() => move(i, -1)} aria-label="Subir"><ArrowUp /></Button>
                  <Button size="icon" variant="ghost" className="size-7" disabled={i === q.data.plans.length - 1 || busy === "order"} onClick={() => move(i, 1)} aria-label="Descer"><ArrowDown /></Button>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{p.name} {p.highlight && <span className="text-xs text-primary">· destaque</span>}</p>
                  <p className="text-sm text-muted-foreground">{formatBRL(p.price_cents)}/{p.billing_interval === "month" ? "mês" : "ano"} · {p.credits_per_cycle} créditos · lote até {p.max_batch}</p>
                  <p className="text-xs text-muted-foreground">Stripe ({q.data.mode === "test" ? "teste" : "produção"}): {priceId ? `preço ${priceId}` : "sem preço publicado — checkout indisponível"}</p>
                </div>
                <StatusBadge status={p.status} />
                <Button size="sm" variant="outline" onClick={() => sync(p.id)} disabled={busy === p.id + "sync"}>{busy === p.id + "sync" ? <Loader2 className="animate-spin" /> : <RefreshCw />} Publicar preço na Stripe</Button>
                {p.status !== "active" && <Button size="sm" onClick={() => setStatus(p.id, "active")} disabled={busy === p.id + "active"}>{busy === p.id + "active" && <Loader2 className="animate-spin" />} Ativar</Button>}
                {p.status === "active" && <Button size="sm" variant="outline" onClick={() => setStatus(p.id, "inactive")} disabled={busy === p.id + "inactive"}>{busy === p.id + "inactive" && <Loader2 className="animate-spin" />} Desativar</Button>}
                {p.status === "inactive" && <Button size="sm" variant="ghost" onClick={() => setStatus(p.id, "draft")}>Rascunho</Button>}
                <Button size="icon" variant="ghost" onClick={() => openEdit(p)} aria-label="Editar"><Pencil /></Button>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle>{form?.id ? "Editar plano" : "Novo plano (rascunho)"}</DialogTitle></DialogHeader>
          {form && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2"><Label>Nome</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="space-y-1.5 sm:col-span-2"><Label>Descrição</Label><Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Preço (R$)</Label><Input value={form.price} placeholder="Ex.: 49,90 (vazio = a definir)" onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Intervalo</Label>
                <Select value={form.billing_interval} onValueChange={(v) => setForm({ ...form, billing_interval: v as "month" | "year" })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="month">Mensal</SelectItem><SelectItem value="year">Anual</SelectItem></SelectContent></Select>
              </div>
              <div className="space-y-1.5"><Label>Créditos por ciclo</Label><Input inputMode="numeric" value={form.credits_per_cycle} onChange={(e) => setForm({ ...form, credits_per_cycle: e.target.value.replace(/\D/g, "") })} /></div>
              <div className="space-y-1.5"><Label>Limite de lote</Label>
                <Select value={String(form.max_batch)} onValueChange={(v) => setForm({ ...form, max_batch: Number(v) })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{[1, 2, 3].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent></Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2"><Label>Recursos permitidos</Label>
                <div className="flex flex-wrap gap-3">{FEATURES.map((f) => (
                  <label key={f.id} className="flex items-center gap-2 text-sm"><Checkbox checked={form.allowed_features.includes(f.id)} onCheckedChange={(c) => setForm({ ...form, allowed_features: c ? [...form.allowed_features, f.id] : form.allowed_features.filter((x) => x !== f.id) })} />{f.label}</label>
                ))}</div>
              </div>
              <div className="space-y-1.5 sm:col-span-2"><Label>Modelos permitidos (nenhum = todos os ativos)</Label>
                <div className="flex flex-wrap gap-3">{MODEL_CATALOG.map((m) => (
                  <label key={m.id} className="flex items-center gap-2 text-sm"><Checkbox checked={form.allowed_models.includes(m.id)} onCheckedChange={(c) => setForm({ ...form, allowed_models: c ? [...form.allowed_models, m.id] : form.allowed_models.filter((x) => x !== m.id) })} />{m.label}</label>
                ))}</div>
              </div>
              <label className="flex items-center justify-between rounded-xl border px-3 py-2 text-sm sm:col-span-2">Destaque comercial<Switch checked={form.highlight} onCheckedChange={(v) => setForm({ ...form, highlight: v })} /></label>
              <label className="flex items-center justify-between rounded-xl border px-3 py-2 text-sm sm:col-span-2">Condições de teste próprias deste plano<Switch checked={form.trial_custom} onCheckedChange={(v) => setForm({ ...form, trial_custom: v })} /></label>
              {form.trial_custom && (
                <>
                  <label className="flex items-center justify-between rounded-xl border px-3 py-2 text-sm">Teste habilitado<Switch checked={form.trial_enabled} onCheckedChange={(v) => setForm({ ...form, trial_enabled: v })} /></label>
                  <div className="space-y-1.5"><Label>Duração (minutos)</Label><Input inputMode="numeric" value={form.trial_minutes} onChange={(e) => setForm({ ...form, trial_minutes: e.target.value.replace(/\D/g, "") })} /><p className="text-xs text-muted-foreground">60 = 1 hora · 1440 = 1 dia</p></div>
                  <div className="space-y-1.5"><Label>Créditos de teste</Label><Input inputMode="numeric" value={form.trial_credits} onChange={(e) => setForm({ ...form, trial_credits: e.target.value.replace(/\D/g, "") })} /></div>
                </>
              )}
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setForm(null)}>Cancelar</Button><Button onClick={save} disabled={busy === "save" || !form?.name.trim()}>{busy === "save" && <Loader2 className="animate-spin" />} Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
