import "server-only";
/**
 * The Store Health facts of the `fin:*` rules (P4 CALL CENTER; operations.md OPE-§27.2 fin rows, OD52, OD56, OPS-13,
 * OPS-24, D75): counts only, never a customer field, real orders only, read-only and scoped, cached 60 s per store
 * (the four rules share one pass). `on: false` when the `finance_lite` flag is off: every rule is then silent.
 *
 *   uncostedSkus       SKUs (or items without a SKU) of the live pages with orders in 28 d and no cost: an item whose
 *                      SKU has a cost, or that has its own or per-variant cost rows, counts as covered
 *   delivered          real delivered orders (all time, counted to 20)
 *   settlementConfirmed  accounting.myCarrier.confirmedAt is set
 *   feeGaps            top-5 cities by delivered orders (28 d, n ≥ 10 each) charging ≥ 10 currency units below the
 *                      carrier rate; worstGapCents the largest gap (never the landing zone fee, D75)
 *   adRateMissingDays  days of the last 14 with a foreign-currency ad-spend cell and no rate
 */
import { and, desc, eq, gte, inArray, isNotNull } from "drizzle-orm";
import { notHoneypot, spanOf, storeTz, trailingDays } from "@/lib/callcenter/insights-sql";
import { opsNow } from "@/lib/callcenter/presence";
import { db } from "@/lib/db/client";
import { orders, pages, pageVersions } from "@/lib/db/schema";
import { getStoreSetting } from "@/lib/settings";
import { scopedCache } from "@/lib/tenancy/cache";
import { whereStore } from "@/lib/tenancy/sql";
import type { StoreScope } from "@/lib/tenancy/types";
import { feeGaps } from "./breakeven";
import { feeChargedVsPaid } from "./carrier.server";
import { skuCost, unitCost } from "./cost-lookup";
import { costIndex } from "./costs.server";
import { financeLiteOn } from "./flag.server";
import { spendBetween } from "./spend.server";

export interface FinHealthFacts {
  on: boolean;
  uncostedSkus: number;
  delivered: number;
  settlementConfirmed: boolean;
  feeGaps: number;
  worstGapCents: number;
  adRateMissingDays: number;
}

export const FIN_QUIET: FinHealthFacts = { on: true, uncostedSkus: 0, delivered: 0, settlementConfirmed: true, feeGaps: 0, worstGapCents: 0, adRateMissingDays: 0 };

const cache = scopedCache<FinHealthFacts>({ name: "fin-health", maxEntries: 5_000, ttlMs: 60_000 });
const realOrder = and(eq(orders.isTest, false), notHoneypot)!;

async function uncostedSkus(scope: StoreScope): Promise<number> {
  const { from } = spanOf(trailingDays(await storeTz(scope), opsNow(), 28));
  const withOrders = await db
    .selectDistinct({ pageId: orders.pageId })
    .from(orders)
    .where(whereStore(orders, scope, gte(orders.createdAt, from), realOrder))
    .limit(200);
  if (!withOrders.length) return 0;
  const live = await db
    .select({ id: pages.id, versionId: pages.publishedVersionId })
    .from(pages)
    .where(whereStore(pages, scope, eq(pages.status, "published"), isNotNull(pages.publishedVersionId), inArray(pages.id, withOrders.map((p) => p.pageId))))
    .orderBy(desc(pages.updatedAt))
    .limit(50);
  if (!live.length) return 0;
  const docs = await db
    .select({ id: pageVersions.id, doc: pageVersions.doc })
    .from(pageVersions)
    .where(whereStore(pageVersions, scope, inArray(pageVersions.id, live.map((p) => p.versionId!))));
  const docOf = new Map(docs.map((d) => [d.id, d.doc]));
  const index = await costIndex(scope);
  const missing = new Set<string>();
  for (const p of live) {
    for (const it of docOf.get(p.versionId!)?.items ?? []) {
      const sku = it.sku?.trim().toUpperCase() || null;
      const own = unitCost(index, p.id, { item: it.id, codes: [] });
      const variants = [...index.byKey.keys()].some((k) => k.startsWith(`p:${p.id}:${it.id}:`));
      if (own || variants || (sku && skuCost(index, sku) !== null)) continue;
      missing.add(sku ? `s:${sku}` : `p:${p.id}:${it.id}`);
    }
  }
  return missing.size;
}

/** The facts of this store (see the header). */
export async function finHealthFacts(scope: StoreScope): Promise<FinHealthFacts> {
  return cache.getOrLoad(scope.storeId, "facts", async () => {
    if (!(await financeLiteOn(scope))) return { ...FIN_QUIET, on: false };
    const tz = await storeTz(scope);
    const days14 = trailingDays(tz, opsNow(), 14);
    const [skus, deliveredRows, accounting, fees, spend] = await Promise.all([
      uncostedSkus(scope),
      db
        .select({ id: orders.id })
        .from(orders)
        .where(whereStore(orders, scope, eq(orders.shipState, "delivered"), realOrder))
        .limit(20),
      getStoreSetting(scope, "accounting"),
      feeChargedVsPaid(scope),
      spendBetween(scope, days14[0]!.ymd, days14[days14.length - 1]!.ymd),
    ]);
    const gaps = feeGaps(fees);
    return {
      on: true,
      uncostedSkus: skus,
      delivered: deliveredRows.length,
      settlementConfirmed: accounting.myCarrier.confirmedAt !== null,
      feeGaps: gaps.length,
      worstGapCents: gaps.reduce((m, g) => Math.max(m, g.gapCents ?? 0), 0),
      adRateMissingDays: spend.missingDays.length,
    };
  });
}

export function forgetFinHealthFacts(scope: StoreScope): void {
  cache.delete(scope.storeId);
}
