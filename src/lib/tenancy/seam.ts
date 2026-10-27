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
 * `requireStoreMember`, in the §E.2 order:
 *   1. the session (valid, MFA passed; a platform ban already deleted the sessions); no admin gate: tenants never hold it
 *   2. the store: `opts.handle`, or (store actions only, D2) the proxy-signed request path, verified in constant time
 *      (a missing or bad `x-sg-path-sig` → `not_found` + the `path_unsigned` edge event, SEC-3); the platform host class
 *   3. the membership: the active `store_members` row, or the read-only impersonation membership of a staff session
 *      viewing this store (§B.8, `scope.kind = "impersonation"`, D70); staff without either get the same 404
 *   4. "require 2FA for members" (D12): a member without TOTP → the enrolment page
 *   5. the state: `allowStates` (default pending, active, restricted, suspended, closed for owner / admin / support)
 *   6. the permissions (`storeGrant`: matrix ∧ release ∧ mode ∧ state ∧ impersonation), then the feature
 *   7. `store_members.last_active_at`, touched at most every 10 minutes
 *
 * `storeAction` = same-origin first (SEC-11) + the above (store from the signed path) + the read-only guard (an
 * impersonation write is refused with `impersonation_read_only` and audited; suspended / closed refuse writes not
 * `readOnlyOk`; the `platform_read_only` kill switch refuses every write) + the tenant step-up for the §B.7 keys + the
 * `rate` bucket + the error mapping of today's adminAction. `storeGuard` is the route-handler twin (same-origin and
 * the kill switch for state-changing methods only; no rate option). The `WriteCtx` overloads (D71) narrow types
 * only: every `WritePermission` is refused to an impersonation scope before `fn` runs, so the cast below never
 * hands a non-write scope to a write repository.
 *
 * Store existence never leaks: no store, no membership and a closed door all answer the neutral 404 (pages) or
 * `not_found` (actions, routes).
 */
import { eq, isNull, lt, or } from "drizzle-orm";
import { headers as requestHeaders } from "next/headers";
import { notFound, redirect, unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";
import { ActionError } from "@/lib/admin-data/action";
import { auditFrom } from "@/lib/audit";
import type { SessionUser } from "@/lib/auth";
import { readSessionToken } from "@/lib/auth/cookies";
import { AuthBusyError, AuthError, AuthInputError, AuthRefusal, FieldsError } from "@/lib/auth/errors";
import { isAdminIpAllowed } from "@/lib/auth/gate";
import { IMPERSONATION_MEMBERSHIP, STORE_STEP_UP_PERMISSIONS, storeGrant, storeGrantAll } from "@/lib/auth/grant";
import { STORE_2FA_ENROL_PATH, signInUrl, signInVerifyUrl } from "@/lib/auth/paths";
import { canPlatform, permissionDef, type StorePermission } from "@/lib/auth/permissions";
import { validateSessionToken } from "@/lib/auth/session";
import { getUserById } from "@/lib/auth/users";
import { db } from "@/lib/db/client";
import { impersonationSessions, storeMembers } from "@/lib/db/schema";
import { appPathHandle } from "@/lib/edge/areas";
import { effectiveHost } from "@/lib/edge/host";
import { verifiedRequestPath } from "@/lib/edge/path-sig";
import { isAdminLocale } from "@/lib/i18n/admin";
import { errorSummary } from "@/lib/orders/log";
import type { PrePublishCode } from "@/lib/render/prepublish";
import { CsrfError, checkSameOrigin } from "@/lib/security/csrf";
import { baseSecurityHeaders } from "@/lib/security/headers";
import { clientIp } from "@/lib/security/ip";
import { rateLimit, storeBucket } from "@/lib/security/rate-limit";
import { getRequestIdentity, identityHeaders, type RequestIdentity } from "./context";
import type { FeatureKey } from "./entitlement-keys";
import { EntitlementError, QuotaError, activeKillSwitches, assertFeature } from "./entitlements";
import { HandleError, isHandle } from "./handles";
import { LifecycleError } from "./lifecycle";
import { whereStore } from "./sql";
import type {
  ActionErrorCode,
  ActionResult,
  Actor,
  GateItem,
  ImpersonationInfo,
  Membership,
  MessageKey,
  ReadScope,
  StoreCtx,
  StoreRow,
  StoreScope,
  StoreStatus,
  WriteCtx,
  WritePermission,
  WriteScope,
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

/**
 * The scope of a store row the calling transaction has just inserted (signup, `/app/new`, setup; §B.2 step 7, §B.11):
 * its creator writes the store's first tenant rows (the owner membership, the review row, the legal acceptances)
 * before any member context can exist. Caller: src/lib/auth/stores.ts only.
 */
export function newStoreScope(storeId: string): WriteScope {
  return mintScope("member", storeId);
}

/**
 * The write scope of a member's own context, for the few member writes that need no permission key (leaving a
 * store, PLA Q.19): an impersonation scope is refused (`impersonation_read_only`), any other non-member scope
 * `forbidden`. The second narrowing site of D71 beside `storeAction`'s, and like it only in this file.
 */
export function memberWriteScope(ctx: StoreCtx): WriteScope {
  if (ctx.impersonation || ctx.scope.kind === "impersonation") throw new SeamError("impersonation_read_only");
  if (ctx.scope.kind !== "member" || ctx.membership.synthetic) throw new SeamError("forbidden");
  return ctx.scope as WriteScope;
}

/**
 * A member's own ctx with its write scope (`memberWriteScope`'s checks), for the selftests that drive repository
 * writes directly; no cast to WriteCtx outside this file (lint L6, D71).
 */
export function memberWriteCtx(ctx: StoreCtx): WriteCtx {
  return { ...ctx, scope: memberWriteScope(ctx) };
}

/* ------------------------------------------------------------------ */
/* Errors and results                                                  */
/* ------------------------------------------------------------------ */

export type SeamErrorCode = "not_found" | "forbidden" | "read_only" | "impersonation_read_only" | "feature_off" | "step_up" | "rate_limited";

/** A refusal of the seam (throwOnFail); storeAction / platformAction answer `{ ok: false, error: code }`. */
export class SeamError extends Error {
  constructor(
    readonly code: SeamErrorCode,
    readonly messageKey?: MessageKey,
  ) {
    super(messageKey ?? code);
    this.name = "SeamError";
  }

  /** HTTP status for route handlers: 404 for not_found (store existence never leaks), 429 for a bucket, 403 otherwise. */
  get status(): 403 | 404 | 429 {
    return this.code === "not_found" ? 404 : this.code === "rate_limited" ? 429 : 403;
  }
}

/** The message of a member refused for "require 2FA for members" (D12). */
export const MEMBER_2FA_REQUIRED: MessageKey = "error.member_2fa_required";
/** The message of a write refused by the `platform_read_only` kill switch (§H.8). */
export const PLATFORM_READ_ONLY: MessageKey = "error.platform_read_only";

/**
 * Today's adminAction mapping (src/lib/admin-data/action.ts) on the §E.2 codes: input problems → `invalid` with
 * their message (field problems also as one `items` entry per field), refusals → their code, a full scrypt semaphore
 * → `busy`, anything else → `server` (logged without request data; never a raw DB message). Next control-flow errors
 * must be rethrown by the caller first (`unstable_rethrow`).
 */
export function actionFailure(err: unknown, area: string): Extract<ActionResult<never>, { ok: false }> {
  if (err instanceof SeamError) return err.messageKey ? { ok: false, error: err.code, message: err.messageKey } : { ok: false, error: err.code };
  if (err instanceof AuthRefusal) return err.messageKey ? { ok: false, error: err.code, message: err.messageKey } : { ok: false, error: err.code };
  if (err instanceof FieldsError) {
    const items = Object.entries(err.fields).map(([field, title]) => ({ id: `field:${field}`, level: "hard" as const, title, field }));
    return { ok: false, error: "invalid", message: items[0]?.title ?? "error.invalid", items };
  }
  if (err instanceof AuthBusyError) return { ok: false, error: "busy" };
  if (err instanceof AuthError) return err.code === "forbidden" ? { ok: false, error: "forbidden" } : { ok: false, error: "forbidden", message: "error.session_ended" };
  if (err instanceof CsrfError) return { ok: false, error: "forbidden" };
  if (err instanceof EntitlementError) return { ok: false, error: "feature_off" };
  if (err instanceof QuotaError) return { ok: false, error: "quota" };
  // a publish-gate refusal (§M.1 rule 2, D51; CCR r1.0-t4-12): `PublishError(code, …, items)` from the publisher
  const gate = gateRefusal(err);
  if (gate) return gate;
  // T1's typed refusals (CCR r1.0-t1-2): the close / reopen sheets and the rename sheet show why
  if (err instanceof LifecycleError) return { ok: false, error: err.code };
  if (err instanceof HandleError) {
    if (err.code === "invalid") return { ok: false, error: `handle_${err.problem ?? "format"}` };
    if (err.code === "unavailable" || err.code === "too_soon") return { ok: false, error: `handle_${err.code}` };
    return { ok: false, error: err.code === "status_changed" ? "conflict" : err.code };
  }
  if (err instanceof ActionError || err instanceof AuthInputError) return { ok: false, error: "invalid", message: err.message };
  if (err instanceof ZodError) return { ok: false, error: "invalid", message: err.issues[0]?.message ?? "Some fields are invalid." };
  console.error(`[${area}]`, errorSummary(err));
  return { ok: false, error: "server" };
}

const GATE_CODES: ReadonlySet<string> = new Set(["design_blocked", "honesty_blocked", "budget_blocked"] satisfies PrePublishCode[]);

/**
 * A thrown refusal of the publish gates as the §E.2 result `{ ok: false, error: code, items }` (the publish dialog lists
 * one row per item). Read by shape (an error with a gate `code` and its `GateItem[]`), so the seam never loads the
 * renderer: `PublishError` (src/lib/render/publish.server.ts) carries both.
 */
function gateRefusal(err: unknown): Extract<ActionResult<never>, { ok: false }> | null {
  if (!(err instanceof Error)) return null;
  const { code, items } = err as Error & { code?: unknown; items?: unknown };
  if (typeof code !== "string" || !GATE_CODES.has(code) || !Array.isArray(items)) return null;
  return { ok: false, error: code as PrePublishCode, items: items as GateItem[] };
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
  /** null inside runAsIdentity without headers: the host-class and same-origin checks are skipped (tests) */
  headers: Headers | null;
  /** the proxy-signed path (null when missing or not verified), or the identity's path */
  path: string | null;
}

async function requestInputs(): Promise<RequestInputs> {
  const identity = getRequestIdentity();
  if (identity) return { identity, headers: identityHeaders(identity), path: identity.path };
  const h = await requestHeaders();
  return { identity: null, headers: h, path: verifiedRequestPath(h) };
}

/** Methods that never change state: route guards skip the same-origin check and the kill switch for them. */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
export const isSafeMethod = (req: Request): boolean => SAFE_METHODS.has(req.method.toUpperCase());

/**
 * Same-origin first, on every invocation of a server action wrapper (storeAction, userAction, platformAction;
 * §C.9, SEC-11). Actions are always POSTs, and a browser's POST always carries `Origin`: a missing one is refused
 * here (Next alone lets it through with a warning), whatever `checkSameOrigin` answers for it. The other strict rules
 * (Sec-Fetch-Site, an Origin host on the platform or admin host, `Origin: null`) are `checkSameOrigin`'s (T3).
 * Throws CsrfError. Inside runAsIdentity without headers there is no request to check.
 */
export async function assertActionOrigin(identity: RequestIdentity | null = getRequestIdentity()): Promise<void> {
  const h = identity ? identityHeaders(identity) : await requestHeaders();
  // the headers form of csrf.ts treats them as a POST (CCR r1.0-t2-1); the explicit missing-Origin refusal stays
  if (h && (h.get("origin") === null || !checkSameOrigin(h))) throw new CsrfError();
}

/**
 * The §C.9 mutation rule for a state-changing request: an `Origin` header, and the strict `checkSameOrigin` agrees
 * (Sec-Fetch-Site same-origin, an Origin host equal to the effective platform or console host, never `Origin: null`).
 * The interim PLATFORM_HOST / ADMIN_HOST fallback of review r1.0-t2 F8 is gone with T3's csrf.ts (CCR r1.0-t2-1).
 */
export function isSameOriginMutation(req: Request): boolean {
  return req.headers.get("origin") !== null && checkSameOrigin(req);
}

/**
 * `path_unsigned` (§C.3 step 2, SEC-3): a store action whose path signature is missing or wrong. The `error_events`
 * table arrives with 0005 (P0) and `recordError` with it; until then one server-log line per minute with the count.
 */
let unsignedCount = 0;
let unsignedLoggedAt = 0;
function recordPathUnsigned(): void {
  unsignedCount++;
  const now = Date.now();
  if (now - unsignedLoggedAt < 60_000) return;
  unsignedLoggedAt = now;
  console.warn(`[edge] path_unsigned: a store action arrived without a valid x-sg-path-sig (${unsignedCount} since start)`);
}

/* ------------------------------------------------------------------ */
/* Session                                                             */
/* ------------------------------------------------------------------ */

/** A step-up (TOTP, or the tenant password re-entry) stays fresh this long (§B.7). */
export const STEP_UP_TTL_MS = 5 * 60_000;

/** The signed-in user with the session columns the seams read (§B.4, §B.7, §B.8). */
export interface SeamSession {
  user: SessionUser;
  /** `sessions.step_up_at` (fresh for STEP_UP_TTL_MS) */
  stepUpAt: Date | null;
  /** `sessions.impersonation_id`: re-checked against its row by the store seam */
  impersonationId: string | null;
  /** false for a userId identity (tests): no `sessions` row stands behind it */
  hasRow: boolean;
}

/**
 * The session (valid, MFA passed; a platform ban already deleted the sessions). Throws AuthError
 * "unauthenticated" | "mfa_required". No admin gate. Shared with src/lib/platform/seam.ts.
 */
export async function requireSession(identity: RequestIdentity | null = getRequestIdentity()): Promise<SeamSession> {
  if (identity?.userId) {
    const row = await getUserById(identity.userId);
    if (!row || row.disabled) throw new AuthError("unauthenticated");
    const user: SessionUser = {
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
    return { user, stepUpAt: identity.stepUpAt ?? null, impersonationId: identity.impersonationId ?? null, hasRow: false };
  }
  const token = identity ? (identity.sessionToken ?? null) : await readSessionToken();
  const session = await validateSessionToken(token);
  if (!session) throw new AuthError("unauthenticated");
  if (!session.mfaPassed) throw new AuthError(session.user.totpEnabled ? "mfa_required" : "unauthenticated");
  return {
    user: { ...session.user, sessionId: session.id, lastStoreId: session.lastStoreId },
    stepUpAt: session.stepUpAt,
    impersonationId: session.impersonationId,
    hasRow: true,
  };
}

/** The signed-in user only (see requireSession). */
export async function requireSessionUser(identity: RequestIdentity | null = getRequestIdentity()): Promise<SessionUser> {
  return (await requireSession(identity)).user;
}

const stepUpUntilOf = (at: Date | null): Date | null => (at ? new Date(at.getTime() + STEP_UP_TTL_MS) : null);

/* ------------------------------------------------------------------ */
/* Kill switch                                                         */
/* ------------------------------------------------------------------ */

/**
 * Is the `platform_read_only` kill switch on (§H.8)? Read through T1's cached `activeKillSwitches()`. Until T1
 * merges that function is a typed stub, read as "no switch tripped" (the 0004 default); a real read error
 * propagates, so a write is never let through on a failed read (CCR r1.0-t2-3).
 */
export async function platformReadOnly(): Promise<boolean> {
  try {
    return (await activeKillSwitches()).includes("platform_read_only");
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("not implemented: T1")) return false;
    throw err;
  }
}

/* ------------------------------------------------------------------ */
/* Rate buckets                                                        */
/* ------------------------------------------------------------------ */

type RateOpt = NonNullable<ActionOpts["rate"]>;

/** One hit on the action's bucket: per user (default) or for the whole store; over the limit → `rate_limited`. */
async function chargeRate(ctx: StoreCtx, rate: RateOpt): Promise<void> {
  // `s:<storeId>:<name>[:<userId>]` (§E.8), built by C0b's branded builder (CCR r1.0-t2-2; same bytes as before)
  const bucket = storeBucket(ctx.scope, rate.name, (rate.per ?? "user") === "user" ? ctx.user.id : undefined);
  const r = await rateLimit(bucket, rate.limit, rate.windowSec);
  if (!r.ok) throw new SeamError("rate_limited");
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
const LAST_ACTIVE_EVERY_MS = 10 * 60_000;

/** Who is asking: only a store action may take its store from the signed request path (D2, §C.3 step 2). */
type Via = "page" | "action" | "route";

interface Resolved {
  ctx: StoreCtx;
  /** the membership row's `last_active_at`; undefined under impersonation (nothing to touch) */
  lastActiveAt?: Date | null;
}

const asList = (p: StorePermission | readonly StorePermission[] | null | undefined): readonly StorePermission[] =>
  p === undefined || p === null ? [] : typeof p === "string" ? [p] : p;

async function membershipOf(scope: StoreScope, userId: string): Promise<(Membership & { lastActiveAt: Date | null }) | null> {
  const [row] = await db
    .select({ role: storeMembers.role, status: storeMembers.status, lastActiveAt: storeMembers.lastActiveAt })
    .from(storeMembers)
    .where(whereStore(storeMembers, scope, eq(storeMembers.userId, userId)))
    .limit(1);
  return row ? { role: row.role, status: row.status, lastActiveAt: row.lastActiveAt } : null;
}

/** Step 7: one conditional UPDATE, at most every 10 minutes per member; a failure never fails the request. */
async function touchMember(scope: WriteScope, userId: string, lastActiveAt: Date | null): Promise<void> {
  const cutoff = new Date(Date.now() - LAST_ACTIVE_EVERY_MS);
  if (lastActiveAt && lastActiveAt > cutoff) return;
  try {
    await db
      .update(storeMembers)
      .set({ lastActiveAt: new Date() })
      .where(whereStore(storeMembers, scope, eq(storeMembers.userId, userId), or(isNull(storeMembers.lastActiveAt), lt(storeMembers.lastActiveAt, cutoff))));
  } catch (err) {
    console.error("[seam] last_active_at", errorSummary(err));
  }
}

/** Ends an expired view-as row (§B.8: "an expired row ends itself"); bookkeeping only, the seam already refused it. */
async function expireImpersonation(session: SeamSession): Promise<void> {
  if (!session.hasRow) return;
  try {
    // dynamic: impersonation.ts may import the platform seam, which imports this file
    const { endImpersonation } = await import("@/lib/platform/impersonation");
    await endImpersonation({ sessionId: session.user.sessionId }, "expired");
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("not implemented: T2")) return;
    console.error("[seam] impersonation expiry", errorSummary(err));
  }
}

/** The view-as row `id` of this store (lint L1/L2: the scope is the parameter). */
async function impersonationRow(scope: StoreScope, id: string) {
  const [row] = await db
    .select({
      id: impersonationSessions.id,
      staffUserId: impersonationSessions.staffUserId,
      sessionId: impersonationSessions.sessionId,
      reason: impersonationSessions.reason,
      expiresAt: impersonationSessions.expiresAt,
      endedAt: impersonationSessions.endedAt,
    })
    .from(impersonationSessions)
    .where(whereStore(impersonationSessions, scope, eq(impersonationSessions.id, id)))
    .limit(1);
  return row;
}

/**
 * Step 3, the staff branch (§B.8, D70): the session's view-as row for THIS store, still open and unexpired, bound
 * to this session and staff member, whose holder still has a platform role with `stores.impersonate`, TOTP, and
 * (on a real request) an address inside the console's IP allowlist. Anything else: no impersonation (the caller
 * falls back to the plain membership, i.e. the neutral 404 for staff).
 */
async function impersonationFor(store: StoreRow, session: SeamSession, inputs: RequestInputs): Promise<ImpersonationInfo | null> {
  const { user, impersonationId } = session;
  if (!impersonationId || user.platformRole === "none" || !canPlatform(user.platformRole, "stores.impersonate") || !user.totpEnabled) return null;
  const row = await impersonationRow(mintScope("impersonation", store.id), impersonationId);
  if (!row || row.endedAt || row.staffUserId !== user.id) return null;
  if (session.hasRow && row.sessionId !== user.sessionId) return null;
  if (row.expiresAt.getTime() <= Date.now()) {
    await expireImpersonation(session);
    return null;
  }
  if (inputs.headers && !isAdminIpAllowed(inputs.headers)) return null;
  return { id: row.id, storeId: store.id, staffUserId: user.id, mode: "read", reason: row.reason, expiresAt: row.expiresAt };
}

/** Steps 1-5: who, which store, which membership, 2FA, state. Permissions and the feature are `authorize`'s. */
async function resolveMember(opts: RequireStoreOpts, via: Via): Promise<Resolved> {
  const inputs = await requestInputs();
  // 1. session
  const session = await requireSession(inputs.identity);
  const { user } = session;
  // 2. store: the handle, else (actions only) the signed path; the platform host class (D2)
  let handle = opts.handle;
  if (handle === undefined && via === "action") {
    if (inputs.path === null) {
      recordPathUnsigned();
      throw new SeamError("not_found");
    }
    handle = appPathHandle(inputs.path) ?? undefined;
  }
  if (!handle || !isHandle(handle)) throw new SeamError("not_found");
  if (inputs.headers && effectiveHost(inputs.headers).cls !== "platform") throw new SeamError("not_found");
  // dynamic: public.ts imports mintScope from this file (no import cycle)
  const { resolveStoreByHandle } = await import("./public");
  const store = await resolveStoreByHandle(handle);
  if (!store) throw new SeamError("not_found");

  // 3. membership: the staff view-as of this store first (read-only even for a staff member who is also a member)
  const impersonation = await impersonationFor(store, session, inputs);
  let scope: StoreScope;
  let membership: Membership;
  let lastActiveAt: Date | null | undefined;
  if (impersonation) {
    scope = mintScope("impersonation", store.id);
    membership = IMPERSONATION_MEMBERSHIP;
  } else {
    scope = mintScope("member", store.id);
    const row = await membershipOf(scope, user.id);
    if (!row || row.status !== "active") throw new SeamError("not_found");
    membership = { role: row.role, status: row.status };
    lastActiveAt = row.lastActiveAt;
  }

  // 4. require 2FA for members (the staff branch already holds TOTP)
  if (!impersonation && store.requireMember2fa && !user.totpEnabled) throw new SeamError("forbidden", MEMBER_2FA_REQUIRED);

  // 5. state (closed: owner, admin and support viewing it read-only)
  const states = opts.allowStates ?? DEFAULT_STATES;
  if (!states.includes(store.status)) throw new SeamError("not_found");
  if (store.status === "closed" && !impersonation && membership.role !== "owner" && membership.role !== "admin") throw new SeamError("not_found");

  const ip = inputs.headers ? clientIp(inputs.headers) : null;
  const actor: Actor = impersonation
    ? { kind: "impersonation", userId: user.id, impersonatorId: user.id, ip }
    : { kind: "user", userId: user.id, impersonatorId: null, ip };
  const ctx: StoreCtx = {
    user,
    store,
    membership,
    scope,
    actor,
    impersonation,
    stepUpUntil: impersonation ? null : stepUpUntilOf(session.stepUpAt),
    can: (p) => storeGrant(store, membership, p) === "ok",
  };
  return { ctx, lastActiveAt };
}

/** Step 6: every required key, then the feature. */
async function authorize(ctx: StoreCtx, required: readonly StorePermission[], feature: FeatureKey | undefined): Promise<void> {
  const verdict = storeGrantAll(ctx.store, ctx.membership, required);
  if (verdict !== "ok") throw new SeamError(verdict);
  if (feature) await assertFeature(ctx.scope, feature);
}

/** authorize, and an impersonation write refusal audited: one `platform.impersonation.write_refused` row per call (PLA-§10.2). */
async function authorizeAudited(ctx: StoreCtx, required: readonly StorePermission[], feature: FeatureKey | undefined, via: Via): Promise<void> {
  try {
    await authorize(ctx, required, feature);
  } catch (err) {
    if (err instanceof SeamError && err.code === "impersonation_read_only") {
      await auditFrom(ctx, "platform.impersonation.write_refused", { target: required.join(" ").slice(0, 191), meta: { permissions: required, via } });
    }
    throw err;
  }
}

async function finish(r: Resolved): Promise<StoreCtx> {
  if (r.lastActiveAt !== undefined && r.ctx.scope.kind === "member") {
    await touchMember(r.ctx.scope as WriteScope, r.ctx.user.id, r.lastActiveAt);
  }
  return r.ctx;
}

/** The page a signed-out visitor comes back to after signing in (the proxy-signed path, never a header from the client). */
async function backPath(): Promise<string | null> {
  const identity = getRequestIdentity();
  return identity ? identity.path : verifiedRequestPath(await requestHeaders());
}

/**
 * The member context of a page, layout or route. Pages (no throwOnFail): signed out → the sign-in page, MFA pending
 * → its step, a member owing 2FA → the enrolment page, any other refusal → the neutral 404. With throwOnFail:
 * AuthError, SeamError or EntitlementError. Without `opts.handle` it answers not_found: only a store action reads
 * its store from the request path.
 */
export async function requireStoreMember(opts: RequireStoreOpts = {}): Promise<StoreCtx> {
  try {
    const r = await resolveMember(opts, "page");
    await authorize(r.ctx, asList(opts.permission), opts.feature);
    return await finish(r);
  } catch (err) {
    if (opts.throwOnFail) throw err;
    if (err instanceof AuthError) {
      const back = await backPath();
      redirect(err.code === "mfa_required" ? signInVerifyUrl(back) : signInUrl(back));
    }
    if (err instanceof SeamError && err.messageKey === MEMBER_2FA_REQUIRED) redirect(STORE_2FA_ENROL_PATH);
    if (err instanceof SeamError || err instanceof EntitlementError) notFound();
    throw err;
  }
}

/**
 * The tenant step-up (§B.7): `sessions.step_up_at` within 5 minutes, by TOTP or the password. Throws SeamError
 * `step_up` (the UI opens the step-up sheet) or, under impersonation, `impersonation_read_only`. `storeAction` /
 * `storeGuard` run it for STORE_STEP_UP_PERMISSIONS; the conditional cases call it themselves.
 */
export function assertStepUp(ctx: StoreCtx): void {
  if (ctx.impersonation) throw new SeamError("impersonation_read_only");
  if (!ctx.stepUpUntil || ctx.stepUpUntil.getTime() <= Date.now()) throw new SeamError("step_up");
}

/** How the member stepped up, named again on the step-up-gated audit row (`meta.stepUp`, §F.5 rev 4). */
export type StepUpMethod = "totp" | "password";

/**
 * A conditional §B.7 write: the secret writes under integrations.manage (connecting a Sheet, the export key, a CAPI
 * token or test code, the export key in a ZIP) and the exports of customer data. `assertStepUp`, then the method for
 * the audit row (an account with TOTP steps up with TOTP only, src/lib/auth/step-up.ts).
 */
export function requireStepUp(ctx: StoreCtx): StepUpMethod {
  assertStepUp(ctx);
  return ctx.user.totpEnabled ? "totp" : "password";
}

/** `requireStepUp` for a route handler: the 403 `{ error: "step_up" }` storeGuard answers (the UI opens the sheet). */
export function stepUpGuard(ctx: StoreCtx): { ok: true; stepUp: StepUpMethod } | { ok: false; response: Response } {
  try {
    return { ok: true, stepUp: requireStepUp(ctx) };
  } catch (err) {
    if (err instanceof SeamError) return { ok: false, response: guardResponse(err.code, err.status) };
    throw err;
  }
}

/** The write guards after the grant: the platform kill switch for write keys, the step-up for the §B.7 keys. */
async function guardWrites(ctx: StoreCtx, required: readonly StorePermission[], opts: { killSwitch: boolean }): Promise<void> {
  if (opts.killSwitch && required.some((p) => permissionDef(p).write) && (await platformReadOnly())) throw new SeamError("read_only", PLATFORM_READ_ONLY);
  if (required.some((p) => STORE_STEP_UP_PERMISSIONS.has(p))) assertStepUp(ctx);
}

/* ------------------------------------------------------------------ */
/* storeAction                                                         */
/* ------------------------------------------------------------------ */

/** `rate.per`: "user" (default) = `s:<sid>:<name>:<userId>`, "store" = `s:<sid>:<name>` shared by every member. */
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
    await assertActionOrigin();
    const required = asList(permission);
    const r = await resolveMember({}, "action");
    await authorizeAudited(r.ctx, required, opts.feature, "action");
    const ctx = await finish(r);
    await guardWrites(ctx, required, { killSwitch: true });
    if (opts.rate) await chargeRate(ctx, opts.rate);
    // The one narrowing site (D71): the WriteCtx overload is chosen only when every key is a WritePermission, and
    // each of them was granted above, which an impersonation or platform scope never is.
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
  const safe = isSafeMethod(req);
  // state-changing methods: same-origin before the session lookup, as adminGuard (src/lib/orders/http.ts)
  if (!safe && !isSameOriginMutation(req)) return { ok: false, response: guardResponse("forbidden", 403) };
  try {
    const required = asList(permission);
    const r = await resolveMember({ handle }, "route");
    await authorizeAudited(r.ctx, required, opts.feature, "route");
    const ctx = await finish(r);
    await guardWrites(ctx, required, { killSwitch: !safe });
    return { ok: true, ctx: ctx as WriteCtx };
  } catch (err) {
    unstable_rethrow(err);
    if (err instanceof AuthError) return { ok: false, response: guardResponse(err.code, err.status) };
    if (err instanceof SeamError) return { ok: false, response: guardResponse(err.code, err.status) };
    if (err instanceof EntitlementError) return { ok: false, response: guardResponse("feature_off", 403) };
    throw err;
  }
}

/** For tests: the path_unsigned count of this process. */
export function pathUnsignedCount(): number {
  return unsignedCount;
}
