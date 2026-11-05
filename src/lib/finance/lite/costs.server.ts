import "server-only";
/**
 * Profit lite costs (P4 CALL CENTER; operations.md OPE-§16.2 "Costs", §2.7 `product_costs`, OPS-24, OD25, OD35):
 * the store's `product_costs` rows, the lookup index and the Costs tab's overview. Every write inserts a row with
 * `effective_from = now` (history kept: the newest row dated ≤ an instant wins), through the seam, after the
 * caller's `finance.write`; reads take the scope first and never invent a cost (an item without a row reads null).
 *
 *   costIndex(scope)          the lookup index at now (cached 60 s per store, dropped by every write)
 *   orderCogsCents(…)         the COGS of one order's units (variant → item@page → sku → product), null = uncovered
 *   costsOverview(scope)      Costs by SKU first, then per live page its items, their own / SKU-inherited costs and
 *                             the option codes a per-variant cost can use; the packaging cost
 *   saveItemCost(ctx, …)      a cost of an item of one of the store's live pages, optionally per option codes
 *   saveSkuCost(ctx, …)       a store-wide cost of a warehouse code (the Offers v2 item `sku`)
 */
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { auditFrom } from "@/lib/audit";
import { db } from "@/lib/db/client";
import { newId } from "@/lib/db/ids";
import { pages, pageVersions, productCosts } from "@/lib/db/schema";
import { opsNow } from "@/lib/callcenter/presence";
import { livePage } from "@/lib/orders/manual";
import type { PageDoc } from "@/lib/page/schema";
import { ITEM_ID_RE, WAREHOUSE_CODE_RE } from "@/lib/page/schema";
import { getStoreSetting } from "@/lib/settings";
import { scopedCache } from "@/lib/tenancy/cache";
import { storeValues, whereStore } from "@/lib/tenancy/sql";
import type { ActionResult, StoreScope, WriteCtx } from "@/lib/tenancy/types";
import { buildCostIndex, costUnitsOf, skuCost, unitCost, unitsCogsCents, variantKeyOf, type CostIndex, type CostRow } from "./cost-lookup";

/** a store's cost rows read at most (history included); beyond it the oldest rows drop out of the index */
const ROWS_MAX = 5_000;
const LIVE_PAGES_MAX = 50;
export const COST_MAX_CENTS = 100_000_000;

const indexCache = scopedCache<CostRow[]>({ name: "fin-costs", maxEntries: 2_000, ttlMs: 60_000 });

async function costRows(scope: StoreScope): Promise<CostRow[]> {
  return indexCache.getOrLoad(scope.storeId, "rows", async () =>
    db
      .select({
        pageId: productCosts.pageId,
        itemId: productCosts.itemId,
        sku: productCosts.sku,
        productId: productCosts.productId,
        variantKey: productCosts.variantKey,
        costCents: productCosts.costCents,
        effectiveFrom: productCosts.effectiveFrom,
      })
      .from(productCosts)
      .where(whereStore(productCosts, scope))
      .orderBy(desc(productCosts.effectiveFrom))
      .limit(ROWS_MAX),
  );
}

/** Drops the cached rows of the store (every write calls it). */
export function forgetCosts(scope: StoreScope): void {
  indexCache.delete(scope.storeId, "rows");
}

/** The lookup index of the store at `at` (default now). */
export async function costIndex(scope: StoreScope, at: Date = opsNow()): Promise<CostIndex> {
  return buildCostIndex(await costRows(scope), at);
}

/** The COGS of one order (its page, its `items` JSON); null when a unit has no cost. */
export function orderCogsCents(index: CostIndex, order: { pageId: string; items: Parameters<typeof costUnitsOf>[0] }): number | null {
  const units = costUnitsOf(order.items);
  if (!units.length) return null;
  return unitsCogsCents(index, order.pageId, units);
}

/* ------------------------------------------------------------------ */
/* the Costs tab's overview                                            */
/* ------------------------------------------------------------------ */

/** The warehouse codes a choice of an item can carry (any `code` in its option groups). */
function optionCodesOf(item: PageDoc["items"][number]): string[] {
  const out = new Set<string>();
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") {
      for (const [k, x] of Object.entries(v)) {
        if (k === "code" && typeof x === "string" && WAREHOUSE_CODE_RE.test(x)) out.add(x);
        else walk(x);
      }
    }
  };
  walk(item.groups);
  return [...out];
}

export interface CostItemLine {
  itemId: string;
  name: string;
  sku: string | null;
  /** the item's own row (variant ""); null = not typed */
  costCents: number | null;
  /** the SKU's row when the item has none of its own ("from SKU ARG-250, 38.00") */
  fromSkuCents: number | null;
  /** per-option-code rows of this item */
  variants: { variantKey: string; costCents: number }[];
  /** the option codes a per-variant cost may combine */
  optionCodes: string[];
}

export interface CostsOverview {
  currency: string;
  packagingCents: number | null;
  skus: { sku: string; costCents: number | null; items: number }[];
  pages: { pageId: string; name: string; items: CostItemLine[] }[];
}

/** Costs by SKU, then the live pages' items with their current costs (published docs only). */
export async function costsOverview(scope: StoreScope, currency: string): Promise<CostsOverview> {
  const [index, accounting, live] = await Promise.all([
    costIndex(scope),
    getStoreSetting(scope, "accounting"),
    db
      .select({ id: pages.id, name: pages.name, versionId: pages.publishedVersionId })
      .from(pages)
      .where(whereStore(pages, scope, eq(pages.status, "published"), isNotNull(pages.publishedVersionId)))
      .orderBy(desc(pages.updatedAt))
      .limit(LIVE_PAGES_MAX),
  ]);
  const versionIds = live.map((p) => p.versionId!).filter(Boolean);
  const docs = versionIds.length
    ? await db.select({ id: pageVersions.id, doc: pageVersions.doc }).from(pageVersions).where(whereStore(pageVersions, scope, inArray(pageVersions.id, versionIds)))
    : [];
  const docOf = new Map(docs.map((d) => [d.id, d.doc]));
  const skuItems = new Map<string, number>();
  const outPages: CostsOverview["pages"] = [];
  for (const p of live) {
    const doc = docOf.get(p.versionId!);
    if (!doc || !Array.isArray(doc.items)) continue;
    const items: CostItemLine[] = [];
    for (const it of doc.items) {
      const sku = it.sku?.trim() ? it.sku.trim() : null;
      if (sku) skuItems.set(sku.toUpperCase(), (skuItems.get(sku.toUpperCase()) ?? 0) + 1);
      const own = unitCost(index, p.id, { item: it.id, codes: [] });
      const fromSku = sku ? skuCost(index, sku) : null;
      const variants: CostItemLine["variants"] = [];
      for (const [k, r] of index.byKey) if (k.startsWith(`p:${p.id}:${it.id}:`) && r.variantKey) variants.push({ variantKey: r.variantKey, costCents: r.costCents });
      items.push({
        itemId: it.id,
        name: it.name || doc.product?.name || it.id,
        sku,
        costCents: own?.source === "item" ? own.cents : null,
        fromSkuCents: own?.source === "item" ? null : fromSku,
        variants: variants.sort((a, b) => a.variantKey.localeCompare(b.variantKey)),
        optionCodes: optionCodesOf(it),
      });
    }
    outPages.push({ pageId: p.id, name: p.name, items });
  }
  const skus = [...skuItems.entries()]
    .map(([sku, items]) => ({ sku, items, costCents: skuCost(index, sku) }))
    .sort((a, b) => (a.costCents === null ? 0 : 1) - (b.costCents === null ? 0 : 1) || a.sku.localeCompare(b.sku));
  return { currency, packagingCents: accounting.packagingCents, skus, pages: outPages };
}

/* ------------------------------------------------------------------ */
/* writes (finance.write)                                              */
/* ------------------------------------------------------------------ */

const Cents = z.number().int().min(0).max(COST_MAX_CENTS);
const Note = z.string().trim().max(200).optional();

export const ItemCostInput = z.strictObject({
  pageId: z.string().regex(/^[0-9A-Z]{26}$/),
  itemId: z.string().regex(ITEM_ID_RE),
  /** option codes; [] or absent = every variant */
  codes: z.array(z.string().regex(WAREHOUSE_CODE_RE)).max(4).optional(),
  costCents: Cents,
  note: Note,
});

export const SkuCostInput = z.strictObject({
  sku: z.string().trim().min(1).max(60),
  costCents: Cents,
  note: Note,
});

async function insertCost(ctx: WriteCtx, row: { pageId: string | null; itemId: string | null; sku: string | null; variantKey: string; costCents: number; note?: string }): Promise<{ effectiveFrom: string }> {
  const effectiveFrom = opsNow();
  await db.insert(productCosts).values(
    storeValues(ctx.scope, {
      id: newId(),
      productId: null,
      pageId: row.pageId,
      itemId: row.itemId,
      sku: row.sku,
      variantKey: row.variantKey,
      costCents: row.costCents,
      packagingCents: null,
      effectiveFrom,
      note: row.note || null,
      createdBy: ctx.user.id,
    }),
  );
  forgetCosts(ctx.scope);
  return { effectiveFrom: effectiveFrom.toISOString() };
}

/** finance.write: the cost of an item of a live page of the store (A's page from B answers not_found). */
export async function saveItemCost(ctx: WriteCtx, input: unknown): Promise<ActionResult<{ effectiveFrom: string }>> {
  if (!ctx.can("finance.write")) return { ok: false, error: "forbidden" };
  const parsed = ItemCostInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { pageId, itemId, codes = [], costCents, note } = parsed.data;
  const page = await livePage(ctx.scope, pageId);
  if (!page) return { ok: false, error: "not_found" };
  const item = page.doc.items.find((i) => i.id === itemId);
  if (!item) return { ok: false, error: "not_found" };
  const allowed = new Set(optionCodesOf(item));
  if (codes.some((c) => !allowed.has(c)) || new Set(codes).size !== codes.length) return { ok: false, error: "invalid" };
  const variantKey = variantKeyOf(codes);
  if (variantKey.length > 120) return { ok: false, error: "invalid" };
  const out = await insertCost(ctx, { pageId, itemId, sku: null, variantKey, costCents, ...(note ? { note } : {}) });
  await auditFrom(ctx, "finance.cost.saved", { target: pageId, meta: { itemId, variantKey, costCents } });
  return { ok: true, data: out };
}

/** finance.write: a store-wide cost of one warehouse code (stored upper-case, one row per change). */
export async function saveSkuCost(ctx: WriteCtx, input: unknown): Promise<ActionResult<{ effectiveFrom: string }>> {
  if (!ctx.can("finance.write")) return { ok: false, error: "forbidden" };
  const parsed = SkuCostInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const sku = parsed.data.sku.toUpperCase();
  const out = await insertCost(ctx, { pageId: null, itemId: null, sku, variantKey: "", costCents: parsed.data.costCents, ...(parsed.data.note ? { note: parsed.data.note } : {}) });
  await auditFrom(ctx, "finance.cost.saved", { target: sku, meta: { sku, costCents: parsed.data.costCents } });
  return { ok: true, data: out };
}

/** The history of one target, newest first (≤ 20 rows): the Costs tab's "changed on" line. */
export async function costHistory(scope: StoreScope, target: { pageId: string; itemId: string } | { sku: string }): Promise<{ costCents: number; effectiveFrom: string; variantKey: string }[]> {
  const where =
    "sku" in target
      ? whereStore(productCosts, scope, eq(productCosts.sku, target.sku.trim().toUpperCase()))
      : whereStore(productCosts, scope, and(eq(productCosts.pageId, target.pageId), eq(productCosts.itemId, target.itemId)));
  const rows = await db
    .select({ costCents: productCosts.costCents, effectiveFrom: productCosts.effectiveFrom, variantKey: productCosts.variantKey })
    .from(productCosts)
    .where(where)
    .orderBy(desc(productCosts.effectiveFrom))
    .limit(20);
  return rows.map((r) => ({ costCents: r.costCents, effectiveFrom: r.effectiveFrom.toISOString(), variantKey: r.variantKey }));
}
