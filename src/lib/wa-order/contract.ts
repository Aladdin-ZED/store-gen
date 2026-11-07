/**
 * `POST /api/public/wa` (P3 LANDING; landing.md LAN-§11.4, LP-11): the "Order on WhatsApp" intent. Isomorphic: the
 * `assist` chunk builds the body, the route parses it. The body carries the shopper's choice and never a price: the
 * server prices it (`priceWaSelection`, ./price.ts), whatever else the body holds (unknown keys are dropped).
 *
 * `city` (rev 2, `{eta_text}`) is the form's city value when it has one; the serialiser (src/landing/runtime/addons/
 * select.ts) never reads the name, phone or address fields.
 */
import { z } from "zod";
import { Utm, VERSION_RE } from "@/lib/orders/contract";

const PageKey = z.string().regex(/^[a-zA-Z0-9_-]{8,80}$/);
const BundleId = z.string().regex(/^[a-zA-Z0-9_-]{2,40}$/);

export const WaOrderRequest = z.object({
  pageKey: PageKey,
  ver: z.string().regex(VERSION_RE).optional().catch(undefined),
  bundleId: BundleId.optional().catch(undefined),
  bump: z.boolean().optional().catch(undefined),
  units: z.array(z.unknown()).max(20).optional().catch(undefined),
  extras: z.record(z.string(), z.unknown()).optional().catch(undefined),
  b: z.unknown().optional(),
  city: z.string().max(120).optional().catch(undefined),
  utm: Utm.default({}).catch({}),
  locale: z.string().max(5).optional().catch(undefined),
});
export type WaOrderRequest = z.infer<typeof WaOrderRequest>;

export type WaOrderError = "unavailable" | "rate_limited" | "invalid";
export type WaOrderResponse = { ok: true; ref: string; number: string; text: string } | { ok: false; error: WaOrderError };

/** The public API path (relative: every host a store owns serves it). */
export const WA_API = "/api/public/wa";

/** Body limit: 20 units of ≤ 8 options and ≤ 4 fields fit well under it. */
export const WA_BODY_MAX = 16 * 1024;

/** The message and its link (LAN-§11.4 step 5). */
export const WA_TEXT_MAX = 1_000;
export const WA_URL_MAX = 2_000;

/** `WA-` + 6 Crockford base-32 characters (no I, L, O, U). */
export const WA_REF_RE = /^WA-[0-9A-HJKMNP-TV-Z]{6}$/;
