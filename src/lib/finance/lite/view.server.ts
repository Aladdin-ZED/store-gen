import "server-only";
/**
 * The reads of `/app/<h>/finance` (P4 CALL CENTER; operations.md OPE-§16.2, OD25, OD52, OD56, OPS-13, OPS-24): one per
 * tab, so a tab loads only its own data. Every number comes from the Profit lite repositories (break-even, costs,
 * carrier rates, the spend grid); nothing here computes a figure of its own or writes.
 *
 *   openProfitAlerts   the alerts the daily `fin.alerts` job left open (cleared_at null), newest first
 *   carrierView        "My carrier": the settlement answer, the `*` row and the per-city rows with fee charged vs paid
 */
import { desc, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { profitAlerts } from "@/lib/db/schema";
import { getStoreSetting } from "@/lib/settings";
import { whereStore } from "@/lib/tenancy/sql";
import type { StoreScope } from "@/lib/tenancy/types";
import type { CarrierRateRow, FeeLine } from "./breakeven";
import { feeChargedVsPaid, myCarrierRates } from "./carrier.server";

const ALERTS_MAX = 20;

export interface OpenAlertView {
  kind: string;
  key: string;
  firedAt: string;
  evidence: Record<string, number>;
}

/** The open alerts of the store (see the header). */
export async function openProfitAlerts(scope: StoreScope): Promise<OpenAlertView[]> {
  const rows = await db
    .select({ kind: profitAlerts.kind, key: profitAlerts.key, firedAt: profitAlerts.firedAt, evidence: profitAlerts.evidence })
    .from(profitAlerts)
    .where(whereStore(profitAlerts, scope, isNull(profitAlerts.clearedAt)))
    .orderBy(desc(profitAlerts.firedAt))
    .limit(ALERTS_MAX);
  return rows.map((r) => ({ kind: r.kind, key: r.key, firedAt: r.firedAt.toISOString(), evidence: r.evidence ?? {} }));
}

export interface CarrierView {
  settlement: { value: "at_delivery" | "statement"; confirmedAt: string | null };
  /** the `*` row ("every other city"); null = never typed */
  fallback: CarrierRateRow | null;
  /** one line per city: its own rate row (when typed) and fee charged vs fee paid */
  cities: (FeeLine & { rate: CarrierRateRow | null })[];
}

/** "My carrier" (see the header). */
export async function carrierView(scope: StoreScope): Promise<CarrierView> {
  const [rates, lines, accounting] = await Promise.all([myCarrierRates(scope), feeChargedVsPaid(scope), getStoreSetting(scope, "accounting")]);
  const own = new Map(rates.filter((r) => r.cityKey !== "*").map((r) => [r.cityKey, r]));
  const cities: CarrierView["cities"] = lines.map((l) => ({ ...l, rate: own.get(l.cityKey) ?? null }));
  // a city typed by the owner without a delivered order yet still shows its row
  for (const [cityKey, rate] of own) if (!cities.some((c) => c.cityKey === cityKey)) cities.push({ cityKey, n: 0, chargedCents: null, paidCents: rate.deliveryFeeCents, gapCents: null, rate });
  const mc = accounting.myCarrier;
  return {
    settlement: { value: mc?.settlement ?? "at_delivery", confirmedAt: mc?.confirmedAt ?? null },
    fallback: rates.find((r) => r.cityKey === "*") ?? null,
    cities,
  };
}
