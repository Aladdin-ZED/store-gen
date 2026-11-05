import "server-only";
/**
 * The break-even card of Profit lite (P4 CALL CENTER; operations.md OPE-§16.2 "Break-even", OD17, OD25, OD26, OD56,
 * AC-05 R1, SF-01): one read per figure over the trailing 28 store-local days, placed-day cohort, real orders only
 * (test and honeypot orders never count, core D54), integer cents (toCents once at the boundary), one currency per
 * store. The math is ./breakeven.ts; with a missing input the answer lists what to add and carries no number.
 *
 *   breakEvenFor(scope, { pageId? })   c, d with their n and Wilson bounds, margin_delivered, loss_failed, E_placed,
 *                                      BE_CPA_placed / delivered and the interval; CPA_placed store-level with the
 *                                      converted spend, the rate printed and the days not counted; the by-angle table
 *                                      (opsAggregates dims ["angle"]: counts and rates with n, cells under 5
 *                                      suppressed, no CPA per angle); delivery outcomes "as of" the last final move
 *   cohortCounts(scope, from, to)      the counts of a placed-day window (the alerts' daily CPA reuses it)
 */
import { and, desc, eq, gte, isNotNull, lt } from "drizzle-orm";
import { opsAggregates, type AggCell } from "@/lib/callcenter/aggregates";
import { notHoneypot, spanOf, storeTz, trailingDays, type DayBound } from "@/lib/callcenter/insights-sql";
import { opsNow } from "@/lib/callcenter/presence";
import { db } from "@/lib/db/client";
import { orders, type OrderItems } from "@/lib/db/schema";
import { getStoreSetting } from "@/lib/settings";
import { whereStore } from "@/lib/tenancy/sql";
import type { StoreScope } from "@/lib/tenancy/types";
import type { AdRate } from "./ad-rates";
import { breakEven, cpaPlacedCents, type BreakEven, type BreakEvenCounts } from "./breakeven";
import { myCarrierRates } from "./carrier.server";
import { toCents } from "./cents";
import { costIndex, orderCogsCents } from "./costs.server";
import { spendBetween, storeCurrencyOf } from "./spend.server";

export const BE_DAYS = 28;
/** orders of a 28-day cohort read at most (beyond it the answer says `capped`) */
const COHORT_MAX = 20_000;

const realOrder = and(eq(orders.isTest, false), notHoneypot)!;
const FAILED = new Set(["refused", "returned", "lost"]);

interface CohortRow {
  pageId: string;
  total: string | number;
  items: OrderItems;
  cityKey: string | null;
  confirmState: string;
  shipState: string;
}

async function cohort(scope: StoreScope, from: Date, to: Date, pageId?: string): Promise<CohortRow[]> {
  return db
    .select({ pageId: orders.pageId, total: orders.total, items: orders.items, cityKey: orders.cityKey, confirmState: orders.confirmState, shipState: orders.shipState })
    .from(orders)
    .where(whereStore(orders, scope, gte(orders.createdAt, from), lt(orders.createdAt, to), pageId ? eq(orders.pageId, pageId) : undefined, realOrder))
    .limit(COHORT_MAX);
}

export function countsOf(rows: readonly Pick<CohortRow, "confirmState" | "shipState">[]): BreakEvenCounts {
  const k: BreakEvenCounts = { placed: 0, confirmed: 0, cancelled: 0, unreachable: 0, delivered: 0, refused: 0, returned: 0, lost: 0 };
  for (const r of rows) {
    k.placed++;
    if (r.confirmState === "confirmed") k.confirmed++;
    else if (r.confirmState === "cancelled") k.cancelled++;
    else if (r.confirmState === "unreachable") k.unreachable++;
    if (r.shipState === "delivered") k.delivered++;
    else if (r.shipState === "refused") k.refused++;
    else if (r.shipState === "returned") k.returned++;
    else if (r.shipState === "lost") k.lost++;
  }
  return k;
}

/** The counts of the real orders placed in [from, to). */
export async function cohortCounts(scope: StoreScope, from: Date, to: Date): Promise<BreakEvenCounts> {
  return countsOf(await cohort(scope, from, to));
}

export interface BreakEvenCard {
  currency: string;
  window: { from: string; to: string; days: number };
  counts: BreakEvenCounts;
  result: BreakEven;
  /** store-level in R1: spend is not split per page */
  cpa: { placedCents: number | null; spendCents: number; placed: number; typedCells: number; missingRates: number; daysNotCounted: number; ratesUsed: AdRate[] };
  byAngle: { cells: AggCell[]; suppressed: number };
  /** the last final ship move of the cohort ("as of last sync"); null when none */
  outcomesAsOf: string | null;
  packagingCents: number | null;
  capped: boolean;
}

/** The break-even card of the store or one page (see the header). */
export async function breakEvenFor(scope: StoreScope, opts: { pageId?: string } = {}): Promise<BreakEvenCard> {
  const tz = await storeTz(scope);
  const days: DayBound[] = trailingDays(tz, opsNow(), BE_DAYS);
  const { from, to } = spanOf(days);
  const fromYmd = days[0]!.ymd;
  const toYmd = days[days.length - 1]!.ymd;
  const [rows, storeRows, index, rates, accounting, spend, currency, agg, last] = await Promise.all([
    cohort(scope, from, to, opts.pageId),
    opts.pageId ? cohort(scope, from, to) : Promise.resolve(null),
    costIndex(scope),
    myCarrierRates(scope),
    getStoreSetting(scope, "accounting"),
    spendBetween(scope, fromYmd, toYmd),
    storeCurrencyOf(scope),
    opsAggregates(scope, { from: fromYmd, to: toYmd, dims: ["angle"] }),
    db
      .select({ at: orders.finalAt })
      .from(orders)
      .where(whereStore(orders, scope, isNotNull(orders.finalAt), gte(orders.createdAt, from), lt(orders.createdAt, to), realOrder))
      .orderBy(desc(orders.finalAt))
      .limit(1),
  ]);
  const counts = countsOf(rows);
  const delivered = rows
    .filter((r) => r.shipState === "delivered")
    .map((r) => ({ totalCents: toCents(r.total), cogsCents: orderCogsCents(index, { pageId: r.pageId, items: r.items }), cityKey: r.cityKey }));
  const failed = rows.filter((r) => FAILED.has(r.shipState)).map((r) => ({ cityKey: r.cityKey }));
  const result = breakEven({ counts, delivered, failed, packagingCents: accounting.packagingCents, rates });
  const storePlaced = storeRows ? storeRows.length : counts.placed;
  const spendCents = spend.rows > 0 ? spend.cents : null;
  return {
    currency,
    window: { from: fromYmd, to: toYmd, days: BE_DAYS },
    counts,
    result,
    cpa: {
      placedCents: cpaPlacedCents(spendCents, storePlaced),
      spendCents: spend.cents,
      placed: storePlaced,
      typedCells: spend.typed,
      missingRates: spend.missingRates,
      daysNotCounted: spend.missingDays.length,
      ratesUsed: spend.ratesUsed,
    },
    byAngle: { cells: agg.cells.angle, suppressed: agg.suppressed },
    outcomesAsOf: last[0]?.at ? last[0].at.toISOString() : null,
    packagingCents: accounting.packagingCents,
    capped: rows.length >= COHORT_MAX,
  };
}
