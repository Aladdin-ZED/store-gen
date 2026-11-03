import "server-only";
/**
 * `transitionOrder` and `applyExternalStatus` (P4 CALL CENTER; operations.md OPE-§3.4-§3.7, OD3-OD6, OD12, OD53,
 * OD54; docs/STORE-SAAS.md §K.2 P0): the only writer of `orders.status`, `confirm_state`, `ship_state` and
 * `money_state` besides the creation insert (OPE-§3.7; `test:ops` greps `src/**` for any other writer).
 *
 * One transaction per write (OPE-§3.5):
 *   1. read the row by id in the scope's store (missing → not_found)
 *   2. visibility: an agent acts only on the orders they hold or confirmed, or on an order of their inbound lookups
 *      when the action says the customer called (src/lib/callcenter/visibility.ts); otherwise not_found
 *   3. `planTransition` (./state.ts, pure): requested + implied + automatic moves, the projection, the column set
 *   4. UPDATE … SET …, status = projection, rev = rev + 1, sheet_dirty |= 1 when the projection changed
 *      WHERE store_id, id AND rev = :read (0 rows → conflict for people; re-read and retry ≤ 3 for external sources
 *      and the system)
 *   5. one `state_changed` event per move (+ `call_attempt`, + `hold_set`), each carrying the new rev
 *   6. the `inTx` order hooks with the transaction handle (customer counters, outbox items)
 *   7. commit, then the `afterCommit` hooks inside after() in a request, inline in jobs and tests
 * A no-op request answers `changed: false` and writes nothing. Forced moves (orders.force_status + a reason, one axis)
 * carry `forced: true` and write `audit("orders.status_forced")`.
 *
 * External sources (a sheet, a carrier file, an import, the API) go through `applyExternalStatus`: never forced, never
 * role-checked, legality, implication and terminal protection kept (OD5); a refused move writes `external_rejected`
 * and sets `sheet_dirty |= 1` so the app's label returns to the sheet. R1 limits (0005 schema): the money state
 * `refunded` and the partial-delivery `lines` are R2 (0006) and answer `illegal`; `collectedCents` is validated and kept
 * in the event meta only (the column arrives with 0006).
 *
 * The scope is a `WriteScope` (D71). The order hooks receive the same scope.
 *
 * P4 step 3: `transitionForOutcome` is the same write for a call outcome (src/lib/callcenter/outcomes.ts): the moves the
 * outcome makes itself (exhaustion's unreachable, reschedule's postponed) get the system class, exhaustion's move is
 * recorded as the system's, and the outcome's own events (delivery_rescue, recall_requested, its note) join the same
 * transaction. The clock is `Date.now()`, so the queue's fake-clock suite reaches the writer too.
 */
import { and, eq, sql } from "drizzle-orm";
import { after } from "next/server";
import { audit } from "@/lib/audit";
import { ladderNext } from "@/lib/callcenter/ladder";
import { viewerSeesOrder } from "@/lib/callcenter/visibility";
import type { AttemptOutcome, DeliveryOutcome } from "@/lib/callcenter/outcomes";
import { db } from "@/lib/db/client";
import { orders } from "@/lib/db/schema";
import { toCents } from "@/lib/finance/lite/cents";
import { getStoreSetting } from "@/lib/settings";
import type { OpsSetting } from "@/lib/settings/keys/ops";
import { getStoreById } from "@/lib/tenancy/public";
import { byId } from "@/lib/tenancy/sql";
import type { StoreCtx, SystemCtx, WriteCtx, WriteScope } from "@/lib/tenancy/types";
import type { OrderStatus } from "./contract";
import { appendEvents, countRescueCalls, type NewOrderEvent } from "./events";
import { runOrderHooks, type OrderHookEvent, type OrderRow, type Tx } from "./hooks";
import { logError } from "./log";
import {
  legacyToWanted,
  movePermsOf,
  planTransition,
  projectStatus,
  type CancelReason,
  type MoneyState,
  type Move,
  type MoveClass,
  type MovePerms,
  type OrderActor,
  type OrderSnapshot,
  type OrderStates,
  type PlanSet,
  type ReturnReason,
  type ShipState,
  type TransitionSource,
} from "./state";

/** P4 step 1: the actor type lives in the pure ./state.ts (the plan reads it); re-exported unchanged. */
export type { OrderActor } from "./state";

/** The actor of a member's request (kind "user") or of a job (kind "system"), for `transitionOrder`. */
export function actorFrom(ctx: StoreCtx | SystemCtx, kind?: OrderActor["kind"]): OrderActor {
  if ("job" in ctx) return { kind: kind ?? "system", userId: null };
  return { kind: kind ?? "user", userId: ctx.user.id, can: (p) => ctx.can(p), role: ctx.membership.role };
}

export interface TransitionInput {
  orderId: string;
  want: Partial<OrderStates>;
  source: TransitionSource;
  /** UI passes the rev it rendered; external sources omit it (internal retry ×3) */
  expectRev?: number;
  /** coded; † moves refuse without it (≥ 3 chars for free text) */
  reason?: CancelReason | string;
  /** ≤ 500 */
  note?: string;
  /** callback: > now, ≤ now + 30 days */
  dueAt?: Date;
  /** must be an order of the same store and phone */
  duplicateOf?: string;
  /** orders.force_status + reason; any from → to on one axis */
  force?: boolean;
  /** written as call_attempt in the same transaction */
  attempt?: { channel: "call" | "whatsapp"; outcome: AttemptOutcome | DeliveryOutcome; lane?: "confirm" | "delivery" };
  extra?: Partial<Pick<OrderRow, "dueAt" | "attempts" | "assigneeId" | "leaseUntil" | "claimToken" | "firstTouchAt" | "priority" | "cancelReason">>;
  /** external reference for the event meta (sheet row, import run, webhook delivery) */
  ref?: string;
  // rev 3 (additive):
  /** ship → refused / returned / lost (OD50) */
  returnReason?: ReturnReason;
  /** confirm → confirmed with a hold, ship → postponed (OD49); null removes a hold */
  shipAfter?: Date | null;
  /** ship → delivered (R2, OD51); default = total; 0 ≤ x ≤ total cents */
  collectedCents?: number;
  /** R2 partial delivery (OD51), written as line_outcome */
  lines?: { i: number; state: "delivered" | "refused" | "pending"; qty: number }[];
  /** OD53: the customer called; relaxes the OD12 visibility rule for a looked-up order */
  inbound?: boolean;
}

export type TransitionError = "not_found" | "illegal" | "conflict" | "reason_required" | "forbidden" | "locked_ship" | "bad_due" | "bad_duplicate" | "bad_hold" | "bad_amount";
export type TransitionResult =
  | { ok: true; rev: number; states: OrderStates; status: OrderStatus; eventIds: number[]; changed: boolean }
  | { ok: false; error: TransitionError; current?: { rev: number; states: OrderStates; status: OrderStatus } };
type NoopResult = { ok: true; changed: false; noop: true };

/* ------------------------------------------------------------------ */
/* the write                                                           */
/* ------------------------------------------------------------------ */

const ORDER_ID_RE = /^[A-Z0-9]{2,8}-[A-Z0-9]{4,12}$/;
const EXTERNAL: ReadonlySet<TransitionSource> = new Set(["sheet", "carrier", "import", "api"]);
/** no-contact outcomes: the ladder's attempts (`orders.attempts`) */
const NO_CONTACT: ReadonlySet<string> = new Set(["no_answer", "busy", "switched_off"]);
const CODED_REASON = /^[a-z0-9_]{1,32}$/;
const MAX_TRIES = 3;

/** The order columns one write reads (OPE-§3.5 step 1). */
const CUR = {
  id: orders.id,
  rev: orders.rev,
  status: orders.status,
  confirmState: orders.confirmState,
  shipState: orders.shipState,
  moneyState: orders.moneyState,
  isTest: orders.isTest,
  customerId: orders.customerId,
  assigneeId: orders.assigneeId,
  confirmedBy: orders.confirmedBy,
  cityKey: orders.cityKey,
  phone: orders.phone,
  total: orders.total,
  riskScore: orders.riskScore,
  attempts: orders.attempts,
  deliveryAttempts: orders.deliveryAttempts,
  priority: orders.priority,
  shippedAt: orders.shippedAt,
  firstTouchAt: orders.firstTouchAt,
  dueAt: orders.dueAt,
  createdAt: orders.createdAt,
};
const readRow = (tx: Tx | typeof db, scope: WriteScope, id: string) => tx.select(CUR).from(orders).where(byId(orders, scope, id)).limit(1);
type CurRow = Awaited<ReturnType<typeof readRow>>[number];

const statesOf = (r: Pick<CurRow, "confirmState" | "shipState" | "moneyState">): OrderStates => ({ confirm: r.confirmState, ship: r.shipState, money: r.moneyState as MoneyState });
const currentOf = (r: CurRow) => {
  const states = statesOf(r);
  return { rev: r.rev, states, status: projectStatus(states) };
};

/** An order as the hooks see it (OPE-§3.6). */
function snapshotOf(r: CurRow, over: Partial<PlanSet> & { rev?: number; states?: OrderStates } = {}): OrderSnapshot {
  const states = over.states ?? statesOf(r);
  return {
    id: r.id,
    rev: over.rev ?? r.rev,
    status: projectStatus(states),
    states,
    isTest: r.isTest,
    customerId: r.customerId,
    assigneeId: over.assigneeId !== undefined ? over.assigneeId : r.assigneeId,
    cityKey: r.cityKey,
    totalCents: toCents(r.total),
    confirmedBy: over.confirmedBy !== undefined ? over.confirmedBy : r.confirmedBy,
    attempts: over.attempts ?? r.attempts,
    dueAt: over.dueAt !== undefined ? over.dueAt : r.dueAt,
    createdAt: r.createdAt,
  };
}

/** What one write needs beyond the row: read once before the transaction, only when the request can use it. */
interface Preload {
  settlement: "at_delivery" | "statement";
  maxCalls: number;
  agentLabels: Record<string, string>;
  ladder: { ops: OpsSetting; tz: string } | null;
}

async function preload(scope: WriteScope, need: { delivered: boolean; rescue: boolean; labels: boolean; ladder: boolean }): Promise<Preload> {
  const out: Preload = { settlement: "at_delivery", maxCalls: 0, agentLabels: {}, ladder: null };
  if (need.delivered) out.settlement = (await getStoreSetting(scope, "accounting")).myCarrier.settlement;
  if (need.rescue || need.labels || need.ladder) {
    const ops = await getStoreSetting(scope, "ops");
    out.maxCalls = ops.rescue.maxCalls;
    out.agentLabels = ops.agentLabels;
    if (need.ladder) out.ladder = { ops, tz: (await getStoreById(scope.storeId))?.timezone ?? "Africa/Casablanca" };
  }
  return out;
}

/** One write, as the three entry points describe it. */
interface Job {
  actor: OrderActor;
  scope: WriteScope;
  input: TransitionInput;
  /** the wanted states from the current ones (legacy labels); default `input.want` */
  wantOf?: (cur: OrderStates) => Partial<OrderStates> | "noop" | "reject";
  /** request fields that depend on the current row (a legacy no_answer's attempt, a callback's due time) */
  shapeOf?: (row: CurRow, pre: Preload, now: Date) => Pick<TransitionInput, "attempt" | "extra" | "dueAt" | "reason" | "note">;
  /** an external source: the label it wanted, its reference and the sheet's Agent cell */
  external?: { wanted: string; ref?: string; agentLabel?: string; at?: Date };
  /** a "noop" answers the external shape */
  noopShape?: boolean;
  pre: Preload;
  /** P4 step 3 (an outcome's own moves, OPE-§6.1a, §6.3): classes the plan may use beyond the actor's */
  grant?: readonly MoveClass[];
  /** the requested moves are the system's (OPE-§6.3: exhaustion closes the order, actor and source "system") */
  systemMoves?: boolean;
  /** the call_attempt meta the outcome sets itself: the rescue call's number (OD48), the objection chip (OPE-§7.2) */
  attemptMeta?: { attemptNo?: number; objectionId?: string };
  /** more events of the same transaction, after the transition's own (delivery_rescue, recall_requested, a note) */
  events?: (base: { orderId: string; rev: number; at: Date }) => NewOrderEvent[];
}

type Attempt =
  | { kind: "done"; result: TransitionResult | NoopResult; hook?: OrderHookEvent; forced?: { from: string; to: string; axis: string; reason: string } }
  | { kind: "retry"; current: ReturnType<typeof currentOf> };

/** The actor's move classes, plus the ones a job is granted (an outcome's own moves, OPE-§6.1a, §6.3). */
function withGrant(perms: MovePerms, grant: readonly MoveClass[] | undefined): MovePerms {
  return grant?.length ? { ...perms, classes: new Set([...perms.classes, ...grant]) } : perms;
}

const errCode = (err: unknown) => (err as { code?: string; cause?: { code?: string } })?.code ?? (err as { cause?: { code?: string } })?.cause?.code;
const transient = (err: unknown) => ["ER_LOCK_DEADLOCK", "ER_LOCK_WAIT_TIMEOUT"].includes(String(errCode(err)));

/** Work after the commit: inside after() in a request, inline (awaited) without one (jobs, tests). Never throws. */
export async function runAfterCommit(label: string, task: () => Promise<void>): Promise<void> {
  const guarded = () => task().catch((err) => logError(label, err));
  try {
    after(guarded);
  } catch {
    await guarded();
  }
}

async function run(job: Job): Promise<TransitionResult | NoopResult> {
  const people = !EXTERNAL.has(job.input.source) && job.actor.kind !== "system" && job.input.source !== "system";
  const tries = people ? 1 : MAX_TRIES;
  for (let i = 0, deadlocks = 0; ; i++) {
    let a: Attempt;
    try {
      a = await db.transaction((tx: Tx) => attempt(tx, job));
    } catch (err) {
      if (transient(err) && deadlocks++ < 1) {
        i--;
        continue;
      }
      throw err;
    }
    if (a.kind === "retry") {
      if (i + 1 < tries) continue;
      // the row moved between the read and the UPDATE: answer the state it has now, so the UI re-renders it
      const [fresh] = await readRow(db, job.scope, job.input.orderId);
      return { ok: false, error: "conflict", current: fresh ? currentOf(fresh) : a.current };
    }
    const { hook, forced } = a;
    if (hook) await runAfterCommit("orders:hooks", () => runOrderHooks("transition", "afterCommit", job.scope, hook));
    if (forced) {
      await audit("orders.status_forced", {
        userId: job.actor.userId,
        target: job.input.orderId,
        meta: forced,
        scope: { storeId: job.scope.storeId, actorKind: job.actor.kind === "user" ? "user" : "system" },
      });
    }
    return a.result;
  }
}

async function attempt(tx: Tx, job: Job): Promise<Attempt> {
  const { actor, scope } = job;
  // Date.now() (not `new Date()`): a test's fake clock reaches the plan and its events (the queue's clock, OD8)
  const now = new Date(Date.now());
  const [row] = await readRow(tx, scope, job.input.orderId);
  if (!row) return { kind: "done", result: { ok: false, error: "not_found" } };
  if (!viewerSeesOrder(scope, actor, row, !!job.input.inbound)) return { kind: "done", result: { ok: false, error: "not_found" } };
  const current = currentOf(row);
  const fail = (error: TransitionError): Attempt => ({ kind: "done", result: { ok: false, error, current } });
  if (job.input.expectRev !== undefined && job.input.expectRev !== row.rev) return fail("conflict");

  const shaped = job.shapeOf ? job.shapeOf(row, job.pre, now) : {};
  const input: TransitionInput = { ...job.input, ...shaped, extra: { ...job.input.extra, ...shaped.extra } };
  const want = job.wantOf ? job.wantOf(current.states) : input.want;
  if (want === "noop") {
    return { kind: "done", result: job.noopShape ? { ok: true, changed: false, noop: true } : { ok: true, ...current, eventIds: [], changed: false } };
  }
  const perms = withGrant(movePermsOf(actor, input.source), job.grant);
  if (want === "reject") return perms.external ? rejected(tx, job, row, "illegal") : fail("illegal");
  // R2 (0006): partial deliveries and refunds have no columns yet
  if (input.lines?.length || want.money === "refunded") return fail("illegal");
  if (input.duplicateOf !== undefined) {
    const [dup] = await tx
      .select({ id: orders.id })
      .from(orders)
      .where(and(byId(orders, scope, input.duplicateOf), eq(orders.phone, row.phone)))
      .limit(1);
    if (!dup || dup.id === row.id) return fail("bad_duplicate");
  }
  const rescueCallsSoFar = want.ship === "attempt_failed" ? await countRescueCalls(tx, scope, row.id) : 0;

  const plan = planTransition(
    {
      id: row.id,
      states: current.states,
      totalCents: toCents(row.total),
      riskScore: row.riskScore,
      attempts: row.attempts,
      deliveryAttempts: row.deliveryAttempts,
      priority: row.priority,
      shippedAt: row.shippedAt,
    },
    { want, source: input.source, reason: input.reason, dueAt: input.dueAt, duplicateOf: input.duplicateOf, force: input.force, extra: input.extra, returnReason: input.returnReason, shipAfter: input.shipAfter, collectedCents: input.collectedCents },
    perms,
    { now, settlement: job.pre.settlement, rescueCallsSoFar, maxCalls: job.pre.maxCalls, userId: actor.kind === "user" ? actor.userId : null },
  );
  if (!plan.ok) return perms.external && plan.error === "illegal" ? rejected(tx, job, row, plan.hint === "external_rejected" ? "terminal" : "illegal") : fail(plan.error);
  if (plan.moves.some((m) => m.axis === "money" && m.to === "refunded")) return fail("illegal");
  const extraGiven = Object.values(input.extra ?? {}).some((v) => v !== undefined);
  if (!plan.changed && !input.attempt && !extraGiven) return { kind: "done", result: { ok: true, ...current, eventIds: [], changed: false } };

  /* the column set (0005's columns only) */
  const s = plan.set;
  const set: Record<string, unknown> = {};
  const COLS = ["status", "confirmState", "shipState", "moneyState", "confirmedBy", "confirmedAt", "dueAt", "leaseUntil", "claimToken", "assigneeId", "attempts", "firstTouchAt", "priority", "cancelReason", "mergedInto", "deliveryAttempts", "shipAfter", "returnReason", "shippedAt", "deliveredAt", "finalAt"] as const;
  for (const k of COLS) if (s[k] !== undefined) set[k] = s[k];
  if (input.attempt && row.firstTouchAt === null && set.firstTouchAt === undefined) set.firstTouchAt = now;
  // an external source dates its own change (a carrier's "livré le …"): the milestones carry that moment
  const at = job.external?.at && job.external.at.getTime() <= now.getTime() ? job.external.at : now;
  if (at !== now) for (const k of ["confirmedAt", "shippedAt", "deliveredAt", "finalAt"] as const) if (set[k] === now) set[k] = at;
  // the sheet's Agent cell (OD54): the confirmation this write applies is attributed to the mapped member, else the label
  const confirms = plan.moves.find((m) => m.axis === "confirm" && m.to === "confirmed");
  const agentLabel = job.external?.agentLabel?.trim().slice(0, 60) || undefined;
  if (confirms && agentLabel) {
    const member = job.pre.agentLabels[agentLabel];
    if (member) set.confirmedBy = member;
    else set.confirmedByLabel = agentLabel;
  }
  const projectionChanged = plan.status !== row.status;
  const res = await tx
    .update(orders)
    .set({ ...set, rev: sql`${orders.rev} + 1`, ...(projectionChanged ? { sheetDirty: sql`${orders.sheetDirty} | 1` } : {}), updatedAt: now })
    .where(and(byId(orders, scope, row.id), eq(orders.rev, row.rev)));
  if (affectedRows(res) !== 1) return { kind: "retry", current };
  const rev = row.rev + 1;

  /* the events (OPE-§2.2): the attempt, one state_changed per move, the hold */
  const events: NewOrderEvent[] = [];
  const base = { orderId: row.id, rev, at };
  const reason = input.reason?.trim() || undefined;
  const coded = reason && CODED_REASON.test(reason) ? reason : undefined;
  const freeText = input.note?.trim() || (reason && !coded ? reason : undefined);
  if (input.attempt) {
    const attempts = (set.attempts as number | undefined) ?? row.attempts;
    events.push({
      ...base,
      actorKind: actor.kind,
      actorId: actor.userId,
      type: "call_attempt",
      reasonCode: input.attempt.outcome,
      note: plan.moves.length ? null : (freeText ?? null),
      meta: {
        channel: input.attempt.channel,
        outcome: input.attempt.outcome,
        attemptNo: job.attemptMeta?.attemptNo ?? (NO_CONTACT.has(input.attempt.outcome) ? attempts : row.attempts + 1),
        ...(set.dueAt instanceof Date && set.dueAt.getTime() > now.getTime() ? { nextDueAt: set.dueAt.toISOString() } : {}),
        ...(input.attempt.lane === "delivery" ? { lane: "delivery" } : {}),
        ...(input.inbound ? { inbound: true } : {}),
        ...(job.attemptMeta?.objectionId ? { objectionId: job.attemptMeta.objectionId } : {}),
      },
    });
  }
  let noteUsed = false;
  for (const m of plan.moves) {
    // a person's (or source's) own move; an automatic side move, or a move the system makes for an outcome, is "system"
    const own = !m.auto && !job.systemMoves;
    const meta: Record<string, unknown> = { axis: m.axis, source: own ? input.source : "system" };
    if (m.implied) meta.implied = true;
    if (m.forced) meta.forced = true;
    if (m.auto) meta.auto = true;
    if (m.axis === "confirm" && m.to === "callback" && set.dueAt instanceof Date) meta.dueAt = set.dueAt.toISOString();
    if (m.axis === "confirm" && m.to === "duplicate" && input.duplicateOf) meta.duplicateOf = input.duplicateOf;
    if (m.axis === "confirm" && m.to === "confirmed" && agentLabel) meta.agentLabel = agentLabel;
    if (m.axis === "ship" && m.to === "delivered" && input.collectedCents !== undefined) meta.collectedCents = input.collectedCents;
    if (m.axis === "ship" && m.to === "attempt_failed") {
      if (plan.flags.deliveryLane) meta.deliveryLane = true;
      if (plan.flags.rescueExhausted) meta.rescueExhausted = true;
    }
    if (m.axis === "ship" && m.to === "postponed" && set.shipAfter !== undefined) meta.shipAfter = set.shipAfter instanceof Date ? set.shipAfter.toISOString() : null;
    if (m.axis === "money" && m.to === "remitted" && m.auto && plan.flags.settledAtDelivery) meta.settlement = "at_delivery";
    if (own && input.inbound) meta.inbound = true;
    if (own && job.external?.ref) meta.ref = job.external.ref.slice(0, 80);
    const reasonCode = m.auto ? null : m.axis === "ship" && (m.to === "refused" || m.to === "returned" || m.to === "lost") ? (input.returnReason ?? null) : m.axis === "confirm" ? (coded ?? null) : null;
    const note = own && !noteUsed && freeText ? freeText : null;
    if (note) noteUsed = true;
    events.push({ ...base, actorKind: own ? actor.kind : "system", actorId: own ? actor.userId : null, type: "state_changed", fromState: m.from, toState: m.to, reasonCode, note, meta });
  }
  if (plan.flags.hold !== undefined) {
    events.push({ ...base, actorKind: actor.kind, actorId: actor.userId, type: "hold_set", meta: { shipAfter: plan.flags.hold === null ? null : plan.flags.hold.toISOString() } });
  }
  if (job.events) events.push(...job.events(base));
  const eventIds = await appendEvents(tx, scope, events);

  /* the inTx hooks (customer counters, outbox items) */
  const after = snapshotOf(row, { ...(set as Partial<PlanSet>), rev, states: plan.states });
  const hook: OrderHookEvent = { on: "transition", before: snapshotOf(row), after, moves: plan.moves, actor, source: input.source };
  await runOrderHooks("transition", "inTx", scope, hook, tx);

  const forcedMove = plan.moves.find((m) => m.forced);
  return {
    kind: "done",
    // `changed` = a state (or the hold) moved; an attempt or bookkeeping alone still bumps rev and answers false
    result: { ok: true, rev, states: plan.states, status: plan.status, eventIds, changed: plan.changed },
    hook,
    ...(forcedMove ? { forced: { from: forcedMove.from, to: forcedMove.to, axis: forcedMove.axis, reason: reason ?? "" } } : {}),
  };
}

/** OD5: an external source asked for a move the app refuses. One `external_rejected`, and the sheet cell is rewritten. */
async function rejected(tx: Tx, job: Job, row: CurRow, why: "terminal" | "illegal"): Promise<Attempt> {
  const current = currentOf(row);
  await tx
    .update(orders)
    .set({ sheetDirty: sql`${orders.sheetDirty} | 1` })
    .where(byId(orders, job.scope, row.id));
  await appendEvents(tx, job.scope, [
    {
      orderId: row.id,
      actorKind: job.actor.kind,
      actorId: null,
      type: "external_rejected",
      toState: job.external?.wanted ?? null,
      meta: { source: job.input.source, wanted: (job.external?.wanted ?? "").slice(0, 24), why, ...(job.external?.ref ? { ref: job.external.ref.slice(0, 80) } : {}) },
    },
  ]);
  return { kind: "done", result: { ok: false, error: "illegal", current } };
}

const affectedRows = (res: unknown): number => {
  const head = Array.isArray(res) ? res[0] : res;
  const n = (head as { affectedRows?: number } | undefined)?.affectedRows;
  return typeof n === "number" ? n : 0;
};

/* ------------------------------------------------------------------ */
/* entry points                                                        */
/* ------------------------------------------------------------------ */

const validId = (id: unknown): id is string => typeof id === "string" && ORDER_ID_RE.test(id);

/** One transaction: legality, implied and automatic moves, the projection, events, then the order hooks (OPE-§3.5). */
export async function transitionOrder(actor: OrderActor, scope: WriteScope, input: TransitionInput): Promise<TransitionResult> {
  if (!validId(input.orderId)) return { ok: false, error: "not_found" };
  const pre = await preload(scope, { delivered: input.want.ship === "delivered", rescue: input.want.ship === "attempt_failed", labels: false, ladder: false });
  return (await run({ actor, scope, input, pre })) as TransitionResult;
}

/** What an outcome adds to its transition (src/lib/callcenter/outcomes.ts, OPE-§6.1, §6.1a, §6.3). */
export interface OutcomeTransitionOpts {
  /** classes beyond the actor's for the outcome's own moves: "S" for exhaustion and for reschedule's postponed */
  grant?: readonly MoveClass[];
  /** exhaustion: the requested move is the system's (actor and source "system"); the call_attempt stays the agent's */
  systemMoves?: boolean;
  /** the call_attempt meta set by the outcome (the rescue call's number, the objection chip) */
  attemptMeta?: { attemptNo?: number; objectionId?: string };
  /** more events in the same transaction (delivery_rescue, recall_requested, the outcome's note) */
  events?: (base: { orderId: string; rev: number; at: Date }) => NewOrderEvent[];
  /** the ladder or the settlement, read once before the transaction */
  preload?: { delivered?: boolean; rescue?: boolean };
}

/**
 * `transitionOrder` for a call outcome (P4 step 3; OPE-§6.1, §6.1a, §6.3): the same one transaction, plus the
 * outcome's own pieces. Not part of the P0 contract: `recordOutcome` is its only caller.
 */
export async function transitionForOutcome(actor: OrderActor, scope: WriteScope, input: TransitionInput, opts: OutcomeTransitionOpts = {}): Promise<TransitionResult> {
  if (!validId(input.orderId)) return { ok: false, error: "not_found" };
  const pre = await preload(scope, { delivered: !!opts.preload?.delivered, rescue: !!opts.preload?.rescue || input.want.ship === "attempt_failed", labels: false, ladder: false });
  return (await run({ actor, scope, input, pre, grant: opts.grant, systemMoves: opts.systemMoves, attemptMeta: opts.attemptMeta, events: opts.events })) as TransitionResult;
}

const SHIP_LABELS: ReadonlySet<OrderStatus> = new Set(["shipped", "in_transit", "delivered", "refused", "returned", "lost"]);

/**
 * The extra fields of a legacy label (OPE-§3.4): `no_answer` records one call attempt and the ladder's next time,
 * `callback` the ladder's next time, `cancelled` the code `other`.
 */
function legacyShape(label: OrderStatus | undefined, sourceNote: string | undefined) {
  return (row: CurRow, pre: Preload, now: Date): Pick<TransitionInput, "attempt" | "extra" | "dueAt" | "reason" | "note"> => {
    const next = (n: number) => {
      if (!pre.ladder) return undefined;
      const t = ladderNext(n, now, pre.ladder.ops, pre.ladder.tz);
      return t === "exhausted" ? undefined : t;
    };
    switch (label) {
      case "no_answer":
        return { attempt: { channel: "call", outcome: "no_answer" }, extra: { attempts: row.attempts + 1, dueAt: next(row.attempts + 1) ?? null } };
      case "callback":
        return { dueAt: next(row.attempts + 1) };
      case "cancelled":
        // an external source names no reason: the code "other" and the source as the note (OPE-§3.4); a person picks one
        return sourceNote ? { reason: "other" satisfies CancelReason, note: sourceNote } : {};
      default:
        return {};
    }
  };
}

/**
 * Sheets, carrier files, imports and the API: never forced, never role-checked, legality and implication kept (OPE-§3.4).
 *
 * `src.agentLabel` (≤ 60 characters, OD54, OPE-§19.6; P0b, CCR P4-2 / P5-2, additive): the sheet's Agent cell. The
 * confirmation the call applies (explicit or implied) writes `orders.confirmed_by_label`, or `confirmed_by` when
 * `ops.agentLabels` maps the label, and `meta.agentLabel` on its `state_changed` event.
 */
export async function applyExternalStatus(
  scope: WriteScope,
  orderId: string,
  ext: { legacy?: OrderStatus; ship?: ShipState; money?: MoneyState; at?: Date },
  src: { kind: "sheet" | "carrier" | "import" | "api"; ref?: string; agentLabel?: string },
): Promise<TransitionResult | { ok: true; changed: false; noop: true }> {
  if (!validId(orderId)) return { ok: false, error: "not_found" };
  const label = ext.legacy;
  const ship = ext.ship ?? (label && SHIP_LABELS.has(label) ? (label as ShipState) : undefined);
  const pre = await preload(scope, {
    delivered: ship === "delivered",
    rescue: ship === "attempt_failed",
    labels: !!src.agentLabel,
    ladder: label === "no_answer" || label === "callback",
  });
  const actor: OrderActor = { kind: src.kind === "sheet" ? "sheet" : src.kind === "carrier" ? "carrier" : "api", userId: null };
  const at = ext.at instanceof Date && !Number.isNaN(ext.at.getTime()) ? ext.at : undefined;
  const wanted = (label ?? (ext.ship ? `ship:${ext.ship}` : ext.money ? `money:${ext.money}` : "")).slice(0, 24);
  return run({
    actor,
    scope,
    pre,
    noopShape: true,
    input: { orderId, want: {}, source: src.kind, ...(src.ref ? { ref: src.ref } : {}) },
    external: { wanted, ...(src.ref ? { ref: src.ref } : {}), ...(src.agentLabel ? { agentLabel: src.agentLabel } : {}), ...(at ? { at } : {}) },
    wantOf: (cur) => {
      const fromLabel = label ? legacyToWanted(label, cur) : {};
      if (fromLabel === "reject") return "reject";
      const want: Partial<OrderStates> = { ...(fromLabel === "noop" ? {} : fromLabel) };
      if (ext.ship && ext.ship !== cur.ship) want.ship = ext.ship;
      if (ext.money && ext.money !== cur.money) want.money = ext.money;
      return Object.keys(want).length ? want : "noop";
    },
    shapeOf: legacyShape(label, src.kind),
  });
}

/** Options of a legacy move: a person's reason, a note, the force of a manager, the customer on the line. */
export interface LegacyMoveOpts {
  force?: boolean;
  reason?: string;
  note?: string;
  inbound?: boolean;
  /** P4 step 6: "bulk" for the list's bulk "Move to…" (OPE-§12.4); default "ui" */
  source?: "ui" | "bulk";
}

/**
 * The "Move to…" menu (OPE-§12.6, §3.7): a legacy label people know from the sheet, mapped by `legacyToWanted` to axis
 * moves and written by the one writer. "noop" answers `changed: false`; "reject" answers `illegal`. Force (managers
 * with `orders.force_status`) takes a reason.
 */
export function moveToLegacy(ctx: WriteCtx, id: string, label: OrderStatus, expectRev?: number, opts: LegacyMoveOpts = {}): Promise<TransitionResult> {
  return moveToLegacyAs(actorFrom(ctx), ctx.scope, id, label, expectRev, opts);
}

/** `moveToLegacy` for an actor built by the caller (the deprecated `updateOrderStatus` of ./admin.ts). */
export async function moveToLegacyAs(actor: OrderActor, scope: WriteScope, id: string, label: OrderStatus, expectRev?: number, opts: LegacyMoveOpts = {}): Promise<TransitionResult> {
  if (!validId(id)) return { ok: false, error: "not_found" };
  const ship = SHIP_LABELS.has(label) ? (label as ShipState) : undefined;
  const pre = await preload(scope, { delivered: ship === "delivered", rescue: false, labels: false, ladder: label === "no_answer" || label === "callback" });
  const shape = legacyShape(label, undefined);
  return (await run({
    actor,
    scope,
    pre,
    input: {
      orderId: id,
      want: {},
      source: opts.source ?? "ui",
      ...(expectRev !== undefined ? { expectRev } : {}),
      ...(opts.force ? { force: true } : {}),
      ...(opts.reason ? { reason: opts.reason } : {}),
      ...(opts.note ? { note: opts.note } : {}),
      ...(opts.inbound ? { inbound: true } : {}),
    },
    wantOf: (cur) => legacyToWanted(label, cur),
    // a person's own reason wins over the label's default code
    shapeOf: (row, p, now) => {
      const shaped = shape(row, p, now);
      return opts.reason ? { ...shaped, reason: opts.reason } : shaped;
    },
  })) as TransitionResult;
}

/* ------------------------------------------------------------------ */
/* undo (OPE-§12.5; P4 step 6)                                          */
/* ------------------------------------------------------------------ */

/** The columns a move may set besides the axes, as they were before it (ISO strings: the undo token is JSON). */
export interface UndoCols {
  confirmedBy: string | null;
  confirmedAt: string | null;
  cancelReason: string | null;
  dueAt: string | null;
  shipAfter: string | null;
  returnReason: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  finalAt: string | null;
  mergedInto: string | null;
  priority: number;
  attempts: number;
}

/** One order of an undo token: the rev the move left and the exact state before it. */
export interface UndoEntry {
  orderId: string;
  revAfter: number;
  before: OrderStates;
  cols: UndoCols;
  /** the move's own events (the `undo` event names them, ≤ 20) */
  eventIds: number[];
}

/** The before-image of a move, read with the row (bulk and single "Move to…" read it before they write). */
export const UNDO_COLS = {
  confirmedBy: orders.confirmedBy,
  confirmedAt: orders.confirmedAt,
  cancelReason: orders.cancelReason,
  dueAt: orders.dueAt,
  shipAfter: orders.shipAfter,
  returnReason: orders.returnReason,
  shippedAt: orders.shippedAt,
  deliveredAt: orders.deliveredAt,
  finalAt: orders.finalAt,
  mergedInto: orders.mergedInto,
  priority: orders.priority,
  attempts: orders.attempts,
};
type UndoColRow = {
  confirmedBy: string | null;
  confirmedAt: Date | null;
  cancelReason: string | null;
  dueAt: Date | null;
  shipAfter: Date | null;
  returnReason: string | null;
  shippedAt: Date | null;
  deliveredAt: Date | null;
  finalAt: Date | null;
  mergedInto: string | null;
  priority: number;
  attempts: number;
};

export function undoColsOf(r: UndoColRow): UndoCols {
  const iso = (d: Date | null) => (d ? d.toISOString() : null);
  return {
    confirmedBy: r.confirmedBy,
    confirmedAt: iso(r.confirmedAt),
    cancelReason: r.cancelReason,
    dueAt: iso(r.dueAt),
    shipAfter: iso(r.shipAfter),
    returnReason: r.returnReason,
    shippedAt: iso(r.shippedAt),
    deliveredAt: iso(r.deliveredAt),
    finalAt: iso(r.finalAt),
    mergedInto: r.mergedInto,
    priority: r.priority,
    attempts: r.attempts,
  };
}

/**
 * Reverses one move inside the undo window (OPE-§12.5): only when the order's rev still equals `revAfter` (nothing
 * happened since), restoring the exact states and columns of before, as a compensating write of the same actor:
 * `state_changed` per axis with `meta.undo`, then one `undo` event naming the move's events; the order hooks run so
 * the customer counters follow. It never needs `orders.force_status`: it only restores what the actor just changed.
 */
export async function undoTransition(actor: OrderActor, scope: WriteScope, u: UndoEntry): Promise<{ ok: true; rev: number } | { ok: false; error: "not_found" | "conflict" }> {
  if (!validId(u.orderId)) return { ok: false, error: "not_found" };
  const out = await db.transaction(async (tx: Tx) => {
    const [row] = await readRow(tx, scope, u.orderId);
    if (!row || !viewerSeesOrder(scope, actor, row, false)) return { ok: false as const, error: "not_found" as const };
    if (row.rev !== u.revAfter) return { ok: false as const, error: "conflict" as const };
    const cur = statesOf(row);
    const moves: Move[] = [];
    if (cur.confirm !== u.before.confirm) moves.push({ axis: "confirm", from: cur.confirm, to: u.before.confirm });
    if (cur.ship !== u.before.ship) moves.push({ axis: "ship", from: cur.ship, to: u.before.ship });
    if (cur.money !== u.before.money) moves.push({ axis: "money", from: cur.money, to: u.before.money });
    const date = (s: string | null) => (s ? new Date(s) : null);
    const status = projectStatus(u.before);
    const now = new Date(Date.now());
    const c = u.cols;
    const res = await tx
      .update(orders)
      .set({
        confirmState: u.before.confirm,
        shipState: u.before.ship,
        // R1's column has no `refunded` (0006): a move never left it, so the before-image never names it
        moneyState: u.before.money as Exclude<MoneyState, "refunded">,
        status,
        confirmedBy: c.confirmedBy,
        confirmedAt: date(c.confirmedAt),
        cancelReason: c.cancelReason,
        dueAt: date(c.dueAt),
        shipAfter: date(c.shipAfter),
        returnReason: c.returnReason,
        shippedAt: date(c.shippedAt),
        deliveredAt: date(c.deliveredAt),
        finalAt: date(c.finalAt),
        mergedInto: c.mergedInto,
        priority: c.priority,
        attempts: c.attempts,
        rev: sql`${orders.rev} + 1`,
        ...(status !== row.status ? { sheetDirty: sql`${orders.sheetDirty} | 1` } : {}),
        updatedAt: now,
      })
      .where(and(byId(orders, scope, row.id), eq(orders.rev, row.rev)));
    if (affectedRows(res) !== 1) return { ok: false as const, error: "conflict" as const };
    const rev = row.rev + 1;
    const base = { orderId: row.id, rev, at: now, actorKind: actor.kind, actorId: actor.userId };
    const events: NewOrderEvent[] = moves.map((m) => ({ ...base, type: "state_changed" as const, fromState: m.from, toState: m.to, meta: { axis: m.axis, source: "ui", undo: true } }));
    const of = u.eventIds.filter((n) => Number.isInteger(n) && n > 0).slice(0, 20);
    if (of.length) events.push({ ...base, type: "undo", meta: { of } });
    await appendEvents(tx, scope, events);
    const hook: OrderHookEvent = { on: "transition", before: snapshotOf(row), after: snapshotOf(row, { rev, states: u.before }), moves, actor, source: "ui" };
    await runOrderHooks("transition", "inTx", scope, hook, tx);
    return { ok: true as const, rev, hook };
  });
  if (!out.ok) return out;
  await runAfterCommit("orders:hooks", () => runOrderHooks("transition", "afterCommit", scope, out.hook));
  return { ok: true, rev: out.rev };
}
