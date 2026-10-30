import "server-only";
/**
 * The claim queue (P4 CALL CENTER; operations.md OPE-§5, §27.3, §27.5, OD7, OD8, OD33, OD36, OD46, OD48, OD53, OD60;
 * docs/STORE-SAAS.md §D.1, §E.6-§E.8, §A.5.1, §K.2 P0). The queue is computed on read: no job hands out or takes back
 * an order, a lease expires by comparison with now.
 *
 *   nextOrder        "Next" (agents.self, OD36): presence (an offline agent goes online, a break is respected), the
 *                    agent's active claim resumed, the calling window, the daily cap, then ONE autocommit claim UPDATE
 *                    over both lanes (MariaDB 10.4 has no SKIP LOCKED: the UPDATE is a locking read of the latest
 *                    committed rows, so two concurrent claims never take the same order), the `claimed` events with
 *                    the abandoned-lease attribution (OD46), the card. Idempotent per `Idempotency-Key` (./idem.ts).
 *   releaseOrder     Skip / Break: the claim ends, a skipped order is not handed back to the same agent for 10 minutes
 *   renewLease       inside every claimed-order action (reveal, WhatsApp, edit, note); never resurrects an expired lease
 *   releaseAllLeases the store lifecycle (`transitionStore` on restricted / suspended / closed, core §A.5.1)
 *   assignOrders     a manager's assignment (orders.assign, ≤ 200 ids)
 *   assignOnCreate   the `ops.created` hook: round-robin among live agents under their cap (OPE-§5.6)
 *   takeOrder        "Take this order" (inbound, OD53, or a manager's drawer): the claim on one id
 *   opsPulse         the queue's pulse counters (OD33); markOrdersSeen moves the viewer's "new orders" cursor
 *
 * Every answer that hands out an order carries its card (`buildQueueOrder`, src/lib/callcenter/card.ts: the reads after
 * the claim, the compiled script, the masked customer, ≤ 6 KB gzipped).
 *
 * The clock is `opsNow()` (`Date.now()`), passed to every statement as a parameter (OPE-§5.2 writes UTC_TIMESTAMP(3);
 * P4 step 3 binds the app's clock instead, so the DB-backed suite drives leases, callbacks and caps with a fake clock;
 * the app and MariaDB share one host). Every statement goes through the StoreScope seam (§E.3).
 */
import { and, asc, count, desc, eq, gt, gte, inArray, isNotNull, isNull, lt, lte, notInArray, or, sql, type SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { can, type StoreRole, STORE_ROLES } from "@/lib/auth/permissions";
import { callingWindowFor } from "@/lib/callcenter/window.server";
import { withIdem } from "@/lib/callcenter/idem";
import { affectedRows, isLive, opsNow, profileOf, releaseClaims, renewHeldLease, touchAgent, writePresence } from "@/lib/callcenter/presence";
import { buildQueueOrder, CARD, cardRow, type CardRow, type QueueOrder } from "@/lib/callcenter/card";
import { addDaysYmd, instantAt, isCallable, nextCallableAt, storeYmd, type EffectiveWindow } from "@/lib/callcenter/window";
import { laneOf } from "@/lib/callcenter/priority";
import { viewerSeesOrder } from "@/lib/callcenter/visibility";
import { storeLock, withNamedLock } from "@/lib/db/locks";
import { db, pool, schema } from "@/lib/db/client";
import { agentProfiles, orderEvents, orders, outbox, storeMembers } from "@/lib/db/schema";
import { newId } from "@/lib/db/ids";
import { notify } from "@/lib/platform/notify";
import type { PulseContributor } from "@/lib/pulse/types";
import { rateLimit, storeBucket } from "@/lib/security/rate-limit";
import { getStoreSetting } from "@/lib/settings";
import type { OpsSetting } from "@/lib/settings/keys/ops";
import { scopedCache } from "@/lib/tenancy/cache";
import { SeamError } from "@/lib/tenancy/seam";
import { getStoreById } from "@/lib/tenancy/public";
import { byId, inStore, whereStore } from "@/lib/tenancy/sql";
import type { ActionResult, StoreScope, WriteCtx, WriteScope } from "@/lib/tenancy/types";
import { appendEvents, viewerOf, type NewOrderEvent } from "./events";
import { runAfterCommit } from "./transition";

/* ------------------------------------------------------------------ */
/* the card and the answers (OPE-§5.2, §5.3)                           */
/* ------------------------------------------------------------------ */

/** The order card (OPE-§5.3) is built in src/lib/callcenter/card.ts; re-exported for the queue's callers. */
export type { QueueOrder } from "@/lib/callcenter/card";

export type NextResult =
  | { ok: true; order: QueueOrder; leaseUntil: string; resumed: boolean; replayed?: true }
  | { ok: false; reason: "outside_window"; opensAt: string | null }
  | { ok: false; reason: "empty"; nextDueAt: string | null }
  | { ok: false; reason: "on_break" | "offline" | "cap_reached" };

/** "Take this order" (OPE-§5.7 step 2): the card, or why not (held = another agent's active claim). */
export type TakeResult = { ok: true; order: QueueOrder; leaseUntil: string; resumed: false } | { ok: false; error: "not_found" | "held" | "not_callable" };

/** OPE-§27.3 (OD33, core §I.4 `StorePulse.counts`): ≤ 50 ms; store parts cached 5 s per store, the per-user part fresh. */
export interface OpsPulse {
  /** since the viewer's last pulse cursor */
  newOrders: number;
  /** agents: theirs; managers: all */
  dueCallbacks: number;
  queueNow: number;
  /** sheet_status = failed + dead outbox items (P5's contributor reports it) */
  syncFailed: number;
}

/* ------------------------------------------------------------------ */
/* constants, caches and small reads                                   */
/* ------------------------------------------------------------------ */

/** the confirm lane's states (OPE-§5.1) */
const OPEN_CONFIRM = ["new", "attempting", "callback"] as const;
/** the decided confirmation states (the daily cap counts moves into them) */
const DECIDED = ["confirmed", "cancelled", "unreachable", "fake", "duplicate"] as const;
const ORDER_ID_RE = /^[A-Z0-9]{2,8}-[A-Z0-9]{4,12}$/;
/** OPE-§L: `s:<sid>:claim:<uid>` 120 / min */
const CLAIM_LIMIT = 120;
/** a skipped order is not handed back to the same agent this long (OPE-§5.2) */
const SKIP_MS = 10 * 60_000;
const SKIP_MAX = 20;
/** OPE-§5.6: assignOrders ≤ 200 ids */
export const ASSIGN_MAX = 200;
/** the round-robin lock's wait on the public order path (core §E.7: 1 s on request paths) */
const RR_LOCK_SEC = 1;
const READ_ONLY_STATES: ReadonlySet<string> = new Set(["suspended", "closed", "scheduled_deletion", "purged", "rejected"]);

/** the agent's skip list: order ids with the instant they come back (≤ 20, 10 minutes) */
const skips = scopedCache<{ id: string; until: number }[]>({ name: "ops-skips", maxEntries: 20_000, ttlMs: SKIP_MS });
/** decided orders of an agent today (OPE-§5.2 step 4), 60 s */
const decidedCache = scopedCache<number>({ name: "ops-cap", maxEntries: 20_000, ttlMs: 60_000 });
/** the store's next due time when the queue is empty (OPE-§5.2), 60 s */
const nextDueCache = scopedCache<number | null>({ name: "ops-nextdue", maxEntries: 4_000, ttlMs: 60_000 });
/** the pulse's store-level counters (OPE-§27.3), 5 s */
const pulseCache = scopedCache<{ queueNow: number; dueCallbacksAll: number; syncFailed: number; dayStart: number }>({ name: "ops-pulse", maxEntries: 4_000, ttlMs: 5_000 });

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);
const validId = (id: unknown): id is string => typeof id === "string" && ORDER_ID_RE.test(id);

/** confirm ∈ {new, attempting, callback} with due ≤ now, or the delivery lane (confirmed with due ≤ now, OD48) */
function dueLanes(now: Date): SQL {
  return or(
    and(inArray(orders.confirmState, [...OPEN_CONFIRM]), or(isNull(orders.dueAt), lte(orders.dueAt, now))),
    // due_at on a confirmed order exists only for attempt_failed (OPE-§3.2: postponed and every other ship move clear it)
    and(eq(orders.confirmState, "confirmed"), isNotNull(orders.dueAt), lte(orders.dueAt, now)),
  )!;
}

/** an order in either lane whatever its due time (the active-claim and take statements) */
const inLanes: SQL = or(inArray(orders.confirmState, [...OPEN_CONFIRM]), and(eq(orders.confirmState, "confirmed"), eq(orders.shipState, "attempt_failed")))!;

/** The skipped ids of an agent that have not come back yet. */
function skippedBy(scope: StoreScope, userId: string, now: number): string[] {
  return (skips.get(scope.storeId, userId) ?? []).filter((s) => s.until > now).map((s) => s.id);
}

function rememberSkip(scope: StoreScope, userId: string, orderId: string, now: number): void {
  const live = (skips.get(scope.storeId, userId) ?? []).filter((s) => s.until > now && s.id !== orderId);
  skips.set(scope.storeId, userId, [{ id: orderId, until: now + SKIP_MS }, ...live].slice(0, SKIP_MAX));
}

/** Decided orders of `userId` in the store-local day of `now` (OPE-§5.2 step 4; `oe_actor_idx`), cached 60 s. */
async function decidedToday(scope: StoreScope, userId: string, tz: string, now: Date): Promise<number> {
  const ymd = storeYmd(now, tz);
  return decidedCache.getOrLoad(scope.storeId, `${userId}:${ymd}`, async () => {
    const [n] = await db
      .select({ n: sql<number>`COUNT(DISTINCT ${orderEvents.orderId})` })
      .from(orderEvents)
      .where(
        whereStore(
          orderEvents,
          scope,
          eq(orderEvents.actorId, userId),
          gte(orderEvents.at, instantAt(ymd, "00:00", tz)),
          lt(orderEvents.at, instantAt(addDaysYmd(ymd, 1), "00:00", tz)),
          eq(orderEvents.type, "state_changed"),
          inArray(orderEvents.toState, [...DECIDED]),
        ),
      );
    return Number(n?.n ?? 0);
  });
}

/** After an outcome that decided an order: the agent's cap counts it at once. */
export function forgetDecidedToday(scope: StoreScope, userId: string, tz: string): void {
  decidedCache.delete(scope.storeId, `${userId}:${storeYmd(opsNow(), tz)}`);
}

/** The order `userId` holds now (an unexpired claim in either lane), or null. */
async function activeClaimOf(scope: StoreScope, userId: string, now: Date): Promise<{ id: string } | null> {
  const [row] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(whereStore(orders, scope, eq(orders.assigneeId, userId), isNotNull(orders.claimToken), gt(orders.leaseUntil, now), inLanes))
    .limit(1);
  return row ?? null;
}

/* ------------------------------------------------------------------ */
/* the claim statement (OPE-§5.2 step 5)                               */
/* ------------------------------------------------------------------ */

type Db = typeof db;
export interface ClaimArgs {
  uid: string;
  tok: string;
  now: Date;
  until: Date;
  manual: boolean;
  skipped: readonly string[];
}

/**
 * The one claim statement over both lanes, ORDER BY the agent's own orders first (a due callback reaches its owner,
 * OD7), then priority, then the oldest due. The SET captures the row's previous `assignee_id`, `lease_until` and
 * `claim_token` in session variables (`@sg_q_*`), so the read that follows on the same connection knows whose lease
 * expired and when (OD46) without a second statement on the row. Exported for `test:queue`'s EXPLAIN (both lane
 * ranges on `orders_queue_idx`, OPE-§M.4).
 */
export function claimStatement(d: Db, scope: WriteScope, a: ClaimArgs) {
  return d
    .update(orders)
    .set({
      assigneeId: sql`IF((@sg_q_asg := ${orders.assigneeId}) IS NULL, ${a.uid}, ${a.uid})`,
      leaseUntil: sql`IF((@sg_q_lease := ${orders.leaseUntil}) IS NULL, ${a.until}, ${a.until})`,
      claimToken: sql`IF((@sg_q_tok := ${orders.claimToken}) IS NULL, ${a.tok}, ${a.tok})`,
      rev: sql`${orders.rev} + 1`,
    })
    .where(
      whereStore(
        orders,
        scope,
        dueLanes(a.now),
        or(isNull(orders.leaseUntil), lt(orders.leaseUntil, a.now), eq(orders.assigneeId, a.uid)),
        a.manual ? eq(orders.assigneeId, a.uid) : undefined,
        a.skipped.length ? notInArray(orders.id, [...a.skipped]) : undefined,
      ),
    )
    .orderBy(sql`(${orders.assigneeId} <=> ${a.uid}) DESC`, desc(orders.priority), sql`COALESCE(${orders.dueAt}, ${orders.createdAt}) ASC`, asc(orders.id))
    .limit(1);
}

/** What one claim took: the row as it is now, and its claim state before the UPDATE. */
interface Claimed {
  row: CardRow;
  until: Date;
  prev: { assignee: string | null; lease: Date | null; token: string | null };
}

/** A session variable holding a DATETIME comes back as a string ("2026-10-28 09:15:00.000", UTC) or a Date. */
function varDate(v: unknown): Date | null {
  if (v instanceof Date) return v;
  if (typeof v !== "string" || !v) return null;
  const d = new Date(`${v.replace(" ", "T")}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}
const varText = (v: unknown): string | null => (typeof v === "string" && v ? v : Buffer.isBuffer(v) && v.length ? v.toString("utf8") : null);

/**
 * Runs `fn`; a lock-wait timeout or a deadlock (errno 1205 / 1213) is retried once, then answers `busy` (OPE-§5.2:
 * the claim then answers `empty`). Exported for `test:queue`.
 */
export async function retryTransientOnce<T, B>(fn: () => Promise<T>, busy: B): Promise<T | B> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (!isTransient(err)) throw err;
      if (i >= 1) return busy;
    }
  }
}

function isTransient(err: unknown): boolean {
  let e: unknown = err;
  for (let depth = 0; depth < 5 && e && typeof e === "object"; depth++) {
    const x = e as { errno?: unknown; code?: unknown; cause?: unknown };
    if (x.errno === 1205 || x.errno === 1213 || x.code === "ER_LOCK_WAIT_TIMEOUT" || x.code === "ER_LOCK_DEADLOCK") return true;
    e = x.cause;
  }
  return false;
}

/**
 * One claim (OPE-§5.2 step 5) on a connection of its own, in autocommit: the UPDATE, then the claimed row and the
 * previous claim state read back by the new token. `null` = nothing callable.
 */
async function claimOnce(scope: WriteScope, a: ClaimArgs, extraWhere?: SQL): Promise<Claimed | null> {
  const conn = await pool().getConnection();
  try {
    const cdb = drizzle(conn, { schema, mode: "default" }) as unknown as Db;
    const res = extraWhere ? await takeStatement(cdb, scope, a, extraWhere) : await claimStatement(cdb, scope, a);
    if (affectedRows(res) !== 1) return null;
    const [row] = await cdb
      .select({ ...CARD, prevAssignee: sql<unknown>`@sg_q_asg`, prevLease: sql<unknown>`@sg_q_lease`, prevToken: sql<unknown>`@sg_q_tok` })
      .from(orders)
      .where(whereStore(orders, scope, eq(orders.assigneeId, a.uid), eq(orders.claimToken, a.tok)))
      .limit(1);
    if (!row) return null;
    const { prevAssignee, prevLease, prevToken, ...card } = row;
    return { row: card as CardRow, until: a.until, prev: { assignee: varText(prevAssignee), lease: varDate(prevLease), token: varText(prevToken) } };
  } finally {
    conn.release();
  }
}

/**
 * The claim on one id (OPE-§5.7 step 2): the order in either lane whatever its due time, free, already the taker's,
 * or a callback whose owner holds no active claim on it (the customer is on the line now).
 */
function takeStatement(d: Db, scope: WriteScope, a: ClaimArgs, idWhere: SQL) {
  return d
    .update(orders)
    .set({
      assigneeId: sql`IF((@sg_q_asg := ${orders.assigneeId}) IS NULL, ${a.uid}, ${a.uid})`,
      leaseUntil: sql`IF((@sg_q_lease := ${orders.leaseUntil}) IS NULL, ${a.until}, ${a.until})`,
      claimToken: sql`IF((@sg_q_tok := ${orders.claimToken}) IS NULL, ${a.tok}, ${a.tok})`,
      rev: sql`${orders.rev} + 1`,
    })
    .where(
      whereStore(
        orders,
        scope,
        idWhere,
        inLanes,
        or(isNull(orders.leaseUntil), lt(orders.leaseUntil, a.now), eq(orders.assigneeId, a.uid), and(eq(orders.confirmState, "callback"), isNull(orders.claimToken))),
      ),
    )
    .limit(1);
}

/**
 * The events of a claim (OPE-§5.2 step 6): `released` (why "lease_expired", the previous holder, at the old
 * `lease_until`) when the claim took over an abandoned lease (OD46), `claimed`, and `assigned` when the assignee
 * changed. Answers whether a lease was found abandoned.
 */
async function claimEvents(scope: WriteScope, uid: string, c: Claimed, now: Date, by: "claim" | "inbound"): Promise<boolean> {
  const events: NewOrderEvent[] = [];
  let abandoned = false;
  if (c.prev.token && c.prev.lease && c.prev.lease.getTime() < now.getTime()) {
    // the previous holder let the lease expire: their `claimed` is the order's last queue event (OD46)
    const [last] = await db
      .select({ type: orderEvents.type, actorId: orderEvents.actorId })
      .from(orderEvents)
      .where(whereStore(orderEvents, scope, eq(orderEvents.orderId, c.row.id), inArray(orderEvents.type, ["claimed", "released", "call_attempt", "state_changed"])))
      .orderBy(desc(orderEvents.id))
      .limit(1);
    if (last?.type === "claimed" && last.actorId && last.actorId !== uid) {
      events.push({ orderId: c.row.id, actorKind: "user", actorId: last.actorId, type: "released", reasonCode: "lease_expired", meta: { why: "lease_expired" }, at: c.prev.lease });
      abandoned = true;
    }
  }
  events.push({ orderId: c.row.id, actorKind: "user", actorId: uid, type: "claimed", meta: { leaseUntil: c.until.toISOString() }, rev: c.row.rev, at: now });
  if (c.prev.assignee !== uid) events.push({ orderId: c.row.id, actorKind: "user", actorId: uid, type: "assigned", meta: { to: uid, by }, rev: c.row.rev, at: now });
  await appendEvents(db, scope, events);
  return abandoned;
}

/** "Orders opened and abandoned" for the managers (`ops.abandoned_claims`, batched 60 min, OD46). */
async function notifyAbandoned(scope: WriteScope): Promise<void> {
  const store = await getStoreById(scope.storeId);
  if (!store) return;
  await notify({ audience: "store_role", storeId: scope.storeId, roles: ["owner", "admin", "manager"] }, "ops.abandoned_claims", { count: 1 }, { link: `/app/${store.handle}/queue/board` });
}

/** The store's next due time after `now`, lazily snapped into the window (OPE-§5.5), cached 60 s. */
async function nextDueAt(scope: StoreScope, w: EffectiveWindow, now: Date): Promise<string | null> {
  const load = async () => {
    const [r] = await db
      .select({ at: sql<unknown>`MIN(${orders.dueAt})` })
      .from(orders)
      .where(whereStore(orders, scope, inArray(orders.confirmState, [...OPEN_CONFIRM, "confirmed"]), gt(orders.dueAt, now)));
    const at = r?.at instanceof Date ? r.at : varDate(r?.at);
    return at ? at.getTime() : null;
  };
  let min = await nextDueCache.getOrLoad(scope.storeId, "min", load);
  if (min !== null && min <= now.getTime()) {
    nextDueCache.delete(scope.storeId, "min");
    min = await nextDueCache.getOrLoad(scope.storeId, "min", load);
  }
  if (min === null) return null;
  try {
    // a due time computed before an override began is re-snapped here, never by a job (OD8)
    return nextCallableAt(new Date(min), w).toISOString();
  } catch {
    return new Date(min).toISOString();
  }
}

/* ------------------------------------------------------------------ */
/* Next (OPE-§5.2)                                                     */
/* ------------------------------------------------------------------ */

/** "Next" (agents.self; `idem` = the Idempotency-Key, OD36): a replay answers the first result, `replayed: true`. */
export function nextOrder(ctx: WriteCtx, opts: { idem: string }): Promise<NextResult> {
  return withIdem(ctx.scope, ctx.user.id, opts.idem, () => nextOrderRun(ctx), (r) => (r.ok ? { ...r, replayed: true as const } : r));
}

/** the tail of each agent's claim requests in this process (`${userId}` per store): one runs at a time */
const agentTurns = scopedCache<Promise<void>>({ name: "ops-agent-turn", maxEntries: 20_000, ttlMs: 60_000 });

/**
 * Runs the claim requests of one agent one after another (Next, Take, "Save and next"), so two tabs pressing Next at
 * the same instant resume one claim instead of taking two orders (one active claim per agent, OD7, OPE-§L). The app
 * is one Node process (core §H.1); the Idempotency-Key already folds a double tap of one control.
 */
async function oneAtATime<T>(scope: StoreScope, userId: string, fn: () => Promise<T>): Promise<T> {
  const before = agentTurns.get(scope.storeId, userId) ?? Promise.resolve();
  const run = before.then(fn, fn);
  const tail = run.then(
    () => undefined,
    () => undefined,
  );
  agentTurns.set(scope.storeId, userId, tail);
  try {
    return await run;
  } finally {
    if (agentTurns.get(scope.storeId, userId) === tail) agentTurns.delete(scope.storeId, userId);
  }
}

/** Steps 1-7 of OPE-§5.2 (also the "Save and next" of an outcome, inside the outcome's own idempotent run). */
export function nextOrderRun(ctx: WriteCtx): Promise<NextResult> {
  return oneAtATime(ctx.scope, ctx.user.id, () => nextOrderTurn(ctx));
}

async function nextOrderTurn(ctx: WriteCtx): Promise<NextResult> {
  const { scope } = ctx;
  const uid = ctx.user.id;
  if (!ctx.can("agents.self") || READ_ONLY_STATES.has(ctx.store.status)) return { ok: false, reason: "offline" };
  if (!(await rateLimit(storeBucket(scope, "claim", uid), CLAIM_LIMIT, 60)).ok) throw new SeamError("rate_limited");
  const now = opsNow();

  // 1. presence: the first Next of the day is the agent's "I'm here" (OD60); an explicit break is respected
  const profile = await profileOf(scope, uid);
  if (profile?.presence === "break") return { ok: false, reason: "on_break" };
  if (!profile || profile.presence === "offline") await writePresence(scope, uid, "online", now);
  else await touchAgent(scope, uid);
  const ops = await getStoreSetting(scope, "ops");

  // 2. resume the agent's active claim (one per agent, OD7); the press renews its lease
  const held = await activeClaimOf(scope, uid, now);
  if (held) {
    await renewHeldLease(scope, uid, now, ops.leaseMinutes, held.id);
    const row = await cardRow(scope, held.id);
    if (row) {
      const leaseUntil = row.leaseUntil ?? new Date(now.getTime() + ops.leaseMinutes * 60_000);
      return { ok: true, order: await buildQueueOrder(scope, row, ctx, { leaseUntil, mine: true, maxCalls: ops.rescue.maxCalls }), leaseUntil: leaseUntil.toISOString(), resumed: true };
    }
  }

  // 3. the calling window ("Open calls now" included)
  const w = await callingWindowFor(scope);
  const open = isCallable(now, w);
  if (!open.open) return { ok: false, reason: "outside_window", opensAt: iso(open.opensAt) };

  // 4. the daily cap (decided orders today, store-local day)
  if (profile?.dailyCap != null && (await decidedToday(scope, uid, w.tz, now)) >= profile.dailyCap) return { ok: false, reason: "cap_reached" };

  // 5. the claim: one statement, retried once on a lock wait or a deadlock, then "empty"
  const args: ClaimArgs = { uid, tok: newId(), now, until: new Date(now.getTime() + ops.leaseMinutes * 60_000), manual: ops.assignment === "manual", skipped: skippedBy(scope, uid, now.getTime()) };
  const claimed = await retryTransientOnce(() => claimOnce(scope, args), "busy" as const);
  if (claimed === "busy") return { ok: false, reason: "empty", nextDueAt: null };
  if (!claimed) return { ok: false, reason: "empty", nextDueAt: await nextDueAt(scope, w, now) };

  // 6. the events (OD46 attribution first), then the managers' batched notice
  if (await claimEvents(scope, uid, claimed, now, "claim")) await runAfterCommit("ops:abandoned", () => notifyAbandoned(scope));

  // 7. the card
  return {
    ok: true,
    order: await buildQueueOrder(scope, claimed.row, ctx, { leaseUntil: claimed.until, mine: true, maxCalls: ops.rescue.maxCalls }),
    leaseUntil: claimed.until.toISOString(),
    resumed: false,
  };
}

/* ------------------------------------------------------------------ */
/* skip, break, renewals, the lifecycle                                */
/* ------------------------------------------------------------------ */

/**
 * Skip or Break (agents.self, OPE-§5.2): the agent's claim on `orderId` ends (`released`); a skipped order is not
 * handed back to this agent for 10 minutes. Another agent's order, or an order not held, answers `not_found`.
 */
export async function releaseOrder(ctx: WriteCtx, orderId: string, why: "skip" | "break"): Promise<ActionResult<void>> {
  if (!ctx.can("agents.self")) return { ok: false, error: "forbidden" };
  if (why !== "skip" && why !== "break") return { ok: false, error: "invalid" };
  if (!validId(orderId)) return { ok: false, error: "not_found" };
  const released = await releaseClaims(ctx.scope, ctx.user.id, orderId, why, { kind: "user", userId: ctx.user.id });
  if (!released.length) return { ok: false, error: "not_found" };
  if (why === "skip") rememberSkip(ctx.scope, ctx.user.id, orderId, Date.now());
  return { ok: true, data: undefined };
}

/** Every action of the claim holder on the order renews its lease (OPE-§5.2); an expired lease stays expired. */
export async function renewLease(scope: WriteScope, orderId: string, userId: string): Promise<void> {
  if (!validId(orderId)) return;
  const { leaseMinutes } = await getStoreSetting(scope, "ops");
  await renewHeldLease(scope, userId, opsNow(), leaseMinutes, orderId);
}

/**
 * Every lease of the store, released: `claim_token` and `lease_until` cleared, one `released` event (why
 * "store_state", actor system) per order. Agents of a restricted store re-claim on their next `N` (OPE-§27.5).
 */
export async function releaseAllLeases(scope: WriteScope): Promise<{ released: number }> {
  return db.transaction(async (tx) => {
    const rows = await tx.select({ id: orders.id, rev: orders.rev }).from(orders).where(whereStore(orders, scope, isNotNull(orders.claimToken))).for("update");
    if (!rows.length) return { released: 0 };
    await tx
      .update(orders)
      .set({ claimToken: null, leaseUntil: null, rev: sql`${orders.rev} + 1` })
      .where(
        whereStore(
          orders,
          scope,
          inArray(
            orders.id,
            rows.map((r) => r.id),
          ),
          isNotNull(orders.claimToken),
        ),
      );
    await appendEvents(
      tx,
      scope,
      rows.map((r) => ({ orderId: r.id, actorKind: "system" as const, actorId: null, type: "released" as const, reasonCode: "store_state", meta: { why: "store_state" }, rev: r.rev + 1 })),
    );
    return { released: rows.length };
  });
}

/* ------------------------------------------------------------------ */
/* assignment (OPE-§5.6)                                               */
/* ------------------------------------------------------------------ */

/** The member may take calls in this store (an active membership whose role holds agents.self). */
async function callTaker(scope: StoreScope, userId: string): Promise<boolean> {
  const [m] = await db
    .select({ role: storeMembers.role })
    .from(storeMembers)
    .where(whereStore(storeMembers, scope, eq(storeMembers.userId, userId), eq(storeMembers.status, "active")))
    .limit(1);
  return !!m && can(m.role, "agents.self");
}

export type AssignOutcome = { id: string; ok: true } | { id: string; ok: false; error: "not_found" | "illegal" };

/**
 * A manager's assignment (orders.assign, ≤ 200 ids, OPE-§5.6): the assignee set and, for a live agent, a lease of
 * `rebalanceMinutes` (a callback keeps `due_at + grace`); `null` returns the orders to the pool. Any claim on the order
 * ends (`released`, why "manager"), so the holder's card answers `conflict` on its next write. Events `assigned` /
 * `unassigned` (by "manual"). Open orders only (either lane); per-order results.
 */
export async function assignOrders(ctx: WriteCtx, ids: readonly string[], userId: string | null): Promise<ActionResult<{ results: AssignOutcome[] }>> {
  if (!ctx.can("orders.assign")) return { ok: false, error: "forbidden" };
  const unique = [...new Set(ids)];
  if (!unique.length || unique.length > ASSIGN_MAX) return { ok: false, error: "invalid" };
  const { scope } = ctx;
  if (userId !== null && !(await callTaker(scope, userId))) return { ok: false, error: "not_found" };
  const now = opsNow();
  const ops = await getStoreSetting(scope, "ops");
  const live = userId !== null && (await profileOf(scope, userId).then((p) => !!p && isLive(p, now)));
  const valid = unique.filter(validId);
  const results = await db.transaction(async (tx) => {
    const rows = valid.length
      ? await tx
          .select({ id: orders.id, rev: orders.rev, assigneeId: orders.assigneeId, claimToken: orders.claimToken, confirmState: orders.confirmState, shipState: orders.shipState, dueAt: orders.dueAt })
          .from(orders)
          .where(whereStore(orders, scope, inArray(orders.id, valid)))
          .for("update")
      : [];
    const byOrder = new Map(rows.map((r) => [r.id, r]));
    const out: AssignOutcome[] = [];
    const events: NewOrderEvent[] = [];
    for (const id of unique) {
      const r = byOrder.get(id);
      if (!r) {
        out.push({ id, ok: false, error: "not_found" });
        continue;
      }
      if (laneOf({ confirm: r.confirmState, ship: r.shipState }) === null || r.shipState === "postponed") {
        out.push({ id, ok: false, error: "illegal" });
        continue;
      }
      const callback = r.confirmState === "callback" && r.dueAt;
      const leaseUntil = userId === null ? null : callback ? new Date(r.dueAt!.getTime() + ops.callbackGraceMinutes * 60_000) : live ? new Date(now.getTime() + ops.rebalanceMinutes * 60_000) : null;
      const rev = r.rev + 1;
      await tx.update(orders).set({ assigneeId: userId, leaseUntil, claimToken: null, rev }).where(and(byId(orders, scope, id), eq(orders.rev, r.rev)));
      if (r.claimToken && r.assigneeId) events.push({ orderId: id, actorKind: "user", actorId: ctx.user.id, type: "released", reasonCode: "manager", meta: { why: "manager" }, rev });
      if (userId !== null) events.push({ orderId: id, actorKind: "user", actorId: ctx.user.id, type: "assigned", meta: { to: userId, by: "manual" }, rev });
      else if (r.assigneeId) events.push({ orderId: id, actorKind: "user", actorId: ctx.user.id, type: "unassigned", meta: { by: "manual" }, rev });
      out.push({ id, ok: true });
    }
    if (events.length) await appendEvents(tx, scope, events);
    return out;
  });
  return { ok: true, data: { results } };
}

/**
 * The assignment of a new order (OPE-§5.6, the `ops.created` hook). `round_robin`: among live agents under their
 * daily cap, smooth weighted round-robin (`rr_credit += weight`; the highest wins; its credit − Σ weights), under
 * `storeLock(sid, "rr")` with a 1 s wait; the order gets the agent and a lease of `rebalanceMinutes` (event
 * `assigned`, by "rr"). The lock not acquired, or nobody live → the order stays in the pool. `pull` and `manual`:
 * nothing. Test orders are assigned like any order (they are claimable, OD31). Rules (OP-18) are R2.
 */
export async function assignOnCreate(scope: WriteScope, order: { id: string; isTest: boolean }): Promise<{ assigned: string | null }> {
  const ops = await getStoreSetting(scope, "ops");
  if (ops.assignment !== "round_robin" || !validId(order.id)) return { assigned: null };
  const store = await getStoreById(scope.storeId);
  const tz = store?.timezone || "Africa/Casablanca";
  const r = await withNamedLock(storeLock(scope.storeId, "rr"), RR_LOCK_SEC, () => assignRoundRobin(scope, order.id, ops, tz));
  return r.ran ? r.value : { assigned: null };
}

async function assignRoundRobin(scope: WriteScope, orderId: string, ops: OpsSetting, tz: string): Promise<{ assigned: string | null }> {
  const now = opsNow();
  const online = await db
    .select({ userId: agentProfiles.userId, presence: agentProfiles.presence, lastSeenAt: agentProfiles.lastSeenAt, weight: agentProfiles.weight, rrCredit: agentProfiles.rrCredit, dailyCap: agentProfiles.dailyCap, role: storeMembers.role })
    .from(agentProfiles)
    .innerJoin(storeMembers, and(inStore(storeMembers, scope), eq(storeMembers.userId, agentProfiles.userId), eq(storeMembers.status, "active")))
    .where(whereStore(agentProfiles, scope, eq(agentProfiles.presence, "online")));
  const live: typeof online = [];
  for (const a of online) {
    if (!isLive(a, now) || !can(a.role, "agents.self")) continue;
    if (a.dailyCap != null && (await decidedToday(scope, a.userId, tz, now)) >= a.dailyCap) continue;
    live.push(a);
  }
  if (!live.length) return { assigned: null };
  const weightOf = (a: (typeof live)[number]) => Math.min(5, Math.max(1, a.weight));
  const total = live.reduce((s, a) => s + weightOf(a), 0);
  const credit = new Map(live.map((a) => [a.userId, a.rrCredit + weightOf(a)]));
  const pick = [...live].sort((x, y) => credit.get(y.userId)! - credit.get(x.userId)! || x.userId.localeCompare(y.userId))[0]!;
  credit.set(pick.userId, credit.get(pick.userId)! - total);
  const res = await db
    .update(orders)
    .set({ assigneeId: pick.userId, leaseUntil: new Date(now.getTime() + ops.rebalanceMinutes * 60_000), rev: sql`${orders.rev} + 1` })
    .where(and(byId(orders, scope, orderId), isNull(orders.assigneeId), isNull(orders.claimToken), inArray(orders.confirmState, [...OPEN_CONFIRM])));
  if (affectedRows(res) !== 1) return { assigned: null };
  // every live agent's new credit in one statement (30 agents online must not mean 30 writes per order)
  const cases = sql.join(
    live.map((a) => sql`WHEN ${a.userId} THEN ${credit.get(a.userId)!}`),
    sql` `,
  );
  await db
    .update(agentProfiles)
    .set({ rrCredit: sql`CASE ${agentProfiles.userId} ${cases} ELSE ${agentProfiles.rrCredit} END` })
    .where(
      whereStore(
        agentProfiles,
        scope,
        inArray(
          agentProfiles.userId,
          live.map((a) => a.userId),
        ),
      ),
    );
  const [row] = await db.select({ rev: orders.rev }).from(orders).where(byId(orders, scope, orderId)).limit(1);
  await appendEvents(db, scope, [{ orderId, actorKind: "system", actorId: null, type: "assigned", meta: { to: pick.userId, by: "rr" }, rev: row?.rev ?? null }]);
  return { assigned: pick.userId };
}

/* ------------------------------------------------------------------ */
/* take one order (OPE-§5.7 step 2)                                    */
/* ------------------------------------------------------------------ */

/**
 * "Take this order": the §5.2 claim on one id, ignoring `due_at` and the lane order (the customer called, or a
 * manager opened it). An agent takes only what they see (OD12): their own orders, or, with `inbound`, the ids of their
 * exact-phone lookups of the last 10 minutes. A callback whose owner holds no active claim on it is takeable; the
 * owner's `assignee_id` moves to the taker (`assigned`, by "inbound"). An agent holding another order releases it
 * first (one active claim per agent). Another store's id, or one the taker cannot see, answers `not_found`.
 */
export async function takeOrder(ctx: WriteCtx, orderId: string, opts: { inbound: boolean }): Promise<TakeResult> {
  if (!validId(orderId) || !ctx.can("agents.self")) return { ok: false, error: "not_found" };
  return oneAtATime(ctx.scope, ctx.user.id, () => takeTurn(ctx, orderId, opts));
}

async function takeTurn(ctx: WriteCtx, orderId: string, opts: { inbound: boolean }): Promise<TakeResult> {
  const { scope } = ctx;
  const uid = ctx.user.id;
  const [seen] = await db
    .select({ id: orders.id, assigneeId: orders.assigneeId, confirmedBy: orders.confirmedBy, confirmState: orders.confirmState, shipState: orders.shipState })
    .from(orders)
    .where(byId(orders, scope, orderId))
    .limit(1);
  if (!seen || !viewerSeesOrder(scope, viewerOf(ctx), seen, opts.inbound)) return { ok: false, error: "not_found" };
  const callable = (OPEN_CONFIRM as readonly string[]).includes(seen.confirmState) || (seen.confirmState === "confirmed" && seen.shipState === "attempt_failed");
  if (!callable) return { ok: false, error: "not_callable" };
  const now = opsNow();
  const ops = await getStoreSetting(scope, "ops");
  const held = await activeClaimOf(scope, uid, now);
  if (held && held.id !== orderId) await releaseClaims(scope, uid, held.id, "skip", { kind: "user", userId: uid });
  const args: ClaimArgs = { uid, tok: newId(), now, until: new Date(now.getTime() + ops.leaseMinutes * 60_000), manual: false, skipped: [] };
  const claimed = await retryTransientOnce(() => claimOnce(scope, args, eq(orders.id, orderId)), "busy" as const);
  if (claimed === "busy" || !claimed) return { ok: false, error: "held" };
  if (await claimEvents(scope, uid, claimed, now, opts.inbound ? "inbound" : "claim")) await runAfterCommit("ops:abandoned", () => notifyAbandoned(scope));
  return {
    ok: true,
    order: await buildQueueOrder(scope, claimed.row, ctx, { leaseUntil: claimed.until, mine: true, maxCalls: ops.rescue.maxCalls, inbound: opts.inbound }),
    leaseUntil: claimed.until.toISOString(),
    resumed: false,
  };
}

/* ------------------------------------------------------------------ */
/* the pulse (OPE-§27.3)                                               */
/* ------------------------------------------------------------------ */

const isRole = (r: string): r is StoreRole => (STORE_ROLES as readonly string[]).includes(r);

/** each viewer's orders cursor (`${userId}` per store): the instant they last looked at the orders, 24 h */
const ordersCursor = scopedCache<number>({ name: "ops-orders-cursor", maxEntries: 20_000, ttlMs: 24 * 3_600_000 });

/**
 * The viewer looked at the orders (the orders list, the queue): `newOrders` counts from now on (OPE-§27.3). Called by
 * the orders and queue screens (P4); a process restart forgets it and the count falls back to the store's day.
 */
export function markOrdersSeen(scope: StoreScope, userId: string, at: Date = opsNow()): void {
  ordersCursor.set(scope.storeId, userId, at.getTime());
}

/**
 * The queue's pulse counters (OD33). `newOrders` = real orders created since the viewer's cursor (`markOrdersSeen`;
 * without one, since the start of the store-local day), the "3 new" the shell shows until the viewer opens the orders
 * again: a cursor that moves only when they look, so the number holds still between polls (`ETag` → 304). `queueNow` =
 * orders due in either lane with no active lease (the window is the console's banner, not this number);
 * `dueCallbacks` = due callbacks, the viewer's own for an agent, all for a viewer with `orders.read_all`; `syncFailed`
 * = `sheet_status = failed` + dead outbox items (P5's contributor reports it). Test orders count in `queueNow` and
 * `dueCallbacks` (the queue hands them out with a TEST chip, OD31), never in `newOrders`. The store parts are cached
 * 5 s per store; the viewer's parts (`newOrders` from their cursor, an agent's callbacks) are read fresh, one range
 * read each (`orders_store_test_idx`, `orders_assignee_idx`).
 */
export async function opsPulse(scope: StoreScope, viewer: Parameters<PulseContributor["contribute"]>[1]): Promise<OpsPulse> {
  const now = opsNow();
  const store = await pulseCache.getOrLoad(scope.storeId, "store", async () => {
    const free = or(isNull(orders.leaseUntil), lt(orders.leaseUntil, now));
    const [[callable], [callbacks], [sheets], [dead]] = await Promise.all([
      db.select({ n: count() }).from(orders).where(whereStore(orders, scope, dueLanes(now), free)),
      db.select({ n: count() }).from(orders).where(whereStore(orders, scope, eq(orders.confirmState, "callback"), lte(orders.dueAt, now))),
      db.select({ n: count() }).from(orders).where(whereStore(orders, scope, eq(orders.sheetStatus, "failed"))),
      db.select({ n: count() }).from(outbox).where(whereStore(outbox, scope, eq(outbox.state, "dead"))),
    ]);
    const tz = (await getStoreById(scope.storeId))?.timezone || "Africa/Casablanca";
    return { queueNow: Number(callable?.n ?? 0), dueCallbacksAll: Number(callbacks?.n ?? 0), syncFailed: Number(sheets?.n ?? 0) + Number(dead?.n ?? 0), dayStart: instantAt(storeYmd(now, tz), "00:00", tz).getTime() };
  });
  const since = new Date(ordersCursor.get(scope.storeId, viewer.userId) ?? store.dayStart);
  const all = isRole(viewer.role) && can(viewer.role, "orders.read_all");
  const [[fresh], mine] = await Promise.all([
    db.select({ n: count() }).from(orders).where(whereStore(orders, scope, eq(orders.isTest, false), gt(orders.createdAt, since))),
    all ? Promise.resolve(null) : db.select({ n: count() }).from(orders).where(whereStore(orders, scope, eq(orders.assigneeId, viewer.userId), eq(orders.confirmState, "callback"), lte(orders.dueAt, now))),
  ]);
  return { newOrders: Number(fresh?.n ?? 0), dueCallbacks: mine ? Number(mine[0]?.n ?? 0) : store.dueCallbacksAll, queueNow: store.queueNow, syncFailed: store.syncFailed };
}
