import { Download, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { assetDownloadUrl } from "@/server/studio.functions";
import { errorMessage, triggerDownload } from "@/lib/client-api";

export function useDownload() {
  const [busy, setBusy] = useState<string | null>(null);
  const download = async (assetId: string) => {
    setBusy(assetId);
    try {
      const { url, filename } = await assetDownloadUrl({ data: { id: assetId } });
      triggerDownload(url, filename);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  return { download, busy };
}

export function Lightbox({ open, onOpenChange, src, title, assetId, transparentBg }: { open: boolean; onOpenChange: (o: boolean) => void; src: string | null; title?: string | undefined; assetId?: string | undefined; transparentBg?: boolean | undefined }) {
  const { download, busy } = useDownload();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl gap-0 overflow-hidden p-0 [&>button]:hidden">
        <DialogTitle className="sr-only">{title ?? "Visualização"}</DialogTitle>
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="truncate text-sm font-semibold">{title ?? "Visualização"}</p>
          <div className="flex gap-2">
            {assetId && (
              <Button size="sm" variant="outline" onClick={() => download(assetId)} disabled={busy === assetId}>
                <Download /> Baixar
              </Button>
            )}
            <Button size="icon" variant="ghost" onClick={() => onOpenChange(false)} aria-label="Fechar"><X /></Button>
          </div>
        </div>
        <div className={`flex max-h-[80vh] items-center justify-center p-4 ${transparentBg ? "bg-checker" : "bg-muted"}`}>
          {src ? <img src={src} alt={title ?? ""} className="max-h-[75vh] max-w-full object-contain" /> : <p className="text-sm text-muted-foreground">Imagem indisponível.</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
