/**
 * The order form's height model (P3 LANDING; landing.md LAN-§3.5 OF2 rev 3 ENGP-5; design.md DES-§5.3): additive and
 * multiplier-free, so the form's internal layout, which this track fixes, is never scaled by density (G20),
 * `spacingFor` or G21. P6's `orderForm` registry entry declares `features.h = ORDER_FORM_FEATURES_H` and
 * `estimateHeights` adds the per-row terms from the doc; the gate's `form:F1` row and the checklist read
 * `orderFormEstimate`. Pure and isomorphic.
 *
 *   default state = offer → name → phone → city → [address] → submit, ≤ 2 offer rows, the per-piece options behind
 *   one summary row: 1.1 screens (928 px at 390 × 844), the required address row included
 *   + 0.15 screen per offer row beyond 2 · + 0.25 per visible per-piece option group · + 0.07 for the bump row
 *
 * `form:F1` is soft above 1,100 px and hard when the estimate × 0.8 is above 1,400 px (LAN-§3.5 OF2).
 */
import { defaultOfferId, expandUnits } from "@/lib/page/catalog";
import { isChoiceGroup, isFieldGroup, isMatrixGroup, type PageDoc } from "@/lib/page/schema";

/** One mobile screen (390 × 844). */
export const ORDER_FORM_SCREEN_PX = 844;
/** The default state with ≤ 2 offer rows and the address row, in screens. */
export const ORDER_FORM_BASE = 1.1;
/** Offer rows the base already holds. */
export const ORDER_FORM_BASE_OFFER_ROWS = 2;
/** The additive terms, in screens (the names P6's `features.h.per` uses). */
export const ORDER_FORM_PER = { offerRow: 0.15, optionGroup: 0.25, bump: 0.07 } as const;
/** P6's registry entry for every `orderForm` variant (DES-§5.3: `fixed` skips density, `spacingFor` and G21). */
export const ORDER_FORM_FEATURES_H = { base: ORDER_FORM_BASE, fixed: true, per: { ...ORDER_FORM_PER } } as const;

/** `form:F1` bands (LAN-§3.5 OF2, LAN-§3.2.1). */
export const ORDER_FORM_SOFT_PX = 1_100;
export const ORDER_FORM_HARD_PX = 1_400;
export const ORDER_FORM_HARD_FACTOR = 0.8;

export interface OrderFormEstimate {
  screens: number;
  px: number;
  /** offer rows the form shows (every offer of the page) */
  offerRows: number;
  /** visible per-piece option groups of the preselected offer (0 when its pieces collapse behind the summary row) */
  optionGroups: number;
  bump: boolean;
  /** "row": one line after the city (`required`); "disclosure": behind "Ajouter une adresse" (`optional`) */
  address: "row" | "disclosure";
}

/** An option group the form shows: a one-value group is never rendered (OF3), a field always is. */
function shown(g: PageDoc["items"][number]["groups"][number]): boolean {
  if (isChoiceGroup(g)) return g.options.length > 1;
  if (isMatrixGroup(g)) return true;
  return isFieldGroup(g);
}

/**
 * The form's estimated height in its default state at 390 px. `addressMode` is the store's resolved
 * `checkout.addressMode` (null = the market default, `required` in R1); the base budgets the address row either way
 * (the "Ajouter une adresse" disclosure of `optional` is never taller than the row). The visible per-piece option
 * groups are those of the preselected offer when it is a single piece; with two pieces or more the per-piece rows
 * collapse behind one summary row, part of the base (OF2).
 */
export function orderFormEstimate(doc: Pick<PageDoc, "items" | "offers">, addressMode: "required" | "optional" | null): OrderFormEstimate {
  const offerRows = doc.offers.bundles.length;
  const preselected = doc.offers.bundles.find((b) => b.id === defaultOfferId(doc.offers, doc.items)) ?? doc.offers.bundles[0];
  const groups = new Set<string>();
  const units = preselected ? expandUnits(preselected, doc.items) : [];
  // two pieces or more collapse behind one summary row ("2 pièces · Noir / M · Modifier"), which the base holds; a
  // single piece shows its option groups as rows, each one counted
  if (units.length === 1) {
    const byId = new Map(doc.items.map((it) => [it.id, it]));
    const unit = units[0]!;
    // a choice line shows the options of the item it starts on (the first one available)
    const id = unit.item ?? unit.available?.[0];
    const item = id ? byId.get(id) : undefined;
    for (const g of item?.groups ?? []) if (g.perUnit && shown(g)) groups.add(g.id);
  }
  const bump = !!doc.offers.orderBump?.enabled;
  const screens =
    ORDER_FORM_BASE +
    Math.max(0, offerRows - ORDER_FORM_BASE_OFFER_ROWS) * ORDER_FORM_PER.offerRow +
    groups.size * ORDER_FORM_PER.optionGroup +
    (bump ? ORDER_FORM_PER.bump : 0);
  const rounded = Math.round(screens * 100) / 100;
  return { screens: rounded, px: Math.round(screens * ORDER_FORM_SCREEN_PX), offerRows, optionGroups: groups.size, bump, address: (addressMode ?? "required") === "required" ? "row" : "disclosure" };
}

/** The `form:F1` level of an estimate: null within 1,100 px, "soft" above it, "hard" when px × 0.8 > 1,400. */
export function orderFormBand(px: number): "soft" | "hard" | null {
  if (px * ORDER_FORM_HARD_FACTOR > ORDER_FORM_HARD_PX) return "hard";
  return px > ORDER_FORM_SOFT_PX ? "soft" : null;
}
