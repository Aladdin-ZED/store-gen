import "server-only";
/**
 * The console's lifecycle write (platform.md PLA-§8.0 step 3, §8.1, §8.2; PL-08, PD44, PD54): the one function the
 * lifecycle sheet's actions call (`restrictStoreAction`, `suspendStoreAction`, `restoreStoreAction`,
 * `closeStoreAction`, `reopenStoreAction`, `scheduleDeletionAction`, `cancelDeletionAction`; step 7). The purge is
 * not a transition: it is a request of src/lib/platform/platform-requests.ts.
 *
 *   await runLifecycleAction(ctx, storeId, "restricted", { reason: "fake_orders", expectedFrom: "active" });
 *
 * Checks, in order, every one on the server (the sheet's checks are a convenience):
 *   1. the store as it is now; `expectedFrom` differs → `status_changed` (someone else changed it: the sheet reloads);
 *   2. the edge is a console action (a queue edge → `invalid` "use the queue"); the permission; ↑ where marked;
 *   3. the reason is one of the action's codes; `other` needs a note (≤ 500);
 *   4. the typed handle where PLA-§8.1 marks it, and inside the cooldown for every action (`cooldown_handle_required`);
 *   5. an open purge request blocks reopen and cancel-deletion (`purge_pending`).
 * Then exactly one `transitionStore` call (it audits, sends the one store notification, invalidates every cached view
 * of the store, marks health dirty and moves the pending media bytes). A suspension saves its notice choice first
 * (inert outside `suspended`); closing a pending store withdraws its open review rows; the console caches drop the
 * store.
 */
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { auditFrom } from "@/lib/audit";
import { AuthRefusal, FieldsError } from "@/lib/auth/errors";
import { db } from "@/lib/db/client";
import { signupReviews, stores } from "@/lib/db/schema";
import { systemCtx, systemScope } from "@/lib/jobs/scope";
import { getPlatformSetting } from "@/lib/settings";
import { invalidateStore } from "@/lib/tenancy/cache";
import { transitionStore } from "@/lib/tenancy/lifecycle";
import { whereStore } from "@/lib/tenancy/sql";
import type { PlatformCtx, StoreStatus, WriteScope } from "@/lib/tenancy/types";
import { cooldownState, isQueueEdge, lifecycleActionOf, reasonAllowed, requirementsOf, typedHandleMatches, type LifecycleAction } from "./lifecycle-rules";
import { invalidateLifecyclePreview, lifecycleStoreRow, openPurgeRequest } from "./lifecycle-preview";
import { recordPlatformError } from "./log";
import { invalidateQueueSnapshot } from "./queue-cache";
import { NOTE_MAX, optionalText } from "./queue-rules";
import { reasonNeedsNote } from "./reasons";
import { platformScope } from "./seam";

const STATUSES = ["pending", "active", "restricted", "suspended", "closed", "scheduled_deletion", "purged", "rejected"] as const;

const LifecycleInput = z.object({
  reason: z.string().min(1).max(40),
  note: optionalText(NOTE_MAX),
  showNote: z.boolean().optional(),
  typedHandle: z.string().max(60).optional(),
  expectedFrom: z.enum(STATUSES),
  /** suspend only: the neutral 503 instead of the 404 while suspended (D32) */
  suspendNotice: z.boolean().optional(),
});
export type LifecycleActionInput = z.input<typeof LifecycleInput>;

export interface LifecycleActionResult {
  storeId: string;
  action: LifecycleAction;
  from: StoreStatus;
  to: StoreStatus;
  /** review rows withdrawn by closing a pending store */
  withdrawn: number;
}

/** A store's review rows are platform bookkeeping: written through that store's system seam. */
const reviewScope = (storeId: string): WriteScope => systemScope(systemCtx("platform.lifecycle"), storeId);

/** Closing a pending store withdraws its open review rows (PLA-§8.1), so the queue never offers a closed store. */
async function withdrawOpenReviews(scope: WriteScope, by: string, now: Date): Promise<number> {
  const [res] = await db
    .update(signupReviews)
    .set({ status: "withdrawn", decidedBy: by, decidedAt: now, reasonCode: "store_closed", snoozeUntil: null })
    .where(whereStore(signupReviews, scope, inArray(signupReviews.status, ["pending", "needs_info", "snoozed"])));
  return res.affectedRows;
}

/**
 * The lifecycle write of PLA-§8.1 for `storeId` → `to` (see the header for the checks). Answers the edge taken;
 * refusals throw `AuthRefusal` / `FieldsError` / `LifecycleError` (the action wrapper maps each to its code).
 */
export async function runLifecycleAction(ctx: PlatformCtx, storeId: string, to: StoreStatus, input: unknown): Promise<LifecycleActionResult> {
  platformScope(ctx, storeId); // console.read, and a well-formed store id
  if (!(STATUSES as readonly string[]).includes(to)) throw new AuthRefusal("invalid", "console.lifecycle.not_an_edge");
  const v = LifecycleInput.parse(input);
  const store = await lifecycleStoreRow(storeId);
  if (!store || store.status === "purged") throw new AuthRefusal("not_found");

  // 1. stale from
  if (store.status !== v.expectedFrom) throw new AuthRefusal("status_changed", "console.lifecycle.status_changed");
  // 2. the edge, the permission, the step-up
  const action = lifecycleActionOf(store.status, to);
  if (!action || action === "purge") throw new AuthRefusal("invalid", isQueueEdge(store.status, to) ? "console.lifecycle.use_queue" : "console.lifecycle.not_an_edge");
  const req = requirementsOf(action);
  if (!ctx.can(req.permission)) throw new AuthRefusal("forbidden", "console.lifecycle.no_permission");
  if (req.stepUp && !ctx.stepUpFresh) throw new AuthRefusal("step_up");
  // 3. the reason and its note
  if (!reasonAllowed(action, v.reason)) throw new FieldsError({ reason: "console.lifecycle.reason_invalid" });
  if (reasonNeedsNote(v.reason) && !v.note) throw new FieldsError({ note: "console.lifecycle.note_required" });
  // 4. the typed handle: the action's own rule, and the cooldown for every action (PD54, server-side)
  const now = new Date();
  const cooldown = cooldownState(store.statusChangedAt, now, (await getPlatformSetting("platform")).lifecycle.cooldownMinutes);
  const typedOk = typedHandleMatches(v.typedHandle, store.handle);
  if (req.typedHandle && !typedOk) throw new FieldsError({ typedHandle: "console.lifecycle.typed_mismatch" });
  if (cooldown.inside && !typedOk) throw new AuthRefusal("cooldown_handle_required", "console.lifecycle.cooldown_handle_required");
  // 5. a waiting purge request
  if ((action === "reopen" || action === "cancel_deletion") && (await openPurgeRequest(platformScope(ctx, storeId)))) {
    throw new AuthRefusal("purge_pending", "console.lifecycle.purge_pending");
  }

  // the suspend notice is inert outside `suspended`, so it is saved first and the suspension's own audit row is the
  // record of the decision (the meta of transitionStore is fixed: CCR r1-p1-5 item 2 asks for an extra-meta option)
  if (to === "suspended" && v.suspendNotice !== undefined && v.suspendNotice !== store.suspendNotice) {
    await db.update(stores).set({ suspendNotice: v.suspendNotice }).where(and(eq(stores.id, storeId), eq(stores.status, store.status)));
  }

  await transitionStore(ctx, storeId, to, { reason: v.reason, ...(v.note ? { note: v.note } : {}), notify: { showNote: v.showNote === true } });

  // after the one transition: a follow-up never fails the action (it is logged)
  let withdrawn = 0;
  if (store.status === "pending" && to === "closed") {
    withdrawn = await withdrawOpenReviews(reviewScope(storeId), ctx.user.id, now).catch((err: unknown) => {
      recordPlatformError("lifecycle withdraw review", err, { storeId });
      return 0;
    });
  }
  invalidateLifecyclePreview(storeId);
  invalidateQueueSnapshot();
  return { storeId, action, from: store.status, to, withdrawn };
}

const SuspendNoticeInput = z.object({ storeId: z.string().regex(/^[0-9A-Z]{26}$/), suspendNotice: z.boolean() });

/**
 * `stores.lifecycle` (PLA-§8.1 `setSuspendNoticeAction`, D32): a suspended store's public answer, the neutral 503
 * notice (`true`) or the 404 (`false`), changed without a new transition. Only while the store is `suspended` (the
 * flag is inert in every other state; the suspension sheet sets it with the transition). One conditional UPDATE, the
 * store's caches dropped, audit `platform.store.suspend_notice { notice }`.
 */
export async function setSuspendNotice(ctx: PlatformCtx, input: unknown): Promise<{ changed: boolean }> {
  if (!ctx.can("stores.lifecycle")) throw new AuthRefusal("forbidden");
  const parsed = SuspendNoticeInput.safeParse(input);
  if (!parsed.success) throw new FieldsError({ suspendNotice: "console.lifecycle.not_an_edge" });
  const { storeId, suspendNotice } = parsed.data;
  platformScope(ctx, storeId);
  const store = await lifecycleStoreRow(storeId);
  if (!store || store.status === "purged") throw new AuthRefusal("not_found");
  if (store.status !== "suspended") throw new AuthRefusal("status_changed", "console.lifecycle.status_changed");
  if (store.suspendNotice === suspendNotice) return { changed: false };
  const [res] = await db.update(stores).set({ suspendNotice }).where(and(eq(stores.id, storeId), eq(stores.status, "suspended")));
  if (res.affectedRows !== 1) throw new AuthRefusal("status_changed", "console.lifecycle.status_changed");
  invalidateStore(storeId);
  invalidateLifecyclePreview(storeId);
  await auditFrom(ctx, "platform.store.suspend_notice", { storeId, target: storeId, meta: { notice: suspendNotice } });
  return { changed: true };
}
