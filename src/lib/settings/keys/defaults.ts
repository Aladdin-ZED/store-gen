/**
 * Store setting `defaults` (docs/STORE-SAAS.md §D.10; owner: core): what a new page starts with. Currency,
 * market and time zone moved to `stores` columns (SET-08); the legacy fields are dropped on read and the
 * R1.0 conversion copies them to store #1's row.
 */
import { z } from "zod";
import { Locale, Money } from "@/lib/page/schema";
import { text } from "../fields";

export const DefaultsSetting = z.object({
  /** locale order offered to new pages, first = the page default; empty = the store's default_locale, then its locales */
  locales: z.array(Locale).max(8).default([]),
  /** country of the order form's phone field */
  phoneCountry: z.string().regex(/^[A-Z]{2}$/).default("MA"),
  /** delivery fee prefilled on new pages; null = left empty (never invented) */
  shippingFee: Money.nullable().default(null),
  /** e.g. "Livraison gratuite 24–48h" / "التوصيل مجاني خلال 24–48 ساعة" */
  deliveryText: text(140).default(""),
});
export type DefaultsSetting = z.output<typeof DefaultsSetting>;
