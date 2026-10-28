// proves: OP-01, OP-04
/**
 * `test:state` (P4 CALL CENTER; operations.md OPE-§O.1, §O.4): the order state machine, offline and pure.
 *   npx tsx src/lib/orders/state.selftest.ts
 *
 *  1. tables      every cell of the three transition tables (OPE-§3.2), legal and illegal, for each move class
 *                 (W, A, L, M, S): the golden tables below are the spec's, typed here by hand, not read from state.ts
 *  2. implied     a ship target on an unconfirmed order, the walked path none → to_pack → shipped → target,
 *                 terminal protection ("reopen first" for people, external_rejected for a sheet or carrier)
 *  3. projection  `projectStatus` over all 96 confirm × ship pairs (golden table)
 *  4. legacy      `legacyToWanted` for every label, the rev 3 "noop" rule included
 *  5. effects     the automatic side moves and columns: confirmation, terminal states, attempt_failed bookkeeping,
 *                 postponed + ship_after, the hold's (now, now + 60 d] bound (`bad_hold`), callbacks (`bad_due`),
 *                 returnReason only on refused / returned / lost, at_delivery = collected + remitted in one plan,
 *                 refunded (R2 cells) and `bad_amount`, forced moves, locked_ship
 *  6. invariants  the state lists equal the 0005 enum sets (order not compared); only attempt_failed ever sets due_at
 *                 on a confirmed order; `legalMoves` and `movePermsOf` per role
 * Prints its wall time; `test:state` + `test:ops` + `test:profit` stay ≤ 25 s together (OPE-§O.1).
 */
import { can, type StoreRole } from "@/lib/auth/permissions";
import { recordSuiteTime } from "@/lib/callcenter/suite-clock";
import { orders } from "@/lib/db/schema";
import { ORDER_STATUSES, type OrderStatus } from "./contract";
import {
  CONFIRM_STATES,
  MONEY_STATES,
  SHIP_STATES,
  legacyToWanted,
  legalMoves,
  movePermsOf,
  planTransition,
  projectStatus,
  type ConfirmState,
  type MoneyState,
  type MoveClass,
  type MovePerms,
  type OrderStates,
  type Plan,
  type PlanCtx,
  type PlanInput,
  type PlanOrder,
  type ShipState,
} from "./state";

const started = performance.now();
let passes = 0;
const failures: string[] = [];
let section = "";
function eq(name: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passes++;
  else failures.push(`[${section}] ${name}\n    got:  ${a}\n    want: ${e}`);
}
const ok = (name: string, cond: boolean, detail?: unknown) => eq(name + (detail !== undefined && !cond ? ` (${JSON.stringify(detail)})` : ""), cond, true);

/* ------------------------------------------------------------------ */
/* fixtures                                                            */
/* ------------------------------------------------------------------ */

const NOW = new Date("2026-11-02T10:00:00.000Z");
const MIN = 60_000;
const DAY = 86_400_000;
const at = (ms: number) => new Date(NOW.getTime() + ms);

const order = (states: Partial<OrderStates>, extra: Partial<PlanOrder> = {}): PlanOrder => ({
  id: "A1B2C3",
  states: { confirm: "new", ship: "none", money: "unpaid", ...states },
  totalCents: 25_000,
  riskScore: 0,
  attempts: 0,
  deliveryAttempts: 0,
  priority: 0,
  shippedAt: null,
  collectedCents: null,
  ...extra,
});
const ctx = (over: Partial<PlanCtx> = {}): PlanCtx => ({ now: NOW, settlement: "statement", rescueCallsSoFar: 0, maxCalls: 3, userId: "01HZZZZZZZZZZZZZZZZZZZZZZA", ...over });
const only = (...c: MoveClass[]): MovePerms => ({ classes: new Set(c), force: false, external: false });
const EXTERNAL: MovePerms = { classes: new Set(["W", "A", "L", "M"]), force: false, external: true };
const MANAGER: MovePerms = { classes: new Set(["W", "A", "L"]), force: true, external: false };
const CLASSES: readonly MoveClass[] = ["W", "A", "L", "M", "S"];
const plan = (o: PlanOrder, input: Omit<PlanInput, "source"> & { source?: PlanInput["source"] }, perms: MovePerms, c = ctx()): Plan => planTransition(o, { source: "ui", ...input }, perms, c);
const err = (p: Plan) => (p.ok ? "ok" : p.error);
const movesOf = (p: Plan) => (p.ok ? p.moves.map((m) => `${m.axis}:${m.from}>${m.to}${m.implied ? "!i" : ""}${m.auto ? "!a" : ""}${m.forced ? "!f" : ""}`) : []);

/* ------------------------------------------------------------------ */
/* 1. the three tables (OPE-§3.2, typed from the spec)                 */
/* ------------------------------------------------------------------ */

/** a cell: its classes, "†" when a reason is required */
type Golden<S extends string> = Record<S, Partial<Record<S, string>>>;
const OPEN = { attempting: "W", callback: "W", confirmed: "W", cancelled: "W†", fake: "W", duplicate: "W", unreachable: "SA" };
const CONFIRM_GOLDEN: Golden<ConfirmState> = {
  new: OPEN,
  attempting: OPEN,
  callback: OPEN,
  confirmed: { attempting: "A†", cancelled: "W†", fake: "A", duplicate: "A" },
  cancelled: { attempting: "A†", confirmed: "A†" },
  fake: { attempting: "A†" },
  duplicate: { attempting: "A†" },
  unreachable: { attempting: "W", callback: "W", confirmed: "W", cancelled: "W†", fake: "W", duplicate: "W" },
};
const SHIP_GOLDEN: Golden<ShipState> = {
  none: { to_pack: "S" },
  to_pack: { packed: "L", shipped: "L", none: "S" },
  packed: { shipped: "L", to_pack: "L", none: "S" },
  shipped: { in_transit: "L", out_for_delivery: "L", attempt_failed: "L", delivered: "L", refused: "L", returned: "L", lost: "L" },
  in_transit: { out_for_delivery: "L", attempt_failed: "L", delivered: "L", refused: "L", returned: "L", lost: "L" },
  out_for_delivery: { in_transit: "L", attempt_failed: "L", delivered: "L", refused: "L", returned: "L" },
  attempt_failed: { out_for_delivery: "L", in_transit: "L", delivered: "L", refused: "L", returned: "L", lost: "L", postponed: "LS", attempt_failed: "L" },
  postponed: { out_for_delivery: "L", in_transit: "L", attempt_failed: "L", delivered: "L", refused: "L", returned: "L", lost: "L" },
  refused: { returned: "L" },
  delivered: { returned: "A†" },
  returned: { to_pack: "A†" },
  lost: { delivered: "A†", returned: "A†" },
};
/** ship targets with no cell that the walked path reaches (OPE-§3.4): from → to → the implied steps before `to` */
const AFTER_SHIPPED = ["in_transit", "out_for_delivery", "attempt_failed", "delivered", "refused", "returned", "lost"] as const;
const WALKED: Partial<Record<ShipState, Partial<Record<ShipState, ShipState[]>>>> = {
  none: { packed: ["to_pack"], shipped: ["to_pack"], ...Object.fromEntries(AFTER_SHIPPED.map((t) => [t, ["to_pack", "shipped"]])) },
  to_pack: Object.fromEntries(AFTER_SHIPPED.map((t) => [t, ["shipped"]])),
  packed: Object.fromEntries(AFTER_SHIPPED.map((t) => [t, ["shipped"]])),
};
const MONEY_GOLDEN: Golden<MoneyState> = {
  unpaid: { collected: "SM" },
  collected: { remitted: "MS", disputed: "M", written_off: "M†", unpaid: "S", refunded: "M†" },
  disputed: { remitted: "M", written_off: "M†", collected: "M" },
  remitted: { disputed: "M†", refunded: "M†" },
  written_off: { collected: "M†" },
  refunded: { collected: "M†" },
};

section = "tables";
{
  let cells = 0;
  // confirmation: the order pre-ship, so the moves out of `confirmed` are allowed
  for (const from of CONFIRM_STATES) {
    for (const to of CONFIRM_STATES) {
      if (to === from) continue;
      const g = CONFIRM_GOLDEN[from][to];
      for (const k of CLASSES) {
        const p = plan(order({ confirm: from }), { want: { confirm: to }, reason: "other", duplicateOf: "Z9Y8X7" }, only(k));
        const want = g === undefined ? "illegal" : g.includes(k) ? "ok" : "forbidden";
        eq(`confirm ${from} → ${to} by ${k}`, err(p), want);
        if (want === "ok") eq(`confirm ${from} → ${to} by ${k}: the move`, movesOf(p).filter((m) => m.startsWith("confirm:")), [`confirm:${from}>${to}`]);
        if (want === "ok" && g!.includes("†")) eq(`confirm ${from} → ${to} by ${k} without a reason`, err(plan(order({ confirm: from }), { want: { confirm: to }, duplicateOf: "Z9Y8X7" }, only(k))), "reason_required");
        cells++;
      }
    }
  }
  // shipping: a confirmed order
  for (const from of SHIP_STATES) {
    for (const to of SHIP_STATES) {
      if (to === from && to !== "attempt_failed") continue;
      const g = SHIP_GOLDEN[from][to];
      const walked = WALKED[from]?.[to];
      for (const k of CLASSES) {
        const p = plan(order({ confirm: "confirmed", ship: from }), { want: { ship: to }, reason: "other" }, only(k));
        const cls = g ?? (walked ? "L" : undefined);
        const want = cls === undefined ? "illegal" : cls.includes(k) ? "ok" : "forbidden";
        eq(`ship ${from} → ${to} by ${k}`, err(p), want);
        if (want === "ok") {
          const steps = [...(g ? [] : walked!), to];
          const shipMoves = movesOf(p).filter((m) => m.startsWith("ship:"));
          eq(`ship ${from} → ${to} by ${k}: the path`, shipMoves, steps.map((s, i) => `ship:${i === 0 ? from : steps[i - 1]}>${s}${i < steps.length - 1 ? "!i" : ""}`));
        }
        if (want === "ok" && cls!.includes("†")) eq(`ship ${from} → ${to} by ${k} without a reason`, err(plan(order({ confirm: "confirmed", ship: from }), { want: { ship: to } }, only(k))), "reason_required");
        cells++;
      }
    }
  }
  // money (refunds carry an amount, OD59)
  for (const from of MONEY_STATES) {
    for (const to of MONEY_STATES) {
      if (to === from) continue;
      const g = MONEY_GOLDEN[from][to];
      for (const k of CLASSES) {
        const p = plan(order({ confirm: "confirmed", ship: "delivered", money: from }, { collectedCents: 25_000 }), { want: { money: to }, reason: "other", ...(to === "refunded" ? { refundCents: 5_000 } : {}) }, only(k));
        const want = g === undefined ? "illegal" : g.includes(k) ? "ok" : "forbidden";
        eq(`money ${from} → ${to} by ${k}`, err(p), want);
        if (want === "ok" && g!.includes("†")) {
          eq(`money ${from} → ${to} by ${k} without a reason`, err(plan(order({ confirm: "confirmed", ship: "delivered", money: from }), { want: { money: to }, ...(to === "refunded" ? { refundCents: 5_000 } : {}) }, only(k))), "reason_required");
        }
        cells++;
      }
    }
  }
  eq("every (from, to, class) cell was checked", cells, (8 * 7 + 12 * 11 + 1 + 6 * 5) * 5);
  // a self move is a no-op that writes nothing (the attempt is the outcome's event), except attempt_failed again
  for (const s of CONFIRM_STATES) {
    const p = plan(order({ confirm: s }), { want: { confirm: s } }, only("W"));
    eq(`confirm ${s} → ${s} is a no-op`, p.ok && !p.changed && p.moves.length === 0, true);
  }
  const again = plan(order({ confirm: "confirmed", ship: "attempt_failed" }, { deliveryAttempts: 1 }), { want: { ship: "attempt_failed" } }, only("L"));
  eq("attempt_failed → attempt_failed is the next attempt, counted", again.ok && again.changed && again.set.deliveryAttempts, 2);
  // the moves out of `confirmed` need the parcel still pre-ship
  for (const to of ["cancelled", "fake", "duplicate", "attempting"] as const) {
    eq(`confirmed (shipped) → ${to} is illegal`, err(plan(order({ confirm: "confirmed", ship: "shipped" }), { want: { confirm: to }, reason: "other", duplicateOf: "Z9Y8X7" }, only("W", "A"))), "illegal");
  }
  eq("unknown state names are illegal", err(plan(order({}), { want: { confirm: "maybe" as ConfirmState } }, only("W"))), "illegal");
}

/* ------------------------------------------------------------------ */
/* 2. implied moves and terminal protection (OPE-§3.4)                 */
/* ------------------------------------------------------------------ */

section = "implied";
{
  const p = plan(order({ confirm: "attempting" }), { want: { ship: "delivered" } }, only("L"));
  eq("logistics marks an unconfirmed order delivered: implied confirmation, then the walked path", movesOf(p), [
    "confirm:attempting>confirmed!i",
    "ship:none>to_pack!i!a",
    "ship:to_pack>shipped!i",
    "ship:shipped>delivered",
    "money:unpaid>collected!a",
  ]);
  eq("an implied confirmation has no confirmed_by", p.ok && p.set.confirmedBy, null);
  eq("the walked path sets shipped_at", p.ok && p.set.shippedAt?.toISOString(), NOW.toISOString());
  eq("the projection after the plan", p.ok && p.status, "delivered");
  eq("an agent (W) cannot make a ship move implied", err(plan(order({ confirm: "new" }), { want: { ship: "shipped" } }, only("W"))), "forbidden");
  eq("to_pack on a new order is its confirmation: W may", movesOf(plan(order({ confirm: "new" }), { want: { ship: "to_pack" } }, only("W"))), ["confirm:new>confirmed!i", "ship:none>to_pack!i!a"]);
  eq("to_pack on a new order: L alone may not (nothing but the confirmation is left)", err(plan(order({ confirm: "new" }), { want: { ship: "to_pack" } }, only("L"))), "forbidden");
  const ext = plan(order({ confirm: "unreachable" }), { want: { ship: "shipped" }, source: "sheet" }, EXTERNAL);
  eq("a sheet's \"Expédiée\" on an unreachable order confirms it first (implied)", movesOf(ext), ["confirm:unreachable>confirmed!i", "ship:none>to_pack!i!a", "ship:to_pack>shipped"]);
  for (const s of ["cancelled", "fake", "duplicate"] as const) {
    const people = plan(order({ confirm: s }), { want: { ship: "shipped" } }, MANAGER);
    eq(`${s}: a ship target is "reopen first" for people`, !people.ok && [people.error, people.hint], ["illegal", "reopen_first"]);
    const sheet = plan(order({ confirm: s }), { want: { ship: "shipped" }, source: "sheet" }, EXTERNAL);
    eq(`${s}: a ship target from a sheet is external_rejected`, !sheet.ok && [sheet.error, sheet.hint], ["illegal", "external_rejected"]);
    const confirmFromSheet = plan(order({ confirm: s }), { want: { confirm: s === "cancelled" ? "confirmed" : "attempting" }, source: "carrier" }, EXTERNAL);
    eq(`${s}: any confirmation move from a carrier file is external_rejected`, !confirmFromSheet.ok && confirmFromSheet.hint, "external_rejected");
  }
  eq("cancelled → confirmed by a manager with a reason (reopen) is legal", err(plan(order({ confirm: "cancelled" }), { want: { confirm: "confirmed" }, reason: "customer called back" }, MANAGER)), "ok");
  eq("an external source needs no typed reason (its source is the reason)", err(plan(order({ confirm: "confirmed", ship: "lost" }), { want: { ship: "delivered" }, source: "carrier" }, EXTERNAL)), "ok");
  eq("out_for_delivery → lost is not walked (no cell, not on the path)", err(plan(order({ confirm: "confirmed", ship: "out_for_delivery" }), { want: { ship: "lost" } }, only("L"))), "illegal");
  eq("shipped → postponed is not walked through attempt_failed", err(plan(order({ confirm: "confirmed", ship: "shipped" }), { want: { ship: "postponed" } }, only("L"))), "illegal");
  eq("a confirm and a ship target in one write", movesOf(plan(order({ confirm: "new" }), { want: { confirm: "confirmed", ship: "shipped" } }, only("W", "L"))), ["confirm:new>confirmed", "ship:none>to_pack!a", "ship:to_pack>shipped"]);
  eq("a decided confirm with a ship target in one write is illegal", err(plan(order({ confirm: "new" }), { want: { confirm: "cancelled", ship: "shipped" }, reason: "price" }, only("W", "L"))), "illegal");
}

/* ------------------------------------------------------------------ */
/* 3. projection: all 96 confirm × ship pairs (OPE-§3.3)               */
/* ------------------------------------------------------------------ */

section = "projection";
{
  // columns in CONFIRM_STATES order: new, attempting, callback, confirmed, cancelled, fake, duplicate, unreachable
  const BY_CONFIRM: OrderStatus[] = ["new", "no_answer", "callback", "confirmed", "cancelled", "fake", "duplicate", "unreachable"];
  const GOLDEN: Record<ShipState, OrderStatus | OrderStatus[]> = {
    none: BY_CONFIRM,
    to_pack: BY_CONFIRM,
    packed: BY_CONFIRM,
    shipped: "shipped",
    in_transit: "in_transit",
    out_for_delivery: "in_transit",
    attempt_failed: "in_transit",
    postponed: "in_transit",
    delivered: "delivered",
    refused: "refused",
    returned: "returned",
    lost: "lost",
  };
  let n = 0;
  for (const ship of SHIP_STATES) {
    CONFIRM_STATES.forEach((confirm, i) => {
      const g = GOLDEN[ship];
      eq(`projectStatus(${confirm}, ${ship})`, projectStatus({ confirm, ship }), Array.isArray(g) ? g[i] : g);
      n++;
    });
  }
  eq("the golden table has 96 pairs", n, 96);
  const ids = new Set<string>(ORDER_STATUSES.map((s) => s.id));
  ok("every projection is a legacy label id", SHIP_STATES.every((ship) => CONFIRM_STATES.every((confirm) => ids.has(projectStatus({ confirm, ship })))));
}

/* ------------------------------------------------------------------ */
/* 4. legacy labels (OPE-§3.4)                                         */
/* ------------------------------------------------------------------ */

section = "legacy";
{
  const S = (confirm: ConfirmState, ship: ShipState = "none", money: MoneyState = "unpaid"): OrderStates => ({ confirm, ship, money });
  const cases: [OrderStatus, OrderStates, ReturnType<typeof legacyToWanted>][] = [
    ["new", S("attempting"), "noop"],
    ["new", S("confirmed", "shipped"), "noop"],
    ["confirmed", S("new"), { confirm: "confirmed" }],
    ["confirmed", S("unreachable"), { confirm: "confirmed" }],
    ["confirmed", S("confirmed", "to_pack"), "noop"],
    ["confirmed", S("confirmed", "shipped"), "noop"],
    ["no_answer", S("new"), { confirm: "attempting" }],
    ["no_answer", S("attempting"), "noop"],
    ["callback", S("new"), { confirm: "callback" }],
    ["callback", S("callback"), "noop"],
    ["cancelled", S("new"), { confirm: "cancelled" }],
    ["cancelled", S("confirmed", "packed"), { confirm: "cancelled" }],
    ["cancelled", S("confirmed", "shipped"), "reject"],
    ["cancelled", S("confirmed", "delivered"), "reject"],
    ["fake", S("attempting"), { confirm: "fake" }],
    ["fake", S("confirmed", "in_transit"), "reject"],
    ["duplicate", S("new"), { confirm: "duplicate" }],
    ["duplicate", S("duplicate"), "noop"],
    ["unreachable", S("attempting"), { confirm: "unreachable" }],
    ["unreachable", S("unreachable"), "noop"],
    ["shipped", S("confirmed", "to_pack"), { ship: "shipped" }],
    ["shipped", S("new"), { ship: "shipped" }],
    ["shipped", S("confirmed", "shipped"), "noop"],
    ["in_transit", S("confirmed", "shipped"), { ship: "in_transit" }],
    // rev 3: a coarse label never coarsens a finer state under "En livraison"
    ["in_transit", S("confirmed", "attempt_failed"), "noop"],
    ["in_transit", S("confirmed", "postponed"), "noop"],
    ["in_transit", S("confirmed", "out_for_delivery"), "noop"],
    ["in_transit", S("confirmed", "in_transit"), "noop"],
    ["delivered", S("confirmed", "attempt_failed"), { ship: "delivered" }],
    ["delivered", S("confirmed", "delivered", "collected"), "noop"],
    ["refused", S("confirmed", "out_for_delivery"), { ship: "refused" }],
    ["returned", S("confirmed", "refused"), { ship: "returned" }],
    ["lost", S("confirmed", "in_transit"), { ship: "lost" }],
    ["lost", S("confirmed", "lost"), "noop"],
  ];
  for (const [label, cur, want] of cases) eq(`legacyToWanted(${label}, ${cur.confirm}/${cur.ship})`, legacyToWanted(label, cur), want);
  const labels = new Set(cases.map((c) => c[0]));
  ok("every legacy label has a case", ORDER_STATUSES.every((s) => labels.has(s.id)), ORDER_STATUSES.filter((s) => !labels.has(s.id)).map((s) => s.id));
  // a label equal to the projection is always "noop", over every pair
  let all = true;
  for (const confirm of CONFIRM_STATES) for (const ship of SHIP_STATES) if (legacyToWanted(projectStatus({ confirm, ship }), S(confirm, ship)) !== "noop") all = false;
  ok("a label equal to the projection is noop for all 96 pairs", all);
}

/* ------------------------------------------------------------------ */
/* 5. automatic side moves and the columns (OPE-§3.2, §3.5)            */
/* ------------------------------------------------------------------ */

section = "effects";
{
  // confirmation
  const c = plan(order({ confirm: "attempting" }), { want: { confirm: "confirmed" }, extra: { dueAt: at(MIN) } }, only("W"));
  eq("confirmed ⇒ ship to_pack (auto)", movesOf(c), ["confirm:attempting>confirmed", "ship:none>to_pack!a"]);
  eq("confirmed sets confirmed_by / confirmed_at and clears due_at", c.ok && [c.set.confirmedBy, c.set.confirmedAt?.toISOString(), c.set.dueAt], ["01HZZZZZZZZZZZZZZZZZZZZZZA", NOW.toISOString(), null]);
  eq("the projection and the priority are rewritten", c.ok && [c.set.status, typeof c.set.priority], ["confirmed", "number"]);

  // terminal confirmation states
  for (const to of ["cancelled", "fake", "duplicate", "unreachable"] as const) {
    const t = plan(order({ confirm: "callback" }), { want: { confirm: to }, reason: "price", duplicateOf: "Z9Y8X7", extra: { leaseUntil: at(10 * MIN), claimToken: "01HCLAIMCLAIMCLAIMCLAIMCLA", dueAt: at(MIN) } }, only("W", "A"));
    eq(`${to} clears lease, claim and due_at whatever the caller set`, t.ok && [t.set.leaseUntil, t.set.claimToken, t.set.dueAt], [null, null, null]);
  }
  const back = plan(order({ confirm: "confirmed", ship: "packed" }), { want: { confirm: "cancelled" }, reason: "changed_mind" }, only("W"));
  eq("confirmed (packed) → cancelled ⇒ ship none (auto), cancel_reason coded", [movesOf(back), back.ok && back.set.cancelReason], [["confirm:confirmed>cancelled", "ship:packed>none!a"], "changed_mind"]);
  eq("a free-text cancel reason stores the code \"other\"", (() => {
    const p = plan(order({ confirm: "new" }), { want: { confirm: "cancelled" }, reason: "dit qu'il a déjà reçu" }, only("W"));
    return p.ok && p.set.cancelReason;
  })(), "other");
  eq("a reason under 3 characters is no reason", err(plan(order({ confirm: "new" }), { want: { confirm: "cancelled" }, reason: " x " }, only("W"))), "reason_required");
  eq("needs another call: confirmed (to_pack) → attempting takes it off the pack list", movesOf(plan(order({ confirm: "confirmed", ship: "to_pack" }), { want: { confirm: "attempting" }, reason: "customer asked" }, only("A"))), ["confirm:confirmed>attempting", "ship:to_pack>none!a"]);
  const dup = plan(order({ confirm: "new" }), { want: { confirm: "duplicate" }, duplicateOf: "Z9Y8X7" }, only("W"));
  eq("duplicate links merged_into", dup.ok && dup.set.mergedInto, "Z9Y8X7");
  eq("a person marks a duplicate only with its link", err(plan(order({ confirm: "new" }), { want: { confirm: "duplicate" } }, only("W"))), "bad_duplicate");
  eq("an order is not its own duplicate", err(plan(order({ confirm: "new" }), { want: { confirm: "duplicate" }, duplicateOf: "A1B2C3" }, only("W"))), "bad_duplicate");
  eq("a sheet's \"Doublon\" needs no link", err(plan(order({ confirm: "new" }), { want: { confirm: "duplicate" }, source: "sheet" }, EXTERNAL)), "ok");
  const reopen = plan(order({ confirm: "duplicate" }), { want: { confirm: "attempting" }, reason: "not a duplicate" }, only("A"));
  eq("not a duplicate: the link is removed", reopen.ok && reopen.set.mergedInto, null);

  // attempt_failed: the delivery lane (OD48)
  const lane = plan(order({ confirm: "confirmed", ship: "in_transit" }, { deliveryAttempts: 1 }), { want: { ship: "attempt_failed" } }, only("L"), ctx({ rescueCallsSoFar: 1, maxCalls: 3 }));
  eq("attempt_failed counts the attempt and enters the lane (due now, base 650 + amount)", lane.ok && [lane.set.deliveryAttempts, lane.set.dueAt?.toISOString(), lane.set.priority, lane.flags.deliveryLane], [2, NOW.toISOString(), 660, true]);
  const spent = plan(order({ confirm: "confirmed", ship: "in_transit" }), { want: { ship: "attempt_failed" } }, only("L"), ctx({ rescueCallsSoFar: 3, maxCalls: 3 }));
  eq("no rescue call left: the attempt is recorded, the order stays out of the queue", spent.ok && [spent.set.deliveryAttempts, spent.set.dueAt, spent.flags.rescueExhausted, spent.flags.deliveryLane], [1, null, true, undefined]);
  const noRescue = plan(order({ confirm: "confirmed", ship: "shipped" }), { want: { ship: "attempt_failed" } }, only("L"), ctx({ rescueCallsSoFar: 0, maxCalls: 0 }));
  eq("rescue.maxCalls 0: never in the lane", noRescue.ok && [noRescue.set.dueAt, noRescue.flags.rescueExhausted], [null, true]);
  const out = plan(order({ confirm: "confirmed", ship: "attempt_failed" }), { want: { ship: "out_for_delivery" } }, only("L"));
  eq("the carrier tries again: due_at cleared", out.ok && out.set.dueAt, null);

  // postponed + ship_after (OD49)
  const pp = plan(order({ confirm: "confirmed", ship: "attempt_failed" }), { want: { ship: "postponed" }, shipAfter: at(3 * DAY) }, only("L"));
  eq("postponed sets ship_after and clears due_at", pp.ok && [pp.set.shipAfter?.toISOString(), pp.set.dueAt, pp.flags.hold?.toISOString()], [at(3 * DAY).toISOString(), null, at(3 * DAY).toISOString()]);
  eq("the delivery lane's reschedule (S) may postpone", err(plan(order({ confirm: "confirmed", ship: "attempt_failed" }), { want: { ship: "postponed" }, shipAfter: at(DAY) }, only("S"))), "ok");

  // the hold on a confirmation: (now, now + 60 d]
  const hold = (t: Date | null, o = order({ confirm: "callback" }), want: Partial<OrderStates> = { confirm: "confirmed" }) => err(plan(o, { want, shipAfter: t }, only("W", "L")));
  eq("hold at now → bad_hold", hold(NOW), "bad_hold");
  eq("hold 1 ms after now", hold(at(1)), "ok");
  eq("hold at now + 60 days", hold(at(60 * DAY)), "ok");
  eq("hold at now + 60 days + 1 ms → bad_hold", hold(at(60 * DAY + 1)), "bad_hold");
  eq("hold in the past → bad_hold", hold(at(-DAY)), "bad_hold");
  eq("null removes a hold", hold(null), "ok");
  eq("a hold on a cancellation → bad_hold", err(plan(order({ confirm: "new" }), { want: { confirm: "cancelled" }, reason: "price", shipAfter: at(DAY) }, only("W"))), "bad_hold");
  const drawer = plan(order({ confirm: "confirmed", ship: "to_pack" }), { want: {}, shipAfter: at(5 * DAY) }, only("W"));
  eq("a hold set from the drawer on a confirmed order: no move, changed", drawer.ok && [drawer.moves.length, drawer.changed, drawer.set.shipAfter?.toISOString()], [0, true, at(5 * DAY).toISOString()]);
  eq("no hold on a shipped parcel", hold(at(DAY), order({ confirm: "confirmed", ship: "shipped" }), {}), "bad_hold");
  const confirmHold = plan(order({ confirm: "callback" }), { want: { confirm: "confirmed" }, shipAfter: at(4 * DAY) }, only("W"));
  eq("confirmed with \"Deliver from…\": to_pack as always, ship_after written, hold_set flagged", confirmHold.ok && [confirmHold.states.ship, confirmHold.set.shipAfter?.toISOString(), !!confirmHold.flags.hold], ["to_pack", at(4 * DAY).toISOString(), true]);

  // callbacks: due in (now, now + 30 d]
  const cb = (t: Date) => err(plan(order({ confirm: "attempting" }), { want: { confirm: "callback" }, dueAt: t }, only("W")));
  eq("callback at now → bad_due", cb(NOW), "bad_due");
  eq("callback in 30 days", cb(at(30 * DAY)), "ok");
  eq("callback in 30 days + 1 ms → bad_due", cb(at(30 * DAY + 1)), "bad_due");
  const cbSet = plan(order({ confirm: "attempting" }), { want: { confirm: "callback" }, dueAt: at(2 * 3_600_000) }, only("W"));
  eq("a callback sets due_at", cbSet.ok && cbSet.set.dueAt?.toISOString(), at(2 * 3_600_000).toISOString());

  // returnReason only on refused / returned / lost (OD50)
  const rr = (from: ShipState, to: ShipState, returnReason?: "refused_price" | "damaged") => {
    const p = plan(order({ confirm: "confirmed", ship: from }), { want: { ship: to }, reason: "other", ...(returnReason ? { returnReason } : {}) }, only("L", "A"));
    return p.ok ? ("returnReason" in p.set ? p.set.returnReason : "unset") : p.error;
  };
  eq("refused with a reason writes it", rr("out_for_delivery", "refused", "refused_price"), "refused_price");
  eq("lost with a reason writes it", rr("in_transit", "lost", "damaged"), "damaged");
  eq("returned without a reason writes NULL (\"no reason\", never guessed)", rr("shipped", "returned"), null);
  eq("refused → returned without a reason keeps the refusal's", rr("refused", "returned"), "unset");
  eq("a reason given with delivered is not written", rr("shipped", "delivered", "refused_price"), "unset");
  eq("a reason given with in_transit is not written", rr("shipped", "in_transit", "damaged"), "unset");
  const final = plan(order({ confirm: "confirmed", ship: "refused" }), { want: { ship: "returned" } }, only("L"));
  eq("refused → returned keeps the first final_at", final.ok && "finalAt" in final.set, false);
  const reship = plan(order({ confirm: "confirmed", ship: "returned" }), { want: { ship: "to_pack" }, reason: "re-ship" }, only("A"));
  eq("a re-shipment clears final_at and the reason", reship.ok && [reship.set.finalAt, reship.set.returnReason], [null, null]);

  // delivered: money and the settlement (OD51, OD52)
  const stmt = plan(order({ confirm: "confirmed", ship: "out_for_delivery" }), { want: { ship: "delivered" } }, only("L"));
  eq("delivered (statement carrier) ⇒ collected, collected_cents = total", [movesOf(stmt), stmt.ok && stmt.set.collectedCents, stmt.ok && stmt.flags.settledAtDelivery], [["ship:out_for_delivery>delivered", "money:unpaid>collected!a"], 25_000, undefined]);
  const door = plan(order({ confirm: "confirmed", ship: "out_for_delivery" }), { want: { ship: "delivered" } }, only("L"), ctx({ settlement: "at_delivery" }));
  eq("delivered (cash at the door) ⇒ collected and remitted in the same plan", [movesOf(door), door.ok && door.states.money, door.ok && door.flags.settledAtDelivery], [["ship:out_for_delivery>delivered", "money:unpaid>collected!a", "money:collected>remitted!a"], "remitted", true]);
  eq("delivered with a typed amount", (() => {
    const p = plan(order({ confirm: "confirmed", ship: "shipped" }), { want: { ship: "delivered" }, collectedCents: 20_000 }, only("L"));
    return p.ok && p.set.collectedCents;
  })(), 20_000);
  for (const [x, why] of [[25_001, "above the total"], [-1, "negative"], [1.5, "not whole cents"]] as const) {
    eq(`collectedCents ${why} → bad_amount`, err(plan(order({ confirm: "confirmed", ship: "shipped" }), { want: { ship: "delivered" }, collectedCents: x }, only("L"))), "bad_amount");
  }
  eq("collectedCents without a delivery → bad_amount", err(plan(order({ confirm: "confirmed", ship: "shipped" }), { want: { ship: "in_transit" }, collectedCents: 100 }, only("L"))), "bad_amount");
  const ret = plan(order({ confirm: "confirmed", ship: "delivered", money: "collected" }), { want: { ship: "returned" }, reason: "customer return" }, only("A"));
  eq("delivered → returned ⇒ money collected → unpaid", movesOf(ret), ["ship:delivered>returned", "money:collected>unpaid!a"]);
  eq("delivered → returned keeps a remitted order's money", movesOf(plan(order({ confirm: "confirmed", ship: "delivered", money: "remitted" }), { want: { ship: "returned" }, reason: "customer return" }, only("A"))), ["ship:delivered>returned"]);

  // refunds (R2 cells, OD59)
  const refund = (money: MoneyState, refundCents: number | undefined, collectedCents: number | null = 25_000) =>
    err(plan(order({ confirm: "confirmed", ship: "delivered", money }, { collectedCents }), { want: { money: "refunded" }, reason: "damaged", ...(refundCents === undefined ? {} : { refundCents }) }, only("M")));
  eq("refund of part of the collected cash", refund("collected", 5_000), "ok");
  eq("refund after remittance", refund("remitted", 25_000), "ok");
  eq("a refund of 0 → bad_amount", refund("collected", 0), "bad_amount");
  eq("a refund above the collected cash → bad_amount", refund("collected", 25_001), "bad_amount");
  eq("a refund below the total but above a smaller collected amount → bad_amount", refund("collected", 21_000, 20_000), "bad_amount");
  eq("a refund without an amount → bad_amount", refund("collected", undefined), "bad_amount");
  eq("unpaid → refunded is illegal", refund("unpaid", 100), "illegal");
  eq("an amount without a refund → bad_amount", err(plan(order({ confirm: "confirmed", ship: "delivered", money: "collected" }), { want: { money: "remitted" }, refundCents: 100 }, only("M"))), "bad_amount");
  const rf = plan(order({ confirm: "confirmed", ship: "delivered", money: "collected" }, { collectedCents: 25_000 }), { want: { money: "refunded" }, reason: "damaged", refundCents: 9_900 }, only("M"));
  eq("a refund writes refund_cents and refunded_at, never the ship axis", rf.ok && [rf.set.refundCents, rf.set.refundedAt?.toISOString(), rf.states.ship], [9_900, NOW.toISOString(), "delivered"]);

  // forced moves (orders.force_status)
  const forced = plan(order({ confirm: "fake" }), { want: { confirm: "confirmed" }, force: true, reason: "agent pressed fake by mistake" }, MANAGER);
  eq("a forced move: one axis, flagged, its automatic moves follow", movesOf(forced), ["confirm:fake>confirmed!f", "ship:none>to_pack!a"]);
  eq("forced without a reason", err(plan(order({ confirm: "fake" }), { want: { confirm: "confirmed" }, force: true }, MANAGER)), "reason_required");
  eq("forced without orders.force_status", err(plan(order({ confirm: "fake" }), { want: { confirm: "confirmed" }, force: true, reason: "mistake" }, only("W", "A"))), "forbidden");
  eq("forced on two axes", err(plan(order({ confirm: "new" }), { want: { confirm: "confirmed", ship: "shipped" }, force: true, reason: "mistake" }, MANAGER)), "illegal");
  eq("an external source never forces", err(plan(order({ confirm: "fake" }), { want: { confirm: "confirmed" }, force: true, reason: "x-sheet" }, { ...EXTERNAL, force: true })), "forbidden");
  eq("forced ship move straight to delivered (no walked path)", movesOf(plan(order({ confirm: "confirmed", ship: "to_pack" }), { want: { ship: "delivered" }, force: true, reason: "delivered by hand" }, MANAGER)), ["ship:to_pack>delivered!f", "money:unpaid>collected!a"]);

  // R2: an open shipment pins the parcel
  eq("an open shipment: cancelling a packed order → locked_ship", err(plan(order({ confirm: "confirmed", ship: "packed" }, { shipmentOpen: true }), { want: { confirm: "cancelled" }, reason: "price" }, only("W"))), "locked_ship");
  eq("an open shipment does not stop the parcel moving on", err(plan(order({ confirm: "confirmed", ship: "packed" }, { shipmentOpen: true }), { want: { ship: "shipped" } }, only("L"))), "ok");

  // the priority is recomputed on every change and keeps a pin
  const pinned = plan(order({ confirm: "new" }, { priority: 1_510 }), { want: { confirm: "attempting" } }, only("W"));
  eq("a pinned order stays pinned (attempting 300 + amount 10 + pin 1000)", pinned.ok && pinned.set.priority, 1_310);
  const again = plan(order({ confirm: "attempting" }, { attempts: 1 }), { want: { confirm: "attempting" }, extra: { attempts: 2 } }, only("W"));
  eq("a repeated no-answer (no move, attempts 2): the priority follows (300 + 10 − 80)", again.ok && [again.changed, again.set.priority], [false, 230]);
  const noop = plan(order({ confirm: "new" }), { want: { confirm: "new" } }, only("W"));
  eq("a no-op writes nothing (no priority, no projection change)", noop.ok && [noop.changed, noop.moves.length, "priority" in noop.set], [false, 0, false]);
}

/* ------------------------------------------------------------------ */
/* 6. invariants, legalMoves, movePermsOf                              */
/* ------------------------------------------------------------------ */

section = "invariants";
{
  const set = (xs: readonly string[]) => [...new Set(xs)].sort();
  eq("CONFIRM_STATES = the confirm_state enum set", set(CONFIRM_STATES), set(orders.confirmState.enumValues));
  eq("SHIP_STATES = the ship_state enum set (order not compared)", set(SHIP_STATES), set(orders.shipState.enumValues));
  ok("SHIP_STATES is a display order, not the DB order", JSON.stringify(SHIP_STATES) !== JSON.stringify(orders.shipState.enumValues));
  // refunded is appended by 0006 (R2, OD59); the R1 enum is the rest
  eq("MONEY_STATES = the money_state enum set + refunded (0006)", set(MONEY_STATES), set([...orders.moneyState.enumValues, "refunded"]));

  // only attempt_failed ever sets due_at on a confirmed order (every other ship move clears it)
  let sweeps = 0;
  const offenders: string[] = [];
  for (const from of SHIP_STATES) {
    for (const to of SHIP_STATES) {
      for (const force of [false, true]) {
        const p = plan(order({ confirm: "confirmed", ship: from }), { want: { ship: to }, reason: "other", force, shipAfter: to === "postponed" ? at(DAY) : undefined }, { classes: new Set(CLASSES), force: true, external: false });
        if (!p.ok || p.states.confirm !== "confirmed") continue;
        sweeps++;
        const sets = p.set.dueAt instanceof Date;
        const viaAttempt = p.moves.some((m) => m.axis === "ship" && m.to === "attempt_failed");
        if (sets !== viaAttempt) offenders.push(`${from}→${to}${force ? " (forced)" : ""}`);
        if (p.moves.some((m) => m.axis === "ship") && !viaAttempt && p.set.dueAt !== null) offenders.push(`${from}→${to} keeps due_at`);
      }
    }
  }
  for (const s of CONFIRM_STATES) {
    const p = plan(order({ confirm: s, ship: "none" }), { want: { confirm: "confirmed" }, reason: "other", force: true }, MANAGER);
    if (p.ok && p.set.dueAt !== null && p.moves.length) offenders.push(`${s}→confirmed`);
  }
  eq("due_at on a confirmed order: set only by attempt_failed, cleared by every other ship move", offenders, []);
  ok("the sweep covered the ship moves", sweeps > 100, sweeps);

  // legalMoves (the "Move to…" menu)
  const list = (cur: OrderStates, perms: MovePerms) => legalMoves(cur, perms).map((m) => `${m.axis}:${m.to}${m.reason ? "†" : ""}${m.implied ? "!i" : ""}`);
  const agent = movePermsOf({ kind: "user", userId: "u", can: (p) => can("agent", p) }, "ui");
  eq("an agent on a new order: the confirmation moves only", list({ confirm: "new", ship: "none", money: "unpaid" }, agent), ["confirm:attempting", "confirm:callback", "confirm:confirmed", "confirm:cancelled†", "confirm:fake", "confirm:duplicate"]);
  const logistics = movePermsOf({ kind: "user", userId: "u", can: (p) => can("logistics", p) }, "ui");
  eq("logistics on a confirmed order to pack: packing, shipping and the walked targets", list({ confirm: "confirmed", ship: "to_pack", money: "unpaid" }, logistics), [
    "confirm:cancelled†",
    "ship:packed",
    "ship:shipped",
    "ship:in_transit!i",
    "ship:out_for_delivery!i",
    "ship:attempt_failed!i",
    "ship:delivered!i",
    "ship:refused!i",
    "ship:returned!i",
    "ship:lost!i",
  ]);
  const manager = movePermsOf({ kind: "user", userId: "u", can: (p) => can("manager", p) }, "ui");
  eq("a manager on a cancelled order: reopen (with a reason) only", list({ confirm: "cancelled", ship: "none", money: "unpaid" }, manager), ["confirm:attempting†", "confirm:confirmed†"]);
  eq("a sheet on a cancelled order: no confirmation or ship move (money keeps its own table)", list({ confirm: "cancelled", ship: "none", money: "unpaid" }, movePermsOf({ kind: "sheet", userId: null }, "sheet")), ["money:collected"]);
  ok("every listed move plans ok", (() => {
    const cur: OrderStates = { confirm: "confirmed", ship: "to_pack", money: "unpaid" };
    return legalMoves(cur, logistics).every((m) => err(plan(order(cur), { want: { [m.axis]: m.to }, reason: "other" }, logistics)) === "ok");
  })());

  // movePermsOf per role (core §A.3 through auth/permissions.ts)
  const classesOf = (role: StoreRole) => {
    const p = movePermsOf({ kind: "user", userId: "u", role, can: (x) => can(role, x) }, "ui");
    return [[...p.classes].sort().join(""), p.force, p.external];
  };
  eq("owner: W A L M + force", classesOf("owner"), ["ALMW", true, false]);
  eq("manager: W A L + force", classesOf("manager"), ["ALW", true, false]);
  eq("agent: W", classesOf("agent"), ["W", false, false]);
  eq("logistics: W L", classesOf("logistics"), ["LW", false, false]);
  eq("accountant: M", classesOf("accountant"), ["M", false, false]);
  eq("viewer: nothing", classesOf("viewer"), ["", false, false]);
  const sys = movePermsOf({ kind: "system", userId: null }, "system");
  eq("the system: every class with S, never force", [[...sys.classes].sort().join(""), sys.force, sys.external], ["ALMSW", false, false]);
  for (const src of ["sheet", "carrier", "import", "api"] as const) {
    const e = movePermsOf({ kind: "user", userId: "u", can: () => false }, src);
    eq(`source ${src}: external, every class but S, never force`, [[...e.classes].sort().join(""), e.force, e.external], ["ALMW", false, true]);
  }
}

/* ------------------------------------------------------------------ */

const ms = performance.now() - started;
const clock = recordSuiteTime("state", ms);
console.log(`test:state  ${passes} passed, ${failures.length} failed  (${(ms / 1000).toFixed(2)} s; operations suites ${(clock.totalMs / 1000).toFixed(1)} s of 25 s: ${JSON.stringify(clock.parts)})`);
if (clock.over) failures.push(`[clock] test:state + test:ops + test:profit took ${(clock.totalMs / 1000).toFixed(1)} s, above 25 s (OPE-§O.1)`);
if (failures.length) {
  for (const f of failures) console.error("FAIL " + f);
  process.exit(1);
}
