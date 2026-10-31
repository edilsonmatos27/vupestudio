import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Content stays visible without JavaScript or when reduced motion is requested. */
export function ScrollReveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (
      !element ||
      !("IntersectionObserver" in window) ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      element.getBoundingClientRect().bottom <= 0
    )
      return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          element.dataset["reveal"] = "visible";
          observer.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -24px 0px" },
    );
    element.dataset["reveal"] = "pending";
    observer.observe(element);
    return () => {
      observer.disconnect();
      delete element.dataset["reveal"];
    };
  }, []);

  return (
    <div
      ref={ref}
      className={cn("scroll-reveal", className)}
      style={{ animationDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}
