import "server-only";
/**
 * The Sheets pull (P5 INTEGRATIONS; operations.md OPE-§19.6, §19.4 rev 3, OPE-§J `sheets.pull`; OD2, OD5, OD54, OD55;
 * core §E.8 `s:<sid>:sheets:pull`). The pull has no read of its own: it rides on the push's one read
 * (./push.ts `pushStore`), which widens to the pulled optional columns when the pull is due, and the planner
 * (./plan.ts `pullDecisions`, pure) turns the rows into decisions. This file holds what the runner does with them:
 *
 *   await pullDue(scope)                                   the store's window (1 per 290 s) is open
 *   await selectPullOrders(scope, ids, noteIds)            the store's own synced orders of the ids read (whereStore)
 *   await applyPullDecisions(scope, decisions, ctx)        status first, then the sheet label, Agent, Note, Tracking, Transporteur
 *
 * - Column C: `applyExternalStatus(scope, id, { legacy }, { kind: "sheet", ref: "row:<n>", agentLabel })` (P4), then
 *   the `sheet_label` / `sheet_dirty` bookkeeping of `statusBookkeeping` (an implied path, a noop or a refusal gets
 *   `sheet_dirty |= 1`, so the app's label goes back to the cell, OD5). After a changed confirmation P5 also writes
 *   the attribution as plain columns, only while nobody is credited (`confirmed_by IS NULL`).
 * - "Agent" on an order already confirmed, nobody credited: `confirmed_by_label` (+ `confirmed_by` when
 *   `ops.agentLabels` maps it; read-only use of P4's key). "Note agent": a `note` event (actor `sheet`, meta
 *   `agentLabel`, `cellHash`). "Tracking": the `packed` move pre-ship, a `tracking_set` event, then `tracking_ref`
 *   (a cleared cell never clears it). "Transporteur": `carrier_label`.
 * - Every write is `whereStore` with `is_test = 0`: an id the read found that is not this store's order (another
 *   store's order typed into the sheet, SHT-05) was never selected, so it gets no decision at all.
 * - Until P4 merges, `applyExternalStatus` and `appendOrderEvent` are P0 stubs that throw "not implemented". A status
 *   cell then takes the R1.0 path (the status and `sheet_label` written as R1.0's pull did), so a store's status pull
 *   never stops between the two merges; the note, the tracking and their moves wait in the sheet (the decision is made
 *   again on the next pull) and land once P4's bodies are in. That fallback goes at the R1 integration.
 */
import { desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { affected } from "@/lib/admin-data/store-audit";
import { db } from "@/lib/db/client";
import { orderEvents, orders } from "@/lib/db/schema";
import type { OrderStatus } from "@/lib/orders/contract";
import { appendOrderEvent as appendOrderEventP4, type AppendOrderEventResult } from "@/lib/orders/events";
import { errorSummary } from "@/lib/orders/log";
import { applyExternalStatus as applyExternalStatusP4 } from "@/lib/orders/transition";
import { rateLimit, rateLimitReached, storeBucket } from "@/lib/security/rate-limit";
import { whereStore } from "@/lib/tenancy/sql";
import type { StoreScope, WriteScope } from "@/lib/tenancy/types";
import { agentMember, statusBookkeeping, type ExternalAnswer, type PullDecision, type PullOrder } from "./plan";

/** `s:<sid>:sheets:pull`: one full pull per store per 290 s (core §E.8, SHT-06) */
export const PULL_BUCKET = { name: "sheets:pull", limit: 1, windowSec: 290 } as const;
/** ids per `IN (…)` of the pull's reads */
const CHUNK = 1_000;
/** an order id as `orders.id` can hold it */
const ID_MAX = 20;
const ALL_BITS = 7;

const pullBucket = (scope: StoreScope) => storeBucket(scope, PULL_BUCKET.name);

/** The store's pull window is open (no full pull in the last 290 s); takes nothing. */
export async function pullDue(scope: StoreScope): Promise<boolean> {
  return !(await rateLimitReached(pullBucket(scope), PULL_BUCKET.limit));
}

/** Take the store's pull window (false: another run took it first). */
export async function takePullToken(scope: StoreScope): Promise<boolean> {
  return (await rateLimit(pullBucket(scope), PULL_BUCKET.limit, PULL_BUCKET.windowSec)).ok;
}

/* ------------------------------------------------------------------ */
/* P4's API, and the test double                                       */
/* ------------------------------------------------------------------ */

/** The two calls of P4's the pull makes (frozen signatures, src/lib/contracts/r1-p0.ts). */
export interface PullDeps {
  applyExternalStatus: typeof applyExternalStatusP4;
  appendOrderEvent: typeof appendOrderEventP4;
}

// one double per module instance (test:integrations-db loads this module once); never set in a server
let pullDouble: Partial<PullDeps> | null = null;

/**
 * Replace P4's calls with spies (test:integrations-db: the calls, their refs and the bookkeeping, before P4's bodies
 * exist). Refused under NODE_ENV=production, and a double set before is ignored there.
 */
export function setPullDoubleForTests(double: Partial<PullDeps> | null): void {
  if (process.env.NODE_ENV === "production") throw new Error("sheets: the pull test double is refused in production");
  pullDouble = double;
}

function deps(): PullDeps {
  const d = process.env.NODE_ENV === "production" ? null : pullDouble;
  return { applyExternalStatus: d?.applyExternalStatus ?? applyExternalStatusP4, appendOrderEvent: d?.appendOrderEvent ?? appendOrderEventP4 };
}

/** A P0 stub of another track ("not implemented: P4 …"): the call is not available yet, never an error to log. */
export const notImplemented = (err: unknown): boolean => err instanceof Error && /^not implemented: P4\b/.test(err.message);

/* ------------------------------------------------------------------ */
/* the orders of the rows read                                         */
/* ------------------------------------------------------------------ */

/** What the pull reads of an order (`PullOrder`); never a customer field. */
const PULL_COLUMNS = {
  id: orders.id,
  isTest: orders.isTest,
  sheetStatus: orders.sheetStatus,
  sheetLabel: orders.sheetLabel,
  sheetDirty: orders.sheetDirty,
  status: orders.status,
  confirmState: orders.confirmState,
  shipState: orders.shipState,
  confirmedBy: orders.confirmedBy,
  confirmedByLabel: orders.confirmedByLabel,
  trackingRef: orders.trackingRef,
  carrierLabel: orders.carrierLabel,
};

function chunks<T>(items: readonly T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * The `meta.cellHash` of each order's last `note` event of actor `sheet` (the "Note agent" dedupe key), for the ids
 * whose row carries a note. An order with no such event is absent.
 */
export async function sheetNoteHashes(scope: StoreScope, ids: readonly string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const part of chunks([...new Set(ids)])) {
    const rows = await db
      .select({ orderId: orderEvents.orderId, meta: orderEvents.meta })
      .from(orderEvents)
      .where(whereStore(orderEvents, scope, inArray(orderEvents.orderId, part), eq(orderEvents.type, "note"), eq(orderEvents.actorKind, "sheet")))
      .orderBy(desc(orderEvents.id));
    for (const r of rows) {
      if (out.has(r.orderId)) continue;
      const hash = r.meta && typeof r.meta.cellHash === "string" ? r.meta.cellHash : null;
      if (hash) out.set(r.orderId, hash);
    }
  }
  return out;
}

/**
 * The store's own synced, non-test orders among `ids` (an id of another store, of a test order or of nothing is simply
 * absent), with `lastSheetNoteHash` filled for the ids of `noteIds` (the rows whose "Note agent" cell is not empty).
 */
export async function selectPullOrders(scope: StoreScope, ids: readonly string[], noteIds: ReadonlySet<string> = new Set()): Promise<PullOrder[]> {
  const wanted = [...new Set(ids.filter((id) => id.length > 0 && id.length <= ID_MAX))];
  const out: PullOrder[] = [];
  for (const part of chunks(wanted)) {
    out.push(...(await db.select(PULL_COLUMNS).from(orders).where(whereStore(orders, scope, inArray(orders.id, part), eq(orders.isTest, false), eq(orders.sheetStatus, "synced")))));
  }
  const notes = noteIds.size ? await sheetNoteHashes(scope, out.filter((o) => noteIds.has(o.id)).map((o) => o.id)) : new Map<string, string>();
  return out.map((o) => (noteIds.has(o.id) ? { ...o, lastSheetNoteHash: notes.get(o.id) ?? null } : o));
}

/* ------------------------------------------------------------------ */
/* applying the decisions                                              */
/* ------------------------------------------------------------------ */

export interface PullApplied {
  /** orders the pull changed: a status move, a recorded sheet label, an attribution, a note, a tracking, a carrier */
  pulled: number;
  /** decisions left in the sheet for the next pull (P4's call not available yet, or a failure) */
  deferred: number;
  /** status cells the next push rewrites with the app's label (an implied path, a noop, a refusal: OD5) */
  writeBack: number;
  /** status cells applied by the R1.0 path while `applyExternalStatus` is P4's P0 stub */
  legacyMoves: number;
}

export interface PullCtx {
  /** `ops.agentLabels` (P4's key, read only) */
  agentLabels?: Readonly<Record<string, string>>;
}

/** The order's own row, never a test order. */
const own = (scope: StoreScope, id: string) => whereStore(orders, scope, eq(orders.id, id), eq(orders.isTest, false));

/** Credit a sheet agent on a confirmed order nobody is credited for yet (OD54); a mapped label names the member. */
async function attribute(scope: WriteScope, id: string, label: string, member: string | null): Promise<number> {
  const res = await db
    .update(orders)
    .set({ confirmedByLabel: label, ...(member ? { confirmedBy: member } : {}) })
    .where(whereStore(orders, scope, eq(orders.id, id), eq(orders.isTest, false), isNull(orders.confirmedBy), eq(orders.confirmState, "confirmed")));
  return affected(res);
}

type Status = Extract<PullDecision, { kind: "status" }>;

/** R1.0's pull of one status cell (while P4's applyExternalStatus is the stub): the status and the label it read. */
async function legacyStatus(scope: WriteScope, d: Status): Promise<number> {
  const res = await db
    .update(orders)
    .set({ status: d.label, sheetLabel: d.label, updatedAt: new Date() })
    .where(whereStore(orders, scope, eq(orders.id, d.orderId), eq(orders.isTest, false), eq(orders.sheetStatus, "synced")));
  return affected(res);
}

/** `sheet_label` / `sheet_dirty` after an applied status cell (OPE-§19.6; the guard is the rev the move answered). */
async function bookkeeping(scope: WriteScope, d: Status, answer: ExternalAnswer): Promise<{ applied: boolean; writeBack: boolean }> {
  const bk = statusBookkeeping(d, answer);
  if (!bk) return { applied: false, writeBack: false };
  const keep = ALL_BITS & ~bk.clearDirty;
  const dirty =
    bk.rev !== null && bk.clearDirty
      ? sql`(IF(${orders.rev} = ${bk.rev}, ${orders.sheetDirty} & ${keep}, ${orders.sheetDirty})) | ${bk.dirtyOr}`
      : sql`${orders.sheetDirty} | ${bk.dirtyOr}`;
  await db
    .update(orders)
    .set({ sheetLabel: bk.sheetLabel as OrderStatus, sheetDirty: dirty })
    .where(whereStore(orders, scope, eq(orders.id, d.orderId), eq(orders.isTest, false)));
  return { applied: answer.ok && answer.changed, writeBack: bk.dirtyOr !== 0 };
}

const confirmedBy = (answer: unknown): boolean => (answer as { states?: { confirm?: string } } | null)?.states?.confirm === "confirmed";

/**
 * Apply the pull's decisions for one store (see the header), status cells first. Each decision stands alone: one that
 * fails is logged (codes only), counted as deferred and made again by the next pull. Never throws for a decision.
 */
export async function applyPullDecisions(scope: WriteScope, decisions: readonly PullDecision[], ctx: PullCtx = {}): Promise<PullApplied> {
  const r: PullApplied = { pulled: 0, deferred: 0, writeBack: 0, legacyMoves: 0 };
  const changed = new Set<string>();
  const p4 = deps();
  const ordered = [...decisions.filter((d) => d.kind === "status"), ...decisions.filter((d) => d.kind !== "status")];
  let logged = false;
  const failed = (d: PullDecision, err: unknown) => {
    r.deferred++;
    if (notImplemented(err) || logged) return;
    logged = true; // one line per store and run: a sheet full of failing rows must not flood the log
    console.error(`[sheets.pull] store ${scope.storeId} order ${d.orderId} (${d.kind}):`, errorSummary(err));
  };

  for (const d of ordered) {
    try {
      switch (d.kind) {
        case "status": {
          let answer: ExternalAnswer;
          try {
            answer = (await p4.applyExternalStatus(scope, d.orderId, d.ext, d.src)) as ExternalAnswer;
          } catch (err) {
            if (!notImplemented(err)) throw err;
            // P4's stub: the R1.0 pull (status and label), so a store's status pull never stops before P4 merges
            if ((await legacyStatus(scope, d)) > 0) {
              r.legacyMoves++;
              changed.add(d.orderId);
            }
            break;
          }
          const done = await bookkeeping(scope, d, answer);
          if (done.applied) changed.add(d.orderId);
          if (done.writeBack) r.writeBack++;
          // the attribution of a changed confirmation, as plain columns (P4 writes it in the move too: this only fills a gap)
          if (done.applied && d.src.agentLabel && confirmedBy(answer)) {
            if ((await attribute(scope, d.orderId, d.src.agentLabel, agentMember(ctx.agentLabels, d.src.agentLabel))) > 0) changed.add(d.orderId);
          }
          break;
        }
        case "label": {
          const res = await db.update(orders).set({ sheetLabel: d.sheetLabel }).where(whereStore(orders, scope, eq(orders.id, d.orderId), eq(orders.isTest, false), isNull(orders.sheetLabel)));
          if (affected(res) > 0) changed.add(d.orderId);
          break;
        }
        case "agent": {
          if ((await attribute(scope, d.orderId, d.label, d.confirmedBy)) > 0) changed.add(d.orderId);
          break;
        }
        case "note": {
          const ev: AppendOrderEventResult = await p4.appendOrderEvent(scope, d.orderId, {
            actorKind: "sheet",
            type: "note",
            note: d.text,
            meta: { cellHash: d.cellHash, ...(d.agentLabel ? { agentLabel: d.agentLabel } : {}) },
          });
          if (ev.ok) changed.add(d.orderId);
          else if (ev.error !== "not_found") failed(d, new Error(`note refused: ${ev.error}`));
          break;
        }
        case "tracking": {
          // the label exists, so the parcel is at least packed (implied confirmation first, P4); then the timeline
          if (d.ship) await p4.applyExternalStatus(scope, d.orderId, { ship: d.ship }, d.src);
          const ev = await p4.appendOrderEvent(scope, d.orderId, { actorKind: "sheet", type: "tracking_set", meta: { trackingRef: d.trackingRef } });
          if (!ev.ok && ev.error === "not_found") break;
          const res = await db.update(orders).set({ trackingRef: d.trackingRef }).where(whereStore(orders, scope, eq(orders.id, d.orderId), eq(orders.isTest, false)));
          if (affected(res) > 0) changed.add(d.orderId);
          break;
        }
        case "carrier": {
          const res = await db.update(orders).set({ carrierLabel: d.carrierLabel }).where(whereStore(orders, scope, eq(orders.id, d.orderId), eq(orders.isTest, false)));
          if (affected(res) > 0) changed.add(d.orderId);
          break;
        }
      }
    } catch (err) {
      failed(d, err);
    }
  }
  r.pulled = changed.size;
  return r;
}

