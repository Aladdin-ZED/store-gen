import "server-only";
/**
 * The platform seam (docs/STORE-SAAS.md §E.2, §B.7): every console page, action and route handler passes one of
 *
 *   const ctx = await requirePlatform({ permission: "console.read" });                                     // pages
 *   export async function noteAction(input: unknown) { return platformAction("stores.notes", (ctx) => addNote(ctx, input)); }
 *   const g = await platformGuard(req, "backups.manage"); if (!g.ok) return g.response;                     // /api/admin/**
 *
 * and reads one store's data only through `platformScope(ctx, storeId)` + the normal repositories (§E.3 rule 6). A
 * platform scope is not a WriteScope (D71): no write repository accepts it.
 *
 * `requirePlatform`: the console gate (signed cookie, the IP allowlist, read behind Cloudflare by
 * `allowlistAddress()`, and ADMIN_HOST when set), the session with MFA passed, `platform_role ≠ none`, TOTP
 * mandatory for staff (a staff member without it is sent to the account's enrolment page and cannot open the
 * console before), the permission matrix with its release, and the step-up freshness (`sessions.step_up_at` within
 * 5 minutes) behind the "Verified" chip. `platformAction` adds same-origin first (SEC-11), the `platform_read_only`
 * kill switch (every write refused with `read_only` except `kill.manage` and the read-only keys of
 * PLATFORM_READ_ONLY_OK) and the step-up of STEP_UP_PERMISSIONS / `{ stepUp: true }`. `platformAction` reads no
 * store from `x-sg-path`: posted from a tenant route it still answers for the platform only (§B.8 note 2).
 */
import { headers as requestHeaders } from "next/headers";
import { notFound, redirect, unstable_rethrow } from "next/navigation";
import { AuthError } from "@/lib/auth/errors";
import { PLATFORM_READ_ONLY_OK } from "@/lib/auth/grant";
import { CONSOLE_2FA_ENROL_PATH, loginUrl, verifyUrl } from "@/lib/auth/paths";
import {
  PLATFORM_PERMISSIONS,
  STEP_UP_PERMISSIONS,
  canPlatform,
  isPlatformPermission,
  isPlatformRole,
  releaseOn,
  type PlatformPermission,
  type PlatformPermissionDef,
  type PlatformRole,
} from "@/lib/auth/permissions";
import { assertAdminAccess, getRequestedAdminPath } from "@/lib/auth/request";
import { clientIp } from "@/lib/security/ip";
import { getRequestIdentity, identityHeaders } from "@/lib/tenancy/context";
import {
  PLATFORM_READ_ONLY,
  STEP_UP_TTL_MS,
  SeamError,
  actionFailure,
  assertActionOrigin,
  guardResponse,
  isSafeMethod,
  isSameOriginMutation,
  mintScope,
  platformReadOnly,
  requireSession,
} from "@/lib/tenancy/seam";
import type { ActionResult, PlatformCtx, StoreScope, WriteScope } from "@/lib/tenancy/types";

export { STEP_UP_TTL_MS };

/** The 2FA refusal of a staff member without TOTP (pages: the enrolment page). */
const NO_TOTP = "error.platform_2fa_required";

function grantPlatform(role: PlatformRole, p: PlatformPermission): boolean {
  if (!isPlatformPermission(p) || !canPlatform(role, p)) return false;
  const def: PlatformPermissionDef = PLATFORM_PERMISSIONS[p];
  return def.release === undefined || releaseOn(def.release);
}

async function resolvePlatform(permission: PlatformPermission | undefined): Promise<PlatformCtx> {
  const identity = getRequestIdentity();
  if (!identity) await assertAdminAccess(); // the console gate: notFound() like any unknown URL
  const { user, stepUpAt } = await requireSession(identity);
  const role = user.platformRole;
  if (role === "none" || !isPlatformRole(role)) throw new SeamError("not_found");
  if (!user.totpEnabled) throw new SeamError("forbidden", NO_TOTP);

  const stepUpUntil = stepUpAt ? new Date(stepUpAt.getTime() + STEP_UP_TTL_MS) : null;
  const h = identity ? identityHeaders(identity) : await requestHeaders();
  const ctx: PlatformCtx = {
    user,
    role,
    actor: { kind: "platform", userId: user.id, impersonatorId: null, ip: h ? clientIp(h) : null },
    can: (p) => grantPlatform(role, p),
    stepUpFresh: stepUpUntil !== null && stepUpUntil.getTime() > Date.now(),
    stepUpUntil,
  };
  if (permission && !ctx.can(permission)) throw new SeamError("forbidden");
  return ctx;
}

/** Pages (no throwOnFail): signed out → sign-in, no TOTP → enrolment, anything else refused → the neutral 404. */
export async function requirePlatform(opts: { permission?: PlatformPermission; throwOnFail?: boolean } = {}): Promise<PlatformCtx> {
  try {
    return await resolvePlatform(opts.permission);
  } catch (err) {
    if (opts.throwOnFail) throw err;
    unstable_rethrow(err);
    if (err instanceof AuthError) {
      const back = getRequestIdentity() ? null : await getRequestedAdminPath();
      redirect(err.code === "mfa_required" ? verifyUrl(back) : loginUrl(back));
    }
    if (err instanceof SeamError) {
      if (err.messageKey === NO_TOTP) redirect(CONSOLE_2FA_ENROL_PATH);
      notFound();
    }
    throw err;
  }
}

const needsStepUp = (permission: PlatformPermission, stepUp: boolean | undefined) => stepUp === true || STEP_UP_PERMISSIONS.has(permission);

/** A write under `permission` while `platform_read_only` is on (§H.8)? */
const refusedReadOnly = async (permission: PlatformPermission) => !PLATFORM_READ_ONLY_OK.has(permission) && (await platformReadOnly());

export async function platformAction<T>(permission: PlatformPermission, fn: (ctx: PlatformCtx) => Promise<T>, opts: { stepUp?: boolean } = {}): Promise<ActionResult<T>> {
  try {
    await assertActionOrigin();
    const ctx = await requirePlatform({ permission, throwOnFail: true });
    if (await refusedReadOnly(permission)) return { ok: false, error: "read_only", message: PLATFORM_READ_ONLY };
    if (needsStepUp(permission, opts.stepUp) && !ctx.stepUpFresh) return { ok: false, error: "step_up" };
    return { ok: true, data: await fn(ctx) };
  } catch (err) {
    unstable_rethrow(err);
    return actionFailure(err, "platform-action");
  }
}

/** Route handlers under src/app/api/admin/**: the gate first (404), same-origin for state-changing methods, then the role. */
export async function platformGuard(req: Request, permission: PlatformPermission): Promise<{ ok: true; ctx: PlatformCtx } | { ok: false; response: Response }> {
  if (!getRequestIdentity()) await assertAdminAccess();
  const safe = isSafeMethod(req);
  if (!safe && !isSameOriginMutation(req)) return { ok: false, response: guardResponse("forbidden", 403) };
  try {
    const ctx = await requirePlatform({ permission, throwOnFail: true });
    if (!safe && (await refusedReadOnly(permission))) return { ok: false, response: guardResponse("read_only", 403) };
    if (needsStepUp(permission, undefined) && !ctx.stepUpFresh) return { ok: false, response: guardResponse("step_up", 403) };
    return { ok: true, ctx };
  } catch (err) {
    unstable_rethrow(err);
    if (err instanceof AuthError) return { ok: false, response: guardResponse(err.code, err.status) };
    if (err instanceof SeamError) return { ok: false, response: guardResponse(err.code, err.status) };
    throw err;
  }
}

/** The only way platform code reads one store's data through the normal repositories (console store profile, impersonation). */
export function platformScope(ctx: PlatformCtx, storeId: string): StoreScope & { readonly kind: "platform" } {
  if (!ctx.can("console.read")) throw new SeamError("forbidden");
  return mintScope("platform", storeId); // not a WriteScope: no write repository accepts it (D71, lint L6)
}

/**
 * The one sanctioned staff write (D71; P0b, CCR P4-8): the `phone_revealed` event of `recordPlatformReveal`
 * (src/lib/orders/profile.ts, PLA-§7.4), on the store's order. It upgrades the console's own platform scope of that
 * store (`platformScope(ctx, storeId)`, the scope recordPlatformReveal receives), never a bare store id (P0b review
 * F-3). `pii.reveal` with a fresh step-up, checked here again whatever the caller checked; the scope is a system one,
 * so the event repository accepts it without a cast. Lint L6 refuses a call anywhere but src/lib/orders/profile.ts
 * (`reveal-scope`), any use of the function as a value (`scope-ref`), and the result leaving that file
 * (`reveal-escape`: returned, stored, exported, or out of an exported function).
 */
export function platformRevealScope(ctx: PlatformCtx, scope: StoreScope & { readonly kind: "platform" }): WriteScope {
  if (scope.kind !== "platform") throw new SeamError("forbidden");
  if (!ctx.can("pii.reveal")) throw new SeamError("forbidden");
  if (!ctx.stepUpFresh) throw new SeamError("step_up");
  return mintScope("system", scope.storeId);
}
