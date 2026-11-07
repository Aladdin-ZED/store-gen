/**
 * Sidebar items of the storefront file (S1 STOREFRONT, storefront.md STO-§27.2).
 * Extension file (docs/STORE-SAAS.md §K.3, §K.4), created empty at the R2 contract step (C2-D) and imported by
 * ./index.ts (NAV_CONTRIBUTIONS); the track fills it and never edits the registry. An R2 item carries `release: "R2"`, so it stays hidden while
 * releaseOn("R2") is false.
 */
import type { NavContribution } from "./types";

export const nav: NavContribution[] = [];
