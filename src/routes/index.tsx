import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bot, Layers, PenTool, Sparkles, Wand2 } from "lucide-react";
import heroImg from "@/assets/hero.jpg";
import { BrandMark } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { listPublicPlans } from "@/functions/account.functions";
import { formatBRL } from "@/lib/client-api";
import { FEATURES } from "@/lib/models";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Vupe Studio — crie, edite e vetorize imagens com IA" },
      {
        name: "description",
        content:
          "Estúdio de imagens com agentes de IA: invente, edite, componha produtos e logomarcas e vetorize em SVG.",
      },
      { property: "og:title", content: "Vupe Studio — estúdio de imagens com IA" },
      {
        property: "og:description",
        content: "Invente, edite, componha e vetorize imagens com agentes de IA.",
      },
    ],
  }),
  component: Landing,
});

const FEATURE_CARDS = [
  {
    icon: Sparkles,
    title: "Inventar imagem",
    text: "Descreva a ideia, escolha um agente e receba até 3 propostas.",
  },
  {
    icon: Wand2,
    title: "Criar e editar",
    text: "Edite fotos, combine produtos, elementos e sua logomarca numa só cena.",
  },
  {
    icon: PenTool,
    title: "Vetorizar",
    text: "Converta logos e desenhos em SVG com caminhos reais, prontos para impressão.",
  },
  {
    icon: Bot,
    title: "Agentes de IA",
    text: "Estilos curados por especialistas aplicados com um clique.",
  },
];

function Landing() {
  const plans = useQuery({ queryKey: ["public-plans"], queryFn: () => listPublicPlans() });
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-4 py-5 sm:px-6">
        <BrandMark />
        <div className="flex gap-2">
          <Button asChild variant="ghost">
            <Link to="/entrar">Entrar</Link>
          </Button>
          <Button asChild variant="hero">
            <Link to="/cadastro">Começar teste</Link>
          </Button>
        </div>
      </header>

      <section className="relative overflow-hidden bg-hero">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 pb-16 pt-10 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pt-16">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-semibold text-muted-foreground">
              <Layers className="size-3.5 text-primary" /> Estúdio de imagens com IA
            </span>
            <h1 className="mt-5 text-4xl font-bold leading-[1.05] sm:text-6xl">
              Da ideia à arte final,{" "}
              <span className="bg-gradient-primary bg-clip-text text-transparent">
                no mesmo estúdio.
              </span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted-foreground">
              Invente imagens, edite fotos, monte composições com seus produtos e logomarca e
              vetorize em SVG — com agentes de IA que já conhecem o estilo certo.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" variant="hero">
                <Link to="/cadastro">Criar conta grátis</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <a href="#planos">Ver planos</a>
              </Button>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Teste sem cartão. Nenhuma cobrança automática ao final do teste.
            </p>
          </div>
          <div className="relative">
            <div className="absolute -inset-6 rounded-[2.5rem] bg-gradient-primary opacity-20 blur-3xl" />
            <div className="hero-art relative rounded-[2rem] border shadow-soft">
              <img
                src={heroImg}
                alt="Composição de produtos, amostras de cor e esboço vetorial"
                className="aspect-[3/2] w-full object-cover"
                width={1536}
                height={1024}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURE_CARDS.map((f) => (
            <div key={f.title} className="rounded-3xl border bg-panel p-6 shadow-soft">
              <div className="flex size-11 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
                <f.icon className="size-5" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="planos" className="mx-auto max-w-7xl px-4 pb-20 sm:px-6">
        <h2 className="text-3xl font-bold">Planos</h2>
        <p className="mt-1 text-muted-foreground">
          Cada imagem gerada, editada ou variada com sucesso consome 1 crédito.
        </p>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {plans.isLoading && <p className="text-sm text-muted-foreground">Carregando planos…</p>}
          {plans.error && (
            <p className="text-sm text-destructive">Não foi possível carregar os planos.</p>
          )}
          {plans.data?.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum plano publicado no momento.</p>
          )}
          {plans.data?.map((p) => (
            <div
              key={p.id}
              className={`flex flex-col rounded-3xl border bg-panel p-6 shadow-soft ${p.highlight ? "ring-2 ring-primary" : ""}`}
            >
              {p.highlight && (
                <span className="mb-3 self-start rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                  Destaque
                </span>
              )}
              <h3 className="text-xl font-semibold">{p.name}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{p.description}</p>
              <p className="mt-4 font-display text-3xl font-bold">
                {formatBRL(p.price_cents)}
                {p.price_cents !== null && (
                  <span className="text-base font-medium text-muted-foreground">
                    /{p.billing_interval === "month" ? "mês" : "ano"}
                  </span>
                )}
              </p>
              <ul className="mt-4 flex-1 space-y-1.5 text-sm">
                <li>{p.credits_per_cycle} créditos por ciclo</li>
                <li>Até {p.max_batch} resultado(s) por operação</li>
                {FEATURES.filter((f) => p.allowed_features.includes(f.id)).map((f) => (
                  <li key={f.id}>{f.label}</li>
                ))}
              </ul>
              <Button asChild className="mt-6" variant={p.highlight ? "hero" : "outline"}>
                <Link to="/cadastro" search={{ plano: p.id }}>
                  Começar com este plano
                </Link>
              </Button>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:justify-between sm:px-6">
          <span>© {new Date().getFullYear()} Vupe Studio</span>
          <Link to="/privacidade" className="hover:text-foreground">
            Privacidade e dados
          </Link>
        </div>
      </footer>
    </div>
  );
}
