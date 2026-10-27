/**
 * Zone lookup (P3 LANDING; landing.md LAN-§7.1, §2.1; docs/STORE-SAAS.md D68, §K.2 P0). Pure and isomorphic; the rule
 * is final at P0: the exact slug's zone, else the "*" zone (also for `null`: "Autre", a typed city that did not
 * normalise, a market without a city list), else null. Zones are read in the order given (`listZones` answers them in
 * `position` order), so the first zone listing a city wins.
 */
import { cityKey as keyOf, type CityKey } from "@/lib/orders/address";
import type { DeliveryZoneRow } from "./types";

export function zoneForCity(zones: readonly DeliveryZoneRow[], cityKey: CityKey | null): DeliveryZoneRow | null {
  if (cityKey !== null) {
    const exact = zones.find((z) => z.cities.includes(cityKey));
    if (exact) return exact;
  }
  return zones.find((z) => z.cities.includes("*")) ?? null;
}

/** = zoneForCity(zones, cityKey(cityValue)): the server-side convenience for `orders.city` / `leads.city`. */
export function zoneForCityValue(zones: readonly DeliveryZoneRow[], cityValue: string): DeliveryZoneRow | null {
  return zoneForCity(zones, keyOf(cityValue));
}
