import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PUBLIC_COLS = "id, name, public_description, image_url, purpose, status, settings, allowed_plan_ids, current_version, created_at, updated_at";

/** Agents visible to the caller: active + allowed by the plan currently granting access. */
export const listMyAgents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const U = await import("@/lib/server-utils.server");
    const access = await U.getAccess(context.userId);
    const { data } = await U.supabaseAdmin.from("agents").select(PUBLIC_COLS).eq("status", "active").is("deleted_at", null).order("name");
    const planId = access.plan_id;
    return (data ?? []).filter((a) => access.code === "admin" || !a.allowed_plan_ids.length || (planId && a.allowed_plan_ids.includes(planId)));
  });

export const adminListAgents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const U = await import("@/lib/server-utils.server");
    await U.assertAdmin(context.supabase, context.userId);
    const { data } = await U.supabaseAdmin.from("agents").select(PUBLIC_COLS).is("deleted_at", null).order("created_at", { ascending: false });
    return data ?? [];
  });

/** Admin-only: returns the private base prompt for editing. Never used by subscriber flows. */
export const adminGetAgentPrompt = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const U = await import("@/lib/server-utils.server");
    await U.assertAdmin(context.supabase, context.userId);
    const { data: a } = await U.supabaseAdmin.from("agents").select("current_version").eq("id", data.id).single();
    const { data: v } = await U.supabaseAdmin.from("agent_versions").select("base_prompt").eq("agent_id", data.id).eq("version", a!.current_version).maybeSingle();
    return { base_prompt: v?.base_prompt ?? "" };
  });

const agentSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(80),
  public_description: z.string().max(500),
  image_url: z.string().max(500).nullable(),
  purpose: z.enum(["invent", "create"]),
  base_prompt: z.string().trim().min(1).max(8000),
  allowed_plan_ids: z.array(z.string().uuid()).max(50),
  settings: z.object({ default_model: z.string().optional(), default_aspect: z.string().optional() }).default({}),
});

export const adminSaveAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => agentSchema.parse(d))
  .handler(async ({ data, context }) => {
    const U = await import("@/lib/server-utils.server");
    await U.assertAdmin(context.supabase, context.userId);
    if (data.image_url && !data.image_url.startsWith("/api/public/media/")) throw new Error("Imagem inválida.");
    const db = U.supabaseAdmin;
    const { id, base_prompt, ...fields } = data;
    if (!id) {
      const { data: a, error } = await db.from("agents").insert({ ...fields, status: "inactive", current_version: 1 } as never).select(PUBLIC_COLS).single();
      if (error || !a) throw new Error("Falha ao criar o agente.");
      await db.from("agent_versions").insert({ agent_id: a.id, version: 1, name: a.name, base_prompt, created_by: context.userId });
      await U.audit({ actor_id: context.userId, action: "agent_created", target_type: "agent", target_id: a.id });
      return a;
    }
    const { data: prev } = await db.from("agents").select("current_version, name").eq("id", id).single();
    if (!prev) throw new Error("Agente não encontrado.");
    const { data: pv } = await db.from("agent_versions").select("base_prompt").eq("agent_id", id).eq("version", prev.current_version).maybeSingle();
    let version = prev.current_version;
    if (pv?.base_prompt !== base_prompt || prev.name !== fields.name) {
      version += 1;
      await db.from("agent_versions").insert({ agent_id: id, version, name: fields.name, base_prompt, created_by: context.userId });
    }
    const { data: a, error } = await db.from("agents").update({ ...fields, current_version: version } as never).eq("id", id).select(PUBLIC_COLS).single();
    if (error) throw new Error("Falha ao salvar o agente.");
    await U.audit({ actor_id: context.userId, action: "agent_updated", target_type: "agent", target_id: id, details: { version } });
    return a;
  });

export const adminSetAgentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), status: z.enum(["active", "inactive"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const U = await import("@/lib/server-utils.server");
    await U.assertAdmin(context.supabase, context.userId);
    const { error } = await U.supabaseAdmin.from("agents").update({ status: data.status }).eq("id", data.id);
    if (error) throw new Error("Falha ao alterar o status.");
    await U.audit({ actor_id: context.userId, action: "agent_status", target_type: "agent", target_id: data.id, details: { status: data.status } });
    return { ok: true };
  });

export const adminDeleteAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const U = await import("@/lib/server-utils.server");
    await U.assertAdmin(context.supabase, context.userId);
    // Soft delete: history keeps agent name/version snapshots.
    const { error } = await U.supabaseAdmin.from("agents").update({ deleted_at: new Date().toISOString(), status: "inactive" }).eq("id", data.id);
    if (error) throw new Error("Falha ao excluir o agente.");
    await U.audit({ actor_id: context.userId, action: "agent_deleted", target_type: "agent", target_id: data.id });
    return { ok: true };
  });
