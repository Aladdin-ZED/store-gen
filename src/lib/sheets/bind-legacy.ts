import "server-only";
/**
 * Legacy Sheets bindings (P5 INTEGRATIONS; operations.md OPE-§19.2, OPE-§J `sheets.bind_legacy`; core §H.2 slot 7;
 * TENANCY-MAP §7.7). R1 treats a `sheets` setting whose spreadsheet is not in `sheet_bindings` as "not connected", so
 * the stores that connected before 0005 (store #1's inherited sheet, and the R1.0 stores that passed T4's proof) need
 * a `legacy` binding before their sheet is written again:
 *
 *   await ensureLegacyBinding(scope)          one store: bind its spreadsheet when it is free (the push calls it)
 *   await runBindLegacyTick(ctx, { budgetMs }) the job: one pass over every store, then the conflict rule, then done
 *
 * - `ensureLegacyBinding` is idempotent (the marker is the binding row itself): no setting, or the store's own row
 *   already there → nothing; a free spreadsheet → a `legacy` row; a spreadsheet another store holds → "taken" while
 *   the job's pass is not done yet (the pass decides who keeps it), "conflict" once it is (the sheet is paused with the
 *   status code `binding_conflict`). `pushStore` calls it once per store per process when a connected setting has no
 *   binding, so a live store never pauses for a tick waiting for the job.
 * - The job is the one place that sees every store naming a spreadsheet, each read through its own scope (no
 *   cross-store query): it walks `stores` in id order across ticks (≤ `budgetMs` each, the cursor in its
 *   `cron_cursors.state`), records the stores whose setting names a spreadsheet they do not hold by a code proof, then
 *   applies the rule of ./legacy-rule.ts on fresh readings: the earliest `connectedAt` keeps the spreadsheet (a code
 *   proof is never moved), every other store's sheet is paused with `binding_conflict`. Then it marks itself done and
 *   every later tick is a no-op (cached in this process). Decision (recorded in the step report): the push's own
 *   binding is provisional until the pass ends, because only the pass can compare two stores' `connectedAt`.
 *
 * Nothing here reads another store's rows: the probe for "taken" is the store's own INSERT IGNORE.
 */
import { asc, eq, gt } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { cronCursors, sheetBindings, stores } from "@/lib/db/schema";
import { recordIntegrationStatus } from "@/lib/integrations/status";
import { systemScope } from "@/lib/jobs/scope";
import { errorSummary } from "@/lib/orders/log";
import { markHealthDirty } from "@/lib/platform/health-snapshot";
import { getStoreSetting, setStoreSetting } from "@/lib/settings";
import { scopedCache } from "@/lib/tenancy/cache";
import { storeValues, whereStore } from "@/lib/tenancy/sql";
import type { StoreScope, SystemCtx, WriteScope } from "@/lib/tenancy/types";
import { legacyPlans, type LegacyMember } from "./legacy-rule";

export const BIND_LEGACY_JOB = "sheets.bind_legacy";
/** stores read per query of the pass */
const PAGE = 25;
const SYSTEM = { id: "system", kind: "system" as const };

/* ------------------------------------------------------------------ */
/* one store                                                           */
/* ------------------------------------------------------------------ */

/** The store's own binding of `spreadsheetId` (another store's row reads as none). */
async function ownBinding(scope: StoreScope, spreadsheetId: string): Promise<"code" | "legacy" | null> {
  const [row] = await db
    .select({ method: sheetBindings.method })
    .from(sheetBindings)
    .where(whereStore(sheetBindings, scope, eq(sheetBindings.spreadsheetId, spreadsheetId)))
    .limit(1);
  return row?.method ?? null;
}

/** The spreadsheet the store's setting names and when it was connected (null: no spreadsheet). */
async function namedSheet(scope: StoreScope): Promise<{ spreadsheetId: string; connectedAt: number | null } | null> {
  const s = await getStoreSetting(scope, "sheets", { fresh: true });
  if (!s.spreadsheetId) return null;
  const at = s.connectedAt ? Date.parse(s.connectedAt) : NaN;
  return { spreadsheetId: s.spreadsheetId, connectedAt: Number.isFinite(at) ? at : null };
}

/** INSERT IGNORE of a `legacy` row: true when the store holds the spreadsheet afterwards. */
async function claimLegacy(scope: WriteScope, spreadsheetId: string, now: Date): Promise<boolean> {
  await db.insert(sheetBindings).ignore().values(storeValues(scope, { spreadsheetId, method: "legacy" as const, verifiedAt: now, verifiedBy: null }));
  return (await ownBinding(scope, spreadsheetId)) !== null;
}

/** Release the store's `legacy` binding of `spreadsheetId` (a code binding is never released here). */
async function releaseLegacy(scope: WriteScope, spreadsheetId: string): Promise<void> {
  await db.delete(sheetBindings).where(whereStore(sheetBindings, scope, eq(sheetBindings.spreadsheetId, spreadsheetId), eq(sheetBindings.method, "legacy")));
}

/**
 * Pause the store's sheet because another store keeps its spreadsheet: `enabled: false` (the orders keep waiting as
 * `pending`), the `sheets` status row `off` with the code `binding_conflict` (the Sheets screen says to connect a sheet
 * of this store's own), and the store's health recomputed. The setting keeps its coordinates, so the owner sees which
 * sheet it was.
 */
export async function markBindingConflict(scope: WriteScope): Promise<void> {
  const prev = await getStoreSetting(scope, "sheets", { fresh: true });
  if (prev.enabled || prev.pending) await setStoreSetting(scope, "sheets", { ...prev, enabled: false, pending: null }, SYSTEM);
  await recordIntegrationStatus(scope, { kind: "sheets", outcome: "off", code: "binding_conflict" });
  await markHealthDirty(scope.storeId);
}

export type LegacyOutcome = "none" | "already" | "bound" | "taken" | "conflict";

/**
 * Bind the spreadsheet the store's setting names when no store holds it (see the header). Idempotent. "taken": another
 * store holds it and the legacy pass has not decided yet; "conflict": the pass is done, so the other store keeps it
 * and this store's sheet is now paused.
 */
export async function ensureLegacyBinding(scope: WriteScope, opts: { now?: Date } = {}): Promise<LegacyOutcome> {
  const named = await namedSheet(scope);
  if (!named) return "none";
  if ((await ownBinding(scope, named.spreadsheetId)) !== null) return "already";
  if (await claimLegacy(scope, named.spreadsheetId, opts.now ?? new Date())) return "bound";
  if (!(await legacyPassDone())) return "taken";
  await markBindingConflict(scope);
  return "conflict";
}

/* ------------------------------------------------------------------ */
/* the job's pass                                                      */
/* ------------------------------------------------------------------ */

interface PassState {
  v: 1;
  /** the last store id read by the pass ("" = not started) */
  after: string;
  done: boolean;
  /** the stores read so far whose setting names a spreadsheet they do not hold by a code proof */
  seen: LegacyMember[];
  /** when the pass finished, and what it did (counts only) */
  at?: string;
  bound?: number;
  moved?: number;
  conflicts?: number;
}

const doneCache = scopedCache<boolean>({ name: "sheets-legacy-done", maxEntries: 4, ttlMs: 10 * 60_000 });
const PLATFORM = "p";

function stateOf(raw: Record<string, unknown> | null | undefined): PassState {
  const seen = Array.isArray(raw?.seen) ? (raw!.seen as unknown[]) : [];
  return {
    v: 1,
    after: typeof raw?.after === "string" ? raw.after : "",
    done: raw?.done === true,
    seen: seen.filter((m): m is LegacyMember => {
      const x = m as Partial<LegacyMember> | null;
      return !!x && typeof x.storeId === "string" && typeof x.spreadsheetId === "string" && (x.connectedAt === null || typeof x.connectedAt === "number") && (x.holds === null || x.holds === "legacy");
    }),
  };
}

async function readState(): Promise<PassState> {
  const [row] = await db.select({ state: cronCursors.state }).from(cronCursors).where(eq(cronCursors.job, BIND_LEGACY_JOB)).limit(1);
  return stateOf(row?.state);
}

async function writeState(state: PassState): Promise<void> {
  // the runner owns `cursor` of this row (its round-robin cursor); the pass lives in `state`
  const value = state as unknown as Record<string, unknown>;
  await db.insert(cronCursors).values({ job: BIND_LEGACY_JOB, cursor: "", state: value, updatedAt: new Date() }).onDuplicateKeyUpdate({ set: { state: value, updatedAt: new Date() } });
}

/** Has the legacy pass finished? (cached in this process once it has: a finished pass never reopens by itself) */
export async function legacyPassDone(): Promise<boolean> {
  if (doneCache.get(PLATFORM, "done")) return true;
  const done = (await readState()).done;
  if (done) doneCache.set(PLATFORM, "done", true);
  return done;
}

/** Start the pass again (tests; a maintainer re-running it after restoring a backup). */
export async function resetLegacyPass(): Promise<void> {
  await writeState({ v: 1, after: "", done: false, seen: [] });
  doneCache.clear();
}

export interface BindLegacyReport {
  done: boolean;
  /** stores read by this tick */
  visited: number;
  /** spreadsheets bound, moved to an earlier store, and stores paused with binding_conflict (when the pass ended here) */
  bound: number;
  moved: number;
  conflicts: number;
  ms: number;
}

/** One store of the pass: a member when its setting names a spreadsheet it does not hold by a code proof. */
async function readMember(scope: StoreScope): Promise<LegacyMember | null> {
  const named = await namedSheet(scope);
  if (!named) return null;
  const holds = await ownBinding(scope, named.spreadsheetId);
  return holds === "code" ? null : { storeId: scope.storeId, spreadsheetId: named.spreadsheetId, connectedAt: named.connectedAt, holds };
}

/**
 * The end of the pass: every spreadsheet named by a recorded store is read again from each store's own scope (the
 * push may have bound one meanwhile), then the rule decides; a claim that fails (a store outside the group holds the
 * spreadsheet: a code proof) makes the winner a loser too.
 */
async function resolvePass(ctx: SystemCtx, seen: readonly LegacyMember[]): Promise<{ bound: number; moved: number; conflicts: number }> {
  const fresh: LegacyMember[] = [];
  for (const m of seen) {
    const scope = systemScope(ctx, m.storeId);
    const named = await namedSheet(scope);
    if (!named || named.spreadsheetId !== m.spreadsheetId) continue; // disconnected or moved to another sheet since
    fresh.push({ ...m, connectedAt: named.connectedAt, holds: await ownBinding(scope, named.spreadsheetId) });
  }
  let bound = 0;
  let moved = 0;
  let conflicts = 0;
  const now = new Date();
  for (const plan of legacyPlans(fresh)) {
    const losers = [...plan.losers];
    if (plan.release) {
      await releaseLegacy(systemScope(ctx, plan.release), plan.spreadsheetId);
      moved++;
    }
    if (plan.claim) {
      if (await claimLegacy(systemScope(ctx, plan.winner), plan.spreadsheetId, now)) bound++;
      else losers.push(plan.winner);
    }
    for (const id of losers) {
      await markBindingConflict(systemScope(ctx, id));
      conflicts++;
    }
  }
  return { bound, moved, conflicts };
}

/**
 * The `sheets.bind_legacy` slot (core §H.2 slot 7, ≤ 50 ms): a no-op once the pass is done; else it reads the next
 * stores of the pass until `budgetMs` is spent, and ends the pass (the rule, then `done`) once every store was read.
 * Counts only in the report.
 */
export async function runBindLegacyTick(ctx: SystemCtx, opts: { budgetMs: number; pageSize?: number }): Promise<BindLegacyReport> {
  const started = Date.now();
  const report: BindLegacyReport = { done: true, visited: 0, bound: 0, moved: 0, conflicts: 0, ms: 0 };
  const finish = () => ((report.ms = Date.now() - started), report);
  if (doneCache.get(PLATFORM, "done")) return finish();
  const state = await readState();
  if (state.done) {
    doneCache.set(PLATFORM, "done", true);
    return finish();
  }
  const deadline = started + Math.max(1, opts.budgetMs);
  const page = Math.max(1, Math.min(200, opts.pageSize ?? PAGE));
  let end = false;
  // one page at least: a tick whose budget went on reading the state still moves the pass on
  for (let first = true; first || Date.now() < deadline; first = false) {
    // the pass walks `stores` (the tenant root, no store_id) by id; each store is then read through its own scope
    const ids = await db
      .select({ id: stores.id })
      .from(stores)
      .where(state.after ? gt(stores.id, state.after) : undefined)
      .orderBy(asc(stores.id))
      .limit(page);
    for (const { id } of ids) {
      // at least one store per tick, so a slow database never stalls the pass
      if (Date.now() >= deadline && report.visited > 0) break;
      try {
        const m = await readMember(systemScope(ctx, id));
        if (m) state.seen = [...state.seen.filter((x) => x.storeId !== id), m];
      } catch (err) {
        console.error(`[sheets.bind_legacy] store ${id} skipped:`, errorSummary(err));
      }
      state.after = id;
      report.visited++;
    }
    if (ids.length < page && (ids.length === 0 || state.after === ids[ids.length - 1]!.id)) {
      end = true;
      break;
    }
  }
  // the walk ended with the budget spent on stores: the rule runs in the next tick (whose walk reads no store)
  if (!end || (Date.now() >= deadline && report.visited > 0)) {
    report.done = false;
    await writeState(state);
    return finish();
  }
  const r = await resolvePass(ctx, state.seen);
  await writeState({ v: 1, after: state.after, done: true, seen: [], at: new Date().toISOString(), ...r });
  doneCache.set(PLATFORM, "done", true);
  Object.assign(report, r, { done: true });
  return finish();
}

/** Forget this process's "done" (tests). */
export function forgetLegacyPass(): void {
  doneCache.clear();
}

/** The legacy pass as the job summary shows it (tests, the console). */
export async function legacyPassState(): Promise<Pick<PassState, "done" | "after"> & { seen: number }> {
  const s = await readState();
  return { done: s.done, after: s.after, seen: s.seen.length };
}

