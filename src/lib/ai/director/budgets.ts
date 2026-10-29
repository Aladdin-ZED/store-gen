/**
 * The Director's budget verdicts (P7 AI; ai.md AI-§A.8.2 `budgetVerdicts`, AI-§A.8.9, AI-19 acceptance 14; core
 * §M.2 rows C2, C3, F1, ENGP-6; core §Q.9 AI R46: ai keeps `budgetVerdicts`, over the core's band constants).
 * Pure and isomorphic: the same arithmetic as the publish gate (src/lib/render/prepublish/budget.ts), read from the
 * same constants (`HEIGHT_BAND`, `FOLD_BAND`, `FOLD_LINE_PX`, `FOLD_SOFT_PX`, `LANDING_PROFILE`), so a candidate the
 * Director keeps is one the publish gate would not refuse:
 *
 *   C3  in-flow sections > 16 (exact), or estimated height × 0.8 > 15,000 px (> 18,750 px)  → "over"
 *       estimated height above 15,000 px and up to 18,750 px                                → "estimated"
 *   F1  estimated form top × 0.8 > 3,000 px (> 3,750 px)                                     → "over"
 *       estimated form top above 3,000 px and up to 3,750 px                                  → "estimated"
 *   C2  a fold item whose estimated top × 0.9 > 844 px (> 938 px)                             → "over"
 *       the lowest fold item's estimated top in 760-938 px                                    → "estimated"
 *
 * Heights are rounded to the pixel as the gate rounds them (C2 is not). A digest of design's P0 stub (`stub: true`)
 * measured nothing: its height rows are "ok" and an exact row over its line is only "estimated", the way the gate
 * writes notes while the stub is in place (P0 build note item 5), so no candidate is excluded on a stub number.
 *
 * `estimated` never excludes a candidate and is never alone a reason to repair one; `over` always excludes it.
 */
import type { FoldReport, RenderDigest } from "@/lib/design";
import { FOLD_BAND, FOLD_LINE_PX, FOLD_SOFT_PX, HEIGHT_BAND, LANDING_PROFILE } from "@/lib/render/prepublish/budget-limits";
import type { BudgetVerdict, DirectorDigest } from "./types";

type Budgets = DirectorDigest["budgets"];

/** The calibrated band of one estimated row: inside the line, inside the band, or past it. */
function banded(px: number, line: number): BudgetVerdict {
  if (px * HEIGHT_BAND > line) return "over";
  return px > line ? "estimated" : "ok";
}

/** C2 over the hero family's fold items at 390 × 844. */
function foldVerdict(fold: FoldReport): BudgetVerdict {
  let lowest = -Infinity;
  for (const top of Object.values(fold.items) as number[]) {
    if (top * FOLD_BAND > FOLD_LINE_PX) return "over";
    lowest = Math.max(lowest, top);
  }
  return lowest >= FOLD_SOFT_PX ? "estimated" : "ok";
}

/** Pure (AI-§A.8.2): the three verdicts from design's height summary and fold report. */
export function budgetVerdicts(h: RenderDigest["heights"], fold: FoldReport): Budgets {
  const sectionsOver = h.inFlow > LANDING_PROFILE.sections.hard;
  const height = banded(Math.round(h.total), LANDING_PROFILE.heightPx.hard);
  const formHard = LANDING_PROFILE.formTopPx?.hard ?? null;
  return {
    C2: foldVerdict(fold),
    C3: sectionsOver ? "over" : height,
    F1: h.formTop === null || formHard === null ? "ok" : banded(Math.round(h.formTop), formHard),
  };
}

/**
 * Design's digest as the Director reads it: the budgets added, the raster `null` in R1 (R2 adds it with the tiles).
 * A stub digest's verdicts are capped at "estimated" (see the header).
 */
export function directorDigest(d: RenderDigest, raster: DirectorDigest["raster"] = null): DirectorDigest {
  const budgets: Budgets = d.stub
    ? { C2: "ok", C3: d.heights.inFlow > LANDING_PROFILE.sections.hard ? "estimated" : "ok", F1: "ok" }
    : budgetVerdicts(d.heights, d.hero.fold);
  return { ...d, budgets, raster };
}

/** The budget rows a candidate is over, as gate-style ids ("budget:C3"). */
export function budgetsOver(budgets: Budgets): string[] {
  return (Object.keys(budgets) as (keyof Budgets)[]).filter((k) => budgets[k] === "over").map((k) => `budget:${k}`);
}

/**
 * The hard fails that exclude a candidate from the pick (AI-§D.3 critique row): design's hard gates (the token-level
 * no-orange V03, the honesty mirrors, the fold and form gates, …) and every budget row "over". An "estimated" row is
 * never one. The model's own `hardFails` list is never read.
 */
export function hardFailsOf(digest: Pick<DirectorDigest, "gates" | "budgets">): string[] {
  return [...new Set([...digest.gates.hard, ...budgetsOver(digest.budgets)])];
}
