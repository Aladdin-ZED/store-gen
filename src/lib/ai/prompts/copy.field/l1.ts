/**
 * `copy.field@l1` (P7 AI; ai.md AI-§A.6 "rewrite job", AI-05; README.md beside this file): the on-device rewrite
 * prompt for the worker's `{ task: "rewrite" }` job (worker v2, step 10): greedy decoding, ≤ 160 new tokens, a JSON
 * schema of exactly three variants within the field's maximum. The same finalize as the server version runs on what
 * it returns. One prompt string per call, like `copy.page@l1`; the template is the prompt over fixed probe inputs.
 */
import { z } from "zod";
import type { CopyLocale } from "../../prompts";
import { MAX_VARIANTS, REWRITE_INTENTS, type FieldRewriteInput } from "../../schema/tasks/copy-field";
import { text } from "../blocks";
import { DARIJA_GUIDE_DIGEST } from "../darija-digest";
import { localStyle } from "../copy.page/l1";
import type { PromptVersion } from "../types";
import { INTENT_MEANING } from "./s1";

const LANG: Readonly<Record<CopyLocale, string>> = {
  ar: "Write in Arabic: clear Modern Standard Arabic for Moroccan shoppers; Darija only when the intent is darija, spelled دابا, بزاف, واخا, كاين, ديال. Arabic script only, except the product name.",
  fr: "Écris en français naturel, vouvoiement.",
  en: "Write in clear, natural English.",
};

/** The strict schema of the local call: exactly three strings within the field's maximum (constrained decoding). */
export function rewriteJsonSchema(max: number): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["variants"],
    properties: { variants: { type: "array", minItems: MAX_VARIANTS, maxItems: MAX_VARIANTS, items: { type: "string", minLength: 1, maxLength: max } } },
  };
}

/** The prompt string the worker sends with `rewriteJsonSchema(input.max)`. */
export function rewritePrompt(input: FieldRewriteInput, style: string | null = null): string {
  const locale = input.intent === "translate" && input.targetLocale ? input.targetLocale : input.locale;
  const facts = input.product.facts.length ? input.product.facts.map((f) => `- ${f}`).join("\n") : "- (none given)";
  return [
    "You rewrite one line of a cash-on-delivery landing page in Morocco. Return JSON with exactly 3 variants.",
    "",
    `PRODUCT: ${input.product.name}`,
    "FACTS (the only facts and numbers you may use):",
    facts,
    "",
    `LINE (${input.field}): ${input.text}`,
    `INTENT: ${input.intent}: ${INTENT_MEANING[input.intent].replace(/\s*\[[^\]]*\]/, "")}.`,
    ...(input.mustAvoid.length ? ["AVOID these lines and their structure:", ...input.mustAvoid.map((m) => `- ${m}`)] : []),
    "",
    "RULES:",
    `- Each variant is at most ${input.max} characters and says what the line says, nothing more.`,
    "- Never add a number, a percentage, a duration, a rating or a promise that is not in the facts.",
    "- No medical claims, no hype words, no emojis, no exclamation marks, no dashes.",
    LANG[locale],
    ...(style ? ["", "STYLE SAMPLE (rhythm only; another product, words in braces are slots):", style] : []),
    "",
    "Return ONLY the JSON object.",
  ].join("\n");
}

const PROBE: FieldRewriteInput = { locale: "fr", field: "hero.headline", text: "{text}", max: 84, intent: "shorter", targetLocale: null, product: { name: "{product}", facts: ["{fact}"] }, mustAvoid: ["{avoid}"] };

export const COPY_FIELD_L1: PromptVersion<"copy.field"> = {
  task: "copy.field",
  family: "copy.field",
  version: "copy.field@l1",
  provider: "local",
  rubricVersion: null,
  canary: false,
  goal: "The on-device rewrite prompt: three variants within the field's maximum, one constrained call.",
  evalSet: "copy.field",
  platformBlock: (locale) => {
    const l = locale ?? "fr";
    return REWRITE_INTENTS.map((intent) => rewritePrompt({ ...PROBE, locale: l, intent, targetLocale: intent === "translate" ? "en" : null }, localStyle(l, [0, 1]))).join("\n\n");
  },
  storeBlock: () => "",
  userBlock: (input) => [text(rewritePrompt(input))],
  format: { name: "copy_field_local_v1", zod: z.object({ variants: z.array(z.string()).length(MAX_VARIANTS) }), json: rewriteJsonSchema(84) },
  hashExtras: [DARIJA_GUIDE_DIGEST],
};
