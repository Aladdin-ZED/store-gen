/**
 * `copy.field` (AI-05; ai.md AI-§A.6, AI-§D.2 rule 13, AI-§D.3): three rewrites of one text field. Every variant
 * passes the guard with the field's real maximum and the page's allowed numbers; a failing one is dropped (all three
 * failing → the menu says "No honest rewrite found"). The intent is checked too: `shorter` is shorter, `darija` uses
 * the guide's Darija, `formal` keeps the vouvoiement, `translate` keeps every number and unit of the source and the
 * product name as written, `differentiate` (the novelty re-ask) leaves the colliding structure and lines.
 */
import { allowedNumbersFor, guardText } from "../../guard";
import { latinFold, numbersIn, type NumberToken } from "../../guard-numbers";
import { DARIJA_WORDS } from "../../prompts/darija-orthography";
import type { CopyLocale } from "./common";
import { headlineStructureOf } from "./copy-hero";
import { isRecord, type Finalize } from "./types";

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

export const MAX_VARIANTS = 3;
/** candidates read from the model before the three are kept (a failing one makes room for the next) */
const MAX_CANDIDATES = 5;

/** the guide's single words (a phrase like "اطلب دابا" would bring the MSA "اطلب" in) */
const DARIJA = new Set(DARIJA_WORDS.map((w) => w.canonical).filter((w) => !w.includes(" ")));
const TUTOIEMENT = /(?<![\p{L}])(?:tu|te|toi|ton|ta|tes|t')(?![\p{L}])/iu;
const STRUCTURES = new Set(["noun-phrase", "imperative", "question", "number-led", "contrast-pair", "quote-led", "word-subline"]);

/** the same figures with the same units (a translation adds none and loses none) */
function sameNumbers(a: readonly NumberToken[], b: readonly NumberToken[]): boolean {
  const key = (t: NumberToken) => `${t.unit ?? "-"}:${Math.round(t.base * 1000) / 1000}`;
  const ka = a.map(key).sort();
  const kb = b.map(key).sort();
  return ka.length === kb.length && ka.every((k, i) => k === kb[i]);
}

/** The guard of `copy.field` for the input's field, intent and source text. */
export function copyFieldFinalize(input: FieldRewriteInput): Finalize<FieldRewriteOut> {
  return (raw, ctx) => {
    if (!isRecord(raw) || !Array.isArray(raw.variants)) return null;
    const locale = input.intent === "translate" && input.targetLocale ? input.targetLocale : input.locale;
    const gctx = { ...ctx, locale };
    // the source's own figures stay allowed: rewriting never loses a number the field legitimately carries
    const allowed = allowedNumbersFor(gctx).addText(input.text);
    const source = latinFold(input.text.trim());
    const sourceNumbers = numbersIn(input.text, input.locale);
    const avoidStructures = input.mustAvoid.filter((m) => STRUCTURES.has(m));
    const avoidLines = input.mustAvoid.filter((m) => !STRUCTURES.has(m)).map((m) => latinFold(m.trim())).filter(Boolean);
    const variants: string[] = [];
    const rejected: string[] = [];
    const seen = new Set<string>([source]);

    raw.variants.slice(0, MAX_CANDIDATES).forEach((v, i) => {
      const drop = () => rejected.push(`variants.${i}`);
      if (variants.length >= MAX_VARIANTS) return;
      const r = guardText(v, gctx, allowed, input.max);
      if (!r.ok) return drop();
      const text = r.text;
      const key = latinFold(text);
      if (seen.has(key)) return drop();
      switch (input.intent) {
        case "shorter":
          if (text.length >= input.text.trim().length) return drop();
          break;
        case "darija":
          if (locale !== "ar" || !text.split(/[\s،.؟!,]+/u).some((w) => DARIJA.has(w))) return drop();
          break;
        case "formal":
          if (locale === "fr" && TUTOIEMENT.test(text)) return drop();
          break;
        case "translate":
          if (!sameNumbers(sourceNumbers, numbersIn(text, locale))) return drop();
          if (input.product.name && input.text.includes(input.product.name) && !text.includes(input.product.name)) return drop();
          break;
        case "differentiate":
          if (avoidStructures.includes(headlineStructureOf(text, locale))) return drop();
          if (avoidLines.some((l) => key.includes(l) || l.includes(key))) return drop();
          break;
        default:
          break;
      }
      seen.add(key);
      variants.push(text);
    });
    return { value: { variants }, rejected };
  };
}
