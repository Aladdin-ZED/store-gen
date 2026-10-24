import "server-only";
/**
 * The StoreScope seam (docs/STORE-SAAS.md §E.2): every request into store data passes exactly one entry point.
 *
 *   const ctx = await requireStoreMember({ handle: (await params).store, permission: "orders.read" });   // pages, layouts
 *   export async function saveZones(input: unknown) { return storeAction("checkout.write", (ctx) => save(ctx.scope, input)); }
 *   const g = await storeGuard(req, (await params).store, "media.write"); if (!g.ok) return g.response;   // /api/app/<h>/**
 *
 * It is also the one place a StoreScope is made (`mintScope`, the cast lint L6 pins to this file): the platform,
 * public and system seams call it, nothing else does.
 *
 * C0a's minimal working body (§K.1): the session (no admin gate: tenants never hold it), the store from the handle
 * (`opts.handle`, else the proxy-signed request path, D2, SEC-3), the platform host class, the active membership,
 * the store state (closed: owner and admin only) with the read-only guard, the permissions and the feature. Not yet:
 * impersonation (the synthetic membership, `scope.kind = "impersonation"`), `require_member_2fa`, rate buckets,
 * `platform_read_only`, `assertSameOrigin` for actions, `last_active_at`, the step-up chip; T2 hardens them in place
 * behind these signatures. Store existence never leaks: no store, no membership and a closed door all answer the
 * neutral 404 (pages) or `not_found` (actions, routes).
 */
import { eq } from "drizzle-orm";
import { headers as requestHeaders } from "next/headers";
import { notFound, redirect, unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";
import { ActionError } from "@/lib/admin-data/action";
import type { SessionUser } from "@/lib/auth";
import { readSessionToken } from "@/lib/auth/cookies";
import { AuthError, AuthInputError } from "@/lib/auth/errors";
import { LOGIN_PATH, VERIFY_PATH } from "@/lib/auth/paths";
import { can as roleCan, isStorePermission, permissionDef, releaseOn, stateAllows, type StorePermission } from "@/lib/auth/permissions";
import { validateSessionToken } from "@/lib/auth/session";
import { getUserById } from "@/lib/auth/users";
import { db } from "@/lib/db/client";
import { storeMembers } from "@/lib/db/schema";
import { appPathHandle } from "@/lib/edge/areas";
import { effectiveHost } from "@/lib/edge/host";
import { verifiedRequestPath } from "@/lib/edge/path-sig";
import { isAdminLocale } from "@/lib/i18n/admin";
import { errorSummary } from "@/lib/orders/log";
import { checkSameOrigin } from "@/lib/security/csrf";
import { baseSecurityHeaders } from "@/lib/security/headers";
import { clientIp } from "@/lib/security/ip";
import { getRequestIdentity, type RequestIdentity } from "./context";
import type { FeatureKey } from "./entitlement-keys";
import { EntitlementError, QuotaError, assertFeature } from "./entitlements";
import { isHandle } from "./handles";
import { modeAllows } from "./mode";
import { whereStore } from "./sql";
import type {
  ActionErrorCode,
  ActionResult,
  Actor,
  Membership,
  MessageKey,
  ReadScope,
  StoreCtx,
  StoreRow,
  StoreScope,
  StoreStatus,
  WriteCtx,
  WritePermission,
} from "./types";

/* ------------------------------------------------------------------ */
/* Scopes                                                              */
/* ------------------------------------------------------------------ */

const STORE_ID_RE = /^[0-9A-Z]{26}$/;

/**
 * The one constructor of a StoreScope. Callers: this file, src/lib/platform/seam.ts (`platformScope`),
 * src/lib/tenancy/public.ts (`publicScope`), src/lib/jobs/scope.ts (`systemScope`); lint L6 (C0b) pins them.
 * The scope is frozen, so its kind can't be changed after the checks that chose it.
 */
export function mintScope<K extends StoreScope["kind"]>(kind: K, storeId: string): StoreScope & { readonly kind: K } {
  if (!STORE_ID_RE.test(storeId)) throw new Error("tenancy: a scope needs a store id");
  return Object.freeze({ storeId, kind }) as unknown as StoreScope & { readonly kind: K };
}

/* ------------------------------------------------------------------ */
/* Errors and results                                                  */
/* ------------------------------------------------------------------ */

export type SeamErrorCode = "not_found" | "forbidden" | "read_only" | "impersonation_read_only" | "feature_off" | "step_up";

/** A refusal of the seam (throwOnFail); storeAction / platformAction answer `{ ok: false, error: code }`. */
export class SeamError extends Error {
  constructor(
    readonly code: SeamErrorCode,
    readonly messageKey?: MessageKey,
  ) {
    super(messageKey ?? code);
    this.name = "SeamError";
  }

  /** HTTP status for route handlers: 404 for not_found (store existence never leaks), 403 otherwise. */
  get status(): 403 | 404 {
    return this.code === "not_found" ? 404 : 403;
  }
}

/**
 * Today's adminAction mapping (src/lib/admin-data/action.ts) on the §E.2 codes: input problems → `invalid` with
 * their message, refusals → their code, anything else → `server` (logged without request data; never a raw DB
 * message). Next control-flow errors must be rethrown by the caller first (`unstable_rethrow`).
 */
export function actionFailure(err: unknown, area: string): Extract<ActionResult<never>, { ok: false }> {
  if (err instanceof SeamError) return err.messageKey ? { ok: false, error: err.code, message: err.messageKey } : { ok: false, error: err.code };
  if (err instanceof AuthError) return err.code === "forbidden" ? { ok: false, error: "forbidden" } : { ok: false, error: "forbidden", message: "error.session_ended" };
  if (err instanceof EntitlementError) return { ok: false, error: "feature_off" };
  if (err instanceof QuotaError) return { ok: false, error: "quota" };
  if (err instanceof ActionError || err instanceof AuthInputError) return { ok: false, error: "invalid", message: err.message };
  if (err instanceof ZodError) return { ok: false, error: "invalid", message: err.issues[0]?.message ?? "Some fields are invalid." };
  console.error(`[${area}]`, errorSummary(err));
  return { ok: false, error: "server" };
}

/** JSON answer of a refused guard (the headers of today's apiHeaders(), src/lib/orders/http.ts). */
export function guardResponse(error: ActionErrorCode | "unauthenticated" | "mfa_required", status: number): Response {
  const h = new Headers(baseSecurityHeaders({ frame: "deny" }));
  h.set("Cache-Control", "no-store");
  h.set("X-Robots-Tag", "noindex, nofollow");
  h.set("Cross-Origin-Resource-Policy", "same-site");
  h.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify({ ok: false, error }), { status, headers: h });
}

/* ------------------------------------------------------------------ */
/* Request inputs                                                      */
/* ------------------------------------------------------------------ */

interface RequestInputs {
  identity: RequestIdentity | null;
  /** null inside runAsIdentity without headers: the host-class check is skipped (tests) */
  headers: Headers | null;
  /** the proxy-signed path, or the identity's path */
  path: string | null;
}

async function requestInputs(): Promise<RequestInputs> {
  const identity = getRequestIdentity();
  if (identity) return { identity, headers: identity.headers ? new Headers(identity.headers) : null, path: identity.path };
  const h = await requestHeaders();
  return { identity: null, headers: h, path: verifiedRequestPath(h) };
}

/**
 * The signed-in user (session valid, MFA passed; a platform ban already deleted the sessions). Throws AuthError
 * "unauthenticated" | "mfa_required". No admin gate. Shared with src/lib/platform/seam.ts.
 */
export async function requireSessionUser(identity: RequestIdentity | null = getRequestIdentity()): Promise<SessionUser> {
  if (identity?.userId) {
    const row = await getUserById(identity.userId);
    if (!row || row.disabled) throw new AuthError("unauthenticated");
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      totpEnabled: row.totpEnabled,
      sessionId: `ctx:${row.id}`,
      platformRole: row.platformRole,
      locale: isAdminLocale(row.locale) ? row.locale : null,
      lastStoreId: null,
    };
  }
  const token = identity ? (identity.sessionToken ?? null) : await readSessionToken();
  const session = await validateSessionToken(token);
  if (!session) throw new AuthError("unauthenticated");
  if (!session.mfaPassed) throw new AuthError(session.user.totpEnabled ? "mfa_required" : "unauthenticated");
  return { ...session.user, sessionId: session.id, lastStoreId: session.lastStoreId };
}

/* ------------------------------------------------------------------ */
/* requireStoreMember                                                  */
/* ------------------------------------------------------------------ */

export interface RequireStoreOpts {
  handle?: string; // pages and route handlers pass params.store; actions omit it (D2)
  permission?: StorePermission | readonly StorePermission[]; // all required
  feature?: FeatureKey; // entitlement that must be true
  allowStates?: readonly StoreStatus[]; // default: pending, active, restricted, suspended(read), closed(read, owner/admin)
  throwOnFail?: boolean; // pages: redirect/notFound; actions/routes: AuthError | SeamError | EntitlementError
}

const DEFAULT_STATES: readonly StoreStatus[] = ["pending", "active", "restricted", "suspended", "closed"];

/** matrix ∧ release ∧ mode → `forbidden`; ∧ state (suspended, closed: writes only if readOnlyOk) → `read_only`. */
function grant(store: StoreRow, membership: Membership, p: StorePermission): "ok" | "forbidden" | "read_only" {
  if (!isStorePermission(p)) return "forbidden";
  const def = permissionDef(p);
  if (!roleCan(membership.role, p) || !releaseOn(def.release)) return "forbidden";
  if (def.mode && !modeAllows(store.mode, def.mode)) return "forbidden";
  return stateAllows(store.status, def) ? "ok" : "read_only";
}

async function membershipOf(scope: StoreScope, userId: string): Promise<Membership | null> {
  const [row] = await db
    .select({ role: storeMembers.role, status: storeMembers.status })
    .from(storeMembers)
    .where(whereStore(storeMembers, scope, eq(storeMembers.userId, userId)))
    .limit(1);
  return row ? { role: row.role, status: row.status } : null;
}

async function resolveMember(opts: RequireStoreOpts): Promise<StoreCtx> {
  const inputs = await requestInputs();
  // 1. session
  const user = await requireSessionUser(inputs.identity);
  // 2. store: the handle, the platform host class (D2), the row
  const handle = opts.handle ?? (inputs.path ? appPathHandle(inputs.path) : null);
  if (!handle || !isHandle(handle)) throw new SeamError("not_found");
  if (inputs.headers && effectiveHost(inputs.headers).cls !== "platform") throw new SeamError("not_found");
  // dynamic: public.ts imports mintScope from this file (no import cycle)
  const { resolveStoreByHandle } = await import("./public");
  const store = await resolveStoreByHandle(handle);
  if (!store) throw new SeamError("not_found");
  const scope = mintScope("member", store.id);
  // 3. membership (staff without one get the same 404 as anyone)
  const membership = await membershipOf(scope, user.id);
  if (!membership || membership.status !== "active") throw new SeamError("not_found");
  // 5. state
  const states = opts.allowStates ?? DEFAULT_STATES;
  if (!states.includes(store.status)) throw new SeamError("not_found");
  if (store.status === "closed" && membership.role !== "owner" && membership.role !== "admin") throw new SeamError("not_found");

  const actor: Actor = { kind: "user", userId: user.id, impersonatorId: null, ip: inputs.headers ? clientIp(inputs.headers) : null };
  const ctx: StoreCtx = {
    user,
    store,
    membership,
    scope,
    actor,
    impersonation: null,
    stepUpUntil: null,
    can: (p) => grant(store, membership, p) === "ok",
  };
  // 6. permissions, then the feature
  const required: readonly StorePermission[] = opts.permission === undefined ? [] : typeof opts.permission === "string" ? [opts.permission] : opts.permission;
  for (const p of required) {
    const verdict = grant(store, membership, p);
    if (verdict !== "ok") throw new SeamError(verdict);
  }
  if (opts.feature) await assertFeature(scope, opts.feature);
  return ctx;
}

/**
 * The member context of a page, layout, action or route. Pages (no throwOnFail): signed out → the sign-in page,
 * MFA pending → its step, any refusal → the neutral 404. With throwOnFail: AuthError, SeamError or EntitlementError.
 */
export async function requireStoreMember(opts: RequireStoreOpts = {}): Promise<StoreCtx> {
  try {
    return await resolveMember(opts);
  } catch (err) {
    if (opts.throwOnFail) throw err;
    if (err instanceof AuthError) redirect(err.code === "mfa_required" ? VERIFY_PATH : LOGIN_PATH);
    if (err instanceof SeamError || err instanceof EntitlementError) notFound();
    throw err;
  }
}

/* ------------------------------------------------------------------ */
/* storeAction                                                         */
/* ------------------------------------------------------------------ */

export type ActionOpts = { feature?: FeatureKey; rate?: { name: string; limit: number; windowSec: number; per?: "store" | "user" } };

/** Server actions in src/app/app/** and src/lib/**: the body of every exported action is `return storeAction(...)`. */
export function storeAction<T>(permission: WritePermission | readonly WritePermission[], fn: (ctx: WriteCtx) => Promise<T>, opts?: ActionOpts): Promise<ActionResult<T>>; // rev 4 (D71): write keys → WriteCtx
export function storeAction<T>(permission: StorePermission | readonly StorePermission[] | null, fn: (ctx: StoreCtx) => Promise<T>, opts?: ActionOpts): Promise<ActionResult<T>>;
export async function storeAction<T>(
  permission: StorePermission | readonly StorePermission[] | null,
  fn: (ctx: WriteCtx) => Promise<T>,
  opts: ActionOpts = {},
): Promise<ActionResult<T>> {
  try {
    const ctx = await requireStoreMember({ permission: permission ?? undefined, feature: opts.feature, throwOnFail: true });
    // T2: assertSameOrigin first, opts.rate (storeBucket), platform_read_only, the audited impersonation refusal
    // The one narrowing site (D71): the WriteCtx overload is chosen only when every key is a WritePermission, and
    // each of them was granted above (an impersonation or platform scope is refused every one of them).
    return { ok: true, data: await fn(ctx as WriteCtx) };
  } catch (err) {
    unstable_rethrow(err);
    return actionFailure(err, "store-action");
  }
}

/* ------------------------------------------------------------------ */
/* storeGuard                                                          */
/* ------------------------------------------------------------------ */

/** Route handlers under src/app/api/app/[store]/** (same overload rule: all-write keys → WriteCtx). */
export type StoreGuard<C extends StoreCtx<ReadScope> = StoreCtx> = { ok: true; ctx: C } | { ok: false; response: Response };

export function storeGuard(req: Request, handle: string, permission: WritePermission | readonly WritePermission[], opts?: { feature?: FeatureKey }): Promise<StoreGuard<WriteCtx>>;
export function storeGuard(req: Request, handle: string, permission: StorePermission | readonly StorePermission[], opts?: { feature?: FeatureKey }): Promise<StoreGuard>;
export async function storeGuard(
  req: Request,
  handle: string,
  permission: StorePermission | readonly StorePermission[],
  opts: { feature?: FeatureKey } = {},
): Promise<StoreGuard<WriteCtx>> {
  // state-changing methods: same-origin before the session lookup, as adminGuard (src/lib/orders/http.ts)
  if (!checkSameOrigin(req)) return { ok: false, response: guardResponse("forbidden", 403) };
  try {
    const ctx = await requireStoreMember({ handle, permission, feature: opts.feature, throwOnFail: true });
    return { ok: true, ctx: ctx as WriteCtx };
  } catch (err) {
    unstable_rethrow(err);
    if (err instanceof AuthError) return { ok: false, response: guardResponse(err.code, err.status) };
    if (err instanceof SeamError) return { ok: false, response: guardResponse(err.code, err.status) };
    if (err instanceof EntitlementError) return { ok: false, response: guardResponse("feature_off", 403) };
    throw err;
  }
}
