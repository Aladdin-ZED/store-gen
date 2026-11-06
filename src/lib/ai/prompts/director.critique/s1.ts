/**
 * `director.critique@s1` (P7 AI; ai.md AI-19a, AI-§A.8.2 stage 4, AI-§A.8.7 final instruction, rev 3 QUAL-11 / QUAL-12;
 * README.md beside this file): the slim critique of the engine's candidates against rubric v3. Three picks that differ
 * pairwise by at least 0.30, scores and at most three repair ops on the picks only, at most one issue per other
 * candidate, one "why" line per pick in the primary locale. finalizeCritique enforces every rule stated here.
 */
import type { BetaContentBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { CRITIQUE_LOOSE_JSON, CritiqueLoose, DIRECTOR_LIMITS, type CritiqueInput } from "../../director/types";
import { jsonBlock, text } from "../blocks";
import { section } from "../common";
import { DIRECTOR_ANSWER, DIRECTOR_HASH_EXTRAS, directorPlatformHead } from "../director-common";
import { briefForPrompt } from "../director.plan/s1";
import { renderStoreBlock } from "../store-block";
import type { PromptVersion } from "../types";

const L = DIRECTOR_LIMITS;

const PLATFORM = [
  directorPlatformHead(),
  "",
  section("Goal of this step: judge the candidates the engine rendered", [
    "Each candidate is a genome card (its bold genes, its bands, its gate failures), the digest of its rendered page (mechanical counts, budgets, gates) and its hero copy; in a later round also tiles (images of the page).",
    `Pick three directions that differ pairwise by at least ${L.tau.toFixed(2)}, for this product and this shopper. A candidate with a design hard gate or a budget marked over is never a pick.`,
    `Score the three picks against the rubric, with one piece of evidence per issue and at most ${L.opsPerPick} repair ops each. Give every other candidate at most one issue: the reason it lost.`,
    "Score only what the cards, the digest and the tiles you were given show. Without tiles, the tile-only parts stay null and you say nothing visual.",
    `Write one plain sentence per pick, at most ${L.whyLine} characters, that a shop owner understands, in the language the request names: what makes this direction right for the product.`,
  ]),
  "",
  DIRECTOR_ANSWER,
].join("\n");

/** The candidates as block 4 carries them: cards and digests are engine data, the hero copy is page text (escaped). */
function candidatesForPrompt(input: CritiqueInput): Record<string, unknown>[] {
  return input.candidates.map((c) => ({ id: c.card.id, card: c.card, digest: c.digest, heroCopy: c.heroCopy, tiles: (c.tiles ?? []).map((t) => t.label) }));
}

export const DIRECTOR_CRITIQUE_S1: PromptVersion<"design.critique"> = {
  task: "design.critique",
  family: "director.critique",
  version: "director.critique@s1",
  provider: "server",
  rubricVersion: "v3",
  canary: true,
  goal: "The slim critique: three distinct picks, scores and repair ops on the picks only, one why line each.",
  evalSet: "director.critique",
  platformBlock: () => PLATFORM,
  storeBlock: (ctx) => renderStoreBlock(ctx).text,
  userBlock: (input) => {
    const primary = input.brief.store.locales[0] ?? "fr";
    const tiles: BetaContentBlockParam[] = input.tilesPresent
      ? input.candidates.flatMap((c) =>
          (c.tiles ?? []).flatMap((t): BetaContentBlockParam[] => [
            text(`Image ${c.card.id} ${t.label}: a ${t.w} x ${t.h} px tile of candidate ${c.card.id}${t.fidelity === "partial" ? " (partial render)" : ""}.`),
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: t.jpegBase64 } },
          ]),
        )
      : [];
    return [
      ...tiles,
      jsonBlock("brief", { ...briefForPrompt(input.brief), read: input.plan.read, directions: input.plan.directions, round: input.round, tilesPresent: input.tilesPresent, ...(input.previous ? { previous: input.previous } : {}) }),
      jsonBlock("candidates", candidatesForPrompt(input)),
      text(
        [
          `Pick three directions that differ pairwise by at least ${L.tau.toFixed(2)}. Score the three picks against the rubric with one piece of evidence per issue and at most ${L.opsPerPick} repair ops each; give each other candidate at most one issue, the reason it lost.`,
          `Score only what the cards, the digest${input.tilesPresent ? " and the tiles" : ""} you were given show.${input.tilesPresent ? "" : " There are no tiles in this round."}`,
          `Write one plain sentence per pick a shop owner understands, in ${primary}.`,
        ].join(" "),
      ),
    ];
  },
  format: { name: "director_critique_v1", zod: CritiqueLoose, json: CRITIQUE_LOOSE_JSON },
  hashExtras: DIRECTOR_HASH_EXTRAS,
};
