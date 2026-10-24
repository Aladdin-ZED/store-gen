/**
 * Store setting `checkout`, R1 part (docs/STORE-SAAS.md §D.10, landing.md LAN-§2.3; owner: landing, P3). Storefront
 * adds the `store` block (cart rules, buy model) from src/lib/settings/keys/checkout-store.ts in R2 and the
 * registry merges both into the one key (STO-R16); that file never redefines `addressMode` (UX-31).
 */
import { z } from "zod";

export const CheckoutSetting = z.object({
  zonesEnabled: z.boolean().default(false),
  /** show the delivery line on landing pages when zones are on */
  lineOnLanding: z.boolean().default(true),
  calendar: z
    .object({
      /** ISO weekdays (1 = Monday); MA default Mon-Sat */
      workdays: z.array(z.number().int().min(1).max(7)).min(1).max(7).default([1, 2, 3, 4, 5, 6]),
      /** store-local; later orders start the next working day */
      cutoffHour: z.number().int().min(0).max(23).nullable().default(null),
      /** store-local dates */
      holidays: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(60).default([]),
      holidaysReviewedYear: z.number().int().min(2026).max(2100).nullable().default(null),
      /** rev 3 (OPS-12): working days before the window on pages seen before the call; null = not typed (counted as 0, the editor asks) */
      confirmationLeadDays: z.number().int().min(0).max(3).nullable().default(null),
    })
    .prefault({}),
  /** show "message us" in place of the submit when the city is not served */
  notServed: z.object({ whatsapp: z.boolean().default(true) }).prefault({}),
  /** the confirmation-call promise (thank-you, FAQ, guard) */
  confirmationCall: z.boolean().default(true),
  /** rev 3 (UX-31): one decision for the landing form and the store checkout; null = the market default (`required` for MA) */
  addressMode: z.enum(["required", "optional"]).nullable().default(null),
  /** R-D45 defaults for new pages (a page keeps its own FormConfig) */
  newPageForm: z.object({ city: z.enum(["select", "text", "hidden"]).optional(), note: z.enum(["optional", "hidden"]).optional() }).default({}),
});
export type CheckoutSetting = z.output<typeof CheckoutSetting>;
