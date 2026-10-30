import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  BadgeDollarSign,
  Bot,
  ChevronsLeft,
  ChevronsRight,
  Coins,
  CreditCard,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Palette,
  PenTool,
  Settings,
  ShieldCheck,
  Sparkles,
  Sun,
  User,
  Users,
  Wand2,
  Receipt,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/use-me";
import { BrandMark } from "@/components/brand";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { AccessBanner } from "@/components/access-banner";

type Item = { to: string; label: string; icon: typeof Sparkles };

const COMMON_TOP: Item[] = [
  { to: "/painel", label: "Visão geral", icon: LayoutDashboard },
  { to: "/inventar", label: "Inventar imagem", icon: Sparkles },
  { to: "/criar", label: "Criar imagem", icon: Wand2 },
  { to: "/vetorizar", label: "Vetorizar", icon: PenTool },
  { to: "/agentes", label: "Agentes de IA", icon: Bot },
  { to: "/historico", label: "Meu histórico", icon: History },
];

const ADMIN_ITEMS: Item[] = [
  { to: "/admin/assinantes", label: "Assinantes", icon: Users },
  { to: "/admin/assinaturas", label: "Assinaturas", icon: Receipt },
  { to: "/admin/planos", label: "Planos", icon: BadgeDollarSign },
  { to: "/admin/pagamentos", label: "Pagamentos", icon: CreditCard },
  { to: "/admin/configuracoes", label: "Administração", icon: Settings },
  { to: "/creditos", label: "Créditos disponíveis", icon: Coins },
];

const SUB_ITEMS: Item[] = [
  { to: "/creditos", label: "Créditos disponíveis", icon: Coins },
  { to: "/planos", label: "Planos", icon: BadgeDollarSign },
];

function useTheme() {
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);
  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("vupe-theme", next ? "dark" : "light");
    } catch {}
  };
  return { dark, toggle };
}

function NavList({
  items,
  collapsed,
  onNavigate,
}: {
  items: Item[];
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="flex flex-col gap-1">
      {items.map((it) => {
        const active = path === it.to || (it.to !== "/painel" && path.startsWith(it.to));
        const Icon = it.icon;
        return (
          <Link
            key={it.to + it.label}
            to={it.to}
            onClick={onNavigate}
            title={collapsed ? it.label : undefined}
            className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
            } ${collapsed ? "justify-center px-2" : ""}`}
          >
            <Icon className={`size-[18px] shrink-0 ${active ? "text-sidebar-primary" : ""}`} />
            {!collapsed && <span className="truncate">{it.label}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { data: me } = useMe();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { dark, toggle } = useTheme();
  const isAdmin = !!me?.isAdmin;
  const items = isAdmin ? [...COMMON_TOP, ...ADMIN_ITEMS] : [...COMMON_TOP, ...SUB_ITEMS];

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("vupe-sidebar") === "1");
    } catch {}
  }, []);
  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem("vupe-sidebar", c ? "0" : "1");
      } catch {}
      return !c;
    });
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/entrar" });
  };

  const initials = (me?.profile?.name || me?.profile?.email || "?").slice(0, 1).toUpperCase();

  return (
    <div className="flex min-h-screen bg-background">
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar p-3 transition-[width] duration-200 lg:flex ${collapsed ? "w-[76px]" : "w-64"}`}
      >
        <div
          className={`mb-6 flex items-center px-2 pt-2 ${collapsed ? "justify-center" : "justify-between"}`}
        >
          <Link to="/painel">
            <BrandMark collapsed={collapsed} inverted />
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto">
          <NavList items={items} collapsed={collapsed} />
        </div>
        <button
          onClick={toggleCollapsed}
          className="mt-3 flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
        >
          {collapsed ? (
            <ChevronsRight className="size-4" />
          ) : (
            <>
              <ChevronsLeft className="size-4" /> Recolher
            </>
          )}
        </button>
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 border-sidebar-border bg-sidebar p-4">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <div className="mb-6 px-2 pt-1">
            <BrandMark inverted />
          </div>
          <NavList items={items} collapsed={false} onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur sm:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Abrir menu"
          >
            <Menu className="size-5" />
          </Button>
          <div className="lg:hidden">
            <BrandMark collapsed />
          </div>
          <div className="flex-1" />
          {me && (
            <Link
              to="/creditos"
              className="hidden items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-sm font-semibold sm:flex"
            >
              <Coins className="size-4 text-primary" />
              {isAdmin ? "Admin" : `${me.balance.available} créditos`}
            </Link>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex size-9 items-center justify-center rounded-full bg-gradient-primary font-display text-sm font-bold text-primary-foreground"
                aria-label="Menu da conta"
              >
                {initials}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel className="font-normal">
                <p className="truncate text-sm font-semibold">
                  {me?.profile?.name || "Minha conta"}
                </p>
                <p className="truncate text-xs text-muted-foreground">{me?.profile?.email}</p>
                {isAdmin && (
                  <p className="mt-1 inline-flex items-center gap-1 text-xs text-primary">
                    <ShieldCheck className="size-3" /> Admin master
                  </p>
                )}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate({ to: "/perfil" })}>
                <User /> Perfil e segurança
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate({ to: "/projetos" })}>
                <Palette /> Projetos
              </DropdownMenuItem>
              {isAdmin && (
                <DropdownMenuItem onClick={() => navigate({ to: "/planos" })}>
                  <BadgeDollarSign /> Página de planos
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={toggle}>
                {dark ? <Sun /> : <Moon />} Tema {dark ? "claro" : "escuro"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={signOut}>
                <LogOut /> Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:py-8">
          <AccessBanner />
          {children}
        </main>
      </div>
    </div>
  );
}
