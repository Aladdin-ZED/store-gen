/**
 * The class semaphores (P7 AI; ai.md AI-§B.11, AI-§A.4 step 6; docs/STORE-SAAS.md D55, §H.12 rule 6). Pure and in
 * process: one pool per class, `platform_ai.caps.concurrentDirector` 4 (shared by both Director classes),
 * `concurrentWorker` 8, `concurrentFast` 12; per store ≤ `perStoreWorker` 3 Worker slots, ≤ 1 interactive Director
 * call and ≤ 1 deep call in flight.
 *
 * Waiters queue FIFO per store and are served round-robin across stores, so one store's burst never starves another.
 * A pattern-A caller waits at most 3 s (`maxWaitMs`) and gets `AiBusyError` (the route answers `busy`, retryable); a
 * pattern-B job waits inside the job (`maxWaitMs: null`). `acquire()` resolves with the release function; releasing
 * twice is harmless.
 */
import type { TaskClass } from "../tasks";
import { processState } from "./process";

export interface SlotCaps {
  concurrentDirector: number;
  concurrentWorker: number;
  concurrentFast: number;
  perStoreWorker: number;
}

export const DEFAULT_SLOT_CAPS: SlotCaps = { concurrentDirector: 4, concurrentWorker: 8, concurrentFast: 12, perStoreWorker: 3 };
/** pattern A: waiting longer than this answers `busy` (AI-§B.11) */
export const PATTERN_A_MAX_WAIT_MS = 3_000;

export type SlotPool = "director" | "worker" | "fast";

export const poolOf = (cls: TaskClass): SlotPool => (cls === "worker" ? "worker" : cls === "fast" ? "fast" : "director");

export class AiBusyError extends Error {
  readonly code = "busy" as const;
  constructor(readonly waitedMs: number) {
    super("ai busy");
    this.name = "AiBusyError";
  }
}

interface Waiter {
  cls: TaskClass;
  storeId: string;
  since: number;
  grant(release: () => void): void;
  fail(err: unknown): void;
}

interface PoolState {
  inUse: number;
  /** per store, FIFO */
  queues: Map<string, Waiter[]>;
  /** the store served last (round-robin cursor) */
  last: string | null;
}

export class ClassSemaphores {
  private readonly pools: Record<SlotPool, PoolState> = {
    director: { inUse: 0, queues: new Map(), last: null },
    worker: { inUse: 0, queues: new Map(), last: null },
    fast: { inUse: 0, queues: new Map(), last: null },
  };
  /** in flight per (class, store) */
  private readonly perStore = new Map<string, number>();

  constructor(
    private caps: SlotCaps = DEFAULT_SLOT_CAPS,
    private readonly now: () => number = Date.now,
  ) {}

  /** New caps (the console changed them): applied at the next grant. */
  setCaps(caps: SlotCaps): void {
    this.caps = caps;
    for (const p of Object.keys(this.pools) as SlotPool[]) this.drain(p);
  }

  private capacity(pool: SlotPool): number {
    return pool === "director" ? this.caps.concurrentDirector : pool === "worker" ? this.caps.concurrentWorker : this.caps.concurrentFast;
  }

  /** The per-store ceiling of a class (fast has none). */
  private storeLimit(cls: TaskClass): number {
    return cls === "worker" ? this.caps.perStoreWorker : cls === "fast" ? Number.POSITIVE_INFINITY : 1;
  }

  private storeKey(cls: TaskClass, storeId: string): string {
    return `${cls}:${storeId}`;
  }

  private canTake(cls: TaskClass, storeId: string): boolean {
    const pool = this.pools[poolOf(cls)];
    return pool.inUse < this.capacity(poolOf(cls)) && (this.perStore.get(this.storeKey(cls, storeId)) ?? 0) < this.storeLimit(cls);
  }

  private take(cls: TaskClass, storeId: string): () => void {
    const poolId = poolOf(cls);
    const key = this.storeKey(cls, storeId);
    this.pools[poolId].inUse++;
    this.perStore.set(key, (this.perStore.get(key) ?? 0) + 1);
    let done = false;
    return () => {
      if (done) return;
      done = true;
      this.pools[poolId].inUse--;
      const n = (this.perStore.get(key) ?? 1) - 1;
      if (n > 0) this.perStore.set(key, n);
      else this.perStore.delete(key);
      this.drain(poolId);
    };
  }

  /** Grants waiting heads round-robin across stores while the pool has room. */
  private drain(poolId: SlotPool): void {
    const pool = this.pools[poolId];
    for (;;) {
      const stores = [...pool.queues.keys()];
      if (stores.length === 0) return;
      const start = pool.last === null ? 0 : (stores.indexOf(pool.last) + 1) % stores.length;
      let granted = false;
      for (let k = 0; k < stores.length; k++) {
        const sid = stores[(start + k) % stores.length]!;
        const q = pool.queues.get(sid)!;
        const head = q[0];
        if (!head || !this.canTake(head.cls, sid)) continue;
        q.shift();
        if (q.length === 0) pool.queues.delete(sid);
        pool.last = sid;
        head.grant(this.take(head.cls, sid));
        granted = true;
        break;
      }
      if (!granted) return;
    }
  }

  /**
   * A slot of `cls` for the store. Immediate when free and nobody of the store waits ahead; else queued. `maxWaitMs`
   * null waits forever (pattern B); an abort of `signal` removes the waiter and rejects with the signal's reason.
   */
  acquire(cls: TaskClass, storeId: string, opts: { maxWaitMs: number | null; signal?: AbortSignal } = { maxWaitMs: PATTERN_A_MAX_WAIT_MS }): Promise<() => void> {
    const pool = this.pools[poolOf(cls)];
    if (opts.signal?.aborted) return Promise.reject(opts.signal.reason ?? new Error("aborted"));
    if (!pool.queues.has(storeId) && this.canTake(cls, storeId)) return Promise.resolve(this.take(cls, storeId));
    return new Promise((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      const remove = (): void => {
        const q = pool.queues.get(storeId);
        if (!q) return;
        const i = q.indexOf(waiter);
        if (i >= 0) q.splice(i, 1);
        if (q.length === 0) pool.queues.delete(storeId);
      };
      const onAbort = (): void => {
        remove();
        if (timer) clearTimeout(timer);
        reject(opts.signal?.reason ?? new Error("aborted"));
      };
      const waiter: Waiter = {
        cls,
        storeId,
        since: this.now(),
        grant: (release) => {
          if (timer) clearTimeout(timer);
          opts.signal?.removeEventListener("abort", onAbort);
          resolve(release);
        },
        fail: reject,
      };
      const q = pool.queues.get(storeId) ?? [];
      q.push(waiter);
      pool.queues.set(storeId, q);
      if (opts.maxWaitMs !== null) {
        timer = setTimeout(() => {
          remove();
          opts.signal?.removeEventListener("abort", onAbort);
          // another store may now be first in line
          this.drain(poolOf(cls));
          reject(new AiBusyError(this.now() - waiter.since));
        }, opts.maxWaitMs);
      }
      opts.signal?.addEventListener("abort", onAbort, { once: true });
      this.drain(poolOf(cls));
    });
  }

  /** In use and waiting per pool (the console's live tile, tests). */
  stats(): Record<SlotPool, { inUse: number; waiting: number; capacity: number }> {
    const one = (p: SlotPool) => ({ inUse: this.pools[p].inUse, waiting: [...this.pools[p].queues.values()].reduce((n, q) => n + q.length, 0), capacity: this.capacity(p) });
    return { director: one("director"), worker: one("worker"), fast: one("fast") };
  }
}

/** The process-wide semaphores (./process.ts), with the current caps applied. */
export function semaphores(caps?: SlotCaps): ClassSemaphores {
  const s = processState("semaphores", () => new ClassSemaphores(caps ?? DEFAULT_SLOT_CAPS));
  if (caps) s.setCaps(caps);
  return s;
}
