import "server-only";
/**
 * Phone masking (P4 CALL CENTER; operations.md OPE-§8.1, OD11; docs/STORE-SAAS.md §K.2 P0). Server-only: the
 * browser receives masked strings only. Masked = the national format with the first two national digits and the last
 * four visible. Under impersonation the read repositories also call P1's `maskIfImpersonation` (src/lib/platform/mask.ts);
 * no other masking helper is declared here (OPE-§8.1, CRIT14). Typed stubs frozen at P0.
 */

/** "+212612345678" → "06 •• •• 56 78"; other countries: "+33 6 •• •• 56 78" */
export function maskPhone(e164: string): string {
  void e164;
  throw new Error("not implemented: P4 maskPhone");
}

/** Masks every E.164 and national number of `country` inside a free text (notes, edit details, imported cells). */
export function maskPhonesIn(text: string, country: string): string {
  void text;
  void country;
  throw new Error("not implemented: P4 maskPhonesIn");
}
