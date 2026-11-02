import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type Admin = typeof supabaseAdmin;
export { supabaseAdmin };

export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export async function isAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  return !!data;
}

/** Verifies the caller's admin role through their own RLS-scoped client. */
export async function assertAdmin(supabase: SupabaseClient<Database>, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error || !data) throw new AppError("forbidden", "Acesso restrito ao admin master.", 403);
}

export async function audit(entry: {
  actor_id: string | null;
  action: string;
  target_type?: string;
  target_id?: string;
  reason?: string | null;
  result?: string;
  details?: Record<string, unknown>;
}) {
  await supabaseAdmin.from("audit_log").insert({
    actor_id: entry.actor_id,
    action: entry.action,
    target_type: entry.target_type ?? null,
    target_id: entry.target_id ?? null,
    reason: entry.reason ?? null,
    result: entry.result ?? "success",
    details: (entry.details ?? {}) as never,
  });
}

export type Access = {
  ok: boolean;
  code: "admin" | "paid" | "trial" | "trial_expired" | "no_access" | "blocked" | "no_profile";
  is_admin?: boolean;
  plan_id?: string;
  features?: string[];
  models?: string[];
  max_batch?: number;
  trial_ends_at?: string;
  paid_through?: string;
  billing_type?: "recurring" | "one_time";
  reason?: string;
  mode?: string;
};

export async function getAccess(userId: string): Promise<Access> {
  const { data, error } = await supabaseAdmin.rpc("access_state", { _uid: userId });
  if (error) throw new AppError("db", "Não foi possível verificar seu acesso.", 500);
  return data as unknown as Access;
}

export async function getSettings() {
  const { data, error } = await supabaseAdmin
    .from("app_settings")
    .select("*")
    .eq("id", true)
    .single();
  if (error || !data) throw new AppError("db", "Configurações indisponíveis.", 500);
  return data;
}

/** Authenticate a raw server route request using the Supabase bearer token. */
export async function userFromRequest(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token || token.split(".").length !== 3)
    throw new AppError("unauthorized", "Sessão inválida.", 401);
  const url = process.env["SUPABASE_URL"]!;
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  const client = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
    global: {
      headers: { Authorization: `Bearer ${token}` },
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
  const { data, error } = await client.auth.getClaims(token);
  if (error || !data?.claims?.sub) throw new AppError("unauthorized", "Sessão inválida.", 401);
  return { userId: data.claims.sub as string, supabase: client };
}

export function jsonError(e: unknown) {
  if (e instanceof AppError)
    return Response.json({ error: e.message, code: e.code }, { status: e.status });
  console.error(e);
  return Response.json(
    { error: "Erro interno. Tente novamente.", code: "internal" },
    { status: 500 },
  );
}

export function detectImageMime(bytes: Uint8Array): string | null {
  if (
    bytes.length > 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  )
    return "image/png";
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return "image/jpeg";
  if (
    bytes.length > 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  )
    return "image/webp";
  return null;
}

export const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

export async function signedUrl(path: string, download?: string, ttl = 3600) {
  const { data } = await supabaseAdmin.storage
    .from("vupe-assets")
    .createSignedUrl(path, ttl, download ? { download } : undefined);
  return data?.signedUrl ?? null;
}

/** Remove storage files of soft-deleted assets; safe to call repeatedly. */
export async function purgeDeletedAssets(userId?: string) {
  let q = supabaseAdmin
    .from("assets")
    .select("id, storage_path")
    .not("deleted_at", "is", null)
    .is("purged_at", null)
    .limit(200);
  if (userId) q = q.eq("user_id", userId);
  const { data } = await q;
  if (!data?.length) return 0;
  const { error } = await supabaseAdmin.storage
    .from("vupe-assets")
    .remove(data.map((a) => a.storage_path));
  if (error) {
    console.error("purge failed", error.message);
    return 0;
  }
  await supabaseAdmin
    .from("assets")
    .update({ purged_at: new Date().toISOString() })
    .in(
      "id",
      data.map((a) => a.id),
    );
  return data.length;
}
