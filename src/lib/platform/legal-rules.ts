/**
 * Legal documents, the pure rules (platform.md PLA-§13.4, §13.6, §22.15; PD17, PD49; core §B.2). Isomorphic and
 * selftested: the kinds R1 edits (no DPA: R2), the locale fallback, the published document a person is asked to
 * accept, the store templates' `{{field}}` placeholders against P3's field list, the typed confirmations, and the
 * line diff the editor shows against the previous version. src/lib/platform/legal.ts reads and writes.
 *
 *   placeholderProblem("store_returns", body)       // null, or { code: "unknown_placeholder", names: ["returns.days"] }
 *   lineDiff(previous, next)                        // [{ op: "same" | "add" | "del", text }]
 *   pickAccepted(published, "ar")                   // per kind, the best locale (ar → fr → en → ar), newest version
 */
import { POLICY_TEMPLATE_FIELDS } from "@/lib/policies/fields";

export const LEGAL_LOCALES = ["ar", "fr", "en"] as const;
export type LegalLocale = (typeof LEGAL_LOCALES)[number];

/** The platform documents a person accepts (signup, staff invites, re-acceptance). */
export const PLATFORM_KINDS = ["tos", "privacy", "aup"] as const;
/** The store templates tenants adapt on their policy pages (P3's renderer fills the placeholders). */
export const STORE_KINDS = ["store_privacy", "store_terms", "store_shipping", "store_returns", "store_contact"] as const;
/** The kinds R1 lists and edits; `dpa` stays in the enum for R2 (no seed, no editor row; RF §3.3, core §L.2 PL-14). */
export const R1_LEGAL_KINDS = [...PLATFORM_KINDS, ...STORE_KINDS] as const;
export type PlatformKind = (typeof PLATFORM_KINDS)[number];
export type StoreKind = (typeof STORE_KINDS)[number];
export type R1LegalKind = (typeof R1_LEGAL_KINDS)[number];

export const isPlatformKind = (k: unknown): k is PlatformKind => typeof k === "string" && (PLATFORM_KINDS as readonly string[]).includes(k);
export const isStoreKind = (k: unknown): k is StoreKind => typeof k === "string" && (STORE_KINDS as readonly string[]).includes(k);
export const isR1LegalKind = (k: unknown): k is R1LegalKind => isPlatformKind(k) || isStoreKind(k);
export const isLegalLocale = (l: unknown): l is LegalLocale => typeof l === "string" && (LEGAL_LOCALES as readonly string[]).includes(l);

/** PLA-§L, the columns: title ≤ 160, "What changed" ≤ 500, body ≤ 200,000 */
export const LEGAL_TITLE_MAX = 160;
export const LEGAL_SUMMARY_MAX = 500;
export const LEGAL_BODY_MAX = 200_000;

/** PLA-§13.4: the typed words of "Mark reviewed by a lawyer" and of publishing an unreviewed version (PD17) */
export const REVIEWED_WORD = "reviewed";
export const PUBLISH_UNREVIEWED_WORD = "publish unreviewed";

/** Does the typed text match the word (case and surrounding spaces ignored)? */
export const typedMatches = (typed: unknown, word: string): boolean => typeof typed === "string" && typed.trim().toLowerCase() === word;

/** PLA-§13.4: the locale order a person's documents are read in: their locale, then fr, then en, then ar. */
export function localeOrder(locale: string | null | undefined): LegalLocale[] {
  const first = isLegalLocale(locale) ? [locale] : [];
  return [...new Set([...first, "fr", "en", "ar"] as LegalLocale[])];
}

/** One published document as the acceptance reads it. */
export interface PublishedDoc {
  id: string;
  kind: string;
  locale: string;
  version: number;
}

/**
 * Per platform kind, the published document a person in `locale` is asked to accept: the first locale of
 * `localeOrder` that has one, its newest version. A kind with no published document is left out (signup never
 * breaks, PD17).
 */
export function pickAccepted<T extends PublishedDoc>(published: readonly T[], locale: string | null | undefined): T[] {
  const order = localeOrder(locale);
  const out: T[] = [];
  for (const kind of PLATFORM_KINDS) {
    const ofKind = published.filter((d) => d.kind === kind && isLegalLocale(d.locale));
    for (const l of order) {
      const best = ofKind.filter((d) => d.locale === l).sort((a, b) => b.version - a.version)[0];
      if (best) {
        out.push(best);
        break;
      }
    }
  }
  return out;
}

/** The platform kinds without any published version: the console's red line "Sign-up runs without published <kind>". */
export function kindsWithoutPublished(published: readonly Pick<PublishedDoc, "kind">[]): PlatformKind[] {
  return PLATFORM_KINDS.filter((k) => !published.some((d) => d.kind === k));
}

/* ------------------------------------------------------------------ */
/* Placeholders (PLA-§13.4, §13.6)                                     */
/* ------------------------------------------------------------------ */

const PLACEHOLDER_RE = /(?<!\\)\{\{\s*([^{}\n]{1,80}?)\s*\}\}/g;

/** Every `{{name}}` of a body, in order of appearance, once each (an escaped `\{{` is text). */
export function templateFields(body: string): string[] {
  const out: string[] = [];
  for (const m of body.matchAll(PLACEHOLDER_RE)) if (!out.includes(m[1]!)) out.push(m[1]!);
  return out;
}

/**
 * What the placeholders of a body break, or null: a platform document takes none (they would print as text), a store
 * template only names P3's fields (`POLICY_TEMPLATE_FIELDS`, CCR P1-11).
 */
export function placeholderProblem(kind: string, body: string, fields: readonly string[] = POLICY_TEMPLATE_FIELDS): { code: "placeholders_not_allowed" | "unknown_placeholder"; names: string[] } | null {
  const names = templateFields(body);
  if (!names.length) return null;
  if (!isStoreKind(kind)) return { code: "placeholders_not_allowed", names };
  const unknown = names.filter((n) => !fields.includes(n));
  return unknown.length ? { code: "unknown_placeholder", names: unknown } : null;
}

/* ------------------------------------------------------------------ */
/* The line diff (PLA-§13.4 editor)                                    */
/* ------------------------------------------------------------------ */

export type DiffOp = { op: "same" | "add" | "del"; text: string };

/** past this many line edits the diff is shown as "replaced" (every old line removed, every new one added; bounds the trace to ≈ 8 MB) */
const DIFF_MAX_EDITS = 1_000;

/**
 * The line diff of two bodies (Myers' O((n + m)·D) algorithm, the shortest edit script; CRLF normalised). A pair that
 * needs more than 1,000 line edits answers the plain replacement.
 */
export function lineDiff(previous: string, next: string): DiffOp[] {
  const a = previous.replace(/\r\n?/g, "\n").split("\n");
  const b = next.replace(/\r\n?/g, "\n").split("\n");
  const n = a.length;
  const m = b.length;
  const max = Math.min(n + m, DIFF_MAX_EDITS);
  const offset = max + 1;
  const v = new Int32Array(2 * max + 3);
  const trace: Int32Array[] = [];
  let found = -1;
  for (let d = 0; d <= max && found < 0; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[offset + k - 1]! < v[offset + k + 1]!) ? v[offset + k + 1]! : v[offset + k - 1]! + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) {
        found = d;
        break;
      }
    }
  }
  if (found < 0) return [...a.map((text) => ({ op: "del" as const, text })), ...b.map((text) => ({ op: "add" as const, text }))];
  // walk the trace back from (n, m)
  const ops: DiffOp[] = [];
  let x = n;
  let y = m;
  for (let d = found; d > 0; d--) {
    const vd = trace[d]!;
    const k = x - y;
    const prevK = k === -d || (k !== d && vd[offset + k - 1]! < vd[offset + k + 1]!) ? k + 1 : k - 1;
    const prevX = vd[offset + prevK]!;
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      ops.push({ op: "same", text: a[--x]! });
      y--;
    }
    if (x === prevX) ops.push({ op: "add", text: b[--y]! });
    else ops.push({ op: "del", text: a[--x]! });
  }
  while (x > 0 && y > 0) {
    ops.push({ op: "same", text: a[--x]! });
    y--;
  }
  return ops.reverse();
}

/** Counts of a diff ("+12 −3"). */
export function diffStats(ops: readonly DiffOp[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const o of ops) {
    if (o.op === "add") added++;
    else if (o.op === "del") removed++;
  }
  return { added, removed };
}
