/**
 * One shared case as one family's fixture (P7 AI; ai.md AI-§F.3). Pure and isomorphic. The id is
 * `<family>/<case id>`, the seed of the library rung is derived from the case id (stable across families), and the
 * smoke flag is set when the case names the family.
 */
import type { AnalyzeImage } from "../schema/tasks/analyze";
import type { AiTaskInput } from "../provider/types";
import type { AiTaskId, PromptFamily } from "../tasks";
import { sha256Hex } from "../prompts/sha256";
import type { EvalCase } from "./sets/shared/cases";
import type { EvalFixture } from "./types";

export const caseSeed = (caseId: string): number => parseInt(sha256Hex(caseId).slice(0, 8), 16) % 1_000_000;

export function fixtureOf<T extends AiTaskId>(c: EvalCase, family: PromptFamily, task: T, input: AiTaskInput<T>, extra: { tags?: string[]; id?: string } = {}): EvalFixture<T> {
  return {
    id: `${family}/${extra.id ?? c.id}`,
    family,
    task,
    input,
    locale: c.locale,
    market: c.store.market,
    tags: [...c.tags, ...(extra.tags ?? [])],
    expect: c.expect,
    group: c.group,
    store: c.store,
    seed: caseSeed(c.id),
    ...(c.smoke?.includes(family) ? { smoke: true as const } : {}),
    ...(c.photos ? { photos: c.photos } : {}),
  };
}

/** The case's photos as task images; the harness fills `data` from the files (`withPhotos`). */
export const imagesOf = (c: EvalCase): AnalyzeImage[] => (c.photos ?? []).map((p) => ({ mediaType: "image/webp" as const, data: "", w: p.w, h: p.h }));
