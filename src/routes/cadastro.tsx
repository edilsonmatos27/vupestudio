import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Check, Loader2, MailCheck } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { AuthLayout } from "@/components/auth-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSignupTrialInfo, listPublicPlans } from "@/server/account.functions";
import { ErrorState, LoadingState, EmptyState } from "@/components/states";
import { formatBRL, formatDuration } from "@/lib/client-api";

export const Route = createFileRoute("/cadastro")({
  validateSearch: (s) => z.object({ plano: z.string().optional() }).parse(s),
  head: () => ({
    meta: [
      { title: "Criar conta — Vupe Studio" },
      { name: "description", content: "Escolha um plano, crie sua conta e comece seu teste gratuito." },
      { property: "og:title", content: "Criar conta — Vupe Studio" },
      { property: "og:description", content: "Escolha um plano, crie sua conta e comece seu teste gratuito." },
    ],
  }),
  component: Signup,
});

const schema = z.object({
  name: z.string().trim().min(2, "Informe seu nome").max(120),
  email: z.string().trim().email("E-mail inválido").max(255),
  password: z.string().min(8, "A senha precisa de ao menos 8 caracteres").max(72),
});

function Signup() {
  const { plano } = Route.useSearch();
  const plans = useQuery({ queryKey: ["public-plans"], queryFn: () => listPublicPlans() });
  const trial = useQuery({ queryKey: ["trial-info"], queryFn: () => getSignupTrialInfo() });
  const [planId, setPlanId] = useState<string | null>(plano ?? null);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!planId || !plans.data?.some((p) => p.id === planId)) return setError("Escolha um plano para continuar.");
    const parsed = schema.safeParse(form);
    if (!parsed.success) return setError(parsed.error.issues[0]!.message);
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: { emailRedirectTo: `${window.location.origin}/painel`, data: { name: parsed.data.name, plan_id: planId } },
    });
    setLoading(false);
    if (error) {
      const m = error.message;
      setError(
        m.includes("PLAN_INVALID") || m.toLowerCase().includes("database error")
          ? "O plano escolhido não está mais disponível. Recarregue e escolha outro."
          : m.toLowerCase().includes("already")
            ? "Este e-mail já está cadastrado. Entre ou recupere sua senha."
            : m.toLowerCase().includes("password")
              ? "Senha fraca ou comprometida. Escolha outra senha."
              : "Não foi possível criar a conta. Tente novamente.",
      );
      return;
    }
    setDone(true);
  };

  if (done) {
    return (
      <AuthLayout title="Confirme seu e-mail">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-accent text-accent-foreground"><MailCheck className="size-7" /></div>
          <p className="text-sm text-muted-foreground">
            Enviamos um link de confirmação para <b className="text-foreground">{form.email}</b>. Seu período de teste começa quando você confirmar o e-mail.
          </p>
          <Button asChild variant="outline"><Link to="/entrar">Ir para o login</Link></Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Criar conta" subtitle="1. Escolha o plano · 2. Crie a conta · 3. Confirme o e-mail para iniciar o teste" wide>
      <div className="mb-6">
        <p className="mb-3 text-sm font-semibold">Plano</p>
        {plans.isLoading ? (
          <LoadingState label="Carregando planos…" />
        ) : plans.error ? (
          <ErrorState message="Não foi possível carregar os planos." onRetry={() => plans.refetch()} />
        ) : !plans.data?.length ? (
          <EmptyState title="Nenhum plano disponível" description="O cadastro reabre quando o administrador publicar um plano." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {plans.data.map((p) => (
              <button
                type="button"
                key={p.id}
                onClick={() => setPlanId(p.id)}
                className={`relative rounded-2xl border p-4 text-left transition-all ${planId === p.id ? "border-primary bg-primary/5 ring-2 ring-primary/30" : "hover:border-foreground/20"}`}
              >
                {planId === p.id && <Check className="absolute right-3 top-3 size-4 text-primary" />}
                <p className="font-display font-semibold">{p.name}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {formatBRL(p.price_cents)}{p.price_cents !== null && <>/{p.billing_interval === "month" ? "mês" : "ano"}</>} · {p.credits_per_cycle} créditos/ciclo
                </p>
              </button>
            ))}
          </div>
        )}
        {trial.data && (
          <p className="mt-3 text-xs text-muted-foreground">
            {trial.data.enabled
              ? `Teste gratuito de ${formatDuration(trial.data.minutes)} com ${trial.data.credits} créditos, sem cartão. Nenhuma cobrança automática ao final.`
              : "No momento não há período de teste: o uso exige pagamento confirmado."}
          </p>
        )}
      </div>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="name">Nome</Label>
          <Input id="name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Senha</Label>
          <Input id="password" type="password" autoComplete="new-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </div>
        {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive sm:col-span-2">{error}</p>}
        <Button type="submit" variant="hero" className="sm:col-span-2" disabled={loading || !plans.data?.length}>
          {loading && <Loader2 className="animate-spin" />} Criar conta
        </Button>
        <p className="text-center text-sm text-muted-foreground sm:col-span-2">
          Já tem conta? <Link to="/entrar" className="font-semibold text-primary">Entrar</Link> · <Link to="/privacidade" className="underline">Privacidade</Link>
        </p>
      </form>
    </AuthLayout>
  );
}
