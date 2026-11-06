/**
 * test:jobs, the render queue's sections (P8 step 5; docs/STORE-SAAS.md §H.3, §H.2 slot 4, §J.1 "render_jobs dedupe
 * cleared on claim" and "the render CPU cap"). Loaded by ./selftest.ts after its server-only stub, offline: an
 * in-memory queue with the SQL's semantics (the unique `dedupe`, the claim, UPDATE IGNORE), a fake port and fake clocks.
 *
 *  renders: rules    the enqueue checks, the §H.3 claim statement (dedupe = NULL, priority order, a take-over counts a
 *                    try), the outcomes (done with notes, runtime_v 1 / not live → skipped, live_changed → requeued), the
 *                    1 / 5 / 30 min ladder then failed, the notes text (≤ 200, whole ids), the CPU cap and lag, the summary
 *                    maths (oldest ≥ 61 min on a fake clock, throughput, ETA null at 0, top notes), the fan-out row
 *  renders: drain    an enqueue while a render runs yields a second render after it (ENGC-4); two enqueues while pending
 *                    yield one; priority order; ≤ 10 pages per store; the CPU cap stops the batch after 4 s of fake CPU
 *                    (2 s while lagging), the rest released untouched; 3 retries then failed (onFailed once); runtime_v
 *                    1 skipped; a publish meanwhile → requeued; a retry behind a newer pending job → superseded; the
 *                    deadline; a lost claim; a dead render's lease taken over; earlier failures resolved; caches dropped
 *                    only after a rewrite
 *  renders: fan-out  store by store across pages of 50, the deadline and the resume from `after`, a throwing store
 *                    counted and skipped, doneAt once the last store is handled; forEachStore's `stop` (the round robin)
 */
import type { Checks, FakeClock, Harness } from "./testing/harness";
import type { RenderReason, RenderState } from "./renders";
import type { ClaimedRender, RenderDeps, RenderRepo } from "./renders/drain";
import type { FanoutDeps } from "./renders/fanout";
import type { FanoutState, RenderOutcome, RerenderAnswer, SummaryInput } from "./renders/rules";
import type { StoreRow, WriteScope } from "@/lib/tenancy/types";

type Rules = typeof import("./renders/rules");
type Drain = typeof import("./renders/drain");
type Fanout = typeof import("./renders/fanout");
type Scope = typeof import("./scope");

export interface RenderSectionDeps {
  RU: Rules;
  DR: Drain;
  FO: Fanout;
  SC: Scope;
  Clock: typeof FakeClock;
  /** a real system write scope for a store id (the seam's own constructor) */
  scope(storeId: string): WriteScope;
}

const A = "01JB8ZK3Q4R5S6T7V8W9XYZ0AA";
const B = "01JB8ZK3Q4R5S6T7V8W9XYZ0BB";
const MIN = 60_000;
const pageId = (n: number) => `01JB8ZK3Q4R5S6T7V8W9PG${String(n).padStart(4, "0")}`;

/** One render_jobs row in memory. */
interface Row {
  id: string;
  storeId: string;
  pageId: string;
  reason: RenderReason;
  priority: number;
  dedupe: string | null;
  state: RenderState;
  attempts: number;
  notBefore: number;
  leaseUntil: number | null;
  claim: string | null;
  error: string | null;
  createdAt: number;
  doneAt: number | null;
}

/** The statements of ./renders/sql.ts with their SQL semantics (the unique dedupe, UPDATE IGNORE), on a fake clock. */
class FakeQueue implements RenderRepo {
  rows: Row[] = [];
  claims = 0;
  /** answer "lost" for the next finish */
  loseNext = false;
  private seq = 0;
  constructor(private readonly now: () => number) {}

  /** INSERT IGNORE on dedupe = page id; a pending job keeps the lower priority. The rows inserted. */
  insert(storeId: string, pageIds: readonly string[], reason: RenderReason, priority = 5): number {
    let n = 0;
    for (const p of pageIds) {
      const holder = this.rows.find((r) => r.dedupe === p);
      if (holder) {
        if (holder.state === "pending" && holder.storeId === storeId && holder.priority > priority) holder.priority = priority;
        continue;
      }
      const k = ++this.seq;
      this.rows.push({ id: `RJ${String(k).padStart(24, "0")}`, storeId, pageId: p, reason, priority, dedupe: p, state: "pending", attempts: 0, notBefore: this.now(), leaseUntil: null, claim: null, error: null, createdAt: this.now(), doneAt: null });
      n++;
    }
    return n;
  }
  of(page: string): Row[] {
    return this.rows.filter((r) => r.pageId === page);
  }
  private mine = (scope: WriteScope, claim: string) => (r: Row) => r.storeId === scope.storeId && r.claim === claim;

  async claim(scope: WriteScope, limit: number, claim: string): Promise<ClaimedRender[]> {
    this.claims++;
    const now = this.now();
    const due = this.rows
      .filter((r) => r.storeId === scope.storeId && ((r.state === "pending" && r.notBefore <= now) || (r.state === "running" && (r.leaseUntil ?? Infinity) < now)))
      .sort((a, b) => a.priority - b.priority || a.notBefore - b.notBefore || (a.id < b.id ? -1 : 1))
      .slice(0, limit);
    for (const r of due) {
      if (r.state === "running") r.attempts++;
      Object.assign(r, { state: "running", claim, leaseUntil: now + 2 * MIN, dedupe: null });
    }
    return due.map((r) => ({ id: r.id, storeId: r.storeId, pageId: r.pageId, reason: r.reason, priority: r.priority, attempts: r.attempts }));
  }
  private supersede(r: Row, attempts: number | null): void {
    Object.assign(r, { state: "skipped", error: "superseded", doneAt: this.now(), claim: null, leaseUntil: null, attempts: attempts ?? r.attempts });
  }
  async finish(scope: WriteScope, job: ClaimedRender, claim: string, outcome: RenderOutcome): Promise<"ok" | "lost" | "superseded"> {
    const r = this.rows.find((x) => x.id === job.id && this.mine(scope, claim)(x));
    if (!r || this.loseNext) {
      this.loseNext = false;
      return "lost";
    }
    if (outcome.state === "pending") {
      if (this.rows.some((x) => x.dedupe === r.pageId)) {
        this.supersede(r, outcome.attempts);
        return "superseded";
      }
      Object.assign(r, { state: "pending", dedupe: r.pageId, attempts: outcome.attempts, error: outcome.error, notBefore: this.now() + outcome.retryInMs, claim: null, leaseUntil: null });
      return "ok";
    }
    Object.assign(r, { state: outcome.state, error: outcome.error, doneAt: this.now(), claim: null, leaseUntil: null });
    if (outcome.state === "failed") r.attempts = outcome.attempts;
    return "ok";
  }
  async release(scope: WriteScope, ids: readonly string[], claim: string): Promise<{ released: number; superseded: number }> {
    let released = 0;
    let superseded = 0;
    for (const r of this.rows.filter((x) => ids.includes(x.id) && this.mine(scope, claim)(x))) {
      if (this.rows.some((x) => x.dedupe === r.pageId)) {
        this.supersede(r, null);
        superseded++;
      } else {
        Object.assign(r, { state: "pending", dedupe: r.pageId, claim: null, leaseUntil: null });
        released++;
      }
    }
    return { released, superseded };
  }
  async requeue(scope: WriteScope, job: ClaimedRender): Promise<void> {
    this.insert(scope.storeId, [job.pageId], job.reason, job.priority);
  }
  async resolveFailed(scope: WriteScope, pageIds: readonly string[]): Promise<number> {
    let n = 0;
    for (const r of this.rows.filter((x) => x.storeId === scope.storeId && x.state === "failed" && pageIds.includes(x.pageId))) {
      Object.assign(r, { state: "skipped", error: `resolved:${r.error ?? ""}`.slice(0, 200) });
      n++;
    }
    return n;
  }
}

interface TestDeps extends RenderDeps {
  rendered: string[];
  failed: { pageId: string; code: string }[];
  storesDone: string[];
  errors: { area: string; code: string | null }[];
  cpu: { ms: number };
  lag: { ms: number };
}

/** The drain's deps over a fake queue: the port answers `answer(pageId)` (rendered by default) and spends `cpuPerRender`. */
function depsFor(queue: FakeQueue, clock: FakeClock, o: { answer?: (pageId: string, n: number) => RerenderAnswer | Promise<RerenderAnswer>; cpuPerRender?: number; budgetMs?: number } = {}): TestDeps {
  let claimN = 0;
  const d: TestDeps = {
    rendered: [],
    failed: [],
    storesDone: [],
    errors: [],
    cpu: { ms: 0 },
    lag: { ms: 0 },
    repo: queue,
    port: {
      async rerenderInPlace(_scope, page) {
        d.rendered.push(page);
        d.cpu.ms += o.cpuPerRender ?? 50;
        clock.advance(100);
        return o.answer ? o.answer(page, d.rendered.filter((p) => p === page).length) : { status: "rendered", notes: [] };
      },
    },
    actor: { kind: "system", userId: null, impersonatorId: null, ip: null },
    now: clock.now,
    deadline: clock.now() + (o.budgetMs ?? 12_000),
    cpuNow: () => d.cpu.ms,
    lagMs: () => d.lag.ms,
    yieldLoop: async () => undefined,
    newClaim: () => `CLAIM${String(++claimN).padStart(21, "0")}`,
    onFailed: (job, code) => void d.failed.push({ pageId: job.pageId, code }),
    onStoreDone: (storeId) => void d.storesDone.push(storeId),
    recordError: (area, _err, opts) => void d.errors.push({ area, code: opts?.code ?? null }),
  };
  return d;
}

export function renderSections(h: Harness, x: RenderSectionDeps): void {
  const { RU, DR, FO, SC, Clock } = x;
  const sA = x.scope(A);

  /* ---------------------------------------------------------------- */
  h.section("renders: rules", (t: Checks) => {
    t.check("RENDER_REASONS: the 0005 enum, with the §H.3 reasons", ["address", "brand", "store_info", "conversions", "cutout", "runtime"].every((r) => RU.RENDER_REASONS.includes(r as RenderReason)));
    t.eq("priorities: default 5, conversions 4 (lower runs first)", [RU.DEFAULT_PRIORITY, RU.CONVERSIONS_PRIORITY], [5, 4]);
    t.throws("checkEnqueue: an unknown reason is refused", () => RU.checkEnqueue([], "reviews" as RenderReason, 5), /unknown reason/);
    t.throws("checkEnqueue: a priority outside 0-9 is refused", () => RU.checkEnqueue([], "brand", 10), /priority/);
    t.throws("checkEnqueue: a fractional priority is refused", () => RU.checkEnqueue([], "brand", 4.5), /priority/);
    t.eq(
      "checkEnqueue: ids deduplicated, malformed ones counted, the default priority",
      RU.checkEnqueue([pageId(1), pageId(1), "bad id!", pageId(2), ""], "store_info", undefined),
      { ids: [pageId(1), pageId(2)], malformed: 2, priority: 5 },
    );
    t.eq("checkEnqueue: all-live", RU.checkEnqueue("all-live", "address", 5), { ids: "all-live", malformed: 0, priority: 5 });

    const claim = RU.claimStatement();
    t.check("claim: dedupe = NULL in the claim UPDATE (ENGC-4)", /SET [^]*dedupe = NULL[^]*WHERE/.test(claim), claim);
    t.check("claim: pending and due, or running past its lease, of one store", claim.includes("(state = 'pending' AND not_before <= UTC_TIMESTAMP(3))") && claim.includes("(state = 'running' AND lease_until < UTC_TIMESTAMP(3))") && claim.includes("store_id = ?"));
    t.check("claim: lowest priority first, then the oldest due, a 2-minute lease", claim.includes("ORDER BY priority, not_before, id LIMIT ?") && claim.includes("INTERVAL 2 MINUTE"));
    t.check("claim: a take-over counts the lost try, assigned before state (MariaDB assigns left to right)", claim.indexOf("attempts = IF(state = 'running', attempts + 1, attempts)") >= 0 && claim.indexOf("attempts = IF") < claim.indexOf("state = 'running', claim"));

    t.eq("outcome: rendered → done with its notes", RU.outcomeOf(0, { result: { status: "rendered", notes: [{ id: "budget:F5" }, { id: "honesty:D2" }] } }), { state: "done", error: "notes:budget:F5,honesty:D2", requeue: false });
    t.eq("outcome: rendered without notes → done, no error", RU.outcomeOf(1, { result: { status: "rendered", notes: [] } }), { state: "done", error: null, requeue: false });
    t.eq("outcome: runtime_v 1 → skipped (listed for a manual republish)", RU.outcomeOf(0, { result: { status: "skipped_runtime_v1", notes: [] } }), { state: "skipped", error: "runtime_v1" });
    t.eq("outcome: not live → skipped", RU.outcomeOf(0, { result: { status: "not_live", notes: [] } }), { state: "skipped", error: "not_live" });
    t.eq("outcome: the live version moved → done and queued again", RU.outcomeOf(0, { result: { status: "live_changed", notes: [] } }), { state: "done", error: "live_changed", requeue: true });
    const boom = Object.assign(new Error("Page too large"), { code: "page_too_large", issues: [] });
    t.eq(
      "outcome: a throw → retries after 1, 5 and 30 min (attempts + 1), with the refusal's own code",
      [0, 1, 2].map((a) => RU.outcomeOf(a, { error: boom })),
      [
        { state: "pending", attempts: 1, retryInMs: MIN, error: "page_too_large" },
        { state: "pending", attempts: 2, retryInMs: 5 * MIN, error: "page_too_large" },
        { state: "pending", attempts: 3, retryInMs: 30 * MIN, error: "page_too_large" },
      ],
    );
    t.eq("outcome: …the 4th failing try (3 retries used) → failed", RU.outcomeOf(3, { error: new TypeError("x") }), { state: "failed", attempts: 4, error: "TypeError" });

    const many = Array.from({ length: 40 }, (_, i) => ({ id: `budget:F${i}x${"y".repeat(8)}` }));
    const text = RU.notesText(many)!;
    t.check("notes: 'notes:<id>,<id>' within 200 characters, whole ids only", text.startsWith("notes:") && text.length <= 200 && text.slice(6).split(",").every((id) => many.some((m) => m.id === id)), `${text.length}`);
    t.eq("notes: each id once, a malformed id dropped, none → null", [RU.notesText([{ id: "a:1" }, { id: "a:1" }, { id: "bad id" }]), RU.notesText([])], ["notes:a:1", null]);
    t.eq("parseNotes: the ids of a notes text; a failure code is not notes", [RU.parseNotes("notes:a:1,b:2"), RU.parseNotes("page_too_large"), RU.parseNotes(null)], [["a:1", "b:2"], null, null]);
    t.eq("CPU budget: 4 s; 2 s while the event loop lags (> 100 ms)", [RU.cpuCapMs(0), RU.cpuCapMs(100), RU.cpuCapMs(101), RU.cpuCapMs(Number.NaN)], [4_000, 4_000, 2_000, 4_000]);

    // the summary maths on a fake clock
    const now = Date.UTC(2026, 9, 28, 12, 0, 0);
    const input: SummaryInput = {
      counts: [
        { reason: "address", state: "pending", n: 30 },
        { reason: "address", state: "done", n: 100 },
        { reason: "store_info", state: "pending", n: 10 },
        { reason: "store_info", state: "failed", n: 2 },
      ],
      oldest: { storeId: A, pageId: pageId(1), reason: "address", slug: "argan", createdAt: new Date(now - 61 * MIN - 5_000) },
      failed: [
        { storeId: A, error: "page_too_large", n: 1 },
        { storeId: A, error: "TypeError", n: 1 },
        { storeId: B, error: "page_too_large", n: 3 },
      ],
      finished: [
        { state: "done", n: 18 },
        { state: "skipped", n: 2 },
        { state: "failed", n: 0 },
      ],
      notesPages: 4,
      notesTexts: ["notes:a:1,b:2", "notes:a:1", "notes:c:3,a:1,b:2", null, "page_too_large", "notes:d:4"],
      republish: [{ storeId: A, pageId: pageId(9) }],
      failedOld: 2,
    };
    const s = RU.summarize(input, now);
    t.eq("summary: oldest pending 61 min on the fake clock (render_stuck > 60)", [s.oldestMin, s.oldestPending?.ageMin, s.oldestPending?.slug], [61, 61, "argan"]);
    t.eq("summary: counts by reason × state and totals", [s.byReason.map((r) => [r.reason, r.pending, r.done, r.failed]), s.totals.pending], [[["address", 30, 100, 0], ["store_info", 10, 0, 2]], 40]);
    t.eq("summary: throughput = jobs finished in the hour (20), 0.3 / min; done 18", [s.finishedLastHour, s.throughputPerMin, s.doneLastHour], [20, 0.3, 18]);
    t.eq("summary: ETA = 40 pending at 20 / h = 120 min", s.etaMin, 120);
    t.eq("summary: ETA null when nothing finished in the hour (never invented)", RU.summarize({ ...input, finished: [] }, now).etaMin, null);
    t.eq("summary: ETA 0 with nothing pending", RU.etaMinutes(0, 20), 0);
    t.eq("summary: failures of 24 h by store, the most first, every code counted", s.failed24h.map((f) => [f.storeId, f.count, f.error, f.codes.length]), [[B, 3, "page_too_large", 1], [A, 2, "TypeError", 2]]);
    t.eq("summary: failed older than 24 h (render_failed_old)", s.failedOld, 2);
    t.eq("summary: the notes count and the top 3 item ids", [s.notes, s.topNotes], [4, [{ id: "a:1", count: 3 }, { id: "b:2", count: 2 }, { id: "c:3", count: 1 }]]);
    t.eq("summary: runtime_v 1 pages listed for a manual republish", s.republish, [{ storeId: A, pageId: pageId(9) }]);
    t.eq("summary: an empty queue", [RU.summarize({ ...input, counts: [], oldest: null, failed: [], finished: [], notesPages: 0, notesTexts: [], republish: [], failedOld: 0 }, now)].map((e) => [e.byReason, e.oldestPending, e.oldestMin, e.etaMin, e.totals.pending]), [[[], null, null, null, 0]]);

    // the fan-out row
    const f: FanoutState = { id: "01JB8ZK3Q4R5S6T7V8W9FAN001", mode: "live", reason: "address", priority: 5, requestedAt: "2026-10-28T12:00:00.000Z", requestedBy: null, after: "", total: 3, stores: 0, enqueued: 0, failedStores: 0, doneAt: null };
    t.eq("parseFanout: round trip through the state JSON (doneAt null kept)", RU.parseFanout(JSON.stringify({ due: { lastHour: null }, fanout: f })), f);
    t.eq("parseFanout: no fan-out, garbage, a bad mode or id → null", [RU.parseFanout("{}"), RU.parseFanout("nope"), RU.parseFanout(JSON.stringify({ fanout: { ...f, mode: "all" } })), RU.parseFanout(JSON.stringify({ fanout: { ...f, id: "x y" } }))], [null, null, null, null]);
    t.throws("checkFanout: a live fan-out takes address or runtime only", () => RU.checkFanout("live", "brand"), /address or runtime/);
    t.eq("checkFanout: live address / runtime, failed of any reason or every reason", [RU.checkFanout("live", "address"), RU.checkFanout("live", "runtime"), RU.checkFanout("failed", null), RU.checkFanout("failed", "store_info")], [undefined, undefined, undefined, undefined]);
  });

  /* ---------------------------------------------------------------- */
  h.section("renders: drain", async (t: Checks) => {
    // ENGC-4: an enqueue while the page renders → a second job, rendered after the first
    {
      const clock = new Clock();
      const q = new FakeQueue(clock.now);
      q.insert(A, [pageId(1)], "store_info");
      const d = depsFor(q, clock, {
        answer: (page, n) => {
          if (n === 1) t.eq("…the enqueue during the render inserts a new pending job (dedupe was cleared by the claim)", q.insert(A, [page], "store_info"), 1);
          return { status: "rendered", notes: [] };
        },
      });
      const st = DR.newRenderRunState();
      await DR.renderStore(d, sA, st);
      t.eq("an enqueue while a render runs: the first job done, a second one pending", q.of(pageId(1)).map((r) => r.state), ["done", "pending"]);
      clock.advance(1_000);
      const d2 = depsFor(q, clock);
      await DR.renderStore(d2, sA, DR.newRenderRunState());
      t.eq("…which a later run renders (two renders in all)", [d.rendered.length + d2.rendered.length, q.of(pageId(1)).map((r) => r.state)], [2, ["done", "done"]]);
    }
    // two enqueues while pending → one job, one render
    {
      const clock = new Clock();
      const q = new FakeQueue(clock.now);
      t.eq("two enqueues while pending: the second is ignored", [q.insert(A, [pageId(2)], "address"), q.insert(A, [pageId(2)], "brand")], [1, 0]);
      const d = depsFor(q, clock);
      await DR.renderStore(d, sA, DR.newRenderRunState());
      t.eq("…one job, one render", [q.of(pageId(2)).length, d.rendered], [1, [pageId(2)]]);
      q.insert(A, [pageId(3)], "address", 5);
      q.insert(A, [pageId(3)], "conversions", 4);
      t.eq("a pending job keeps the lower of the two priorities", q.of(pageId(3))[0]!.priority, 4);
    }
    // priority order, ≤ 10 per store
    {
      const clock = new Clock();
      const q = new FakeQueue(clock.now);
      q.insert(A, [pageId(10)], "address", 5);
      q.insert(A, [pageId(11)], "runtime", 9);
      q.insert(A, [pageId(12)], "conversions", 4);
      q.insert(A, [pageId(13)], "brand", 5);
      const d = depsFor(q, clock);
      await DR.renderStore(d, sA, DR.newRenderRunState());
      t.eq("priority order: 4 first, then 5 in enqueue order, 9 last", d.rendered, [pageId(12), pageId(10), pageId(13), pageId(11)]);
      const q2 = new FakeQueue(clock.now);
      q2.insert(A, Array.from({ length: 14 }, (_, i) => pageId(100 + i)), "address");
      q2.insert(B, [pageId(200)], "address");
      const d2 = depsFor(q2, clock);
      const st2 = DR.newRenderRunState();
      const handled = await DR.renderStore(d2, sA, st2);
      t.eq("≤ 10 pages per store per tick; the rest stays pending; B's job untouched", [handled, st2.claimed, q2.rows.filter((r) => r.state === "pending" && r.storeId === A).length, q2.rows.find((r) => r.storeId === B)?.state], [10, 10, 4, "pending"]);
      t.eq("…the store's caches dropped once, after its rewrites", d2.storesDone, [A]);
    }
    // the CPU cap (ENGC-11): 1 s of fake CPU per render → 4 renders, then the claim's rest is released untouched
    {
      const clock = new Clock();
      const q = new FakeQueue(clock.now);
      q.insert(A, Array.from({ length: 10 }, (_, i) => pageId(300 + i)), "address");
      q.insert(B, [pageId(400), pageId(401)], "address");
      const d = depsFor(q, clock, { cpuPerRender: 1_000 });
      const st = DR.newRenderRunState();
      await DR.renderStore(d, sA, st);
      t.eq("the CPU cap stops the batch after 4 s of fake CPU: 4 rendered, 6 released", [st.rendered, st.released, st.capped, st.more, st.cpuMs], [4, 6, true, true, 4_000]);
      t.check("…released jobs are pending again with dedupe and attempts untouched", q.rows.filter((r) => r.storeId === A && r.state === "pending").every((r) => r.dedupe === r.pageId && r.attempts === 0 && r.claim === null));
      const sB = x.scope(B);
      t.eq("…and the next store gets nothing this tick (stopReason = cpu)", [await DR.renderStore(d, sB, st), DR.stopReason(d, st), q.claims], [0, "cpu", 1]);
      const q2 = new FakeQueue(clock.now);
      q2.insert(A, Array.from({ length: 10 }, (_, i) => pageId(500 + i)), "address");
      const d2 = depsFor(q2, clock, { cpuPerRender: 1_000 });
      d2.lag.ms = 150;
      const st2 = DR.newRenderRunState();
      await DR.renderStore(d2, sA, st2);
      t.eq("while the event loop lags (> 100 ms) the cap is 2 s: 2 rendered", [st2.rendered, st2.released], [2, 8]);
    }
    // 3 retries (1, 5, 30 min) then failed
    {
      const clock = new Clock();
      const q = new FakeQueue(clock.now);
      q.insert(A, [pageId(600)], "brand");
      const d = depsFor(q, clock, { answer: () => Promise.reject(Object.assign(new Error("Packet too large"), { code: "page_too_large", issues: [] })) });
      const trail: (string | number | null)[][] = [];
      for (const wait of [0, MIN, 5 * MIN, 30 * MIN]) {
        clock.advance(wait);
        d.deadline = clock.now() + 12_000; // each run is a tick of its own
        const st = DR.newRenderRunState();
        await DR.renderStore(d, sA, st);
        const r = q.of(pageId(600))[0]!;
        trail.push([r.state, r.attempts, r.state === "pending" ? Math.round((r.notBefore - clock.now()) / MIN) : null]);
      }
      t.eq("failures: pending after 1, 5 and 30 min, then the 4th failing try (3 retries) → failed", trail, [
        ["pending", 1, 1],
        ["pending", 2, 5],
        ["pending", 3, 30],
        ["failed", 4, null],
      ]);
      t.eq("…the store's health marked dirty and the code counted once, at the failure", d.failed, [{ pageId: pageId(600), code: "page_too_large" }]);
      t.eq("…a failed job is never claimed again", (clock.advance(1), await DR.renderStore(depsFor(q, clock), sA, DR.newRenderRunState())), 0);
      t.eq("…no cache drop without a rewrite", d.storesDone, []);
      // the failure is resolved once the page renders through a later job
      q.insert(A, [pageId(600)], "brand");
      const st = DR.newRenderRunState();
      await DR.renderStore(depsFor(q, clock), sA, st);
      t.eq("a later render of the page closes its earlier failed job (resolved:<code>)", [st.resolved, q.of(pageId(600)).map((r) => [r.state, r.error])], [1, [["skipped", "resolved:page_too_large"], ["done", null]]]);
    }
    // runtime_v 1, live_changed, notes, superseded, deadline, lost claim, take-over
    {
      const clock = new Clock();
      const q = new FakeQueue(clock.now);
      q.insert(A, [pageId(700), pageId(701), pageId(702)], "runtime");
      const d = depsFor(q, clock, {
        answer: (page) =>
          page === pageId(700) ? { status: "skipped_runtime_v1", notes: [] } : page === pageId(701) ? { status: "live_changed", notes: [] } : { status: "rendered", notes: [{ id: "budget:F5" }] },
      });
      const st = DR.newRenderRunState();
      await DR.renderStore(d, sA, st);
      t.eq("runtime_v 1 → skipped (runtime_v1)", q.of(pageId(700)).map((r) => [r.state, r.error]), [["skipped", "runtime_v1"]]);
      t.eq("a publish during the render → done, and the page queued again", q.of(pageId(701)).map((r) => [r.state, r.error]), [["done", "live_changed"], ["pending", null]]);
      t.eq("gate notes (warn mode) → done with error 'notes:<ids>'", [q.of(pageId(702))[0]!.error, st.notes], ["notes:budget:F5", 1]);
      t.eq("the run's counts", [st.rendered, st.skipped, st.requeued], [1, 1, 1]);
    }
    {
      const clock = new Clock();
      const q = new FakeQueue(clock.now);
      q.insert(A, [pageId(800)], "store_info");
      const d = depsFor(q, clock, {
        answer: (page) => {
          q.insert(A, [page], "store_info"); // a change during the render
          throw new Error("boom");
        },
      });
      const st = DR.newRenderRunState();
      await DR.renderStore(d, sA, st);
      t.eq("a failing try behind a newer pending job of its page → superseded (the newer one renders)", [q.of(pageId(800)).map((r) => [r.state, r.error]), st.superseded], [[["skipped", "superseded"], ["pending", null]], 1]);
    }
    {
      const clock = new Clock();
      const q = new FakeQueue(clock.now);
      q.insert(A, [pageId(900), pageId(901), pageId(902)], "address");
      const d = depsFor(q, clock, { budgetMs: 150 }); // each render takes 100 ms of wall time
      const st = DR.newRenderRunState();
      await DR.renderStore(d, sA, st);
      t.eq("the deadline: 2 rendered, the rest released, more", [st.rendered, st.released, st.more, st.capped], [2, 1, true, false]);
      q.loseNext = true;
      const d2 = depsFor(q, clock);
      const st2 = DR.newRenderRunState();
      await DR.renderStore(d2, sA, st2);
      t.eq("a lost claim: counted, its outcome not written", [st2.lost, d2.errors.map((e) => e.code)], [1, ["claim_lost"]]);
    }
    {
      const clock = new Clock();
      const q = new FakeQueue(clock.now);
      q.insert(A, [pageId(950), pageId(951)], "address");
      // a render that died: running with its lease run out, once with retries left and once past them
      Object.assign(q.of(pageId(950))[0]!, { state: "running", dedupe: null, claim: "DEADCLAIM", leaseUntil: clock.now() - 1, attempts: 0 });
      Object.assign(q.of(pageId(951))[0]!, { state: "running", dedupe: null, claim: "DEADCLAIM", leaseUntil: clock.now() - 1, attempts: 3 });
      const d = depsFor(q, clock);
      await DR.renderStore(d, sA, DR.newRenderRunState());
      t.eq("a dead render's expired lease is taken over (the lost try counted) and rendered", [q.of(pageId(950))[0]!.state, q.of(pageId(950))[0]!.attempts], ["done", 1]);
      t.eq("…past its 3 retries it fails at once without rendering (lease_expired)", [q.of(pageId(951))[0]!.state, q.of(pageId(951))[0]!.error, d.rendered.includes(pageId(951))], ["failed", "lease_expired", false]);
      const live = new FakeQueue(clock.now);
      live.insert(A, [pageId(960)], "address");
      Object.assign(live.of(pageId(960))[0]!, { state: "running", dedupe: null, claim: "LIVECLAIM", leaseUntil: clock.now() + MIN });
      t.eq("…a live lease is never taken", await DR.renderStore(depsFor(live, clock), sA, DR.newRenderRunState()), 0);
    }
  });

  /* ---------------------------------------------------------------- */
  h.section("renders: fan-out", async (t: Checks) => {
    const storeRow = (n: number): StoreRow => ({ id: `01JB8ZK3Q4R5S6T7V8W9ST${String(n).padStart(4, "0")}`, handle: `s${n}`, name: `s${n}` }) as StoreRow;
    const all = Array.from({ length: 120 }, (_, i) => storeRow(i + 1));
    const clock = new Clock();
    const base: FanoutState = { id: "01JB8ZK3Q4R5S6T7V8W9FAN001", mode: "live", reason: "address", priority: 5, requestedAt: new Date(clock.now()).toISOString(), requestedBy: null, after: "", total: all.length, stores: 0, enqueued: 0, failedStores: 0, doneAt: null };
    const seen: string[] = [];
    const failed: string[] = [];
    let pages = 0;
    const deps = (deadline: number, throwFor?: string): FanoutDeps => ({
      async stores(after, limit) {
        pages++;
        return all.filter((s) => s.id > after).slice(0, limit);
      },
      async enqueueStore(store) {
        clock.advance(10);
        seen.push(store.id);
        if (store.id === throwFor) throw new Error("boom");
        return 2;
      },
      now: clock.now,
      deadline,
      yieldLoop: async () => undefined,
      onStoreFailed: (store) => void failed.push(store.id),
      onStoreDone: () => undefined,
    });
    const r1 = await FO.runFanout(deps(clock.now() + 700, all[3]!.id), base);
    t.eq("the deadline stops it: 70 stores in 700 ms, not finished, `after` on the last one", [r1.stores, r1.finished, r1.state.after, r1.state.doneAt], [70, false, all[69]!.id, null]);
    t.eq("…a throwing store counted and skipped, the others enqueued", [r1.failedStores, failed, r1.enqueued], [1, [all[3]!.id], 69 * 2]);
    const r2 = await FO.runFanout(deps(clock.now() + 10_000), r1.state);
    t.eq("the next run resumes after `after` and finishes (doneAt set)", [r2.stores, r2.finished, r2.state.stores, r2.state.enqueued, typeof r2.state.doneAt], [50, true, 120, 119 * 2, "string"]);
    t.eq("…every store exactly once, in id order", seen, all.map((s) => s.id));
    t.check("…pages of 50 stores", pages >= 3);

    // forEachStore's `stop` (P8 step 5): the round robin ends before the next item
    const items = Array.from({ length: 5 }, (_, i) => ({ id: `I${i}` }));
    let cursor = "";
    const visited: string[] = [];
    const src = { page: async (after: string, upTo: string | null, limit: number) => items.filter((i) => i.id > after && (upTo === null || i.id <= upTo)).slice(0, limit), readCursor: async () => cursor, writeCursor: async (c: string) => void (cursor = c) };
    const rr = await SC.roundRobin(src, { budgetMs: 60_000, stop: () => visited.length >= 2 }, async (i) => void visited.push(i.id));
    t.eq("roundRobin with stop: 2 visited, not done, the cursor on the last one", [rr, visited, cursor], [{ visited: 2, done: false }, ["I0", "I1"], "I1"]);
  });
}
