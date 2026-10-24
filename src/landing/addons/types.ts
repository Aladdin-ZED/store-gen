/**
 * Runtime add-ons: the render hook (docs/STORE-SAAS.md §H.13, D62; landing.md LAN-§5.1, LAN Q3, Q5, Q30). Isomorphic
 * types. The landing runtime chunk stays frozen at 24,200 B gz: new shopper-side behaviour ships as standalone add-on
 * chunks (IIFEs that read `#lp-config`, their own JSON data block, the DOM and the `lp:order` event, never call into
 * the core, never price, never change the payload, and wrap their body in try … catch).
 *
 * Shapes frozen at C0a. T3 (R1.0) wires the hook into the render context and the Shell (`addons?: RenderAddons`
 * and `purchaseInBrowser`, `RenderHookFields` below) with an empty default; P3 owns this folder from R1 product and
 * adds `addonsFor(input)` (./plan.ts, pure) and the chunk entries. A document without add-ons ships today's bytes.
 */

export type AddonChunk = "assist" | "assist-ty" | "track" | "exp-head" | "exp" | "chain" | "video-hero" | "landing-v3";
export type AddonDataId = "lp-assist" | "lp-assist-ty" | "lp-track" | "lp-exp" | "lp-chain" | "lp-video";

export interface RenderAddons {
  head: AddonChunk[]; // inline in <head> before any section (exp-head only)
  body: AddonChunk[]; // inline after the core chunk
  data: Partial<Record<AddonDataId, unknown>>; // serialised with inlineJson (core render escaping)
  css: string[]; // extra CSS chunk names (assist line, thank-you blocks, arms)
  banner?: "test"; // the Shell renders the test band (D54)
}

/** The add-on-free default every document renders with until a feature turns one on (a fresh object each call). */
export function noAddons(): RenderAddons {
  return { head: [], body: [], data: {}, css: [] };
}

/**
 * The fields the store render context gains (T3, §H.3, §H.13; OPE Q.6): the add-ons to embed, and whether the
 * thank-you document carries the browser Purchase (`triggerFor(page) === "order"`; false → no `pixels` chunk, the
 * server sends Purchase at the trigger).
 */
export interface RenderHookFields {
  addons?: RenderAddons;
  purchaseInBrowser?: boolean;
}
