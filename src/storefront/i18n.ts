/**
 * S1 STOREFRONT owns this file (src/storefront/** outside the four frozen contract files, STO-§27.2; the shopper
 * microcopy of STO-§24, LND-34). Pre-registered by the R2 contract step (C2-B1, maintainer) so the frozen
 * `StoreRenderContext.t(key: StoreUiKey, …)` (./types.ts) names its key type. S1 narrows `StoreUiKey` to the keys of
 * its catalogue (ar / fr / en) without a CCR: every caller of `ctx.t` is S1's own code.
 */
export type StoreUiKey = string;
