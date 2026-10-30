/**
 * `copy.page@l1` (P7 AI; ai.md AI-§A.6, AI-§F.1; README.md beside this file): the on-device copy prompt, which is
 * today's `copyPrompt` (src/lib/ai/prompts.ts) for the Qwen3.5 worker, one locale per constrained call. The local
 * model reads one string, so the version's blocks are views of that one prompt:
 *  - `platformBlock(locale)`: `copyPrompt` over two fixed probe requests (CopyRequest v1 and v2), so every static
 *    string of the prompt, today's and v2's, is in the template hash and an edit of prompts.ts is a new version;
 *  - `localCopyRequest(input, ctx, extra)`: the CopyRequest v2 the router sends the worker, with the store's own
 *    policies (≤ 6 lines), voice (≤ 600 chars), WhatsApp flag, rotated exemplar and copy genes (AI-02 (4): no fixed
 *    Morocco policy line);
 *  - `userBlock(input)`: today's prompt for a v1 request (what an old worker bundle builds).
 */
import { AI_COPY_JSON_SCHEMA, AiCopy } from "../../copy-schema";
import { copyPrompt, type CopyLocale, type CopyRequest } from "../../prompts";
import type { CopyPageInput } from "../../schema/tasks/copy-page";
import { text } from "../blocks";
import { DARIJA_GUIDE_DIGEST } from "../darija-digest";
import { localPolicyLines, voiceLocal, type StoreBlockCtx } from "../store-block";
import { STYLE_GUIDE, exemplarLines } from "../style-guide";
import type { PromptVersion, UserBlockExtra } from "../types";

/** The probe requests whose prompts make the template (fixed words, no store). */
function probe(locale: CopyLocale, v2: boolean): CopyRequest {
  return {
    locale,
    market: "MA",
    product: { name: "{product}", category: "other", price: 0, currency: "MAD", facts: ["{fact}"] },
    analysis: null,
    deliveryText: v2 ? "{delivery}" : null,
    ...(v2 ? { voice: "{voice}", policies: ["{policy}"], hasWhatsapp: false, style: "{style}", angle: "benefit", headlineStructure: "noun-phrase", promptVersion: "copy.page@l1" } : {}),
  } as CopyRequest;
}

/** The rotated exemplar as one block of text for the local prompt (AI-§G.3: one exemplar for the target locale). */
export function localStyle(locale: CopyLocale, pair: readonly [number, number] | null): string | null {
  if (!pair) return null;
  const e = STYLE_GUIDE[locale][pair[0]];
  if (!e) return null;
  const [headline, sub, bt, bx, q, a, cta] = exemplarLines(e);
  return [`headline: ${headline}`, `sub: ${sub}`, `benefit: ${bt} | ${bx}`, `faq: ${q} | ${a}`, `cta: ${cta}`].join("\n");
}

/** The CopyRequest v2 of one local run: the store's own policies and voice, never the fixed lines. */
export function localCopyRequest(input: CopyPageInput, ctx: StoreBlockCtx, extra: UserBlockExtra): CopyRequest {
  const d = input.direction;
  const style = localStyle(input.locale, extra.rotation);
  return {
    locale: input.locale,
    market: input.market,
    product: { name: input.product.name, category: input.product.category, price: input.product.priceMinor / 100, currency: input.product.currency, facts: input.product.facts.slice(0, 6) },
    analysis: input.analysis,
    deliveryText: input.deliveryText,
    voice: voiceLocal(ctx, input.locale) || null,
    policies: localPolicyLines(ctx),
    hasWhatsapp: ctx.hasWhatsapp,
    style,
    angle: (d?.angle as CopyRequest["angle"]) ?? null,
    headlineStructure: (d?.headlineStructure as CopyRequest["headlineStructure"]) ?? null,
    promptVersion: COPY_PAGE_L1.version,
  };
}

export const COPY_PAGE_L1: PromptVersion<"copy.page"> = {
  task: "copy.page",
  family: "copy.page",
  version: "copy.page@l1",
  provider: "local",
  rubricVersion: null,
  canary: false,
  goal: "The on-device page copy prompt (today's copyPrompt), one locale per constrained call.",
  evalSet: "copy.page",
  platformBlock: (locale) => {
    const l = locale ?? "fr";
    return [copyPrompt(probe(l, false)), copyPrompt(probe(l, true))].join("\n\n");
  },
  storeBlock: (ctx) => [...localPolicyLines(ctx), voiceLocal(ctx, ctx.primaryLocale === "ar" || ctx.primaryLocale === "en" ? ctx.primaryLocale : "fr")].join("\n"),
  userBlock: (input) =>
    [
      text(
        copyPrompt({
          locale: input.locale,
          market: input.market,
          product: { name: input.product.name, category: input.product.category, price: input.product.priceMinor / 100, currency: input.product.currency, facts: input.product.facts.slice(0, 6) },
          analysis: input.analysis,
          deliveryText: input.deliveryText,
        }),
      ),
    ],
  format: { name: "copy_page_local_v1", zod: AiCopy, json: AI_COPY_JSON_SCHEMA as Record<string, unknown> },
  hashExtras: [DARIJA_GUIDE_DIGEST],
};
