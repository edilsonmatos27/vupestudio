import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { LoadingState, PageHeader, StatusBadge } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { updateProfile } from "@/server/account.functions";
import { useMe } from "@/hooks/use-me";
import { errorMessage, formatDate } from "@/lib/client-api";

export const Route = createFileRoute("/_authenticated/perfil")({
  head: () => ({ meta: [{ title: "Perfil e segurança — Vupe Studio" }, { name: "description", content: "Seus dados e senha." }] }),
  component: Profile,
});

function Profile() {
  const qc = useQueryClient();
  const { data: me, isLoading } = useMe();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [pwBusy, setPwBusy] = useState(false);
  useEffect(() => setName(me?.profile?.name ?? ""), [me?.profile?.name]);
  if (isLoading || !me) return <LoadingState />;

  const save = async () => {
    setSaving(true);
    try {
      await updateProfile({ data: { name } });
      toast.success("Perfil salvo.");
      qc.invalidateQueries({ queryKey: ["me"] });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };
  const changePw = async () => {
    if (pw.next.length < 8) return toast.error("A nova senha precisa de ao menos 8 caracteres.");
    if (pw.next !== pw.confirm) return toast.error("As senhas não coincidem.");
    setPwBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw.next, current_password: pw.current } as never);
    setPwBusy(false);
    if (error) return toast.error(error.message.toLowerCase().includes("current") ? "Senha atual incorreta." : "Não foi possível alterar a senha.");
    toast.success("Senha alterada.");
    setPw({ current: "", next: "", confirm: "" });
  };

  return (
    <div className="max-w-2xl">
      <PageHeader title="Perfil e segurança" />
      <div className="space-y-6">
        <div className="rounded-3xl border bg-card p-6 shadow-soft">
          <h2 className="text-lg font-semibold">Dados</h2>
          <div className="mt-4 space-y-4">
            <div className="space-y-1.5"><Label>Nome</Label><Input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>E-mail</Label><Input value={me.profile?.email ?? ""} disabled /></div>
            <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">Perfil: <StatusBadge status={me.isAdmin ? "admin" : me.access.code} /> · Conta criada em {formatDate(me.profile?.created_at)}</div>
            <Button onClick={save} disabled={saving || !name.trim()}>{saving && <Loader2 className="animate-spin" />} Salvar</Button>
          </div>
        </div>
        <div className="rounded-3xl border bg-card p-6 shadow-soft">
          <h2 className="text-lg font-semibold">Alterar senha</h2>
          <div className="mt-4 space-y-4">
            <div className="space-y-1.5"><Label>Senha atual</Label><Input type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Nova senha</Label><Input type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Confirmar nova senha</Label><Input type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} /></div>
            <Button onClick={changePw} disabled={pwBusy || !pw.current || !pw.next}>{pwBusy && <Loader2 className="animate-spin" />} Alterar senha</Button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">Para excluir sua conta, entre em contato com o administrador. Veja a página de <a href="/privacidade" className="underline">privacidade</a>.</p>
      </div>
    </div>
  );
}
