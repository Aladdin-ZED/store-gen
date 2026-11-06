"use server";
/**
 * The Store Health ring's actions (P2 SHELL; platform.md PLA-§22.16, §M.1, §L; docs/STORE-SAAS.md §I.7, PD67). Every
 * body is `return storeAction(…)` (lint L9); the store is the signed request path's (D2).
 *
 *   snoozeHealthIssueAction({ issueId })     health.snooze   P1's snoozeHealthIssue(ctx, id, 7) (its audit
 *                                                            store.health.snoozed, the health cache dropped)
 *   unsnoozeHealthIssueAction({ issueId })   health.snooze   P1's unsnoozeHealthIssue (P0b CCR P2-7: the issue list's
 *                                                            "n snoozed" with Unsnooze)
 *   recomputeHealthAction()                  store.read      "Recompute now": P1's requestHealthRecompute marks the
 *                                                            store dirty, the job computes it; s:<sid>:health:recompute
 *                                                            6 / h for the whole store
 *
 * `recomputeHealthAction` writes under a read key, so it refuses "view as store" itself (audited) before P1's
 * requestHealthRecompute charges the bucket: a support view leaves the store's rows as they were. The bucket is
 * counted once, inside P1's function (R1 P1 merge, CCR r1-p1-4 item 2).
 */
import { revalidateStore } from "@/lib/admin-data/shell";
import { requestHealthRecompute, snoozeHealthIssue, unsnoozeHealthIssue } from "@/lib/platform/health-snapshot";
import { storeAction } from "@/lib/tenancy/seam";
import type { ActionResult } from "@/lib/tenancy/types";
import { crossTrack, guardReadKeyWrite } from "@/components/admin/shell/action-guards";
import { parseInput, SNOOZE_DAYS, SnoozeIssueInput } from "@/components/admin/shell/action-inputs";


export async function snoozeHealthIssueAction(input: unknown): Promise<ActionResult<null>> {
  return storeAction("health.snooze", async (ctx) => {
    const { issueId } = parseInput(SnoozeIssueInput, input);
    await crossTrack(() => snoozeHealthIssue(ctx, issueId, SNOOZE_DAYS));
    revalidateStore(ctx.store.handle, "");
    return null;
  });
}

export async function unsnoozeHealthIssueAction(input: unknown): Promise<ActionResult<null>> {
  return storeAction("health.snooze", async (ctx) => {
    const { issueId } = parseInput(SnoozeIssueInput, input);
    await crossTrack(() => unsnoozeHealthIssue(ctx, issueId));
    revalidateStore(ctx.store.handle, "");
    return null;
  });
}

export async function recomputeHealthAction(): Promise<ActionResult<{ queuedAt: string }>> {
  return storeAction("store.read", async (ctx) => {
    await guardReadKeyWrite(ctx, "recomputeHealthAction");
    // the seam's `rate` option would count a refused support view too: requestHealthRecompute charges the 6 / h bucket
    return requestHealthRecompute(ctx);
  });
}
