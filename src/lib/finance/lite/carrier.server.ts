import "server-only";
/**
 * "My carrier" rates of Profit lite (P4 CALL CENTER; operations.md OPE-§16.2 "Costs", §2.7 `carrier_rates`, OPS-13,
 * OPS-25, OD47, D75): the R1 rows have `carrier_account_id = ''`; `city_key` is `*` (every other city) or a CityKey
 * slug. Fees are typed by the owner (NULL = not typed, never invented); the COD fee is `bp` of the amount collected,
 * an optional minimum and a flat part. Writes upsert the one row per city (`cr_uq`) after `finance.write`, audited
 * `finance.carrier_rate.saved` with the before and after values (the history of a rate row lives in the audit log).
 *
 *   myCarrierRates(scope)     the active and inactive rows, `*` first
 *   saveCarrierRate(ctx, …)   one city's row (or `*`); `active: false` keeps the row and stops using it
 *   feeChargedVsPaid(scope)   per city of the delivered orders of the last 28 days: the median `orders.shipping`
 *                             charged and the rate row's delivery fee paid (never the landing zone fee, D75)
 */
import { and, eq, gte, lt } from "drizzle-orm";
import { z } from "zod";
import { auditFrom } from "@/lib/audit";
import { notHoneypot, spanOf, storeTz, trailingDays } from "@/lib/callcenter/insights-sql";
import { opsNow } from "@/lib/callcenter/presence";
import { db } from "@/lib/db/client";
import { newId } from "@/lib/db/ids";
import { carrierRates, orders } from "@/lib/db/schema";
import { CITY_KEYS } from "@/lib/orders/address";
import { whereStore, storeValues } from "@/lib/tenancy/sql";
import type { ActionResult, StoreScope, WriteCtx } from "@/lib/tenancy/types";
import { toCents } from "./cents";
import { feeLines, type CarrierRateRow, type FeeLine } from "./breakeven";

export const MY_CARRIER = "";
const FEE_MAX = 10_000_000;
/** delivered orders read for the fee medians (28 d) */
const FEE_ROWS_MAX = 20_000;

/** The "my carrier" rows of the store, `*` first then by city. */
export async function myCarrierRates(scope: StoreScope): Promise<CarrierRateRow[]> {
  const rows = await db
    .select({
      cityKey: carrierRates.cityKey,
      deliveryFeeCents: carrierRates.deliveryFeeCents,
      returnFeeCents: carrierRates.returnFeeCents,
      codFeeBp: carrierRates.codFeeBp,
      codFeeMinCents: carrierRates.codFeeMinCents,
      codFeeFlatCents: carrierRates.codFeeFlatCents,
      active: carrierRates.active,
    })
    .from(carrierRates)
    .where(whereStore(carrierRates, scope, eq(carrierRates.carrierAccountId, MY_CARRIER)))
    .limit(500);
  return rows.sort((a, b) => (a.cityKey === "*" ? -1 : b.cityKey === "*" ? 1 : a.cityKey.localeCompare(b.cityKey)));
}

const Fee = z.number().int().min(0).max(FEE_MAX).nullable();
export const CarrierRateInput = z.strictObject({
  cityKey: z.string().refine((k) => k === "*" || (CITY_KEYS as readonly string[]).includes(k), { error: "Unknown city." }),
  deliveryFeeCents: Fee,
  returnFeeCents: Fee,
  codFeeBp: z.number().int().min(0).max(2_000).default(0),
  codFeeMinCents: Fee.default(null),
  codFeeFlatCents: z.number().int().min(0).max(FEE_MAX).default(0),
  active: z.boolean().default(true),
});

/** finance.write: one city's "my carrier" row (upsert on (store, '', city)). */
export async function saveCarrierRate(ctx: WriteCtx, input: unknown): Promise<ActionResult<{ cityKey: string }>> {
  if (!ctx.can("finance.write")) return { ok: false, error: "forbidden" };
  const parsed = CarrierRateInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const v = parsed.data;
  const before = (await myCarrierRates(ctx.scope)).find((r) => r.cityKey === v.cityKey) ?? null;
  const values = {
    deliveryFeeCents: v.deliveryFeeCents,
    returnFeeCents: v.returnFeeCents,
    codFeeBp: v.codFeeBp,
    codFeeMinCents: v.codFeeMinCents,
    codFeeFlatCents: v.codFeeFlatCents,
    active: v.active,
    updatedBy: ctx.user.id,
    updatedAt: opsNow(),
  };
  await db
    .insert(carrierRates)
    .values(storeValues(ctx.scope, { id: newId(), carrierAccountId: MY_CARRIER, cityKey: v.cityKey, ...values }))
    .onDuplicateKeyUpdate({ set: values });
  await auditFrom(ctx, "finance.carrier_rate.saved", { target: v.cityKey, meta: { before, after: { cityKey: v.cityKey, ...values, updatedAt: undefined, updatedBy: undefined } } });
  return { ok: true, data: { cityKey: v.cityKey } };
}

/** Delivered orders of the last 28 store-local days per city slug ('*' = no slug): their shipping in cents. */
export async function deliveredShippingByCity(scope: StoreScope, days = 28): Promise<Map<string, number[]>> {
  const { from, to } = spanOf(trailingDays(await storeTz(scope), opsNow(), days));
  const rows = await db
    .select({ cityKey: orders.cityKey, shipping: orders.shipping })
    .from(orders)
    .where(whereStore(orders, scope, eq(orders.shipState, "delivered"), gte(orders.deliveredAt, from), lt(orders.deliveredAt, to), and(eq(orders.isTest, false), notHoneypot)))
    .limit(FEE_ROWS_MAX);
  const out = new Map<string, number[]>();
  for (const r of rows) {
    const k = r.cityKey || "*";
    const list = out.get(k) ?? [];
    list.push(toCents(r.shipping));
    out.set(k, list);
  }
  return out;
}

/** Fee charged (median shipping of the city's delivered orders, 28 d) beside fee paid (the rate row), largest n first. */
export async function feeChargedVsPaid(scope: StoreScope): Promise<FeeLine[]> {
  const [byCity, rates] = await Promise.all([deliveredShippingByCity(scope), myCarrierRates(scope)]);
  return feeLines(byCity, rates);
}

