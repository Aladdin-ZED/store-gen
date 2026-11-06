/**
 * The builder checklist's store context (docs/STORE-SAAS.md §K.1 T4; landing.md LAN-§3.2, LAN Q15, rev 3 ENGP-20):
 * `buildChecklist(doc, ctx: LandingCheckContext)` replaces the positional `store`, `now`, `pixels` parameters and adds
 * the store facts the LP-02 / LP-21 rules read, so the builder shows the same items with the same ids as the
 * publish gate (§M.5). Pure and isomorphic; the editor's server preload builds it.
 *
 * Signature frozen at C0a. `CityKey` and `NumberClass` are their owners' types (operations P4, OPE-§10.1; landing P3,
 * LAN-§6.4), re-pointed at the P3 wave 1 merge (P0b P3-5).
 */
import type { GateFacts } from "@/lib/landing/honesty/gate";
import type { NumberClass } from "@/lib/landing/honesty/numbers";
import type { CityKey } from "@/lib/orders/address";
import type { PixelCheckContext } from "@/lib/pixels/checklist";
import type { StoreHealth } from "./types";

// P0b P3-5: the two types re-point to their owners (operations' city key, the numbers audit's classes)
export type { CityKey } from "@/lib/orders/address";
export type { NumberClass } from "@/lib/landing/honesty/numbers";

export interface LandingCheckContext {
  store: StoreHealth; // the former 2nd parameter (checklist.ts:53)
  now?: number; // the former 3rd parameter (default Date.now())
  pixels?: PixelCheckContext; // the former 4th parameter (default NO_PIXEL_CONTEXT)
  saas: true; // always true in Store Gen; tells the context form from the positional one
  zones: { enabled: boolean; count: number; hasMarketList: boolean; feesByTopCity: Record<CityKey, number | null> };
  policiesReviewed: boolean; // policies.reviewedAt set
  /** rev 5 (CRIT2-1): callingWindow = !noShopperHours(w, now), callingWindowSaved = shopperPromiseAllowed(w) */
  confirmation: { callerPhone: boolean; whatsapp: boolean; callingWindow: boolean; callingWindowSaved: boolean };
  waOrder: boolean; // landing.waOrder.enabled
  addressMode: "required" | "optional"; // the resolved checkout.addressMode (market default applied)
  leadDays: number; // checkout.calendar.confirmationLeadDays ?? 0
  published: { countdownEnd?: string; stockLeft?: number; stockChangedAt?: string } | null; // the live version's values
  facts: { allowed: string[]; byClass: Partial<Record<NumberClass, string[]>> }; // from allowedNumbersFor(), as the gate
  origin: Record<string, "generated" | "owner">; // per text-field path, who wrote it (LAN-§6.4)
  attestedFacts: string[]; // numerals attested through FactAttestSheet (audit page.fact_attested)
  appHref: (path: `/${string}`) => string; // fix links under the store's dashboard ("/settings/general" → "/app/<h>/settings/general")
  /**
   * The honesty gate's facts of the page (P3's `landingGateFactsFor`, CCR r1-p3-3): with them the checklist runs
   * every LAN-§3.2 row exactly as the publish gate does, and refolds `gate.gen` as the owner edits. Absent (a
   * fixture, a failed read) = the rows that need them stay silent.
   */
  gate?: GateFacts;
}

/**
 * The part of the context the server preload computes (`loadCheckContext`, ./check-context.server.ts): plain JSON,
 * shipped in the builder's bootstrap. The browser adds what only it has: the store identity the panel already
 * holds, the clock, the pixel context and the store's `appHref`.
 */
export type CheckContextData = Omit<LandingCheckContext, "store" | "now" | "pixels" | "appHref">;

/** The full context from the server's data and the browser's parts. */
export function checkContextOf(
  data: CheckContextData,
  parts: { store: StoreHealth; appHref: LandingCheckContext["appHref"]; now?: number; pixels?: PixelCheckContext },
): LandingCheckContext {
  return { ...data, ...parts };
}

/** A context with no store facts (fixtures, a page whose preload failed): every store-fact rule stays silent. */
export function emptyCheckData(): CheckContextData {
  return {
    saas: true,
    zones: { enabled: false, count: 0, hasMarketList: false, feesByTopCity: {} },
    policiesReviewed: true,
    confirmation: { callerPhone: true, whatsapp: true, callingWindow: true, callingWindowSaved: true },
    waOrder: false,
    addressMode: "required",
    leadDays: 0,
    published: null,
    facts: { allowed: [], byClass: {} },
    origin: {},
    attestedFacts: [],
  };
}
