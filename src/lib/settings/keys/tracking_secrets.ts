/**
 * Store setting `tracking_secrets` (docs/STORE-SAAS.md §D.10; secret; owner: operations, P5): Conversions API
 * and Events API credentials per pixel id inside the store (PIX-01, IN-03). The legacy registry re-exports
 * these schemas.
 */
import { z } from "zod";
import { PIXEL_ID_RE } from "@/lib/pixels/ids";
import { optional, secretToken } from "../fields";

/** A platform's "Test events" code (Meta Events Manager / TikTok Events Manager), e.g. TEST12345. */
export const TestEventCode = z.string().trim().regex(/^[A-Z0-9]{4,20}$/, { error: "4–20 capital letters and digits, e.g. TEST12345." });

/** Server credentials keyed by pixel id (each pixel optional; at most a few per store). */
const perPixel = <T extends z.ZodType>(platform: "meta" | "tiktok", value: T) =>
  z
    .record(z.string().regex(PIXEL_ID_RE[platform]), value)
    .refine((o) => Object.keys(o).length <= 200, { error: "Too many pixels." })
    .default({});

/**
 * Server-side event credentials (stored encrypted). Tokens and test codes are per pixel id — a
 * Conversions API token / Events API token belongs to one pixel (dataset). A test code is a stored
 * value: it is attached to an event only inside an active test window of that event's page (pixel
 * library, §A.2). The single-value fields are how they were stored before multi-pixel support: the
 * library migration copies them into the per-pixel maps; they stay stored (rollback only), are never
 * read by this build, and are deleted in the cleanup release.
 */
export const TrackingSecretsSettings = z.object({
  /** Meta Conversions API access token per Meta pixel id */
  metaTokens: perPixel("meta", secretToken),
  /** Meta "Test events" code per Meta pixel id — only while testing */
  metaTestCodes: perPixel("meta", TestEventCode),
  /** TikTok Events API access token per TikTok pixel code */
  tiktokTokens: perPixel("tiktok", secretToken),
  /** TikTok "Test events" code per TikTok pixel code — only while testing */
  tiktokTestCodes: perPixel("tiktok", TestEventCode),
  /** legacy single Meta token (any Meta pixel without its own) */
  metaCapiToken: optional(secretToken),
  /** legacy single Meta test code */
  metaTestEventCode: optional(TestEventCode),
  /** legacy single TikTok token (any TikTok pixel without its own) */
  tiktokToken: optional(secretToken),
  /** legacy single TikTok test code */
  tiktokTestEventCode: optional(TestEventCode),
  /** kept for a later Snap Conversions API; not used */
  snapToken: optional(secretToken),
  /** kept for a later GA4 Measurement Protocol; not used */
  ga4ApiSecret: optional(secretToken),
});
