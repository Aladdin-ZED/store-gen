/**
 * The `store` block of the `checkout` setting (storefront.md STO-§15.1; request STO-R16: the store registry merges it
 * into `checkout` as the field `store`). S1 STOREFRONT owns this file in R2; the R2 contract step (C2-E, STO-§27.1)
 * wrote the first schema from STO-§15.1. The block is OPTIONAL in the merged key (absent = `CHECKOUT_STORE_DEFAULTS`),
 * so an R1 store's `checkout` value, its form and its export stay exactly as they were. The R1 fields of `checkout`
 * (zones, calendar, `confirmationCall`, `addressMode`, …) are landing's and never redefined here; the calling hours
 * are `ops.callingWindow` (STO-D45). Writes: `checkout.write`, audit `store.settings.updated` (key `checkout`), a
 * `catalog_version` bump.
 */
import { z } from "zod";

export const CheckoutStore = z.object({
  /** unset until the store first enters store / both mode (STO-D8 sets it) */
  buyModel: z.enum(["inline", "cart"]).optional(),
  /** inline model: a quiet "Ajouter au panier" link for multi-product baskets */
  inlineAlsoCart: z.boolean().default(false),
  /** NULL = not set (never invented) */
  fallbackFeeCents: z.number().int().min(0).max(1_000_000).nullable().default(null),
  /** "Commander sur WhatsApp" under the submit (needs the store number) */
  whatsappAlternative: z.boolean().default(true),
  /** R3 (0007): when the soft hold is taken (STO-§5.6, OPS-30) */
  reserveAt: z.enum(["confirmed", "order"]).default("confirmed"),
});
export type CheckoutStore = z.output<typeof CheckoutStore>;

/** The block's value when the stored `checkout` has none. */
export const CHECKOUT_STORE_DEFAULTS: CheckoutStore = CheckoutStore.parse({});
