/**
 * `copy.field` (AI-05; ai.md AI-§A.6, AI-§D.2 rule 13, AI-§D.3): three rewrites of one text field. Types only. Every
 * variant passes `cleanAiText` with the field's real maximum and the page's allowed numbers; a failing one is dropped.
 * `translate` turns the Director's why-lines into the other locales (stage 4b); `differentiate` is the novelty re-ask.
 */
import type { CopyLocale } from "./common";

export const REWRITE_INTENTS = ["shorter", "darija", "warmer", "premium", "gift", "concrete", "formal", "translate", "differentiate"] as const;
export type RewriteIntent = (typeof REWRITE_INTENTS)[number];

export interface FieldRewriteInput {
  locale: CopyLocale;
  /** the field path, e.g. "hero.headline", "benefits[2].text" */
  field: string;
  /** the current text (owner-typed or generated: untrusted) */
  text: string;
  /** the field's real maximum in characters */
  max: number;
  intent: RewriteIntent;
  /** `translate` only */
  targetLocale: CopyLocale | null;
  product: { name: string; facts: string[] };
  /** `differentiate`: the colliding structure and lines to steer away from */
  mustAvoid: string[];
}

export interface FieldRewriteOut {
  /** ≤ 3 */
  variants: string[];
}
