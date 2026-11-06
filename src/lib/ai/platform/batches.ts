import "server-only";
/**
 * The Message Batches collector's platform statements (P7 AI; ai.md AI-§B.8, AI-§M.2, AI-§N `ai.batches`;
 * docs/STORE-SAAS.md §H.2 slot 4b, D64). `ai_batches` is a P table; `ai_batch_items` is "P (opt. store)": a store item
 * carries its store, a platform eval item NULL, and one batch mixes items of many stores (one model per batch). The
 * cross-store reads and writes of that queue live here, each annotated and counted in the `src/lib/ai/platform/**`
 * pin (CCR r1-p7-8); a store item is inserted through its own scope (../batch/queue.ts).
 */
import { and, asc, count, eq, inArray, isNotNull, isNull, lt, min, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { aiBatchItems, aiBatches } from "@/lib/db/schema";

export type BatchItemRow = typeof aiBatchItems.$inferSelect;
export type BatchRow = typeof aiBatches.$inferSelect;
export type BatchItemState = BatchItemRow["state"];
export type BatchKind = BatchRow["kind"];

/** Item states that end an item (its dedupe is NULL from then on). */
export const ITEM_TERMINAL: readonly BatchItemState[] = ["ingested", "dropped", "refused"];

export interface PlatformItem {
  id: string;
  task: string;
  refKind: string;
  refId: string;
  dedupe: string;
  payload: string;
  promptVersion: string;
  model: string;
  reservedCredits: number;
  evalRunId: string | null;
  now: Date;
}

/** A platform eval item (no store); a duplicate dedupe answers the queued item's id. */
export async function insertPlatformItem(it: PlatformItem): Promise<{ id: string; deduped: boolean }> {
  try {
    // tenancy: platform ai_batch_items platform eval item: store_id NULL by definition (AI-§M.2), no store data
    await db.insert(aiBatchItems).values({ id: it.id, storeId: null, task: it.task, refKind: it.refKind, refId: it.refId, dedupe: it.dedupe, payload: it.payload, promptVersion: it.promptVersion, model: it.model, state: "queued", reservedCredits: it.reservedCredits, evalRunId: it.evalRunId, createdAt: it.now, updatedAt: it.now });
    return { id: it.id, deduped: false };
  } catch (err) {
    if ((err as { errno?: number; cause?: { errno?: number } }).errno !== 1062 && (err as { cause?: { errno?: number } }).cause?.errno !== 1062) throw err;
    const prev = await itemByDedupe(it.dedupe);
    if (!prev) throw err;
    return { id: prev, deduped: true };
  }
}

/** The non-terminal item holding a dedupe key. */
export async function itemByDedupe(dedupe: string): Promise<string | null> {
  // tenancy: platform ai_batch_items dedupe lookup: the key is a sha256 over task, ref, input and version (AI-§B.8)
  const [row] = await db.select({ id: aiBatchItems.id }).from(aiBatchItems).where(eq(aiBatchItems.dedupe, dedupe)).limit(1);
  return row?.id ?? null;
}

/** What the submit rule reads (AI-§B.8 step 3): queued items per model, the oldest, and whether an eval or a job waits. */
export interface QueuedSummary {
  model: string;
  queued: number;
  oldest: Date | null;
  /** an eval run or a job stage is waiting on this model */
  urgent: boolean;
}

export async function queuedSummary(): Promise<QueuedSummary[]> {
  // tenancy: platform ai_batch_items queue counts per model across stores (the collector mixes stores in one batch)
  const rows = await db
    .select({
      model: aiBatchItems.model,
      queued: count(),
      oldest: min(aiBatchItems.createdAt),
      urgent: sql<number>`SUM(${aiBatchItems.refKind} IN ('eval', 'eval_judge', 'job'))`,
    })
    .from(aiBatchItems)
    .where(eq(aiBatchItems.state, "queued"))
    .groupBy(aiBatchItems.model);
  return rows.map((r) => ({ model: r.model, queued: Number(r.queued), oldest: r.oldest ? new Date(r.oldest) : null, urgent: Number(r.urgent ?? 0) > 0 }));
}

/** The oldest queued items of one model (≤ limit), across stores. */
export async function takeQueued(model: string, limit: number): Promise<BatchItemRow[]> {
  // tenancy: platform ai_batch_items the next batch of one model, items of many stores (AI-§B.8)
  return db.select().from(aiBatchItems).where(and(eq(aiBatchItems.state, "queued"), eq(aiBatchItems.model, model))).orderBy(asc(aiBatchItems.createdAt)).limit(limit);
}

export async function insertBatch(b: { id: string; kind: BatchKind; model: string; items: number; now: Date }): Promise<void> {
  // ai_batches is a P table (no store column): the batch row
  await db.insert(aiBatches).values({ id: b.id, kind: b.kind, model: b.model, status: "building", items: b.items, createdAt: b.now });
}

export async function updateBatch(id: string, set: Partial<Omit<BatchRow, "id" | "createdAt">>): Promise<void> {
  // ai_batches is a P table (no store column)
  await db.update(aiBatches).set(set).where(eq(aiBatches.id, id));
}

/** The items a submitted batch holds: state `submitted`, the batch id, one more attempt. */
export async function markSubmitted(ids: readonly string[], batchId: string, now: Date): Promise<void> {
  if (!ids.length) return;
  // tenancy: platform ai_batch_items the items of one submitted batch (their ids came from takeQueued)
  await db
    .update(aiBatchItems)
    .set({ state: "submitted", batchId, attempts: sql`${aiBatchItems.attempts} + 1`, updatedAt: now })
    .where(and(inArray(aiBatchItems.id, [...ids]), eq(aiBatchItems.state, "queued")));
}

/** Items back to the queue when a batch could not be created (nothing was submitted). */
export async function unmarkSubmitted(batchId: string, now: Date): Promise<void> {
  // tenancy: platform ai_batch_items a batch the API refused: its items wait for the next tick
  await db.update(aiBatchItems).set({ state: "queued", batchId: null, attempts: sql`GREATEST(${aiBatchItems.attempts} - 1, 0)`, updatedAt: now }).where(and(eq(aiBatchItems.batchId, batchId), eq(aiBatchItems.state, "submitted")));
}

/** Open batches (submitted, in progress, canceling), and ended ones not fully ingested, oldest first. */
export async function openBatches(): Promise<BatchRow[]> {
  // ai_batches is a P table (no store column)
  return db
    .select()
    .from(aiBatches)
    .where(sql`${aiBatches.status} IN ('submitted', 'in_progress', 'canceling') OR (${aiBatches.status} IN ('ended', 'expired') AND ${aiBatches.ingestedAt} IS NULL)`)
    .orderBy(asc(aiBatches.createdAt))
    .limit(20);
}

/** One item by id, whatever its store (the ingest reads `custom_id = "i_" + id` before it knows the store). */
export async function itemById(id: string): Promise<BatchItemRow | null> {
  // tenancy: platform ai_batch_items an ingested result names its item by id only; the store is read from the row
  const [row] = await db.select().from(aiBatchItems).where(eq(aiBatchItems.id, id)).limit(1);
  return row ?? null;
}

/**
 * One item's next state, only from the state the ingest read (idempotent: a second ingest of the same result
 * finds the item terminal and writes nothing). A terminal state clears the dedupe.
 */
export async function setItemState(id: string, from: BatchItemState, to: BatchItemState, now: Date, extra: { runId?: string | null; batchId?: string | null } = {}): Promise<boolean> {
  const terminal = ITEM_TERMINAL.includes(to);
  // tenancy: platform ai_batch_items the ingest's compare-and-set on one item by id (its store was read with it)
  const [res] = await db
    .update(aiBatchItems)
    .set({ state: to, updatedAt: now, ...(terminal ? { dedupe: null } : {}), ...(extra.runId !== undefined ? { runId: extra.runId } : {}), ...(extra.batchId !== undefined ? { batchId: extra.batchId } : {}) })
    .where(and(eq(aiBatchItems.id, id), eq(aiBatchItems.state, from)));
  return (res as { affectedRows?: number }).affectedRows === 1;
}

/** Items of a batch not yet terminal (0 → the batch is fully ingested). */
export async function itemsLeft(batchId: string): Promise<number> {
  // tenancy: platform ai_batch_items items of one batch still to ingest
  const [row] = await db
    .select({ n: count() })
    .from(aiBatchItems)
    .where(and(eq(aiBatchItems.batchId, batchId), sql`${aiBatchItems.state} NOT IN ('ingested', 'dropped', 'refused')`));
  return Number(row?.n ?? 0);
}

/** The job stages riding in open batches (`ref_kind = 'job'`): their jobs' heartbeats are refreshed by ai.batches. */
export async function jobItemsInFlight(): Promise<{ storeId: string; refId: string }[]> {
  // tenancy: platform ai_batch_items job stages in flight across stores; each heartbeat is written through its store's scope
  const rows = await db
    .select({ storeId: aiBatchItems.storeId, refId: aiBatchItems.refId })
    .from(aiBatchItems)
    .where(and(eq(aiBatchItems.refKind, "job"), inArray(aiBatchItems.state, ["queued", "submitted"]), isNotNull(aiBatchItems.storeId)))
    .limit(200);
  return rows.flatMap((r) => (r.storeId ? [{ storeId: r.storeId, refId: r.refId }] : []));
}

/** Retention (core §H.11): items ingested or dropped more than 30 days ago, in slices. */
export async function purgeOldItems(before: Date, limit: number): Promise<number> {
  // tenancy: platform ai_batch_items retention across stores (core §H.11: 30 days after ingest or drop)
  const [res] = await db.delete(aiBatchItems).where(and(inArray(aiBatchItems.state, [...ITEM_TERMINAL]), lt(aiBatchItems.updatedAt, before))).limit(limit);
  return (res as { affectedRows?: number }).affectedRows ?? 0;
}

/** A platform item's result recorded in its payload (the eval run scores them all at the end), with its next state. */
export async function finishPlatformItem(id: string, from: BatchItemState, to: BatchItemState, payload: string, now: Date): Promise<boolean> {
  const terminal = ITEM_TERMINAL.includes(to);
  // tenancy: platform ai_batch_items a platform eval item (store_id NULL): its own result, by id
  const [res] = await db
    .update(aiBatchItems)
    .set({ state: to, payload, updatedAt: now, ...(terminal ? { dedupe: null } : {}) })
    .where(and(eq(aiBatchItems.id, id), eq(aiBatchItems.state, from), isNull(aiBatchItems.storeId)));
  return (res as { affectedRows?: number }).affectedRows === 1;
}

/** Every item of one eval run of a kind (`eval` candidates, `eval_judge` judgements), with its payload. */
export async function evalItems(evalRunId: string, refKind: "eval" | "eval_judge"): Promise<BatchItemRow[]> {
  // tenancy: platform ai_batch_items platform eval items (store_id NULL) of one eval run
  return db.select().from(aiBatchItems).where(and(eq(aiBatchItems.evalRunId, evalRunId), eq(aiBatchItems.refKind, refKind), isNull(aiBatchItems.storeId))).orderBy(asc(aiBatchItems.createdAt));
}

/** Queued items that could not be built at submit time (`errored` with no batch): the ingest settles them. */
export async function unbuiltItems(limit: number): Promise<BatchItemRow[]> {
  // tenancy: platform ai_batch_items items the submit dropped (their store gone, their prompt retired), across stores
  return db.select().from(aiBatchItems).where(and(eq(aiBatchItems.state, "errored"), isNull(aiBatchItems.batchId))).limit(limit);
}

/** The stores whose own items a batch held (not job stages, not eval items), with how many were ingested. */
export async function storesOfBatch(batchId: string): Promise<{ storeId: string; n: number }[]> {
  // tenancy: platform ai_batch_items per-store counts of one batch (the ai.batch_done notification of each store)
  const rows = await db
    .select({ storeId: aiBatchItems.storeId, n: count() })
    .from(aiBatchItems)
    .where(and(eq(aiBatchItems.batchId, batchId), isNotNull(aiBatchItems.storeId), eq(aiBatchItems.state, "ingested"), sql`${aiBatchItems.refKind} <> 'job'`))
    .groupBy(aiBatchItems.storeId);
  return rows.flatMap((r) => (r.storeId ? [{ storeId: r.storeId, n: Number(r.n) }] : []));
}
