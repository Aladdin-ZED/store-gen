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
 * step throws is logged (code only) and skipped for the rest of the call; the loop yields to the event loop between
 * stores and stops starting new stores once `budgetMs` is spent (a running step is never interrupted). `done` is true
 * when every matching store was visited in this call.
 *
 * The cursor lives in `cron_cursors` (0005, job runner). Before that table exists (R1.0) it is kept in process
 * memory, which is enough for the one serving process the cron calls; the first write after 0005 moves it there.
 */
import { and, asc, gt, inArray, isNotNull, lte, sql, type SQL } from "drizzle-orm";
import type { RowDataPacket } from "mysql2/promise";
import { db, pool } from "@/lib/db/client";
import { stores } from "@/lib/db/schema";
import { errorSummary } from "@/lib/orders/log";
import { mintScope } from "@/lib/tenancy/seam";
import type { StoreRow, StoreScope, StoreStatus, SystemCtx } from "@/lib/tenancy/types";

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
}

/* ------------------------------------------------------------------ */
/* Cursors                                                             */
/* ------------------------------------------------------------------ */

declare global {
  var __sgCronCursors: { memory: Map<string, string>; tableMissingAt: number } | undefined;
}

const cursors = () => (globalThis.__sgCronCursors ??= { memory: new Map(), tableMissingAt: 0 });
const tableMissing = (err: unknown) => (err as { errno?: number } | null)?.errno === 1146;

async function readCursor(job: string): Promise<string> {
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

async function writeCursor(job: string, cursor: string): Promise<void> {
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
 * The `where` predicate on `stores` (R1.0 shapes: Sheets enabled in the store's settings and an order still to push;
 * outbox items and render jobs pending once 0005 creates their tables). P5 / P8 refine the predicates in place.
 */
function wherePredicate(where: NonNullable<ForEachStoreOpts["where"]>): SQL {
  switch (where) {
    case "pending_sheets":
      return sql`EXISTS (SELECT 1 FROM store_settings ss WHERE ss.store_id = ${stores.id} AND ss.\`key\` = 'sheets' AND ss.encrypted = 0 AND JSON_VALID(ss.value) AND JSON_UNQUOTE(JSON_EXTRACT(ss.value, '$.enabled')) = 'true')
        AND EXISTS (SELECT 1 FROM orders o WHERE o.store_id = ${stores.id} AND o.is_test = 0 AND o.sheet_status IN ('pending', 'failed'))`;
    case "pending_outbox":
      return sql`EXISTS (SELECT 1 FROM outbox x WHERE x.store_id = ${stores.id} AND x.state = 'pending' AND x.next_at <= UTC_TIMESTAMP(3))`;
    case "pending_renders":
      return sql`EXISTS (SELECT 1 FROM render_jobs r WHERE r.store_id = ${stores.id})`;
  }
}

async function tableExists(name: string): Promise<boolean> {
  const [rows] = await pool().query<RowDataPacket[]>("SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1", [name]);
  return rows.length > 0;
}

/** One page of stores in `states` matching `where`, in id order, with `after` < id <= `upTo` (either bound optional). */
async function storePage(states: readonly StoreStatus[], after: string, upTo: string | null, where: SQL | undefined): Promise<StoreRow[]> {
  // tenancy: platform cron iterator over stores (§E.3 rule 6, src/lib/jobs/**)
  const rows = await db
    .select()
    .from(stores)
    .where(and(inArray(stores.status, [...states]), isNotNull(stores.handle), after ? gt(stores.id, after) : undefined, upTo ? lte(stores.id, upTo) : undefined, where))
    .orderBy(asc(stores.id))
    .limit(PAGE);
  return rows.map(toStoreRow).filter((r): r is StoreRow => r !== null);
}

/** `pending_sheets`: every matching store, the one with the oldest pending order first (ENGC-33). */
async function oldestPendingFirst(states: readonly StoreStatus[], where: SQL): Promise<StoreRow[]> {
  // tenancy: platform cron iterator over stores (§E.3 rule 6, src/lib/jobs/**)
  const rows = await db
    .select()
    .from(stores)
    .where(and(inArray(stores.status, [...states]), isNotNull(stores.handle), where))
    .orderBy(
      sql`(SELECT MIN(o.created_at) FROM orders o WHERE o.store_id = ${stores.id} AND o.is_test = 0 AND o.sheet_status IN ('pending', 'failed'))`,
      asc(stores.id),
    );
  return rows.map(toStoreRow).filter((r): r is StoreRow => r !== null);
}

const yieldLoop = () => new Promise<void>((resolve) => setImmediate(resolve));

/** Visits stores in `states` from the job's cursor until `budgetMs` is spent; a store whose step throws is skipped and logged. */
export async function forEachStore(
  ctx: SystemCtx,
  opts: ForEachStoreOpts,
  fn: (scope: StoreScope, store: StoreRow) => Promise<void>,
): Promise<{ visited: number; done: boolean }> {
  if (ctx.actor.kind !== "system") throw new Error("jobs: forEachStore needs a system actor");
  if (!JOB_RE.test(opts.job) || opts.job === "tick") throw new Error(`jobs: bad job name "${opts.job}"`); // "tick" is the runner's lease row
  if (!opts.states.length || opts.states.some((s) => !STATUSES.includes(s))) throw new Error("jobs: forEachStore needs store states");
  if (!Number.isFinite(opts.budgetMs) || opts.budgetMs <= 0) throw new Error("jobs: forEachStore needs a positive budget");

  const deadline = Date.now() + opts.budgetMs;
  const where = opts.where ? ((await tableExists(WHERE_TABLE[opts.where])) ? wherePredicate(opts.where) : null) : undefined;
  if (where === null) return { visited: 0, done: true };

  let visited = 0;
  // each store is visited at most once per call, so a store whose step threw is not retried before the next run
  const visit = async (store: StoreRow): Promise<void> => {
    visited++;
    try {
      await fn(systemScope(ctx, store.id), store);
    } catch (err) {
      console.error(`[jobs] ${opts.job}: store ${store.id} skipped:`, errorSummary(err));
    }
    await yieldLoop();
  };

  if (opts.where === "pending_sheets") {
    for (const store of await oldestPendingFirst(opts.states, where!)) {
      if (Date.now() >= deadline) return { visited, done: false };
      await visit(store);
    }
    return { visited, done: true };
  }

  // round robin: the stores after the cursor, then from the first one up to the cursor (the last one served)
  const start = await readCursor(opts.job);
  let last = start;
  const phases = start ? [{ after: start, upTo: null }, { after: "", upTo: start }] : [{ after: "", upTo: null }];
  for (const phase of phases) {
    let after = phase.after;
    for (;;) {
      const page = await storePage(opts.states, after, phase.upTo, where);
      for (const store of page) {
        if (Date.now() >= deadline) {
          await writeCursor(opts.job, last);
          return { visited, done: false };
        }
        await visit(store);
        last = after = store.id;
      }
      if (page.length < PAGE) break;
    }
  }
  await writeCursor(opts.job, last);
  return { visited, done: true };
}
