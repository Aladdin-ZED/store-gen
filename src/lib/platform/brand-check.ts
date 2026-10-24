import "server-only";
/**
 * Live brand guard (docs/STORE-SAAS.md D76, §C.7; platform.md PLA-§3.7, PD70): every write of a brand field is checked
 * against the active `protected_brands` terms; a caller refuses on "exact" for non-staff (`brand_protected`) and never
 * tells the seller which term matched.
 *
 * P1 owns the file. C0a stub: every value is "ok" (the documented R1.0 answer) until P1 implements the match.
 */

export type BrandField = "store_name" | "legal_name" | "whatsapp_name" | "brand_name" | "handle" | "page_name" | "seo_title" | "policy_text";

/** Active rows, cached 5 min (`protected-terms`); never throws ("ok" on a cache miss + DB error, logged to error_events area "platform"). */
export async function checkBrandTerms(kind: BrandField, value: string): Promise<"ok" | "near" | "exact"> {
  void kind;
  void value;
  return "ok";
}
