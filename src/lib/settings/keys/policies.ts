/**
 * Store setting `policies` (docs/STORE-SAAS.md §D.10, landing.md LAN-§2.3; owner: landing, P3): the store's policy
 * facts, the single source of promises (LD29) for the legal pages, the delivery line and the AI prompt
 * (`StorePolicyFacts`). "unset" and null mean the owner has not said; nothing is ever assumed. No hours here
 * (rev 3, D73): the contact page reads `callingWindowFor(scope)`.
 */
import { z } from "zod";
import { isoDateTime } from "../fields";

const LocText = z.object({ ar: z.string().trim().max(140).optional(), fr: z.string().trim().max(140).optional(), en: z.string().trim().max(140).optional() });

/** Kept for fixtures only; no setting of this part stores hours any more (LD29). */
export const Hours = z.object({ days: z.array(z.number().int().min(1).max(7)).min(1).max(7), from: z.string().regex(/^\d{2}:\d{2}$/), to: z.string().regex(/^\d{2}:\d{2}$/) });

export const PoliciesSetting = z.object({
  v: z.literal(1).default(1),
  /** open and check the parcel before paying */
  inspection: z.enum(["allowed", "not_allowed", "unset"]).default("unset"),
  delivery: z
    .object({
      coverage: z.enum(["national", "listed_zones", "unset"]).default("unset"),
      /** [min, max] days, used when zones are off */
      typicalDays: z.tuple([z.number().int().min(0).max(30), z.number().int().min(0).max(30)]).nullable().default(null),
      /** a statement only; landing pricing is unchanged (LD4) */
      freeFromCents: z.number().int().min(0).max(100_000_000).nullable().default(null),
    })
    .prefault({}),
  returns: z
    .object({
      accepted: z.boolean().nullable().default(null),
      windowDays: z.number().int().min(1).max(90).nullable().default(null),
      whoPays: z.enum(["store", "customer", "unset"]).default("unset"),
      condition: LocText.optional(),
    })
    .prefault({}),
  exchange: z.object({ accepted: z.boolean().nullable().default(null), windowDays: z.number().int().min(1).max(90).nullable().default(null) }).prefault({}),
  refund: z
    .object({ method: z.enum(["cash", "transfer", "store_credit", "unset"]).default("unset"), withinDays: z.number().int().min(1).max(60).nullable().default(null) })
    .prefault({}),
  warranty: z.object({ months: z.number().int().min(1).max(120).nullable().default(null), text: LocText.optional() }).prefault({}),
  /** rev 3 (OPS-11): `hours` removed; a stored value that still has it parses with the field stripped (D73, no mirror) */
  contact: z.object({ channels: z.array(z.enum(["phone", "whatsapp", "email"])).max(3).default([]) }).prefault({}),
  extras: z
    .array(z.object({ id: z.string().regex(/^[a-z0-9-]{2,24}$/), text: LocText }))
    .max(6)
    .default([]),
  reviewedAt: isoDateTime.nullable().default(null),
});
export type StorePolicyFacts = z.output<typeof PoliciesSetting>;
