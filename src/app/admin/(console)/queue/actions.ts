"use server";
/**
 * Approval queue actions of the console (P1 CONSOLE; platform.md PLA-§3.5, §3.7, §M.1). A platform action file: every
 * export is `return platformAction(permission, fn)` (lint L9), a tenant session is refused by the seam. Each write
 * takes the sheet's operation id (`opId`, PLA-§4.5: a repeat answers the first result) and ends with `refresh()`.
 *
 *   await approveReviewAction({ reviewId, note, opId });          // signups.decide
 *   await rejectReviewAction({ reviewId, reason, block: true });  // + users.manage ↑ when blocking (checked in queue.ts)
 *   await resolveRequestAction({ reviewId, outcome: "grant" });   // entitlements.override for plan / limit (queue.ts)
 *
 * A lost race answers `{ ok: true, data: { ok: false, error: "already_decided", by, at } }` (the sheet shows who won).
 */
import type { z } from "zod";
import { done, doneStore, opOf, withOp } from "@/lib/platform/op-dedupe";
import { approveBulk, approveReview, askInfo, rejectReview, reopenReview, resolveRequest, snoozeReview, type DecisionResult } from "@/lib/platform/queue";
import type { ApproveInput, AskInfoInput, BulkApproveInput, RejectInput, ReopenInput, ResolveInput, SnoozeInput } from "@/lib/platform/queue-rules";
import { platformAction } from "@/lib/platform/seam";
import type { ActionResult } from "@/lib/tenancy/types";

type Op = { opId?: string };

const storeOf = (r: DecisionResult): string | null => (r.ok ? r.storeId : null);

/** After one decision: the store's health row is dirty, the router refreshed. */
const decided = <T extends DecisionResult>(r: T): Promise<T> => doneStore(storeOf(r), r);

/** `signups.decide`: approve one signup or appeal row (a note for `hold` / `reject_candidate`). */
export async function approveReviewAction(input: z.input<typeof ApproveInput> & Op): Promise<ActionResult<DecisionResult>> {
  return platformAction("signups.decide", (ctx) => withOp(ctx, opOf(input), async () => decided(await approveReview(ctx, input))));
}

/** `signups.decide`: the fast lane's bulk approve (≤ 50 rows); each row is skipped with its reason when it no longer qualifies. */
export async function approveBulkAction(input: z.input<typeof BulkApproveInput> & Op): Promise<ActionResult<Awaited<ReturnType<typeof approveBulk>>>> {
  return platformAction("signups.decide", (ctx) => withOp(ctx, opOf(input), async () => done(await approveBulk(ctx, input))));
}

/** `signups.decide`: a question to the seller (≤ 500 characters); the row waits in `needs_info`. */
export async function askInfoAction(input: z.input<typeof AskInfoInput> & Op): Promise<ActionResult<DecisionResult>> {
  return platformAction("signups.decide", (ctx) => withOp(ctx, opOf(input), async () => decided(await askInfo(ctx, input))));
}

/** `signups.decide` (+ `users.manage` with a fresh step-up when `block`): reject with a reason code. */
export async function rejectReviewAction(input: z.input<typeof RejectInput> & Op): Promise<ActionResult<DecisionResult & { banned?: boolean }>> {
  return platformAction("signups.decide", (ctx) => withOp(ctx, opOf(input), async () => decided(await rejectReview(ctx, input))));
}

/** `signups.decide`: snooze a row until a preset time (Undo for 10 s re-opens it with `reopenReviewAction`). */
export async function snoozeReviewAction(input: z.input<typeof SnoozeInput> & Op): Promise<ActionResult<DecisionResult & { until?: string }>> {
  return platformAction("signups.decide", (ctx) => withOp(ctx, opOf(input), async () => decided(await snoozeReview(ctx, input))));
}

/** `signups.decide`: reopen an appeal (the rejected store goes back to `pending` for a new decision). */
export async function reopenReviewAction(input: z.input<typeof ReopenInput> & Op): Promise<ActionResult<DecisionResult>> {
  return platformAction("signups.decide", (ctx) => withOp(ctx, opOf(input), async () => decided(await reopenReview(ctx, input))));
}

/**
 * A store request (PLA-§3.7): grant or decline. The seam checks `signups.decide`; queue.ts adds the kind's own key
 * (`entitlements.override` for plan and limit requests, and for a limit or boost grant).
 */
export async function resolveRequestAction(input: z.input<typeof ResolveInput> & Op): Promise<ActionResult<DecisionResult>> {
  return platformAction("signups.decide", (ctx) => withOp(ctx, opOf(input), async () => decided(await resolveRequest(ctx, input))));
}
