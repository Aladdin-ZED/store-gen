/**
 * Storefront's publish checks (storefront.md STO-D35, STO-§6.1, STO-§23.6; core §M.1, §M.2, D66). Track S1's extension
 * file in R2 (core §K.3; `prepublish.ts` imports it, R2 contract step C2-B2, STO-R25).
 *
 * The contract step wrote the per-kind budget profiles of STO-§6.1 ("Per-kind budgets", rev 2, STO-D36): the core's
 * budget gate (./budget.ts, `budget:*` ids) reads them when the document is a `StorePageDoc` of that kind, every hard
 * value clamped to the D52 ceilings (a profile only tightens). A cell with one value is both the soft and the hard
 * limit; a "—" cell (no rule) is the D52 ceiling. Utility kinds and `product` carry no landing order form
 * (`formTopPx: null`); the kinds with a fold contract (STO-§9.5 `foldLayoutFor`) read it (`fold: "kind-layout"`).
 * S1 adds its `storefront:*` items here under the three codes (STO-§23.6) with `registerPrePublishCheck`.
 *
 * A registration is skipped when the kind already has a profile (this module evaluated twice in one process: the
 * profiles live on `globalThis`, and a second registration would throw).
 */
import { budgetProfileFor, registerBudgetProfile, type PageKind } from "./budget";
import { D52_CEILINGS, LANDING_PROFILE, type BudgetProfile } from "./budget-limits";

const KB = 1024;
const one = (n: number) => ({ soft: n, hard: n });

/** home and page (marketing register): 5-10 / 12 sections, 9,000 / 12,000 px, ≤ 6 CTAs (no sticky bar), 2 / 4 glass, 40 / 80 reveals, photo 3 / 4, 60 / 140 KB. */
const MARKETING: BudgetProfile = {
  sections: { soft: 10, hard: 12 },
  heightPx: { soft: 9_000, hard: 12_000 },
  formTopPx: null,
  ctas: one(6),
  glass: { soft: 2, hard: 4 },
  reveals: { soft: 40, hard: 80 },
  photoReuse: { soft: 3, hard: 4 },
  htmlGz: { soft: 60 * KB, hard: 140 * KB },
  fold: "kind-layout",
};

/** product (template + product content, the gate sample product): 14 / 16 sections, 12,000 / 15,000 px, 3 / 4 CTAs, no glass, no reveal (CSS-only motion), photo 2 / 3 after the gallery, 90 / 140 KB. */
const PRODUCT: BudgetProfile = {
  sections: { soft: 14, hard: 16 },
  heightPx: { soft: 12_000, hard: 15_000 },
  formTopPx: null,
  ctas: { soft: 3, hard: 4 },
  glass: one(0),
  reveals: one(0),
  photoReuse: { soft: 2, hard: 3 },
  htmlGz: { soft: 90 * KB, hard: 140 * KB },
  fold: "kind-layout",
};

/** collection: header + grid + ≤ 3 / 4 sections, 9,000 / 12,000 px with 24 cards, ≤ 2 CTAs, no glass, no reveal, 60 / 140 KB. */
const COLLECTION: BudgetProfile = {
  sections: { soft: 5, hard: 6 },
  heightPx: { soft: 9_000, hard: 12_000 },
  formTopPx: null,
  ctas: one(2),
  glass: one(0),
  reveals: one(0),
  photoReuse: one(D52_CEILINGS.photoReuse),
  htmlGz: { soft: 60 * KB, hard: 140 * KB },
  fold: "kind-layout",
};

/** search and not_found: ≤ 4 sections, ≤ 6,000 px, ≤ 2 CTAs, no glass, no reveal, ≤ 45 KB. */
const UTILITY: BudgetProfile = {
  sections: one(4),
  heightPx: one(6_000),
  formTopPx: null,
  ctas: one(2),
  glass: one(0),
  reveals: one(0),
  photoReuse: one(D52_CEILINGS.photoReuse),
  htmlGz: one(45 * KB),
  fold: "none",
};

/** cart and checkout: single column, ≤ 4,000 px in the default state, 1 primary CTA (+ the WhatsApp alternative), no glass, no reveal, ≤ 45 KB. */
const TRANSACTIONAL: BudgetProfile = {
  sections: one(D52_CEILINGS.sections),
  heightPx: one(4_000),
  formTopPx: null,
  ctas: { soft: 1, hard: 2 },
  glass: one(0),
  reveals: one(0),
  photoReuse: one(D52_CEILINGS.photoReuse),
  htmlGz: one(45 * KB),
  fold: "none",
};

/** The STO-§6.1 kinds and their profiles (`policy` is reserved: LegalBody + chrome, no doc, no profile). */
export const STORE_BUDGET_PROFILES: Readonly<Record<Exclude<PageKind, "landing" | "policy">, BudgetProfile>> = {
  home: MARKETING,
  page: MARKETING,
  product: PRODUCT,
  collection: COLLECTION,
  search: UTILITY,
  not_found: UTILITY,
  cart: TRANSACTIONAL,
  checkout: TRANSACTIONAL,
};

for (const [kind, profile] of Object.entries(STORE_BUDGET_PROFILES) as [Exclude<PageKind, "landing" | "policy">, BudgetProfile][]) {
  if (budgetProfileFor(kind) === LANDING_PROFILE) registerBudgetProfile(kind, profile);
}
