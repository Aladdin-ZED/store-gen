/**
 * `copy.hero@s1` (P7 AI; ai.md AI-02, AI-§A.8.2 stage 2b, AI-§D.3; README.md beside this file): one hero pack
 * (kicker, headline, sub, cta) for one direction, in the store's primary locale. The three directions of a run ask for
 * three different headline structures, and finalize checks the structure with the detector, so the packs differ.
 */
import { HeroPackLoose, HERO_MAX, HERO_PACK_LOOSE_JSON } from "../../schema/tasks/copy-hero";
import { LOCALE_NAME, jsonBlock, productFactsBlock, text } from "../blocks";
import { OUTPUT_RULE, copyPlatformHead, section } from "../common";
import { DARIJA_GUIDE_DIGEST } from "../darija-digest";
import { renderStoreBlock } from "../store-block";
import { renderStyleGuide, rotationLine } from "../style-guide";
import type { PromptVersion } from "../types";

/** design's G29 structures, as the writer is told them (the detector reads the same shapes). */
export const STRUCTURE_MEANING: Readonly<Record<string, string>> = {
  "noun-phrase": "a noun phrase with no verb in the imperative and no question: the benefit named",
  imperative: "opens with a verb addressed to the shopper",
  question: "one question the shopper asks themself; no answer in the headline",
  "number-led": "opens with a number the facts carry, written as the facts write it (never without such a fact)",
  "contrast-pair": "two mirrored halves (less X, more Y; not X but Y)",
  "quote-led": "opens with the merchant's own words in quotation marks, never an invented review or testimonial",
  "word-subline": "one emphasised word, then a plain line",
};

const PLATFORM = [
  copyPlatformHead("You write the hero of a cash-on-delivery landing page"),
  "",
  section("Goal", [
    "Write one hero pack for one design direction: the first screen a shopper sees after the ad. In two seconds they should know what the product is and why it is for them.",
    "The request names the headline structure. Use it: three directions of one page each get a different structure, so the three heroes read differently.",
    `Lengths: kicker at most ${HERO_MAX.kicker} characters (may be empty), headline at most ${HERO_MAX.headline}, sub at most ${HERO_MAX.sub}, cta at most ${HERO_MAX.cta}. Shorter and clear is better.`,
    "The headline wraps exactly one key word in *asterisks*. The sub makes the headline concrete with a fact. The cta is what the shopper says when ordering.",
  ]),
  "",
  section("Headline structures", Object.entries(STRUCTURE_MEANING).map(([k, v]) => `${k}: ${v}.`)),
  "",
  renderStyleGuide(["headline", "sub", "cta"]),
  "",
  section("Answer", OUTPUT_RULE),
].join("\n");

export const COPY_HERO_S1: PromptVersion<"copy.hero"> = {
  task: "copy.hero",
  family: "copy.hero",
  version: "copy.hero@s1",
  provider: "server",
  rubricVersion: null,
  canary: false,
  goal: "One hero pack per direction in the primary locale, in the headline structure the direction names.",
  evalSet: "copy.hero",
  platformBlock: () => PLATFORM,
  storeBlock: (ctx) => renderStoreBlock(ctx).text,
  userBlock: (input, extra) => {
    const d = input.direction;
    return [
      productFactsBlock(input.product, { deliveryText: input.deliveryText }),
      ...(d.mustAvoid.length ? [jsonBlock("page_copy", { avoid: d.mustAvoid }, { kind: "avoid" }), text("Do not echo or resemble the lines and structures in <page_copy kind=\"avoid\">.")] : []),
      text(
        [
          `Write one hero pack in ${LOCALE_NAME[input.locale]} for the ${d.slot.replace("_", " ")} direction. Market: ${input.market}.`,
          `Headline structure: ${d.headlineStructure ?? "free, but not the structure of any line to avoid"}.`,
          ...(d.angle ? [`Copy angle: ${d.angle}.`] : []),
          ...(extra.rotation ? [rotationLine(input.locale, extra.rotation)] : []),
        ].join("\n"),
      ),
    ];
  },
  format: { name: "copy_hero_v1", zod: HeroPackLoose, json: HERO_PACK_LOOSE_JSON },
  hashExtras: [DARIJA_GUIDE_DIGEST],
};
