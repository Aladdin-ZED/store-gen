/**
 * The browser zone table builder (P3 LANDING; landing.md LAN-§7.1, rev 4 CRIT1; docs/STORE-SAAS.md D68, §K.2 P0). Pure:
 * `zonesForCheckout(scope) = buildZoneTable(await listZones(scope), calendarFor(scope), citiesFor(market))`, and the
 * shared parity fixture `scripts/qa/fixtures/city-key.json` calls it directly. The rule is final at P0.
 *
 * `city` is keyed by the posted `City.value` of every city of the list except "Autre":
 * `city[c.value] = index of zoneForCity(zones, cityKey(c.value))`, so a city outside every listed zone points at the
 * "*" zone, and a city with no zone at all (no "*" zone) is absent; an absent value resolves to `star` in the browser.
 * Zone indexes follow the order given (`listZones`: `position` order). `cal` is passed through: the caller cuts the
 * holidays to the next 60 days.
 */
import { OTHER_CITY } from "@/lib/markets/cities-ma";
import type { City } from "@/lib/markets/types";
import { cityKey } from "@/lib/orders/address";
import { zoneForCity } from "./match";
import type { DeliveryZoneRow, StoreCalendar, ZoneTable } from "./types";

export function buildZoneTable(zones: readonly DeliveryZoneRow[], cal: StoreCalendar, cities: readonly City[]): ZoneTable {
  const city: Record<string, number> = {};
  for (const c of cities) {
    if (c.value === OTHER_CITY.value) continue;
    const zone = zoneForCity(zones, cityKey(c.value));
    if (zone) city[c.value] = zones.indexOf(zone);
  }
  const star = zones.findIndex((z) => z.cities.includes("*"));
  return {
    v: 1,
    zones: zones.map((z) => ({
      n: z.name,
      fee: z.feeCents,
      freeFrom: z.freeFromCents,
      d: z.etaMinDays !== null && z.etaMaxDays !== null ? [z.etaMinDays, z.etaMaxDays] : null,
      ns: z.notServed,
    })),
    city,
    star: star === -1 ? null : star,
    cal: { tz: cal.tz, workdays: [...cal.workdays], cutoffHour: cal.cutoffHour, holidays: [...cal.holidays], leadDays: cal.leadDays },
  };
}
