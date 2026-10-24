import "server-only";
/**
 * R1.0 transitional bridge (docs/STORE-SAAS.md §K.1 T4): today's single-tenant /admin panel and builder are store #1's
 * dashboard, the store the 0004 conversion makes from the legacy rows (§D.8 S1), until T4 moves them under
 * /app/<handle> (§I.1). They reach the scoped repositories through the real seam with store #1's handle, so the
 * session, the active membership, the store role matrix and the store state decide exactly as on /app/<handle>;
 * nothing here mints or casts a scope. Every entry keeps the panel's admin gate (`assertAdminAccess`) first, as
 * requireUser and adminGuard do.
 *
 *   const ctx = await legacyStoreCtx({ permission: "orders.read" });                   // panel pages and layouts
 *   return adminAction(null, async () => { const ctx = await legacyReadCtx("orders.read"); … });    // read actions
 *   return adminAction(null, async () => { const ctx = await legacyWriteCtx("orders.write"); … });  // write actions
 *   const g = await legacyGuard(req, "media.write"); if (!g.ok) return g.response;      // route handlers (legacyReadGuard: reads)
 *
 * Deleted with the panel's move; new code calls requireStoreMember / storeAction / storeGuard directly.
 */
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { assertAdminAccess } from "@/lib/auth";
import { AuthError } from "@/lib/auth/errors";
import type { StorePermission } from "@/lib/auth/permissions";
import { EntitlementError } from "@/lib/tenancy/entitlements";
import { getStoreById } from "@/lib/tenancy/public";
import { SeamError, guardResponse, requireStoreMember, storeGuard, type StoreGuard } from "@/lib/tenancy/seam";
import type { StoreCtx, WriteCtx, WritePermission } from "@/lib/tenancy/types";
import { ActionError } from "./action";

/** Store #1 (§D.8 S1): the store of the legacy panel. */
export const LEGACY_STORE_ID = "00000000000000000000000001";

const UNAVAILABLE = "This store isn't available to your account.";

/** What a refused read or write tells the panel (adminAction shows ActionError and AuthError messages). */
const REFUSALS: Record<string, string> = {
  read_only: "This store is read-only right now: nothing can be changed.",
  impersonation_read_only: "This is a read-only view of the store.",
  feature_off: "This isn't included in the store's plan.",
  step_up: "Confirm it's you, then try again.",
};

/** The admin gate (an unknown-URL 404 when it fails), then store #1's handle. */
async function legacyHandle(): Promise<string | null> {
  await assertAdminAccess();
  return (await getStoreById(LEGACY_STORE_ID))?.handle ?? null;
}

/** A seam refusal as adminAction answers it: role → AuthError (its "role doesn't allow" text), the rest → a message. */
function refusal(code: string): Error {
  if (code === "unauthenticated" || code === "mfa_required" || code === "forbidden") return new AuthError(code);
  return new ActionError(REFUSALS[code] ?? UNAVAILABLE);
}

/**
 * The store #1 ctx of a panel page, layout or read-only route. Pages (no throwOnFail): signed out → sign-in, any
 * refusal → the neutral 404 (requireStoreMember's rules). With throwOnFail: AuthError, SeamError or EntitlementError.
 */
export async function legacyStoreCtx(opts: { permission?: StorePermission | readonly StorePermission[]; throwOnFail?: boolean } = {}): Promise<StoreCtx> {
  const handle = await legacyHandle();
  if (!handle) {
    if (opts.throwOnFail) throw new SeamError("not_found");
    notFound();
  }
  return requireStoreMember({ handle, permission: opts.permission, throwOnFail: opts.throwOnFail });
}

/** The store #1 ctx of a panel or builder action that only reads. Throws AuthError (signed out, role) or ActionError. */
export async function legacyReadCtx(permission?: StorePermission | readonly StorePermission[]): Promise<StoreCtx> {
  try {
    return await legacyStoreCtx({ permission, throwOnFail: true });
  } catch (err) {
    if (err instanceof SeamError) throw refusal(err.code);
    if (err instanceof EntitlementError) throw refusal("feature_off");
    throw err;
  }
}

/**
 * The store #1 write ctx of a panel or builder action, through `storeGuard` (the seam's one WriteCtx narrowing for an
 * explicit handle) over the action's own request headers, so the same-origin check runs on the browser's Origin /
 * Sec-Fetch-Site. Throws AuthError (signed out, role) or ActionError (another refusal) for adminAction to answer.
 */
export async function legacyWriteCtx(permission: WritePermission | readonly WritePermission[]): Promise<WriteCtx> {
  const handle = await legacyHandle();
  if (!handle) throw new ActionError(UNAVAILABLE);
  const req = new Request("http://legacy-panel.invalid/", { method: "POST", headers: new Headers(await headers()) });
  const guard = await storeGuard(req, handle, permission);
  if (guard.ok) return guard.ctx;
  const body = (await guard.response.json().catch(() => null)) as { error?: unknown } | null;
  throw refusal(typeof body?.error === "string" ? body.error : "not_found");
}

/** `storeGuard` with write keys for a legacy route handler under /admin or /api/admin (store #1). */
export async function legacyGuard(req: Request, permission: WritePermission | readonly WritePermission[]): Promise<StoreGuard<WriteCtx>> {
  const handle = await legacyHandle();
  if (!handle) return { ok: false, response: guardResponse("not_found", 404) };
  return storeGuard(req, handle, permission);
}

/** `storeGuard` with read keys for a legacy route handler (store #1). */
export async function legacyReadGuard(req: Request, permission: StorePermission | readonly StorePermission[]): Promise<StoreGuard> {
  const handle = await legacyHandle();
  if (!handle) return { ok: false, response: guardResponse("not_found", 404) };
  return storeGuard(req, handle, permission);
}
