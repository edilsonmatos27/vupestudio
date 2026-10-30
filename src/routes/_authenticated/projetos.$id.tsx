import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Pencil, PenTool, Sparkles, Trash2, Wand2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState, ErrorState, LoadingState, StatusBadge } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Lightbox } from "@/components/lightbox";
import { deleteProject, getProject, updateProject } from "@/functions/projects.functions";
import { errorMessage, formatDate } from "@/lib/client-api";
import { TASK_LABEL } from "@/lib/models";

export const Route = createFileRoute("/_authenticated/projetos/$id")({
  head: () => ({ meta: [{ title: "Projeto — Vupe Studio" }, { name: "description", content: "Arquivos, versões e linha do tempo do projeto." }] }),
  component: ProjectDetail,
});

function ProjectDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ["project", id], queryFn: () => getProject({ data: { id } }) });
  const [rename, setRename] = useState<{ name: string; description: string } | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [light, setLight] = useState<{ url: string | null; id: string; filename: string } | null>(null);

  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  const { project, operations, assets } = q.data!;

  const saveRename = async () => {
    if (!rename) return;
    setBusy(true);
    try {
      await updateProject({ data: { id, name: rename.name, description: rename.description || null } });
      toast.success("Projeto atualizado.");
      setRename(null);
      qc.invalidateQueries({ queryKey: ["project", id] });
      qc.invalidateQueries({ queryKey: ["projects"] });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    setBusy(true);
    try {
      await deleteProject({ data: { id } });
      toast.success("Projeto excluído e arquivos removidos.");
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["studio-options"] });
      navigate({ to: "/projetos" });
    } catch (e) {
      toast.error(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <div>
      <Link to="/projetos" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Projetos</Link>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">{project.name}</h1>
          {project.description && <p className="mt-1 text-muted-foreground">{project.description}</p>}
          <p className="mt-1 text-xs text-muted-foreground">Criado {formatDate(project.created_at)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild><Link to="/inventar"><Sparkles /> Inventar</Link></Button>
          <Button variant="outline" asChild><Link to="/criar"><Wand2 /> Criar</Link></Button>
          <Button variant="outline" asChild><Link to="/vetorizar"><PenTool /> Vetorizar</Link></Button>
          <Button variant="ghost" onClick={() => setRename({ name: project.name, description: project.description ?? "" })}><Pencil /> Renomear</Button>
          <Button variant="ghost" onClick={() => setConfirmDel(true)}><Trash2 className="text-destructive" /> Excluir</Button>
        </div>
      </div>

      <h2 className="mb-3 text-lg font-semibold">Arquivos e versões</h2>
      {!assets.length ? <EmptyState title="Projeto vazio" description="Escolha este projeto nas bancadas ou use “Salvar em projeto” no histórico." /> : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {assets.map((a) => (
            <button key={a.id} onClick={() => setLight({ url: a.url, id: a.id, filename: a.filename })} className="overflow-hidden rounded-2xl border bg-card text-left">
              <div className="aspect-square bg-checker">{a.url && <img src={a.url} alt={a.filename} className="size-full object-contain" loading="lazy" />}</div>
              <p className="truncate px-2 py-1.5 text-xs text-muted-foreground">{a.parent_asset_id ? "Versão · " : ""}{formatDate(a.created_at)}</p>
            </button>
          ))}
        </div>
      )}

      <h2 className="mb-3 mt-8 text-lg font-semibold">Linha do tempo</h2>
      {!operations.length ? <p className="text-sm text-muted-foreground">Nenhuma operação neste projeto.</p> : (
        <ol className="space-y-2 border-l pl-5">
          {operations.map((o) => (
            <li key={o.id} className="relative text-sm">
              <span className="absolute -left-[25px] top-1.5 size-2.5 rounded-full bg-primary" />
              <span className="font-semibold">{TASK_LABEL[o.type] ?? o.type}</span> <StatusBadge status={o.status} /> <span className="text-muted-foreground">· {formatDate(o.created_at)}{o.agent_name ? ` · ${o.agent_name}` : ""}</span>
              {o.user_instructions && <p className="line-clamp-1 text-muted-foreground">“{o.user_instructions}”</p>}
            </li>
          ))}
        </ol>
      )}

      <Lightbox open={!!light} onOpenChange={(o) => !o && setLight(null)} src={light?.url ?? null} title={light?.filename} assetId={light?.id} transparentBg />
      <Dialog open={!!rename} onOpenChange={(o) => !o && setRename(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Renomear projeto</DialogTitle></DialogHeader>
          {rename && <div className="space-y-4">
            <div className="space-y-1.5"><Label>Nome</Label><Input value={rename.name} maxLength={120} onChange={(e) => setRename({ ...rename, name: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Descrição</Label><Textarea rows={3} maxLength={500} value={rename.description} onChange={(e) => setRename({ ...rename, description: e.target.value })} /></div>
          </div>}
          <DialogFooter><Button variant="outline" onClick={() => setRename(null)}>Cancelar</Button><Button onClick={saveRename} disabled={busy || !rename?.name.trim()}>{busy && <Loader2 className="animate-spin" />} Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={confirmDel} onOpenChange={setConfirmDel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir “{project.name}”?</AlertDialogTitle>
            <AlertDialogDescription>Todos os arquivos do projeto serão removidos do armazenamento. Operações em andamento terminam sem vínculo com o projeto. Registros de créditos e faturas são preservados.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={remove} disabled={busy}>Excluir projeto</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
