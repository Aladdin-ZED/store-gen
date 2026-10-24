import "server-only";
/**
 * "View as store" (docs/STORE-SAAS.md §B.8, R-D14, PL-10): read-only impersonation by staff. Start refuses a store
 * the staff member is an active member of (`impersonation_member`) and `scheduled_deletion` / `purged` stores
 * (`impersonation_state`), ends an active impersonation of the same session first, inserts `impersonation_sessions`,
 * sets `sessions.impersonation_id` on the staff member's own session, notifies the store and audits
 * `platform.impersonation.started`. While active, `requireStoreMember` answers the synthetic viewer membership with
 * `scope.kind = "impersonation"` (D70): every write and sensitive key is refused.
 *
 * Signatures frozen at C0a; T2 implements the bodies (§K.1). The info types live in src/lib/tenancy/types.ts.
 */
import type { ImpersonationReason, PlatformCtx } from "@/lib/tenancy/types";

export type { ImpersonationInfo, ImpersonationReason } from "@/lib/tenancy/types";

/** `stores.impersonate`; support must give `ticketRef` (≤ 60 chars). Default 30 minutes, at most 60, never extended silently. */
export async function startImpersonation(
  ctx: PlatformCtx,
  input: { storeId: string; reason: ImpersonationReason; note?: string; ticketRef?: string; minutes?: 15 | 30 | 60 },
): Promise<{ url: string }> {
  void ctx;
  void input;
  throw new Error("not implemented: T2 (startImpersonation)");
}

export async function endImpersonation(ctx: PlatformCtx | { sessionId: string }, why: "ended" | "expired" | "revoked"): Promise<void> {
  void ctx;
  void why;
  throw new Error("not implemented: T2 (endImpersonation)");
}
