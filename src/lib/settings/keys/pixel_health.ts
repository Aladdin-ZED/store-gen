/**
 * Store setting `pixel_health` (docs/STORE-SAAS.md §D.10; owner: operations, P5): the last server outcome per
 * pixel, "platform:id" → entry (docs/OFFERS.md §A.2), written through the scoped API (throttle key
 * `${storeId}:${platform}:${id}`, SET-11). The legacy registry re-exports these schemas.
 */
import { z } from "zod";

/** Last server outcome of a pixel (no personal data). */
export const PixelHealthEntry = z.object({
  at: z.iso.datetime({ offset: true }),
  state: z.enum(["ok", "refused", "unverified"]),
  code: z.enum(["token", "permission", "pixel", "rate", "network", "other"]).optional(),
  testMode: z.boolean(),
});
export type PixelHealthEntry = z.infer<typeof PixelHealthEntry>;
/** key "platform:id" */
export const PixelHealthSettings = z.record(z.string().max(80), PixelHealthEntry);
/** Spec name (§A.2). */
export const PixelHealth = PixelHealthSettings;
export type PixelHealth = z.infer<typeof PixelHealthSettings>;
