import "server-only";
/**
 * Call outcomes (P4 CALL CENTER; operations.md OPE-§6.1, §6.1a, §6.2, §6.3, §6.5, §5.7, OD7, OD10, OD36, OD48, OD49,
 * OD53; docs/STORE-SAAS.md §K.2 P0). Frozen at P0: the two outcome vocabularies the frozen `TransitionInput.attempt`
 * carries. P4 step 3 adds `recordOutcome`: what the agent tapped after a call or a WhatsApp exchange, written by the
 * one writer (`transitionForOutcome`, src/lib/orders/transition.ts) in one transaction with its `call_attempt`.
 *
 *   confirm lane    (confirm ∈ new, attempting, callback) confirmed (+ "Deliver from…", OD49) · no_answer · busy ·
 *                   switched_off (attempts + 1, `due_at` from the ladder; the first busy / switched off in a row is
 *                   retried after `busyRetryMinutes`, except on the ladder's last attempt; after the last step,
 *                   OPE-§6.3: close as unreachable in the same transaction (a move of the system), or one try a day
 *                   while `keep_open`) · wrong_number · callback (> now + 5 min, ≤ 30 days; outside the
 *                   window a warning, never a refusal; lease = due + grace, owner kept) · cancelled (a coded reason) ·
 *                   fake (blockPhone needs blocklist.write) · duplicate (of an order of the same phone)
 *   delivery lane   (confirmed, ship attempt_failed, OD48) customer_informed · reschedule (postponed + the hold) ·
 *                   no_answer / busy (rescue.retryMinutes, then the next open day 11:00; after rescue.maxCalls calls
 *                   the order leaves the lane) · cancel_recall (`recall_requested`, carrierNotified false); the confirm
 *                   axis is never touched and `attempts` (the confirm ladder's counter) never moves
 *   inbound         (OD53) the customer called: the order must be one of the agent's lookups; on an order outside
 *                   both lanes only confirmed, cancelled and callback
 *
 * A confirm outcome on a delivery-lane order (and the reverse) answers `illegal`, so a stale grid never confirms a
 * shipped order. Every outcome ends the claim (`claim_token` NULL; the lease cleared, except a callback's), sets
 * `first_touch_at` when NULL and writes one `call_attempt`. `expectRev` is required: a stale card answers `conflict`
 * with the fresh state. Idempotent per `Idempotency-Key` (./idem.ts); "Save and next" (`andNext`) claims the next
 * order in the same request.
 */
import { desc, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { orderEvents, orders } from "@/lib/db/schema";
import { blockPhone } from "@/lib/orders/admin";
import { cleanNote, viewerOf, type NewOrderEvent } from "@/lib/orders/events";
import { forgetDecidedToday, nextOrderRun, type NextResult } from "@/lib/orders/queue";
import { CANCEL_REASONS, PRE_SHIP, projectStatus, SYSTEM_CANCEL_REASONS, type CancelReason, type MoneyState, type OrderStates } from "@/lib/orders/state";
import { transitionForOutcome, type OutcomeTransitionOpts, type TransitionInput, type TransitionResult } from "@/lib/orders/transition";
import { getStoreSetting } from "@/lib/settings";
import { SeamError } from "@/lib/tenancy/seam";
import { byId, whereStore } from "@/lib/tenancy/sql";
import type { ActionResult, WriteCtx } from "@/lib/tenancy/types";
import { withIdem } from "./idem";
import { nextDue, rescueNext } from "./ladder";
import { opsNow } from "./presence";
import { viewerSeesOrder } from "./visibility";
import { callingWindowFor } from "./window.server";
import { instantAt, isCallable, snapIntoWindow } from "./window";

/** the confirmation lane's outcomes (OPE-§6.1) */
export type AttemptOutcome = "confirmed" | "no_answer" | "busy" | "switched_off" | "wrong_number" | "callback" | "cancelled" | "fake" | "duplicate";
/** rev 3 (OD48): the delivery lane's outcomes (OPE-§6.1a) */
export type DeliveryOutcome = "customer_informed" | "reschedule" | "no_answer" | "busy" | "cancel_recall";

export const ATTEMPT_OUTCOMES = ["confirmed", "no_answer", "busy", "switched_off", "wrong_number", "callback", "cancelled", "fake", "duplicate"] as const satisfies readonly AttemptOutcome[];
export const DELIVERY_OUTCOMES = ["customer_informed", "reschedule", "no_answer", "busy", "cancel_recall"] as const satisfies readonly DeliveryOutcome[];

/** both grids' outcomes once each (no_answer and busy are in both) */
const ANY_OUTCOME = [...ATTEMPT_OUTCOMES, ...DELIVERY_OUTCOMES.filter((o) => !(ATTEMPT_OUTCOMES as readonly string[]).includes(o))] as [AttemptOutcome | DeliveryOutcome, ...(AttemptOutcome | DeliveryOutcome)[]];

/** the reasons a person picks (OPE-§6.4): the system codes `blocked` and `attempts_exhausted` are never typed */
const PICKABLE_REASONS = CANCEL_REASONS.filter((r) => !SYSTEM_CANCEL_REASONS.includes(r)) as [CancelReason, ...CancelReason[]];
const ORDER_ID = z.string().regex(/^[A-Z0-9]{2,8}-[A-Z0-9]{4,12}$/);
const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** OPE-§6.1 `OutcomeInput` (the hot-path body, ≤ 2 KB, OD36). */
export const OutcomeInput = z.strictObject({
  orderId: ORDER_ID,
  expectRev: z.number().int().min(0),
  channel: z.enum(["call", "whatsapp"]),
  outcome: z.enum(ANY_OUTCOME),
  /** Idempotency-Key (OD36); a replay returns the first result */
  idem: z.string().max(64),
  /** callback (ISO, store-local picker converted on the client) */
  dueAt: z.iso.datetime({ offset: true }).optional(),
  /** OD49: confirmed with "Deliver from…" (a store-local date, or an instant); reschedule (delivery lane) */
  shipAfter: z.union([z.string().regex(YMD), z.iso.datetime({ offset: true })]).optional(),
  /** OD53: the customer called; the order must be in the agent's inbound set (OPE-§5.7) */
  inbound: z.boolean().optional(),
  /** cancelled and cancel_recall (required); fake (optional) */
  reason: z.enum(PICKABLE_REASONS).optional(),
  /** duplicate (required) */
  duplicateOf: ORDER_ID.optional(),
  /** optional, ≤ 500, written as a note event */
  note: z.string().max(500).optional(),
  /** fake only, needs blocklist.write */
  blockPhone: z.boolean().optional(),
  /** "Save and next" (the queue sends true): runs nextOrder in the same request */
  andNext: z.boolean().optional(),
  /** the objection chip the agent tapped before the outcome (OPE-§7.2), for the R3 script learner; no text */
  objectionId: z.string().regex(/^[a-z0-9_]{1,20}$/).optional(),
});
export type OutcomeInput = z.input<typeof OutcomeInput>;

/** What an outcome answers: the writer's result, plus the next card, the window warning and the phone's other orders. */
export type OutcomeData = TransitionResult & {
  next?: NextResult;
  /** a callback set outside the calling window (never a refusal, OPE-§6.1) */
  warning?: "outside_window";
  /** fake + blockPhone: the phone's other open orders, listed for review (OPE-§6.1) */
  review?: string[];
  replayed?: true;
};

const MINUTE = 60_000;
const DAY = 86_400_000;
/** a callback at least this far ahead (OPE-§L "Callback horizon") */
const CALLBACK_MIN_MS = 5 * MINUTE;
const CALLBACK_MAX_MS = 30 * DAY;
const OPEN_CONFIRM: ReadonlySet<string> = new Set(["new", "attempting", "callback"]);
const DECIDING: ReadonlySet<string> = new Set(["confirmed", "cancelled", "unreachable", "fake", "duplicate"]);
const INBOUND_OUTSIDE_LANES: ReadonlySet<string> = new Set(["confirmed", "cancelled", "callback"]);

/** The columns an outcome reads before it plans. */
const ROW = {
  id: orders.id,
  rev: orders.rev,
  confirmState: orders.confirmState,
  shipState: orders.shipState,
  moneyState: orders.moneyState,
  assigneeId: orders.assigneeId,
  confirmedBy: orders.confirmedBy,
  attempts: orders.attempts,
  firstTouchAt: orders.firstTouchAt,
  phone: orders.phone,
};

const ok = (data: OutcomeData): ActionResult<OutcomeData> => ({ ok: true, data });

/**
 * One outcome (orders.write; OPE-§6.1, §6.1a). Input errors answer `invalid`; the state machine's answers come back
 * inside `data` (`not_found`, `conflict` with the fresh state, `illegal`, `reason_required`, `bad_due`, `bad_hold`,
 * `bad_duplicate`, `forbidden`).
 */
export async function recordOutcome(ctx: WriteCtx, raw: OutcomeInput): Promise<ActionResult<OutcomeData>> {
  const parsed = OutcomeInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid", message: parsed.error.issues[0]?.message };
  if (!ctx.can("orders.write")) return { ok: false, error: "forbidden" };
  const input = parsed.data;
  return withIdem(ctx.scope, ctx.user.id, input.idem, () => run(ctx, input), (r) => (r.ok ? { ...r, data: { ...r.data, replayed: true as const } } : r));
}

type Input = z.output<typeof OutcomeInput>;
const rowQuery = (ctx: WriteCtx, orderId: string) => db.select(ROW).from(orders).where(byId(orders, ctx.scope, orderId)).limit(1);

async function run(ctx: WriteCtx, input: Input): Promise<ActionResult<OutcomeData>> {
  const { scope } = ctx;
  const uid = ctx.user.id;
  const now = opsNow();
  const [row] = await rowQuery(ctx, input.orderId);
  if (!row || !viewerSeesOrder(scope, viewerOf(ctx), row, !!input.inbound)) return ok({ ok: false, error: "not_found" });
  const states: OrderStates = { confirm: row.confirmState, ship: row.shipState, money: row.moneyState as MoneyState };
  const current = { rev: row.rev, states, status: projectStatus(states) };
  if (row.rev !== input.expectRev) return ok({ ok: false, error: "conflict", current });

  // the lanes (OD48): a delivery-lane order takes only the rescue grid, every other order only the confirm grid
  const deliveryLane = states.confirm === "confirmed" && states.ship === "attempt_failed";
  const confirmLane = OPEN_CONFIRM.has(states.confirm);
  const o = input.outcome;
  const illegal = () => ok({ ok: false, error: "illegal", current });
  if (deliveryLane ? !(DELIVERY_OUTCOMES as readonly string[]).includes(o) : !(ATTEMPT_OUTCOMES as readonly string[]).includes(o)) return illegal();
  if (!deliveryLane && !confirmLane && !(input.inbound && INBOUND_OUTSIDE_LANES.has(o))) return illegal();

  const [ops, w] = await Promise.all([getStoreSetting(scope, "ops"), callingWindowFor(scope)]);
  const tz = w.tz;
  const endClaim = { claimToken: null, leaseUntil: null };
  const base: Omit<TransitionInput, "want"> = {
    orderId: row.id,
    source: "outcome",
    expectRev: input.expectRev,
    attempt: { channel: input.channel, outcome: o, lane: deliveryLane ? "delivery" : "confirm" },
    ...(input.inbound ? { inbound: true } : {}),
  };
  const note = input.note ? cleanNote(input.note) : "";
  const noteEvent = (b: { orderId: string; at: Date }): NewOrderEvent[] => (note ? [{ orderId: b.orderId, actorKind: "user", actorId: uid, type: "note", note, at: b.at }] : []);
  let tin: TransitionInput;
  const opts: OutcomeTransitionOpts = { attemptMeta: input.objectionId ? { objectionId: input.objectionId } : undefined, events: (b) => noteEvent(b) };
  let warning: OutcomeData["warning"];

  if (deliveryLane) {
    /* ---------------- the delivery lane (OPE-§6.1a) ---------------- */
    const history = await rescueHistory(row.id, ctx);
    const callNo = history.length + 1;
    opts.attemptMeta = { ...opts.attemptMeta, attemptNo: callNo };
    // the rescue's own events carry the write's rev, like its state_changed (a note does not: notes never bump rev)
    const rescue = (outcome: "customer_informed" | "reschedule" | "cancel_recall" | "rescue_exhausted", extra: { shipAfter?: string } = {}) => (b: { orderId: string; rev: number; at: Date }): NewOrderEvent =>
      ({ orderId: b.orderId, actorKind: "user", actorId: uid, type: "delivery_rescue", reasonCode: outcome, meta: { outcome, attemptNo: callNo, ...extra }, rev: b.rev, at: b.at });
    switch (o) {
      case "customer_informed":
        tin = { ...base, want: {}, extra: { ...endClaim, dueAt: null } };
        opts.events = (b) => [rescue("customer_informed")(b), ...noteEvent(b)];
        break;
      case "reschedule": {
        const shipAfter = holdOf(input.shipAfter, tz);
        if (!shipAfter) return ok({ ok: false, error: "bad_hold", current });
        // attempt_failed → postponed is the system's move, implied by the outcome (class S, OPE-§6.1a)
        tin = { ...base, want: { ship: "postponed" }, shipAfter, extra: { ...endClaim } };
        opts.grant = ["S"];
        opts.events = (b) => [rescue("reschedule", { shipAfter: shipAfter.toISOString() })(b), ...noteEvent(b)];
        break;
      }
      case "no_answer":
      case "busy": {
        // this call and the unanswered ones right before it (newest first until the first contact)
        const lead = history.findIndex((code) => code !== "no_answer" && code !== "busy");
        const inARow = (lead === -1 ? history.length : lead) + 1;
        const due = rescueNext(callNo, inARow, now, ops, tz);
        tin = { ...base, want: {}, extra: { ...endClaim, dueAt: due === "exhausted" ? null : due } };
        if (due === "exhausted") opts.events = (b) => [rescue("rescue_exhausted")(b), ...noteEvent(b)];
        break;
      }
      case "cancel_recall": {
        const reason = input.reason;
        if (!reason) return ok({ ok: false, error: "reason_required", current });
        tin = { ...base, want: {}, extra: { ...endClaim, dueAt: null } };
        opts.events = (b) => [
          { orderId: b.orderId, actorKind: "user", actorId: uid, type: "recall_requested", reasonCode: reason, meta: { reason, carrierNotified: false }, rev: b.rev, at: b.at },
          rescue("cancel_recall")(b),
          ...noteEvent(b),
        ];
        break;
      }
      default:
        return illegal();
    }
  } else {
    /* ---------------- the confirm lane (OPE-§6.1) ---------------- */
    const n = row.attempts + 1;
    switch (o) {
      case "confirmed": {
        const shipAfter = input.shipAfter === undefined ? undefined : holdOf(input.shipAfter, tz);
        if (shipAfter === null) return ok({ ok: false, error: "bad_hold", current });
        tin = { ...base, want: { confirm: "confirmed" }, ...(shipAfter ? { shipAfter } : {}), extra: { ...endClaim } };
        break;
      }
      case "no_answer":
      case "busy":
      case "switched_off": {
        // the ladder (and the store's policy after it) decides first: its last attempt closes the order whatever the
        // outcome; before that, the first busy / switched off in a row is retried after busyRetryMinutes (OD10)
        const ladder = nextDue(n, row.firstTouchAt ?? now, now, ops, tz);
        const firstBusy = ladder !== "exhausted" && o !== "no_answer" && !NO_CONTACT_BUSY.has((await lastAttemptOutcome(row.id, ctx)) ?? "");
        const due = firstBusy ? snapIntoWindow(new Date(now.getTime() + ops.busyRetryMinutes * MINUTE), w) : ladder;
        if (due === "exhausted") {
          // OPE-§6.3: the last attempt closes the order in the same transaction, a move of the system
          tin = { ...base, want: { confirm: "unreachable" }, reason: "attempts_exhausted", extra: { ...endClaim, attempts: n } };
          opts.grant = ["S"];
          opts.systemMoves = true;
        } else {
          tin = { ...base, want: { confirm: "attempting" }, extra: { ...endClaim, attempts: n, dueAt: due } };
        }
        break;
      }
      case "wrong_number":
        tin = { ...base, want: { confirm: "cancelled" }, reason: "wrong_number", extra: { ...endClaim, attempts: n } };
        break;
      case "callback": {
        const t = input.dueAt ? Date.parse(input.dueAt) : NaN;
        if (!Number.isFinite(t) || t <= now.getTime() + CALLBACK_MIN_MS || t > now.getTime() + CALLBACK_MAX_MS) return ok({ ok: false, error: "bad_due", current });
        const dueAt = new Date(t);
        if (!isCallable(dueAt, w).open) warning = "outside_window";
        // the agent who promised the call keeps it until due + grace (OD7)
        tin = { ...base, want: { confirm: "callback" }, dueAt, extra: { claimToken: null, assigneeId: uid, leaseUntil: new Date(t + ops.callbackGraceMinutes * MINUTE) } };
        break;
      }
      case "cancelled":
        if (!input.reason) return ok({ ok: false, error: "reason_required", current });
        tin = { ...base, want: { confirm: "cancelled" }, reason: input.reason, extra: { ...endClaim } };
        break;
      case "fake":
        if (input.blockPhone && !ctx.can("blocklist.write")) return ok({ ok: false, error: "forbidden", current });
        tin = { ...base, want: { confirm: "fake" }, ...(input.reason ? { reason: input.reason } : {}), extra: { ...endClaim } };
        break;
      case "duplicate": {
        if (!input.duplicateOf) return ok({ ok: false, error: "bad_duplicate", current });
        // the kept order: same store and phone (the writer checks), and not itself a duplicate
        const [kept] = await db.select({ confirmState: orders.confirmState }).from(orders).where(byId(orders, scope, input.duplicateOf)).limit(1);
        if (!kept || kept.confirmState === "duplicate") return ok({ ok: false, error: "bad_duplicate", current });
        tin = { ...base, want: { confirm: "duplicate" }, duplicateOf: input.duplicateOf, extra: { ...endClaim } };
        break;
      }
      default:
        return illegal();
    }
  }

  const result = await transitionForOutcome({ kind: "user", userId: uid, can: (p) => ctx.can(p), role: ctx.membership.role }, scope, tin, opts);
  if (!result.ok) return ok(result);
  const data: OutcomeData = { ...result, ...(warning ? { warning } : {}) };
  if (DECIDING.has(result.states.confirm) && result.states.confirm !== states.confirm) forgetDecidedToday(scope, uid, tz);

  // fake + "Block this number": the blocklist, and the phone's other open orders for review (OPE-§6.1)
  if (o === "fake" && input.blockPhone) {
    await blockPhone(scope, row.phone, ctx.store.market, `Commande ${row.id}`, ctx.actor);
    const others = await db
      .select({ id: orders.id })
      .from(orders)
      .where(whereStore(orders, scope, eq(orders.phone, row.phone), ne(orders.id, row.id), inArray(orders.confirmState, ["new", "attempting", "callback", "confirmed"]), inArray(orders.shipState, [...PRE_SHIP])))
      .limit(20);
    data.review = others.map((r) => r.id);
  }

  // "Save and next": the next card in the same round trip (OPE-§13.2); a refused claim (rate limit) only omits it
  if (input.andNext) {
    try {
      data.next = await nextOrderRun(ctx);
    } catch (err) {
      if (!(err instanceof SeamError)) throw err;
    }
  }
  return ok(data);
}

const NO_CONTACT_BUSY: ReadonlySet<string> = new Set(["busy", "switched_off"]);

/** The outcome of the order's last call attempt (busy "in a row", OPE-§6.1). */
async function lastAttemptOutcome(orderId: string, ctx: WriteCtx): Promise<string | null> {
  const [last] = await db
    .select({ code: orderEvents.reasonCode })
    .from(orderEvents)
    .where(whereStore(orderEvents, ctx.scope, eq(orderEvents.orderId, orderId), eq(orderEvents.type, "call_attempt")))
    .orderBy(desc(orderEvents.id))
    .limit(1);
  return last?.code ?? null;
}

/** The order's rescue calls so far, newest first (their outcome codes): how many, and how many unanswered in a row. */
async function rescueHistory(orderId: string, ctx: WriteCtx): Promise<string[]> {
  const rows = await db
    .select({ code: orderEvents.reasonCode })
    .from(orderEvents)
    .where(whereStore(orderEvents, ctx.scope, eq(orderEvents.orderId, orderId), eq(orderEvents.type, "call_attempt"), sql`JSON_VALUE(${orderEvents.meta}, '$.lane') = 'delivery'`))
    .orderBy(desc(orderEvents.id))
    .limit(50);
  return rows.map((r) => r.code ?? "");
}

/**
 * The hold of "Deliver from…" / Reschedule (OD49): a store-local date is its first instant in the store's time zone;
 * an instant stays. The writer checks the bounds (after now, ≤ 60 days: `bad_hold`); a value that is not a date is null.
 */
function holdOf(v: string | undefined, tz: string): Date | null {
  if (!v) return null;
  const d = YMD.test(v) ? instantAt(v, "00:00", tz) : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}
