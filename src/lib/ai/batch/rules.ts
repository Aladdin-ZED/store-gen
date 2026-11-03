/**
 * The Batches collector's pure rules (P7 AI; ai.md AI-§B.8; docs/STORE-SAAS.md §H.2 slot 4b). Isomorphic, no I/O:
 * the submit rule, the `custom_id` of an item, the dedupe key, the canary token of a batch item's Director prompt and
 * the job reference of a stage handed to a one-item batch. test:ai checks them; ./submit.ts, ./queue.ts and
 * ./ingest.ts apply them.
 */
import { sha256Hex } from "../prompts/sha256";

export const SUBMIT_MIN_ITEMS = 20;
export const SUBMIT_MAX_AGE_MS = 15 * 60_000;
export const MAX_ITEMS_PER_BATCH = 1_000;
/** An item retried this many times is dropped (AI-§B.8: retry once in the next batch). */
export const MAX_ITEM_ATTEMPTS = 2;
/** the ingest loop yields every this many results (core §H.2 rev 3) */
export const INGEST_YIELD_EVERY = 50;

/** AI-§B.8 step 3: ≥ 20 queued, the oldest ≥ 15 min, or an eval run or a job stage waiting. */
export function shouldSubmit(s: { queued: number; oldest: Date | null; urgent: boolean }, now: number): boolean {
  if (s.queued <= 0) return false;
  return s.queued >= SUBMIT_MIN_ITEMS || s.urgent || (s.oldest !== null && now - s.oldest.getTime() >= SUBMIT_MAX_AGE_MS);
}

/** `custom_id` of an item (≤ 64 chars) and back. */
export const customIdOf = (itemId: string): string => `i_${itemId}`;
export const itemIdOf = (customId: string): string | null => (/^i_[0-9A-HJKMNP-TV-Z]{26}$/.test(customId) ? customId.slice(2) : null);

/** The dedupe key of one item: sha256 over task, ref, input hash and prompt version. */
export function batchDedupe(task: string, ref: { kind: string; id: string }, inputHash: string, promptVersion: string): string {
  return sha256Hex(`${task}|${ref.kind}:${ref.id}|${inputHash}|${promptVersion}`);
}

/** The canary token of a batch item's Director prompt: derived from its id, which no prompt or page ever shows. */
export const batchCanaryOf = (itemId: string): string => sha256Hex(`ai-batch-canary|${itemId}`).slice(0, 16);

/** The job and stage a `ref_kind = 'job'` item belongs to (`<jobId>:<stage>`). */
export function jobRefOf(refId: string): { jobId: string; stage: string } | null {
  const m = /^([0-9A-HJKMNP-TV-Z]{26}):([a-z]+(?::[0-9]{1,2})?)$/.exec(refId);
  return m ? { jobId: m[1]!, stage: m[2]! } : null;
}
