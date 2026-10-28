import "server-only";
/**
 * Live brand guard (docs/STORE-SAAS.md D76, §C.7; platform.md PLA-§3.7, PD70): every write of a brand field is checked
 * against the active `protected_brands` terms; a caller refuses on "exact" for non-staff (`brand_protected`) and never
 * tells the seller which term matched.
 *
 * P1 owns the file. `activeProtectedTerms()` is the one reader of the active terms, shared with `scoreSignup`
 * (PLA-§3.4.3) and cached 5 min in `scopedCache("protected-terms")` (PLA-§M.5; a brand save calls
 * `invalidateProtectedTerms()`). `checkBrandTerms` keeps its C0a body ("ok", the documented R1.0 answer) until P1's
 * brand-guard step implements the match.
 */
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { protectedBrands } from "@/lib/db/schema";
import type { ProtectedBrandKind, ProtectedBrandMatch } from "@/lib/platform/data/protected-brands";
import { scopedCache } from "@/lib/tenancy/cache";

export type BrandField = "store_name" | "legal_name" | "whatsapp_name" | "brand_name" | "handle" | "page_name" | "seo_title" | "policy_text";

/** One active row of `protected_brands`. */
export interface ProtectedTerm {
  term: string;
  kind: ProtectedBrandKind;
  match: ProtectedBrandMatch;
}

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

/** Active rows, cached 5 min (`protected-terms`); never throws ("ok" on a cache miss + DB error, logged to error_events area "platform"). */
export async function checkBrandTerms(kind: BrandField, value: string): Promise<"ok" | "near" | "exact"> {
  void kind;
  void value;
  return "ok";
}
