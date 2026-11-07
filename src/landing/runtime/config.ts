/**
 * Runtime configuration embedded in every rendered landing document as
 * <script type="application/json" id="lp-config">…</script> (JSON, never executable).
 * Built by the renderer (src/lib/render/config.ts) and read by the vanilla runtime.
 * Contains ONLY public values.
 *
 * Two versions (docs/OFFERS.md §F.7):
 *  - `LandingRuntimeConfig` (v: 2) is the renderer ↔ runtime contract of Offers v2: every amount in
 *    integer cents, items, line-based offers (units), option groups (choice / matrix / field),
 *    extras, the resolved fill. Frozen in Phase 0; built by LR (render/config.ts), read by RT.
 *  - `LandingRuntimeConfigV1` (v: 1) is what published pages embed today and what the current
 *    runtime reads. Pages keep their own embedded runtime + config: a page moves to v2 at its next
 *    publish once the v2 runtime ships.
 */
import type { RenderMode } from "../types";
import type { ZoneTable } from "../../lib/delivery/types";

/* ------------------------------------------------------------------ */
/* v2 (Offers v2 contract)                                             */
/* ------------------------------------------------------------------ */

/** An option of a choice group or a matrix dim value. `delta`: surcharge per unit, cents. */
export type RuntimeOption = { id: string; label: string; soldOut: boolean; delta?: number };

export type RuntimeGroup =
  | { id: string; name: string; kind: "swatch" | "text" | "image"; perUnit: boolean; options: RuntimeOption[] }
  | {
      id: string;
      name: string;
      kind: "matrix";
      perUnit: boolean;
      display: "linked" | "combined";
      dims: { id: string; name: string; values: RuntimeOption[] }[];
      /** exceptions: `v` = cell key (wildcards allowed), `s` = "o" out / "n" not made, `d` = delta (cents) */
      cells: { v: string; s?: "o" | "n"; d?: number }[];
    }
  | {
      id: string;
      name: string;
      kind: "field";
      perUnit: boolean;
      input: "text" | "number";
      required: boolean;
      maxLength: number;
      min?: number;
      max?: number;
      charset: "any" | "letters" | "latin" | "digits";
      /** cents, only on optional fields */
      delta?: number;
    };

export type RuntimeLineRule = { lock?: string; allow?: string[]; preset?: string };

/** One line of an offer as the runtime expands it into units (cents). */
export interface RuntimeOfferLine {
  /** line index in the offer */
  line: number;
  /** fixed item id */
  item?: string;
  /** choice line: declared item ids (pricing base) */
  choices?: string[];
  /** choice line: what the shopper can pick (declared minus unavailable) */
  available?: string[];
  distinct?: true;
  /** "difference": pricier choices cost their difference */
  surcharge?: true;
  /** choice line base prices, ascending, cents (the declared list) */
  base?: number[];
  free?: true;
  rules?: Record<string, RuntimeLineRule>;
}

export interface RuntimeOffer {
  id: string;
  label: string;
  short: string;
  /** offer.price, cents */
  price: number;
  /** the card price (lowest payable total of the units), cents */
  from: number;
  /** "Dès": choices can cost more */
  variable?: true;
  /** displayReference, cents */
  reference: number;
  perUnit?: number;
  savings: number;
  savingsPct: number;
  /** effectiveFree: no delivery fee with this offer */
  free: boolean;
  soldOut?: true;
  units: RuntimeOfferLine[];
}

export interface RuntimeItem {
  id: string;
  name: string;
  short: string;
  /** cents */
  price: number;
  contentId: string;
  groups: RuntimeGroup[];
}

export type RuntimeFeature = "matrix" | "fields" | "steps-box";

export interface LandingRuntimeConfig {
  /** v1 pages keep their own embedded runtime + config */
  v: 2;
  /** publish version id ("" in preview and exports) */
  ver: string;
  page: "landing" | "thanks";
  pageKey: string;
  mode: RenderMode;
  locale: string;
  dir: "rtl" | "ltr";
  currency: string;
  endpoints: { order: string; lead?: string; event?: string; upsell?: string };
  /** URL of thank-you page; runtime appends ?o=<orderId> */
  thankYouUrl: string;
  /** URL of the landing page (thank-you "back" link) */
  landingUrl: string;
  /** cents */
  upsell?: { price: number; title: string; windowMinutes: number; item?: string };
  phone: { country: string; prefix: string; national: string };
  fields: { city: "select" | "text" | "hidden"; address: "required" | "optional" | "hidden"; email: "required" | "optional" | "hidden" };
  /** `minor: 100`: every amount in this config is integer cents */
  money: { locale: string; symbol: string; position: "before" | "after"; decimals: number; minor: 100 };
  pixels: { meta?: string[]; tiktok?: string[]; snap?: string[]; ga4?: string[] };
  strings: Record<string, string>;
  whatsapp?: { number: string; text: string };
  turnstileSiteKey?: string;
  /** delivery fee, cents */
  shippingFee: number;
  product: { name: string; contentId: string };
  items: RuntimeItem[];
  bundles: RuntimeOffer[];
  extras: (RuntimeGroup & { scope: "all" | string[] })[];
  /** cents */
  bump?: { price: number; item?: string; offers?: string[] };
  defaultBundleId: string;
  /** resolved once per page (§E.1) */
  fill: "none" | "inline" | "rows" | "steps" | "box";
  /** optional chunks embedded in this page */
  features: RuntimeFeature[];
}

/* ------------------------------------------------------------------ */
/* v3 (LP-16 "charge delivery by city", core D75; R2 contract step)    */
/* ------------------------------------------------------------------ */

/**
 * Runtime config v3: the v2 contract plus the store's value-keyed `ZoneTable` (the object `#sg-config` and `lp-assist`
 * embed, `zonesForCheckout`, LAN-§7.1). Only the `landing-v3` chunk (./entry-v3.ts, which replaces `landing` on
 * `runtime_v = 3` pages) reads it: the shown total adds the zone fee of the chosen city (`landingZoneFee`,
 * src/lib/catalog/delivery.ts), the payload keeps the v2 shape and the server prices the same rule. The frozen v2
 * runtime refuses a v3 config (`readConfig` checks `v === 2`), so a v3 document can never run on the v2 chunk.
 */
export type LandingRuntimeConfigV3 = Omit<LandingRuntimeConfig, "v"> & { v: 3; zones: ZoneTable };

/* ------------------------------------------------------------------ */
/* v1 (pages published before Offers v2, and the current runtime)      */
/* ------------------------------------------------------------------ */

export interface RuntimeBundleV1 {
  id: string;
  qty: number;
  total: number;
  reference: number;
  perUnit: number;
  savings: number;
  savingsPct: number;
  label: string; // "x2 · Pack Duo"
}

export interface RuntimeVariantGroupV1 {
  id: string;
  name: string;
  perUnit: boolean;
  options: { id: string; label: string; soldOut: boolean }[];
}

export interface LandingRuntimeConfigV1 {
  v: 1;
  /** "landing" for the product page, "thanks" for the thank-you page */
  page: "landing" | "thanks";
  pageKey: string;
  mode: RenderMode;
  locale: string;
  dir: "rtl" | "ltr";
  currency: string;
  endpoints: {
    order: string;
    lead?: string;
    event?: string;
    upsell?: string;
  };
  /** URL of thank-you page; runtime appends ?o=<orderId> */
  thankYouUrl: string;
  /** URL of the landing page (thank-you "back" link) */
  landingUrl: string;
  product: { name: string; price: number; sku?: string; contentId: string };
  bundles: RuntimeBundleV1[];
  defaultBundleId: string;
  variants: RuntimeVariantGroupV1[];
  bump?: { price: number; title: string };
  upsell?: { price: number; title: string; windowMinutes: number };
  shippingFee: number;
  phone: {
    country: string; // "MA"
    prefix: string; // "+212"
    /** RegExp source validating a NORMALIZED national number (digits only, leading 0 kept) */
    national: string;
  };
  /** fields the form asks for, and whether required */
  fields: { city: "select" | "text" | "hidden"; address: "required" | "optional" | "hidden"; email: "required" | "optional" | "hidden" };
  money: { locale: string; symbol: string; position: "before" | "after"; decimals: number };
  /**
   * Ad pixel ids per platform (empty in previews). Lists since multi-pixel support; documents
   * published before carry single strings — the runtime reads both (pixelIdList).
   */
  pixels: { meta?: string[]; tiktok?: string[]; snap?: string[]; ga4?: string[] };
  strings: Record<string, string>;
  whatsapp?: { number: string; text: string };
  /** optional anti-bot (Cloudflare Turnstile) site key */
  turnstileSiteKey?: string;
}

/** @deprecated v1 names (the current runtime): use RuntimeBundleV1 / RuntimeVariantGroupV1. */
export type RuntimeBundle = RuntimeBundleV1;
export type RuntimeVariantGroup = RuntimeVariantGroupV1;
