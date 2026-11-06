/**
 * The eval set's shapes (P7 AI; ai.md AI-§F.3, AI-07). Isomorphic, types and constants only.
 *
 * A fixture is `{ id, family, task, input, locale, market, tags, expect }` (AI-§F.3) plus what the harness needs to
 * run it as a real store would: the fixture store the store block is built from (`store`), the group it belongs to,
 * the committed smoke flag (20 cases over every family, `test:ai-eval --offline` in `test:slow`), the photos of the
 * analyze cases (repo files, hashed) and the seed the library rung uses.
 */
import type { Family } from "../copy-library";
import type { CopyLocale } from "../prompts";
import type { AiTaskInput } from "../provider/types";
import type { AiTaskId, PromptFamily } from "../tasks";
import type { Market } from "@/lib/page/schema";
import type { MemoryKind } from "../prompts/store-block";

/** The R1 groups of AI-§F.3, plus the judge's calibration negatives and the screen's clean rows. */
export const EVAL_GROUPS = [
  "core",
  "darija",
  "medical",
  "modest",
  "injection",
  "no_whatsapp",
  "long_empty",
  "analyze",
  "niche",
  "scripts_briefs",
  "word_numbers",
  "misread",
  "judge",
  "screen_clean",
] as const;
export type EvalGroup = (typeof EVAL_GROUPS)[number];

/** A store the fixtures run in: its settings in the shapes the store block reads (no contact, no customer). */
export interface FixtureStore {
  id: string;
  market: Market;
  currency: string;
  primaryLocale: CopyLocale;
  /** the `policies` setting's input (PoliciesSetting.parse fills the rest) */
  policies: Record<string, unknown>;
  /** the `store_ai.voice` input (BrandVoice.parse fills the rest) */
  voice: Record<string, unknown>;
  hasWhatsapp: boolean;
  /** the calling window: saved by the owner or not (the hours text comes from `callingHoursFor`), and the "within N hours" promise */
  window: { configured: boolean; withinHours: number | null };
  memory: { kind: MemoryKind; text: string; locale: CopyLocale | null }[];
}

export interface EvalExpect {
  /** no guarded output may match (the hard checks) */
  mustNot: RegExp[];
  /** strings every guarded output keeps (a name written as the merchant wrote it) */
  mustKeep?: string[];
  /** the copy family `copyFamily` must read (modest, kids …) */
  family?: Family;
  /** what the fixture plants (an injected phrase, a word number, a misread material), for the scorers */
  planted?: string[];
}

/** A photo of the analyze cases: a repo file (≤ 80 KB, with rights: public/dev-fixtures/CREDITS.md), hashed. */
export interface FixturePhoto {
  path: string;
  sha256: string;
  w: number;
  h: number;
  /** what the photo shows, for the reader of the set (never sent) */
  note: string;
}

export interface EvalFixture<T extends AiTaskId = AiTaskId> {
  id: string;
  family: PromptFamily;
  task: T;
  /** for the analyze cases the images' `data` is filled from `photos` by the harness (`withPhotos`) */
  input: AiTaskInput<T>;
  locale: CopyLocale;
  market: Market;
  tags: string[];
  expect: EvalExpect;
  group: EvalGroup;
  store: FixtureStore;
  /** the library rung's seed */
  seed: number;
  smoke?: true;
  photos?: FixturePhoto[];
}

/** One family's set as `src/lib/ai/eval/sets/<family>/fixtures.ts` exports it. */
export interface FamilySet<T extends AiTaskId = AiTaskId> {
  family: PromptFamily;
  task: T;
  fixtures: EvalFixture<T>[];
}
