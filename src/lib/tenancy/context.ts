import "server-only";
/**
 * Request identity for tests (docs/STORE-SAAS.md §E.4). The two-store attack suite (`test:tenancy`, §J.2) calls
 * every exported action and repository as another store's member without HTTP:
 *
 *   await runAsIdentity({ userId: memberOfB, path: `/app/${storeA.handle}/orders` }, () => updateOrderAction(input));
 *
 * `requireStoreMember`, `requirePlatform` (and from T2 `requireUser` / `getRequestContext`) read the identity before
 * falling back to cookies() / headers(). Honoured only when SG_TEST_CONTEXT=1 outside production; otherwise
 * `runAsIdentity` throws and `getRequestIdentity` answers null, so a stray call can never stand in for a request.
 * Jobs never use it: they get a SystemCtx (src/lib/jobs/scope.ts).
 *
 * C0a's minimal working body; T2 owns the file (§K.1).
 */
import { AsyncLocalStorage } from "node:async_hooks";

export interface RequestIdentity {
  /** a raw session token (as the cookie would carry it), or */
  sessionToken?: string;
  /** a user id: a session is assumed (MFA passed), no sessions row is read */
  userId?: string;
  /** path + query of the simulated request; a store action reads its store from it (D2) */
  path: string;
  /** request headers (host, origin, user-agent…); without them the seam skips the host-class check */
  headers?: HeadersInit;
}

declare global {
  var __sgIdentity: AsyncLocalStorage<RequestIdentity> | undefined;
}

const storage = () => (globalThis.__sgIdentity ??= new AsyncLocalStorage<RequestIdentity>());

/** SG_TEST_CONTEXT=1 and NODE_ENV !== "production". */
export function identityContextEnabled(): boolean {
  return process.env.SG_TEST_CONTEXT === "1" && process.env.NODE_ENV !== "production";
}

/** Run `fn` as `identity` (exactly one of sessionToken / userId). Throws outside the test context. */
export function runAsIdentity<T>(identity: RequestIdentity, fn: () => Promise<T>): Promise<T> {
  if (!identityContextEnabled()) throw new Error("runAsIdentity needs SG_TEST_CONTEXT=1 outside production");
  if (!identity.sessionToken === !identity.userId) throw new Error("runAsIdentity: give exactly one of sessionToken and userId");
  return storage().run(identity, fn);
}

/** The identity of the current call inside runAsIdentity, else null (a real request: read cookies() / headers()). */
export function getRequestIdentity(): RequestIdentity | null {
  if (!identityContextEnabled()) return null;
  return storage().getStore() ?? null;
}
