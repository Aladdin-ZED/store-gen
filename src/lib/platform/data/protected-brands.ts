/**
 * The seeded brand-protection deny list (docs/STORE-SAAS.md §C.7, §D.4; research domains.md §4.8 and
 * platform-admin.md §5.3): names a store handle (and, through P1's checkBrandTerms, a store name) may not use on the
 * shared domain, because a look-alike of a bank, a carrier or a big platform could get the whole domain blocked.
 *
 * A code constant reviewed in git, seeded into `protected_brands` by a boot task (`INSERT IGNORE`: a row staff
 * disabled in the console stays disabled; seeded rows are never deleted, PLA-§2.1). Staff add more terms in the
 * console (PLA-§13.3); offensive terms are added there, not listed here. Pure and isomorphic.
 *
 * `match` (for handles, src/lib/tenancy/handles.ts): `exact` = one hyphen-separated part of the handle, or the
 * handle without its hyphens, equals the term after the look-alike folding (0→o, 1→i, …); `substring` = the folded
 * handle without hyphens contains the term. Short or common-word terms are `exact`, so "metal-art" or "visage"
 * stay free while "meta-support" and "visa-ma" do not. `skeleton` (UTS #39) arrives in R3 (PL-22).
 */

export type ProtectedBrandKind = "brand" | "bank" | "carrier" | "gov" | "platform" | "offensive";
export type ProtectedBrandMatch = "exact" | "substring" | "skeleton";

export interface ProtectedBrandSeed {
  /** lower-case a-z 0-9, 2-60 chars */
  term: string;
  kind: ProtectedBrandKind;
  match: ProtectedBrandMatch;
  note?: string;
}

export const PROTECTED_BRANDS: readonly ProtectedBrandSeed[] = [
  // platforms and marketplaces (domains.md §4.8)
  { term: "meta", kind: "brand", match: "exact" },
  { term: "facebook", kind: "brand", match: "substring" },
  { term: "instagram", kind: "brand", match: "substring" },
  { term: "whatsapp", kind: "brand", match: "substring" },
  { term: "tiktok", kind: "brand", match: "substring" },
  { term: "snapchat", kind: "brand", match: "substring" },
  { term: "google", kind: "brand", match: "substring" },
  { term: "youtube", kind: "brand", match: "substring" },
  { term: "apple", kind: "brand", match: "exact" },
  { term: "amazon", kind: "brand", match: "substring" },
  { term: "shopify", kind: "brand", match: "substring" },
  { term: "youcan", kind: "brand", match: "substring" },
  { term: "jumia", kind: "brand", match: "substring" },
  { term: "avito", kind: "brand", match: "substring" },
  // telecoms (platform-admin.md §5.3)
  { term: "maroctelecom", kind: "brand", match: "substring" },
  { term: "inwi", kind: "brand", match: "exact" },
  // payments and banks (domains.md §4.8; "bank*" is the substring row)
  { term: "paypal", kind: "bank", match: "substring" },
  { term: "stripe", kind: "bank", match: "exact" },
  { term: "visa", kind: "bank", match: "exact" },
  { term: "mastercard", kind: "bank", match: "substring" },
  { term: "cmi", kind: "bank", match: "exact", note: "Centre Monétique Interbancaire" },
  { term: "cashplus", kind: "bank", match: "substring" },
  { term: "wafacash", kind: "bank", match: "substring" },
  { term: "cih", kind: "bank", match: "exact" },
  { term: "attijari", kind: "bank", match: "substring" },
  { term: "bmce", kind: "bank", match: "substring" },
  { term: "bank", kind: "bank", match: "substring" },
  // carriers (domains.md §4.8; CTM from platform-admin.md §5.3)
  { term: "barid", kind: "carrier", match: "exact" },
  { term: "poste", kind: "carrier", match: "exact" },
  { term: "amana", kind: "carrier", match: "exact" },
  { term: "ctm", kind: "carrier", match: "exact" },
  // government (domains.md §4.8)
  { term: "gov", kind: "gov", match: "exact" },
  { term: "police", kind: "gov", match: "exact" },
  { term: "douane", kind: "gov", match: "substring" },
  { term: "dgi", kind: "gov", match: "exact" },
  { term: "cnss", kind: "gov", match: "exact" },
  // the platform itself (brand.name "Store Gen")
  { term: "storegen", kind: "platform", match: "substring" },
];
