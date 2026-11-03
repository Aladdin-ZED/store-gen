"use server";
/**
 * Settings → Danger zone (P2 SHELL; platform.md PLA-§22.11, §M.1, PD80; docs/STORE-SAAS.md §A.5.1, §B.7, §F.9). Every
 * body is `return storeAction(…)` (lint L9); the store is the signed request path's (D2).
 *
 *   requestStoreExportAction   store.export ↑   P8's requestStoreExport (allowed in read-only states); audit
 *                                              store.export_requested { jobId, stepUp }
 *   closeOwnStoreAction        store.close ↑    the typed handle, then T1's transitionStore(→ closed), which audits
 *                                              store.closed { from, stepUp } and tells the owners and admins
 *   reopenOwnStoreAction       store.close      within 30 days, back to the state it was closed from (T1's rule: active
 *                                              or restricted); no step-up: reopening restores, it never exposes data
 *   leaveStoreAction           store.read       T2's leaveStore (the last owner is refused: last_owner)
 *
 * ↑ = the tenant step-up ladder (core §B.7, PD80): TOTP when the member has it, else the password, fresh for 5 min;
 * the seam answers `step_up`, the sheet re-runs the call with the same operation id, and the id is spent only once
 * the action runs (`oncePerOp`), so a double submit answers `already_done`. Reopening takes `store.read` with the
 * `store.close` grant checked here, because the seam asks a step-up of every `store.close` call; it refuses "view as
 * store" and the platform's read-only switch itself (`guardReadKeyWrite`), like the seam does for a write key.
 */
import { revalidateStore } from "@/lib/admin-data/shell";
import { auditFrom, listStoreAudit } from "@/lib/audit";
import { AuthRefusal, FieldsError } from "@/lib/auth/errors";
import { requestStoreExport } from "@/lib/exports-store";
import { leaveStore } from "@/lib/tenancy/invites";
import { transitionStore } from "@/lib/tenancy/lifecycle";
import { requireStepUp, SeamError, storeAction } from "@/lib/tenancy/seam";
import type { ActionResult, StoreCtx, StoreStatus } from "@/lib/tenancy/types";
import { crossTrack, guardReadKeyWrite, oncePerOp } from "@/components/admin/shell/action-guards";
import { CloseStoreInput, handleTyped, parseInput, StoreExportInput } from "@/components/admin/shell/action-inputs";

export async function requestStoreExportAction(input: unknown): Promise<ActionResult<{ jobId: string }>> {
  return storeAction("store.export", async (ctx) => {
    const { opId } = parseInput(StoreExportInput, input ?? {});
    const stepUp = requireStepUp(ctx);
    await oncePerOp(ctx.user.id, opId);
    const r = await crossTrack(() => requestStoreExport(ctx.scope, { requestedAs: "member", requestedBy: ctx.user.id }));
    await auditFrom(ctx, "store.export_requested", { target: r.jobId, meta: { jobId: r.jobId, stepUp } });
    revalidateStore(ctx.store.handle, "/settings/danger");
    return r;
  });
}

export async function closeOwnStoreAction(input: unknown): Promise<ActionResult<null>> {
  return storeAction("store.close", async (ctx) => {
    const { confirm, opId } = parseInput(CloseStoreInput, input);
    if (!handleTyped(confirm, ctx.store.handle)) throw new FieldsError({ confirm: "shell.danger.close_typed_wrong" });
    const stepUp = requireStepUp(ctx);
    await oncePerOp(ctx.user.id, opId);
    await transitionStore(ctx, ctx.store.id, "closed", { reason: "owner_closed", stepUp });
    revalidateStore(ctx.store.handle, { path: "", type: "layout" });
    return null;
  });
}

/** The state the store was closed from: the newest close row of its own audit (an owner's or staff's), else null. */
async function closedFrom(ctx: StoreCtx): Promise<StoreStatus | null> {
  const rows = (await Promise.all(["store.closed", "platform.store.closed"].map((area) => listStoreAudit(ctx, { area, limit: 1 })))).flat();
  const last = rows.sort((a, b) => b.id - a.id)[0];
  const from = last?.meta?.from;
  return from === "active" || from === "restricted" ? from : null;
}

export async function reopenOwnStoreAction(): Promise<ActionResult<{ status: StoreStatus }>> {
  return storeAction("store.read", async (ctx) => {
    await guardReadKeyWrite(ctx, "reopenOwnStoreAction");
    if (!ctx.can("store.close")) throw new SeamError("forbidden");
    if (ctx.store.status !== "closed") throw new AuthRefusal("invalid", "error.invalid");
    // T1 checks the 30-day window and that this is the state the store was closed from
    const to = (await closedFrom(ctx)) ?? "active";
    await transitionStore(ctx, ctx.store.id, to, { reason: "owner_reopened" });
    revalidateStore(ctx.store.handle, { path: "", type: "layout" });
    return { status: to };
  });
}

export async function leaveStoreAction(): Promise<ActionResult<{ href: string }>> {
  return storeAction("store.read", async (ctx) => {
    await guardReadKeyWrite(ctx, "leaveStoreAction");
    await leaveStore(ctx);
    // the member's next screen is the store picker (or the one store left)
    return { href: "/app" };
  });
}
