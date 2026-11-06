/**
 * The rewrite menu's pure part (P7 AI; ai.md AI-05, AI-§K.3 "Rewrite menu", AI-§L `ai.rewrite.*`). Isomorphic.
 *
 *   rewriteIntentsFor(locale, locales)   the intent chips a field offers: Shorter · More Darija (ar) · Warmer · More
 *       premium · Gift angle · More concrete · More formal (fr) · Translate to <each other store locale>; never
 *       `differentiate` (the novelty guard's re-ask, not an owner choice).
 *   rewriteInputOf(field, choice)        the `copy.field` input for one chip (the field's real maximum, the page's
 *       product name and facts, so the guard allows the page's numbers and nothing else).
 *   wordDiff(before, after)              the word-level diff each option card shows against the current text: an LCS
 *       over whitespace-separated words (texts are ≤ 1,200 chars), runs of kept / added / removed words.
 */
import type { CopyLocale } from "../prompts";
import type { FieldRewriteInput, RewriteIntent } from "../schema/tasks/copy-field";

/** One chip of the menu: an intent, and for `translate` the target locale. */
export interface RewriteChoice {
  intent: Exclude<RewriteIntent, "differentiate">;
  targetLocale: CopyLocale | null;
}

const BASE: readonly RewriteChoice["intent"][] = ["shorter", "warmer", "premium", "gift", "concrete"];

/** The chips for a field written in `locale`, on a store whose copy locales are `locales`. */
export function rewriteIntentsFor(locale: CopyLocale, locales: readonly CopyLocale[]): RewriteChoice[] {
  const out: RewriteChoice[] = BASE.map((intent) => ({ intent, targetLocale: null }));
  if (locale === "ar") out.splice(1, 0, { intent: "darija", targetLocale: null });
  if (locale === "fr") out.push({ intent: "formal", targetLocale: null });
  for (const l of new Set(locales)) if (l !== locale) out.push({ intent: "translate", targetLocale: l });
  return out;
}

/** What the mount knows about the field being rewritten. */
export interface RewriteField {
  /** the field path ("hero.headline", "benefits[2].text") */
  path: string;
  text: string;
  /** the field's real maximum in characters */
  max: number;
  locale: CopyLocale;
  product: { name: string; facts: readonly string[] };
}

/** The `copy.field` input of one chip. */
export function rewriteInputOf(f: RewriteField, c: RewriteChoice): FieldRewriteInput {
  return {
    locale: f.locale,
    field: f.path,
    text: f.text.slice(0, 1_200),
    max: Math.max(4, Math.min(1_200, Math.round(f.max))),
    intent: c.intent,
    targetLocale: c.intent === "translate" ? c.targetLocale : null,
    product: { name: f.product.name.slice(0, 120), facts: f.product.facts.slice(0, 6).map((x) => x.slice(0, 200)) },
    mustAvoid: [],
  };
}

export type DiffPart = { k: "same" | "add" | "del"; text: string };

const words = (s: string) => s.trim().split(/\s+/u).filter(Boolean);
/** case- and punctuation-insensitive word key, so "Vite." and "vite" count as the same word */
const key = (w: string) => w.toLocaleLowerCase().replace(/[\p{P}]+/gu, "");

/** The word-level diff of `after` against `before` (see the header). Adjacent words of one kind are one part. */
export function wordDiff(before: string, after: string): DiffPart[] {
  const a = words(before);
  const b = words(after);
  const n = a.length;
  const m = b.length;
  // LCS table over word keys, (n+1) × (m+1)
  const t: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) t[i]![j] = key(a[i]!) === key(b[j]!) ? t[i + 1]![j + 1]! + 1 : Math.max(t[i + 1]![j]!, t[i]![j + 1]!);
  }
  const parts: DiffPart[] = [];
  const push = (k: DiffPart["k"], w: string) => {
    const last = parts[parts.length - 1];
    if (last && last.k === k) last.text += ` ${w}`;
    else parts.push({ k, text: w });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (key(a[i]!) === key(b[j]!)) {
      push("same", b[j]!);
      i++;
      j++;
    } else if (t[i + 1]![j]! >= t[i]![j + 1]!) push("del", a[i++]!);
    else push("add", b[j++]!);
  }
  while (i < n) push("del", a[i++]!);
  while (j < m) push("add", b[j++]!);
  return parts;
}
