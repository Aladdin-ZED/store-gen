/**
 * Store mode (docs/STORE-SAAS.md §A.2): what a store sells through. Pure and isomorphic.
 *
 *   landing  landing pages only (the one selectable mode in R1)
 *   store    full storefront (R2); landing pages hidden unless the store setting `landing.inStoreMode` is on
 *   both     storefront and landing pages (R2)
 *
 * A mode switch hides, never deletes: navigation, ⌘K, checklists and the public routes ask
 * `modeAllows(mode, feature)`; the data stays and reappears when the mode allows it again.
 */
import { releaseOn } from "@/lib/auth/permissions";

export const STORE_MODES = ["landing", "store", "both"] as const;
export type StoreMode = (typeof STORE_MODES)[number];

/** The capability families a mode gates (§A.2 table). Orders, call center, Sheets, members, AI are in every mode. */
export type ModeFeature = "landing" | "catalog" | "storefront" | "cart";

/** Modes an owner may pick in this release (R1: landing only; `store` / `both` rows exist for seeded and internal stores). */
export function selectableStoreModes(): readonly StoreMode[] {
  return releaseOn("R2") ? STORE_MODES : ["landing"];
}

export function isStoreMode(value: unknown): value is StoreMode {
  return typeof value === "string" && (STORE_MODES as readonly string[]).includes(value);
}

/**
 * Does `mode` show `feature`? `opts.landingInStoreMode` is the cached store setting `landing.inStoreMode`
 * (§D.10): with it, a `store`-mode shop keeps its landing pages (Pages, Generate, `/s/<h>/<slug>`) so ad
 * traffic never meets a 404 after a mode change. Before the storefront ships (R2) a `store` / `both` row
 * renders the R1 landing feature set, so `landing` is allowed for every mode until then.
 */
export function modeAllows(mode: StoreMode, feature: ModeFeature, opts?: { landingInStoreMode?: boolean }): boolean {
  switch (feature) {
    case "landing":
      return mode !== "store" || opts?.landingInStoreMode === true || !releaseOn("R2");
    case "catalog":
    case "storefront":
    case "cart":
      return mode !== "landing";
  }
}
