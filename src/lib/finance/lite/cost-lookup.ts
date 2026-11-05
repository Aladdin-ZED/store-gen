/**
 * The unit-cost lookup of Profit lite (P4 CALL CENTER; operations.md OPE-§16.2 "Costs", §16.3 lookup order, OPS-24).
 * Pure and isomorphic: the repository (src/lib/finance/lite/costs.server.ts) builds a `CostIndex` from the store's
 * `product_costs` rows, this file answers the cost of an order's units from it.
 *
 * Lookup per unit = the most specific row dated ≤ the instant: variant (page + item + the option codes joined by "|")
 * → item@page (variant "") → sku (the Offers v2 item code, store-wide) → product default (R2: `product_id`). An item
 * whose code has a SKU cost is covered: the inheritance happens here at read time, no publish hook writes copies.
 */

/** One `product_costs` row as the lookup reads it (exactly one of pageId + itemId, sku, productId is set). */
export interface CostRow {
  pageId: string | null;
  itemId: string | null;
  sku: string | null;
  productId: string | null;
  variantKey: string;
  costCents: number;
  effectiveFrom: Date;
}

/** The latest row per key (dated ≤ the index instant). */
export interface CostIndex {
  at: Date;
  byKey: ReadonlyMap<string, CostRow>;
}

export const variantKeyOf = (codes: readonly string[]): string => codes.map((c) => c.trim()).filter(Boolean).join("|");
const pageKey = (pageId: string, itemId: string, variantKey: string) => `p:${pageId}:${itemId}:${variantKey}`;
const skuKey = (sku: string, variantKey: string) => `s:${sku.trim().toUpperCase()}:${variantKey}`;
const productKey = (productId: string, variantKey: string) => `r:${productId}:${variantKey}`;

/** The key a row is filed under; null for a malformed row (none or several targets). */
export function costKeyOf(r: Pick<CostRow, "pageId" | "itemId" | "sku" | "productId" | "variantKey">): string | null {
  const targets = [r.pageId ? 1 : 0, r.sku ? 1 : 0, r.productId ? 1 : 0].reduce((s, x) => s + x, 0);
  if (targets !== 1) return null;
  if (r.pageId) return r.itemId ? pageKey(r.pageId, r.itemId, r.variantKey) : null;
  if (r.sku) return skuKey(r.sku, r.variantKey);
  return productKey(r.productId!, r.variantKey);
}

/** The index of `rows` at `at`: per key the row with the latest effective_from ≤ at (history kept, newest wins). */
export function buildCostIndex(rows: readonly CostRow[], at: Date): CostIndex {
  const byKey = new Map<string, CostRow>();
  for (const r of rows) {
    if (r.effectiveFrom.getTime() > at.getTime()) continue;
    const k = costKeyOf(r);
    if (!k) continue;
    const prev = byKey.get(k);
    if (!prev || r.effectiveFrom.getTime() >= prev.effectiveFrom.getTime()) byKey.set(k, r);
  }
  return { at, byKey };
}

/** One unit to price: the item it is, its SKU snapshot and the chosen option codes. */
export interface CostUnit {
  item: string;
  sku?: string | null;
  /** option codes in group order; a choice without a code makes the variant tier unusable for the unit */
  codes: readonly (string | null | undefined)[];
}

export type CostSource = "variant" | "item" | "sku" | "product";

/** The unit's cost and where it came from; null = no row covers it. */
export function unitCost(index: CostIndex, pageId: string, unit: CostUnit, productId?: string | null): { cents: number; source: CostSource } | null {
  const codes = unit.codes.every((c) => typeof c === "string" && c.trim()) ? variantKeyOf(unit.codes as string[]) : "";
  if (codes) {
    const v = index.byKey.get(pageKey(pageId, unit.item, codes));
    if (v) return { cents: v.costCents, source: "variant" };
  }
  const item = index.byKey.get(pageKey(pageId, unit.item, ""));
  if (item) return { cents: item.costCents, source: "item" };
  if (unit.sku && unit.sku.trim()) {
    const s = index.byKey.get(skuKey(unit.sku, ""));
    if (s) return { cents: s.costCents, source: "sku" };
  }
  if (productId) {
    const p = index.byKey.get(productKey(productId, codes)) ?? index.byKey.get(productKey(productId, ""));
    if (p) return { cents: p.costCents, source: "product" };
  }
  return null;
}

/** The store-wide cost of a warehouse code (variant ""); null = not typed. */
export function skuCost(index: CostIndex, sku: string): number | null {
  return sku.trim() ? (index.byKey.get(skuKey(sku, ""))?.costCents ?? null) : null;
}

/** The COGS of an order's units in cents; null when any unit is not covered (the figure is never guessed). */
export function unitsCogsCents(index: CostIndex, pageId: string, units: readonly CostUnit[], productId?: string | null): number | null {
  let sum = 0;
  for (const u of units) {
    const c = unitCost(index, pageId, u, productId);
    if (!c) return null;
    sum += c.cents;
  }
  return sum;
}

/** The units of an `orders.items` value (v2 units, the bump's unit, an upsell item; v1 rows are the page's "main"). */
export function costUnitsOf(items: {
  qty?: number;
  units?: readonly { item: string; sku?: string; options?: readonly { code?: string }[] }[];
  variants?: readonly Record<string, string>[];
  bump?: { unit?: { item: string; sku?: string; options?: readonly { code?: string }[] } };
  upsell?: { item?: string };
} | null): CostUnit[] {
  if (!items) return [];
  const toUnit = (u: { item: string; sku?: string; options?: readonly { code?: string }[] }): CostUnit => ({ item: u.item, sku: u.sku ?? null, codes: (u.options ?? []).map((o) => o.code) });
  const out: CostUnit[] = [];
  if (Array.isArray(items.units)) out.push(...items.units.map(toUnit));
  else {
    const n = Math.max(Array.isArray(items.variants) ? items.variants.length : 0, Math.max(0, Math.trunc(Number(items.qty) || 0)));
    for (let i = 0; i < Math.min(n, 20); i++) out.push({ item: "main", sku: null, codes: [] });
  }
  if (items.bump?.unit) out.push(toUnit(items.bump.unit));
  if (items.upsell?.item) out.push({ item: items.upsell.item, sku: null, codes: [] });
  return out;
}
