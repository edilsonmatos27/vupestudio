import { ImagePlus, Loader2, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { errorMessage, uploadAsset, validateImageFile, type UploadedAsset } from "@/lib/client-api";

export function UploadZone({
  label, hint, role, max, value, onChange, transparentPreview, disabled,
}: {
  label: string;
  hint?: string;
  role: string;
  max: number;
  value: UploadedAsset[];
  onChange: (v: UploadedAsset[]) => void;
  transparentPreview?: boolean;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(0);

  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    const list = Array.from(files);
    const room = max - value.length;
    if (list.length > room) {
      toast.error(`${label}: limite de ${max} imagem(ns). Remova uma para enviar outra.`);
      return;
    }
    for (const f of list) {
      const err = validateImageFile(f);
      if (err) {
        toast.error(`${f.name}: ${err}`);
        return;
      }
    }
    setBusy(list.length);
    const uploaded: UploadedAsset[] = [];
    for (const f of list) {
      try {
        uploaded.push(await uploadAsset(f, role));
      } catch (e) {
        toast.error(`${f.name}: ${errorMessage(e)}`);
      }
    }
    setBusy(0);
    onChange([...value, ...uploaded]);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-semibold">{label}</p>
        <span className="text-xs text-muted-foreground">{value.length}/{max}</span>
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <div className="flex flex-wrap gap-2">
        {value.map((a) => (
          <div key={a.id} className={`relative size-20 overflow-hidden rounded-xl border ${transparentPreview ? "bg-checker" : "bg-muted"}`}>
            {a.url && <img src={a.url} alt={a.filename} className="size-full object-contain" />}
            <button
              type="button"
              onClick={() => onChange(value.filter((x) => x.id !== a.id))}
              className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-foreground/70 text-background"
              aria-label="Remover"
            >
              <X className="size-3" />
            </button>
          </div>
        ))}
        {value.length < max && (
          <button
            type="button"
            disabled={disabled || busy > 0}
            onClick={() => ref.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              add(e.dataTransfer.files);
            }}
            className="flex size-20 flex-col items-center justify-center gap-1 rounded-xl border border-dashed text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
          >
            {busy ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
            {busy ? "Enviando" : "Adicionar"}
          </button>
        )}
      </div>
      <input
        ref={ref}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple={max > 1}
        className="hidden"
        onChange={(e) => {
          add(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
