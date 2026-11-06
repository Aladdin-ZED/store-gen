"use client";
/**
 * The 2 px progress hairline of every AI wait (P7 AI; ai.md AI-§K.3: "while running, a 2 px progress hairline under
 * the chip (no spinner)", the Director's stage line, the job row). Determinate when `value` (0-1) is known, else a
 * short segment that glides across the track. Reduced motion: a still segment, no travel. Colours: the tenant's
 * `--brand` over a hairline of `--foreground` (no gradient, no glow). Mirrors under `dir="rtl"`.
 */
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export function Hairline({ value = null, className, label }: { value?: number | null; className?: string; label?: string }) {
  const bar = useRef<HTMLSpanElement>(null);
  const indeterminate = value === null;

  useEffect(() => {
    const el = bar.current;
    if (!indeterminate || !el || typeof el.animate !== "function") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const rtl = getComputedStyle(el).direction === "rtl";
    const from = rtl ? "translateX(260%)" : "translateX(-100%)";
    const to = rtl ? "translateX(-100%)" : "translateX(260%)";
    const anim = el.animate([{ transform: from }, { transform: to }], { duration: 1_400, iterations: Infinity, easing: "cubic-bezier(0.45, 0, 0.25, 1)" });
    return () => anim.cancel();
  }, [indeterminate]);

  const pct = indeterminate ? null : Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <span
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct ?? undefined}
      className={cn("relative block h-0.5 w-full overflow-hidden rounded-full bg-foreground/[0.08]", className)}
    >
      <span
        ref={bar}
        className={cn("absolute inset-y-0 start-0 rounded-full bg-brand", indeterminate ? "w-[38%]" : "transition-[width] duration-200 ease-out motion-reduce:transition-none")}
        style={indeterminate ? undefined : { width: `${pct}%` }}
      />
    </span>
  );
}
