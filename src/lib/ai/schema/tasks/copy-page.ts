/**
 * `copy.page` (AI-02; ai.md AI-§A.3, AI-§B.4, AI-§B.6, AI-§D.3): one locale of the page copy, streamed hero first. The
 * model writes the loose projection of `AiCopy` (same keys, no length keywords); guard v2 enforces the lengths. The
 * store's policies, voice and memory are not request data: the server reads them from the store's settings into the
 * store block of the prompt (AI-§B.5) and into `FinalizeCtx`, so a browser cannot forge them.
 *
 * `copyPageFinalize()`: the full guard (AI-§D.2) key by key (`guardAiCopy`): rejected keys are left out, so the value is
 * a partial AiCopy the browser merges over its library with `mergeAiCopy` (which records the `CopyOrigin` of every
 * field). The call-timing words come only from `ctx.callingHours` (rule 3).
 */
import type { AiCopy, Analysis } from "../../copy-schema";
import { guardAiCopy } from "../../guard";
import type { CopyDirection, CopyLocale, Market, TaskProduct } from "./common";
import type { Finalize } from "./types";

export interface CopyPageInput {
  locale: CopyLocale;
  market: Market;
  product: TaskProduct;
  analysis: Analysis | null;
  /** the store's delivery line as the page shows it (owner-typed) */
  deliveryText: string | null;
  /** the direction this page belongs to (AI-§A.8.2 stage 7); null = the engine's structure tags */
  direction: CopyDirection | null;
  /** section ids allowed a kicker by design's plan (AI-D26, ⌈n/3⌉); null = today's behaviour */
  kickers: string[] | null;
}

/** The guarded loose `AiCopy` (AI-§B.4): the keys the guard kept; the browser's merge fills the others from the library. */
export type CopyPageOut = Partial<AiCopy>;

export function copyPageFinalize(): Finalize<CopyPageOut> {
  return (raw, ctx) => guardAiCopy(raw, ctx);
}
