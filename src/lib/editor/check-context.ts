/**
 * The builder checklist's store context (docs/STORE-SAAS.md §K.1 T4; landing.md LAN-§3.2, LAN Q15, rev 3 ENGP-20):
 * `buildChecklist(doc, ctx: LandingCheckContext)` replaces the positional `store`, `now`, `pixels` parameters and adds
 * the store facts the LP-02 / LP-21 rules read, so the builder shows the same items with the same ids as the
 * publish gate (§M.5). Pure and isomorphic; the editor's server preload builds it.
 *
 * Signature frozen at C0a. `CityKey` and `NumberClass` mirror the types their owners define (operations P4,
 * OPE-§10.1; landing P3, LAN-§6.4) until those files exist; T4 / P3 re-point the imports.
 */
import type { PixelCheckContext } from "@/lib/pixels/checklist";
import type { StoreHealth } from "./types";

/** The one city key of the platform: "casablanca", "fes", "ksar-el-kebir" (OD47). */
export type CityKey = string & { readonly __city: true };

export type NumberClass =
  | "price"
  | "compare_at"
  | "unit_price"
  | "savings"
  | "fee"
  | "units"
  | "qty"
  | "delivery_days"
  | "return_days"
  | "warranty_months"
  | "within_hours"
  | "stock"
  | "countdown"
  | "stat"
  | "counter"
  | "rating"
  | "review_count"
  | "weight_volume"
  | "fact"
  | "phone"
  | "order_id"
  | "year"
  | "other";

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
