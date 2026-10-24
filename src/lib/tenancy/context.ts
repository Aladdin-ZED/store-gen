import "server-only";
/**
 * Request identity for tests (docs/STORE-SAAS.md §E.4). The two-store attack suite (`test:tenancy`, §J.2) calls
 * every exported action and repository as another store's member without HTTP:
 *
 *   await runAsIdentity({ userId: memberOfB, path: `/app/${storeA.handle}/orders` }, () => updateOrderAction(input));
 *
 * `requireStoreMember`, `storeAction`, `storeGuard`, `requirePlatform`, `platformAction`, `requireUser` and
 * `getRequestContext` read the identity before falling back to cookies() / headers(). Honoured only when
 * SG_TEST_CONTEXT=1 outside production; otherwise `runAsIdentity` throws and `getRequestIdentity` answers null, so a
 * stray call can never stand in for a request. A production process started with SG_TEST_CONTEXT=1 logs one error
 * (`identityContextMisconfigured()`, also called by the boot) and ignores it. Jobs never use it: they get a
 * SystemCtx (src/lib/jobs/scope.ts).
 *
 * What an identity stands for:
 *   - `sessionToken`: a real `sessions` row (MFA state, step-up, impersonation all read from it), as the cookie;
 *   - `userId`: a signed-in session with MFA passed and no row; `stepUpAt` and `impersonationId` stand in for the
 *     row's columns (the seam still re-checks the impersonation row, minus the session binding);
 *   - `path`: the proxy-signed path of the simulated request (a store action reads its store from it, D2), or null
 *     for a request whose signature did not verify;
 *   - `headers`: with them the seam runs its host-class and same-origin checks; without them it skips both.
 */
import { AsyncLocalStorage } from "node:async_hooks";

export interface RequestIdentity {
  /** a raw session token (as the cookie would carry it), or */
  sessionToken?: string;
  /** a user id: a session is assumed (MFA passed), no sessions row is read */
  userId?: string;
  /**
   * path + query of the simulated request as the proxy signed it; a store action reads its store from it (D2).
   * null = a request whose `x-sg-path-sig` was missing or wrong (the seam answers `not_found`, SEC-3).
   */
  path: string | null;
  /** request headers (host, origin, sec-fetch-site, user-agent…); without them the seam skips the host-class and same-origin checks */
  headers?: HeadersInit;
  /** userId mode only: the simulated session's `step_up_at` (§B.7) */
  stepUpAt?: Date;
  /** userId mode only: the `impersonation_sessions` id the simulated session carries (§B.8) */
  impersonationId?: string;
}

declare global {
  var __sgIdentity: AsyncLocalStorage<RequestIdentity> | undefined;
}

const storage = () => (globalThis.__sgIdentity ??= new AsyncLocalStorage<RequestIdentity>());
let misconfigWarned = false;

/** SG_TEST_CONTEXT=1 and NODE_ENV !== "production". */
export function identityContextEnabled(): boolean {
  return process.env.SG_TEST_CONTEXT === "1" && process.env.NODE_ENV !== "production";
}

/**
 * true (and one console error per process) when SG_TEST_CONTEXT=1 reaches a production process: the variable is
 * ignored there, but it must never be set on a deployed site. The boot task calls it (src/instrumentation.ts, T1,
 * CCR r1.0-t2-3), and so does the first `getRequestIdentity()` of such a process.
 */
export function identityContextMisconfigured(): boolean {
  const bad = process.env.SG_TEST_CONTEXT === "1" && process.env.NODE_ENV === "production";
  if (bad && !misconfigWarned) {
    misconfigWarned = true;
    console.error("[tenancy] SG_TEST_CONTEXT=1 is set in production: the test identity context is ignored. Remove the variable.");
  }
  return bad;
}

/** Run `fn` as `identity` (exactly one of sessionToken / userId). Throws outside the test context. */
export function runAsIdentity<T>(identity: RequestIdentity, fn: () => Promise<T>): Promise<T> {
  if (!identityContextEnabled()) {
    identityContextMisconfigured();
    throw new Error("runAsIdentity needs SG_TEST_CONTEXT=1 outside production");
  }
  if (!identity.sessionToken === !identity.userId) throw new Error("runAsIdentity: give exactly one of sessionToken and userId");
  if (identity.sessionToken && (identity.stepUpAt || identity.impersonationId)) {
    throw new Error("runAsIdentity: stepUpAt and impersonationId stand in for a session row; with a sessionToken they come from the row");
  }
  return storage().run(identity, fn);
}

/** The identity of the current call inside runAsIdentity, else null (a real request: read cookies() / headers()). */
export function getRequestIdentity(): RequestIdentity | null {
  if (!identityContextEnabled()) {
    // the first seam call of a misconfigured production process logs it, even before the boot task runs
    if (process.env.SG_TEST_CONTEXT === "1") identityContextMisconfigured();
    return null;
  }
  return storage().getStore() ?? null;
}

/** The identity's headers as a Headers object, or null when it carries none (tests that skip the request checks). */
export function identityHeaders(identity: RequestIdentity): Headers | null {
  return identity.headers ? new Headers(identity.headers) : null;
}
