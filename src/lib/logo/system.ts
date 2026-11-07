/**
 * The logo system renderer (design.md DES-§13.14; pure, isomorphic). Track S2 BRAND & LOGO owns this file in R2:
 * `renderLogo(params, { lockup, colorway })` → SVG through `svg.ts` (the ONLY serialiser: numbers and fixed element
 * names, nothing user-supplied in the markup), with clear space and minimum sizes. The contract step (C2-C) froze it
 * for S1 STOREFRONT's store chrome (the designer favicon as inline SVG in the store context, server-side only, with
 * `{ lockup: "mark" }`) and S2's SVG route. Until S2 merges the stub throws `NotBuiltYet("S2", "renderLogo")` and S1's
 * `brandIcon` keeps the PNG mark (`brand.logo.mark`). No R1 path calls it.
 */
import { notBuiltYet } from "@/lib/contracts/not-built";
import type { LogoParams } from "./params";

export type LogoLockupName = "primary" | "stacked" | "wordmark" | "mark";
export type LogoColorway = "color" | "mono" | "inverse";

/** The SVG of one lockup in one colorway (default "color"). S2 (stub: NotBuiltYet). */
export function renderLogo(params: LogoParams, opts: { lockup: LogoLockupName; colorway?: LogoColorway }): string {
  void params;
  void opts;
  return notBuiltYet("S2", "renderLogo");
}
