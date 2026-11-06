/**
 * Shingles of titles and leads (P6 DESIGN; design.md DES-§9.2). Pure and isomorphic. Word 3-grams of the display
 * tokens (./normalize.ts: the product name is `§p`, numbers `§n`, slots `§s`); a line of ≤ 3 tokens contributes its
 * 2-grams plus the whole line as one shingle, so a short title still has a sketch. The in-store check compares sets
 * of these strings (Jaccard), the cross-store check their keyed hashes (headlines.server.ts).
 */
import type { Locale } from "@/lib/page/schema";
import { tokens, type TextLocale, type TokenOpts } from "./normalize";

/** The shingles of one line (deduplicated, in first-seen order). */
export function shingles(text: string, locale: Locale | TextLocale, opts: TokenOpts = {}): string[] {
  const t = tokens(text, locale, opts);
  if (!t.length) return [];
  const out = new Set<string>();
  if (t.length <= 3) {
    for (let i = 0; i + 1 < t.length; i++) out.add(`${t[i]} ${t[i + 1]}`);
    out.add(t.join(" "));
  } else {
    for (let i = 0; i + 2 < t.length; i++) out.add(`${t[i]} ${t[i + 1]} ${t[i + 2]}`);
  }
  return [...out];
}

/** |A ∩ B| / |A ∪ B| (0 for two empty sets). */
export function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (!a.size && !b.size) return 0;
  let inter = 0;
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  for (const x of small) if (big.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}
