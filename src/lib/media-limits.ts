// Size limits for admin media uploads (/api/admin/media). Shared by server and tests.
export const AGENT_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const DEFAULT_MEDIA_MAX_BYTES = 2 * 1024 * 1024;

export function mediaMaxBytes(purpose: unknown): number {
  return purpose === "agent" ? AGENT_IMAGE_MAX_BYTES : DEFAULT_MEDIA_MAX_BYTES;
}

/** Returns an error message when the file exceeds the limit for its purpose, else null. */
export function mediaSizeError(size: number, purpose: unknown): string | null {
  const max = mediaMaxBytes(purpose);
  if (size <= max) return null;
  return `Imagem acima de ${max / (1024 * 1024)} MB.`;
}
