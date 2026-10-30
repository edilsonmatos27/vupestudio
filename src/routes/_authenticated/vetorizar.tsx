import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Info, Loader2, PenTool } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { PageHeader } from "@/components/states";
import { UploadZone } from "@/components/upload-zone";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDownload } from "@/components/lightbox";
import { assetDownloadUrl, failVector, saveVector, startVectorize, studioOptions } from "@/functions/studio.functions";
import { errorMessage, newKey, type UploadedAsset } from "@/lib/client-api";

export const Route = createFileRoute("/_authenticated/vetorizar")({
  validateSearch: (s) => z.object({ source: z.string().uuid().optional() }).parse(s),
  head: () => ({ meta: [{ title: "Vetorizar — Vupe Studio" }, { name: "description", content: "Converta imagens em SVG vetorial." }] }),
  component: Vectorize,
});

const MODES = {
  logo: { label: "Logo", desc: "Poucas cores, contornos limpos.", opts: { numberofcolors: 4, colorsampling: 0, ltres: 1, qtres: 1, pathomit: 8, blurradius: 0 } },
  drawing: { label: "Desenho", desc: "Traço em duas cores (linha e fundo).", opts: { numberofcolors: 2, colorsampling: 0, pathomit: 4, ltres: 0.5, qtres: 0.5 } },
  fewcolors: { label: "Poucas cores", desc: "Até 6 cores, formas suavizadas.", opts: { numberofcolors: 6, colorsampling: 0, blurradius: 2, pathomit: 8 } },
  illustration: { label: "Ilustração", desc: "Até 16 cores, mais detalhes.", opts: { numberofcolors: 16, pathomit: 4, roundcoords: 1, ltres: 0.5, qtres: 0.5 } },
} as const;
type ModeKey = keyof typeof MODES;

async function trace(url: string, mode: ModeKey): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Não foi possível ler a imagem.");
  const bmp = await createImageBitmap(await res.blob());
  const scale = Math.min(1, 1200 / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bmp, 0, 0, w, h);
  const imgd = ctx.getImageData(0, 0, w, h);
  const mod: any = await import("imagetracerjs");
  const tracer = mod.default ?? mod;
  await new Promise((r) => setTimeout(r, 30));
  const svg = tracer.imagedataToSVG(imgd, { ...MODES[mode].opts, viewbox: true, desc: false, strokewidth: 0 }) as string;
  // Give the SVG intrinsic dimensions so it renders at the right size in previews and editors.
  return svg.replace(/^<svg /, `<svg width="${w}" height="${h}" `);
}

function Vectorize() {
  const { source } = Route.useSearch();
  const qc = useQueryClient();
  const opts = useQuery({ queryKey: ["studio-options"], queryFn: () => studioOptions() });
  const [file, setFile] = useState<UploadedAsset[]>([]);
  const [mode, setMode] = useState<ModeKey>("logo");
  const [project, setProject] = useState("none");
  const [status, setStatus] = useState<"idle" | "authorizing" | "tracing" | "saving" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ assetId: string; url: string | null } | null>(null);
  const keyRef = useRef(newKey());
  const { download, busy } = useDownload();

  useEffect(() => {
    if (!source) return;
    assetDownloadUrl({ data: { id: source } }).then(({ url, filename }) => setFile([{ id: source, url, filename, mime: "image/png" }])).catch(() => {});
  }, [source]);

  const run = async () => {
    if (!file[0]) { setError("Envie um arquivo PNG, JPG ou WEBP."); return; }
    setError(null);
    setResult(null);
    setStatus("authorizing");
    let itemId: string | null = null;
    try {
      const s = await startVectorize({ data: { sourceAssetId: file[0].id, mode, projectId: project === "none" ? null : project, idempotencyKey: keyRef.current } });
      itemId = s.itemId;
      setStatus("tracing");
      const svg = await trace(s.sourceUrl!, mode);
      setStatus("saving");
      const saved = await saveVector({ data: { itemId, svg } });
      keyRef.current = newKey();
      setResult(saved);
      setStatus("done");
      qc.invalidateQueries({ queryKey: ["history"] });
    } catch (e) {
      const msg = errorMessage(e);
      setError(msg);
      setStatus("error");
      if (itemId) {
        await failVector({ data: { itemId, error: msg.slice(0, 280) } }).catch(() => {});
        keyRef.current = newKey();
      }
    }
  };

  const busyRun = ["authorizing", "tracing", "saving"].includes(status);
  const statusLabel = { authorizing: "Verificando acesso…", tracing: "Traçando caminhos vetoriais…", saving: "Validando e salvando SVG…" } as Record<string, string>;

  return (
    <div>
      <PageHeader title="Vetorizar" description="Converta PNG, JPG ou WEBP em SVG com caminhos reais. Processado no seu navegador; não consome créditos." />
      {opts.data && !opts.data.access.ok && (
        <div className="mb-6 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm">{opts.data.accessMessage} <Link to="/planos" className="font-semibold text-primary underline">Ver planos</Link></div>
      )}
      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <div className="space-y-5 rounded-3xl border bg-card p-5 shadow-soft">
          <UploadZone label="Arquivo" role="source" max={1} value={file} onChange={setFile} />
          <div className="space-y-1.5">
            <Label>Modo</Label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(MODES) as ModeKey[]).map((k) => (
                <button key={k} type="button" onClick={() => setMode(k)} className={`rounded-xl border p-3 text-left text-sm transition-all ${mode === k ? "border-primary bg-primary/5 ring-2 ring-primary/30" : "hover:border-foreground/20"}`}>
                  <p className="font-semibold">{MODES[k].label}</p>
                  <p className="text-xs text-muted-foreground">{MODES[k].desc}</p>
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Projeto</Label>
            <Select value={project} onValueChange={setProject}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem projeto</SelectItem>
                {opts.data?.projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
          <Button variant="hero" className="w-full" size="lg" onClick={run} disabled={busyRun || !file[0] || (opts.data && !opts.data.access.ok)}>
            {busyRun ? <Loader2 className="animate-spin" /> : <PenTool />} {busyRun ? statusLabel[status] : "Vetorizar"}
          </Button>
          <p className="flex gap-2 text-xs text-muted-foreground"><Info className="mt-0.5 size-3 shrink-0" /> Funciona melhor com logos e desenhos de cores chapadas. Fotos complexas, detalhes finos e imagens de baixa resolução geram muitos caminhos e perdem fidelidade.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-3xl border bg-card p-4">
            <p className="mb-2 text-sm font-semibold">Original</p>
            <div className="flex aspect-square items-center justify-center overflow-hidden rounded-2xl bg-checker">
              {file[0]?.url ? <img src={file[0].url} alt="Original" className="max-h-full max-w-full object-contain" /> : <p className="text-sm text-muted-foreground">Nenhum arquivo</p>}
            </div>
          </div>
          <div className="rounded-3xl border bg-card p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold">SVG vetorial</p>
              {result && (
                <Button size="sm" variant="outline" onClick={() => download(result.assetId)} disabled={busy === result.assetId}><Download /> Baixar SVG</Button>
              )}
            </div>
            <div className="flex aspect-square items-center justify-center overflow-hidden rounded-2xl bg-checker">
              {busyRun ? (
                <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-6 animate-spin text-primary" />{statusLabel[status]}</div>
              ) : result?.url ? (
                // Rendered through <img>: SVG scripts never execute in this context; the file is also sanitized server-side.
                <img src={result.url} alt="Resultado vetorial" className="max-h-full max-w-full object-contain" />
              ) : (
                <p className="text-sm text-muted-foreground">O resultado aparece aqui</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
