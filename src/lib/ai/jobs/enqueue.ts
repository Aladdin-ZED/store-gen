import "server-only";
/**
 * Detached AI jobs, pattern B (P7 AI; ai.md AI-§B.13; docs/STORE-SAAS.md §H.12, D56, §K.2 P0 ai stubs, AI R13, PLA
 * Q.11): `enqueueAiJob` runs the gate, the PII check and the reservation, inserts the `ai_jobs` row (`aj_active_uq`
 * dedupes an identical active job) and hands the job to its drivers (`after()` when `ai_detached_jobs` is on, the
 * polls, the cron's one-item batches). Frozen at P0 (src/lib/contracts/r1-p0.ts); P7 adds `getAiJob`, `cancelAiJob`,
 * `runDetachedJob`, `recoverOrphans` and the stage machine (`jobs/stages.ts`).
 *
 * P0 stub: the typed refusal `disabled` (Cloud AI is off without P7), so a caller keeps the engine's instant result.
 */
import type { aiJobs } from "@/lib/db/schema";
import type { StoreCtx } from "@/lib/tenancy/types";
import type { AiFailCode } from "../provider/types";
import type { AiTaskId } from "../tasks";

/** probe: the staff-only detached-job probe of AI-§B.13 / core §H.12 rule 1, never enqueued through enqueueAiJob */
export type AiJobKind = Exclude<(typeof aiJobs.$inferSelect)["kind"], "probe">;

export interface AiJobInput<K extends AiJobKind> {
  kind: K;
  task: AiTaskId;
  input: unknown;
  /** the engine result kept on failure */
  instant?: unknown;
}

export async function enqueueAiJob<K extends AiJobKind>(ctx: StoreCtx, job: AiJobInput<K>): Promise<{ ok: true; jobId: string; deduped: boolean } | { ok: false; code: AiFailCode }> {
  void ctx;
  void job;
  return { ok: false, code: "disabled" };
}
