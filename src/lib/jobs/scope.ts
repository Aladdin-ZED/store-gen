import "server-only";
/**
 * The system seam (docs/STORE-SAAS.md §E.2): cron jobs, boot tasks, the outbox drainer and renders reach store data
 * only through a `SystemCtx` and `systemScope(ctx, storeId)`; cross-store iteration goes through `forEachStore`
 * (round-robin cursor, per-store isolation, the job's budget).
 *
 *   const ctx = systemCtx("sheets.push");
 *   await forEachStore(ctx, { job: ctx.job, states: ["active", "restricted"], budgetMs: 18_000 }, (scope, store) => push(scope, store));
 *
 * forEachStore (§H.2): stores in `states` are visited in id order from the job's cursor ("the next store id after the
 * last one served"), wrapping around once, so one slow store never starves the others; `where` narrows the visit to
 * stores with pending work (`pending_sheets` is ordered by the oldest pending order instead, ENGC-33). A store whose
 * step throws is logged (code only), counted in the error ring (`recordError("jobs", …)`, §H.5) and skipped for the
 * rest of the call; the loop yields to the event loop between stores and stops starting new stores once `budgetMs` is
 * spent (a running step is never interrupted). `done` is true when every matching store was visited in this call.
 * The round robin itself is `roundRobin()`, a pure core over a page source and a clock (test:jobs drives it offline).
 *
 * Inside a job run (src/lib/jobs/runner.ts) every visit is reported to the run's recorder (./recorder.ts), which writes
 * one `job_runs` row per store that did work: the step returned a positive count, threw, or the store was picked by a
 * `where` predicate (it had pending work). A step may return the number of rows it handled; returning nothing is fine.
 *
 * The cursor lives in `cron_cursors` (0005, job runner). Before that table exists (R1.0) it is kept in process
 * memory, which is enough for the one serving process the cron calls; the first write after 0005 moves it there.
 * `readJobCursor` / `writeJobCursor` are the same cursor for the runner's `JobCtx.cursor` / `setCursor`.
 */
import { and, asc, gt, inArray, isNotNull, lte, sql, type SQL } from "drizzle-orm";
import type { RowDataPacket } from "mysql2/promise";
import { db, pool } from "@/lib/db/client";
import { stores } from "@/lib/db/schema";
import { errorSummary } from "@/lib/orders/log";
import { mintScope } from "@/lib/tenancy/seam";
import type { StoreRow, StoreScope, StoreStatus, SystemCtx } from "@/lib/tenancy/types";
import { errorCode, recordError } from "./errors";
import { recordStoreVisit } from "./recorder";

const JOB_RE = /^[a-z][a-z0-9_.:-]{0,47}$/;
const STATUSES: readonly StoreStatus[] = ["pending", "active", "restricted", "suspended", "closed", "scheduled_deletion", "purged", "rejected"];
/** stores read per query while iterating */
const PAGE = 50;
/** a missing cron_cursors table is probed again after this long (0005 may have been applied meanwhile) */
const TABLE_RECHECK_MS = 5 * 60_000;

/** The context of one job run (actor kind "system", no user, no IP). */
export function systemCtx(job: string): SystemCtx {
  if (!JOB_RE.test(job)) throw new Error(`jobs: bad job name "${job}"`);
  return { job, actor: { kind: "system", userId: null, impersonatorId: null, ip: null } };
}

/** kind "system" (a WriteScope: jobs write tenant rows). */
export function systemScope(ctx: SystemCtx, storeId: string): StoreScope & { readonly kind: "system" } {
  if (ctx.actor.kind !== "system") throw new Error("jobs: systemScope needs a system actor");
  return mintScope("system", storeId);
}

export interface ForEachStoreOpts {
  job: string;
  states: readonly StoreStatus[];
  budgetMs: number;
  where?: "pending_sheets" | "pending_outbox" | "pending_renders";
  /**
   * P8 step 5 (additive): asked before each store; true ends the call there (`done` false, the cursor on the last store
   * served), so a job whose own budget is spent (the renders' CPU cap) visits no further store and writes no row for it
   */
  stop?: () => boolean;
}

/* ------------------------------------------------------------------ */
/* Cursors                                                             */
/* ------------------------------------------------------------------ */

declare global {
  var __sgCronCursors: { memory: Map<string, string>; tableMissingAt: number } | undefined;
}

const cursors = () => (globalThis.__sgCronCursors ??= { memory: new Map(), tableMissingAt: 0 });
const tableMissing = (err: unknown) => (err as { errno?: number } | null)?.errno === 1146;

/** The job's round-robin cursor ("" before its first run): `cron_cursors.cursor`, or process memory before 0005. */
export async function readJobCursor(job: string): Promise<string> {
  const state = cursors();
  if (Date.now() - state.tableMissingAt >= TABLE_RECHECK_MS) {
    try {
      // tenancy: platform cron_cursors is a job-runner row (P, opt. store; §D.3)
      const [rows] = await pool().query<RowDataPacket[]>("SELECT `cursor` FROM cron_cursors WHERE job = ?", [job]);
      state.tableMissingAt = 0;
      if (rows.length) return String(rows[0]!.cursor ?? "");
    } catch (err) {
      if (!tableMissing(err)) throw err;
      state.tableMissingAt = Date.now();
    }
  }
  return state.memory.get(job) ?? "";
}

/** Stores the job's round-robin cursor (the row is created on first use). */
export async function writeJobCursor(job: string, cursor: string): Promise<void> {
  const state = cursors();
  state.memory.set(job, cursor);
  if (Date.now() - state.tableMissingAt < TABLE_RECHECK_MS) return;
  try {
    // tenancy: platform cron_cursors (see readCursor)
    await pool().query(
      "INSERT INTO cron_cursors (job, `cursor`, updated_at) VALUES (?, ?, UTC_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE `cursor` = VALUES(`cursor`), updated_at = VALUES(updated_at)",
      [job, cursor],
    );
  } catch (err) {
    if (!tableMissing(err)) throw err;
    state.tableMissingAt = Date.now();
  }
}

/** Forget the in-memory cursors (tests; the table rows are untouched). */
export function resetMemoryCursors(): void {
  globalThis.__sgCronCursors = undefined;
}

/* ------------------------------------------------------------------ */
/* Store pages                                                         */
/* ------------------------------------------------------------------ */

function toStoreRow(r: typeof stores.$inferSelect): StoreRow | null {
  if (!r.handle) return null;
  return {
    id: r.id,
    handle: r.handle,
    name: r.name,
    mode: r.mode,
    status: r.status,
    planId: r.planId,
    market: r.market,
    currency: r.currency,
    timezone: r.timezone,
    defaultLocale: r.defaultLocale,
    homePageId: r.homePageId,
    brandSeed: r.brandSeed,
    catalogVersion: r.catalogVersion,
    addressVersion: r.addressVersion,
    requireMember2fa: r.requireMember2fa,
    primaryDomain: null, // verified custom domains arrive with store_domains (R3)
  };
}

/** The table each `where` predicate needs; until it exists no store has that work pending. */
const WHERE_TABLE: Record<NonNullable<ForEachStoreOpts["where"]>, string> = {
  pending_sheets: "orders",
  pending_outbox: "outbox",
  pending_renders: "render_jobs",
};

/**
 * The `where` predicate on `stores` (this file is P8's in R1: a track that needs another predicate asks by CCR).
 *
 * - `pending_sheets` (§H.2 slot 1): Sheets enabled in the store's settings and either an order still to push, or a
 *   status pull due: "bring statuses back" on (the key's default) and the store's `sheets:pull` bucket (1 per 290 s,
 *   SHT-06) not inside a window. Without the second branch a store whose orders were all synced never had its agents'
 *   sheet statuses pulled by the cron (T4 review, SHT-11).
 * - `pending_outbox` (§H.1): an item of the store waiting and due (`pending`, `next_at` passed), or claimed by a drain
 *   that died (`running` past its lease: the claim takes it over, P8 step 4). Platform items (`store_id` NULL) are never
 *   a store's work; the drain takes them on its own.
 * - `pending_renders` (§H.3): a job of the store waiting and due (`pending`, `not_before` passed), or claimed by a
 *   render that died (`running` past its lease: the claim takes it over, P8 step 5). A running job with a live lease
 *   is another drain's claim, never a reason to visit.
 */
function wherePredicate(where: NonNullable<ForEachStoreOpts["where"]>): SQL {
  switch (where) {
    case "pending_sheets":
      return sql`EXISTS (SELECT 1 FROM store_settings ss WHERE ss.store_id = ${stores.id} AND ss.\`key\` = 'sheets' AND ss.encrypted = 0 AND JSON_VALID(ss.value)
          AND JSON_UNQUOTE(JSON_EXTRACT(ss.value, '$.enabled')) = 'true'
          AND (EXISTS (SELECT 1 FROM orders o WHERE o.store_id = ${stores.id} AND o.is_test = 0 AND o.sheet_status IN ('pending', 'failed'))
            OR (COALESCE(JSON_UNQUOTE(JSON_EXTRACT(ss.value, '$.pull')), 'true') <> 'false'
              AND NOT EXISTS (SELECT 1 FROM rate_limits rl WHERE rl.bucket = CONCAT('s:', ${stores.id}, ':sheets:pull') AND rl.reset_at > UTC_TIMESTAMP(3)))))`;
    case "pending_outbox":
      return sql`EXISTS (SELECT 1 FROM outbox x WHERE x.store_id = ${stores.id} AND ((x.state = 'pending' AND x.next_at <= UTC_TIMESTAMP(3)) OR (x.state = 'running' AND x.lease_until < UTC_TIMESTAMP(3))))`;
    case "pending_renders":
      return sql`EXISTS (SELECT 1 FROM render_jobs r WHERE r.store_id = ${stores.id} AND ((r.state = 'pending' AND r.not_before <= UTC_TIMESTAMP(3)) OR (r.state = 'running' AND r.lease_until < UTC_TIMESTAMP(3))))`;
  }
}

async function tableExists(name: string): Promise<boolean> {
  const [rows] = await pool().query<RowDataPacket[]>("SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1", [name]);
  return rows.length > 0;
}

/** One page of stores in `states` matching `where`, in id order, with `after` < id <= `upTo` (either bound optional). */
async function storePage(states: readonly StoreStatus[], after: string, upTo: string | null, where: SQL | undefined, limit: number = PAGE): Promise<StoreRow[]> {
  // tenancy: platform cron iterator over stores (§E.3 rule 6, src/lib/jobs/**)
  const rows = await db
    .select()
    .from(stores)
    .where(and(inArray(stores.status, [...states]), isNotNull(stores.handle), after ? gt(stores.id, after) : undefined, upTo ? lte(stores.id, upTo) : undefined, where))
    .orderBy(asc(stores.id))
    .limit(limit);
  return rows.map(toStoreRow).filter((r): r is StoreRow => r !== null);
}

/**
 * One pass over the stores in `states`, in id order after `after` (`limit` per call, ≤ 200): the platform-wide jobs
 * that visit every store once from start to end (the render fan-out, P8 step 5) rather than round robin.
 */
export async function storesAfter(states: readonly StoreStatus[], after: string, limit: number = PAGE): Promise<StoreRow[]> {
  if (!states.length || states.some((s) => !STATUSES.includes(s))) throw new Error("jobs: storesAfter needs store states");
  return storePage(states, after, null, undefined, Math.min(200, Math.max(1, Math.trunc(limit))));
}

/** How many stores are in `states` (a fan-out's progress denominator). */
export async function countStores(states: readonly StoreStatus[]): Promise<number> {
  if (!states.length || states.some((s) => !STATUSES.includes(s))) throw new Error("jobs: countStores needs store states");
  // tenancy: platform cron iterator over stores (§E.3 rule 6, src/lib/jobs/**): a count, no store data
  const [row] = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(stores)
    .where(and(inArray(stores.status, [...states]), isNotNull(stores.handle)));
  return Number(row?.n ?? 0);
}

/**
 * `pending_sheets`: every matching store, the one with the oldest pending order first (ENGC-33); the stores with only
 * a pull due come after every store with orders to push (MariaDB sorts the NULL of "no pending order" first otherwise).
 */
async function oldestPendingFirst(states: readonly StoreStatus[], where: SQL): Promise<StoreRow[]> {
  const oldest = sql`(SELECT MIN(o.created_at) FROM orders o WHERE o.store_id = ${stores.id} AND o.is_test = 0 AND o.sheet_status IN ('pending', 'failed'))`;
  // tenancy: platform cron iterator over stores (§E.3 rule 6, src/lib/jobs/**)
  const rows = await db
    .select()
    .from(stores)
    .where(and(inArray(stores.status, [...states]), isNotNull(stores.handle), where))
    .orderBy(sql`${oldest} IS NULL`, oldest, asc(stores.id));
  return rows.map(toStoreRow).filter((r): r is StoreRow => r !== null);
}

const yieldLoop = () => new Promise<void>((resolve) => setImmediate(resolve));

/* ------------------------------------------------------------------ */
/* The round robin (pure)                                              */
/* ------------------------------------------------------------------ */

/** What `roundRobin` iterates: pages in id order and the job's cursor. */
export interface RoundRobinSource<T extends { id: string }> {
  /** at most `limit` items in id order with `after` < id (and id ≤ `upTo` when given) */
  page(after: string, upTo: string | null, limit: number): Promise<T[]>;
  readCursor(): Promise<string>;
  writeCursor(cursor: string): Promise<void>;
}

export interface RoundRobinOpts {
  budgetMs: number;
  /** asked before each item after the budget check: true ends the call (`done` false) */
  stop?: () => boolean;
  /** the clock (epoch ms); tests pass a fake one */
  now?: () => number;
  /** items read per page (50) */
  pageSize?: number;
}

/**
 * The items after the cursor, then from the first one up to the cursor (the last one served), until `budgetMs` is spent
 * (checked before each item, so at least one item is visited per call and a running visit is never interrupted). The
 * cursor moves to the last item visited, so the next call starts after it: an item whose visit is slow costs only its
 * own call's remaining budget, and the items behind it come first next time. `done` = every item was visited.
 */
export async function roundRobin<T extends { id: string }>(
  src: RoundRobinSource<T>,
  opts: RoundRobinOpts,
  visit: (item: T) => Promise<void>,
): Promise<{ visited: number; done: boolean }> {
  const now = opts.now ?? Date.now;
  const size = opts.pageSize ?? PAGE;
  const deadline = now() + opts.budgetMs;
  const start = await src.readCursor();
  let visited = 0;
  let last = start;
  // past the cursor to the end, then from the start up to the cursor (inclusive: the last one served comes last)
  const phases = start ? [{ after: start, upTo: null }, { after: "", upTo: start }] : [{ after: "", upTo: null }];
  for (const phase of phases) {
    let after = phase.after;
    for (;;) {
      const page = await src.page(after, phase.upTo, size);
      for (const item of page) {
        if (now() >= deadline || opts.stop?.()) {
          await src.writeCursor(last);
          return { visited, done: false };
        }
        visited++;
        await visit(item);
        last = after = item.id;
      }
      if (page.length < size) break;
    }
  }
  await src.writeCursor(last);
  return { visited, done: true };
}

/* ------------------------------------------------------------------ */
/* forEachStore                                                        */
/* ------------------------------------------------------------------ */

/**
 * Visits stores in `states` from the job's cursor until `budgetMs` is spent; a store whose step throws is skipped,
 * logged and counted. The step may return how many rows it handled (that store's job_runs `processed`).
 */
export async function forEachStore(
  ctx: SystemCtx,
  opts: ForEachStoreOpts,
  fn: (scope: StoreScope, store: StoreRow) => Promise<void | number>,
): Promise<{ visited: number; done: boolean }> {
  if (ctx.actor.kind !== "system") throw new Error("jobs: forEachStore needs a system actor");
  if (!JOB_RE.test(opts.job) || opts.job === "tick") throw new Error(`jobs: bad job name "${opts.job}"`); // "tick" is the runner's lease row
  if (!opts.states.length || opts.states.some((s) => !STATUSES.includes(s))) throw new Error("jobs: forEachStore needs store states");
  if (!Number.isFinite(opts.budgetMs) || opts.budgetMs <= 0) throw new Error("jobs: forEachStore needs a positive budget");

  const deadline = Date.now() + opts.budgetMs;
  const where = opts.where ? ((await tableExists(WHERE_TABLE[opts.where])) ? wherePredicate(opts.where) : null) : undefined;
  if (where === null) return { visited: 0, done: true };

  // each store is visited at most once per call, so a store whose step threw is not retried before the next run
  const visit = async (store: StoreRow): Promise<void> => {
    const t0 = Date.now();
    let processed = 0;
    let code: string | null = null;
    try {
      const n = await fn(systemScope(ctx, store.id), store);
      if (typeof n === "number" && Number.isFinite(n) && n > 0) processed = Math.floor(n);
    } catch (err) {
      code = errorCode(err);
      console.error(`[jobs] ${opts.job}: store ${store.id} skipped:`, errorSummary(err));
      recordError("jobs", err, { storeId: store.id, route: `job:${opts.job}` });
    }
    const worked = processed > 0 || code !== null || opts.where !== undefined;
    recordStoreVisit({ storeId: store.id, startedAt: t0, ms: Date.now() - t0, ok: code === null, processed, errorCode: code, worked });
    await yieldLoop();
  };

  if (opts.where === "pending_sheets") {
    let visited = 0;
    for (const store of await oldestPendingFirst(opts.states, where!)) {
      if (Date.now() >= deadline || opts.stop?.()) return { visited, done: false };
      visited++;
      await visit(store);
    }
    return { visited, done: true };
  }

  return roundRobin(
    {
      page: (after, upTo, limit) => storePage(opts.states, after, upTo, where, limit),
      readCursor: () => readJobCursor(opts.job),
      writeCursor: (c) => writeJobCursor(opts.job, c),
    },
    // the predicate probe above counted against the budget; at least one store is still visited
    { budgetMs: Math.max(1, deadline - Date.now()), stop: opts.stop },
    visit,
  );
}
