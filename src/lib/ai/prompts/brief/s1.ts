/**
 * `brief@s1` (P7 AI; ai.md AI-20 R1 slice, AI-§D.3 `ad.brief`; landing.md LAN-§13.2-13.3; README.md beside this file):
 * the Campaign Kit's ad brief written from the published page: three angles mapped to the page's sections, hooks in
 * Darija (Arabic script) and French, primary texts and headlines within each platform's limits, UGC shot lists and a
 * what-to-film checklist. Copy only: nothing is posted anywhere. Every hook traces to a fact, a policy or a section.
 */
import { AD_BRIEF_LOOSE_JSON, AD_LIMITS, AD_PLATFORMS, AdBriefLoose, HOOK_MAX_WORDS, type AdBriefInput } from "../../schema/tasks/ad-brief";
import { jsonBlock, priceText, text } from "../blocks";
import { COPY_AVOID, CONSTITUTION, DATA_RULE, DARIJA_LEVELS, HONESTY, MARKET_RULES, OUTPUT_RULE, OWNER_RULES, darijaGuideText, section } from "../common";
import { DARIJA_GUIDE_DIGEST } from "../darija-digest";
import { renderStoreBlock } from "../store-block";
import type { PromptVersion } from "../types";

const limits = AD_PLATFORMS.map((p) => `${p}: primary text ${AD_LIMITS[p].primary === null ? "none" : `at most ${AD_LIMITS[p].primary} characters`}, headline ${AD_LIMITS[p].headline === null ? "none" : `at most ${AD_LIMITS[p].headline} characters`}`);

const PLATFORM = [
  "# You write ad briefs for a cash-on-delivery shop's campaigns",
  CONSTITUTION.join(" "),
  "The brief tells the seller what to film and what to write for ads that send shoppers to the published page. An ad that promises what the page does not say brings orders that are refused at the door.",
  "",
  section("The owner's rules (they win over everything below)", OWNER_RULES),
  "",
  section("Honesty", HONESTY),
  "",
  section("Ad rules", [
    "No before and after, in words or in a shot list.",
    "No body-shaming and no question about the reader's body, weight, skin, age or health.",
    "No guaranteed result, no medical claim, no invented urgency or scarcity, no price or offer the page does not show.",
    "Every hook rests on a fact, a stated policy or a section of the page; nothing else.",
  ]),
  "",
  section("Data and instructions", DATA_RULE),
  "",
  section("Goal", [
    "Three angles, each built on one section of the page (its sectionId and its structure tag), no two on the same tag.",
    `Per angle: a short name; a hook in Darija (Arabic script) and in French, each at most ${HOOK_MAX_WORDS} words; primary texts and headlines per platform; a 15 second UGC shot list of 6 beats and a 30 second one of 10 beats, in the shop's primary language.`,
    ...limits,
    "A what-to-film checklist of at most 8 lines: real shots of the real product (hands, use, the parcel at the door), never stock footage.",
    "basedOnVersionId repeats the request's page version exactly.",
  ]),
  "",
  section("Market and languages", MARKET_RULES),
  "",
  section("Darija level", DARIJA_LEVELS),
  "",
  darijaGuideText(),
  "",
  section("Patterns to avoid", COPY_AVOID),
  "",
  section("Answer", OUTPUT_RULE),
].join("\n");

export const BRIEF_S1: PromptVersion<"ad.brief"> = {
  task: "ad.brief",
  family: "brief",
  version: "brief@s1",
  provider: "server",
  rubricVersion: null,
  canary: false,
  goal: "The Campaign Kit's ad brief from the published page: three angles, hooks, platform texts, shot lists.",
  evalSet: "brief",
  platformBlock: () => PLATFORM,
  storeBlock: (ctx) => renderStoreBlock(ctx).text,
  userBlock: (input: AdBriefInput) => [
    jsonBlock("product_facts", { name: input.product.name, category: input.product.category, price: priceText(input.product.priceMinor, input.product.currency), facts: input.product.facts }),
    jsonBlock("page_copy", { sections: input.sections.map((s) => ({ sectionId: s.id, tag: s.tag, headline: s.headline, lead: s.lead })) }),
    text([`Write the ad brief for the published page version ${input.basedOnVersionId.replace(/[^A-Za-z0-9_-]/g, "")}.`, `Languages of the kit: ${input.locales.join(", ")}.`].join("\n")),
  ],
  format: { name: "ad_brief_v1", zod: AdBriefLoose, json: AD_BRIEF_LOOSE_JSON as unknown as Record<string, unknown> },
  hashExtras: [DARIJA_GUIDE_DIGEST],
};
