/**
 * Sheets run planner self test (P5 INTEGRATIONS; operations.md OPE-§O.1 "sheets", OPE-§O.4 IN-01 planner half, IN-09
 * R1, OP-16 R1; OD2, OD5, OD22, OD49, OD54, OD55; core D74). Offline: no database, no network, no server module. It is
 * the "sheets" section of scripts/qa/conversions-check.ts (`test:conversions`), and runs alone too:
 *
 *   npx tsx src/lib/sheets/selftest.ts      (exit code 1 on failure)
 *
 * - the call budget: every fixture (maxCalls 1, 2, 3 × pull off / on / due × headers known or not × the work mixes)
 *   runs the whole two-step protocol against a fake sheet and never makes more than one read, one append and one
 *   values:batchUpdate, nor more calls than `maxCalls`; the widened read stays one range;
 * - the work predicates: `is_test = 0` in appends, updates and the pull; the backoff; the caps (100, 200), oldest first;
 * - bits → cells, with the four export headers and R1's seven ("Repère" included), and their detection;
 * - the conflict table of OPE-§19.6 and its bookkeeping; another store's id; the row-deleted case;
 * - the optional pulled cells: "Note agent" cellHash dedupe, "Tracking" → packed only pre-ship and never cleared,
 *   "Agent" mapped → confirmed_by, unmapped → confirmed_by_label, never re-attributing a queue confirmation;
 * - "Statut livraison" in the sheet's locale, "Livrer à partir du" in the store's zone; every legacy label, the five
 *   appended ones included;
 * - the legacy binding rule (./legacy-rule.ts, OPE-§19.2): a code proof is never moved, the earliest `connectedAt`
 *   keeps a shared spreadsheet (a missing date first, ties by store id), a later legacy holder gives it up, a lone
 *   unbound store claims, a lone holder needs nothing; the same members give the same plans in any order.
 */
import { ORDER_STATUSES } from "@/lib/orders/contract";
import type { ConfirmState, ShipState } from "@/lib/orders/state";
import {
  APPEND_MAX,
  HEADER_RANGE,
  ROW_NOT_FOUND,
  UPDATE_MAX,
  appendDue,
  cellHash,
  planSheetRun,
  pullDecisions,
  sheetRowsOf,
  statusBookkeeping,
  updateDue,
  type PlanOrder,
  type PullDecision,
  type SheetRead,
  type SheetRunInput,
  type SheetRunPlan,
} from "./plan";
import { legacyPlans, type LegacyMember } from "./legacy-rule";
import { extraColumnsOf, r1Values, sheetColumnsOf, shipAfterCell, shipStateLabel, statusFromLabel, statusLabel, type SheetColumns } from "./row";

export interface SectionResult {
  pass: number;
  failures: string[];
  notes: string[];
  ms: number;
}

/** The wall time this section may add to `test:conversions`. */
const BUDGET_MS = 1000;

const T0 = Date.parse("2026-10-28T10:00:00.000Z");
const NOW = new Date(T0);
const MIN = 60_000;

/** The header row after M of a sheet with every optional column: N = SKU … X = Livrer à partir du. */
const FULL_HEADER = ["SKU", "Articles", "Livraison", "Prix pack", "Repère", "Agent", "Note agent", "Tracking", "Transporteur", "Statut livraison", "Livrer à partir du"];
const FULL_COLS = sheetColumnsOf(FULL_HEADER);

let seq = 0;
function order(over: Partial<PlanOrder> = {}): PlanOrder {
  seq++;
  const id = over.id ?? `CMD-T${String(seq).padStart(5, "0")}`;
  return {
    id,
    createdAt: new Date(T0 - (10_000 - seq) * MIN),
    status: "new",
    name: "Salma Test",
    phone: "+212612345678",
    city: "Casablanca",
    address: "Rue 1",
    productName: "Huile",
    items: { bundleId: "b2", bundleLabel: "Pack Duo (x2)", qty: 2, unitPrice: 174.5, variants: [{ Couleur: "Noir" }, { Couleur: "Noir" }] },
    qty: 2,
    subtotal: 349,
    shipping: 0,
    total: 349,
    note: null,
    email: null,
    riskScore: 0,
    utm: null,
    source: "live",
    ref: null,
    landmark: null,
    confirmState: "new",
    shipState: "none",
    confirmedBy: null,
    confirmedByLabel: null,
    trackingRef: null,
    carrierLabel: null,
    shipAfter: null,
    rev: 3,
    updatedAt: new Date(T0 - 60 * MIN),
    isTest: false,
    sheetStatus: "pending",
    sheetAttempts: 0,
    sheetDirty: 0,
    sheetLabel: null,
    lastSheetNoteHash: null,
    ...over,
  };
}
const synced = (over: Partial<PlanOrder> = {}) => order({ sheetStatus: "synced", sheetLabel: (over.status as PlanOrder["sheetLabel"]) ?? "new", ...over });

/** A fake sheet: header cells after M, then rows A2… (the cells the test sets; the API trims trailing blanks). */
function fakeSheet(header: readonly string[], rows: { id: string; label?: string; cells?: Partial<Record<keyof SheetColumns, string>> }[]): SheetRead {
  const cols = sheetColumnsOf(header);
  return {
    header,
    rows: rows.map((r) => {
      const out: string[] = [r.id, "", r.label ?? ""];
      for (const [k, v] of Object.entries(r.cells ?? {})) {
        const c = cols[k as keyof SheetColumns];
        if (c === undefined) continue;
        while (out.length <= c) out.push("");
        out[c] = v as string;
      }
      while (out.length && out[out.length - 1] === "") out.pop();
      return out;
    }),
  };
}

/** Run the two steps the runner runs; the read is cut to the width the plan asked for. Counts every call. */
function runPlan(input: SheetRunInput, sheet: SheetRead): { plan: SheetRunPlan; reads: number; ranges: number; first: SheetRunPlan } {
  const first = planSheetRun(input);
  if (!first.read) return { plan: first, reads: 0, ranges: 0, first };
  const spec = first.read;
  const read: SheetRead = { header: sheet.header, rows: spec.rows ? sheet.rows.map((r) => r.slice(0, spec.width)) : [] };
  const plan = planSheetRun({ ...input, read });
  return { plan, reads: 1, ranges: spec.rows ? 2 : 1, first };
}

const ctx = { timeZone: "Africa/Casablanca", locale: "fr" as const };
const base = (over: Partial<SheetRunInput>): SheetRunInput => ({ now: NOW, maxCalls: 3, orders: [], headers: FULL_COLS, pull: "off", ctx, ...over });

export function sheetsSelftest(): SectionResult {
  const t0 = performance.now();
  let pass = 0;
  const failures: string[] = [];
  const notes: string[] = [];
  const ok = (label: string, cond: boolean, info?: unknown) => {
    if (cond) pass++;
    else failures.push(`sheets: ${label}${info === undefined ? "" : `\n    ${JSON.stringify(info)}`}`);
  };
  const eq = (label: string, got: unknown, want: unknown) => ok(label, JSON.stringify(got) === JSON.stringify(want), { got, want });

  /* ---------------- labels (OPE-§3.3) ---------------- */
  ok("every status label and id parses back", ORDER_STATUSES.every((s) => statusFromLabel(s.fr) === s.id && statusFromLabel(s.id) === s.id && statusFromLabel(statusLabel(s.id)) === s.id));
  eq(
    "the appended labels, any case, accents optional",
    ["Refusée", "doublon", "INJOIGNABLE  CLOTUREE", "en livraison", " Perdue ", "Injoignable", "Expediee", "", "Peut-être", "unknown"].map(statusFromLabel),
    ["refused", "duplicate", "unreachable", "in_transit", "lost", "no_answer", "shipped", null, null, null],
  );

  /* ---------------- headers (OPE-§19.4) ---------------- */
  eq("the eleven optional headers", FULL_COLS, {
    sku: 13, articles: 14, delivery: 15, packPrice: 16, landmark: 17, agent: 18, agentNote: 19, tracking: 20, carrier: 21, shipStatus: 22, shipAfter: 23,
  });
  eq("headers: trimmed, any case, accents optional, first occurrence wins", sheetColumnsOf(["  repere ", "AGENT", "note   agent", "Agent", "livrer a partir du", "STATUT LIVRAISON"]), {
    landmark: 13, agent: 14, agentNote: 15, shipAfter: 17, shipStatus: 18,
  });
  eq("the export's four are unchanged (test:php: Agent is not one of them)", extraColumnsOf(["Agent", "Repère", "Tracking"]), {});
  eq("no optional header", sheetColumnsOf(["Commentaire", ""]), {});

  /* ---------------- R1 cells ---------------- */
  eq(
    "Statut livraison: P4's ops.ship labels (fr, since the P4 merge), empty before shipping",
    (["none", "to_pack", "packed", "shipped", "in_transit", "out_for_delivery", "attempt_failed", "postponed", "delivered", "refused", "returned", "lost"] as ShipState[]).map((s) => shipStateLabel(s, "fr")),
    ["", "À préparer", "Emballée", "Expédiée", "En transit", "En cours de livraison", "Tentative échouée", "Reportée", "Livrée", "Refusée", "Retournée", "Perdue"],
  );
  const fr = r1Values(order({ shipState: "attempt_failed" }), { ...ctx, shipLabel: (s) => (s === "attempt_failed" ? "Tentative échouée" : s) });
  const ar = r1Values(order({ shipState: "attempt_failed" }), { ...ctx, locale: "ar", shipLabel: (s) => (s === "attempt_failed" ? "محاولة فاشلة" : s) });
  eq("Statut livraison: the sheet's locale through the injected label", [fr.shipStatus, ar.shipStatus], ["Tentative échouée", "محاولة فاشلة"]);
  eq("Livrer à partir du: the hold's day in the store's zone", [shipAfterCell(new Date("2026-11-04T16:00:00Z"), "Asia/Tokyo"), shipAfterCell(new Date("2026-11-04T16:00:00Z"), "Africa/Casablanca"), shipAfterCell(null, "Africa/Casablanca")], ["05/11/2026", "04/11/2026", ""]);
  const named = r1Values(order({ confirmedBy: "01JUSER0000000000000000001", confirmedByLabel: "Ahmed", landmark: "près de la mosquée", trackingRef: "AMN123", carrierLabel: "Amana" }), { ...ctx, memberNames: { "01JUSER0000000000000000001": "Salma B." } });
  eq("Agent: the member's name wins over the label; Repère, Tracking, Transporteur", [named.agent, named.landmark, named.tracking, named.carrier], ["Salma B.", "près de la mosquée", "AMN123", "Amana"]);
  const bare = r1Values(order(), ctx);
  eq("nothing known → the cell is left alone (null), never blanked", [bare.agent, bare.tracking, bare.carrier, bare.landmark], [null, null, null, null]);
  eq("Agent: the label when no member is mapped", r1Values(order({ confirmedByLabel: "Ahmed" }), ctx).agent, "Ahmed");

  /* ---------------- work predicates (is_test = 0 everywhere) ---------------- */
  const failedAgo = (min: number, attempts: number) => order({ sheetStatus: "failed", sheetAttempts: attempts, updatedAt: new Date(T0 - min * MIN) });
  eq("backoff: 2^attempts minutes, capped at 360", [appendDue(failedAgo(7, 3), NOW), appendDue(failedAgo(9, 3), NOW), appendDue(failedAgo(359, 20), NOW), appendDue(failedAgo(361, 20), NOW), appendDue(failedAgo(1, 3), NOW, true)], [false, true, false, true, true]);
  const tests = [order({ isTest: true }), order({ isTest: true, sheetStatus: "failed", updatedAt: new Date(0) }), synced({ isTest: true, sheetDirty: 7 })];
  ok("a test order is never append or update work, even forced", tests.every((o) => !appendDue(o, NOW, true) && !updateDue(o)));
  const testPlan = runPlan(base({ orders: tests, pull: "due", pullOrders: tests }), fakeSheet(FULL_HEADER, tests.map((o) => ({ id: o.id, label: "Confirmée", cells: { tracking: "X1" } }))));
  ok("a test order is never appended, updated or pulled", !testPlan.plan.append && !testPlan.plan.batchUpdate && testPlan.plan.marks.length === 0 && testPlan.plan.pull.length === 0, testPlan.plan);
  ok("disabled orders are not work", !appendDue(order({ sheetStatus: "disabled" }), NOW, true) && !updateDue(order({ sheetStatus: "disabled", sheetDirty: 1 })));

  /* ---------------- the call budget (OD22, OPE-§19.7) ---------------- */
  const mixes: Record<string, () => PlanOrder[]> = {
    empty: () => [],
    fresh: () => [order(), order()],
    retry: () => [order({ sheetAttempts: 1 }), order()],
    upsell: () => [order({ items: { ...order().items, upsell: { title: "Sérum", price: 49 } } })],
    dirty: () => [synced({ sheetDirty: 1, status: "confirmed", confirmState: "confirmed" }), synced({ sheetDirty: 6 })],
    all: () => [order(), order({ sheetAttempts: 2 }), synced({ sheetDirty: 7 }), synced({ sheetDirty: 2 }), failedAgo(500, 1)],
  };
  let fixtures = 0;
  let worst = 0;
  for (const [mix, make] of Object.entries(mixes))
    for (const maxCalls of [1, 2, 3] as const)
      for (const pull of ["off", "on", "due"] as const)
        for (const headers of [FULL_COLS, null]) {
          const orders = make();
          const sheet = fakeSheet(FULL_HEADER, orders.filter((o) => o.sheetStatus === "synced" || o.sheetAttempts > 0).map((o) => ({ id: o.id, label: statusLabel(o.status) })));
          const r = runPlan(base({ orders, maxCalls, pull, headers }), sheet);
          const used = r.reads + (r.plan.append ? 1 : 0) + (r.plan.batchUpdate ? 1 : 0);
          fixtures++;
          worst = Math.max(worst, used);
          const label = `${mix} · maxCalls ${maxCalls} · pull ${pull} · headers ${headers ? "known" : "unknown"}`;
          ok(`budget: ≤ maxCalls and ≤ 1 read + 1 append + 1 batchUpdate (${label})`, used <= maxCalls && r.reads <= 1 && r.plan.calls === used, { used, calls: r.plan.calls });
          ok(`budget: the step-1 plan of a read asks for nothing else (${label})`, !r.first.read || (!r.first.append && !r.first.batchUpdate && r.first.marks.length === 0));
          ok(`budget: the read is one batchGet of ≤ 2 ranges (${label})`, r.ranges <= 2 && (!r.first.read || r.first.read.header === HEADER_RANGE));
          const total = orders.filter((o) => appendDue(o, NOW) || updateDue(o)).length;
          const handled = new Set(r.plan.marks.map((m) => m.id)).size;
          ok(`budget: work is handled or deferred, never lost (${label})`, handled + r.plan.deferred.appends + r.plan.deferred.updates >= total, { handled, deferred: r.plan.deferred, total });
        }
  notes.push(`sheets: ${fixtures} budget fixtures, at most ${worst} calls in one run`);

  const fastAppend = runPlan(base({ orders: [order(), order()], maxCalls: 2 }), fakeSheet(FULL_HEADER, []));
  ok("after() fast path: new orders are one append, no read", fastAppend.reads === 0 && fastAppend.plan.append?.rows.length === 2 && fastAppend.plan.calls === 1);
  const dirtyOnly = [synced({ sheetDirty: 1, status: "confirmed", confirmState: "confirmed" })];
  const fastUpdate = runPlan(base({ orders: dirtyOnly, maxCalls: 2 }), fakeSheet(FULL_HEADER, [{ id: dirtyOnly[0]!.id, label: "Nouvelle" }]));
  ok("after() fast path: a status change is read + batchUpdate", fastUpdate.reads === 1 && !!fastUpdate.plan.batchUpdate && !fastUpdate.plan.append && fastUpdate.plan.calls === 2);
  const both = [order({ sheetAttempts: 1 }), synced({ sheetDirty: 1 })];
  const fastBoth = runPlan(base({ orders: both, maxCalls: 2 }), fakeSheet(FULL_HEADER, [{ id: both[1]!.id, label: "Nouvelle" }]));
  ok("after() fast path: a retry and an update → read + append, the update deferred", fastBoth.plan.calls === 2 && !!fastBoth.plan.append && !fastBoth.plan.batchUpdate && fastBoth.plan.deferred.updates === 1, fastBoth.plan);
  const unknownHeaders = runPlan(base({ orders: [order()], headers: null }), fakeSheet(FULL_HEADER, []));
  ok("headers unknown: the read is the header row only, then the append with every optional column", unknownHeaders.first.read?.rows === null && (unknownHeaders.plan.append?.rows[0]?.length ?? 0) === 24 && unknownHeaders.plan.calls === 2, unknownHeaders.first.read);

  /* ---------------- the widened read (IN-09 R1) ---------------- */
  const wide = planSheetRun(base({ orders: dirtyOnly, pull: "due" }));
  eq("pull due: one read widened to the last pulled column (U = Transporteur)", wide.read, { header: HEADER_RANGE, rows: "A2:V", width: 22 });
  const narrow = planSheetRun(base({ orders: dirtyOnly, pull: "on" }));
  eq("pull not due: the read stays A2:C", narrow.read, { header: HEADER_RANGE, rows: "A2:C", width: 3 });
  const noPulled = planSheetRun(base({ orders: dirtyOnly, pull: "due", headers: sheetColumnsOf(["SKU", "Statut livraison"]) }));
  eq("pull due without a pulled header: A2:C", noPulled.read?.rows, "A2:C");

  /* ---------------- caps and order of service ---------------- */
  const many = Array.from({ length: 150 }, () => order());
  const capped = runPlan(base({ orders: [...many].reverse() }), fakeSheet(FULL_HEADER, []));
  ok(`appends ≤ ${APPEND_MAX}, oldest first, the rest deferred`, capped.plan.append?.ids.length === APPEND_MAX && capped.plan.append.ids[0] === many[0]!.id && capped.plan.deferred.appends === 50, capped.plan.deferred);
  const dirtyMany = Array.from({ length: 250 }, () => synced({ sheetDirty: 1 }));
  const cappedU = runPlan(base({ orders: dirtyMany }), fakeSheet(FULL_HEADER, dirtyMany.map((o) => ({ id: o.id, label: "Nouvelle" }))));
  ok(`updates ≤ ${UPDATE_MAX}, the rest deferred`, cappedU.plan.marks.filter((m) => m.outcome === "updated").length === UPDATE_MAX && cappedU.plan.deferred.updates === 50 && cappedU.plan.calls === 2);

  /* ---------------- appends ---------------- */
  const fresh = order({ landmark: "Derb Omar", shipState: "none" });
  const ap = planSheetRun(base({ orders: [fresh] }));
  const row = ap.append?.rows[0] ?? [];
  eq("append: 13 contract cells, then the optional columns with a value (Repère), null elsewhere", [row.length, row[0], row[2], row[13], row[17], row[18], row[19], row[20]], [24, fresh.id, "Nouvelle", "Huile×2", "Derb Omar", null, null, null]);
  eq("append: mark synced, sheet_label written, every bit cleared while rev holds", ap.marks, [{ id: fresh.id, outcome: "appended", rev: 3, set: { sheetStatus: "synced", sheetLabel: "new", sheetError: null }, clearDirty: 7, dirtyOr: 0 }]);
  const retry = order({ sheetAttempts: 1, status: "confirmed", confirmState: "confirmed" });
  const retryRun = runPlan(base({ orders: [retry] }), fakeSheet(FULL_HEADER, [{ id: retry.id, label: "Nouvelle" }]));
  eq("retry found in column A: not appended again, marked synced, its stale status cell left dirty", [!!retryRun.plan.append, retryRun.plan.marks], [false, [{ id: retry.id, outcome: "present", rev: 3, set: { sheetStatus: "synced", sheetLabel: "new", sheetError: null }, clearDirty: 0, dirtyOr: 1 }]]);
  const upsold = order({ sheetAttempts: 1, items: { ...order().items, upsell: { title: "Sérum", price: 49 } } });
  const upRun = runPlan(base({ orders: [upsold] }), fakeSheet(FULL_HEADER, [{ id: upsold.id, label: "Nouvelle" }]));
  eq("upsell found in column A: its line cells (bit 4) left dirty", upRun.plan.marks[0]?.dirtyOr, 4);

  /* ---------------- bits → cells ---------------- */
  const ranges = (o: PlanOrder, header = FULL_HEADER) => runPlan(base({ orders: [o] }), fakeSheet(header, [{ id: "CMD-OTHER1", label: "Nouvelle" }, { id: o.id, label: statusLabel(o.sheetLabel ?? "new") }])).plan.batchUpdate?.map((d) => `${d.range}=${d.values[0]!.join("|")}`);
  const conf = synced({ sheetDirty: 1, status: "confirmed", confirmState: "confirmed", shipState: "to_pack", confirmedByLabel: "Ahmed" });
  eq("bit 1 → C + Agent + Statut livraison", ranges(conf), ["C3=Confirmée", "S3=Ahmed", "W3=À préparer"]);
  const contact = synced({ sheetDirty: 2, name: "Salma B", landmark: "Derb", trackingRef: "AMN1", carrierLabel: "Amana", shipAfter: new Date("2026-11-04T12:00:00Z") });
  eq("bit 2 → D-G + Repère + Tracking + Transporteur + Livrer à partir du", ranges(contact), ["D3:G3=Salma B|0612345678|Casablanca|Rue 1", "R3=Derb", "U3:V3=AMN1|Amana", "X3=04/11/2026"]);
  const lines = synced({ sheetDirty: 4, total: 398 });
  eq("bit 4 → H-K + SKU, Articles, Livraison, Prix pack", ranges(lines), ["H3:K3=Huile — Pack Duo (x2)|2 × Noir|2|398", "N3:Q3=Huile×2|2|0|349"]);
  eq("bits without their optional headers → the contract cells only", ranges(synced({ sheetDirty: 7 }), []), ["C3:K3=Nouvelle|Salma Test|0612345678|Casablanca|Rue 1|Huile — Pack Duo (x2)|2 × Noir|2|349"]);
  const upd = runPlan(base({ orders: [conf] }), fakeSheet(FULL_HEADER, [{ id: conf.id, label: "Nouvelle" }]));
  eq("update mark: sheet_label = the label written, the bits written cleared while rev holds", upd.plan.marks, [{ id: conf.id, outcome: "updated", rev: 3, set: { sheetLabel: "confirmed" }, clearDirty: 1, dirtyOr: 0 }]);

  /* ---------------- the row-deleted case ---------------- */
  const gone = synced({ sheetDirty: 1 });
  const del = runPlan(base({ orders: [gone] }), fakeSheet(FULL_HEADER, [{ id: "CMD-ELSE01", label: "Nouvelle" }]));
  eq("a dirty order missing from column A: sheet_error, sheet_dirty 0, never re-appended", [del.plan.missing, del.plan.marks, !!del.plan.append, !!del.plan.batchUpdate], [[gone.id], [{ id: gone.id, outcome: "missing", rev: 3, set: { sheetError: ROW_NOT_FOUND, sheetDirty: 0 }, clearDirty: 0, dirtyOr: 0 }], false, false]);

  /* ---------------- the conflict table (OPE-§19.6) ---------------- */
  const decide = (o: PlanOrder, label: string, cells: Partial<Record<"agent" | "agentNote" | "tracking" | "carrier", string>> = {}, agentLabels: Record<string, string> = {}): PullDecision[] =>
    pullDecisions(sheetRowsOf(fakeSheet(FULL_HEADER, [{ id: o.id, label, cells }]), FULL_COLS, 24), [o], { agentLabels });
  const s1 = synced({ status: "new", sheetLabel: "new" });
  eq("blank label → skip", decide(s1, ""), []);
  eq("unknown label → skip", decide(s1, "Peut-être demain"), []);
  eq("label = sheet_label → nothing", decide(s1, "Nouvelle"), []);
  eq("sheet_label never recorded and the cell shows the app's status → record it", decide(synced({ status: "confirmed", sheetLabel: null }), "Confirmée").map((d) => d.kind), ["label"]);
  const moved = decide(s1, "Confirmée", { agent: "Ahmed" });
  eq("a person changed the cell → applyExternalStatus with the row and the Agent cell", moved, [{ kind: "status", orderId: s1.id, row: 2, label: "confirmed", ext: { legacy: "confirmed" }, src: { kind: "sheet", ref: "row:2", agentLabel: "Ahmed" } }]);
  const d = moved[0] as Extract<PullDecision, { kind: "status" }>;
  eq(
    "bookkeeping: changed and the projection equals the label / implied path / noop / reject / gone",
    [
      statusBookkeeping(d, { ok: true, changed: true, status: "confirmed", rev: 4 }),
      statusBookkeeping(d, { ok: true, changed: true, status: "no_answer", rev: 4 }),
      statusBookkeeping(d, { ok: true, changed: false, noop: true }),
      statusBookkeeping(d, { ok: false, error: "illegal" }),
      statusBookkeeping(d, { ok: false, error: "not_found" }),
    ],
    [
      { sheetLabel: "confirmed", dirtyOr: 0, clearDirty: 1, rev: 4 },
      { sheetLabel: "confirmed", dirtyOr: 1, clearDirty: 0, rev: null },
      { sheetLabel: "confirmed", dirtyOr: 1, clearDirty: 0, rev: null },
      { sheetLabel: "confirmed", dirtyOr: 1, clearDirty: 0, rev: null },
      null,
    ],
  );
  eq("another store's id, a pending order or a test order → ignored (SHT-05)", [
    pullDecisions(sheetRowsOf(fakeSheet(FULL_HEADER, [{ id: "CMD-B00001", label: "Annulée" }]), FULL_COLS, 24), [s1], {}),
    decide(order({ status: "new" }), "Annulée"),
    decide(synced({ isTest: true }), "Annulée"),
  ], [[], [], []]);
  const conflict = synced({ sheetDirty: 3, status: "confirmed", confirmState: "confirmed", sheetLabel: "new", confirmedByLabel: "Ahmed" });
  const cRun = runPlan(base({ orders: [conflict], pull: "on" }), fakeSheet(FULL_HEADER, [{ id: conflict.id, label: "Annulée" }]));
  ok("pull on, not due: a person's edit on a dirty row is pulled, not overwritten unseen", cRun.plan.pull[0]?.kind === "status" && !(cRun.plan.batchUpdate ?? []).some((x) => x.range.startsWith("C") || x.range.startsWith("S") || x.range.startsWith("W")), cRun.plan);
  eq("…and its status bit stays for the bookkeeping (only bit 2 cleared)", cRun.plan.marks.map((m) => m.clearDirty), [2]);
  const offRun = runPlan(base({ orders: [conflict], pull: "off" }), fakeSheet(FULL_HEADER, [{ id: conflict.id, label: "Annulée" }]));
  ok("pull off: the sheet is write-only, the app's label is written", offRun.plan.pull.length === 0 && (offRun.plan.batchUpdate ?? []).some((x) => x.range.startsWith("C2") && x.values[0]![0] === "Confirmée"), offRun.plan.batchUpdate);
  const other = synced({ status: "new", sheetLabel: "new" });
  const dueRun = runPlan(base({ orders: [conflict], pull: "due", pullOrders: [other] }), fakeSheet(FULL_HEADER, [{ id: conflict.id, label: "Annulée" }, { id: other.id, label: "Confirmée" }, { id: "CMD-B00002", label: "Livrée" }]));
  eq("pull due: every row of the store's orders is read back, the rest ignored", dueRun.plan.pull.map((x) => [x.kind, x.orderId]), [["status", conflict.id], ["status", other.id]]);

  /* ---------------- the optional pulled cells (OD54, OD55) ---------------- */
  const conf2 = synced({ status: "confirmed", confirmState: "confirmed", sheetLabel: "confirmed" });
  eq("Agent on a confirmed order nobody attributed: mapped → confirmed_by", decide(conf2, "Confirmée", { agent: " ahmed " }, { Ahmed: "01JUSER0000000000000000001" }), [{ kind: "agent", orderId: conf2.id, row: 2, label: "ahmed", confirmedBy: "01JUSER0000000000000000001" }]);
  eq("Agent unmapped → confirmed_by_label only", decide(conf2, "Confirmée", { agent: "Karim" }).map((x) => (x.kind === "agent" ? x.confirmedBy : "?")), [null]);
  eq("Agent never re-attributes a queue confirmation (confirmed_by set)", decide(synced({ status: "confirmed", confirmState: "confirmed", sheetLabel: "confirmed", confirmedBy: "01JUSER0000000000000000002" }), "Confirmée", { agent: "Karim" }), []);
  eq("Agent equal to confirmed_by_label → nothing", decide(synced({ status: "confirmed", confirmState: "confirmed", sheetLabel: "confirmed", confirmedByLabel: "Karim" }), "Confirmée", { agent: "Karim" }), []);
  eq("Agent on an unconfirmed order without a status change → nothing (it rides on the confirmation)", decide(s1, "Nouvelle", { agent: "Karim" }), []);
  const noted = synced({ lastSheetNoteHash: cellHash("Rappeler après 18h") });
  eq("Note agent: the same cell hash → nothing; a changed cell → one note with the Agent label", [decide(noted, "Nouvelle", { agentNote: "Rappeler   après 18h" }), decide(noted, "Nouvelle", { agentNote: "Client absent", agent: "Karim" })], [[], [{ kind: "note", orderId: noted.id, row: 2, text: "Client absent", cellHash: cellHash("Client absent"), agentLabel: "Karim" }]]);
  eq("Note agent: a blank cell → nothing", decide(synced(), "Nouvelle", { agentNote: "  " }), []);
  const ship = (shipState: ShipState, confirmState: ConfirmState = "confirmed", trackingRef: string | null = null, sheetDirty = 0) =>
    decide(synced({ shipState, confirmState, trackingRef, sheetDirty, status: "confirmed", sheetLabel: "confirmed" }), "Confirmée", { tracking: "AMN-77" }).map((x) => (x.kind === "tracking" ? `${x.trackingRef}${x.ship ? `→${x.ship}` : ""}` : x.kind));
  eq(
    "Tracking: packed only pre-ship (none, to_pack); later states keep their ship state; a closed order is not packed",
    [ship("none"), ship("to_pack"), ship("packed"), ship("shipped"), ship("delivered"), ship("none", "cancelled"), ship("none", "new")],
    [["AMN-77→packed"], ["AMN-77→packed"], ["AMN-77"], ["AMN-77"], ["AMN-77"], ["AMN-77"], ["AMN-77→packed"]],
  );
  eq("Tracking: the same value → nothing; an unpushed drawer edit (bit 2) wins over the cell", [ship("none", "confirmed", "AMN-77"), ship("none", "confirmed", "OLD-1", 2)], [[], []]);
  eq("Tracking: a cleared cell never clears the column", decide(synced({ trackingRef: "AMN-77" }), "Nouvelle", { tracking: "" }), []);
  eq("Tracking with a status cell that ships: no packed request (the status move goes further)", decide(synced({ status: "confirmed", confirmState: "confirmed", sheetLabel: "confirmed" }), "Expédiée", { tracking: "AMN-9" }).map((x) => (x.kind === "tracking" ? x.ship ?? "-" : x.kind)), ["status", "-"]);
  eq("Transporteur: non-empty and different → carrier_label; equal or blank → nothing", [decide(synced(), "Nouvelle", { carrier: "Amana" }).map((x) => x.kind), decide(synced({ carrierLabel: "Amana" }), "Nouvelle", { carrier: "Amana" }), decide(synced({ carrierLabel: "Amana" }), "Nouvelle", { carrier: "" })], [["carrier"], [], []]);
  const tRun = runPlan(base({ orders: [synced({ sheetDirty: 2, trackingRef: null })], pull: "due" }), fakeSheet(FULL_HEADER, []));
  ok("pull cells are read only within the read width (a pulled header the cache did not know is skipped)", sheetRowsOf(fakeSheet(FULL_HEADER, [{ id: "CMD-X00001", label: "Nouvelle", cells: { tracking: "A1" } }]), FULL_COLS, 3)[0]!.cells.tracking === undefined && tRun.plan.calls >= 1);

  const unknownLabel = synced({ status: "confirmed", sheetLabel: null, sheetDirty: 1 });
  eq(
    "no sheet_label recorded and the app's own status change on its way (bit 1): the app's label wins, no move; without the bit the cell is a person's",
    [decide(unknownLabel, "Nouvelle").map((x) => x.kind), decide(synced({ status: "confirmed", sheetLabel: null }), "Livrée").map((x) => x.kind)],
    [[], ["status"]],
  );

  /* ---------------- the legacy binding rule (OPE-§19.2) ---------------- */
  const lm = (storeId: string, spreadsheetId: string, connectedAt: number | null, holds: LegacyMember["holds"] = null): LegacyMember => ({ storeId, spreadsheetId, connectedAt, holds });
  eq("legacy: a lone unbound store claims its spreadsheet; a lone holder needs nothing", legacyPlans([lm("S1", "X", T0), lm("S2", "Y", T0, "legacy")]), [{ spreadsheetId: "X", winner: "S1", claim: true, release: null, losers: [] }]);
  eq("legacy: two stores on one spreadsheet → the earliest connectedAt keeps it, the other is paused", legacyPlans([lm("S2", "X", T0 + MIN), lm("S1", "X", T0)]), [{ spreadsheetId: "X", winner: "S1", claim: true, release: null, losers: ["S2"] }]);
  eq("legacy: a later store's legacy binding moves to the earlier one", legacyPlans([lm("S2", "X", T0 + MIN, "legacy"), lm("S1", "X", T0)]), [{ spreadsheetId: "X", winner: "S1", claim: true, release: "S2", losers: ["S2"] }]);
  eq("legacy: the earlier store already holding it keeps it", legacyPlans([lm("S1", "X", T0, "legacy"), lm("S2", "X", T0 + MIN)]), [{ spreadsheetId: "X", winner: "S1", claim: false, release: null, losers: ["S2"] }]);
  eq("legacy: a code proof is never moved, however late", legacyPlans([lm("S9", "X", T0 + 9 * MIN, "code"), lm("S1", "X", T0)]), [{ spreadsheetId: "X", winner: "S9", claim: false, release: null, losers: ["S1"] }]);
  eq("legacy: no connectedAt (the single-tenant sheet) reads as the earliest; equal dates → the smaller store id", [legacyPlans([lm("S2", "X", T0), lm("S3", "X", null)])[0]!.winner, legacyPlans([lm("S5", "X", T0), lm("S4", "X", T0)])[0]!.winner], ["S3", "S4"]);
  const lmix = [lm("S3", "Z", T0 + 2 * MIN), lm("S1", "X", T0), lm("S2", "X", T0 + MIN, "legacy"), lm("S4", "Z", T0 + MIN)];
  eq("legacy: the same members in any order give the same plans", JSON.stringify(legacyPlans(lmix)), JSON.stringify(legacyPlans([...lmix].reverse())));

  /* ---------------- determinism ---------------- */
  const input = base({ orders: mixes.all!(), pull: "due" });
  eq("the same input gives the same plan", JSON.stringify(planSheetRun(input)), JSON.stringify(planSheetRun(input)));

  const ms = performance.now() - t0;
  ok(`the section stays within ${BUDGET_MS} ms`, ms <= BUDGET_MS, Math.round(ms));
  notes.push(`sheets section: ${Math.round(ms)} ms`);
  return { pass, failures, notes, ms };
}

// standalone run: npx tsx src/lib/sheets/selftest.ts
if (process.argv[1] && /sheets[\\/]selftest\.ts$/.test(process.argv[1])) {
  const r = sheetsSelftest();
  for (const n of r.notes) console.log(`· ${n}`);
  for (const f of r.failures) console.log(`✗ ${f}`);
  console.log(r.failures.length ? `✗ ${r.failures.length} failure(s), ${r.pass} passed` : `✓ sheets self test passed (${r.pass} assertions)`);
  process.exit(r.failures.length ? 1 : 0);
}
