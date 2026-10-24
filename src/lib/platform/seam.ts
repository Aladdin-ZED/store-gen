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
 * C0a's minimal working body (§K.1): the console gate, the session, `platform_role ≠ none`, TOTP mandatory for staff,
 * the permission matrix with its release, step-up freshness (`sessions.step_up_at` within 5 minutes) for the
 * STEP_UP_PERMISSIONS and `{ stepUp: true }` actions. T2 hardens it in place (assertSameOrigin for actions, the IP
 * allowlist behind Cloudflare, the enrolment redirect of §B.7, platform_read_only, buckets).
 */
import { eq } from "drizzle-orm";
import { headers as requestHeaders } from "next/headers";
import { notFound, redirect, unstable_rethrow } from "next/navigation";
import { AuthError } from "@/lib/auth/errors";
import { LOGIN_PATH, TWO_FACTOR_PATH, VERIFY_PATH } from "@/lib/auth/paths";
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
import { assertAdminAccess } from "@/lib/auth/request";
import { db } from "@/lib/db/client";
import { sessions, users } from "@/lib/db/schema";
import { checkSameOrigin } from "@/lib/security/csrf";
import { clientIp } from "@/lib/security/ip";
import { getRequestIdentity } from "@/lib/tenancy/context";
import { SeamError, actionFailure, guardResponse, mintScope, requireSessionUser } from "@/lib/tenancy/seam";
import type { ActionResult, PlatformCtx, StoreScope } from "@/lib/tenancy/types";

/** A step-up (TOTP, or the tenant password re-entry) stays fresh this long (§B.7). */
export const STEP_UP_TTL_MS = 5 * 60_000;

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
  const user = await requireSessionUser(identity);
  const [row] = await db.select({ platformRole: users.platformRole }).from(users).where(eq(users.id, user.id)).limit(1);
  const role = row?.platformRole;
  if (!role || !isPlatformRole(role)) throw new SeamError("not_found");
  if (!user.totpEnabled) throw new SeamError("forbidden", NO_TOTP);

  let stepUpAt: Date | null = null;
  if (!user.sessionId.startsWith("ctx:")) {
    const [s] = await db.select({ stepUpAt: sessions.stepUpAt }).from(sessions).where(eq(sessions.id, user.sessionId)).limit(1);
    stepUpAt = s?.stepUpAt ?? null;
  }
  const stepUpUntil = stepUpAt ? new Date(stepUpAt.getTime() + STEP_UP_TTL_MS) : null;
  const h = identity ? (identity.headers ? new Headers(identity.headers) : null) : await requestHeaders();
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
    if (err instanceof AuthError) redirect(err.code === "mfa_required" ? VERIFY_PATH : LOGIN_PATH);
    if (err instanceof SeamError) {
      if (err.messageKey === NO_TOTP) redirect(TWO_FACTOR_PATH);
      notFound();
    }
    throw err;
  }
}

const needsStepUp = (permission: PlatformPermission, stepUp: boolean | undefined) => stepUp === true || STEP_UP_PERMISSIONS.has(permission);

export async function platformAction<T>(permission: PlatformPermission, fn: (ctx: PlatformCtx) => Promise<T>, opts: { stepUp?: boolean } = {}): Promise<ActionResult<T>> {
  try {
    const ctx = await requirePlatform({ permission, throwOnFail: true });
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
  if (!checkSameOrigin(req)) return { ok: false, response: guardResponse("forbidden", 403) };
  try {
    const ctx = await requirePlatform({ permission, throwOnFail: true });
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
