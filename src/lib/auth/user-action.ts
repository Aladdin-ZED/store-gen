import "server-only";
/**
 * `userAction` (docs/STORE-SAAS.md §E.2): the wrapper of the account pages' server actions (`/app/account/**`,
 * `/app/new`, the store switcher). Same-origin first (SEC-11), then the session with MFA passed: no store, no
 * permission, no admin gate. A staff member viewing a store still acts on their own account here (§B.8).
 */
import { headers } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { clientIp } from "@/lib/security/ip";
import { getRequestIdentity, identityHeaders } from "@/lib/tenancy/context";
import { actionFailure, assertActionOrigin, requireSession, type SeamSession } from "@/lib/tenancy/seam";
import type { ActionResult, UserCtx } from "@/lib/tenancy/types";

/** The account context of the current request (pages may build one too, e.g. to pass to deleteUserAccount). */
export async function requireUserCtx(): Promise<UserCtx & { session: SeamSession }> {
  const identity = getRequestIdentity();
  const session = await requireSession(identity);
  const h = identity ? identityHeaders(identity) : await headers();
  return {
    user: session.user,
    actor: { kind: "user", userId: session.user.id, impersonatorId: null, ip: h ? clientIp(h) : null },
    session,
  };
}

export async function runUserAction<T>(fn: (ctx: UserCtx) => Promise<T>): Promise<ActionResult<T>> {
  try {
    await assertActionOrigin();
    const { user, actor } = await requireUserCtx();
    return { ok: true, data: await fn({ user, actor }) };
  } catch (err) {
    unstable_rethrow(err);
    return actionFailure(err, "user-action");
  }
}
