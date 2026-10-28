/**
 * The brand match, pure (platform.md PLA-§13.3, PD70; PLA-§3.4.1): what `checkBrandTerms` and `brandMatches`
 * (src/lib/platform/brand-check.ts) answer for one value against the active terms, kept apart from the cached read so
 * `test:platform` runs it without a database.
 *
 * - `exact` when a run of normalised tokens of one reading, or the joined value, equals a term (`matchBrandTerm`,
 *   src/lib/platform/normalize.ts: `face-b00k-shop` ∋ facebook, "Banque Populaire Store" ∋ banque populaire, an Arabic
 *   term after tatweel and diacritic removal);
 * - `near` when an active `substring` term of at least 4 characters appears inside the joined value;
 * - an `offensive` term that matches either way answers "exact" and is never named (PLA-§3.4.1 "never the term");
 * - a brand or bank term's exact match wins over an offensive one, so the console names what it can.
 */
import type { ProtectedBrandKind, ProtectedBrandMatch } from "./data/protected-brands";
import { brandTokens, matchBrandTerm } from "./normalize";

/** The fields a caller checks (core §C.7, frozen at P0). */
export type BrandField = "store_name" | "legal_name" | "whatsapp_name" | "brand_name" | "handle" | "page_name" | "seo_title" | "policy_text";

/** One active row of `protected_brands`. */
export interface ProtectedTerm {
  term: string;
  kind: ProtectedBrandKind;
  match: ProtectedBrandMatch;
}

export type BrandVerdict = "ok" | "near" | "exact";

/** P1-internal: the verdict with the term that decided it (never for a tenant). */
export interface BrandMatch {
  verdict: BrandVerdict;
  /** the matched term; absent for "ok" and for an offensive term */
  term?: string;
  termKind?: string;
}

/** the longest value one call checks (PLA-§L; the health rule scans longer policy texts in 200-character windows) */
export const BRAND_VALUE_MAX = 200;

/** The best match of one value against the terms. `kind` is the field (the same rule for every field). */
export function matchTerms(kind: BrandField, value: string, terms: readonly ProtectedTerm[]): BrandMatch {
  void kind;
  const text = typeof value === "string" ? value.slice(0, BRAND_VALUE_MAX) : "";
  if (!text.trim()) return { verdict: "ok" };
  const readings = brandTokens(text);
  if (!readings.length) return { verdict: "ok" };
  let offensive: BrandMatch | null = null;
  let near: BrandMatch | null = null;
  for (const t of terms) {
    const m = matchBrandTerm(readings, t);
    if (!m) continue;
    if (t.kind === "offensive") offensive ??= { verdict: "exact", termKind: "offensive" };
    else if (m === "exact") return { verdict: "exact", term: t.term, termKind: t.kind };
    else near ??= { verdict: "near", term: t.term, termKind: t.kind };
  }
  return offensive ?? near ?? { verdict: "ok" };
}
