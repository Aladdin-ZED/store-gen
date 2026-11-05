/**
 * The console's ring tints (platform.md PLA-§3.5 list row, §6.1 Health column, DES-§16.8): pure, so `test:platform`
 * pins the mapping. A tint is a meaning, never a decoration: emerald = fine, neutral = look when you can, yellow = look,
 * crimson = act. Every ring also carries its number and a text label next to it (never colour alone, PLA-§4.7 rule 8).
 * Hues: emerald 160, yellow 95, crimson 17 (every one outside the forbidden 25-75°).
 *
 *   bandTint("hold")     // "yellow"
 *   healthTint(64)       // "neutral"
 *   TINT_STROKE.crimson  // the ring's stroke colour
 */
import type { SignupBand } from "@/lib/platform/types";

export type Tint = "emerald" | "neutral" | "yellow" | "crimson";

/** The signup risk band of a queue row: fast emerald, review neutral, hold yellow, likely reject crimson. */
export function bandTint(band: SignupBand): Tint {
  switch (band) {
    case "fast":
      return "emerald";
    case "hold":
      return "yellow";
    case "reject_candidate":
      return "crimson";
    default:
      return "neutral";
  }
}

/** A Store Health score (core §I.7): ≥ 80 emerald, 50-79 neutral, 30-49 yellow, < 30 crimson. */
export function healthTint(score: number): Tint {
  if (score >= 80) return "emerald";
  if (score >= 50) return "neutral";
  if (score >= 30) return "yellow";
  return "crimson";
}

/** The ring's stroke per tint (light and dark read the same mid-lightness stroke). */
export const TINT_STROKE: Readonly<Record<Tint, string>> = {
  emerald: "oklch(0.64 0.13 160)",
  neutral: "color-mix(in oklch, var(--foreground) 34%, transparent)",
  yellow: "oklch(0.8 0.15 95)",
  crimson: "oklch(0.6 0.19 17)",
};

/** The soft fill of a chip or a band segment per tint (theme aware through the console tokens). */
export const TINT_SOFT: Readonly<Record<Tint, string>> = {
  emerald: "var(--c-success-soft)",
  neutral: "var(--secondary)",
  yellow: "var(--c-warn-soft)",
  crimson: "var(--c-danger-soft)",
};

/** Text on a soft fill, per tint (classes, so dark mode switches with `.dark`). */
export const TINT_INK: Readonly<Record<Tint, string>> = {
  emerald: "text-[oklch(0.42_0.1_160)] dark:text-[oklch(0.82_0.1_160)]",
  neutral: "text-muted-foreground",
  yellow: "text-[oklch(0.45_0.09_95)] dark:text-[oklch(0.86_0.11_95)]",
  crimson: "text-[var(--c-danger-ink)]",
};
