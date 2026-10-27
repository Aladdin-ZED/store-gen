import "server-only";
/**
 * Delivery zones on the server (P3 LANDING; landing.md LAN-§7.1, §7.4; docs/STORE-SAAS.md D68, §K.2 P0). Frozen at P0:
 * the zone line every surface reads (the queue card and the call script, P4; `{eta_text}`, P5; tracking, the kit,
 * the WhatsApp order text, P3), the one producer of every browser zone table, and the slug-keyed fees for server joins.
 * P3 adds `listZones`, `saveZones` and `deliverySummary` here.
 *
 * `zoneLineFor` answers its documented safe default until P3 merges: `null`, no zone, so no delivery promise is shown
 * anywhere (P4 merges before P3 and its queue card reads it). The other two are typed stubs.
 */
import type { StoreScope } from "@/lib/tenancy/types";
import type { CityKey } from "@/lib/orders/address";
import type { ZoneLine, ZoneTable } from "./types";

/**
 * The zone line of a city (null key: "Autre" / unknown → the "*" zone). `stage` "before_call" (default) applies the
 * confirmation lead; "after_call" (tracking, `{eta_text}` once confirmed) uses 0 and `at = confirmed_at` (OPS-12).
 */
export async function zoneLineFor(scope: StoreScope, cityKey: CityKey | null, at?: Date, opts?: { stage: "before_call" | "after_call" }): Promise<ZoneLine | null> {
  void scope;
  void cityKey;
  void at;
  void opts;
  return null;
}

/** The value-keyed `ZoneTable` of the store (`buildZoneTable` over `listZones`, the calendar and the market's cities). */
export async function zonesForCheckout(scope: StoreScope): Promise<ZoneTable> {
  void scope;
  throw new Error("not implemented: P3 zonesForCheckout");
}

/** Slug-keyed fees for server joins (P1's `zones.feeMismatchTop5`, the checklist); never the browser table. */
export async function zoneFeesFor(scope: StoreScope, keys: readonly CityKey[]): Promise<Record<CityKey, number | null>> {
  void scope;
  void keys;
  throw new Error("not implemented: P3 zoneFeesFor");
}
