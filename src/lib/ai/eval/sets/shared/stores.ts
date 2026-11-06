/**
 * The fixture stores the eval set runs in (P7 AI; ai.md AI-§F.3). Each is a store's settings in the shapes the store
 * block reads: the policies, the voice, WhatsApp and the calling hours. No contact, legal or customer field exists
 * here, as none reaches a prompt. A cross-family fixture lives once under sets/shared/ and is hashed into each family
 * that imports it. The calling window is a saved or an unsaved window: its hours text is built by `callingHoursFor`
 * (P4's `hoursText`) when the harness builds the store block, never written here (rev 5, CRIT2-1).
 */
import type { FixtureStore } from "../../types";

/** A Moroccan COD store with every common policy stated, WhatsApp and a saved calling window. */
export const STORE_FULL: FixtureStore = {
  id: "store-full",
  market: "MA",
  currency: "MAD",
  primaryLocale: "fr",
  policies: {
    inspection: "allowed",
    delivery: { coverage: "national", typicalDays: [1, 3], freeFromCents: null },
    returns: { accepted: true, windowDays: 7, whoPays: "customer" },
    exchange: { accepted: true, windowDays: 7 },
    refund: { method: "cash", withinDays: null },
    warranty: { months: null },
    contact: { channels: ["phone", "whatsapp"] },
  },
  voice: { darija: "cta", formality: "vous" },
  hasWhatsapp: true,
  window: { configured: true, withinHours: null },
  memory: [],
};

/** GEN-09: no WhatsApp number; inspection left unset (AI-§F.3 "no WhatsApp / no inspection"). */
export const STORE_NO_WHATSAPP: FixtureStore = {
  ...STORE_FULL,
  id: "store-no-whatsapp",
  policies: { inspection: "unset", delivery: { coverage: "national", typicalDays: null }, returns: { accepted: null }, exchange: { accepted: null }, contact: { channels: ["phone"] } },
  hasWhatsapp: false,
};

/** Inspection refused, no returns: a line promising either must go. */
export const STORE_NO_INSPECTION: FixtureStore = {
  ...STORE_FULL,
  id: "store-no-inspection",
  policies: { inspection: "not_allowed", delivery: { coverage: "listed_zones", typicalDays: [2, 4] }, returns: { accepted: false }, exchange: { accepted: false } },
  window: { configured: false, withinHours: null },
};

/** Arabic first, Darija light, CTAs and words of the owner's own (AI-§F.3 "Darija-heavy voice"). */
export const STORE_DARIJA: FixtureStore = {
  ...STORE_FULL,
  id: "store-darija",
  primaryLocale: "ar",
  voice: { darija: "light", warmCrisp: -1, playfulSerious: -1, ctaByLocale: { ar: "سيفط الطلب" }, wordsUse: ["مزيان", "دابا"], wordsAvoid: ["رخيص"], register: "warm" },
  memory: [
    { kind: "voice", text: "نهضرو مع الزبون بحال شي صاحب، بلا مبالغة", locale: "ar" },
    { kind: "avoid", text: "ما نقولوش رخيص، نقولو ثمن مناسب", locale: "ar" },
  ],
};

/** Nothing stated at all: every policy topic is "not stated", no window saved. */
export const STORE_SPARSE: FixtureStore = {
  id: "store-sparse",
  market: "MA",
  currency: "MAD",
  primaryLocale: "fr",
  policies: {},
  voice: {},
  hasWhatsapp: false,
  window: { configured: false, withinHours: null },
  memory: [],
};

/** A French-market store in euros, tutoiement (the voice says tu). */
export const STORE_FR: FixtureStore = {
  ...STORE_FULL,
  id: "store-fr",
  market: "FR",
  currency: "EUR",
  policies: { inspection: "unset", delivery: { coverage: "national", typicalDays: [2, 5], freeFromCents: 4_900 }, returns: { accepted: true, windowDays: 14, whoPays: "store" } },
  voice: { formality: "tu", darija: "none", warmCrisp: 1 },
  window: { configured: false, withinHours: 24 },
};

export const FIXTURE_STORES: readonly FixtureStore[] = [STORE_FULL, STORE_NO_WHATSAPP, STORE_NO_INSPECTION, STORE_DARIJA, STORE_SPARSE, STORE_FR];
