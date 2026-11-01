import { useEffect, type RefObject } from "react";

const SURFACES =
  ".interactive-card, .card-surface, div.rounded-3xl.border, div.rounded-2xl.border.bg-card";
const CONTROLS =
  "form, input, textarea, select, canvas, table, [role=combobox], [contenteditable], [role=slider], [role=tablist], .touch-pan-y";

/** Entry/scroll effects for the authenticated shell; never transforms the shell or controls. */
export function useWorkspaceMotion(ref: RefObject<HTMLDivElement | null>, pathname: string) {
  useEffect(() => {
    const root = ref.current;
    const content = root?.querySelector<HTMLElement>("[data-workspace-content]");
    if (!root || !content) return;
    let cancelled = false;
    let revert = () => {};
    const header = root.querySelector<HTMLElement>(".workspace-header");
    const updateHeader = () => header?.toggleAttribute("data-scrolled", window.scrollY > 12);
    updateHeader();
    window.addEventListener("scroll", updateHeader, { passive: true });

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
            const seen = new WeakSet<HTMLElement>();
            const animated = new WeakSet<HTMLElement>();
            let live = true;
            const touched = new Set<HTMLElement>();
            const animateNew = () => {
              const candidates = Array.from(
                content.querySelectorAll<HTMLElement>(`h1, h1 + p, h2, ${SURFACES}`),
              );
              let sequence = 0;
              for (const element of candidates) {
                // Re-check live controls even on panels already discovered.
                if (element.parentElement?.closest(SURFACES)) continue;
                if (element.matches(SURFACES)) {
                  if (!element.querySelector(CONTROLS)) {
                    element.setAttribute("data-workspace-interactive", "");
                    touched.add(element);
                  } else element.removeAttribute("data-workspace-interactive");
                }
                if (seen.has(element)) continue;
                seen.add(element);
                if (
                  element.dataset["workspaceEntered"] === "true" ||
                  element.contains(document.activeElement)
                )
                  continue;
                const rect = element.getBoundingClientRect();
                if (!rect.width || !rect.height || rect.bottom <= 0) continue;
                const delay =
                  rect.top < window.innerHeight ? Math.min(sequence++ * 0.045, 0.22) : 0;
                // Keep panels visible, focusable and readable even before their scroll trigger.
                animated.add(element);
                gsap.fromTo(
                  element,
                  { opacity: 0.55, y: desktop ? 16 : 8 },
                  {
                    opacity: 1,
                    y: 0,
                    duration: desktop ? 0.6 : 0.38,
                    delay,
                    ease: "power3.out",
                    onStart: () => {
                      element.dataset["workspaceEntered"] = "true";
                    },
                    clearProps: "opacity,transform",
                    scrollTrigger: { trigger: element, start: "top 98%", once: true },
                  },
                );
              }
            };
            context.add(animateNew);
            let frame = 0;
            const refresh = () => {
              if (!live) return;
              cancelAnimationFrame(frame);
              frame = requestAnimationFrame(() => {
                if (!live) return;
                context.add(animateNew);
                ScrollTrigger.refresh();
              });
            };
            const mutations = new MutationObserver((records) => {
              if (records.some((record) => record.addedNodes.length || record.removedNodes.length))
                refresh();
            });
            mutations.observe(content, { childList: true, subtree: true });
            const sizes = new ResizeObserver(refresh);
            sizes.observe(content);
            content.addEventListener("load", refresh, true);
            const focus = (event: FocusEvent) => {
              let element = event.target as HTMLElement | null;
              while (element && element !== content) {
                // Focus must never change control-owned styles or move a form under the cursor.
                if (animated.has(element)) {
                  gsap.killTweensOf(element);
                  element.style.removeProperty("opacity");
                  element.style.removeProperty("transform");
                  element.dataset["workspaceEntered"] = "true";
                }
                element = element.parentElement;
              }
            };
            content.addEventListener("focusin", focus);

            const ambient = root.querySelector<HTMLElement>(".workspace-ambient");
            if (desktop && ambient)
              gsap.to(ambient, {
                y: -18,
                ease: "none",
                scrollTrigger: {
                  trigger: content,
                  start: "top top",
                  end: "bottom top",
                  scrub: 0.8,
                },
              });
            let pointerFrame = 0;
            let active: HTMLElement | null = null;
            const reset = () => {
              cancelAnimationFrame(pointerFrame);
              for (const property of [
                "--workspace-x",
                "--workspace-y",
                "--workspace-tilt-x",
                "--workspace-tilt-y",
              ])
                active?.style.removeProperty(property);
              active = null;
            };
            const move = (event: PointerEvent) => {
              if (!desktop || !context.conditions?.["fine"] || event.pointerType !== "mouse")
                return;
              const target = (event.target as Element).closest<HTMLElement>(
                "[data-workspace-interactive]",
              );
              if (!target || !content.contains(target) || target.querySelector(CONTROLS)) {
                reset();
                return;
              }
              if (target !== active) reset();
              active = target;
              cancelAnimationFrame(pointerFrame);
              pointerFrame = requestAnimationFrame(() => {
                const rect = target.getBoundingClientRect();
                const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
                const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
                target.style.setProperty("--workspace-x", `${x * 100}%`);
                target.style.setProperty("--workspace-y", `${y * 100}%`);
                target.style.setProperty("--workspace-tilt-x", `${(0.5 - y) * 2}deg`);
                target.style.setProperty("--workspace-tilt-y", `${(x - 0.5) * 2}deg`);
              });
            };
            content.addEventListener("pointermove", move, { passive: true });
            content.addEventListener("pointerleave", reset);
            refresh();
            return () => {
              live = false;
              mutations.disconnect();
              sizes.disconnect();
              cancelAnimationFrame(frame);
              reset();
              content.removeEventListener("load", refresh, true);
              content.removeEventListener("focusin", focus);
              content.removeEventListener("pointermove", move);
              content.removeEventListener("pointerleave", reset);
              touched.forEach((element) => element.removeAttribute("data-workspace-interactive"));
            };
          },
          content,
        );
      })
      .catch(() => revert());
    return () => {
      cancelled = true;
      revert();
      window.removeEventListener("scroll", updateHeader);
      header?.removeAttribute("data-scrolled");
    };
  }, [ref, pathname]);
}
