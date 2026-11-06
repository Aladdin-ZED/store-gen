/**
 * Jobs of the design track (P6 DESIGN; design.md DES-§7.5, DES-§2.1, DES-§23.2, DES-§24.1; docs/STORE-SAAS.md §H.2).
 * Extension file (§K.3) imported by src/lib/jobs/registry.ts.
 *
 *  - `design.reserve` (every tick, 2 s): the two DES-§7.5 statements, the only cross-store writes of the track
 *    (annotated `tenancy: platform design-reserve`): (1) the store-status reconcile, both ways in one statement over the
 *    stores whose status changed in the last 7 days (a store that left active / restricted: its live rows leave live
 *    for 90 days from the change; a store that came back: the rows of its currently published pages are live again);
 *    (2) the pool expiry of reservations that ran out (≤ 2,000 rows a tick). Both touch only live, pool,
 *    reserved_until and updated_at. Older status changes are covered per store by the retention (down) and the
 *    backfill (up).
 *  - `design.backfill` (every tick until done, 2 s): per store round-robin (the cursor in cron_cursors), ≤ 50 pages a
 *    tick: a published page without a live genome row gets back the row of its current version, else a `derived` row
 *    from `genomeOf(doc)`; then `syncShingles` for the niches touched. Idempotent.
 *  - `design.retention` (daily 03:50, 5 s a tick until done): DES-§2.1 ages and the 600-row cap per store; a store
 *    that is not active / restricted has its live rows reserved again (the safety net of the reconcile).
 *  - `design.shingles` (daily 04:10, 3 s): each live store's sketches against its live pages, drifted niches rewritten.
 */
import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { genomeOf } from "@/lib/design/derive";
import { distanceView } from "@/lib/design/distance";
import { gateInputFor } from "@/lib/design/gate-input";
import { runGates, summarize } from "@/lib/design/gates";
import { recordPublished, reserveStoreRows, retainGenomes, pagesWithoutLiveRow, reviveVersionRow } from "@/lib/design/genomes.server";
import { NO_LOOK_PRIORS } from "@/lib/design/health.server";
import { docNiche, storeNicheOf, syncShingles, verifyShingles } from "@/lib/design/headlines.server";
import type { PageDoc } from "@/lib/page/schema";
import { buildTheme } from "@/lib/theme";
import type { StoreStatus, WriteScope } from "@/lib/tenancy/types";
import type { Job, JobCtx, JobResult } from "../runner";
import { forEachStore, systemScope } from "../scope";

/** Pages the backfill writes per tick, over every store (DES-§23.2). */
export const BACKFILL_PAGES_PER_TICK = 50;
/** Pool rows the expiry releases per statement (DES-§7.5). */
export const EXPIRY_LIMIT = 2_000;
/** The reconcile reads stores whose status changed within this window (older changes: retention and backfill). */
export const RECONCILE_DAYS = 7;

const LIVE_STATES: readonly StoreStatus[] = ["active", "restricted"];
const RETAIN_STATES: readonly StoreStatus[] = ["pending", "active", "restricted", "suspended", "closed", "scheduled_deletion", "rejected"];

const affected = (res: unknown) => Number((Array.isArray(res) ? (res[0] as { affectedRows?: number }) : (res as { affectedRows?: number }))?.affectedRows ?? 0);
const left = (ctx: Pick<JobCtx, "deadline">, cap: number) => Math.max(1, Math.min(cap, ctx.deadline - Date.now()));

/* ------------------------------------------------------------------ */
/* design.reserve                                                      */
/* ------------------------------------------------------------------ */

/** DES-§7.5: the store-status reconcile (both ways) and the pool expiry. Returns the rows each statement changed. */
export async function reserveTick(): Promise<{ reconciled: number; expired: number }> {
  // tenancy: platform design-reserve (DES-§7.5, DES-R9): live / pool / reserved_until of stores whose status changed
  const reconciled = await db.execute(sql`
    UPDATE design_genomes dg
    JOIN stores s ON s.id = dg.store_id
    LEFT JOIN pages p ON p.id = dg.page_id AND p.store_id = dg.store_id
    SET dg.live = IF(s.status IN ('active', 'restricted'), 1, 0),
        dg.pool = 1,
        dg.reserved_until = IF(s.status IN ('active', 'restricted'), NULL, COALESCE(s.status_changed_at, UTC_TIMESTAMP(3)) + INTERVAL 90 DAY),
        dg.updated_at = UTC_TIMESTAMP(3)
    WHERE s.status_changed_at >= UTC_TIMESTAMP(3) - INTERVAL ${RECONCILE_DAYS} DAY
      AND ((dg.live = 1 AND s.status NOT IN ('active', 'restricted'))
        OR (dg.live = 0 AND s.status IN ('active', 'restricted') AND dg.kind = 'page' AND dg.source IN ('published', 'derived')
            AND p.status = 'published' AND dg.version_id = p.published_version_id))`);
  // tenancy: platform design-reserve (DES-§7.5): reservations that ran out leave the novelty pool
  const expired = await db.execute(sql`
    UPDATE design_genomes SET pool = 0, updated_at = UTC_TIMESTAMP(3)
    WHERE pool = 1 AND live = 0 AND reserved_until < UTC_TIMESTAMP(3)
    LIMIT ${EXPIRY_LIMIT}`);
  return { reconciled: affected(reconciled), expired: affected(expired) };
}

/* ------------------------------------------------------------------ */
/* design.backfill                                                     */
/* ------------------------------------------------------------------ */

/** The `derived` row inputs of a published doc (DES-§23.2): its genome, view, gate summary and niche. */
function derivedOf(doc: PageDoc, store: { market: string; category: string | null }) {
  const read = genomeOf(doc);
  const genome = doc.theme.look ? read : { ...read, priorsV: NO_LOOK_PRIORS };
  const theme = buildTheme(doc.theme, doc.locale);
  const report = runGates(gateInputFor(doc, { kind: "landing", theme, look: doc.theme.look ?? null, assets: new Map(), locale: doc.locale, context: "publish", origin: new Map(), facts: { facts: [], productName: doc.product.name ?? null }, ownerProof: false }));
  return { genome, view: distanceView(read, { theme: doc.theme }, doc.locale), q: report.q, slop: report.slop.score, report: summarize(report), niche: docNiche(doc, store) };
}

/** One store's backfill: at most `budget` pages. Returns the pages done and whether work is left. */
export async function backfillStore(scope: WriteScope, budget: number): Promise<{ done: number; more: boolean }> {
  if (budget <= 0) return { done: 0, more: (await pagesWithoutLiveRow(scope, 1)).length > 0 };
  const work = await pagesWithoutLiveRow(scope, budget + 1);
  if (!work.length) return { done: 0, more: false };
  const facts = await storeNicheOf(scope);
  const niches = new Set<string>();
  let done = 0;
  for (const p of work.slice(0, budget)) {
    if (!(await reviveVersionRow(scope, p.pageId, p.versionId))) {
      const d = derivedOf(p.doc, facts);
      await recordPublished(scope, { pageId: p.pageId, versionId: p.versionId, niche: d.niche, genome: d.genome, view: d.view, q: d.q, slop: d.slop, report: d.report }, "derived");
      niches.add(d.niche);
    } else niches.add(docNiche(p.doc, facts));
    done++;
  }
  for (const niche of niches) await syncShingles(scope, niche);
  return { done, more: work.length > budget };
}

async function backfillTick(ctx: JobCtx): Promise<JobResult> {
  let quota = BACKFILL_PAGES_PER_TICK;
  let more = false;
  let pages = 0;
  const r = await forEachStore(ctx, { job: ctx.job, states: LIVE_STATES, budgetMs: left(ctx, 2_000) }, async (_scope, store) => {
    const res = await backfillStore(systemScope(ctx, store.id), quota);
    quota -= res.done;
    pages += res.done;
    more ||= res.more;
  });
  return { done: r.done && !more, summary: { stores: r.visited, pages } };
}

/* ------------------------------------------------------------------ */
/* design.retention and design.shingles                                */
/* ------------------------------------------------------------------ */

async function retentionTick(ctx: JobCtx): Promise<JobResult> {
  let deleted = 0;
  let reserved = 0;
  const r = await forEachStore(ctx, { job: ctx.job, states: RETAIN_STATES, budgetMs: left(ctx, 5_000) }, async (_scope, store) => {
    const w = systemScope(ctx, store.id);
    if (!LIVE_STATES.includes(store.status)) reserved += await reserveStoreRows(w);
    deleted += await retainGenomes(w);
  });
  return { done: r.done, summary: { stores: r.visited, deleted, reserved } };
}

async function shinglesTick(ctx: JobCtx): Promise<JobResult> {
  let rewritten = 0;
  const r = await forEachStore(ctx, { job: ctx.job, states: LIVE_STATES, budgetMs: left(ctx, 3_000) }, async (_scope, store) => {
    rewritten += await verifyShingles(systemScope(ctx, store.id));
  });
  return { done: r.done, summary: { stores: r.visited, rewritten } };
}

export const jobs: Job[] = [
  {
    name: "design.reserve",
    every: "tick",
    budgetMs: 2_000,
    async run() {
      const r = await reserveTick();
      return { done: true, summary: r };
    },
  },
  { name: "design.backfill", every: "tick", budgetMs: 2_000, run: backfillTick },
  { name: "design.retention", every: { dailyAt: "03:50" }, budgetMs: 5_000, run: retentionTick },
  { name: "design.shingles", every: { dailyAt: "04:10" }, budgetMs: 3_000, run: shinglesTick },
];
