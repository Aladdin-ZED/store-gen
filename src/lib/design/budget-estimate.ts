/**
 * The wizard's budget estimate (P6 DESIGN; design.md DES-§14.2 steps 3 and 6; docs/STORE-SAAS.md §M.2): the hard
 * rows of the maintainer's budget gate that the height model decides (C3 sections and height, F1 form position, C2
 * fold), read against `budget-limits.ts` exactly as `budgetReport` reads them, without the rendered HTML (F5 runs
 * at publish). Browser-safe and pure: the wizard skips a candidate that breaches one and re-checks the repaired docs.
 */
import type { PageDoc } from "@/lib/page/schema";
import { FOLD_BAND, FOLD_LINE_PX, HEIGHT_BAND, LANDING_PROFILE } from "@/lib/render/prepublish/budget-limits";
import { variantFeatures } from "./features";
import { estimateHeights } from "./heights";
import type { HeightReport } from "./types";

export type BudgetBreach = "C3.sections" | "C3.height" | "F1.missing" | "F1.position" | `C2.${string}`;

/** The first hard budget row the estimate breaches (null = within the budgets). A stub height model breaches nothing. */
export function budgetBreach(doc: PageDoc, heights?: HeightReport): BudgetBreach | null {
  const h = heights ?? estimateHeights(doc, { look: doc.theme.look ?? null, locale: doc.locale, features: variantFeatures });
  const p = LANDING_PROFILE;
  if (h.inFlow > p.sections.hard) return "C3.sections";
  if (h.stub) return null;
  if (Math.round(h.total) * HEIGHT_BAND > p.heightPx.hard) return "C3.height";
  if (!doc.sections.some((s) => !s.hidden && s.type === "orderForm")) return "F1.missing";
  const formHard = p.formTopPx?.hard ?? null;
  if (formHard !== null && h.formTop !== null && Math.round(h.formTop) * HEIGHT_BAND > formHard) return "F1.position";
  for (const [key, top] of Object.entries(h.fold.items)) if (typeof top === "number" && top * FOLD_BAND > FOLD_LINE_PX) return `C2.${key}`;
  return null;
}
