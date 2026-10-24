/**
 * Store setting `accounting` (docs/STORE-SAAS.md §D.10, operations.md OPE-§2.9; owner: operations, P4 in R1 lite,
 * S3 in R2): the inputs of Profit lite (SF-04). Owner-typed values only; nothing here is ever invented (an unset
 * packaging cost stays NULL). The R2/R3 fields (tolerance, export format, tax profile…) arrive with S3.
 */
import { z } from "zod";
import { currencyCode, isoDate, isoDateTime } from "../fields";

const AdPlatform = z.enum(["meta", "tiktok", "snap", "google", "other"]);

export const AccountingSetting = z.object({
  /** per order, integer cents; null = not set */
  packagingCents: z.number().int().min(0).nullable().default(null),
  /** OPE-§16.6 */
  adsAllocation: z.enum(["spread", "unattributed"]).default("spread"),
  /** who holds the cash of "my carrier" (OD52): at the door (self-delivery) or on a statement */
  myCarrier: z
    .object({ settlement: z.enum(["at_delivery", "statement"]).default("at_delivery"), confirmedAt: isoDateTime.nullable().default(null) })
    .prefault({}),
  /** the billing currency of each ad account (absent = the store currency, OD56) */
  adAccounts: z.partialRecord(AdPlatform, z.object({ currency: currencyCode })).default({}),
  /** the owner's dated rates to the store currency: 1 unit = rateMilli / 1000 store units ("your rate, estimate") */
  adRates: z
    .array(z.object({ currency: currencyCode, fromDay: isoDate, rateMilli: z.number().int().min(1).max(100_000_000) }))
    .max(120)
    .default([])
    .refine((rates) => new Set(rates.map((r) => `${r.currency}:${r.fromDay}`)).size === rates.length, { error: "One rate per currency and day." }),
  cashHeldAlertDays: z.number().int().min(3).max(90).default(15),
});
export type AccountingSetting = z.output<typeof AccountingSetting>;
