/**
 * S1 STOREFRONT owns this file (src/storefront/** outside the four frozen contract files, STO-§27.2). Pre-registered by
 * the R2 contract step (C2-B1, maintainer) as the stub the frozen `storeDocIssues` (../schema.ts) calls; S1 fills the
 * bodies without a CCR, the two signatures are frozen (src/lib/contracts/r2-contract.ts).
 *
 *  - `storeSectionIssue(section, kind)`: one section's rules that need S1's registries: a landing type's eligibility on
 *    the kind (`ELIGIBILITY`, STO-§9.1: product / bound / free), the section's `data` against its own schema (the store
 *    registry's or the landing registry's, STO-§6.2), a variant the section does not declare. Null = no issue.
 *  - `storeDocExtraIssues(doc)`: the document-level rules that need them (at most one bento variant per page, DES-§3 /
 *    R-D38; the bento ids are the registry's `bento` field). Empty = no issue.
 *
 * Pure and isomorphic (the editor parses in the browser): no React render code, no DB, no browser global. Until S1
 * merges, both accept everything, so the frozen parse checks the kind table only.
 */
import type { StorePageDoc, StorePageKind, StoreSectionInstance } from "../schema";

export function storeSectionIssue(section: StoreSectionInstance, kind: StorePageKind): string | null {
  void section;
  void kind;
  return null;
}

export function storeDocExtraIssues(doc: StorePageDoc): { path: (string | number)[]; message: string }[] {
  void doc;
  return [];
}
