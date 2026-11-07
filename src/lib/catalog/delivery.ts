/**
 * The delivery fee rule (storefront.md STO-§15.9, STO-D10; core D68, D75). Isomorphic and pure: the server, the store
 * checkout and cart chunks (S1) and the `landing-v3` runtime chunk (LP-16) run the same function on the same inputs, so
 * the fee a shopper sees is the fee the server charges. No `cityKey()` here (rev 4, CRIT1): the server converts the
 * posted city value before `zoneForCity`, the browser looks the value up in landing's value-keyed `ZoneTable`.
 *
 *   zoneFeeOfRow(row)                 server: a `DeliveryZoneRow` → the three fields the rule reads
 *   zoneFeeOfTable(table, value)      browser: `t.zones[t.city[value] ?? t.star]`, null when neither exists
 *   storeDeliveryFee(i)               the six ordered branches of STO-§15.9
 *   landingZoneFee(i)                 LP-16 (D75): a "charge delivery by city" landing page's fee in cents
 *
 * Track S1 owns this file in R2 (`src/lib/catalog/**`); the R2 contract step (C2-B2) wrote it because LP-16's server
 * and runtime sides (maintainer, D75) call the one rule. Signatures frozen in src/lib/contracts/r2-contract.ts.
 */
import type { DeliveryRule } from "@/lib/orders/contract-v3";
import type { DeliveryZoneRow, ZoneTable } from "@/lib/delivery/types";

export type { DeliveryRule } from "@/lib/orders/contract-v3";

/** The three fields the fee rule reads (a `DeliveryZoneRow` on the server, a `ZoneTable` entry in the browser). */
export type ZoneFee = Pick<DeliveryZoneRow, "feeCents" | "freeFromCents" | "notServed"> & { zoneId?: string; zoneName?: string };

export type DeliveryResult = { ok: true; cents: number; rule: DeliveryRule; zone: ZoneFee | null } | { ok: false; reason: "not_served" | "not_set" };

export function zoneFeeOfRow(z: DeliveryZoneRow): ZoneFee {
  return { feeCents: z.feeCents, freeFromCents: z.freeFromCents, notServed: z.notServed, zoneId: z.id, zoneName: z.name };
}

export function zoneFeeOfTable(t: ZoneTable, value: string): ZoneFee | null {
  const own = Object.prototype.hasOwnProperty.call(t.city, value) ? t.city[value] : undefined;
  const idx = own !== undefined ? own : t.star;
  const z = idx === null || idx === undefined ? undefined : t.zones[idx];
  return z ? { feeCents: z.fee, freeFromCents: z.freeFrom, notServed: z.ns, zoneName: z.n } : null;
}

/** STO-§15.9: free offer → not served → free threshold → zone fee → fallback fee → not set. */
export function storeDeliveryFee(i: { zone: ZoneFee | null; fallbackFeeCents: number | null; subtotalCents: number; allLinesFree: boolean }): DeliveryResult {
  if (i.allLinesFree) return { ok: true, cents: 0, rule: "free_offer", zone: i.zone };
  if (i.zone?.notServed) return { ok: false, reason: "not_served" };
  if (i.zone && i.zone.freeFromCents !== null && i.subtotalCents >= i.zone.freeFromCents) return { ok: true, cents: 0, rule: "free_threshold", zone: i.zone };
  if (i.zone && i.zone.feeCents !== null) return { ok: true, cents: i.zone.feeCents, rule: "zone", zone: i.zone };
  if (i.fallbackFeeCents !== null) return { ok: true, cents: i.fallbackFeeCents, rule: "fallback", zone: i.zone };
  return { ok: false, reason: "not_set" };
}

/**
 * LP-16 (core D75, LAN-§20.4): the delivery fee of a `runtime_v = 3` landing page, the page's flat fee as the fallback.
 * `allLinesFree` is the page's own "free delivery" (`effectiveFree`: a 0 page fee or the offer's free shipping), which
 * no zone fee overrides. A not-served city keeps landing's rule (LD6: the order is accepted and flagged) and pays the
 * page fee, so the result is always a number. The `landing-v3` chunk and the order API both call this.
 */
export function landingZoneFee(i: { zone: ZoneFee | null; pageFeeCents: number; subtotalCents: number; allLinesFree: boolean }): number {
  const r = storeDeliveryFee({ zone: i.zone, fallbackFeeCents: i.pageFeeCents, subtotalCents: i.subtotalCents, allLinesFree: i.allLinesFree });
  return r.ok ? r.cents : i.pageFeeCents;
}
