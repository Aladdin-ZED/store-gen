import "server-only";
/**
 * The render queue's summaries (docs/STORE-SAAS.md §H.5, PLA-§15.1 "Render queue", PLA-§16.2, PLA Q.25; R1 P8 step 5):
 * the reads behind `renderSummary(scope)` (one store, every statement through its scope) and the platform-wide
 * variant (console code only; each statement annotated). ./rules.ts `summarize` turns the rows into the summary.
 *
 * Read, in six statements (seven platform-wide): counts by reason × state with the jobs finished in the last hour (the
 * throughput); the oldest pending job with its page's slug; the failed jobs by store and code, split at 24 h (the
 * failures of the day, and the old ones behind the render_failed_old alarm); the pages whose re-render left gate notes
 * in the last 7 days and the latest notes texts; the live pages whose version is runtime_v 1 (a re-render skips them:
 * they need a manual republish); platform-wide, the 20 stores with the most failed (then pending) jobs. Never a
 * document, an HTML byte or a customer value: ids, reasons, states, codes and counts.
 */
import { and, asc, desc, eq, gte, inArray, like, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { pageVersions, pages, renderJobs } from "@/lib/db/schema";
import { whereStore } from "@/lib/tenancy/sql";
import type { StoreScope } from "@/lib/tenancy/types";
import type { RenderReason, RenderState } from "../renders";
import { FAILED_WINDOW_MS, NOTES_PREFIX, NOTES_ROWS, NOTES_WINDOW_MS, REPUBLISH_LIST, THROUGHPUT_WINDOW_MS, TOP_STORES, type SummaryInput } from "./rules";

const COUNT = sql<number>`COUNT(*)`;
const FINISHED: readonly RenderState[] = ["done", "skipped", "failed"];

/** The windows of one summary, from `now`. */
function windows(now: number) {
  return { failedSince: new Date(now - FAILED_WINDOW_MS), hourSince: new Date(now - THROUGHPUT_WINDOW_MS), notesSince: new Date(now - NOTES_WINDOW_MS) };
}

/** jobs of a group finished since `at` (a pending or running job has no `done_at`: 0) */
const finishedSince = (at: Date) => sql<number>`COALESCE(SUM(${renderJobs.doneAt} >= ${at}), 0)`;

type CountRow = { reason: RenderReason; state: RenderState; n: number; hour: number };
type FailedRow = { storeId: string; error: string | null; n: number; recent: number };

/** The rows every summary shares, once the statements have run. */
function assemble(
  counts: readonly CountRow[],
  oldest: { storeId: string; pageId: string; reason: RenderReason; createdAt: Date; slug: string | null } | undefined,
  failed: readonly FailedRow[],
  notes: { n: number } | undefined,
  texts: readonly { error: string | null }[],
  republish: readonly { storeId: string | null; pageId: string }[],
): SummaryInput {
  return {
    counts: counts.map((c) => ({ reason: c.reason, state: c.state, n: Number(c.n) || 0 })),
    finished: counts.filter((c) => FINISHED.includes(c.state)).map((c) => ({ state: c.state, n: Number(c.hour) || 0 })),
    oldest: oldest ? { storeId: oldest.storeId, pageId: oldest.pageId, reason: oldest.reason, createdAt: oldest.createdAt, slug: oldest.slug ?? null } : null,
    failed: failed.filter((f) => Number(f.recent) > 0).map((f) => ({ storeId: f.storeId, error: f.error, n: Number(f.recent) })),
    failedOld: failed.reduce((n, f) => n + Math.max(0, (Number(f.n) || 0) - (Number(f.recent) || 0)), 0),
    notesPages: Number(notes?.n ?? 0),
    notesTexts: texts.map((t) => t.error),
    republish: republish.filter((p): p is { storeId: string; pageId: string } => typeof p.storeId === "string").map((p) => ({ storeId: p.storeId, pageId: p.pageId })),
  };
}

/** One store's summary rows; `reason` narrows every read to one reason. */
export async function storeSummaryInput(scope: StoreScope, now: number, reason?: RenderReason): Promise<SummaryInput> {
  const w = windows(now);
  const r = reason ? eq(renderJobs.reason, reason) : undefined;
  const counts = await db
    .select({ reason: renderJobs.reason, state: renderJobs.state, n: COUNT, hour: finishedSince(w.hourSince) })
    .from(renderJobs)
    .where(whereStore(renderJobs, scope, r))
    .groupBy(renderJobs.reason, renderJobs.state);
  const [oldest] = await db
    .select({ storeId: renderJobs.storeId, pageId: renderJobs.pageId, reason: renderJobs.reason, createdAt: renderJobs.createdAt, slug: pages.slug })
    .from(renderJobs)
    .leftJoin(pages, and(eq(pages.id, renderJobs.pageId), eq(pages.storeId, renderJobs.storeId)))
    .where(whereStore(renderJobs, scope, eq(renderJobs.state, "pending"), r))
    .orderBy(asc(renderJobs.createdAt), asc(renderJobs.id))
    .limit(1);
  const failed = await db
    .select({ storeId: renderJobs.storeId, error: renderJobs.error, n: COUNT, recent: finishedSince(w.failedSince) })
    .from(renderJobs)
    .where(whereStore(renderJobs, scope, eq(renderJobs.state, "failed"), r))
    .groupBy(renderJobs.storeId, renderJobs.error);
  const [notes] = await db
    .select({ n: sql<number>`COUNT(DISTINCT ${renderJobs.pageId})` })
    .from(renderJobs)
    .where(whereStore(renderJobs, scope, eq(renderJobs.state, "done"), like(renderJobs.error, `${NOTES_PREFIX}%`), gte(renderJobs.doneAt, w.notesSince), r));
  const texts = await db
    .select({ error: renderJobs.error })
    .from(renderJobs)
    .where(whereStore(renderJobs, scope, eq(renderJobs.state, "done"), like(renderJobs.error, `${NOTES_PREFIX}%`), gte(renderJobs.doneAt, w.notesSince), r))
    .orderBy(desc(renderJobs.doneAt))
    .limit(NOTES_ROWS);
  const republish = await db
    .select({ storeId: pages.storeId, pageId: pages.id })
    .from(pages)
    .innerJoin(pageVersions, and(eq(pageVersions.id, pages.publishedVersionId), eq(pageVersions.storeId, pages.storeId)))
    .where(whereStore(pages, scope, eq(pages.status, "published"), eq(pageVersions.runtimeV, 1)))
    .orderBy(asc(pages.id))
    .limit(REPUBLISH_LIST);
  return assemble(counts, oldest, failed, notes, texts, republish);
}

/** Every store's summary rows (console code only: `getHealth()`, the System health and Domains views). */
export async function platformSummaryInput(now: number, reason?: RenderReason): Promise<SummaryInput & { stores: { storeId: string; failed: number; pending: number }[] }> {
  const w = windows(now);
  const r = reason ? eq(renderJobs.reason, reason) : undefined;
  const counts = await db
    .select({ reason: renderJobs.reason, state: renderJobs.state, n: COUNT, hour: finishedSince(w.hourSince) })
    .from(renderJobs) // tenancy: platform the render queue's depth by reason × state and the last hour's throughput, every store (§H.5, PLA-§15.1)
    .where(r)
    .groupBy(renderJobs.reason, renderJobs.state);
  const [oldest] = await db
    .select({ storeId: renderJobs.storeId, pageId: renderJobs.pageId, reason: renderJobs.reason, createdAt: renderJobs.createdAt, slug: pages.slug })
    .from(renderJobs) // tenancy: platform the oldest pending job of any store and its page's slug in that store (the render_stuck alarm)
    .leftJoin(pages, and(eq(pages.id, renderJobs.pageId), eq(pages.storeId, renderJobs.storeId)))
    .where(and(eq(renderJobs.state, "pending"), r))
    .orderBy(asc(renderJobs.createdAt), asc(renderJobs.id))
    .limit(1);
  const failed = await db
    .select({ storeId: renderJobs.storeId, error: renderJobs.error, n: COUNT, recent: finishedSince(w.failedSince) })
    .from(renderJobs) // tenancy: platform failed jobs by store and code, split at 24 h (PLA-§15.1 Retry per store, render_failed_old)
    .where(and(eq(renderJobs.state, "failed"), r))
    .groupBy(renderJobs.storeId, renderJobs.error);
  const [notes] = await db
    .select({ n: sql<number>`COUNT(DISTINCT ${renderJobs.pageId})` })
    .from(renderJobs) // tenancy: platform pages whose re-render left gate notes in 7 days, every store (a count)
    .where(and(eq(renderJobs.state, "done"), like(renderJobs.error, `${NOTES_PREFIX}%`), gte(renderJobs.doneAt, w.notesSince), r));
  const texts = await db
    .select({ error: renderJobs.error })
    .from(renderJobs) // tenancy: platform the latest notes texts (gate item ids only) for the top 3
    .where(and(eq(renderJobs.state, "done"), like(renderJobs.error, `${NOTES_PREFIX}%`), gte(renderJobs.doneAt, w.notesSince), r))
    .orderBy(desc(renderJobs.doneAt))
    .limit(NOTES_ROWS);
  const republish = await db
    .select({ storeId: pages.storeId, pageId: pages.id })
    .from(pages) // tenancy: platform live pages on a runtime_v 1 version, every store (listed for a manual republish)
    .innerJoin(pageVersions, and(eq(pageVersions.id, pages.publishedVersionId), eq(pageVersions.storeId, pages.storeId)))
    .where(and(eq(pages.status, "published"), eq(pageVersions.runtimeV, 1)))
    .orderBy(asc(pages.storeId), asc(pages.id))
    .limit(REPUBLISH_LIST);
  const failedN = sql<number>`SUM(${renderJobs.state} = 'failed')`;
  const pendingN = sql<number>`SUM(${renderJobs.state} = 'pending')`;
  const stores = await db
    .select({ storeId: renderJobs.storeId, failed: failedN, pending: pendingN })
    .from(renderJobs) // tenancy: platform the 20 stores with the most failed (then pending) jobs (PLA-§16.2)
    .where(and(inArray(renderJobs.state, ["failed", "pending"]), r))
    .groupBy(renderJobs.storeId)
    .orderBy(desc(failedN), desc(pendingN), asc(renderJobs.storeId))
    .limit(TOP_STORES);
  return {
    ...assemble(counts, oldest, failed, notes, texts, republish),
    stores: stores.map((s) => ({ storeId: s.storeId, failed: Number(s.failed) || 0, pending: Number(s.pending) || 0 })),
  };
}
