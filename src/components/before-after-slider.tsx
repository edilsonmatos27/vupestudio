import { useCallback, useRef, useState } from "react";
import { ChevronsLeftRight } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  beforeSrc: string;
  afterSrc: string;
  beforeAlt: string;
  afterAlt: string;
  width: number;
  height: number;
  className?: string;
};

export function BeforeAfterSlider({ beforeSrc, afterSrc, beforeAlt, afterAlt, width, height, className }: Props) {
  const [pos, setPos] = useState(50);
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const update = useCallback((clientX: number) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setPos(Math.min(100, Math.max(0, pct)));
  }, []);

  return (
    <div
      ref={ref}
      className={cn("relative select-none overflow-hidden touch-pan-y", className)}
      style={{ aspectRatio: `${width} / ${height}` }}
      onPointerDown={(e) => {
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        update(e.clientX);
      }}
      onPointerMove={(e) => dragging.current && update(e.clientX)}
      onPointerUp={() => (dragging.current = false)}
      onPointerCancel={() => (dragging.current = false)}
    >
      <img
        src={afterSrc}
        alt={afterAlt}
        width={width}
        height={height}
        draggable={false}
        className="absolute inset-0 h-full w-full object-cover"
      />
      <img
        src={beforeSrc}
        alt={beforeAlt}
        width={width}
        height={height}
        draggable={false}
        className="absolute inset-0 h-full w-full object-cover"
        style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
      />

      <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-background/80 px-3 py-1 text-xs font-semibold text-foreground backdrop-blur">
        Antes
      </span>
      <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
        Depois
      </span>

      <div
        className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-background shadow-soft"
        style={{ left: `${pos}%` }}
      >
        <div className="absolute left-1/2 top-1/2 flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground shadow-soft">
          <ChevronsLeftRight className="size-5" />
        </div>
      </div>

      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={Math.round(pos)}
        onChange={(e) => setPos(Number(e.target.value))}
        aria-label="Comparar antes e depois"
        className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
      />
    </div>
  );
}
