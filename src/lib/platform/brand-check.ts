import "server-only";
/**
 * Live brand guard (docs/STORE-SAAS.md D76, §C.7; platform.md PLA-§13.3, PD70): every write of a brand field is checked
 * against the active `protected_brands` terms.
 *
 *   if ((await checkBrandTerms("store_name", name)) === "exact" && !isStaff) throw new AuthRefusal("brand_protected");
 *
 * - `checkBrandTerms(kind, value)` is the tenant-callable function (frozen at P0, src/lib/contracts/r1-p0.ts): one
 *   field per call, the verdict only, never the matched term; it never throws ("ok" when the terms cannot be read,
 *   recorded under area "platform"). The caller refuses on "exact" for non-staff (`brand_protected`) and lets "near"
 *   through (the console flag `brand_near_live`); a staff caller gets the same verdict, the override is the caller's.
 * - `brandMatches(kind, value)` is P1-internal (the console's "Check a name" box, the health rule
 *   `platform:brand_term_live`): the same match with the term and its kind, an offensive term never named.
 * - The match itself is `matchTerms` (./brand-match.ts, pure); a value is cut to 200 characters (PLA-§L).
 *
 * `activeProtectedTerms()` is the one reader of the active terms, shared with `scoreSignup` (PLA-§3.4.3), cached 5 min in
 * `scopedCache("protected-terms")` (PLA-§M.5); the console's brand saves call `invalidateProtectedTerms()`.
 */
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { protectedBrands } from "@/lib/db/schema";
import { scopedCache } from "@/lib/tenancy/cache";
import { matchTerms, type BrandField, type BrandMatch, type ProtectedTerm } from "./brand-match";
import { recordPlatformError } from "./log";

export { BRAND_VALUE_MAX, matchTerms } from "./brand-match";
export type { BrandField, BrandMatch, BrandVerdict, ProtectedTerm } from "./brand-match";

/** a bound, never reached by a real list (the seed has 40 rows; staff add a few) */
const TERMS_MAX = 5_000;
const termsCache = scopedCache<readonly ProtectedTerm[]>({ name: "protected-terms", maxEntries: 1, ttlMs: 5 * 60_000 });

/** The active terms, cached 5 min under the platform key "p". Throws when the table cannot be read (callers decide). */
export async function activeProtectedTerms(): Promise<readonly ProtectedTerm[]> {
  return termsCache.getOrLoad("p", "all", () =>
    db
      .select({ term: protectedBrands.term, kind: protectedBrands.kind, match: protectedBrands.match })
      .from(protectedBrands)
      .where(eq(protectedBrands.active, true))
      .limit(TERMS_MAX),
  );
}

/** Drop the cached terms (the console's brand saves). */
export function invalidateProtectedTerms(): void {
  termsCache.delete("p");
}

/** P1-internal: the match with its term (console "Check a name", `platform:brand_term_live`). Throws when the terms cannot be read. */
export async function brandMatches(kind: BrandField, value: string): Promise<BrandMatch> {
  return matchTerms(kind, value, await activeProtectedTerms());
}

/** Active rows, cached 5 min (`protected-terms`); the verdict only; never throws ("ok" on a DB error, recorded). */
export async function checkBrandTerms(kind: BrandField, value: string): Promise<"ok" | "near" | "exact"> {
  try {
    return (await brandMatches(kind, value)).verdict;
  } catch (err) {
    recordPlatformError(`brand check (${String(kind).slice(0, 20)})`, err);
    return "ok";
  }
}
