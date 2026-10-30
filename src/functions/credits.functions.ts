import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function creditsFor(U: any, uid: string) {
  const db = U.supabaseAdmin;
  await db.rpc("sweep_expired_credits", { _uid: uid });
  const [bal, buckets, ledger, reservations] = await Promise.all([
    db.rpc("credit_balance", { _uid: uid }),
    db
      .from("credit_buckets")
      .select("id, source, granted, remaining, expires_at, created_at")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(50),
    db
      .from("credit_ledger")
      .select("id, kind, source, delta, reason, created_at, operation_item_id")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(150),
    db
      .from("credit_reservations")
      .select("id, amount, status, created_at")
      .eq("user_id", uid)
      .eq("status", "held"),
  ]);
  return {
    balance: (bal.data as any[])?.[0] ?? { available: 0, reserved: 0 },
    buckets: buckets.data ?? [],
    ledger: ledger.data ?? [],
    reservations: reservations.data ?? [],
  };
}

export const myCredits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const U = await import("@/lib/server-utils.server");
    const data = await creditsFor(U, context.userId);
    const mode = (await U.getSettings()).stripe_mode;
    const { data: sub } = await U.supabaseAdmin
      .from("subscriptions")
      .select("current_period_end, paid_through, access_state, cancel_at_period_end, plan_id")
      .eq("user_id", context.userId)
      .eq("mode", mode)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    let nextGrant: { at: string; amount: number } | null = null;
    if (
      sub &&
      sub.current_period_end &&
      !sub.cancel_at_period_end &&
      ["active_paid", "cancel_scheduled"].includes(sub.access_state)
    ) {
      const { data: plan } = await U.supabaseAdmin
        .from("plans")
        .select("credits_per_cycle")
        .eq("id", sub.plan_id!)
        .maybeSingle();
      nextGrant = { at: sub.current_period_end, amount: plan?.credits_per_cycle ?? 0 };
    }
    return { ...data, nextGrant };
  });

export const adminUserCredits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const U = await import("@/lib/server-utils.server");
    await U.assertAdmin(context.supabase, context.userId);
    return creditsFor(U, data.id);
  });

export const adminAdjustCredits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        amount: z.number().int().positive().max(1000000),
        direction: z.enum(["add", "remove"]),
        reason: z.string().trim().min(3).max(300),
        idempotencyKey: z.string().uuid(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const U = await import("@/lib/server-utils.server");
    await U.assertAdmin(context.supabase, context.userId);
    const delta = data.direction === "add" ? data.amount : -data.amount;
    const { data: res, error } = await U.supabaseAdmin.rpc("admin_adjust_credits", {
      _uid: data.userId,
      _delta: delta,
      _reason: data.reason,
      _actor: context.userId,
      _key: data.idempotencyKey,
    });
    if (error) {
      const msg = error.message.includes("INSUFFICIENT_AVAILABLE")
        ? "Retirada acima do saldo disponível (reservas não podem ser retiradas). Nada foi alterado."
        : "Não foi possível ajustar os créditos.";
      await U.audit({
        actor_id: context.userId,
        action: "credits_adjust",
        target_type: "user",
        target_id: data.userId,
        reason: data.reason,
        result: "failure",
        details: { delta },
      });
      throw new Error(msg);
    }
    await U.audit({
      actor_id: context.userId,
      action: "credits_adjust",
      target_type: "user",
      target_id: data.userId,
      reason: data.reason,
      details: { delta },
    });
    return res as { available: number; reserved: number };
  });
