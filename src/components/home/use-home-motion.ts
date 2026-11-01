import { useEffect, type RefObject } from "react";

/** All selectors and listeners are scoped to the public home, with complete teardown. */
export function useHomeMotion(ref: RefObject<HTMLDivElement | null>, planCount: number) {
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    let cancelled = false;
    let revert = () => {};
    const nav = root.querySelector<HTMLElement>(".landing-nav");
    const updateNav = () => nav?.toggleAttribute("data-scrolled", window.scrollY > 24);
    updateNav();
    window.addEventListener("scroll", updateNav, { passive: true });

    // Load home animations only when this page mounts; leave content visible on failure.
    void Promise.all([import("gsap"), import("gsap/ScrollTrigger")])
      .then(([{ gsap }, { ScrollTrigger }]) => {
        if (cancelled) return;
        gsap.registerPlugin(ScrollTrigger);
        const media = gsap.matchMedia();
        revert = () => media.revert();
        media.add(
          {
            all: "all",
            reduced: "(prefers-reduced-motion: reduce)",
            desktop: "(min-width: 1024px)",
            fine: "(hover: hover) and (pointer: fine)",
          },
          (context) => {
            if (context.conditions?.["reduced"]) return;
            const desktop = !!context.conditions?.["desktop"];
            root.querySelectorAll<HTMLElement>("[data-home-sequence]").forEach((group) => {
              const elements = Array.from(
                group.querySelectorAll<HTMLElement>("[data-home-reveal]"),
              ).filter(
                (element) =>
                  element.getBoundingClientRect().bottom > 0 &&
                  element.dataset["homeEntered"] !== "true",
              );
              if (!elements.length) return;
              gsap.fromTo(
                elements,
                { autoAlpha: 0, y: desktop ? 26 : 14, scale: desktop ? 0.985 : 1 },
                {
                  autoAlpha: 1,
                  y: 0,
                  scale: 1,
                  duration: desktop ? 0.85 : 0.55,
                  stagger: desktop ? 0.09 : 0.055,
                  onStart: () => {
                    elements.forEach((element) => {
                      element.dataset["homeEntered"] = "true";
                    });
                  },
                  ease: "power3.out",
                  scrollTrigger: { trigger: group, start: "top 90%", once: true },
                  clearProps: "opacity,visibility,transform",
                },
              );
            });
            const hero = root.querySelector<HTMLElement>("[data-home-hero]");
            const depth = root.querySelector<HTMLElement>(".home-hero-depth");
            if (desktop && hero && depth)
              gsap.to(depth, {
                y: 24,
                ease: "none",
                scrollTrigger: { trigger: hero, start: "top top", end: "bottom top", scrub: 0.8 },
              });

            let frame = 0;
            const refresh = () => {
              cancelAnimationFrame(frame);
              frame = requestAnimationFrame(() => ScrollTrigger.refresh());
            };
            const resize = new ResizeObserver(refresh);
            resize.observe(root);
            root.addEventListener("load", refresh, true);
            void document.fonts?.ready.then(() => {
              if (!cancelled) refresh();
            });
            refresh();

            let pointerFrame = 0;
            let active: HTMLElement | null = null;
            const reset = () => {
              cancelAnimationFrame(pointerFrame);
              active?.style.removeProperty("--tilt-x");
              active?.style.removeProperty("--tilt-y");
              active?.style.removeProperty("--pointer-x");
              active?.style.removeProperty("--pointer-y");
              active = null;
            };
            const move = (event: PointerEvent) => {
              if (!desktop || !context.conditions?.["fine"] || event.pointerType !== "mouse")
                return;
              const element = (event.target as Element).closest<HTMLElement>(
                "[data-home-tilt], .button-motion",
              );
              if (!element || !root.contains(element)) {
                reset();
                return;
              }
              if (active !== element) reset();
              active = element;
              cancelAnimationFrame(pointerFrame);
              pointerFrame = requestAnimationFrame(() => {
                const rect = element.getBoundingClientRect();
                const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
                const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
                element.style.setProperty("--pointer-x", `${x * 100}%`);
                element.style.setProperty("--pointer-y", `${y * 100}%`);
                element.style.setProperty("--tilt-x", `${(0.5 - y) * 3}deg`);
                element.style.setProperty("--tilt-y", `${(x - 0.5) * 3}deg`);
              });
            };
            root.addEventListener("pointermove", move, { passive: true });
            root.addEventListener("pointerleave", reset);
            return () => {
              resize.disconnect();
              cancelAnimationFrame(frame);
              reset();
              root.removeEventListener("load", refresh, true);
              root.removeEventListener("pointermove", move);
              root.removeEventListener("pointerleave", reset);
            };
          },
          root,
        );
      })
      .catch(() => {
        revert();
      });
    return () => {
      cancelled = true;
      revert();
      window.removeEventListener("scroll", updateNav);
      nav?.removeAttribute("data-scrolled");
    };
  }, [ref, planCount]);
}
