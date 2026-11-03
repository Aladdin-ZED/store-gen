import "server-only";
/**
 * The guards P2's tenant server actions share (P2 SHELL; platform.md PLA-§M.1, §10.2, §22.8; docs/STORE-SAAS.md §B.7,
 * §B.8, §E.2, build note item 14). Each action body stays `return storeAction(…)` / `return userAction(…)` (lint L9);
 * these run inside it:
 *
 *   return storeAction("store.read", async (ctx) => {
 *     await guardReadKeyWrite(ctx, "submitForReviewAction");   // what the seam does for a write key
 *     ownerOnly(ctx);
 *     return crossTrack(() => submitForReview(ctx, input));     // P1's stub answers `unavailable`, never a 500
 *   });
 *
 * - `guardReadKeyWrite`: the seam refuses (and audits) every write key under impersonation and while the platform's
 *   read-only switch is on; an action that writes under a read key (`store.read`, `pages.read`) refuses here the same
 *   way (`platform.impersonation.write_refused`, one row per call; `read_only` with its sentence, core §H.8), before
 *   anything else runs, a rate bucket included.
 * - `crossTrack`: a cross-track write still a P0 / P0b stub (`not implemented: P<n> …`) answers `unavailable` with
 *   `error.unavailable` (build note item 14: unavailable, never a made-up success).
 * - `ownerOnly`: the review and onboarding writes are the owner's (PLA-§22.2, §22.7): another role reaches the body
 *   (`store.read`) and is answered `owner_only` with its sentence, not a bare `forbidden`.
 * - `oncePerOp`: a step-up action's re-run carries the operation id of the refused call; the id is spent only once
 *   the action really runs (`p:op:<userId>.<opId>`, 10 min, PLA-§L), so a double submit answers `already_done`.
 * - `brandGuard`: `checkBrandTerms` once per brand field (PD70); an exact match writes nothing, audits
 *   `store.brand_term.refused { field }` (never the term) and answers `brand_protected`.
 */
import { audit, auditFrom } from "@/lib/audit";
import { AuthRefusal } from "@/lib/auth/errors";
import { checkBrandTerms, type BrandField } from "@/lib/platform/brand-check";
import { platformBucket, rateLimit } from "@/lib/security/rate-limit";
import { PLATFORM_READ_ONLY, platformReadOnly, SeamError } from "@/lib/tenancy/seam";
import type { StoreCtx } from "@/lib/tenancy/types";

/** Is this request a staff member's "view as store" (D70)? */
export const isImpersonating = (ctx: Pick<StoreCtx, "impersonation" | "scope" | "membership">): boolean =>
  !!ctx.impersonation || ctx.scope.kind === "impersonation" || ctx.membership.synthetic === "impersonation";

/**
 * A write under a read key, refused where the seam refuses a write key: under "view as store" the refusal is audited
 * (PLA-§10.2) and answers `impersonation_read_only`; with `platform_read_only` on it answers `read_only` (core §H.8:
 * every `storeAction` write). Else nothing.
 */
export async function guardReadKeyWrite(ctx: StoreCtx, action: string): Promise<void> {
  if (isImpersonating(ctx)) {
    await auditFrom(ctx, "platform.impersonation.write_refused", { target: action.slice(0, 191), meta: { action, via: "action" } });
    throw new SeamError("impersonation_read_only");
  }
  if (await platformReadOnly()) throw new SeamError("read_only", PLATFORM_READ_ONLY);
}

/**
 * The account actions' twin: a staff session that is viewing a store accepts no terms and deletes no account on the
 * way (§B.8, PLA-§22.5, §22.15). The row names no store (a user action has none).
 */
export async function refuseUserImpersonation(session: { impersonationId: string | null }, user: { id: string }, action: string, ip: string | null): Promise<void> {
  if (!session.impersonationId) return;
  await audit("platform.impersonation.write_refused", {
    userId: user.id,
    target: action.slice(0, 191),
    meta: { action, via: "user-action" },
    ip,
    scope: { storeId: null, actorKind: "impersonation", impersonatorId: user.id },
  });
  throw new SeamError("impersonation_read_only");
}

/** A P0 / P0b stub's refusal: `not implemented: P<n> <name>` (the same test as dashboard.ts's `isNotImplemented`). */
const isStub = (err: unknown): boolean => err instanceof Error && err.message.startsWith("not implemented:");

/** A cross-track call: its P0 / P0b stub answers `unavailable` (with its sentence), any other error goes on. */
export async function crossTrack<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (isStub(err)) throw new AuthRefusal("unavailable", "error.unavailable");
    throw err;
  }
}

/** The owner's own write (the synthetic "view as store" member is never one). */
export function ownerOnly(ctx: Pick<StoreCtx, "membership">): void {
  if (ctx.membership.role !== "owner" || ctx.membership.synthetic) throw new AuthRefusal("owner_only", "error.owner_only");
}

/** Spends the operation id of a step-up action once (10 min); without an id nothing is counted. */
export async function oncePerOp(userId: string, opId: string | undefined): Promise<void> {
  if (!opId) return;
  const r = await rateLimit(platformBucket("op", `${userId}.${opId}`), 1, 600);
  if (!r.ok) throw new AuthRefusal("already_done", "error.already_done");
}

/**
 * The brand check of the fields being written (blank ones skipped), in order. An exact match is refused before any
 * write; answers whether any field was a near match (the store is then flagged for staff by P1's health rule).
 */
export async function brandGuard(ctx: StoreCtx, fields: readonly (readonly [BrandField, string | null | undefined])[]): Promise<{ near: boolean }> {
  let near = false;
  for (const [field, value] of fields) {
    if (!value) continue;
    const verdict = await checkBrandTerms(field, value);
    if (verdict === "exact") {
      // D76: the field only, never the matched term (the seller's Activity shows this row)
      await auditFrom(ctx, "store.brand_term.refused", { target: field, meta: { field } });
      throw new AuthRefusal("brand_protected", "error.brand_protected");
    }
    if (verdict === "near") near = true;
  }
  return { near };
}
