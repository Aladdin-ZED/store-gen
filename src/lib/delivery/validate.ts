/**
 * Zone input and invariants (P3 LANDING; landing.md LAN-§2.1, §7.1; docs/STORE-SAAS.md D68). Pure and isomorphic: the
 * server runs it inside `saveZones` (under the store's "zones" lock) and the delivery editor may run it to show a
 * problem before the save. Server and admin code only: it imports `cityKey` (src/lib/orders/address.ts), which no
 * landing add-on may reach (D68, `test:landing-addons`).
 *
 * Two steps, so a value written by mistake can never be stored: `normalizeZones` maps every city given as a
 * `City.value` ("Fès") to its key ("fes") and keeps anything it cannot map as written; `zoneProblems` then checks the
 * stored shape, where only "*" and `cityKey(c.value)` of a city of the market's list are allowed (`unknown_city`).
 */
import { z } from "zod";
import { MAX_ETA_DAYS, MAX_FEE_CENTS, MAX_ZONES, ZONE_NAME_MAX, ZONE_NOTE_MAX } from "@/lib/landing/limits";
import { OTHER_CITY } from "@/lib/markets/cities-ma";
import type { City } from "@/lib/markets/types";
import { cityKey } from "@/lib/orders/address";
import type { ZoneInput, ZoneProblem } from "./types";

const ID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const cents = z.number().int().min(0).max(MAX_FEE_CENTS).nullable();
const days = z.number().int().min(0).max(MAX_ETA_DAYS).nullable();

/** One zone of the editor's payload (shape and bounds; the cross-zone rules are `zoneProblems`). */
export const ZoneInputSchema = z.object({
  id: z.string().regex(ID_RE).optional(),
  name: z.string().trim().min(1).max(ZONE_NAME_MAX),
  cities: z.array(z.string().trim().min(1).max(60)).max(200),
  feeCents: cents,
  freeFromCents: cents,
  etaMinDays: days,
  etaMaxDays: days,
  notServed: z.boolean(),
  note: z
    .string()
    .trim()
    .max(ZONE_NOTE_MAX)
    .nullable()
    .transform((v) => v || null),
});

/** The whole list; longer than `MAX_ZONES` on purpose, so the invariant reports `too_many` instead of a parse error. */
export const ZoneListSchema = z.array(ZoneInputSchema).max(MAX_ZONES * 4);

/** The keys a zone may hold in a market: `cityKey(c.value)` of every listed city except "Autre"; empty without a list. */
export function marketCityKeys(cities: readonly City[] | null): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const c of cities ?? []) {
    if (c.value === OTHER_CITY.value) continue;
    const key = cityKey(c.value);
    if (key) keys.add(key);
  }
  return keys;
}

/** The zones with every city as a key: "*" stays, a key stays, a `City.value` becomes its key, anything else is kept as written. Duplicates inside a zone collapse. */
export function normalizeZones<Z extends Pick<ZoneInput, "cities">>(zones: readonly Z[], keys: ReadonlySet<string>): (Omit<Z, "cities"> & { cities: string[] })[] {
  return zones.map((z) => {
    const cities: string[] = [];
    for (const raw of z.cities) {
      const c = raw.trim();
      const key = c === "*" || keys.has(c) ? c : (cityKey(c) ?? c);
      if (!cities.includes(key)) cities.push(key);
    }
    return { ...z, cities };
  });
}

/** Every broken invariant of LAN-§2.1, in list order; empty when the list may be stored. */
export function zoneProblems(
  zones: readonly Pick<ZoneInput, "name" | "cities" | "feeCents" | "freeFromCents" | "etaMinDays" | "etaMaxDays" | "notServed">[],
  keys: ReadonlySet<string>,
): ZoneProblem[] {
  const problems: ZoneProblem[] = [];
  if (zones.length > MAX_ZONES) problems.push({ code: "too_many" });
  const owner = new Map<string, string>();
  let star = false;
  for (const z of zones) {
    const zone = z.name;
    for (const c of z.cities) {
      if (c === "*") {
        if (star) problems.push({ code: "star_twice", zone });
        star = true;
      } else if (!keys.has(c)) problems.push({ code: "unknown_city", zone, city: c });
      else if (owner.has(c)) problems.push({ code: "city_twice", zone, city: c });
      else owner.set(c, zone);
    }
    const min = z.etaMinDays;
    const max = z.etaMaxDays;
    if ((min === null) !== (max === null)) problems.push({ code: "eta_half", zone });
    else if (min !== null && max !== null && (min < 0 || max > MAX_ETA_DAYS || min > max)) problems.push({ code: "eta_order", zone });
    if (z.notServed && (z.feeCents !== null || z.freeFromCents !== null || min !== null || max !== null)) problems.push({ code: "not_served_values", zone });
  }
  return problems;
}
