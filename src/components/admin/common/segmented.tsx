"use client";

import { LayoutGroup, motion } from "motion/react";
import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface SegmentOption<V extends string> {
  value: V;
  label: ReactNode;
  count?: number;
  icon?: ReactNode;
}

/**
 * Segmented filter with a pill that glides to the selected option (shared-layout spring).
 * Keyboard: it is a radiogroup — arrows move the selection.
 */
export function Segmented<V extends string>({
  value,
  onChange,
  options,
  label,
  size = "default",
  className,
}: {
  value: V;
  onChange: (value: V) => void;
  options: SegmentOption<V>[];
  /** accessible name of the group */
  label: string;
  size?: "default" | "sm";
  className?: string;
}) {
  const id = useId();
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const move = (dir: number) => {
    const next = options[(index + dir + options.length) % options.length];
    if (next) onChange(next.value);
  };
  return (
    <LayoutGroup id={id}>
      <div
        role="radiogroup"
        aria-label={label}
        className={cn(
          "inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full bg-foreground/[0.045] p-1 ring-1 ring-foreground/[0.06] ring-inset adm-scroll",
          className,
        )}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight" || e.key === "ArrowDown") {
            e.preventDefault();
            move(1);
          } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
            e.preventDefault();
            move(-1);
          }
        }}
      >
        {options.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={active ? 0 : -1}
              onClick={() => onChange(o.value)}
              className={cn(
                "relative inline-flex shrink-0 items-center gap-1.5 rounded-full font-medium whitespace-nowrap transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                size === "sm" ? "h-7 px-3 text-xs" : "h-8 px-3.5 text-[0.8rem]",
                active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {active && (
                <motion.span
                  layoutId="seg-pill"
                  className="absolute inset-0 rounded-full bg-background shadow-[0_1px_2px_rgb(0_0_0/0.06),0_4px_12px_-6px_rgb(0_0_0/0.18)] ring-1 ring-foreground/[0.07] dark:bg-foreground/10"
                  transition={{ type: "tween", duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
                />
              )}
              <span className="relative z-10 inline-flex items-center gap-1.5 [&_svg]:size-3.5">
                {o.icon}
                {o.label}
                {typeof o.count === "number" && (
                  <span
                    className={cn(
                      "min-w-[1.25rem] rounded-full px-1.5 text-center text-[0.68rem] leading-[1.15rem] tabular-nums transition-colors",
                      // the accent marks a real count on the current tab; an empty tab stays quiet
                      active && o.count > 0 ? "bg-brand/12 text-brand" : "bg-foreground/[0.06] text-muted-foreground",
                    )}
                  >
                    {o.count > 999 ? "999+" : o.count}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </LayoutGroup>
  );
}
