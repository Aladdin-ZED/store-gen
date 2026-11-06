/**
 * A rate as the console writes it (platform.md PLA-§4.5 "Numbers", §4.7 rule 3): "38 % · n = 214", or "needs n ≥ 20
 * (12 so far)" below P4's minimum sample, or "Not available" while the source is a later track's stub. Pure over a
 * translator, so the strips (server) and the tabs (client) say the same words.
 *
 *   rateLine(t, { value: 0.38, n: 214, min: 20 })   // "38 % · n = 214"
 */
import type { MessageVars } from "@/lib/i18n/admin";
import type { Kpi } from "@/lib/orders/profile";

type T = (key: string, vars?: MessageVars) => string;

export function rateLine(t: T, k: Kpi | null | undefined): string {
  if (!k) return t("console.strip.na");
  if ("insufficient" in k) return t("console.strip.needs_n", { min: k.min, n: k.n });
  return t("console.strip.rate", { pct: Math.round(k.value * 100), n: k.n });
}
