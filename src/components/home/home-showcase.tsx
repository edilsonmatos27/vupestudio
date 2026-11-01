import { useEffect, useMemo, useRef, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import AutoScroll from "embla-carousel-auto-scroll";
import { ArrowLeft, ArrowRight, Expand, Pause, Play, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import * as Dialog from "@radix-ui/react-dialog";
import { HomeReveal } from "./home-reveal";
import { SHOWCASE_IMAGES, showcaseSrc } from "./showcase-images";

export function HomeShowcase() {
  const plugin = useMemo(
    () =>
      AutoScroll({
        speed: 0.45,
        startDelay: 0,
        playOnInit: false,
        stopOnInteraction: true,
        stopOnMouseEnter: false,
        stopOnFocusIn: false,
      }),
    [],
  );
  const [viewportRef, api] = useEmblaCarousel(
    { loop: true, align: "start", dragFree: true, skipSnaps: true },
    [plugin],
  );
  const section = useRef<HTMLElement>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const [manualPause, setManualPause] = useState(false);
  const [hoverPause, setHoverPause] = useState(false);
  const [focusPause, setFocusPause] = useState(false);
  const [reduced, setReduced] = useState(true);
  const [inView, setInView] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const image = selected === null ? null : SHOWCASE_IMAGES[selected];

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    const visibility = () => setHidden(document.hidden);
    update();
    visibility();
    media.addEventListener("change", update);
    document.addEventListener("visibilitychange", visibility);
    const observer = new IntersectionObserver(([entry]) => setInView(!!entry?.isIntersecting), {
      threshold: 0.05,
    });
    if (section.current) observer.observe(section.current);
    return () => {
      media.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", visibility);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!api) return;
    const pauseOnDrag = () => setManualPause(true);
    api.on("pointerDown", pauseOnDrag);
    return () => {
      api.off("pointerDown", pauseOnDrag);
    };
  }, [api]);

  useEffect(() => {
    if (!api) return;
    const paused =
      manualPause || hoverPause || focusPause || reduced || !inView || hidden || selected !== null;
    const update = () => {
      if (paused) plugin.stop();
      else plugin.play();
    };
    update();
    api.on("reInit", update);
    return () => {
      api.off("reInit", update);
      plugin.stop();
    };
  }, [api, plugin, manualPause, hoverPause, focusPause, reduced, inView, hidden, selected]);

  const navigate = (direction: -1 | 1) => {
    setManualPause(true);
    plugin.stop();
    if (direction === -1) api?.scrollPrev();
    else api?.scrollNext();
  };

  return (
    <section
      ref={section}
      className="home-showcase mx-auto max-w-7xl px-4 pb-20 sm:px-6"
      aria-labelledby="showcase-title"
      onMouseEnter={() => setHoverPause(true)}
      onMouseLeave={() => setHoverPause(false)}
      onFocusCapture={() => setFocusPause(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocusPause(false);
      }}
    >
      <div data-home-sequence>
        <HomeReveal>
          <div className="mb-7 flex flex-wrap items-end justify-between gap-5">
            <div>
              <h2 id="showcase-title" className="max-w-3xl text-3xl font-bold sm:text-4xl">
                Veja o que você pode criar no Vupe Studio
              </h2>
              <p className="mt-3 text-muted-foreground">
                Da foto original à sua próxima grande ideia.
              </p>
            </div>
            <div className="flex items-center gap-2" aria-label="Controles do carrossel">
              <Button
                size="sm"
                variant="outline"
                disabled={reduced}
                aria-pressed={manualPause}
                aria-controls="home-gallery"
                onClick={() => {
                  const next = !manualPause;
                  setManualPause(next);
                  if (!next) {
                    setFocusPause(false);
                    setHoverPause(false);
                  }
                }}
              >
                {manualPause || reduced ? (
                  <Play aria-hidden="true" />
                ) : (
                  <Pause aria-hidden="true" />
                )}
                {reduced
                  ? "Movimento reduzido"
                  : manualPause
                    ? "Retomar movimento"
                    : "Pausar movimento"}
              </Button>
              <Button
                size="icon"
                variant="outline"
                aria-label="Imagem anterior"
                aria-controls="home-gallery"
                onClick={() => navigate(-1)}
              >
                <ArrowLeft />
              </Button>
              <Button
                size="icon"
                variant="outline"
                aria-label="Próxima imagem"
                aria-controls="home-gallery"
                onClick={() => navigate(1)}
              >
                <ArrowRight />
              </Button>
            </div>
          </div>
        </HomeReveal>
        <HomeReveal>
          <div
            ref={viewportRef}
            id="home-gallery"
            className="home-gallery-viewport"
            role="region"
            aria-roledescription="carrossel"
            aria-label="Exemplos de imagens"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                event.preventDefault();
                navigate(event.key === "ArrowLeft" ? -1 : 1);
              }
            }}
          >
            <div className="home-gallery-track" aria-live="off">
              {SHOWCASE_IMAGES.map((item, index) => (
                <div
                  key={item.slug}
                  className="home-gallery-slide"
                  role="group"
                  aria-roledescription="slide"
                  aria-label={`${index + 1} de ${SHOWCASE_IMAGES.length}`}
                >
                  <button
                    type="button"
                    className="home-gallery-image"
                    aria-label={`Ampliar: ${item.title}`}
                    onClick={(event) => {
                      plugin.stop();
                      setManualPause(true);
                      opener.current = event.currentTarget;
                      setSelected(index);
                    }}
                  >
                    <img
                      src={showcaseSrc(item.slug, 640)}
                      srcSet={`${showcaseSrc(item.slug, 640)} 640w, ${showcaseSrc(item.slug, 1280)} 1280w`}
                      sizes="(min-width: 1280px) 370px, (min-width: 1024px) 29vw, (min-width: 640px) 44vw, 84vw"
                      alt={item.alt}
                      width={1586}
                      height={992}
                      loading="lazy"
                      decoding="async"
                      draggable={false}
                    />
                    <span className="home-gallery-expand">
                      <Expand className="size-4" aria-hidden="true" />
                    </span>
                  </button>
                  <p className="mt-3 px-1 text-sm font-medium text-muted-foreground">
                    {item.title}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </HomeReveal>
      </div>
      <Dialog.Root
        open={!!image}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="home-showcase-overlay fixed inset-0 z-50 bg-black/80" />
          <Dialog.Content
            className="home-showcase-dialog fixed left-1/2 top-1/2 z-50 grid max-h-[92dvh] w-full max-w-6xl -translate-x-1/2 -translate-y-1/2 gap-3 overflow-y-auto rounded-2xl border bg-background p-3 shadow-soft sm:p-5"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              opener.current?.focus();
            }}
          >
            <Dialog.Title className="pr-9 text-base">{image?.title}</Dialog.Title>
            <Dialog.Description className="sr-only">
              Imagem demonstrativa ampliada. Pressione Escape para fechar.
            </Dialog.Description>
            {image && (
              <img
                src={showcaseSrc(image.slug, 1280)}
                alt={image.alt}
                width={1586}
                height={992}
                className="max-h-[78dvh] w-full rounded-xl object-contain"
              />
            )}
            <Dialog.Close asChild>
              <Button
                size="icon"
                variant="ghost"
                className="absolute right-2 top-2"
                aria-label="Fechar imagem"
              >
                <X />
              </Button>
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  );
}
