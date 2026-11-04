import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A key cap (DES-§16.10): 20 px high, mono 11 px, one chip per key, so a hint reads as separate keys and never as a
 * `·` string. Keys are Latin in every language: the chip stays left to right inside Arabic text.
 */
export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      dir="ltr"
      className={cn(
        "inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-[5px] bg-background px-1 font-mono text-[11px] leading-none font-medium text-foreground/70 shadow-[0_1px_0_rgb(0_0_0/0.06)] ring-1 ring-border ring-inset",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

/** The keys of one step ("G", or "J" "K"): adjacent chips. */
export function KbdGroup({ keys, className }: { keys: readonly string[]; className?: string }) {
  return (
    <span dir="ltr" className={cn("inline-flex items-center gap-1", className)}>
      {keys.map((k) => (
        <Kbd key={k}>{k}</Kbd>
      ))}
    </span>
  );
}
