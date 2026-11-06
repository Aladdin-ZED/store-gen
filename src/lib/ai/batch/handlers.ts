import "server-only";
/**
 * Where an ingested batch result goes (P7 AI; ai.md AI-§B.8 "Ingest", AI-§B.13 case a, AI-§F.5): a job stage's
 * result completes (or fails) that stage of its job; an eval item advances its eval run (../eval/live.ts); any other
 * store item is handed to the handler its task registered with `registerBatchResultHandler` (../router/server.ts:
 * SEO drafts AI-09, memory candidates AI-14, digests AI-17, health reports AI-17b, exemplar scores). A handler that
 * throws is logged and never stops the ingest.
 */
import type { JobCtx } from "@/lib/jobs/runner";
import type { WriteScope } from "@/lib/tenancy/types";
import { progressEvalRun } from "../eval/live";
import { completeStage, failJob } from "../jobs/claim";
import type { BatchItemRow } from "../platform/batches";
import type { AiOutcome } from "../provider/types";
import { batchResultHandler } from "../router/server";
import { batchStageCond, readJob } from "../store/jobs";
import type { AiTaskId } from "../tasks";
import { jobRefOf } from "./rules";

/** A store item's outcome to its job stage or its task's handler. */
export async function deliverOutcome(ctx: JobCtx, scope: WriteScope, item: BatchItemRow, out: AiOutcome<unknown>): Promise<void> {
  void ctx;
  if (item.refKind === "job") {
    const ref = jobRefOf(item.refId);
    const row = ref ? await readJob(scope, ref.jobId) : null;
    if (!ref || !row) return;
    if (out.ok) await completeStage(scope, row, ref.stage, { output: out.value, runId: out.runId }, { batch: true });
    else await failJob(scope, row, `${out.code}:${ref.stage}`.slice(0, 200), new Date(), { cond: batchStageCond(`batch:${ref.stage}`) });
    return;
  }
  const h = batchResultHandler(item.task as AiTaskId);
  if (!h) return;
  try {
    await h(scope, { kind: item.refKind, id: item.refId }, out as never);
  } catch (err) {
    console.error(`[ai] batch handler of ${item.task} failed: ${err instanceof Error ? err.name : "error"}`);
  }
}

/** A platform item recorded (an eval candidate or judgement): its run moves on when its set is complete. */
export async function deliverRecorded(item: BatchItemRow): Promise<void> {
  if (!item.evalRunId) return;
  try {
    await progressEvalRun(item.evalRunId);
  } catch (err) {
    console.error(`[ai] eval run progress failed: ${err instanceof Error ? err.name : "error"}`);
  }
}
