"use server";
/**
 * Store profile actions of the console (P1 CONSOLE; platform.md PLA-§7, §8, §9.3-§9.4, §10, §M.1, PD54, PD56; docs/STORE-SAAS.md
 * §B.8; P0b: CCR P2-8). A platform action file (`scripts/qa/tenancy-check.ts` reads every "use server" file under
 * src/app/admin/(console)/ as one, CCR X-1): every export returns `platformAction(`, so a tenant session is refused by
 * the seam, and P1 adds each action's tenant-session refusal case to its tenancy-cases/platform.ts.
 *
 *   await suspendStoreAction({ storeId, reason, typedHandle, expectedFrom: "active", suspendNotice, opId });   // ↑
 *   await lifecyclePreviewAction({ storeId, to: "suspended" });                                                 // read
 *   await revealOrderPiiAction({ storeId, orderId, reason });                                                    // ↑, 60 s
 *   await startImpersonationAction({ storeId, reason: "ticket", ticketRef, minutes: 30 });                      // → { url }
 *   await addImpersonationNoteAction({ storeId, text });       // the impersonation ribbon's Note (P2's ImpersonationRibbon)
 *
 * Every action names its store (`storeId`, staff act across stores) and reaches it through src/lib/platform (the
 * platform scope inside). Every write takes the sheet's `opId` (PLA-§4.5), then marks the store's health dirty and
 * refreshes the router. The lifecycle rules (edge, permission, ↑, reason, typed handle, cooldown) are checked on the
 * server by `runLifecycleAction`; `addImpersonationNoteAction`'s signature is frozen (src/lib/contracts/r1-p0b-platform.ts).
 */
import { redirect } from "next/navigation";
import { AuthRefusal, FieldsError } from "@/lib/auth/errors";
import { replay } from "@/lib/jobs/outbox";
import { retryStoreRenders } from "@/lib/platform/domain-move";
import { requestPlatformExport } from "@/lib/platform/exports";
import { markHealthDirty } from "@/lib/platform/health-snapshot";
import { activeImpersonation, endImpersonation, startImpersonation, type ImpersonationReason } from "@/lib/platform/impersonation";
import { runLifecycleAction, setSuspendNotice, type LifecycleActionInput, type LifecycleActionResult } from "@/lib/platform/lifecycle-actions";
import { closedFromOf, lifecyclePreview, type LifecyclePreview } from "@/lib/platform/lifecycle-preview";
import { addNote, deleteNote, editNote, pinNote } from "@/lib/platform/notes";
import { done, doneStore, opOf, refreshView, withOp } from "@/lib/platform/op-dedupe";
import { isNotImplemented } from "@/lib/platform/panel";
import { requestPurge } from "@/lib/platform/platform-requests";
import { assignPlan, clearEntitlement, setEntitlement, type SetEntitlementInput } from "@/lib/platform/plans";
import { revealOrderPii, type RevealedPii } from "@/lib/platform/profile/orders";
import { stripPreview } from "@/lib/platform/profile/overview-strips";
import { platformAction, platformScope } from "@/lib/platform/seam";
import { SeamError } from "@/lib/tenancy/seam";
import type { ActionResult, StoreStatus } from "@/lib/tenancy/types";

type Op = { opId?: string };
type StoreRef = { storeId: string };
type Lifecycle = StoreRef & LifecycleActionInput & Op;

const storeIdOf = (input: unknown): string => {
  const id = input && typeof input === "object" ? (input as { storeId?: unknown }).storeId : undefined;
  if (typeof id !== "string" || !/^[0-9A-Z]{26}$/.test(id)) throw new SeamError("not_found");
  return id;
};

/* ------------------------------------------------------------------ */
/* Lifecycle (PLA-§8.1)                                                */
/* ------------------------------------------------------------------ */

/** `stores.lifecycle`: active → restricted. */
export async function restrictStoreAction(input: Lifecycle): Promise<ActionResult<LifecycleActionResult>> {
  return platformAction("stores.lifecycle", (ctx) => withOp(ctx, opOf(input), async () => doneStore(storeIdOf(input), await runLifecycleAction(ctx, storeIdOf(input), "restricted", input))));
}

/** `stores.lifecycle` ↑, typed handle: active / restricted → suspended (+ `suspendNotice`: the neutral 503 instead of the 404). */
export async function suspendStoreAction(input: Lifecycle): Promise<ActionResult<LifecycleActionResult>> {
  return platformAction("stores.lifecycle", (ctx) => withOp(ctx, opOf(input), async () => doneStore(storeIdOf(input), await runLifecycleAction(ctx, storeIdOf(input), "suspended", input))), { stepUp: true });
}

/** `stores.lifecycle`: restricted → active; suspended → active or restricted (`to`). */
export async function restoreStoreAction(input: Lifecycle & { to: "active" | "restricted" }): Promise<ActionResult<LifecycleActionResult>> {
  return platformAction("stores.lifecycle", (ctx) =>
    withOp(ctx, opOf(input), async () => {
      const to: StoreStatus = input?.to === "restricted" ? "restricted" : "active";
      return doneStore(storeIdOf(input), await runLifecycleAction(ctx, storeIdOf(input), to, input));
    }),
  );
}

/** `stores.close` ↑, typed handle: active / restricted / suspended / pending → closed (a pending store's review is withdrawn). */
export async function closeStoreAction(input: Lifecycle): Promise<ActionResult<LifecycleActionResult>> {
  return platformAction("stores.close", (ctx) => withOp(ctx, opOf(input), async () => doneStore(storeIdOf(input), await runLifecycleAction(ctx, storeIdOf(input), "closed", input))));
}

/** `stores.close`: closed → the state it was closed from (≤ 30 days). */
export async function reopenStoreAction(input: Lifecycle): Promise<ActionResult<LifecycleActionResult>> {
  return platformAction("stores.close", (ctx) =>
    withOp(ctx, opOf(input), async () => {
      const storeId = storeIdOf(input);
      const from = (await closedFromOf(platformScope(ctx, storeId))) ?? "active";
      return doneStore(storeId, await runLifecycleAction(ctx, storeId, from, input));
    }),
  );
}

/** `stores.close` ↑, typed handle: closed → scheduled_deletion. */
export async function scheduleDeletionAction(input: Lifecycle): Promise<ActionResult<LifecycleActionResult>> {
  return platformAction("stores.close", (ctx) => withOp(ctx, opOf(input), async () => doneStore(storeIdOf(input), await runLifecycleAction(ctx, storeIdOf(input), "scheduled_deletion", input))));
}

/** `stores.purge` ↑ (super_admin): scheduled_deletion → closed. */
export async function cancelDeletionAction(input: Lifecycle): Promise<ActionResult<LifecycleActionResult>> {
  return platformAction("stores.purge", (ctx) => withOp(ctx, opOf(input), async () => doneStore(storeIdOf(input), await runLifecycleAction(ctx, storeIdOf(input), "closed", input))));
}

/** `stores.purge` ↑, typed handle + "purge": a purge request (four-eyes or the 24 h delay, platform_requests). */
export async function requestPurgeAction(input: StoreRef & { mode: "four_eyes" | "delayed"; reason: string; note?: string; typedHandle: string; typedWord: string } & Op): Promise<ActionResult<Awaited<ReturnType<typeof requestPurge>>>> {
  return platformAction("stores.purge", (ctx) => withOp(ctx, opOf(input), async () => doneStore(storeIdOf(input), await requestPurge(ctx, input))));
}

/** `stores.lifecycle`: a suspended store's public answer, the neutral 503 notice or the 404 (D32). */
export async function setSuspendNoticeAction(input: StoreRef & { suspendNotice: boolean } & Op): Promise<ActionResult<{ changed: boolean }>> {
  return platformAction("stores.lifecycle", (ctx) => withOp(ctx, opOf(input), async () => doneStore(storeIdOf(input), await setSuspendNotice(ctx, input))));
}

/** `console.read` (PD54): what a lifecycle change would do, read before the sheet arms; writes nothing. */
export async function lifecyclePreviewAction(input: StoreRef & { to: StoreStatus; reason?: string; suspendNotice?: boolean }): Promise<ActionResult<LifecyclePreview>> {
  return platformAction("console.read", (ctx) => lifecyclePreview(ctx, storeIdOf(input), input?.to, { reason: input?.reason, suspendNotice: input?.suspendNotice }));
}

/** `console.read`: the Overview strip's "Mark dirty" (the next health run recomputes the store first). */
export async function markHealthDirtyAction(input: StoreRef): Promise<ActionResult<{ marked: true }>> {
  return platformAction("console.read", async (ctx) => {
    const storeId = storeIdOf(input);
    platformScope(ctx, storeId);
    await markHealthDirty(storeId);
    return done({ marked: true as const });
  });
}

/** `console.read` (PD16): the pages strip's Preview, a 10-minute staff link to one page (a sandboxed iframe only). */
export async function pagePreviewAction(input: StoreRef & { pageId: string }): Promise<ActionResult<{ url: string; expiresAt: string }>> {
  return platformAction("console.read", (ctx) => stripPreview(ctx, storeIdOf(input), input?.pageId));
}

/* ------------------------------------------------------------------ */
/* Orders: the per-order reveal (PLA-§7.4)                             */
/* ------------------------------------------------------------------ */

/** `pii.reveal` ↑: one order's customer details for 60 s; P4's `recordPlatformReveal` writes the audit; 20 per day. */
export async function revealOrderPiiAction(input: StoreRef & { orderId: string; reason: string; note?: string }): Promise<ActionResult<RevealedPii>> {
  return platformAction("pii.reveal", (ctx) => revealOrderPii(ctx, input), { stepUp: true });
}

/* ------------------------------------------------------------------ */
/* Plan and entitlements (PLA-§9.3, §9.4)                              */
/* ------------------------------------------------------------------ */

/** `entitlements.override`: the store's plan (audit `platform.plan.changed`, the store hears `plan.changed`). */
export async function assignPlanAction(input: StoreRef & { planId: string; note?: string } & Op): Promise<ActionResult<{ changed: boolean; from: string; to: string }>> {
  return platformAction("entitlements.override", (ctx) => withOp(ctx, opOf(input), async () => doneStore(storeIdOf(input), await assignPlan(ctx, { storeId: storeIdOf(input), planId: input.planId, note: input.note ?? null }))));
}

/** `entitlements.override`: an override or a boost (expiry required, ≤ 90 days) with a reason. */
export async function setEntitlementAction(input: SetEntitlementInput & Op): Promise<ActionResult<{ saved: true }>> {
  return platformAction("entitlements.override", (ctx) =>
    withOp(ctx, opOf(input), async () => {
      await setEntitlement(ctx, input);
      return doneStore(storeIdOf(input), { saved: true as const });
    }),
  );
}

/** `entitlements.override`: removes an override or a boost. */
export async function clearEntitlementAction(input: StoreRef & { key: string; source: "override" | "boost"; reason?: string } & Op): Promise<ActionResult<{ cleared: boolean }>> {
  return platformAction("entitlements.override", (ctx) => withOp(ctx, opOf(input), async () => doneStore(storeIdOf(input), await clearEntitlement(ctx, { storeId: storeIdOf(input), key: input.key, source: input.source, reason: input.reason }))));
}

/* ------------------------------------------------------------------ */
/* Export (PLA-§7.14, PL-09)                                           */
/* ------------------------------------------------------------------ */

/** `stores.close` ↑ (super_admin): P8's export job of the store; the owners are notified. */
export async function requestPlatformExportAction(input: StoreRef & { reason: string; note?: string } & Op): Promise<ActionResult<{ jobId: string }>> {
  return platformAction(
    "stores.close",
    (ctx) =>
      withOp(ctx, opOf(input), async () => {
        try {
          return done(await requestPlatformExport(ctx, input));
        } catch (err) {
          if (isNotImplemented(err)) throw new AuthRefusal("unavailable", "console.action.unavailable");
          throw err;
        }
      }),
    { stepUp: true },
  );
}

/* ------------------------------------------------------------------ */
/* View as store (PLA-§10)                                             */
/* ------------------------------------------------------------------ */

/**
 * `stores.impersonate` (PLA-§10.1, PD45): a read-only view of the store; answers the `/app/<h>` URL to open. Refusals
 * carry the PD45 copy: `impersonation_member` (console.impersonation.member), `impersonation_state`
 * (console.impersonation.state); a support member without `ticketRef` is refused on the field.
 */
export async function startImpersonationAction(input: StoreRef & { reason: ImpersonationReason; note?: string; ticketRef?: string; minutes?: 15 | 30 | 60 }): Promise<ActionResult<{ url: string }>> {
  return platformAction("stores.impersonate", async (ctx) => {
    const started = await startImpersonation(ctx, { storeId: storeIdOf(input), reason: input.reason, note: input.note, ticketRef: input.ticketRef, minutes: input.minutes });
    refreshView();
    return started;
  });
}

/** `stores.impersonate` (PLA-§10.3): ends this session's view-as and returns to the store's Activity tab. */
export async function endImpersonationAction(): Promise<ActionResult<never>> {
  return platformAction("stores.impersonate", async (ctx) => {
    const view = await activeImpersonation(ctx);
    await endImpersonation(ctx, "ended");
    redirect(view ? `/admin/stores/${view.storeId}/activity` : "/admin/stores");
  });
}

/**
 * stores.notes: `text` ≤ 300 chars, written by the staff member viewing that very store (another store, or no view-as
 * at all → `not_found`). One `platform_notes` row of kind `note` for the store (`author_id` = the staff member, never a
 * tenant row) through src/lib/platform/notes.ts `addNote`, audited `platform.note.added`; a tenant session is refused
 * by the seam before the body.
 */
export async function addImpersonationNoteAction(input: { storeId: string; text: string }): Promise<ActionResult<{ id: string }>> {
  return platformAction("stores.notes", async (ctx) => {
    const view = await activeImpersonation(ctx);
    if (!view || view.storeId !== input?.storeId) throw new SeamError("not_found");
    const text = typeof input?.text === "string" ? input.text.trim() : "";
    if (!text || text.length > 300) throw new FieldsError({ text: "console.notes.invalid" });
    return addNote(ctx, { storeId: view.storeId, body: text, kind: "note" });
  });
}

/* ------------------------------------------------------------------ */
/* Notes (PLA-§7.12)                                                   */
/* ------------------------------------------------------------------ */

/** `stores.notes`: a note on the store (≤ 4,000 characters, ≤ 20 mentions; kind note / decision / warning). */
export async function addNoteAction(input: StoreRef & { body: string; kind?: "note" | "decision" | "warning"; pinned?: boolean; mentions?: string[] } & Op): Promise<ActionResult<{ id: string }>> {
  return platformAction("stores.notes", (ctx) => withOp(ctx, opOf(input), async () => done(await addNote(ctx, { ...input, storeId: storeIdOf(input), userId: undefined }))));
}

/** `stores.notes`: the author's own note within 24 h. */
export async function editNoteAction(input: { id: string; body: string; mentions?: string[] } & Op): Promise<ActionResult<{ saved: true }>> {
  return platformAction("stores.notes", (ctx) =>
    withOp(ctx, opOf(input), async () => {
      await editNote(ctx, input);
      return done({ saved: true as const });
    }),
  );
}

/** `stores.notes`: the author's own note within 24 h (a soft delete). */
export async function deleteNoteAction(input: { id: string } & Op): Promise<ActionResult<{ deleted: true }>> {
  return platformAction("stores.notes", (ctx) =>
    withOp(ctx, opOf(input), async () => {
      await deleteNote(ctx, input);
      return done({ deleted: true as const });
    }),
  );
}

/** `stores.notes`: pin or unpin (Undo for 10 s sends the opposite). */
export async function pinNoteAction(input: { id: string; pinned: boolean }): Promise<ActionResult<{ changed: boolean }>> {
  return platformAction("stores.notes", async (ctx) => done(await pinNote(ctx, input)));
}

/* ------------------------------------------------------------------ */
/* Machinery: the outbox and the renders (Overview strips 4 and 6)     */
/* ------------------------------------------------------------------ */

/** `stores.lifecycle`: a dead outbox item of the store sent again (P8's `replay`, which audits it). */
export async function replayOutboxAction(input: StoreRef & { id: string } & Op): Promise<ActionResult<{ replayed: true }>> {
  return platformAction("stores.lifecycle", (ctx) =>
    withOp(ctx, opOf(input), async () => {
      const storeId = storeIdOf(input);
      platformScope(ctx, storeId);
      if (typeof input.id !== "string" || !/^[0-9A-Za-z_-]{1,64}$/.test(input.id)) throw new SeamError("not_found");
      try {
        await replay(ctx, input.id);
      } catch (err) {
        if (isNotImplemented(err)) throw new AuthRefusal("unavailable", "console.action.unavailable");
        throw err;
      }
      return doneStore(storeId, { replayed: true as const });
    }),
  );
}

/** `domains.manage`: every live page of the store rendered again (`unavailable` until P8's queue). */
export async function retryRendersAction(input: StoreRef & Op): Promise<ActionResult<{ enqueued: number } | { unavailable: true }>> {
  return platformAction("domains.manage", (ctx) => withOp(ctx, opOf(input), async () => doneStore(storeIdOf(input), await retryStoreRenders(ctx, storeIdOf(input)))));
}
