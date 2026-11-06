import "server-only";
/**
 * The store's answers a legal page reads at serve time (P3 LANDING; landing.md LAN-§3.3, LD29, PUB-03; docs/STORE-SAAS.md
 * D73): the `policies` setting, `checkout.confirmationCall`, whether the order form shows each city's delivery date
 * (zones on, the line on, at least one zone with days) and the calling window. Every read goes through the store's
 * scope (settings, `listZones`, `callingWindowFor`), so one store's answers never reach another store's page.
 *
 *   renderLegalHtml(doc, kind, { …, policy: await legalPolicyFor(scope) })     (CCR docs/saas/ccr/r1-p3-2.md)
 */
import { callingWindowFor } from "@/lib/callcenter/window.server";
import { listZones } from "@/lib/delivery/zones.server";
import { getStoreSettings } from "@/lib/settings";
import type { StoreScope } from "@/lib/tenancy/types";
import type { LegalPolicyInput } from "./policy";

export async function legalPolicyFor(scope: StoreScope): Promise<LegalPolicyInput> {
  const [{ policies, checkout }, zones, window] = await Promise.all([getStoreSettings(scope, ["policies", "checkout"] as const), listZones(scope), callingWindowFor(scope)]);
  const zonesWithDays = checkout.zonesEnabled && checkout.lineOnLanding && zones.some((z) => !z.notServed && z.etaMinDays !== null && z.etaMaxDays !== null);
  return { policies, confirmationCall: checkout.confirmationCall, zonesWithDays, window };
}
