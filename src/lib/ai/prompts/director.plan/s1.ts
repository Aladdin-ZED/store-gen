/**
 * `director.plan@s1` (P7 AI; ai.md AI-19a, AI-§A.8.2 stage 1, AI-§A.8.7, AI-§D.3 `design.plan`; README.md beside this
 * file): the Director's read of the product and three direction briefs for the engine. Block 2 embeds rubric v3 and
 * the vocabulary block; block 3 is the store layer; then the per-run canary; block 4 the photos (first, labelled) and
 * the brief. finalizePlan (src/lib/ai/director/validate.ts) drops whatever the vocabulary does not allow.
 */
import { DIRECTOR_PLAN_LOOSE_JSON, DIRECTOR_LIMITS, DirectorPlanLoose, type DirectorBrief } from "../../director/types";
import { HEADLINE_STRUCTURES } from "@/lib/design/genome";
import { imageBlocks, jsonBlock, text } from "../blocks";
import { section } from "../common";
import { DIRECTOR_ANSWER, DIRECTOR_HASH_EXTRAS, directorPlatformHead } from "../director-common";
import { renderStoreBlock } from "../store-block";
import type { PromptVersion } from "../types";

const L = DIRECTOR_LIMITS;

const PLATFORM = [
  directorPlatformHead(),
  "",
  section("Goal of this step: read the product, then brief three directions", [
    "First the read: what the product is, for whom, at what price tier, and the mood its photos and words carry (readLine: Reading this as a page for an audience, with a mood; at most 140 characters). Risks name what could go wrong for this product (an orange product, a busy photo, a modest audience).",
    `suggestedFacts: at most ${L.suggestedFacts} claims the photos or the name suggest (a material, a size), for the owner to tick; they are never facts. photoQuality is what the photos allow (focus, clutter, a wide crop, a clean cutout).`,
    "dials (variance, motion, density, each 1 to 10) set from the read: a calm or modest product gets low motion and quiet variance.",
    "Then three directions the engine samples from: best_fit (the strongest read of the product), contrast (a credible different answer) and explore (a bolder language that still fits). They differ in what they ask for, not only in degree.",
    `hints: gene values from the vocabulary with a weight of 1 to 3 (at most ${L.exploreHintWeight} on explore), at most ${L.hintValuesPerGene} values per gene. They steer the sampler; the engine keeps its hard rules.`,
    "pin: at most one per direction, a bold gene set to one value, only when the direction depends on it. A pin that breaks a rule, a lock or the photo facts is dropped.",
    `headlineStructures: at most ${L.headlineStructures} per direction, from ${HEADLINE_STRUCTURES.join(", ")}, and no structure in two directions. copyAngle: one of the copy angles.`,
    `mustHave: at most ${L.mustHave} short things the direction needs. mustAvoid: at most ${L.mustAvoid} named patterns from the vocabulary, plus the niche's crowded sequences and tells the brief lists (keep their seq4: and tell: names).`,
    "rationale: one plain sentence in the shop's primary language that an owner understands: why this direction fits the product. No design jargon, no gene names.",
    "Read only what the brief and the photos show. The shop's own recent pages are in the brief so the directions differ from them; the niche's shares are rounded and anonymous.",
  ]),
  "",
  DIRECTOR_ANSWER,
].join("\n");

/** The brief as block 4 carries it: the store's identity, seed, memory and policies stay out (block 3 has the policies and memory). */
export function briefForPrompt(b: DirectorBrief): Record<string, unknown> {
  return {
    store: { market: b.store.market, locales: b.store.locales, ...(b.store.brandGenome ? { brandGenome: b.store.brandGenome } : {}) },
    product: b.product,
    photos: b.photos.map((p, i) => ({ image: i + 1, w: p.w, h: p.h, hasCutout: p.hasCutout, palette: p.palette, ...(p.analysis ? { analysis: p.analysis } : {}) })),
    mode: b.mode,
    constraints: b.constraints,
    recent: b.recent,
  };
}

export const DIRECTOR_PLAN_S1: PromptVersion<"design.plan"> = {
  task: "design.plan",
  family: "director.plan",
  version: "director.plan@s1",
  provider: "server",
  rubricVersion: "v3",
  canary: true,
  goal: "The Director's read and three distinct direction briefs in the engine's closed vocabulary.",
  evalSet: "director.plan",
  platformBlock: () => PLATFORM,
  storeBlock: (ctx) => renderStoreBlock(ctx).text,
  userBlock: (input) => {
    const primary = input.brief.store.locales[0] ?? "fr";
    return [
      ...imageBlocks(input.images, (i) => `product photo ${i + 1} of the brief`),
      jsonBlock("brief", briefForPrompt(input.brief)),
      text(`Read the product and brief three directions. Write the rationales in ${primary}. The mood constraint is ${input.brief.constraints.mood ?? "free"}${input.brief.constraints.modest ? ", for a modest audience" : ""}.`),
    ];
  },
  format: { name: "director_plan_v1", zod: DirectorPlanLoose, json: DIRECTOR_PLAN_LOOSE_JSON },
  hashExtras: DIRECTOR_HASH_EXTRAS,
};
