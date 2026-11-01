import type { ReactNode } from "react";

/** Visible by default: the home GSAP context progressively enhances these wrappers. */
export function HomeReveal({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div data-home-reveal className={className}>
      {children}
    </div>
  );
}
