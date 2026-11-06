/**
 * The outbox drainer's core (docs/STORE-SAAS.md §H.1, §H.8; R1 P8 step 4), over injected dependencies: the app passes
 * the database statements (./sql.ts), the handler registry, the kill switch and the mail caps (../outbox.ts);
 * test:jobs passes an in-memory outbox, fake handlers and a fake clock.
 *
 * For one owner (a store's write scope, or null for the platform items) and each kind in DRAIN_ORDER:
 *  1. no handler registered → skipped (its items stay pending; ../outbox.ts logs that once per process);
 *  2. paused → skipped untouched, asked once per drain and kind: the `capi_enabled` kill switch for capi, then the
 *     handler's own `paused()` (P0b, CCR P5-1); a pause that cannot be read counts as paused (items wait);
 *  3. one claim of `claimLimit` rows (perStorePerTick within what is left of maxPerTick for the whole drain);
 *  4. payloads opened (a sealed one that does not open is dead at once, `payload_unreadable`), then sent in claim
 *     order, one unit at a time (a single item, or one key's merged items through `batch`), each within the handler's
 *     `timeoutMs` (an AbortSignal that fires then, handed to the handler as a second argument; on expiry the send counts
 *     as a retryable `timeout`), a throw counted as a retryable failure with its error code;
 *  5. each item's outcome written (./rules.ts outcomeOf: done, retry up the ladder, or dead); a dead transition calls
 *     `onDead` (markHealthDirty + the error ring's `dead_<kind>`);
 *  6. the deadline is checked before each unit: what is left of the claim goes back to pending untouched (attempts and
 *     next_at as they were) and the report says `more`. A running send is never interrupted;
 *  7. mail only: before each send the platform caps (4 a minute, 150 an hour); over a cap the rest of the claim is
 *     rescheduled to when the cap opens, not attempted.
 */
import type { StoreScope, WriteScope } from "@/lib/tenancy/types";
import { errorCode } from "../errors";
import type { ClaimedItem, OutboxHandler, OutboxKind, SendResult } from "../outbox";
import { DRAIN_ORDER, claimLimit, normalizeResult, outcomeOf, planUnits, type Outcome } from "./rules";

/** A claimed row before its payload is opened. */
export interface RawItem {
  id: string;
  storeId: string | null;
  kind: OutboxKind;
  topic: string;
  targetId: string | null;
  dedupeKey: string;
  /** JSON, or a v2 envelope when `encrypted` */
  payload: string;
  encrypted: boolean;
  attempts: number;
  createdAt: Date;
}

/** The statements the drainer runs (./sql.ts in the app). `owner` null = the platform items. */
export interface DrainStore {
  claim(owner: WriteScope | null, kinds: readonly OutboxKind[], limit: number, claim: string): Promise<RawItem[]>;
  /** writes one send's outcome under the claim; false when the claim was lost (the lease ran out and another took it) */
  finish(owner: WriteScope | null, id: string, claim: string, outcome: Outcome, ms: number, now: number): Promise<boolean>;
  /** back to pending under the claim: `next_at` kept (null) or moved (a cap), attempts untouched */
  release(owner: WriteScope | null, ids: readonly string[], claim: string, nextAt: number | null): Promise<void>;
  /** the kinds among `kinds` with a pending item in the store (the missing-handler probe) */
  pendingKinds(owner: StoreScope, kinds: readonly OutboxKind[]): Promise<OutboxKind[]>;
}

export interface DrainDeps {
  store: DrainStore;
  handler(kind: OutboxKind): OutboxHandler<unknown> | null;
  /** epoch ms */
  now(): number;
  /** the platform's own pause of a kind (§H.8: `capi_enabled` for capi) */
  killed(kind: OutboxKind): Promise<boolean>;
  /** mail's platform caps, charged for one send: ok, or when to try again (epoch ms) */
  mailGate(now: number): Promise<{ ok: true } | { ok: false; retryAt: number }>;
  /** the payload as the handler receives it; throws when a sealed one does not open */
  open(item: RawItem): unknown;
  newClaim(): string;
  /** a row went dead */
  onDead(item: RawItem): void;
  recordError(area: string, err: unknown, opts?: { storeId?: string | null; route?: string | null; code?: string | null }): void;
  /** awaited between sends (the job's `ctx.yield()`, else setImmediate) */
  yieldLoop(): Promise<void>;
  /** kinds with no handler found pending in a store (../outbox.ts logs each once per process) */
  onMissing?(owner: StoreScope, kinds: readonly OutboxKind[]): Promise<void>;
}

/** One drain's running totals, shared by every owner it visits. */
export interface DrainState {
  claimed: number;
  done: number;
  retried: number;
  dead: number;
  /** claimed but given back untouched: the budget ran out */
  released: number;
  /** claimed but moved to later: a mail cap */
  rescheduled: number;
  /** a claim lost to a newer one before its outcome was written */
  lost: number;
  /** the budget ran out (or a claim met contention) with due items left */
  more: boolean;
  /** rows claimed per kind in this drain (maxPerTick) */
  taken: Partial<Record<OutboxKind, number>>;
  /** each kind's pause, read once per drain */
  paused: Partial<Record<OutboxKind, boolean>>;
}

export function newDrainState(): DrainState {
  return { claimed: 0, done: 0, retried: 0, dead: 0, released: 0, rescheduled: 0, lost: 0, more: false, taken: {}, paused: {} };
}

/** MariaDB deadlock (1213) or lock wait timeout (1205): another claimer won this round. */
export function isContention(err: unknown): boolean {
  for (let e: unknown = err, depth = 0; e && typeof e === "object" && depth < 5; depth++) {
    const n = (e as { errno?: unknown }).errno;
    if (n === 1213 || n === 1205) return true;
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}

/**
 * The handler's send with its timeout: an AbortSignal that fires at `timeoutMs` is handed over as a second argument (a
 * handler may abort its fetch). The timer is a plain, referenced `setTimeout` cleared when the send settles, not
 * `AbortSignal.timeout()`: that one's timer is unref'd, so a script's drain waiting on a hung send could see its
 * process exit under it.
 */
export async function sendWithin(timeoutMs: number, send: (signal: AbortSignal) => Promise<unknown>): Promise<SendResult> {
  const ms = Number.isFinite(timeoutMs) && timeoutMs > 0 ? Math.trunc(timeoutMs) : 1;
  const ac = new AbortController();
  return new Promise<SendResult>((resolve) => {
    let settled = false;
    const settle = (r: SendResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(r);
    };
    const timer = setTimeout(() => {
      settle({ ok: false, retry: true, error: "timeout" });
      ac.abort(new DOMException("The send timed out", "TimeoutError"));
    }, ms);
    let running: Promise<unknown>;
    try {
      running = Promise.resolve(send(ac.signal));
    } catch (err) {
      running = Promise.reject(err);
    }
    running.then(
      (r) => settle(normalizeResult(r)),
      (err: unknown) => settle({ ok: false, retry: true, error: errorCode(err) }),
    );
  });
}

type SendFn = (item: ClaimedItem<unknown>, signal: AbortSignal) => Promise<SendResult>;
type BatchSendFn = (items: readonly ClaimedItem<unknown>[], signal: AbortSignal) => Promise<SendResult>;

async function isPaused(deps: DrainDeps, h: OutboxHandler<unknown>, st: DrainState): Promise<boolean> {
  const known = st.paused[h.kind];
  if (known !== undefined) return known;
  let paused = true;
  try {
    paused = (await deps.killed(h.kind)) || (h.paused ? (await h.paused()) === true : false);
  } catch (err) {
    // a pause that cannot be read keeps the items waiting rather than sending past a switch
    deps.recordError("outbox", err, { route: `outbox:${h.kind}:paused` });
  }
  st.paused[h.kind] = paused;
  return paused;
}

/** Writes one item's outcome and counts it. */
async function finishOne(deps: DrainDeps, owner: WriteScope | null, raw: RawItem, claim: string, result: SendResult, ms: number, st: DrainState): Promise<void> {
  const now = deps.now();
  const outcome = outcomeOf(raw.attempts, result, now);
  const kept = await deps.store.finish(owner, raw.id, claim, outcome, ms, now);
  if (!kept) {
    st.lost++;
    return;
  }
  if (outcome.state === "done" || outcome.state === "cancelled") st.done++; // a cancelled item ended on purpose: never dead (CCR r1-p5-9)
  else if (outcome.state === "pending") st.retried++;
  else {
    st.dead++;
    deps.onDead(raw);
  }
}

/**
 * Sends one claim. Returns the rows given an outcome. `raws` are in claim order (oldest `next_at` first). When a
 * statement fails part-way (the database, after its retries), the rows not yet given an outcome go back to pending
 * before the error goes up, so they wait for the next drain rather than for their 2-minute lease.
 */
async function sendClaim(deps: DrainDeps, owner: WriteScope | null, h: OutboxHandler<unknown>, raws: RawItem[], claim: string, deadline: number, st: DrainState): Promise<number> {
  const settled = new Set<string>();
  try {
    return await sendClaimRows(deps, owner, h, raws, claim, deadline, st, settled);
  } catch (err) {
    const left = raws.filter((r) => !settled.has(r.id)).map((r) => r.id);
    try {
      await deps.store.release(owner, left, claim, null);
      st.released += left.length;
    } catch {
      // their lease ends within 2 minutes and the next claim takes them over
    }
    throw err;
  }
}

async function sendClaimRows(deps: DrainDeps, owner: WriteScope | null, h: OutboxHandler<unknown>, raws: RawItem[], claim: string, deadline: number, st: DrainState, settled: Set<string>): Promise<number> {
  let handled = 0;
  const byId = new Map<string, RawItem>();
  const ready: ClaimedItem<unknown>[] = [];
  for (const raw of raws) {
    let payload: unknown;
    try {
      payload = deps.open(raw);
    } catch (err) {
      deps.recordError("outbox", err, { storeId: raw.storeId, route: `outbox:${raw.kind}`, code: "payload_unreadable" });
      await finishOne(deps, owner, raw, claim, { ok: false, retry: false, error: "payload_unreadable" }, 0, st);
      settled.add(raw.id);
      handled++;
      continue;
    }
    byId.set(raw.id, raw);
    ready.push({ id: raw.id, storeId: raw.storeId, kind: raw.kind, topic: raw.topic, targetId: raw.targetId, dedupeKey: raw.dedupeKey, payload, attempts: raw.attempts, createdAt: raw.createdAt });
  }

  const units = planUnits(ready, h.batch);
  const send = h.send as SendFn;
  const batchSend = h.batch?.send as BatchSendFn | undefined;
  for (let i = 0; i < units.length; i++) {
    const unit = units[i]!;
    const rest = () => units.slice(i).flatMap((u) => u.items.map((it) => it.id));
    if (deps.now() >= deadline) {
      const ids = rest();
      await deps.store.release(owner, ids, claim, null);
      for (const id of ids) settled.add(id);
      st.released += ids.length;
      st.more = true;
      return handled;
    }
    if (h.kind === "mail") {
      const gate = await deps.mailGate(deps.now());
      if (!gate.ok) {
        const ids = rest();
        await deps.store.release(owner, ids, claim, gate.retryAt);
        for (const id of ids) settled.add(id);
        st.rescheduled += ids.length;
        return handled;
      }
    }
    const t0 = deps.now();
    const result = await sendWithin(h.timeoutMs, (signal) => (unit.batch && batchSend ? batchSend.call(h.batch, unit.items, signal) : send.call(h, unit.items[0]!, signal)));
    const ms = Math.max(0, deps.now() - t0);
    for (const it of unit.items) {
      await finishOne(deps, owner, byId.get(it.id)!, claim, result, ms, st);
      settled.add(it.id);
      handled++;
    }
    await deps.yieldLoop();
  }
  return handled;
}

/**
 * Drains one owner's due rows within `deadline` (epoch ms): every kind of `kinds` with a handler, in DRAIN_ORDER.
 * Returns the rows given an outcome (job_runs `processed` for the store). Throws on a database failure other than
 * claim contention (the caller isolates the store).
 */
export async function drainOwner(deps: DrainDeps, owner: WriteScope | null, kinds: readonly OutboxKind[], deadline: number, st: DrainState): Promise<number> {
  let handled = 0;
  const missing: OutboxKind[] = [];
  for (const kind of DRAIN_ORDER) {
    if (!kinds.includes(kind)) continue;
    const h = deps.handler(kind);
    if (!h) {
      missing.push(kind);
      continue;
    }
    if (deps.now() >= deadline) {
      st.more = true;
      break;
    }
    if (await isPaused(deps, h, st)) continue;
    const limit = claimLimit(h, st.taken[kind] ?? 0);
    if (limit <= 0) continue;
    const claim = deps.newClaim();
    let raws: RawItem[];
    try {
      raws = await deps.store.claim(owner, [kind], limit, claim);
    } catch (err) {
      if (!isContention(err)) throw err;
      deps.recordError("outbox", err, { storeId: owner?.storeId ?? null, route: `outbox:${kind}:claim` });
      st.more = true;
      continue;
    }
    st.claimed += raws.length;
    st.taken[kind] = (st.taken[kind] ?? 0) + raws.length;
    if (raws.length) handled += await sendClaim(deps, owner, h, raws, claim, deadline, st);
  }
  if (owner && missing.length && deps.onMissing) await deps.onMissing(owner, missing);
  return handled;
}
