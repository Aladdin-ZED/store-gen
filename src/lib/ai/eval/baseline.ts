/**
 * Frozen baselines (P7 AI; ai.md AI-§F.1, AI-§F.5; AI-07 (2)). Isomorphic and pure; the files are written by
 * ./freeze.ts.
 *
 * A baseline is the outputs of one version over one family's fixtures, saved once and never regenerated (the
 * pairwise judge compares a candidate A/B against it, so a regenerated baseline would change what a win means).
 * DECISION (no API key exists at R1): the first frozen baseline of every family is the LIBRARY rung's output over
 * the fixtures, `baseline/library@<fixtures hash, 12 hex>.json`: deterministic and honest, it is what a seller gets
 * with Cloud AI off, so the first live version is measured against the floor it must beat. The first live run may
 * cut `baseline/<version>.json` once (refused when it exists), never again. A new fixture changes the family's hash
 * and is frozen as a new `library@<hash>` file beside the old ones; nothing is ever overwritten.
 */
import { libraryBrief, libraryCopyPage, libraryCritique, libraryField, libraryHero, libraryJudge, libraryPlan, libraryScreen, libraryScript } from "../provider/library-tasks";
import type { ProductCategory } from "@/lib/page/schema";
import type { AiTaskInput } from "../provider/types";
import type { R1Family } from "../prompts/registry";
import { EVAL_SETS, fixturesHash, shortHash } from "./fixtures";
import type { EvalFixture } from "./types";

export interface BaselineFile {
  family: R1Family;
  /** "library" or the prompt version it was cut from ("copy.page@s1") */
  version: string;
  /** what produced the outputs: the rung, and for a live cut the model */
  source: { rung: "library" | "server" | "local"; model: string | null };
  /** the family's fixtures hash at the cut (64 hex) */
  fixturesHash: string;
  /** fixture id → output; null = the rung has no output for the task (analyze has no library rung) */
  outputs: Record<string, unknown>;
}

/** "baseline/library@<12 hex>.json" or "baseline/<version>.json", relative to sets/<family>/. */
export function baselineName(version: string, hash?: string): string {
  return version === "library" ? `library@${shortHash(hash ?? "")}.json` : `${version}.json`;
}

/** The library rung's output for one fixture (the same functions the library provider wraps). */
export function libraryOutput(f: EvalFixture): unknown {
  const opts = { seed: f.seed, hasWhatsapp: f.store.hasWhatsapp };
  const input = f.input as never;
  switch (f.task) {
    case "copy.page":
      return libraryCopyPage(input as AiTaskInput<"copy.page">, opts);
    case "copy.hero":
      return libraryHero(input as AiTaskInput<"copy.hero">, opts);
    case "copy.field": {
      // the page's product category travels as the fixture's `category:` tag (the rewrite input has none)
      const category = f.tags.find((t) => t.startsWith("category:"))?.slice("category:".length) ?? "other";
      return libraryField(input as AiTaskInput<"copy.field">, { ...opts, category: category as ProductCategory });
    }
    case "analyze":
      return null;
    case "design.plan":
      return libraryPlan(input as AiTaskInput<"design.plan">);
    case "design.critique":
      return libraryCritique(input as AiTaskInput<"design.critique">);
    case "callcenter.script":
      return libraryScript(input as AiTaskInput<"callcenter.script">);
    case "ad.brief":
      return libraryBrief(input as AiTaskInput<"ad.brief">);
    case "injection.screen":
      return libraryScreen(input as AiTaskInput<"injection.screen">);
    case "eval.judge":
      return libraryJudge(input as AiTaskInput<"eval.judge">);
    default:
      return null;
  }
}

/** The library baseline of a family over its current fixtures (pure; ./freeze.ts writes it once). */
export function libraryBaseline(family: R1Family): BaselineFile {
  const set = EVAL_SETS[family];
  return {
    family,
    version: "library",
    source: { rung: "library", model: null },
    fixturesHash: fixturesHash(family),
    outputs: Object.fromEntries(set.fixtures.map((f) => [f.id, libraryOutput(f) ?? null])),
  };
}
