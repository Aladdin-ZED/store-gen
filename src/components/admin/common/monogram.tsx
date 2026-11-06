/**
 * Monogram (P2 SHELL; platform.md PLA-§22.12, §22.3, PD1): a store's or a person's initials on a tinted disc (the
 * store switcher, the console lists, notes). The hue is the store's brand accent when it has one, else one derived
 * from `seed`; either way it is folded out of the owner's band by `foldAllowedHue()` (`monogramTint`, test:admin-tokens
 * proves every disc clean in both modes). The disc mixes the ink into `--card`, so it follows the surface and the mode.
 *
 * Props frozen at PLA-§22.12 (src/lib/contracts/r1-p0b-platform.ts). Server-safe (no hooks): named by the full name.
 */
import type { CSSProperties, ReactElement } from "react";
import { monogramTint } from "@/lib/admin-theme/monogram";
import { cn } from "@/lib/utils";
import { monogramInitials } from "./primitive-logic";

export interface MonogramProps {
  name: string;
  seed: string;
  accentHue?: number | null;
  size: 24 | 32 | 48;
}

const SIZE: Record<MonogramProps["size"], string> = {
  24: "size-6 rounded-[var(--r-chip)] text-[10px]",
  32: "size-8 rounded-[var(--r-control)] text-xs",
  48: "size-12 rounded-[var(--r-card)] text-base",
};

export function Monogram(p: MonogramProps): ReactElement | null {
  const tint = monogramTint(p.seed, p.accentHue);
  const initials = monogramInitials(p.name) || "·";
  // a one-letter monogram at 24 px reads better alone; two letters from 32 px
  const shown = p.size === 24 ? Array.from(initials)[0] : initials;
  const style = {
    "--mono-ink": tint.light.ink,
    "--mono-disc": tint.light.disc,
    "--mono-ink-d": tint.dark.ink,
    "--mono-disc-d": tint.dark.disc,
  } as CSSProperties;
  return (
    <span
      role="img"
      aria-label={p.name}
      data-seed={p.seed}
      data-size={p.size}
      style={style}
      className={cn(
        "inline-flex shrink-0 items-center justify-center leading-none font-semibold tracking-normal select-none",
        "bg-[var(--mono-disc)] text-[var(--mono-ink)] dark:bg-[var(--mono-disc-d)] dark:text-[var(--mono-ink-d)]",
        SIZE[p.size] ?? SIZE[32],
      )}
    >
      <span aria-hidden="true">{shown}</span>
    </span>
  );
}
