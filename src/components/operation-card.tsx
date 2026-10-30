import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Download, FolderInput, Image as ImageIcon, Loader2, MoreHorizontal, PenTool, Shapes, Sparkles, Stamp, Trash2, Wand2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Lightbox, useDownload } from "@/components/lightbox";
import { StatusBadge } from "@/components/states";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { deleteAsset, moveAssetToProject } from "@/server/studio.functions";
import { errorMessage, formatDate } from "@/lib/client-api";
import { TASK_LABEL, findModel } from "@/lib/models";
import { LogoOverlayDialog } from "@/components/logo-overlay";

export type OpItem = {
  id: string;
  idx: number;
  status: string;
  error: string | null;
  asset: { id: string; mime: string; filename: string; url: string | null; kind: string; project_id: string | null } | null;
  deleted: boolean;
};
export type Op = {
  id: string;
  type: string;
  status: string;
  agent_name: string | null;
  agent_version: number | null;
  model: string | null;
  user_instructions: string;
  params: any;
  requested_count: number;
  credits_per_item: number;
  charged: boolean;
  project_id: string | null;
  created_at: string;
  items: OpItem[];
};

export function OperationCard({ op, projects }: { op: Op; projects?: { id: string; name: string }[] }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { download, busy } = useDownload();
  const [light, setLight] = useState<OpItem | null>(null);
  const [confirmDel, setConfirmDel] = useState<OpItem | null>(null);
  const [overlay, setOverlay] = useState<OpItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const model = findModel(op.model);
  const charged = op.charged ? op.items.filter((i) => i.status === "succeeded").length * op.credits_per_item : 0;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["history"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    qc.invalidateQueries({ queryKey: ["project"] });
  };

  const doDelete = async () => {
    if (!confirmDel?.asset) return;
    setDeleting(true);
    try {
      await deleteAsset({ data: { id: confirmDel.asset.id } });
      toast.success("Imagem excluída.");
      refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setDeleting(false);
      setConfirmDel(null);
    }
  };

  const move = async (assetId: string, projectId: string | null) => {
    try {
      await moveAssetToProject({ data: { assetId, projectId } });
      toast.success(projectId ? "Salvo no projeto." : "Removido do projeto.");
      refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div className="rounded-2xl border bg-card p-4 shadow-soft">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">{TASK_LABEL[op.type] ?? op.type}</span>
        <StatusBadge status={op.status} />
        <span className="text-xs text-muted-foreground">{formatDate(op.created_at)}</span>
        <span className="ml-auto text-xs text-muted-foreground">{op.charged ? `${charged} crédito(s) cobrado(s)` : "sem cobrança de créditos"}</span>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
        {op.model && <span>Modelo: {model ? `${model.label} (${model.version})` : op.model}</span>}
        {op.agent_name && <span>Agente: {op.agent_name}{op.agent_version ? ` v${op.agent_version}` : ""}</span>}
      </div>
      {op.user_instructions && <p className="mt-2 line-clamp-2 text-sm text-foreground/80">“{op.user_instructions}”</p>}
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {op.items.map((it) => (
          <div key={it.id} className="group relative overflow-hidden rounded-xl border bg-muted">
            <div className={`flex aspect-square items-center justify-center ${it.asset?.mime === "image/svg+xml" || op.params?.transparent ? "bg-checker" : ""}`}>
              {it.asset?.url ? (
                <button className="size-full" onClick={() => setLight(it)} aria-label="Ampliar">
                  <img src={it.asset.url} alt={it.asset.filename} className="size-full object-contain" loading="lazy" />
                </button>
              ) : ["queued", "running", "storing"].includes(it.status) ? (
                <div className="flex flex-col items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="size-6 animate-spin text-primary" />
                  {it.status === "storing" ? "Salvando arquivo…" : it.status === "running" ? "Gerando com IA…" : "Na fila…"}
                </div>
              ) : it.deleted ? (
                <p className="px-3 text-center text-xs text-muted-foreground">Imagem excluída</p>
              ) : (
                <p className="px-3 text-center text-xs text-destructive">{it.error ?? "Falhou"}</p>
              )}
            </div>
            {it.asset && (
              <div className="absolute inset-x-2 bottom-2 flex justify-end gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                <Button size="icon" variant="secondary" className="size-8" onClick={() => download(it.asset!.id)} disabled={busy === it.asset.id} aria-label="Baixar">
                  {busy === it.asset.id ? <Loader2 className="animate-spin" /> : <Download />}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon" variant="secondary" className="size-8" aria-label="Mais ações"><MoreHorizontal /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setLight(it)}><ImageIcon /> Ampliar</DropdownMenuItem>
                    {it.asset.mime !== "image/svg+xml" && (
                      <>
                        <DropdownMenuItem onClick={() => navigate({ to: "/criar", search: { source: it.asset!.id, modo: "edit" } })}><Wand2 /> Editar</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => navigate({ to: "/criar", search: { source: it.asset!.id, modo: "variation" } })}><Shapes /> Variações</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => navigate({ to: "/vetorizar", search: { source: it.asset!.id } })}><PenTool /> Vetorizar</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setOverlay(it)}><Stamp /> Aplicar logomarca exata</DropdownMenuItem>
                      </>
                    )}
                    {projects && (
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger><FolderInput className="mr-2 size-4" /> Salvar em projeto</DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                          {projects.length === 0 && <DropdownMenuItem disabled>Nenhum projeto</DropdownMenuItem>}
                          {projects.map((p) => (
                            <DropdownMenuItem key={p.id} onClick={() => move(it.asset!.id, p.id)}>{p.name}</DropdownMenuItem>
                          ))}
                          {it.asset.project_id && <DropdownMenuItem onClick={() => move(it.asset!.id, null)}>Remover do projeto</DropdownMenuItem>}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive" onClick={() => setConfirmDel(it)}><Trash2 /> Excluir imagem</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>
        ))}
      </div>
      <Lightbox open={!!light} onOpenChange={(o) => !o && setLight(null)} src={light?.asset?.url ?? null} title={light?.asset?.filename} assetId={light?.asset?.id} transparentBg />
      <AlertDialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir esta imagem?</AlertDialogTitle>
            <AlertDialogDescription>O arquivo será removido do armazenamento. As demais imagens da operação permanecem. O registro de créditos é mantido.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete} disabled={deleting}>{deleting && <Loader2 className="animate-spin" />} Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {overlay?.asset && <LogoOverlayDialog asset={overlay.asset} onClose={() => setOverlay(null)} onDone={refresh} />}
    </div>
  );
}

export function SparkHeader() {
  return <Sparkles className="size-4" />;
}
