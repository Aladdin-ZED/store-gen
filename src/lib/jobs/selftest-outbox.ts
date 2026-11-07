/**
 * test:jobs, the outbox's sections (P8 step 4; docs/STORE-SAAS.md §H.1, §H.8, §J.1 "outbox backoff ladder and dead
 * rules"). Loaded by ./selftest.ts after its server-only stub, offline: an in-memory outbox with the claim's semantics,
 * fake handlers and a fake clock; nothing here opens a connection.
 *
 *  outbox: rules   the backoff ladder and the dead rules (retry:false → dead at once, the 7th failing send → dead),
 *                  httpRetryable (4xx final except 408 / 429), resendKey's format, the replay rule table, the §H.1 claim
 *                  statement builder, the per-kind / per-store claim limit, the enqueue refusals, last_error masking,
 *                  merged sends, a handler's malformed answer
 *  outbox: drain   per-store and per-kind caps across stores, backoff and dead through the drainer (onDead once), a
 *                  timeout (the AbortSignal reaches the handler) and a throw as retryable failures, the kill switch and
 *                  a handler's pause (items untouched), a missing handler (items stay, probed), the budget (the rest of
 *                  the claim released untouched, `more`), merged sends judged per item, mail's caps (rescheduled, not
 *                  attempted), an unreadable sealed payload (dead at once, never sent), a lost claim, claim contention
 */
import type { Checks, FakeClock, Harness } from "./testing/harness";
import type { ClaimedItem, OutboxHandler, OutboxKind, OutboxState, SendResult } from "./outbox";
import type { DrainDeps, DrainStore, RawItem } from "./outbox/drain";
import type { Outcome } from "./outbox/rules";
import type { WriteScope } from "@/lib/tenancy/types";

type Rules = typeof import("./outbox/rules");
type Drain = typeof import("./outbox/drain");
type Api = typeof import("./outbox");

export interface OutboxSectionDeps {
  O: Api;
  RU: Rules;
  DR: Drain;
  Clock: typeof FakeClock;
  /** a real system write scope for a store id (the seam's own constructor) */
  scope(storeId: string): WriteScope;
}

const A = "01JB8ZK3Q4R5S6T7V8W9XYZ0AA";
const B = "01JB8ZK3Q4R5S6T7V8W9XYZ0BB";
const MIN = 60_000;
const HOUR = 60 * MIN;

/** One outbox row in memory. */
interface Row {
  id: string;
  storeId: string | null;
  kind: OutboxKind;
  topic: string;
  dedupeKey: string;
  payload: string;
  encrypted: boolean;
  state: OutboxState;
  attempts: number;
  nextAt: number;
  leaseUntil: number | null;
  claim: string | null;
  lastStatus: number | null;
  lastError: string | null;
  doneAt: number | null;
  createdAt: number;
}

/** The claim / finish / release statements with the SQL's semantics, on a fake clock. */
class FakeOutbox implements DrainStore {
  rows: Row[] = [];
  claims = 0;
  /** throw a deadlock on the next claim of this kind */
  contention: OutboxKind | null = null;
  private seq = 0;
  constructor(private readonly now: () => number) {}

  add(storeId: string | null, kind: OutboxKind, over: Partial<Row> = {}): Row {
    const n = ++this.seq;
    const row: Row = {
      id: `ROW${String(n).padStart(23, "0")}`,
      storeId,
      kind,
      topic: "new_order",
      dedupeKey: `${kind}:${n}`,
      payload: JSON.stringify({ n }),
      encrypted: false,
      state: "pending",
      attempts: 0,
      nextAt: this.now() - 1_000 + n, // due, in insertion order
      leaseUntil: null,
      claim: null,
      lastStatus: null,
      lastError: null,
      doneAt: null,
      createdAt: this.now(),
      ...over,
    };
    this.rows.push(row);
    return row;
  }
  get(id: string): Row {
    return this.rows.find((r) => r.id === id)!;
  }
  private owned = (owner: WriteScope | null) => (r: Row) => r.storeId === (owner ? owner.storeId : null);

  async claim(owner: WriteScope | null, kinds: readonly OutboxKind[], limit: number, claim: string): Promise<RawItem[]> {
    this.claims++;
    if (this.contention && kinds.includes(this.contention)) {
      this.contention = null;
      throw Object.assign(new Error("Deadlock found"), { errno: 1213, code: "ER_LOCK_DEADLOCK" });
    }
    const now = this.now();
    const due = this.rows
      .filter(this.owned(owner))
      .filter((r) => kinds.includes(r.kind) && ((r.state === "pending" && r.nextAt <= now) || (r.state === "running" && (r.leaseUntil ?? 0) < now)))
      .sort((a, b) => a.nextAt - b.nextAt)
      .slice(0, limit);
    for (const r of due) Object.assign(r, { state: "running", claim, leaseUntil: now + 2 * MIN });
    return due.map((r) => ({ id: r.id, storeId: r.storeId, kind: r.kind, topic: r.topic, targetId: null, dedupeKey: r.dedupeKey, payload: r.payload, encrypted: r.encrypted, attempts: r.attempts, createdAt: new Date(r.createdAt) }));
  }
  async finish(owner: WriteScope | null, id: string, claim: string, outcome: Outcome, _ms: number, now: number): Promise<boolean> {
    const r = this.rows.find((x) => x.id === id && x.claim === claim && this.owned(owner)(x));
    if (!r) return false;
    r.claim = null;
    r.leaseUntil = null;
    r.state = outcome.state;
    r.lastStatus = outcome.status;
    if (outcome.state === "done") {
      r.doneAt = now;
      r.lastError = null;
    } else {
      r.attempts = outcome.attempts;
      r.lastError = outcome.error;
      if (outcome.state === "pending") r.nextAt = outcome.nextAt;
      else r.doneAt = now;
    }
    return true;
  }
  async release(owner: WriteScope | null, ids: readonly string[], claim: string, nextAt: number | null): Promise<void> {
    for (const r of this.rows.filter((x) => ids.includes(x.id) && x.claim === claim && this.owned(owner)(x))) {
      Object.assign(r, { state: "pending", claim: null, leaseUntil: null });
      if (nextAt !== null) r.nextAt = nextAt;
    }
  }
  async pendingKinds(owner: { storeId: string }, kinds: readonly OutboxKind[]): Promise<OutboxKind[]> {
    return [...new Set(this.rows.filter((r) => r.storeId === owner.storeId && r.state === "pending" && kinds.includes(r.kind)).map((r) => r.kind))];
  }
}

interface FakeHandler extends OutboxHandler<unknown> {
  sent: ClaimedItem<unknown>[];
  batches: string[][];
  signals: AbortSignal[];
}

/** A handler answering `answer(item)` (default ok 200), recording what it sent. */
function fakeHandler(kind: OutboxKind, o: { per?: number; max?: number; timeoutMs?: number; answer?: (item: ClaimedItem<unknown>, signal: AbortSignal) => Promise<SendResult> | SendResult; paused?: () => Promise<boolean>; batch?: { max: number; key: (item: ClaimedItem<unknown>) => string | null; answer?: (items: readonly ClaimedItem<unknown>[]) => SendResult } } = {}): FakeHandler {
  const h: FakeHandler = {
    kind,
    maxPerTick: o.max ?? 100,
    perStorePerTick: o.per ?? 20,
    timeoutMs: o.timeoutMs ?? 1_000,
    sent: [],
    batches: [],
    signals: [],
    send(item: ClaimedItem<unknown>, signal?: AbortSignal) {
      h.sent.push(item);
      if (signal) h.signals.push(signal);
      return Promise.resolve(o.answer ? o.answer(item, signal!) : { ok: true, status: 200 });
    },
    ...(o.paused ? { paused: o.paused } : {}),
    ...(o.batch
      ? {
          batch: {
            max: o.batch.max,
            key: o.batch.key,
            send: async (items: readonly ClaimedItem<unknown>[]) => {
              h.batches.push(items.map((i) => i.id));
              h.sent.push(...items);
              return o.batch!.answer ? o.batch!.answer(items) : { ok: true as const, status: 200 };
            },
          },
        }
      : {}),
  } as FakeHandler;
  return h;
}

interface TestDeps extends DrainDeps {
  deadRows: RawItem[];
  errors: { area: string; code: string | null }[];
  yields: number;
  missing: OutboxKind[][];
}

function depsFor(store: FakeOutbox, clock: FakeClock, hs: readonly FakeHandler[], over: Partial<DrainDeps> = {}): TestDeps {
  let claimN = 0;
  const d: TestDeps = {
    deadRows: [],
    errors: [],
    yields: 0,
    missing: [],
    store,
    handler: (kind) => hs.find((h) => h.kind === kind) ?? null,
    now: clock.now,
    killed: async () => false,
    mailGate: async () => ({ ok: true }),
    open: (item) => {
      if (item.encrypted) {
        if (item.payload !== "SEALED") throw new Error("envelope does not open (another store, purpose or key)");
        return { sealed: true };
      }
      return JSON.parse(item.payload) as unknown;
    },
    newClaim: () => `CLAIM${String(++claimN).padStart(21, "0")}`,
    onDead: (item) => void d.deadRows.push(item),
    recordError: (area, _err, opts) => void d.errors.push({ area, code: opts?.code ?? null }),
    yieldLoop: async () => {
      d.yields++;
    },
    onMissing: async (_owner, kinds) => void d.missing.push([...kinds]),
    ...over,
  };
  return d;
}

export function outboxSections(h: Harness, x: OutboxSectionDeps): void {
  const { O, RU, DR, Clock } = x;

  /* ---------------------------------------------------------------- */
  h.section("outbox: rules", (t: Checks) => {
    const now = Date.UTC(2026, 9, 28, 9, 0, 0);
    t.eq("OUTBOX_BACKOFF_MS: 1 min, 5 min, 30 min, 2 h, 6 h, 24 h", [...O.OUTBOX_BACKOFF_MS], [MIN, 5 * MIN, 30 * MIN, 2 * HOUR, 6 * HOUR, 24 * HOUR]);
    const fail: SendResult = { ok: false, retry: true, status: 503, error: "HTTP 503" };
    const ladder = [0, 1, 2, 3, 4, 5].map((a) => RU.outcomeOf(a, fail, now));
    t.eq(
      "the ladder: failing sends 1-6 → pending, attempts + 1, next_at one step further",
      ladder.map((o) => (o.state === "pending" ? [o.attempts, o.nextAt - now] : o.state)),
      [
        [1, MIN],
        [2, 5 * MIN],
        [3, 30 * MIN],
        [4, 2 * HOUR],
        [5, 6 * HOUR],
        [6, 24 * HOUR],
      ],
    );
    t.eq("…the 7th failing send is final: dead, attempts 7", RU.outcomeOf(6, fail, now), { state: "dead", attempts: 7, status: 503, error: "HTTP 503" });
    t.check("…isFinalFailure agrees at every step", [0, 1, 2, 3, 4, 5, 6].every((a) => O.isFinalFailure({ attempts: a }, fail) === (RU.outcomeOf(a, fail, now).state === "dead")));
    t.eq("retry: false → dead at once (attempts 1)", RU.outcomeOf(0, { ok: false, retry: false, status: 401, error: "token revoked" }, now), { state: "dead", attempts: 1, status: 401, error: "token revoked" });
    t.eq("ok → done with its status", RU.outcomeOf(3, { ok: true, status: 200 }, now), { state: "done", status: 200 });
    t.eq("an empty error is stored as 'failed'", RU.outcomeOf(0, { ok: false, retry: true, error: "  " }, now).state === "pending" && (RU.outcomeOf(0, { ok: false, retry: true, error: "  " }, now) as { error: string }).error, "failed");

    t.eq("httpRetryable: 4xx is final", [400, 401, 403, 404, 410, 422].map(O.httpRetryable), [false, false, false, false, false, false]);
    t.eq("httpRetryable: …except 408 and 429", [408, 429].map(O.httpRetryable), [true, true]);
    t.eq("httpRetryable: 5xx and the rest may be retried", [500, 502, 503, 504, 302].map(O.httpRetryable), [true, true, true, true, true]);

    t.eq("resendKey(base, n) = base:r<n>", [O.resendKey("tg:CMD-7K3Q9X:new_order", 1), O.resendKey("wh:ep1:order.created:CMD-1", 12)], ["tg:CMD-7K3Q9X:new_order:r1", "wh:ep1:order.created:CMD-1:r12"]);
    t.throws("resendKey refuses n < 1", () => O.resendKey("k", 0), /n ≥ 1/);
    t.throws("resendKey refuses a fractional n", () => O.resendKey("k", 1.5), /n ≥ 1/);
    t.throws("resendKey refuses an empty base", () => O.resendKey("", 1), /dedupe key/);
    t.eq("resendKey: a key of exactly 160 is kept", O.resendKey("k".repeat(157), 1).length, 160);
    t.throws("resendKey refuses a key over 160", () => O.resendKey("k".repeat(158), 1), /over 160/);

    const states: OutboxState[] = ["pending", "running", "done", "dead", "cancelled"];
    const kinds: OutboxKind[] = ["capi", "telegram", "webhook", "mail", "carrier", "whatsapp"];
    const table = Object.fromEntries(states.map((s) => [s, kinds.map((k) => RU.replayRule(s, k)).join(" ")]));
    t.eq("replay rule table (kinds: capi telegram webhook mail carrier whatsapp)", table, {
      pending: "noop noop noop noop noop noop",
      running: "noop noop noop noop noop noop",
      done: "invalid replay replay invalid invalid invalid",
      dead: "replay replay replay replay replay replay",
      cancelled: "invalid invalid invalid invalid invalid invalid",
    });

    const spec =
      "UPDATE outbox SET state='running', claim=?, lease_until=UTC_TIMESTAMP(3) + INTERVAL 2 MINUTE WHERE ((state='pending' AND next_at <= UTC_TIMESTAMP(3)) OR (state='running' AND lease_until < UTC_TIMESTAMP(3))) AND kind IN (?, ?) AND store_id = ? ORDER BY next_at LIMIT ?";
    const norm = (s: string) => s.replace(/\s*=\s*/g, "=").replace(/\s+/g, " ").trim();
    t.eq("the claim statement is §H.1's, verbatim (store)", norm(RU.claimStatement(2, "store")), norm(spec));
    t.eq("the platform claim takes store_id NULL instead", norm(RU.claimStatement(1, "platform")), norm(spec.replace("kind IN (?, ?) AND store_id = ?", "kind IN (?) AND store_id IS NULL")));
    t.check("…no SKIP LOCKED (MariaDB 10.4)", !/SKIP LOCKED/i.test(RU.claimStatement(7, "store") + RU.claimStatement(7, "platform")));
    t.throws("a claim names 1-7 kinds", () => RU.claimStatement(0, "store"), /1-7 kinds/);

    t.eq("claimLimit: perStorePerTick while maxPerTick allows", RU.claimLimit({ perStorePerTick: 20, maxPerTick: 50 }, 0), 20);
    t.eq("claimLimit: what is left of maxPerTick", RU.claimLimit({ perStorePerTick: 20, maxPerTick: 50 }, 40), 10);
    t.eq("claimLimit: 0 once maxPerTick is spent (and past it)", [RU.claimLimit({ perStorePerTick: 20, maxPerTick: 50 }, 50), RU.claimLimit({ perStorePerTick: 20, maxPerTick: 50 }, 60)], [0, 0]);
    t.eq("claimLimit: a nonsense handler claims nothing", RU.claimLimit({ perStorePerTick: NaN, maxPerTick: 10 }, 0), 0);

    const ok = { kind: "telegram" as const, topic: "new_order", dedupeKey: "tg:CMD-1", payload: { phone: "+212612345678" } };
    t.check("checkItems: a well-formed item passes", (() => (RU.checkItems([ok, { ...ok, targetId: "chat:9f2c", notBefore: new Date(), pii: true }]), true))());
    t.throws("checkItems: 'push' is not stored before 0007", () => RU.checkItems([{ ...ok, kind: "push" }]), /item 0: kind "push" is not stored/);
    t.throws("checkItems: an unknown kind", () => RU.checkItems([ok, { ...ok, kind: "sms" as OutboxKind }]), /item 1: kind/);
    t.throws("checkItems: topic over 48", () => RU.checkItems([{ ...ok, topic: "t".repeat(49) }]), /topic/);
    t.throws("checkItems: an empty dedupe key", () => RU.checkItems([{ ...ok, dedupeKey: "" }]), /dedupeKey/);
    t.throws("checkItems: dedupe key over 160", () => RU.checkItems([{ ...ok, dedupeKey: "k".repeat(161) }]), /dedupeKey/);
    t.throws("checkItems: targetId over 64", () => RU.checkItems([{ ...ok, targetId: "x".repeat(65) }]), /targetId/);
    t.throws("checkItems: an invalid notBefore", () => RU.checkItems([{ ...ok, notBefore: new Date(NaN) }]), /notBefore/);
    try {
      RU.checkItems([{ ...ok, topic: "" }]);
    } catch (err) {
      t.check("checkItems: the refusal never quotes the payload", !String((err as Error).message).includes("212612345678"));
    }
    t.eq("the 0006 enum stores seven kinds (edge_purge appended in 0006; push arrives with 0007)", [...RU.STORED_KINDS].sort(), ["capi", "carrier", "edge_purge", "mail", "telegram", "webhook", "whatsapp"]);

    const masked = RU.cleanLastError(`Bad Request: chat 4433221100 not found for ali@example.ma\n${"x".repeat(400)}`);
    t.check("cleanLastError: e-mail and long digit runs masked, one line", masked.startsWith("Bad Request: chat <n> not found for <email> x") && !/\n/.test(masked), masked.slice(0, 60));
    t.eq("cleanLastError: at most 300 characters", masked.length, 300);
    t.eq("cleanLastError: a non-string is empty", RU.cleanLastError({ payload: 1 }), "");

    const item = (id: string, key: string | null, storeId: string | null = A): ClaimedItem<unknown> => ({ id, storeId, kind: "telegram", topic: key ?? "daily", targetId: null, dedupeKey: id, payload: null, attempts: 0, createdAt: new Date(now) });
    const units = RU.planUnits([item("1", "new_order"), item("2", null), item("3", "new_order"), item("4", "new_order"), item("5", "other")], { max: 2, key: (i) => (i.topic === "daily" ? null : i.topic), send: async () => ({ ok: true }) });
    t.eq(
      "planUnits: one key's items merged (≤ max), a null key alone, groups where their first item was",
      units.map((u) => `${u.batch ? "B" : "S"}:${u.items.map((i) => i.id).join("+")}`),
      ["B:1+3", "S:2", "B:4", "B:5"],
    );
    t.eq("planUnits: without batch, one send per item", RU.planUnits([item("1", "a"), item("2", "a")], undefined).map((u) => u.batch), [false, false]);
    t.eq(
      "planUnits: a key that throws counts as null",
      RU.planUnits([item("1", "a")], {
        max: 5,
        key: () => {
          throw new Error("x");
        },
        send: async () => ({ ok: true }),
      }).map((u) => u.batch),
      [false],
    );

    t.eq("normalizeResult: a malformed answer is a retryable bad_result", [RU.normalizeResult(undefined), RU.normalizeResult({ status: 200 })], [
      { ok: false, retry: true, error: "bad_result" },
      { ok: false, retry: true, error: "bad_result" },
    ]);
    t.eq("normalizeResult: retry defaults to true, a non-integer status is dropped", RU.normalizeResult({ ok: false, error: "x", status: "500" }), { ok: false, retry: true, error: "x" });
    t.eq("nextHourStart: the next UTC hour", RU.nextHourStart(Date.UTC(2026, 9, 28, 9, 59, 59, 999)), Date.UTC(2026, 9, 28, 10));
    t.eq("mail caps: 4 a minute, 150 an hour", [RU.MAIL_PER_MINUTE, RU.MAIL_PER_HOUR], [4, 150]);
  });

  /* ---------------------------------------------------------------- */
  h.section("outbox: drain", async (t: Checks) => {
    const sA = x.scope(A);
    const sB = x.scope(B);
    const run = async (deps: DrainDeps, owner: WriteScope | null, budget = 5_000, st = DR.newDrainState(), kinds: readonly OutboxKind[] = RU.DRAIN_ORDER) => {
      const n = await DR.drainOwner(deps, owner, kinds, deps.now() + budget, st);
      return { n, st };
    };

    // per-store and per-kind caps across stores
    {
      const clock = new Clock();
      const box = new FakeOutbox(clock.now);
      for (let i = 0; i < 3; i++) {
        box.add(A, "telegram");
        box.add(B, "telegram");
      }
      const tg = fakeHandler("telegram", { per: 2, max: 3 });
      const deps = depsFor(box, clock, [tg]);
      const st = DR.newDrainState();
      await run(deps, sA, 5_000, st);
      await run(deps, sB, 5_000, st);
      t.eq("caps: perStorePerTick 2 in A, then what is left of maxPerTick 3 in B", [tg.sent.filter((i) => i.storeId === A).length, tg.sent.filter((i) => i.storeId === B).length], [2, 1]);
      t.eq("…the rest stays pending and due for the next tick (rows A1 B1 A2 B2 A3 B3)", box.rows.filter((r) => r.state === "pending").map((r) => [r.storeId === A ? "A" : "B", r.attempts]), [
        ["B", 0],
        ["A", 0],
        ["B", 0],
      ]);
      t.eq("…counts", [st.claimed, st.done, st.taken.telegram], [3, 3, 3]);
      t.check("…a handler gets an opened payload and its row's fields", tg.sent.every((i) => typeof (i.payload as { n?: unknown }).n === "number" && i.kind === "telegram" && i.attempts === 0 && i.createdAt instanceof Date));
      t.check("…one yield after every send", deps.yields === 3, String(deps.yields));
      const other = await run(deps, sA, 5_000, DR.newDrainState());
      t.eq("a new drain: store A's last item; never another store's", [other.n, tg.sent.slice(3).map((i) => i.storeId)], [1, [A]]);
    }

    // backoff and dead through the drainer
    {
      const clock = new Clock();
      const box = new FakeOutbox(clock.now);
      const r1 = box.add(A, "capi", { attempts: 0 });
      const r6 = box.add(A, "capi", { attempts: 6 });
      const refused = box.add(A, "capi", { attempts: 2 });
      const capi = fakeHandler("capi", { answer: (i) => (i.id === refused.id ? { ok: false, retry: false, status: 400, error: "(#100) Invalid parameter" } : { ok: false, retry: true, status: 503, error: "HTTP 503" }) });
      const deps = depsFor(box, clock, [capi]);
      const { st } = await run(deps, sA);
      t.eq("a retryable failure: pending, attempts 1, next try in 1 min, status and error kept", [box.get(r1.id).state, box.get(r1.id).attempts, box.get(r1.id).nextAt - clock.now(), box.get(r1.id).lastStatus, box.get(r1.id).lastError], ["pending", 1, MIN, 503, "HTTP 503"]);
      t.eq("the 7th failing send: dead, attempts 7", [box.get(r6.id).state, box.get(r6.id).attempts], ["dead", 7]);
      t.eq("retry: false: dead at once", [box.get(refused.id).state, box.get(refused.id).attempts, box.get(refused.id).lastStatus], ["dead", 3, 400]);
      t.eq("onDead once per dead row (markHealthDirty + dead_<kind>)", deps.deadRows.map((r) => r.id).sort(), [r6.id, refused.id].sort());
      t.eq("…counts", [st.retried, st.dead, st.done], [1, 2, 0]);
      clock.advance(30_000);
      const early = await run(deps, sA);
      t.eq("not due before its next_at", early.st.claimed, 0);
      clock.advance(31_000);
      await run(deps, sA);
      t.eq("due after 1 min: the second failure waits 5 min", [box.get(r1.id).attempts, box.get(r1.id).nextAt - clock.now()], [2, 5 * MIN]);
    }

    // a timeout and a throw are retryable failures; the signal reaches the handler
    {
      const clock = new Clock();
      const box = new FakeOutbox(clock.now);
      const slow = box.add(A, "webhook");
      const boom = box.add(A, "webhook");
      const wh = fakeHandler("webhook", {
        timeoutMs: 20,
        answer: (i, signal) => (i.id === slow.id ? new Promise<SendResult>((resolve) => signal.addEventListener("abort", () => setTimeout(() => resolve({ ok: true }), 5))) : Promise.reject(new TypeError("fetch failed"))),
      });
      const deps = depsFor(box, clock, [wh]);
      await run(deps, sA);
      t.eq("a send past timeoutMs: retryable 'timeout', even if it answers later", [box.get(slow.id).state, box.get(slow.id).attempts, box.get(slow.id).lastError], ["pending", 1, "timeout"]);
      t.check("…the AbortSignal was handed to the handler and fired", wh.signals.length === 2 && wh.signals[0]!.aborted);
      t.eq("a send that throws: retryable, its error code stored (never its message)", [box.get(boom.id).state, box.get(boom.id).attempts, box.get(boom.id).lastError], ["pending", 1, "TypeError"]);
    }

    // the kill switch and a handler's pause
    {
      const clock = new Clock();
      const box = new FakeOutbox(clock.now);
      const c = box.add(A, "capi");
      const tgRow = box.add(A, "telegram");
      const capi = fakeHandler("capi");
      const tg = fakeHandler("telegram");
      const killed: OutboxKind[] = [];
      const deps = depsFor(box, clock, [capi, tg], { killed: async (k) => (killed.push(k), k === "capi") });
      const before = { ...box.get(c.id) };
      const { st } = await run(deps, sA);
      t.eq("capi_enabled off: capi is not claimed, its row untouched (state, attempts, next_at, claim)", box.get(c.id), before);
      t.check("…telegram still goes", box.get(tgRow.id).state === "done" && capi.sent.length === 0);
      t.eq("…the pause is read once per drain and kind", [killed.filter((k) => k === "capi").length, st.paused.capi], [1, true]);
      await run(deps, sB, 5_000, st);
      t.eq("…and not read again for the next store of the same drain", killed.filter((k) => k === "capi").length, 1);

      const box2 = new FakeOutbox(clock.now);
      const p = box2.add(A, "capi");
      let asked = 0;
      const own = fakeHandler("capi", { paused: async () => (asked++, true) });
      await run(depsFor(box2, clock, [own]), sA);
      t.eq("a handler's paused(): its rows wait untouched, asked once", [box2.get(p.id).state, box2.get(p.id).attempts, own.sent.length, asked], ["pending", 0, 0, 1]);

      const box3 = new FakeOutbox(clock.now);
      const q = box3.add(A, "capi");
      const broken = fakeHandler("capi", {
        paused: async () => {
          throw new Error("settings unreadable");
        },
      });
      const d3 = depsFor(box3, clock, [broken]);
      await run(d3, sA);
      t.check("a pause that cannot be read counts as paused (items wait) and is counted", box3.get(q.id).state === "pending" && broken.sent.length === 0 && d3.errors.some((e) => e.area === "outbox"));
    }

    // no handler: items stay pending, the probe is asked
    {
      const clock = new Clock();
      const box = new FakeOutbox(clock.now);
      const w = box.add(A, "webhook");
      const deps = depsFor(box, clock, [fakeHandler("telegram")]);
      const { st } = await run(deps, sA);
      t.eq("no handler: nothing claimed, the item stays pending", [st.claimed, box.get(w.id).state, box.get(w.id).attempts], [0, "pending", 0]);
      t.eq("…the missing kinds go to the probe (logged once per process by the app)", deps.missing.at(-1)?.includes("webhook"), true);
      const plat = depsFor(box, clock, []);
      await run(plat, null);
      t.eq("…never probed for the platform items", plat.missing.length, 0);
    }

    // the budget: the rest of a claim goes back untouched
    {
      const clock = new Clock();
      const box = new FakeOutbox(clock.now);
      const rows = [0, 1, 2, 3, 4].map(() => box.add(A, "telegram"));
      const tg = fakeHandler("telegram", {
        answer: () => {
          clock.advance(600);
          return { ok: true };
        },
      });
      const deps = depsFor(box, clock, [tg]);
      const { st } = await run(deps, sA, 1_000);
      t.eq("budget 1 s, 0.6 s a send: two sent (the running one is never cut)", tg.sent.length, 2);
      t.eq("…the rest of the claim released: pending, attempts 0, next_at kept, no claim", rows.slice(2).map((r) => [box.get(r.id).state, box.get(r.id).attempts, box.get(r.id).nextAt === r.nextAt, box.get(r.id).claim]), [
        ["pending", 0, true, null],
        ["pending", 0, true, null],
        ["pending", 0, true, null],
      ]);
      t.eq("…reported: released 3, more", [st.released, st.more], [3, true]);
    }

    // merged sends: one result for the group, judged per item
    {
      const clock = new Clock();
      const box = new FakeOutbox(clock.now);
      const a = box.add(A, "telegram", { attempts: 0 });
      const b = box.add(A, "telegram", { attempts: 6 });
      const c = box.add(A, "telegram", { topic: "daily_summary" });
      const tg = fakeHandler("telegram", { batch: { max: 10, key: (i) => (i.topic === "new_order" ? "new_order" : null), answer: () => ({ ok: false, retry: true, status: 429, error: "Too Many Requests" }) } });
      const deps = depsFor(box, clock, [tg]);
      await run(deps, sA);
      t.eq("one batch.send for the key's items, the null key through send()", [tg.batches, tg.sent.length], [[[a.id, b.id]], 3]);
      t.eq("…the group's failure judged per item: attempts 0 → retry, attempts 6 → dead", [box.get(a.id).state, box.get(b.id).state, box.get(b.id).attempts], ["pending", "dead", 7]);
      t.eq("…the single item answered on its own (ok)", box.get(c.id).state, "done");
    }

    // mail: the platform caps reschedule, never attempt
    {
      const clock = new Clock();
      const box = new FakeOutbox(clock.now);
      const mails = [0, 1, 2].map(() => box.add(null, "mail"));
      const storeMail = box.add(A, "telegram");
      const mail = fakeHandler("mail");
      let gates = 0;
      const retryAt = clock.now() + 42_000;
      const deps = depsFor(box, clock, [mail, fakeHandler("telegram")], { mailGate: async () => (++gates === 1 ? { ok: true } : { ok: false, retryAt }) });
      const { st } = await run(deps, null);
      t.eq("one mail within the caps, then the cap: the rest rescheduled to when it opens", [mail.sent.length, mails.slice(1).map((m) => [box.get(m.id).state, box.get(m.id).attempts, box.get(m.id).nextAt])], [
        1,
        [
          ["pending", 0, retryAt],
          ["pending", 0, retryAt],
        ],
      ]);
      t.eq("…counted as rescheduled (no attempt), the gate asked once more only", [st.rescheduled, st.retried, gates], [2, 0, 2]);
      t.eq("…the platform drain never touches a store's row", box.get(storeMail.id).state, "pending");
    }

    // an unreadable sealed payload, a lost claim, claim contention
    {
      const clock = new Clock();
      const box = new FakeOutbox(clock.now);
      const sealedOk = box.add(A, "capi", { encrypted: true, payload: "SEALED" });
      const sealedBad = box.add(A, "capi", { encrypted: true, payload: "v2.k1.forged" });
      const capi = fakeHandler("capi");
      const deps = depsFor(box, clock, [capi]);
      await run(deps, sA);
      t.eq("a sealed payload is opened for the handler", capi.sent.map((i) => i.payload), [{ sealed: true }]);
      t.eq("one that does not open: dead at once, payload_unreadable, never sent", [box.get(sealedBad.id).state, box.get(sealedBad.id).lastError, box.get(sealedOk.id).state], ["dead", "payload_unreadable", "done"]);

      const box2 = new FakeOutbox(clock.now);
      const lost = box2.add(A, "telegram");
      const thief = fakeHandler("telegram", {
        answer: () => {
          box2.get(lost.id).claim = "ANOTHER-DRAIN"; // the lease ran out and another drain took the row
          return { ok: true };
        },
      });
      const d2 = depsFor(box2, clock, [thief]);
      const r2 = await run(d2, sA);
      t.eq("a claim lost meanwhile: the outcome is not written, counted lost", [r2.st.lost, r2.st.done, box2.get(lost.id).claim], [1, 0, "ANOTHER-DRAIN"]);

      const box3 = new FakeOutbox(clock.now);
      box3.add(A, "telegram");
      const later = box3.add(A, "capi");
      box3.contention = "telegram";
      const d3 = depsFor(box3, clock, [fakeHandler("telegram"), fakeHandler("capi")]);
      const r3 = await run(d3, sA);
      t.eq("claim contention (a deadlock): the kind waits for the next round, the others go on", [r3.st.more, box3.get(later.id).state, d3.errors.length], [true, "done", 1]);

      const box4 = new FakeOutbox(clock.now);
      const rows4 = [0, 1, 2, 3].map(() => box4.add(A, "telegram"));
      let writes = 0;
      const realFinish = box4.finish.bind(box4);
      box4.finish = async (...args) => {
        if (++writes === 2) throw Object.assign(new Error("Connection lost"), { code: "PROTOCOL_CONNECTION_LOST" });
        return realFinish(...args);
      };
      const d4 = depsFor(box4, clock, [fakeHandler("telegram")]);
      await t.rejects("a database failure part-way through a claim goes up (the store is skipped)", () => DR.drainOwner(d4, sA, RU.DRAIN_ORDER, clock.now() + 5_000, DR.newDrainState()), /Connection lost/);
      t.eq(
        "…the rows not given an outcome go back to pending at once, not after their lease",
        rows4.map((r) => [box4.get(r.id).state, box4.get(r.id).claim]),
        [
          ["done", null],
          ["pending", null],
          ["pending", null],
          ["pending", null],
        ],
      );
    }
  });
}
