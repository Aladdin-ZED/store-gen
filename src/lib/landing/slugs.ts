import "server-only";
/**
 * Page addressing (P3 LANDING; landing.md LAN-§15.1, LP-20): the R1 home of `recordSlugMove`. T4 shipped it in R1.0 in
 * src/lib/editor/slug-history.ts (read-only for P3) with the same signature and rows; this module re-exports it so the
 * landing callers and the spec name one path. The store slug route's 308 (src/lib/render/store-pages.server.ts
 * `slugHistoryTarget`) reads the same table; history never crosses stores (its key starts with `store_id`).
 */
export { recordSlugMove, releaseOldSlug, SLUG_HISTORY_MONTHS } from "@/lib/editor/slug-history";
