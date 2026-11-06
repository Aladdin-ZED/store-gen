/**
 * Delivery promise types (P3 LANDING; landing.md LAN-§7.1, §2.3; docs/STORE-SAAS.md D68, D73, §K.2 P0). Isomorphic. A
 * city is its `CityKey` slug in storage and in every server API (operations' `cityKey`, OPE-§10.1); the browser only
 * ever sees the value-keyed `ZoneTable` (rev 4, CRIT1). Frozen at P0 with the zone functions; P3 adds `ZoneInput` and
 * `ZoneProblem` (LAN-§7.1).
 *
 * The calling window is operations' type and operations' pure helpers, re-exported unchanged (rev 4, CRIT3): this part
 * declares no window type of its own and never reads `days` itself (src/lib/landing/hours.ts builds on these four).
 */
import type { CityKey } from "@/lib/orders/address";

export type { EffectiveWindow, Range } from "@/lib/callcenter/window";
export { hoursText, nextCallableAt, rangesForDay, shopperPromiseAllowed } from "@/lib/callcenter/window";
export type { CityKey } from "@/lib/orders/address";

/** `delivery_zones.cities`: slugs, or "*" = every city not in another zone ("Autre" and typed cities included) */
export type ZoneCityKey = CityKey | "*";

export interface DeliveryZoneRow {
  id: string;
  name: string;
  cities: ZoneCityKey[];
  /** null = not typed by the owner (never invented) */
  feeCents: number | null;
  freeFromCents: number | null;
  /** working days; both null or both set */
  etaMinDays: number | null;
  etaMaxDays: number | null;
  notServed: boolean;
  /** agents only; never rendered on a page */
  note: string | null;
  position: number;
}

/** `checkout.calendar` with the store's time zone; `leadDays` = `confirmationLeadDays ?? 0` before the call, 0 after (OPS-12) */
export interface StoreCalendar {
  tz: string;
  /** ISO weekdays, 1 = Monday */
  workdays: readonly number[];
  cutoffHour: number | null;
  holidays: readonly string[];
  leadDays: number;
}

export interface EtaWindow {
  /** YYYY-MM-DD store-local */
  from: string;
  to: string;
  minDays: number;
  maxDays: number;
  leadDays: number;
}

export interface ZoneLine {
  zoneId: string;
  zoneName: string;
  notServed: boolean;
  eta: EtaWindow | null;
  etaText: Record<"ar" | "fr" | "en", string> | null;
  feeCents: number | null;
}

/**
 * The ONE browser zone table (rev 4, CRIT1): `lp-assist.dz`, `#sg-config.checkout.zones` (R2), the `landing-v3` config.
 * `city` is keyed by the posted `City.value` ("Fès"), built on the server from the slug-keyed zones; a value absent
 * from it ("Autre", a typed city) resolves to `star`. The browser never computes a slug.
 */
export interface ZoneTable {
  v: 1;
  zones: { n: string; fee: number | null; freeFrom: number | null; d: [number, number] | null; ns: boolean }[];
  city: Record<string, number>;
  star: number | null;
  /** holidays: the next 60 days */
  cal: StoreCalendar & { holidays: string[] };
}

/**
 * One zone as the editor (or an import) sends it to `saveZones`: `cities` are keys ("fes") or `City.value`s ("Fès"),
 * normalised through `cityKey()` before the invariants run, or "*" (LAN-§2.1). `id` keeps a zone's identity across a
 * save when it names a zone of the same store; any other id is replaced.
 */
export interface ZoneInput {
  id?: string;
  name: string;
  cities: readonly string[];
  feeCents: number | null;
  freeFromCents: number | null;
  etaMinDays: number | null;
  etaMaxDays: number | null;
  notServed: boolean;
  note: string | null;
}

/**
 * A broken invariant of a zone list (LAN-§2.1, §7.1): `zone` is the zone's name, `city` the offending key or value.
 * `eta_order`: etaMin > etaMax; `eta_half`: one bound set without the other; `not_served_values`: a not-served zone
 * with a fee or days; `unknown_city`: not `cityKey(c.value)` of a city of the market's list; `too_many`: > 40 zones.
 */
export type ZoneProblem = {
  code: "city_twice" | "star_twice" | "eta_order" | "eta_half" | "not_served_values" | "unknown_city" | "too_many";
  zone?: string;
  city?: string;
};
