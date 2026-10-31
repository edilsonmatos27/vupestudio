import { supabase } from "@/integrations/supabase/client";
import { UPLOAD_LIMITS } from "./models";
import { normalizeUpload } from "./normalize-upload";

export type UploadedAsset = { id: string; mime: string; url: string | null; filename: string };

async function token() {
  const { data } = await supabase.auth.getSession();
  const t = data.session?.access_token;
  if (!t) throw new Error("Sessão expirada. Entre novamente.");
  return t;
}

export function validateImageFile(file: Blob) {
  if (!UPLOAD_LIMITS.mimes.includes(file.type))
    return "Formato não suportado. Use PNG, JPG ou WEBP.";
  if (file.size > UPLOAD_LIMITS.maxBytes) return "Arquivo acima de 10 MB.";
  if (file.size === 0) return "Arquivo vazio.";
  return null;
}

export async function uploadAsset(
  file: File | Blob,
  role: string,
  extra?: Record<string, string>,
  filename = "imagem.png",
): Promise<UploadedAsset> {
  const originalName = file instanceof File ? file.name : filename;
  const validation = validateImageFile(file);
  if (validation) throw new Error(validation);
  const normalized = await normalizeUpload(file, originalName);
  const form = new FormData();
  form.append("file", normalized);
  form.append("role", role);
  for (const [k, v] of Object.entries(extra ?? {})) form.append(k, v);
  const res = await fetch("/api/assets/upload", {
    method: "POST",
    headers: { Authorization: `Bearer ${await token()}` },
    body: form,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Falha no envio do arquivo.");
  return json as UploadedAsset;
}

export async function uploadMedia(file: File, purpose?: "agent"): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  if (purpose) form.append("purpose", purpose);
  const res = await fetch("/api/admin/media", {
    method: "POST",
    headers: { Authorization: `Bearer ${await token()}` },
    body: form,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Falha no envio da imagem.");
  return json.url as string;
}

/** Triggers a direct download (Content-Disposition: attachment) without opening a new tab. */
export function triggerDownload(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function errorMessage(e: unknown) {
  if (e instanceof Error) return e.message;
  return "Ocorreu um erro inesperado.";
}

export function formatBRL(cents: number | null | undefined, currency = "brl") {
  if (cents === null || cents === undefined) return "Preço a definir";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

export function formatDate(iso: string | null | undefined, withTime = true) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat(
    "pt-BR",
    withTime ? { dateStyle: "short", timeStyle: "short" } : { dateStyle: "short" },
  ).format(new Date(iso));
}

export function formatDuration(minutes: number) {
  if (minutes <= 0) return "sem teste";
  if (minutes % 1440 === 0) return `${minutes / 1440} dia(s)`;
  if (minutes % 60 === 0) return `${minutes / 60} hora(s)`;
  return `${minutes} minuto(s)`;
}

export function newKey() {
  return crypto.randomUUID();
}
