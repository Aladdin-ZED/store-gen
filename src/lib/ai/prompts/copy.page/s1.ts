/**
 * `copy.page@s1` (P7 AI; ai.md AI-02, AI-§A.8.7, AI-§B.5, AI-§F.1; README.md beside this file): one locale of a
 * landing page's copy, written by the Worker class and streamed hero first. Block 2 is the platform text (the
 * constitution, the owner rules, honesty, the data rule, the three locales, the Darija level and spelling guide, the
 * patterns to avoid, the field guide from the strict schema, the curated style guide); block 3 the store's policies,
 * voice and memory; block 4 the product data, the direction and the style rotation.
 */
import { AI_COPY_JSON_SCHEMA, AI_COPY_LOOSE_JSON, AiCopyLoose } from "../../copy-schema";
import { COPY_PAGE_FIELD_ORDER } from "../../tasks";
import { LOCALE_NAME, jsonBlock, productFactsBlock, text } from "../blocks";
import { OUTPUT_RULE, copyPlatformHead, section } from "../common";
import { DARIJA_GUIDE_DIGEST } from "../darija-digest";
import { renderFieldGuide } from "../field-guide";
import { renderStoreBlock } from "../store-block";
import { renderStyleGuide, rotationLine } from "../style-guide";
import type { PromptVersion } from "../types";

/** What each AiCopy field is for (the lengths come from the strict schema). */
export const COPY_PAGE_MEANING: Readonly<Record<string, string>> = {
  kicker: "A short line above the headline: the product kind or the moment it is for, never a slogan.",
  headline: "One promise the facts support, under 9 words; wrap exactly one key word in *asterisks*.",
  sub: "One or two sentences that make the headline concrete for a shopper on a phone.",
  cta: "The order button: what the shopper says when ordering, in the shop's voice (its preferred call to action when it fits).",
  benefits: "Concrete outcomes drawn from the facts and the photo's appearance, each with a fitting icon; no two say the same thing.",
  tagline: "One line under the product name: what it is, plainly.",
  announcement: "Lines for the top bar: cash on delivery and the policies the shop states, nothing else.",
  problem_title: "The title of the problem section: the everyday situation the product helps with.",
  pains: "An everyday annoyance and how this product answers it, in the shopper's words.",
  solution: "The product as the answer to those pains, in one or two sentences.",
  steps: "How to use or receive the product, in order; from the facts when they say how.",
  faq: "Exactly five questions in this order: how payment works (cash on delivery), delivery (as the policies say), checking the parcel before paying (as the policies say), how to use the product, exchanges and after-sales (as the policies say).",
  guarantee: "Reassurance built only from cash on delivery and the policies the shop states; no guarantee the shop did not give.",
  cta_title: "The closing call to order, short.",
  cta_text: "One or two sentences under it: ordering is simple, payment is at the door.",
  story_title: "The title of a short story about the product.",
  story: "Why the product is useful, told plainly; no invented history, founder, date, place or number of customers.",
  comparison: "Rows comparing this offer with the usual alternatives (quality, ease of use, payment, checking before paying only as stated).",
  marquee: "Very short words or phrases for a scrolling band (one to three words each), from the product and COD.",
  seo_title: "The search result title: the product name and what it is.",
  seo_description: "The search result description: what it is, why it helps, cash on delivery.",
};

const PLATFORM = [
  copyPlatformHead("You write landing page copy for cash-on-delivery shops"),
  "",
  section("Goal", [
    "Write one landing page's copy in the language the request names, for the product in <product_facts>, so a shopper who came from an ad understands it, trusts it and orders.",
    "Write for a phone: short sentences, the most useful words first. Every section earns its place with one concrete thing.",
    "The headline and the hero come first in the answer because the page shows them first.",
    "When a field has nothing honest to say, keep it plain rather than invent: a plain true line beats a vivid false one.",
  ]),
  "",
  "## Field guide (lengths are limits, not targets: shorter and clear is better)",
  renderFieldGuide(AI_COPY_JSON_SCHEMA as Record<string, unknown>, COPY_PAGE_FIELD_ORDER, COPY_PAGE_MEANING),
  "",
  renderStyleGuide(["headline", "sub", "benefit", "faq", "cta"]),
  "",
  section("Answer", OUTPUT_RULE),
].join("\n");

export const COPY_PAGE_S1: PromptVersion<"copy.page"> = {
  task: "copy.page",
  family: "copy.page",
  version: "copy.page@s1",
  provider: "server",
  rubricVersion: null,
  canary: false,
  goal: "One locale of a landing page's copy, honest and specific, streamed hero first.",
  evalSet: "copy.page",
  platformBlock: () => PLATFORM,
  storeBlock: (ctx) => renderStoreBlock(ctx).text,
  userBlock: (input, extra) => {
    const d = input.direction;
    const lines = [
      `Write the page copy in ${LOCALE_NAME[input.locale]} for the product in <product_facts>.`,
      `Market: ${input.market}.`,
      ...(d?.angle ? [`Copy angle: ${d.angle} (lead with it).`] : []),
      ...(d?.headlineStructure ? [`Headline structure: ${d.headlineStructure}.`] : []),
      ...(extra.rotation ? [rotationLine(input.locale, extra.rotation)] : []),
    ];
    return [
      productFactsBlock(input.product, { deliveryText: input.deliveryText, analysis: input.analysis }),
      ...(d && d.mustAvoid.length ? [jsonBlock("page_copy", { avoid: d.mustAvoid }, { kind: "avoid" }), text("Do not echo or resemble the lines and structures in <page_copy kind=\"avoid\">.")] : []),
      text(lines.join("\n")),
    ];
  },
  format: { name: "copy_page_v1", zod: AiCopyLoose, json: AI_COPY_LOOSE_JSON as Record<string, unknown> },
  hashExtras: [DARIJA_GUIDE_DIGEST],
};
