import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { activeFeatures } from "@/lib/models";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function adminCtx(context: { supabase: any; userId: string }) {
  const U = await import("@/lib/server-utils.server");
  await U.assertAdmin(context.supabase, context.userId);
  return U;
}

export const adminListPlans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const U = await adminCtx(context);
    const { data } = await U.supabaseAdmin
      .from("plans")
      .select("*")
      .is("archived_at", null)
      .order("sort_order");
    const { data: prices } = await U.supabaseAdmin
      .from("plan_prices")
      .select("*")
      .order("created_at", { ascending: false });
    const s = await U.getSettings();
    return { plans: data ?? [], prices: prices ?? [], mode: s.stripe_mode };
  });

const planSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(80),
  description: z.string().max(600),
  price_cents: z.number().int().min(0).max(100000000).nullable(),
  billing_type: z.enum(["recurring", "one_time"]).default("recurring"),
  billing_interval: z.enum(["month", "year"]),
  credits_per_cycle: z.number().int().min(0).max(1000000),
  allowed_features: z.array(z.string()).max(10).transform(activeFeatures),
  allowed_models: z.array(z.string()).max(20),
  max_batch: z.number().int().min(1).max(3),
  highlight: z.boolean(),
  trial_override: z
    .object({
      enabled: z.boolean().optional(),
      duration_minutes: z.number().int().min(0).optional(),
      credits: z.number().int().min(0).optional(),
    })
    .nullable(),
});

export const adminSavePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => planSchema.parse(d))
  .handler(async ({ data, context }) => {
    const U = await adminCtx(context);
    const { id, ...fields } = data;
    if (id) {
      const { data: prev } = await U.supabaseAdmin
        .from("plans")
        .select("*")
        .eq("id", id)
        .is("archived_at", null)
        .single();
      if (!prev) throw new Error("Plano não encontrado.");
      const priceChanged =
        prev.price_cents !== fields.price_cents ||
        prev.billing_interval !== fields.billing_interval ||
        prev.billing_type !== fields.billing_type;
      const patch: Record<string, unknown> = { ...fields };
      // Changing price/interval detaches current Stripe prices; existing contracts keep their old price.
      if (priceChanged) {
        patch["stripe_price_id_test"] = null;
        patch["stripe_price_id_live"] = null;
      }
      const { data: saved, error } = await U.supabaseAdmin
        .from("plans")
        .update(patch as never)
        .eq("id", id)
        .is("archived_at", null)
        .select("*")
        .single();
      if (error) throw new Error("Falha ao salvar o plano.");
      await U.audit({
        actor_id: context.userId,
        action: "plan_updated",
        target_type: "plan",
        target_id: id,
        details: { priceChanged },
      });
      return { plan: saved, priceChanged };
    }
    const { data: max } = await U.supabaseAdmin
      .from("plans")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data: saved, error } = await U.supabaseAdmin
      .from("plans")
      .insert({ ...fields, status: "draft", sort_order: (max?.sort_order ?? 0) + 1 } as never)
      .select("*")
      .single();
    if (error) throw new Error("Falha ao criar o plano.");
    await U.audit({
      actor_id: context.userId,
      action: "plan_created",
      target_type: "plan",
      target_id: saved.id,
    });
    return { plan: saved, priceChanged: false };
  });

export const adminSetPlanStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), status: z.enum(["draft", "active", "inactive"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const U = await adminCtx(context);
    const { data: saved, error } = await U.supabaseAdmin
      .from("plans")
      .update({ status: data.status })
      .eq("id", data.id)
      .is("archived_at", null)
      .select("*")
      .single();
    if (error) throw new Error("Falha ao alterar o status.");
    await U.audit({
      actor_id: context.userId,
      action: "plan_status",
      target_type: "plan",
      target_id: data.id,
      details: { status: data.status },
    });
    return saved;
  });

export const adminReorderPlans = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ ids: z.array(z.string().uuid()).max(100) }).parse(d))
  .handler(async ({ data, context }) => {
    const U = await adminCtx(context);
    for (let i = 0; i < data.ids.length; i++)
      await U.supabaseAdmin
        .from("plans")
        .update({ sort_order: i + 1 })
        .eq("id", data.ids[i]!)
        .is("archived_at", null);
    return { ok: true };
  });

/** Hide an offer and block new sales; existing paid access and billing keep their records. */
export const adminArchivePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const U = await adminCtx(context);
    const { data: saved, error } = await U.supabaseAdmin
      .from("plans")
      .update({ archived_at: new Date().toISOString(), status: "inactive" })
      .eq("id", data.id)
      .is("archived_at", null)
      .select("id, name")
      .maybeSingle();
    if (error) throw new Error("Não foi possível arquivar o plano. Tente novamente.");
    if (!saved) throw new Error("Plano não encontrado ou já arquivado. Atualize a lista.");
    await U.audit({
      actor_id: context.userId,
      action: "plan_archived",
      target_type: "plan",
      target_id: saved.id,
      details: { name: saved.name },
    });
    return { ok: true };
  });

export const adminDeletePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const U = await adminCtx(context);
    const db = U.supabaseAdmin;
    const { data: plan, error: readError } = await db
      .from("plans")
      .select("id, name, status, updated_at, stripe_price_id_test, stripe_price_id_live")
      .eq("id", data.id)
      .maybeSingle();
    if (readError) throw new Error("Não foi possível verificar o plano. Tente novamente.");
    if (!plan) throw new Error("Plano não encontrado. Atualize a lista.");
    if (plan.status === "active") throw new Error("Desative o plano antes de excluí-lo.");
    if (plan.stripe_price_id_test || plan.stripe_price_id_live)
      throw new Error(
        "Este plano já foi publicado na Stripe. Use Arquivar para retirá-lo da lista e preservar pagamentos e assinaturas.",
      );

    // Check both Stripe environments and historical links. These UUID columns do
    // not have foreign keys; deleting a used plan would break access/history.
    const links = await Promise.all([
      db.from("profiles").select("id").eq("selected_plan_id", data.id).limit(1),
      db.from("trials").select("user_id").eq("plan_id", data.id).limit(1),
      db.from("subscriptions").select("id").eq("plan_id", data.id).limit(1),
      db.from("invoices").select("id").eq("plan_id", data.id).limit(1),
      db.from("agents").select("id").contains("allowed_plan_ids", [data.id]).limit(1),
      // Old Stripe prices remain relevant even after the plan's price changes.
      db.from("plan_prices").select("id").eq("plan_id", data.id).limit(1),
      db.from("prepaid_purchases").select("id").eq("plan_id", data.id).limit(1),
    ]);
    if (links.some((link) => link.error))
      throw new Error("Não foi possível verificar os vínculos do plano. Tente novamente.");
    if (links.some((link) => link.data?.length))
      throw new Error(
        "Este plano possui cadastros, histórico, agentes vinculados ou preços na Stripe. Use Arquivar para retirá-lo da lista sem apagar o histórico.",
      );

    // Refuse deletion if another admin edits/reactivates the plan during checks.
    const { data: deleted, error } = await db
      .from("plans")
      .delete()
      .eq("id", plan.id)
      .eq("status", plan.status)
      .eq("updated_at", plan.updated_at)
      .select("id")
      .maybeSingle();
    if (error) throw new Error("Não foi possível excluir o plano. Tente novamente.");
    if (!deleted) throw new Error("O plano foi alterado. Atualize a lista e tente novamente.");
    await U.audit({
      actor_id: context.userId,
      action: "plan_deleted",
      target_type: "plan",
      target_id: plan.id,
      details: { name: plan.name, status: plan.status },
    });
    return { ok: true };
  });

/** Creates (or reuses) the Stripe product and a new price for the plan's current amount. */
export const adminSyncPlanStripe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const U = await adminCtx(context);
    const S = await import("@/lib/stripe.server");
    const mode = await S.currentMode();
    const { secretKey } = await S.getStripeSecrets(mode);
    const { data: plan } = await U.supabaseAdmin
      .from("plans")
      .select("*")
      .eq("id", data.id)
      .is("archived_at", null)
      .single();
    if (!plan) throw new Error("Plano não encontrado.");
    if (plan.price_cents === null || plan.price_cents <= 0)
      throw new Error("Defina um preço maior que zero antes de publicar na Stripe.");
    const productCol = mode === "test" ? "stripe_product_id_test" : "stripe_product_id_live";
    const priceCol = mode === "test" ? "stripe_price_id_test" : "stripe_price_id_live";
    let productId = (plan as any)[productCol] as string | null;
    if (productId) {
      await S.stripeRequest(secretKey, "POST", `/v1/products/${productId}`, {
        name: plan.name,
        description: plan.description || undefined,
      });
    } else {
      const prod = await S.stripeRequest(secretKey, "POST", "/v1/products", {
        name: plan.name,
        description: plan.description || undefined,
        metadata: { vupe_plan_id: plan.id },
      });
      productId = prod.id as string;
    }
    // Reuse an existing price with identical amount/interval; otherwise create a new one (old prices stay for existing contracts).
    const { data: existing } = await U.supabaseAdmin
      .from("plan_prices")
      .select("*")
      .eq("plan_id", plan.id)
      .eq("mode", mode)
      .eq("amount_cents", plan.price_cents)
      .eq("billing_interval", plan.billing_interval)
      .eq("billing_type", plan.billing_type)
      .eq("active", true)
      .maybeSingle();
    let priceId = existing?.stripe_price_id;
    if (!priceId) {
      const price = await S.stripeRequest(secretKey, "POST", "/v1/prices", {
        product: productId,
        currency: "brl",
        unit_amount: plan.price_cents,
        recurring:
          plan.billing_type === "one_time" ? undefined : { interval: plan.billing_interval },
        metadata: { vupe_plan_id: plan.id },
      });
      priceId = price.id as string;
      await U.supabaseAdmin.from("plan_prices").insert({
        plan_id: plan.id,
        mode,
        stripe_product_id: productId,
        stripe_price_id: priceId,
        amount_cents: plan.price_cents,
        currency: "brl",
        billing_interval: plan.billing_interval,
        billing_type: plan.billing_type,
      });
    }
    await U.supabaseAdmin
      .from("plans")
      .update({ [productCol]: productId, [priceCol]: priceId } as never)
      .eq("id", plan.id);
    await U.audit({
      actor_id: context.userId,
      action: "plan_stripe_synced",
      target_type: "plan",
      target_id: plan.id,
      details: { mode, priceId },
    });
    return { productId, priceId, mode };
  });
