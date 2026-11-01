import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Copy, ImagePlus, Loader2, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ErrorState, LoadingState, PageHeader } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  adminCheckCatalog,
  adminGetSettings,
  adminGetStripe,
  adminListAudit,
  adminRecentEvents,
  adminReconcile,
  adminRemoveStripeField,
  adminSaveAi,
  adminSaveBranding,
  adminSaveStripe,
  adminSaveTrial,
  adminSetStripeMode,
  adminTestStripe,
} from "@/functions/admin.functions";
import {
  errorMessage,
  formatDate,
  formatDuration,
  uploadMedia,
  validateImageFile,
} from "@/lib/client-api";
import { FEATURES, MODEL_CATALOG } from "@/lib/models";

export const Route = createFileRoute("/_authenticated/admin/configuracoes")({
  head: () => ({
    meta: [
      { title: "Administração — Vupe Studio" },
      { name: "description", content: "Configurações do Vupe Studio." },
    ],
  }),
  component: AdminSettings,
});

const PUBLISHED_ORIGIN = "https://project--de761328-28cd-472d-a4a9-e2d27dd926a4.lovable.app";
const EVENTS = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "invoice.paid",
  "invoice.payment_failed",
  "invoice.payment_action_required",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "charge.refunded",
  "charge.dispute.created",
];

function useSettings() {
  return useQuery({ queryKey: ["admin-settings"], queryFn: () => adminGetSettings() });
}

function Branding() {
  const qc = useQueryClient();
  const s = useSettings();
  const [form, setForm] = useState({
    display_name: "",
    logo_url: null as string | null,
    favicon_url: null as string | null,
  });
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    if (s.data?.branding)
      setForm({
        display_name: s.data.branding.display_name,
        logo_url: s.data.branding.logo_url,
        favicon_url: s.data.branding.favicon_url,
      });
  }, [s.data?.branding]);
  const upload = async (field: "logo_url" | "favicon_url", f?: File) => {
    if (!f) return;
    const err = validateImageFile(f);
    if (err) {
      toast.error(err);
      return;
    }
    setBusy(field);
    try {
      setForm((x) => ({ ...x, [field]: null }));
      const url = await uploadMedia(f);
      setForm((x) => ({ ...x, [field]: url }));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  const save = async () => {
    setBusy("save");
    try {
      await adminSaveBranding({ data: form });
      toast.success("Identidade visual salva.");
      qc.invalidateQueries({ queryKey: ["branding"] });
      qc.invalidateQueries({ queryKey: ["admin-settings"] });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  if (s.isLoading) return <LoadingState />;
  return (
    <div className="max-w-xl space-y-5 rounded-3xl border bg-card p-6">
      <div className="space-y-1.5">
        <Label>Nome exibido</Label>
        <Input
          value={form.display_name}
          maxLength={60}
          onChange={(e) => setForm({ ...form, display_name: e.target.value })}
        />
      </div>
      {(["logo_url", "favicon_url"] as const).map((f) => (
        <div key={f} className="space-y-1.5">
          <Label>{f === "logo_url" ? "Logo" : "Favicon"}</Label>
          <div className="flex items-center gap-3">
            <div className="flex size-14 items-center justify-center overflow-hidden rounded-xl border bg-checker">
              {form[f] && <img src={form[f]!} alt="" className="size-full object-contain" />}
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold">
              {busy === f ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ImagePlus className="size-4" />
              )}{" "}
              Enviar
              <input
                type="file"
                className="hidden"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => {
                  upload(f, e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
            {form[f] && (
              <Button variant="ghost" size="sm" onClick={() => setForm({ ...form, [f]: null })}>
                Remover
              </Button>
            )}
          </div>
        </div>
      ))}
      <Button onClick={save} disabled={busy === "save" || !form.display_name.trim()}>
        {busy === "save" && <Loader2 className="animate-spin" />} Salvar
      </Button>
    </div>
  );
}

function Trial() {
  const qc = useQueryClient();
  const s = useSettings();
  const [f, setF] = useState<{
    trial_enabled: boolean;
    amount: string;
    unit: "minutes" | "hours" | "days";
    trial_credits: string;
    trial_features: string[];
    trial_models: string[];
  } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!s.data) return;
    const m = s.data.settings.trial_duration_minutes;
    const unit = m % 1440 === 0 && m > 0 ? "days" : m % 60 === 0 && m > 0 ? "hours" : "minutes";
    setF({
      trial_enabled: s.data.settings.trial_enabled,
      amount: String(unit === "days" ? m / 1440 : unit === "hours" ? m / 60 : m),
      unit,
      trial_credits: String(s.data.settings.trial_credits),
      trial_features: s.data.settings.trial_features,
      trial_models: s.data.settings.trial_models,
    });
  }, [s.data]);
  if (!f) return <LoadingState />;
  const minutes =
    (Number(f.amount) || 0) * (f.unit === "days" ? 1440 : f.unit === "hours" ? 60 : 1);
  const save = async () => {
    setBusy(true);
    try {
      await adminSaveTrial({
        data: {
          trial_enabled: f.trial_enabled,
          trial_duration_minutes: minutes,
          trial_credits: Number(f.trial_credits) || 0,
          trial_features: f.trial_features,
          trial_models: f.trial_models,
        },
      });
      toast.success("Condições de teste salvas. Testes já iniciados não são alterados.");
      qc.invalidateQueries({ queryKey: ["admin-settings"] });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="max-w-2xl space-y-5 rounded-3xl border bg-card p-6">
      <label className="flex items-center justify-between rounded-xl border px-3 py-2 text-sm">
        Teste gratuito habilitado
        <Switch
          checked={f.trial_enabled}
          onCheckedChange={(v) => setF({ ...f, trial_enabled: v })}
        />
      </label>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Duração</Label>
          <Input
            inputMode="numeric"
            value={f.amount}
            onChange={(e) => setF({ ...f, amount: e.target.value.replace(/\D/g, "") })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Unidade</Label>
          <Select value={f.unit} onValueChange={(v) => setF({ ...f, unit: v as typeof f.unit })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="minutes">Minutos</SelectItem>
              <SelectItem value="hours">Horas</SelectItem>
              <SelectItem value="days">Dias</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Créditos de teste</Label>
          <Input
            inputMode="numeric"
            value={f.trial_credits}
            onChange={(e) => setF({ ...f, trial_credits: e.target.value.replace(/\D/g, "") })}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Equivale a {formatDuration(minutes)}. Com teste desativado ou duração zero, o uso exige
        pagamento confirmado.
      </p>
      <div className="space-y-1.5">
        <Label>Recursos no teste</Label>
        <div className="flex flex-wrap gap-3">
          {FEATURES.map((x) => (
            <label key={x.id} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={f.trial_features.includes(x.id)}
                onCheckedChange={(c) =>
                  setF({
                    ...f,
                    trial_features: c
                      ? [...f.trial_features, x.id]
                      : f.trial_features.filter((y) => y !== x.id),
                  })
                }
              />
              {x.label}
            </label>
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Modelos no teste (nenhum = todos os ativos)</Label>
        <div className="flex flex-wrap gap-3">
          {MODEL_CATALOG.map((m) => (
            <label key={m.id} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={f.trial_models.includes(m.id)}
                onCheckedChange={(c) =>
                  setF({
                    ...f,
                    trial_models: c
                      ? [...f.trial_models, m.id]
                      : f.trial_models.filter((y) => y !== m.id),
                  })
                }
              />
              {m.label}
            </label>
          ))}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Cada conta recebe o teste uma única vez, na confirmação do e-mail, com um registro das
        condições daquele momento. Exceções por plano ficam na edição do plano.
      </p>
      <Button onClick={save} disabled={busy}>
        {busy && <Loader2 className="animate-spin" />} Salvar
      </Button>
    </div>
  );
}

function Ai() {
  const qc = useQueryClient();
  const s = useSettings();
  const [models, setModels] = useState<Record<string, { enabled: boolean }>>({});
  const [defaults, setDefaults] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [catalog, setCatalog] = useState<{
    ok: boolean;
    available: string[];
    error?: string;
    checkedAt: string;
  } | null>(null);
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    if (!s.data) return;
    setModels(s.data.settings.ai_models as Record<string, { enabled: boolean }>);
    setDefaults(s.data.settings.ai_defaults as Record<string, string>);
  }, [s.data]);
  const save = async () => {
    setBusy(true);
    try {
      await adminSaveAi({ data: { ai_models: models, ai_defaults: defaults } });
      toast.success("Configurações de IA salvas.");
      qc.invalidateQueries({ queryKey: ["admin-settings"] });
      qc.invalidateQueries({ queryKey: ["studio-options"] });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const check = async () => {
    setChecking(true);
    try {
      setCatalog(await adminCheckCatalog());
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setChecking(false);
    }
  };
  const enabled = MODEL_CATALOG.filter((m) => models[m.id]?.enabled);
  return (
    <div className="space-y-5">
      <div className="rounded-3xl border bg-card p-6">
        <h3 className="font-semibold">Configurações de IA gerenciada</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          As chamadas são feitas somente pelo servidor, pela integração Lovable AI do projeto. Não
          há campos de chave OpenAI ou Google. O uso é cobrado dos créditos do workspace Lovable
          (Settings → Plans & credits), separado dos créditos comerciais dos assinantes.
        </p>
        <Button className="mt-3" variant="outline" size="sm" onClick={check} disabled={checking}>
          {checking && <Loader2 className="animate-spin" />} Consultar disponibilidade no catálogo
        </Button>
        {catalog && (
          <p className="mt-2 text-xs text-muted-foreground">
            {catalog.ok
              ? `Consultado em ${formatDate(catalog.checkedAt)}: ${catalog.available.length} modelos de imagem disponíveis.`
              : `Falha: ${catalog.error}`}
          </p>
        )}
      </div>
      <div className="overflow-hidden rounded-3xl border bg-card">
        {MODEL_CATALOG.map((m) => {
          const avail = catalog ? catalog.available.includes(m.id) : null;
          return (
            <div
              key={m.id}
              className="flex flex-wrap items-center gap-3 border-b p-4 last:border-0"
            >
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {m.label}{" "}
                  <span className="text-xs font-normal text-muted-foreground">
                    {m.id} · versão {m.version}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {m.family} ·{" "}
                  {m.aspects.length ? `proporções ${m.aspects.join(", ")}` : "proporção automática"}
                  {m.qualities.length ? " · qualidade configurável" : ""}
                  {m.transparency ? " · fundo transparente" : ""}
                  {m.note ? ` · ${m.note}` : ""}
                </p>
              </div>
              {avail !== null &&
                (avail ? (
                  <span className="flex items-center gap-1 text-xs text-success">
                    <CheckCircle2 className="size-3.5" /> disponível
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-destructive">
                    <XCircle className="size-3.5" /> indisponível
                  </span>
                ))}
              <Switch
                checked={!!models[m.id]?.enabled}
                onCheckedChange={(v) => setModels({ ...models, [m.id]: { enabled: v } })}
                aria-label={`Ativar ${m.label}`}
              />
            </div>
          );
        })}
      </div>
      <div className="grid gap-4 rounded-3xl border bg-card p-6 sm:grid-cols-2">
        {(["edit", "compose", "variation"] as const).map((t) => (
          <div key={t} className="space-y-1.5">
            <Label>Padrão para {FEATURES.find((f) => f.id === t)?.label}</Label>
            <Select
              value={defaults[t] ?? ""}
              onValueChange={(v) => setDefaults({ ...defaults, [t]: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Escolha" />
              </SelectTrigger>
              <SelectContent>
                {enabled.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
        <p className="text-xs text-muted-foreground sm:col-span-2">
          Restrições por plano são definidas na edição de cada plano.
        </p>
      </div>
      <Button onClick={save} disabled={busy}>
        {busy && <Loader2 className="animate-spin" />} Salvar
      </Button>
    </div>
  );
}

function Stripe() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-stripe"], queryFn: () => adminGetStripe() });
  const events = useQuery({
    queryKey: ["admin-stripe-events"],
    queryFn: () => adminRecentEvents(),
  });
  const [mode, setMode] = useState<"test" | "live">("test");
  const [form, setForm] = useState({ publishable_key: "", secret_key: "", webhook_secret: "" });
  const [busy, setBusy] = useState<string | null>(null);
  const [remove, setRemove] = useState<{
    field: "secret_key" | "webhook_secret" | "publishable_key";
    reason: string;
  } | null>(null);
  const [modeDialog, setModeDialog] = useState<{ mode: "test" | "live"; reason: string } | null>(
    null,
  );
  useEffect(() => {
    if (q.data) setMode(q.data.mode as "test" | "live");
  }, [q.data?.mode]);
  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  const c = q.data!.credentials[mode] ?? {};
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-stripe"] });
  const webhookUrl = `${PUBLISHED_ORIGIN}/api/public/stripe/webhook/${mode}`;

  const save = async () => {
    setBusy("save");
    try {
      await adminSaveStripe({
        data: {
          mode,
          publishable_key: form.publishable_key || undefined,
          secret_key: form.secret_key || undefined,
          webhook_secret: form.webhook_secret || undefined,
        },
      });
      toast.success("Credenciais salvas.");
      setForm({ publishable_key: "", secret_key: "", webhook_secret: "" });
      refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  const test = async () => {
    setBusy("test");
    try {
      const r = await adminTestStripe({ data: { mode } });
      if (r.ok) toast.success("Autenticação da API validada.");
      else toast.error(`Falha: ${r.error}`);
      refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  const doRemove = async () => {
    if (!remove) return;
    setBusy("remove");
    try {
      await adminRemoveStripeField({ data: { mode, field: remove.field, reason: remove.reason } });
      toast.success("Removido.");
      setRemove(null);
      refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  const doMode = async () => {
    if (!modeDialog) return;
    setBusy("mode");
    try {
      await adminSetStripeMode({ data: modeDialog });
      toast.success("Ambiente ativo alterado.");
      setModeDialog(null);
      qc.invalidateQueries();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  const Check = ({
    ok,
    label,
    detail,
  }: {
    ok: boolean;
    label: string;
    detail?: string | undefined;
  }) => (
    <div className="flex items-start gap-2 text-sm">
      {ok ? (
        <CheckCircle2 className="mt-0.5 size-4 text-success" />
      ) : (
        <XCircle className="mt-0.5 size-4 text-muted-foreground" />
      )}
      <div>
        <p className="font-medium">{label}</p>
        {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 rounded-3xl border bg-card p-5">
        <p className="text-sm">
          Ambiente ativo da aplicação: <b>{q.data!.mode === "test" ? "Teste" : "Produção"}</b>
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            setModeDialog({ mode: q.data!.mode === "test" ? "live" : "test", reason: "" })
          }
        >
          Mudar para {q.data!.mode === "test" ? "produção" : "teste"}
        </Button>
        <div className="ml-auto flex items-center gap-2 text-sm">
          Editando credenciais de:
          <Select value={mode} onValueChange={(v) => setMode(v as "test" | "live")}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="test">Teste</SelectItem>
              <SelectItem value="live">Produção</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-4 rounded-3xl border bg-card p-6">
          <h3 className="font-semibold">Credenciais ({mode === "test" ? "teste" : "produção"})</h3>
          <p className="text-xs text-muted-foreground">
            Campos vazios mantêm o valor atual. Segredos são cifrados no servidor e nunca voltam ao
            navegador.
          </p>
          {(
            [
              [
                "publishable_key",
                "Chave publicável",
                c.publishable_key ? `${String(c.publishable_key).slice(0, 12)}…` : null,
                `pk_${mode}_…`,
              ],
              ["secret_key", "Chave secreta", c.secret_key_hint, `sk_${mode}_… ou rk_${mode}_…`],
              ["webhook_secret", "Segredo do webhook", c.webhook_secret_hint, "whsec_…"],
            ] as const
          ).map(([k, label, current, ph]) => (
            <div key={k} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>{label}</Label>
                {current && (
                  <button
                    className="text-xs text-destructive"
                    onClick={() => setRemove({ field: k, reason: "" })}
                  >
                    Remover
                  </button>
                )}
              </div>
              <Input
                type={k === "publishable_key" ? "text" : "password"}
                autoComplete="off"
                placeholder={current ? `Salvo: ${current} — preencha para substituir` : ph}
                value={form[k]}
                onChange={(e) => setForm({ ...form, [k]: e.target.value })}
              />
            </div>
          ))}
          <div className="flex gap-2">
            <Button
              onClick={save}
              disabled={
                busy === "save" ||
                (!form.publishable_key && !form.secret_key && !form.webhook_secret)
              }
            >
              {busy === "save" && <Loader2 className="animate-spin" />} Salvar credenciais
            </Button>
            <Button variant="outline" onClick={test} disabled={busy === "test" || !c.has_secret}>
              {busy === "test" && <Loader2 className="animate-spin" />} Testar conexão
            </Button>
          </div>
        </div>
        <div className="space-y-4 rounded-3xl border bg-card p-6">
          <h3 className="font-semibold">Status</h3>
          <Check
            ok={!!c.has_secret && !!c.publishable_key}
            label="Credenciais salvas"
            detail={c.updated_at ? `Atualizado ${formatDate(c.updated_at)}` : undefined}
          />
          <Check
            ok={c.api_status === "ok"}
            label="Autenticação da API validada"
            detail={
              c.api_tested_at
                ? `Último teste ${formatDate(c.api_tested_at)}${c.api_status === "error" ? ` · erro: ${c.api_error}` : ""}`
                : "Ainda não testado"
            }
          />
          <Check
            ok={!!c.webhook_validated_at}
            label="Recebimento de webhook validado"
            detail={
              c.webhook_validated_at
                ? `Último evento assinado legítimo ${formatDate(c.webhook_validated_at)}`
                : "Nenhum evento assinado recebido. Um teste de API não comprova o webhook."
            }
          />
          <div className="rounded-xl bg-secondary p-3 text-sm">
            <p className="font-medium">URL do webhook</p>
            <div className="mt-1 flex items-center gap-2">
              <code className="flex-1 break-all text-xs">{webhookUrl}</code>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => {
                  navigator.clipboard.writeText(webhookUrl);
                  toast.success("Copiado.");
                }}
                aria-label="Copiar"
              >
                <Copy />
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Funciona depois de publicar o app. No painel da Stripe (
              {mode === "test" ? "modo teste" : "modo produção"}) → Desenvolvedores → Webhooks →
              Adicionar endpoint, cole a URL e selecione os eventos:
            </p>
            <ul className="mt-1 list-inside list-disc text-xs text-muted-foreground">
              {EVENTS.map((e) => (
                <li key={e}>
                  <code>{e}</code>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">
              Copie o “Signing secret” (whsec_…) para o campo Segredo do webhook. Para o portal do
              cliente, salve a configuração padrão em Configurações → Billing → Customer portal.
            </p>
          </div>
        </div>
      </div>
      <div className="rounded-3xl border bg-card p-5">
        <h3 className="mb-2 font-semibold">Eventos recebidos</h3>
        {!events.data?.length ? (
          <p className="text-sm text-muted-foreground">Nenhum evento recebido ainda.</p>
        ) : (
          events.data.map((e) => (
            <p key={e.id} className="text-xs text-muted-foreground">
              {formatDate(e.received_at)} · {e.mode} · {e.type} · <b>{e.status}</b>
              {e.error ? ` · ${e.error}` : ""}
            </p>
          ))
        )}
      </div>
      <Dialog open={!!remove} onOpenChange={(o) => !o && setRemove(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remover credencial</DialogTitle>
            <DialogDescription>
              A remoção é registrada na auditoria. Informe o motivo.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={remove?.reason ?? ""}
            onChange={(e) => setRemove(remove && { ...remove, reason: e.target.value })}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemove(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={doRemove}
              disabled={busy === "remove" || (remove?.reason.trim().length ?? 0) < 3}
            >
              Remover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!modeDialog} onOpenChange={(o) => !o && setModeDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Mudar ambiente para {modeDialog?.mode === "live" ? "produção" : "teste"}?
            </DialogTitle>
            <DialogDescription>
              Assinaturas, faturas e preços de cada ambiente são separados. Assinaturas do outro
              ambiente deixam de valer para acesso. Informe o motivo.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={modeDialog?.reason ?? ""}
            onChange={(e) => setModeDialog(modeDialog && { ...modeDialog, reason: e.target.value })}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setModeDialog(null)}>
              Cancelar
            </Button>
            <Button
              onClick={doMode}
              disabled={busy === "mode" || (modeDialog?.reason.trim().length ?? 0) < 3}
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Operations() {
  const audit = useQuery({ queryKey: ["admin-audit"], queryFn: () => adminListAudit() });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    try {
      const r = await adminReconcile();
      setResult(
        `${r.synced} assinatura(s) sincronizada(s), ${r.purged} arquivo(s) excluído(s) removido(s) do armazenamento${r.errors.length ? `, ${r.errors.length} erro(s): ${r.errors.slice(0, 2).join(" | ")}` : ""}.`,
      );
      audit.refetch();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-5">
      <div className="rounded-3xl border bg-card p-6">
        <h3 className="font-semibold">Reconciliação</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Recupera divergências entre Stripe e banco, finaliza operações interrompidas (liberando
          reservas sem cobrança) e conclui limpezas pendentes de arquivos. Uma rotina automática de
          hora em hora trata operações interrompidas.
        </p>
        <Button className="mt-3" onClick={run} disabled={busy}>
          {busy && <Loader2 className="animate-spin" />} Reconciliar agora
        </Button>
        {result && <p className="mt-2 text-sm">{result}</p>}
      </div>
      <div className="rounded-3xl border bg-card p-5">
        <h3 className="mb-2 font-semibold">Auditoria</h3>
        {audit.isLoading ? (
          <LoadingState />
        ) : !audit.data?.length ? (
          <p className="text-sm text-muted-foreground">Sem registros.</p>
        ) : (
          <div className="max-h-[480px] overflow-auto">
            <table className="w-full text-xs">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-1">Data</th>
                  <th>Ação</th>
                  <th>Alvo</th>
                  <th>Motivo</th>
                  <th>Resultado</th>
                </tr>
              </thead>
              <tbody>
                {audit.data.map((a) => (
                  <tr key={a.id} className="border-t">
                    <td className="py-1 whitespace-nowrap">{formatDate(a.created_at)}</td>
                    <td>{a.action}</td>
                    <td>{a.target_type ? `${a.target_type}:${a.target_id?.slice(0, 8)}` : "—"}</td>
                    <td>{a.reason ?? ""}</td>
                    <td>{a.result}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function AdminSettings() {
  return (
    <div>
      <PageHeader
        title="Administração"
        description="Identidade visual, teste, Stripe, IA gerenciada, operação e auditoria."
      />
      <Tabs defaultValue="branding">
        <TabsList className="mb-5 flex h-auto flex-wrap">
          <TabsTrigger value="branding">Identidade</TabsTrigger>
          <TabsTrigger value="trial">Teste</TabsTrigger>
          <TabsTrigger value="stripe">Stripe</TabsTrigger>
          <TabsTrigger value="ai">IA gerenciada</TabsTrigger>
          <TabsTrigger value="ops">Operação e auditoria</TabsTrigger>
        </TabsList>
        <TabsContent value="branding">
          <Branding />
        </TabsContent>
        <TabsContent value="trial">
          <Trial />
        </TabsContent>
        <TabsContent value="stripe">
          <Stripe />
        </TabsContent>
        <TabsContent value="ai">
          <Ai />
        </TabsContent>
        <TabsContent value="ops">
          <Operations />
        </TabsContent>
      </Tabs>
    </div>
  );
}
