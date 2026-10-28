/**
 * `copy.page` (AI-02; ai.md AI-§A.3, AI-§B.4, AI-§B.6): one locale of the page copy, streamed hero first. Types only.
 * The output is the loose projection of `AiCopy` (same keys, no length keywords; guard v2 enforces the lengths). The
 * store's policies, voice and memory are not request data: the server reads them from the store's settings into the
 * store block of the prompt (AI-§B.5), so a browser cannot forge them.
 */
import type { AiCopy, Analysis } from "../../copy-schema";
import type { CopyDirection, CopyLocale, Market, TaskProduct } from "./common";

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

/** The loose `AiCopy` (AI-§B.4): the same keys and value types as the strict schema's output. */
export type CopyPageOut = AiCopy;
