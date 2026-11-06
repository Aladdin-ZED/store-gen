/**
 * The prompt registry's shapes (P7 AI; ai.md AI-§F.1, AI-§B.5). Isomorphic, types only, so the family files and
 * src/lib/ai/prompts/registry.ts import them without a cycle.
 *
 * A `PromptVersion` is one family at one version: the artifact a `prompt_versions` row names. It renders the three
 * blocks a request carries (AI-§B.5): block 2 `platformBlock` (pure and byte-stable, no store data; server versions
 * are called with `null`, one block for ar / fr / en; local versions per locale), block 3 `storeBlock` (the store
 * layer; empty for the families that need no store context), block 4 `userBlock` (the data blocks of one request).
 */
import type { BetaContentBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { z } from "zod";
import type { CopyLocale } from "../prompts";
import type { AiTaskId, PromptFamily } from "../tasks";
import type { AiTaskInput } from "../provider/types";
import type { StoreBlockCtx } from "./store-block";

/** The loose output schema of a version (AI-§B.4): sent as the structured-output format, parsed back by `zod`. */
export interface LooseFormat {
  /** a stable name ("copy_page_v1"): part of the template hash */
  name: string;
  zod: z.ZodType;
  json: Record<string, unknown>;
}

/** What block 4 needs beside the task input (chosen by the router, never by the browser). */
export interface UserBlockExtra {
  /** the style rotation pair (AI-§G.3) for the copy families; null = no rotation line */
  rotation: readonly [number, number] | null;
}

export interface PromptVersion<T extends AiTaskId = AiTaskId> {
  task: T;
  family: PromptFamily;
  /** "copy.page@s1" (server) or "copy.page@l1" (local): the key of PROMPTS and of hashes.json */
  version: string;
  provider: "server" | "local";
  /** Director families embed rubric v3 (AI-D25); null otherwise */
  rubricVersion: "v3" | null;
  /** a per-run canary token follows the cached blocks (AI-§E.3 control 5): the Director families */
  canary: boolean;
  /** what the version is for, one line (the README says more) */
  goal: string;
  /** the eval set that gates it (src/lib/ai/eval/sets/<family>/) */
  evalSet: PromptFamily;
  platformBlock(locale: CopyLocale | null): string;
  /** block 3's text, or "" when the family needs no store context */
  storeBlock(ctx: StoreBlockCtx): string;
  userBlock(input: AiTaskInput<T>, extra: UserBlockExtra): BetaContentBlockParam[];
  format?: LooseFormat;
  /** artifacts the version depends on beyond its text (the Darija guide, the rubric, the vocabulary): part of the hash */
  hashExtras: readonly string[];
}
