/**
 * Store setting `store` (docs/STORE-SAAS.md §D.10; owner: core): the store's contacts and legal facts, and the
 * LP-04 confirmation block (LAN Q10). `stores.name` is authoritative for the name (every name write runs the live
 * brand check, D76); the logo lives in `brand.logo.primary` (DES-R16). The R1.0 conversion moves both out of the
 * legacy value, whose extra fields this schema drops on read.
 */
import { z } from "zod";
import { httpsUrl, optional, optionalText, phone } from "../fields";

/**
 * What the thank-you page and the form promise about the confirmation call (LP-04). `withinHours` omitted = no
 * promise (never invented). The calling hours are not here: they come from `ops.callingWindow` through
 * `callingWindowFor(scope)` (rev 3, D73).
 */
export const StoreConfirmation = z.object({
  /** E.164: the number agents call from (shown in full: it is the store's own) */
  callerPhone: z.string().regex(/^\+[1-9]\d{7,14}$/).optional(),
  /** wa.me digits for "Confirm on WhatsApp" (defaults to `whatsapp`) */
  whatsapp: z.string().regex(/^[1-9]\d{7,14}$/).optional(),
  /** "we call within N hours" */
  withinHours: z.number().int().min(1).max(48).optional(),
});

export const StoreSetting = z.object({
  legalName: optionalText(160),
  phone: optional(phone),
  whatsapp: optional(phone),
  email: optional(z.email({ error: "Enter a valid email address." }).max(160)),
  address: optionalText(300),
  city: optionalText(120),
  country: z.string().regex(/^[A-Z]{2}$/).default("MA"),
  /** Moroccan Identifiant Commun de l'Entreprise: 15 digits */
  ice: optional(z.string().regex(/^[0-9]{15}$/, { error: "ICE is 15 digits." })),
  /** Registre de commerce number (format varies by city) */
  rc: optional(z.string().trim().regex(/^[A-Za-z0-9 ./-]{1,30}$/, { error: "Invalid RC number." })),
  socials: z
    .object({
      facebook: optional(httpsUrl),
      instagram: optional(httpsUrl),
      tiktok: optional(httpsUrl),
      youtube: optional(httpsUrl),
      snapchat: optional(httpsUrl),
    })
    .default({}),
  confirmation: StoreConfirmation.default({}),
});
export type StoreSetting = z.output<typeof StoreSetting>;
