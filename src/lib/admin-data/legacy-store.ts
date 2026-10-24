/**
 * Store #1 (docs/STORE-SAAS.md §D.8 S1): the store the 0004 conversion makes from the legacy single-tenant rows.
 *
 * The /admin panel and builder that were store #1's dashboard moved to /app/<handle> (§I.1, T4) and go through the
 * seam like every store's; this id remains for the deprecated store-less paths that still name store #1 until their
 * callers pass a scope (the legacy publish, Sheets push and pixel-library boot task; CCRs r1.0-t4-1, r1.0-t4-2),
 * which the maintainer deletes at the R1.0 integration. New code never uses it.
 */
export const LEGACY_STORE_ID = "00000000000000000000000001";
