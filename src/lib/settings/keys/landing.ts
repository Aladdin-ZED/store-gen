/**
 * Store setting `landing` (docs/STORE-SAAS.md §D.10, landing.md LAN-§2.3, request Q9; owner: landing, P3): landing
 * behaviour per store. `inStoreMode` is what `modeAllows(mode, "landing", { landingInStoreMode })` reads (§A.2).
 */
import { z } from "zod";

export const LandingSetting = z.object({
  v: z.literal(1).default(1),
  /** R2 store mode: "also use landing pages" */
  inStoreMode: z.boolean().default(false),
  thankYou: z
    .object({ confirmWhatsapp: z.boolean().default(true), expectation: z.boolean().default(true), trackLink: z.boolean().default(true) })
    .prefault({}),
  leads: z
    .object({
      capture: z.enum(["market_default", "on", "off"]).default("market_default"),
      followUpHours: z.array(z.number().int().min(1).max(168)).max(3).default([2, 24]),
    })
    .prefault({}),
  /** LP-11 */
  waOrder: z.object({ enabled: z.boolean().default(false) }).prefault({}),
  tracking: z.object({ requests: z.boolean().default(true) }).prefault({}),
  /** R2 */
  attach: z.object({ noindexDefault: z.boolean().default(true), shopLink: z.boolean().default(true) }).prefault({}),
});
export type LandingSetting = z.output<typeof LandingSetting>;
