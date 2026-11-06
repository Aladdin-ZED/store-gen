/**
 * The store's answers the legal pages read (P3 LANDING; landing.md LAN-§3.3, LD29; docs/STORE-SAAS.md D73): every
 * promise of a legal page comes from `policies`, `checkout.confirmationCall`, the zones or the calling window, and an
 * unset answer gives a visible gap line, never a promise. Pure and isomorphic.
 *
 * The server builds a `LegalPolicyInput` from the store's settings at serve time (src/lib/render/store-pages.server.ts
 * `getStoreLegalDocument`, and the export bundle, through CCR docs/saas/ccr/r1-p3-2.md). Until a caller passes one,
 * a legal page knows none of the answers and says none of them: `null` reads as every card unset.
 */
import type { EffectiveWindow } from "@/lib/callcenter/window";
import { shopperHoursText } from "@/lib/landing/hours";
import { PoliciesSetting, type StorePolicyFacts } from "@/lib/settings/keys/policies";

export interface LegalPolicyInput {
  /** the store's `policies` setting */
  policies: StorePolicyFacts;
  /** `checkout.confirmationCall`; null = not known here (no call is promised) */
  confirmationCall: boolean | null;
  /** `checkout.zonesEnabled` with at least one zone that has days (the form then shows each city's dates) */
  zonesWithDays: boolean;
  /** the calling window (`callingWindowFor(scope)`); its hours show only while `!noShopperHours` */
  window: EffectiveWindow | null;
}

/** What a legal text reads: the answers, resolved for one language at one instant. */
export interface LegalPolicy {
  policies: StorePolicyFacts;
  /** the store confirms every order by phone */
  call: boolean;
  zonesWithDays: boolean;
  /** the week's hours a shopper may be told ("lun.-sam. 09:30-13:00, 14:30-21:00"), null when there are none */
  hours: string | null;
}

const UNSET: StorePolicyFacts = PoliciesSetting.parse({});

export function resolveLegalPolicy(input: LegalPolicyInput | null | undefined, lang: "ar" | "fr" | "en", now: string): LegalPolicy {
  if (!input) return { policies: UNSET, call: false, zonesWithDays: false, hours: null };
  const at = new Date(now);
  const hours = input.window && Number.isFinite(at.getTime()) ? shopperHoursText(input.window, lang, lang === "ar" ? "ar-MA" : lang === "fr" ? "fr-MA" : "en-GB", at) : null;
  return { policies: input.policies, call: input.confirmationCall === true, zonesWithDays: input.zonesWithDays, hours };
}
