import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { AuthLayout } from "@/components/auth-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/entrar")({
  validateSearch: (s) => z.object({ redirect: z.string().optional() }).parse(s),
  head: () => ({
    meta: [
      { title: "Entrar — Vupe Studio" },
      { name: "description", content: "Acesse sua conta do Vupe Studio." },
      { property: "og:title", content: "Entrar — Vupe Studio" },
      { property: "og:description", content: "Acesse sua conta do Vupe Studio." },
    ],
  }),
  component: Login,
});

function safePath(p?: string) {
  return p && p.startsWith("/") && !p.startsWith("//") ? p : "/painel";
}

function Login() {
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (error) {
      setError(
        error.message.toLowerCase().includes("email not confirmed")
          ? "Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada."
          : error.message.toLowerCase().includes("invalid")
            ? "E-mail ou senha incorretos."
            : "Não foi possível entrar. Tente novamente.",
      );
      return;
    }
    navigate({ to: safePath(redirect) });
  };

  return (
    <AuthLayout title="Entrar" subtitle="Bem-vindo de volta ao seu estúdio.">
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">E-mail</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Senha</Label>
            <Link to="/recuperar-senha" className="text-xs font-semibold text-primary">
              Esqueci a senha
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        )}
        <Button type="submit" variant="hero" className="w-full" disabled={loading}>
          {loading && <Loader2 className="animate-spin" />} Entrar
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          Ainda não tem conta?{" "}
          <Link to="/cadastro" className="font-semibold text-primary">
            Criar conta
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
