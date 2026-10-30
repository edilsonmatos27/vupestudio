import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Bot, Info, Loader2, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UploadZone } from "@/components/upload-zone";
import { OperationCard, type Op } from "@/components/operation-card";
import { ErrorState, LoadingState, PageHeader } from "@/components/states";
import {
  createOperation,
  getOperation,
  runItem,
  studioOptions,
  assetDownloadUrl,
} from "@/functions/studio.functions";
import { listMyAgents } from "@/functions/agents.functions";
import { errorMessage, newKey, type UploadedAsset } from "@/lib/client-api";
import { UPLOAD_LIMITS, type Task } from "@/lib/models";
import { useMe } from "@/hooks/use-me";

type Mode = "invent" | "create";

export function Workbench({
  mode,
  agentId,
  sourceAssetId,
  initialTask,
}: {
  mode: Mode;
  agentId?: string | undefined;
  sourceAssetId?: string | undefined;
  initialTask?: "edit" | "compose" | "variation" | undefined;
}) {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const opts = useQuery({ queryKey: ["studio-options"], queryFn: () => studioOptions() });
  const agents = useQuery({ queryKey: ["my-agents"], queryFn: () => listMyAgents() });
  const [task, setTask] = useState<Task>(mode === "invent" ? "invent" : (initialTask ?? "edit"));
  const [model, setModel] = useState("");
  const [agent, setAgent] = useState<string>(agentId ?? "none");
  const [instructions, setInstructions] = useState("");
  const [aspect, setAspect] = useState<string>("");
  const [quality, setQuality] = useState<string>("");
  const [transparent, setTransparent] = useState(false);
  const [count, setCount] = useState(1);
  const [project, setProject] = useState<string>("none");
  const [main, setMain] = useState<UploadedAsset[]>([]);
  const [style, setStyle] = useState<UploadedAsset[]>([]);
  const [element, setElement] = useState<UploadedAsset[]>([]);
  const [logo, setLogo] = useState<UploadedAsset[]>([]);
  const [source, setSource] = useState<UploadedAsset | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [opId, setOpId] = useState<string | null>(null);
  const keyRef = useRef(newKey());

  const op = useQuery({
    queryKey: ["operation", opId],
    queryFn: () => getOperation({ data: { id: opId! } }),
    enabled: !!opId,
    refetchInterval: (q) =>
      q.state.data && ["queued", "running"].includes((q.state.data as Op).status) ? 3000 : false,
  });

  // Prefill source from an existing result
  useEffect(() => {
    if (!sourceAssetId) return;
    assetDownloadUrl({ data: { id: sourceAssetId } })
      .then(({ url, filename }) => {
        const a = { id: sourceAssetId, url, filename, mime: "image/png" };
        if (initialTask === "variation") setSource(a);
        else setMain([a]);
      })
      .catch(() => toast.error("Não foi possível carregar a imagem de origem."));
  }, [sourceAssetId, initialTask]);

  const models = useMemo(
    () => (opts.data?.models ?? []).filter((m) => m.tasks.includes(task)),
    [opts.data, task],
  );
  const current = models.find((m) => m.id === model);

  useEffect(() => {
    if (!opts.data) return;
    if (!models.some((m) => m.id === model)) {
      const def = opts.data.defaults[task];
      setModel(models.find((m) => m.id === def)?.id ?? models[0]?.id ?? "");
    }
  }, [opts.data, models, task, model]);
  useEffect(() => {
    if (current && aspect && current.aspects.length && !current.aspects.includes(aspect))
      setAspect("");
    if (current && quality && !current.qualities.includes(quality)) setQuality("");
    if (current && !current.transparency) setTransparent(false);
  }, [current, aspect, quality]);

  const visibleAgents = (agents.data ?? []).filter(
    (a) => a.purpose === (mode === "invent" ? "invent" : "create"),
  );
  const maxBatch = opts.data?.maxBatch ?? 1;
  const itemCount = task === "edit" && main.length > 1 ? main.length : count;
  const cost = me?.isAdmin ? 0 : itemCount;
  const featureAllowed = opts.data?.features.includes(task);

  const submit = async () => {
    setError(null);
    if (task === "edit" && !main.length) {
      setError("Envie a imagem principal para editar.");
      return;
    }
    if (task === "variation" && !source) {
      setError("Selecione a imagem para gerar variações (envie abaixo).");
      return;
    }
    if (itemCount > maxBatch) {
      setError(`Seu plano permite até ${maxBatch} resultado(s) por operação.`);
      return;
    }
    setSubmitting(true);
    try {
      const res = await createOperation({
        data: {
          type: task as "invent" | "edit" | "compose" | "variation",
          model,
          agentId: agent === "none" ? null : agent,
          instructions,
          aspect: aspect || undefined,
          quality: quality || undefined,
          transparent,
          count: task === "edit" && main.length > 1 ? 1 : count,
          projectId: project === "none" ? null : project,
          inputs: {
            main: main.map((a) => a.id),
            style: style.map((a) => a.id),
            element: element.map((a) => a.id),
            logo: logo.map((a) => a.id),
          },
          sourceAssetId: source?.id ?? null,
          idempotencyKey: keyRef.current,
        },
      });
      keyRef.current = newKey();
      setOpId(res.operationId);
      qc.invalidateQueries({ queryKey: ["me"] });
      const detail = await getOperation({ data: { id: res.operationId } });
      qc.setQueryData(["operation", res.operationId], detail);
      // Run every item; each run is idempotent server-side (claimed once).
      await Promise.allSettled(
        detail.items
          .filter((i: any) => i.status === "queued")
          .map((i: any) => runItem({ data: { itemId: i.id } })),
      );
      await qc.invalidateQueries({ queryKey: ["operation", res.operationId] });
      qc.invalidateQueries({ queryKey: ["me"] });
      qc.invalidateQueries({ queryKey: ["history"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  if (opts.isLoading) return <LoadingState />;
  if (opts.error)
    return <ErrorState message={errorMessage(opts.error)} onRetry={() => opts.refetch()} />;
  const o = opts.data!;

  return (
    <div>
      <PageHeader
        title={mode === "invent" ? "Inventar imagem" : "Criar imagem"}
        description={
          mode === "invent"
            ? "Gere imagens do zero a partir de uma descrição, um agente e referências opcionais."
            : "Edite imagens existentes, gere variações ou monte composições com fotos, produtos, elementos e logomarca."
        }
      />
      {!o.access.ok && (
        <div className="mb-6 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          {o.accessMessage}{" "}
          <Link to="/planos" className="font-semibold text-primary underline">
            Ver planos
          </Link>
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
        <div className="space-y-5 rounded-3xl border bg-panel p-5 shadow-soft">
          {mode === "create" && (
            <Tabs value={task} onValueChange={(v) => setTask(v as Task)}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="edit">Editar</TabsTrigger>
                <TabsTrigger value="compose">Composição</TabsTrigger>
                <TabsTrigger value="variation">Variações</TabsTrigger>
              </TabsList>
            </Tabs>
          )}
          {o.access.ok && !featureAllowed && (
            <p className="rounded-lg bg-warning/15 px-3 py-2 text-sm">
              Este recurso não está incluído no seu plano atual.
            </p>
          )}

          <div className="space-y-1.5">
            <Label>Agente</Label>
            <Select value={agent} onValueChange={setAgent}>
              <SelectTrigger>
                <SelectValue placeholder="Sem agente" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem agente</SelectItem>
                {visibleAgents.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {agent !== "none" && (
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <Bot className="size-3" />{" "}
                {visibleAgents.find((a) => a.id === agent)?.public_description}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="instr">
              {task === "edit"
                ? "O que mudar"
                : task === "variation"
                  ? "Instruções adicionais (opcional)"
                  : "Descrição"}
            </Label>
            <Textarea
              id="instr"
              rows={4}
              maxLength={4000}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder={
                task === "invent"
                  ? "Ex.: frasco de perfume âmbar sobre mármore, luz de fim de tarde, estilo editorial"
                  : task === "edit"
                    ? "Ex.: troque o fundo por um estúdio branco e mantenha a pessoa igual"
                    : task === "compose"
                      ? "Ex.: coloque o produto sobre a mesa do ambiente, com a logomarca discreta no canto"
                      : ""
              }
            />
          </div>

          {task === "edit" && (
            <UploadZone
              label="Imagem principal (obrigatória)"
              hint="Até 3 imagens: cada uma gera um resultado independente."
              role="main"
              max={UPLOAD_LIMITS.main}
              value={main}
              onChange={setMain}
            />
          )}
          {task === "variation" && (
            <UploadZone
              label="Imagem de origem"
              role="main"
              max={1}
              value={source ? [source] : []}
              onChange={(v) => setSource(v[0] ?? null)}
            />
          )}
          {task === "compose" && (
            <>
              <UploadZone
                label="Imagem principal / cenário (opcional)"
                role="main"
                max={1}
                value={main}
                onChange={setMain}
              />
              <UploadZone
                label="Elementos"
                hint="Produtos, objetos, pessoas ou ambientes para compor."
                role="element"
                max={UPLOAD_LIMITS.element}
                value={element}
                onChange={setElement}
              />
              <UploadZone
                label="Logomarca"
                hint="Para preservação exata, use depois “Aplicar logomarca exata” no resultado."
                role="logo"
                max={UPLOAD_LIMITS.logo}
                value={logo}
                onChange={setLogo}
                transparentPreview
              />
            </>
          )}
          {task === "invent" && (
            <UploadZone
              label="Referências (opcional)"
              hint="Imagens para orientar o conteúdo."
              role="main"
              max={UPLOAD_LIMITS.main}
              value={main}
              onChange={setMain}
            />
          )}
          {task !== "variation" && (
            <UploadZone
              label="Referências de estilo"
              hint="Até 2: orientam linguagem visual, sem copiar pessoas ou marcas."
              role="style"
              max={UPLOAD_LIMITS.style}
              value={style}
              onChange={setStyle}
            />
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label>Modelo</Label>
              <Select value={model} onValueChange={setModel}>
                <SelectTrigger>
                  <SelectValue placeholder="Nenhum modelo disponível" />
                </SelectTrigger>
                <SelectContent>
                  {models.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.label} · {m.family.split("·")[0]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {current?.note && <p className="text-xs text-muted-foreground">{current.note}</p>}
            </div>
            {!!current?.aspects.length && (
              <div className="space-y-1.5">
                <Label>Proporção</Label>
                <Select
                  value={aspect || "auto"}
                  onValueChange={(v) => setAspect(v === "auto" ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Automática</SelectItem>
                    {current.aspects.map((a) => (
                      <SelectItem key={a} value={a}>
                        {a}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {!!current?.qualities.length && (
              <div className="space-y-1.5">
                <Label>Qualidade</Label>
                <Select
                  value={quality || "auto"}
                  onValueChange={(v) => setQuality(v === "auto" ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Automática</SelectItem>
                    {current.qualities.map((q) => (
                      <SelectItem key={q} value={q}>
                        {(
                          { low: "Baixa", medium: "Média", high: "Alta" } as Record<string, string>
                        )[q] ?? q}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {!(task === "edit" && main.length > 1) && (
              <div className="space-y-1.5">
                <Label>Resultados</Label>
                <Select value={String(count)} onValueChange={(v) => setCount(Number(v))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3]
                      .filter((n) => n <= maxBatch)
                      .map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Projeto</Label>
              <Select value={project} onValueChange={setProject}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem projeto</SelectItem>
                  {o.projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {current?.transparency && (
            <label className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm">
              Fundo transparente (PNG)
              <Switch checked={transparent} onCheckedChange={setTransparent} />
            </label>
          )}
          {(task === "edit" || task === "variation") && (
            <p className="flex gap-2 text-xs text-muted-foreground">
              <Info className="mt-0.5 size-3 shrink-0" /> Ao editar pessoas, pedimos ao modelo que
              preserve a identidade, mas a reprodução perfeita não é garantida. A original nunca é
              sobrescrita.
            </p>
          )}

          {error && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          <Button
            variant="hero"
            size="lg"
            className="w-full"
            onClick={submit}
            disabled={submitting || !model || !o.access.ok || !featureAllowed}
          >
            {submitting ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {submitting
              ? "Processando…"
              : `Gerar ${itemCount} resultado(s) · ${cost ? `${cost} crédito(s)` : "sem custo de créditos"}`}
          </Button>
          {!models.length && (
            <p className="text-xs text-muted-foreground">
              Nenhum modelo habilitado para esta operação. O administrador pode ativá-los em
              Administração.
            </p>
          )}
        </div>

        <div className="space-y-4">
          {!opId ? (
            <div className="flex h-full min-h-72 flex-col items-center justify-center rounded-3xl border border-dashed bg-card/50 p-10 text-center">
              <Sparkles className="size-8 text-primary" />
              <p className="mt-3 font-display font-semibold">Seus resultados aparecem aqui</p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Cada imagem concluída e salva consome 1 crédito. Falhas não são cobradas.
              </p>
            </div>
          ) : op.data ? (
            <OperationCard op={op.data as Op} projects={o.projects} />
          ) : (
            <LoadingState label="Preparando operação…" />
          )}
          <p className="text-xs text-muted-foreground">
            Ver tudo em{" "}
            <Link to="/historico" className="font-semibold text-primary">
              Meu histórico
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
