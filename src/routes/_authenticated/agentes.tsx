import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, ImagePlus, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState, ErrorState, LoadingState, PageHeader, StatusBadge } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  adminDeleteAgent,
  adminGetAgentPrompt,
  adminListAgents,
  adminSaveAgent,
  adminSetAgentStatus,
  listMyAgents,
} from "@/functions/agents.functions";
import { adminListPlans } from "@/functions/plans.functions";
import { useMe } from "@/hooks/use-me";
import { errorMessage, formatDate, uploadMedia, validateImageFile } from "@/lib/client-api";

export const Route = createFileRoute("/_authenticated/agentes")({
  head: () => ({
    meta: [
      { title: "Agentes de IA — Vupe Studio" },
      { name: "description", content: "Estilos curados para criar e editar imagens." },
    ],
  }),
  component: AgentsPage,
});

type Agent = Awaited<ReturnType<typeof listMyAgents>>[number];

function AgentGrid() {
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ["my-agents"], queryFn: () => listMyAgents() });
  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  if (!q.data?.length)
    return (
      <EmptyState
        icon={<Bot className="size-5" />}
        title="Nenhum agente disponível"
        description="Quando o administrador publicar agentes para o seu plano, eles aparecerão aqui."
      />
    );
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {q.data.map((a) => (
        <div
          key={a.id}
          className="flex flex-col overflow-hidden rounded-3xl border bg-card shadow-soft"
        >
          <div className="aspect-[16/10] bg-muted">
            {a.image_url ? (
              <img
                src={a.image_url}
                alt={a.name}
                className="size-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="flex size-full items-center justify-center bg-hero">
                <Bot className="size-10 text-primary" />
              </div>
            )}
          </div>
          <div className="flex flex-1 flex-col p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
              {a.purpose === "invent" ? "Inventar" : "Criar / editar"}
            </p>
            <h3 className="mt-1 text-lg font-semibold">{a.name}</h3>
            <p className="mt-1 flex-1 text-sm text-muted-foreground">{a.public_description}</p>
            <Button
              className="mt-4"
              onClick={() =>
                navigate({
                  to: a.purpose === "invent" ? "/inventar" : "/criar",
                  search: { agente: a.id },
                })
              }
            >
              Usar agente
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

const empty = {
  id: undefined as string | undefined,
  name: "",
  public_description: "",
  image_url: null as string | null,
  purpose: "invent" as "invent" | "create",
  base_prompt: "",
  allowed_plan_ids: [] as string[],
};

function AdminAgents() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-agents"], queryFn: () => adminListAgents() });
  const plans = useQuery({ queryKey: ["admin-plans"], queryFn: () => adminListPlans() });
  const [edit, setEdit] = useState<typeof empty | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [del, setDel] = useState<Agent | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  const open = async (a?: Agent) => {
    if (!a) {
      setEdit({ ...empty });
      return;
    }
    try {
      const { base_prompt } = await adminGetAgentPrompt({ data: { id: a.id } });
      setEdit({
        id: a.id,
        name: a.name,
        public_description: a.public_description,
        image_url: a.image_url,
        purpose: a.purpose as "invent" | "create",
        base_prompt,
        allowed_plan_ids: a.allowed_plan_ids,
      });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  const save = async () => {
    if (!edit) return;
    setSaving(true);
    try {
      await adminSaveAgent({ data: { ...edit, settings: {} } });
      toast.success("Agente salvo.");
      setEdit(null);
      qc.invalidateQueries({ queryKey: ["admin-agents"] });
      qc.invalidateQueries({ queryKey: ["my-agents"] });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };
  const toggle = async (a: Agent) => {
    setToggling(a.id);
    try {
      await adminSetAgentStatus({
        data: { id: a.id, status: a.status === "active" ? "inactive" : "active" },
      });
      await qc.invalidateQueries({ queryKey: ["admin-agents"] });
      qc.invalidateQueries({ queryKey: ["my-agents"] });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setToggling(null);
    }
  };
  const remove = async () => {
    if (!del) return;
    try {
      await adminDeleteAgent({ data: { id: del.id } });
      toast.success("Agente excluído. O histórico antigo permanece legível.");
      qc.invalidateQueries({ queryKey: ["admin-agents"] });
      qc.invalidateQueries({ queryKey: ["my-agents"] });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setDel(null);
    }
  };

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => open()}>
          <Plus /> Novo agente
        </Button>
      </div>
      {q.isLoading ? (
        <LoadingState />
      ) : q.error ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : !q.data?.length ? (
        <EmptyState
          title="Nenhum agente criado"
          description="Crie o primeiro agente com um prompt-base privado."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-card">
          {q.data.map((a) => (
            <div
              key={a.id}
              className="flex flex-wrap items-center gap-3 border-b p-4 last:border-0"
            >
              <div className="size-12 overflow-hidden rounded-xl bg-muted">
                {a.image_url && <img src={a.image_url} alt="" className="size-full object-cover" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {a.name}{" "}
                  <span className="text-xs font-normal text-muted-foreground">
                    v{a.current_version} · {a.purpose === "invent" ? "Inventar" : "Criar"}
                  </span>
                </p>
                <p className="truncate text-sm text-muted-foreground">{a.public_description}</p>
                <p className="text-xs text-muted-foreground">
                  Atualizado {formatDate(a.updated_at)}
                </p>
              </div>
              <StatusBadge status={a.status} />
              <Switch
                checked={a.status === "active"}
                disabled={toggling === a.id}
                onCheckedChange={() => toggle(a)}
                aria-label="Ativar agente"
              />
              <Button size="icon" variant="ghost" onClick={() => open(a)} aria-label="Editar">
                <Pencil />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => setDel(a)} aria-label="Excluir">
                <Trash2 className="text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{edit?.id ? "Editar agente" : "Novo agente"}</DialogTitle>
          </DialogHeader>
          {edit && (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Nome</Label>
                  <Input
                    value={edit.name}
                    onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Finalidade</Label>
                  <div className="flex gap-2">
                    {(["invent", "create"] as const).map((p) => (
                      <Button
                        key={p}
                        type="button"
                        size="sm"
                        variant={edit.purpose === p ? "default" : "outline"}
                        onClick={() => setEdit({ ...edit, purpose: p })}
                      >
                        {p === "invent" ? "Inventar" : "Criar/editar"}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Descrição pública</Label>
                <Textarea
                  rows={2}
                  value={edit.public_description}
                  onChange={(e) => setEdit({ ...edit, public_description: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Prompt-base privado</Label>
                <Textarea
                  rows={6}
                  value={edit.base_prompt}
                  onChange={(e) => setEdit({ ...edit, base_prompt: e.target.value })}
                  placeholder="Instruções de estilo aplicadas somente no servidor. Nunca enviadas ao navegador dos assinantes."
                />
                <p className="text-xs text-muted-foreground">
                  Alterar o prompt ou o nome cria uma nova versão; o histórico guarda a versão usada
                  em cada operação.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Imagem ilustrativa</Label>
                <div className="flex items-center gap-3">
                  <div className="size-16 overflow-hidden rounded-xl bg-muted">
                    {edit.image_url && (
                      <img src={edit.image_url} alt="" className="size-full object-cover" />
                    )}
                  </div>
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold">
                    {uploading ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <ImagePlus className="size-4" />
                    )}{" "}
                    Enviar
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        if (!f) return;
                        const err = validateImageFile(f);
                        if (err) {
                          toast.error(err);
                          return;
                        }
                        setUploading(true);
                        try {
                          setEdit({ ...edit, image_url: await uploadMedia(f, "agent") });
                        } catch (er) {
                          toast.error(errorMessage(er));
                        } finally {
                          setUploading(false);
                        }
                      }}
                    />
                  </label>
                  {edit.image_url && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEdit({ ...edit, image_url: null })}
                    >
                      Remover
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">PNG, JPG ou WEBP, até 10 MB.</p>
              </div>
              <div className="space-y-1.5">
                <Label>Planos com acesso (nenhum marcado = todos)</Label>
                <div className="flex flex-wrap gap-3">
                  {plans.data?.plans.map((p) => (
                    <label key={p.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={edit.allowed_plan_ids.includes(p.id)}
                        onCheckedChange={(c) =>
                          setEdit({
                            ...edit,
                            allowed_plan_ids: c
                              ? [...edit.allowed_plan_ids, p.id]
                              : edit.allowed_plan_ids.filter((x) => x !== p.id),
                          })
                        }
                      />
                      {p.name}
                    </label>
                  ))}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Novos agentes começam inativos. Ative-os na lista quando estiverem prontos.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={saving || !edit?.name || !edit?.base_prompt}>
              {saving && <Loader2 className="animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!del} onOpenChange={(o) => !o && setDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir o agente “{del?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Ele deixa de aparecer para os assinantes. Operações antigas mantêm o nome e a versão
              usados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={remove}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AgentsPage() {
  const { data: me } = useMe();
  return (
    <div>
      <PageHeader
        title="Agentes de IA"
        description="Estilos prontos que abrem a bancada já configurada."
      />
      {me?.isAdmin ? (
        <Tabs defaultValue="manage">
          <TabsList className="mb-5">
            <TabsTrigger value="manage">Gerenciar</TabsTrigger>
            <TabsTrigger value="view">Visão do assinante</TabsTrigger>
          </TabsList>
          <TabsContent value="manage">
            <AdminAgents />
          </TabsContent>
          <TabsContent value="view">
            <AgentGrid />
          </TabsContent>
        </Tabs>
      ) : (
        <AgentGrid />
      )}
    </div>
  );
}
