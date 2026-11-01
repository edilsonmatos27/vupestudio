import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bot, Box, ImagePlus, Layers, RotateCcw, Wand2 } from "lucide-react";
import heroBefore from "@/assets/hero-antes.png.asset.json";
import heroAfter from "@/assets/hero-depois.png.asset.json";
import { BeforeAfterSlider } from "@/components/before-after-slider";
import { ScrollReveal } from "@/components/scroll-reveal";
import { BrandMark } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { listPublicPlans } from "@/functions/account.functions";
import { formatBRL } from "@/lib/client-api";
import { FEATURES } from "@/lib/models";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Vupe Studio — crie e edite imagens com IA" },
      {
        name: "description",
        content:
          "Estúdio de imagens com agentes de IA: edite fotos, componha produtos e logomarcas e gere variações.",
      },
      { property: "og:title", content: "Vupe Studio — estúdio de imagens com IA" },
      {
        property: "og:description",
        content: "Edite, componha e gere variações de imagens com agentes de IA.",
      },
    ],
  }),
  component: Landing,
});

const FEATURE_CARDS = [
  {
    icon: ImagePlus,
    title: "Criar",
    text: "Monte artes combinando seus produtos, elementos e logomarca numa só cena.",
  },
  {
    icon: Wand2,
    title: "Editar",
    text: "Transforme fotos, troque fundos e ajuste detalhes com inteligência artificial.",
  },
  {
    icon: RotateCcw,
    title: "Restaurar",
    text: "Recupere fotos antigas, melhore a nitidez e renove suas lembranças.",
  },
  {
    icon: Box,
    title: "Renderizar",
    text: "Dê mais realismo aos seus projetos com iluminação, materiais e texturas.",
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
    <div className="min-h-screen bg-background pt-28 sm:pt-32">
      <header className="landing-nav fixed inset-x-3 top-3 z-50 mx-auto flex max-w-7xl items-center justify-between gap-2 rounded-3xl border border-border bg-background/85 px-3 py-3 shadow-soft backdrop-blur-xl sm:inset-x-6 sm:top-5 sm:px-6 sm:py-4">
        <Link to="/" aria-label="Vupe Studio — início" className="landing-brand min-w-0">
          <BrandMark />
        </Link>
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <Button asChild variant="ghost" className="px-2 sm:px-4">
            <Link to="/entrar">Entrar</Link>
          </Button>
          <Button asChild variant="hero" className="px-3 text-xs sm:px-4 sm:text-sm">
            <Link to="/cadastro">Começar teste</Link>
          </Button>
        </div>
      </header>

      <section className="relative overflow-hidden bg-hero">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 pb-16 pt-10 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pt-16">
          <div>
            <ScrollReveal>
              <span className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-semibold text-muted-foreground">
                <Layers className="size-3.5 text-primary" /> Estúdio de imagens com IA
              </span>
            </ScrollReveal>
            <ScrollReveal delay={70} className="mt-5">
              <h1 className="text-4xl font-bold leading-[1.05] sm:text-6xl">
                Da ideia à arte final, <span className="text-primary">no mesmo estúdio.</span>
              </h1>
            </ScrollReveal>
            <ScrollReveal delay={140} className="mt-5">
              <p className="max-w-xl text-lg text-muted-foreground">
                Edite fotos, monte composições com seus produtos e logomarca e gere variações — com
                agentes de IA que já conhecem o estilo certo.
              </p>
            </ScrollReveal>
            <ScrollReveal delay={210} className="mt-8">
              <div className="flex flex-wrap gap-3">
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
            </ScrollReveal>
          </div>
          <ScrollReveal delay={140} className="relative">
            <div className="absolute -inset-6 rounded-[2.5rem] bg-primary opacity-[0.06] blur-3xl" />
            <BeforeAfterSlider
              beforeSrc={heroBefore.url}
              afterSrc={heroAfter.url}
              beforeAlt="Foto original de uma atleta com tênis em ambiente urbano"
              afterAlt="Mesma foto transformada em anúncio esportivo Olympikus Corre 5"
              width={1586}
              height={992}
              className="relative w-full rounded-[2rem] border shadow-soft"
            />
          </ScrollReveal>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {FEATURE_CARDS.map((f, index) => (
            <ScrollReveal key={f.title} delay={index * 80} className="h-full">
              <div className="interactive-card h-full rounded-3xl border bg-panel p-6 shadow-soft">
                <div className="flex size-11 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
                  <f.icon className="size-5" />
                </div>
                <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{f.text}</p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </section>

      <section id="planos" className="mx-auto scroll-mt-32 max-w-7xl px-4 pb-20 sm:px-6">
        <ScrollReveal>
          <h2 className="text-3xl font-bold">Planos</h2>
          <p className="mt-1 text-muted-foreground">
            Cada imagem gerada, editada ou variada com sucesso consome 1 crédito.
          </p>
        </ScrollReveal>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {plans.isLoading && <p className="text-sm text-muted-foreground">Carregando planos…</p>}
          {plans.error && (
            <p className="text-sm text-destructive">Não foi possível carregar os planos.</p>
          )}
          {plans.data?.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum plano publicado no momento.</p>
          )}
          {plans.data?.map((p, index) => (
            <ScrollReveal key={p.id} delay={(index % 3) * 80} className="h-full">
              <div
                className={`interactive-card flex h-full flex-col rounded-3xl p-6 ${p.highlight ? "panel-featured" : "border bg-panel shadow-soft"}`}
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
            </ScrollReveal>
          ))}
        </div>
      </section>

      <ScrollReveal>
        <footer className="border-t">
          <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:justify-between sm:px-6">
            <span>© {new Date().getFullYear()} Vupe Studio</span>
            <Link to="/privacidade" className="hover:text-foreground">
              Privacidade e dados
            </Link>
          </div>
        </footer>
      </ScrollReveal>
    </div>
  );
}
