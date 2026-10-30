import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { UploadZone } from "@/components/upload-zone";
import { errorMessage, uploadAsset, type UploadedAsset } from "@/lib/client-api";

const POSITIONS = [
  ["top-left", "Superior esquerdo"], ["top-right", "Superior direito"], ["center", "Centro"],
  ["bottom-left", "Inferior esquerdo"], ["bottom-right", "Inferior direito"],
] as const;

async function loadImage(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Não foi possível carregar a imagem.");
  const blob = await res.blob();
  return await createImageBitmap(blob);
}

/** Deterministic composition: the original logo file is drawn pixel-exact over the result. */
export function LogoOverlayDialog({ asset, onClose, onDone }: { asset: { id: string; url: string | null; filename: string }; onClose: () => void; onDone: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [logo, setLogo] = useState<UploadedAsset[]>([]);
  const [pos, setPos] = useState<(typeof POSITIONS)[number][0]>("bottom-right");
  const [size, setSize] = useState(20);
  const [margin, setMargin] = useState(4);
  const [busy, setBusy] = useState(false);
  const [imgs, setImgs] = useState<{ base: ImageBitmap; logo: ImageBitmap | null } | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const base = await loadImage(asset.url!);
        const l = logo[0]?.url ? await loadImage(logo[0].url) : null;
        if (alive) setImgs({ base, logo: l });
      } catch (e) {
        toast.error(errorMessage(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, [asset.url, logo]);

  useEffect(() => {
    const c = canvas.current;
    if (!c || !imgs) return;
    c.width = imgs.base.width;
    c.height = imgs.base.height;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(imgs.base, 0, 0);
    if (!imgs.logo) return;
    const w = (c.width * size) / 100;
    const h = (w * imgs.logo.height) / imgs.logo.width;
    const m = (Math.min(c.width, c.height) * margin) / 100;
    let x = m, y = m;
    if (pos.includes("right")) x = c.width - w - m;
    if (pos.includes("bottom")) y = c.height - h - m;
    if (pos === "center") {
      x = (c.width - w) / 2;
      y = (c.height - h) / 2;
    }
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(imgs.logo, x, y, w, h);
  }, [imgs, pos, size, margin]);

  const save = async () => {
    if (!canvas.current || !imgs?.logo) return;
    setBusy(true);
    try {
      const blob: Blob = await new Promise((r, j) => canvas.current!.toBlob((b) => (b ? r(b) : j(new Error("Falha ao gerar a imagem."))), "image/png"));
      await uploadAsset(blob, "overlay", { parentAssetId: asset.id }, "logomarca.png");
      toast.success("Nova versão com logomarca salva. A original foi preservada.");
      onDone();
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Aplicar logomarca exata</DialogTitle>
          <DialogDescription>O arquivo original da logomarca é sobreposto sem passar pela IA, preservando proporção, cores e transparência. A imagem original não é alterada.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-5 md:grid-cols-[1fr_240px]">
          <div className="flex items-center justify-center rounded-xl border bg-checker p-2">
            {imgs ? <canvas ref={canvas} className="max-h-[50vh] max-w-full" /> : <Loader2 className="size-6 animate-spin text-primary" />}
          </div>
          <div className="space-y-4">
            <UploadZone label="Logomarca" role="logo" max={1} value={logo} onChange={setLogo} transparentPreview />
            <div className="space-y-1.5">
              <Label>Posição</Label>
              <div className="grid grid-cols-2 gap-1.5">
                {POSITIONS.map(([v, l]) => (
                  <Button key={v} type="button" size="sm" variant={pos === v ? "default" : "outline"} onClick={() => setPos(v)}>{l}</Button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5"><Label>Tamanho: {size}% da largura</Label><Slider min={5} max={60} step={1} value={[size]} onValueChange={(v) => setSize(v[0]!)} /></div>
            <div className="space-y-1.5"><Label>Margem: {margin}%</Label><Slider min={0} max={20} step={1} value={[margin]} onValueChange={(v) => setMargin(v[0]!)} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={busy || !imgs?.logo}>{busy && <Loader2 className="animate-spin" />} Salvar nova versão</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
