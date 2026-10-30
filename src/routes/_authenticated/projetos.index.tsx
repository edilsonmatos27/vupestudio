import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderOpen, Loader2, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createProject, listProjects } from "@/functions/projects.functions";
import { errorMessage, formatDate } from "@/lib/client-api";

export const Route = createFileRoute("/_authenticated/projetos/")({
  head: () => ({ meta: [{ title: "Projetos — Vupe Studio" }, { name: "description", content: "Organize suas imagens por projeto." }] }),
  component: Projects,
});

function Projects() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"recent" | "name" | "created">("recent");
  const list = useQuery({ queryKey: ["projects", q, sort], queryFn: () => listProjects({ data: { q: q || undefined, sort } }) });
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    try {
      await createProject({ data: { name, description: desc || undefined } });
      toast.success("Projeto criado.");
      setOpen(false);
      setName("");
      setDesc("");
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["studio-options"] });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader title="Projetos" description="Agrupe arquivos, versões e a linha do tempo de cada trabalho." actions={<Button onClick={() => setOpen(true)}><Plus /> Novo projeto</Button>} />
      <div className="mb-5 flex flex-col gap-3 sm:flex-row">
        <Input placeholder="Pesquisar projetos…" value={q} onChange={(e) => setQ(e.target.value)} className="sm:max-w-xs" />
        <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
          <SelectTrigger className="sm:w-48"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="recent">Atualizados recentemente</SelectItem><SelectItem value="created">Criados recentemente</SelectItem><SelectItem value="name">Nome</SelectItem></SelectContent>
        </Select>
      </div>
      {list.isLoading ? <LoadingState /> : list.error ? <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} /> : !list.data?.length ? (
        <EmptyState icon={<FolderOpen className="size-5" />} title={q ? "Nenhum projeto encontrado" : "Nenhum projeto ainda"} description="Crie um projeto para organizar seus resultados." action={<Button onClick={() => setOpen(true)}><Plus /> Novo projeto</Button>} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.data.map((p) => (
            <Link key={p.id} to="/projetos/$id" params={{ id: p.id }} className="rounded-3xl border bg-card p-5 shadow-soft transition-transform hover:-translate-y-0.5">
              <FolderOpen className="size-6 text-primary" />
              <h3 className="mt-3 text-lg font-semibold">{p.name}</h3>
              {p.description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{p.description}</p>}
              <p className="mt-3 text-xs text-muted-foreground">{p.asset_count} arquivo(s) · atualizado {formatDate(p.updated_at)}</p>
            </Link>
          ))}
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo projeto</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5"><Label>Nome</Label><Input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Descrição (opcional)</Label><Textarea rows={3} maxLength={500} value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={create} disabled={busy || !name.trim()}>{busy && <Loader2 className="animate-spin" />} Criar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
