import "server-only";
/**
 * The `integration_status` writer (P5 INTEGRATIONS; operations.md OPE-§28.2, OPE-§2.6, OD40; core §D.5, §I.4, §I.7).
 * Every writer reports through here: the Sheets push (`sheets`), the `capi` and `telegram` outbox handlers; R2 / R3
 * tracks add their kinds.
 *
 *   await recordIntegrationStatus(scope, { kind: "capi", targetId: "meta:<pixel>", outcome: "retry", status: 503 });
 *
 * - The state rules are src/lib/integrations/status-rules.ts (pure): `nextStatus(prev, input, now)`.
 * - Throttle: at most one write per minute per row, except when the state changes (OPE-§O.4 IN-03, a flood of 1,000
 *   outbox results writes ≤ 1 row per minute). The process keeps the current row in the store-keyed `int-status`
 *   scopedCache, so counters keep counting between writes; the UPDATE carries the same guard in SQL (`state <> :next
 *   OR updated_at <= now - 60 s`), so a second process or a lost cache entry cannot write more often either.
 * - A transition into `failing` (an incident): `int.<kind>_failing` to the store's owners and admins once per
 *   incident per hour (dedupe key), `markHealthDirty` (the `int:*` rules), and the registered incident listeners
 *   (the Telegram "integration problem" message registers from src/lib/integrations/telegram/queue.ts; a list here,
 *   so this module imports no handler). Leaving `failing` marks health dirty too, so the issue clears on the next pass.
 * - `notifyDeliveryDead` is the `int.delivery_dead` notice a handler fires once, at an item's dead transition
 *   (`isFinalFailure`, core §H.1): batched per kind over 60 minutes.
 * Never throws for a notification or a listener: a delivery path must not fail because a notice could not be stored.
 */
import { createHash } from "node:crypto";
import { eq, lte, ne, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { integrationStatus } from "@/lib/db/schema";
import { notificationKind } from "@/lib/notify/registry";
import { errorSummary } from "@/lib/orders/log";
import { markHealthDirty } from "@/lib/platform/health-snapshot";
import { notify } from "@/lib/platform/notify";
import { scopedCache } from "@/lib/tenancy/cache";
import { getStoreById } from "@/lib/tenancy/public";
import { storeValues, whereStore } from "@/lib/tenancy/sql";
import type { StoreScope, WriteScope } from "@/lib/tenancy/types";
import type { IntegrationKind } from "./health";
import { MINUTE_MS, STATUS_WRITE_EVERY_MS, nextStatus, type IntegrationState, type StatusInput, type StatusRow } from "./status-rules";

export type { IntegrationState, StatusInput, StatusOutcome } from "./status-rules";

/** The row of this process: the stored fields plus when it was last written. */
interface Cached extends StatusRow {
  writtenAt: number;
}

/** 10 min: longer than the write interval, so a busy row is throttled from memory; a quiet one re-reads its row. */
const rows = scopedCache<Cached | null>({ name: "int-status", maxEntries: 20_000, ttlMs: 10 * MINUTE_MS });
/** The tail of each row's queue: one result at a time per row in this process, so no failure is counted twice or lost. */
const queues = scopedCache<Promise<unknown>>({ name: "int-status-queue", maxEntries: 20_000, ttlMs: MINUTE_MS });

const TARGET_MAX = 64;
const slotOf = (kind: IntegrationKind, targetId: string) => `${kind}:${targetId}`;

async function loadRow(scope: StoreScope, kind: IntegrationKind, targetId: string): Promise<Cached | null> {
  const [r] = await db
    .select()
    .from(integrationStatus)
    .where(whereStore(integrationStatus, scope, eq(integrationStatus.kind, kind), eq(integrationStatus.targetId, targetId)))
    .limit(1);
  if (!r) return null;
  return {
    state: r.state,
    failures: r.failures,
    lastOkAt: r.lastOkAt?.getTime() ?? null,
    lastErrorAt: r.lastErrorAt?.getTime() ?? null,
    lastErrorCode: r.lastErrorCode,
    backlog: r.backlog,
    oldestPendingAt: r.oldestPendingAt?.getTime() ?? null,
    // a stored failing row without a streak start: its last error is the best "since" we have
    streakAt: r.failures > 0 ? (r.lastErrorAt?.getTime() ?? null) : null,
    writtenAt: r.updatedAt.getTime(),
  };
}

/**
 * The guarded write: an UPDATE that only lands when the state changes or the row is a minute old, else an INSERT
 * IGNORE for a target seen for the first time. True when a row was written.
 */
async function writeRow(scope: WriteScope, kind: IntegrationKind, targetId: string, next: StatusRow, now: number, codeChanged = false): Promise<boolean> {
  const date = (ms: number | null) => (ms === null ? null : new Date(ms));
  const values = {
    state: next.state,
    lastOkAt: date(next.lastOkAt),
    lastErrorAt: date(next.lastErrorAt),
    lastErrorCode: next.lastErrorCode,
    failures: Math.min(next.failures, 2_000_000_000),
    backlog: Math.min(next.backlog, 2_000_000_000),
    oldestPendingAt: date(next.oldestPendingAt),
    updatedAt: new Date(now),
  };
  const [upd] = await db
    .update(integrationStatus)
    .set(values)
    .where(
      whereStore(
        integrationStatus,
        scope,
        eq(integrationStatus.kind, kind),
        eq(integrationStatus.targetId, targetId),
        or(
          ne(integrationStatus.state, next.state),
          lte(integrationStatus.updatedAt, new Date(now - STATUS_WRITE_EVERY_MS)),
          // a pause that names its reason is written at once (the same state, a new cause)
          codeChanged && next.lastErrorCode !== null ? sql`NOT (${integrationStatus.lastErrorCode} <=> ${next.lastErrorCode})` : undefined,
        ),
      ),
    );
  if (upd.affectedRows > 0) return true;
  const [ins] = await db.insert(integrationStatus).ignore().values(storeValues(scope, { kind, targetId, ...values }));
  return ins.affectedRows === 1;
}

/* ------------------------------------------------------------------ */
/* Incidents                                                           */
/* ------------------------------------------------------------------ */

/** A target that just turned `failing`. Codes and counts only. */
export interface IntegrationIncident {
  kind: IntegrationKind;
  targetId: string;
  code: string;
  sinceMinutes: number;
  backlog: number;
  at: string;
  /** an outbox item of this kind went `dead` (`notifyDeliveryDead`), not a target turning `failing` */
  dead?: boolean;
}
export type IncidentListener = (scope: WriteScope, incident: IntegrationIncident) => Promise<void>;

/** Registered at import by the modules that react to incidents (src/lib/integrations/telegram/queue.ts: the Telegram "integration problem" message). */
const incidentListeners: IncidentListener[] = [];

/** Adds a listener; answers its removal (tests). */
export function onIntegrationIncident(listener: IncidentListener): () => void {
  incidentListeners.push(listener);
  return () => {
    const i = incidentListeners.indexOf(listener);
    if (i >= 0) incidentListeners.splice(i, 1);
  };
}

/** The kinds that have an `int.<kind>_failing` notification (OPE-§21.4). */
const FAILING_KINDS: ReadonlySet<IntegrationKind> = new Set<IntegrationKind>(["sheets", "capi", "telegram"]);
const OWNERS = ["owner", "admin"] as const;

const short = (s: string) => (s ? createHash("sha256").update(s, "utf8").digest("hex").slice(0, 12) : "-");

/** The link a kind's builder gives for the store (null when the store has no handle any more). */
async function linkFor(storeId: string, kind: string, vars: Record<string, unknown>): Promise<string | undefined> {
  const store = await getStoreById(storeId);
  return notificationKind(kind)?.link?.(vars, { handle: store?.handle ?? null }) || undefined;
}

/** Every registered listener, in order; a failing listener is logged and the next still runs. */
async function tellListeners(scope: WriteScope, incident: IntegrationIncident): Promise<void> {
  for (const listener of [...incidentListeners]) {
    try {
      await listener(scope, incident);
    } catch (err) {
      console.error(`[integrations] incident listener failed (${incident.kind}):`, errorSummary(err));
    }
  }
}

async function onFailing(scope: WriteScope, kind: IntegrationKind, targetId: string, row: StatusRow, now: number): Promise<void> {
  const incident: IntegrationIncident = {
    kind,
    targetId,
    code: row.lastErrorCode ?? "unknown",
    sinceMinutes: Math.max(0, Math.round((now - (row.streakAt ?? now)) / MINUTE_MS)),
    backlog: row.backlog,
    at: new Date(now).toISOString(),
  };
  if (FAILING_KINDS.has(kind)) {
    const notice = `int.${kind}_failing`;
    const vars = { code: incident.code, sinceMinutes: incident.sinceMinutes, ...(kind === "sheets" ? { backlog: incident.backlog } : {}) };
    try {
      // once per incident per hour: the hour bucket is part of the key, so a flapping target notifies at most hourly
      await notify({ audience: "store_role", storeId: scope.storeId, roles: OWNERS }, notice, vars, {
        link: await linkFor(scope.storeId, notice, vars),
        dedupeKey: `${notice}:${scope.storeId}:${short(targetId)}:${Math.floor(now / 3_600_000)}`,
      });
    } catch (err) {
      console.error(`[integrations] ${notice} not stored:`, errorSummary(err));
    }
  }
  await tellListeners(scope, incident);
}

/* ------------------------------------------------------------------ */
/* API                                                                 */
/* ------------------------------------------------------------------ */

export interface StatusResult {
  state: IntegrationState;
  /** the state differs from the one before this result */
  changed: boolean;
  /** a row was written (false: throttled) */
  wrote: boolean;
}

/**
 * Records one result of an integration target and answers its state. `opts.now` is the clock (tests drive a fake
 * one; the SQL guard compares with the same clock). Results of one row are applied in arrival order.
 */
export async function recordIntegrationStatus(scope: WriteScope, input: StatusInput, opts: { now?: number } = {}): Promise<StatusResult> {
  const targetId = (input.targetId ?? "").slice(0, TARGET_MAX);
  const slot = slotOf(input.kind, targetId);
  const before = queues.get(scope.storeId, slot) ?? Promise.resolve();
  const run = before.catch(() => undefined).then(() => apply(scope, { ...input, targetId }, slot, opts.now ?? Date.now()));
  queues.set(scope.storeId, slot, run);
  return run;
}

async function apply(scope: WriteScope, input: StatusInput & { targetId: string }, slot: string, now: number): Promise<StatusResult> {
  let prev = rows.get(scope.storeId, slot);
  if (prev === undefined) prev = await rows.getOrLoad(scope.storeId, slot, () => loadRow(scope, input.kind, input.targetId));
  const next = nextStatus(prev, input, now);
  const changed = !prev || prev.state !== next.state;
  // a pause with a new reason (`off` + a code) is written at once, like a state change; it notifies nobody
  const codeChanged = input.outcome === "off" && !!input.code && !!prev && prev.lastErrorCode !== next.lastErrorCode;

  if (!changed && !codeChanged && prev && now - prev.writtenAt < STATUS_WRITE_EVERY_MS) {
    rows.set(scope.storeId, slot, { ...next, writtenAt: prev.writtenAt });
    return { state: next.state, changed: false, wrote: false };
  }
  // a write the SQL guard refused means another writer stored this state less than a minute ago: wait a minute too
  const wrote = await writeRow(scope, input.kind, input.targetId, next, now, codeChanged);
  rows.set(scope.storeId, slot, { ...next, writtenAt: now });

  if (changed && (next.state === "failing" || prev?.state === "failing")) {
    await markHealthDirty(scope.storeId).catch((err: unknown) => console.error("[integrations] markHealthDirty:", errorSummary(err)));
  }
  if (changed && next.state === "failing") await onFailing(scope, input.kind, input.targetId, next, now);
  return { state: next.state, changed, wrote };
}

/**
 * `int.delivery_dead` (OPE-§21.4): a handler calls it once per item, at its dead transition; one notification per
 * store and outbox kind per 60-minute window, its `count` incremented (the kind's batch). Marks health dirty
 * (`int:delivery_dead`).
 */
export async function notifyDeliveryDead(scope: WriteScope, outboxKind: "capi" | "telegram" | "webhook" | "carrier" | "whatsapp"): Promise<void> {
  const vars = { kind: outboxKind, count: 1 };
  try {
    await notify({ audience: "store_role", storeId: scope.storeId, roles: OWNERS }, "int.delivery_dead", vars, {
      link: await linkFor(scope.storeId, "int.delivery_dead", vars),
      dedupeKey: `int.delivery_dead:${scope.storeId}:${outboxKind}`,
    });
  } catch (err) {
    console.error("[integrations] int.delivery_dead not stored:", errorSummary(err));
  }
  await markHealthDirty(scope.storeId).catch((err: unknown) => console.error("[integrations] markHealthDirty:", errorSummary(err)));
  // the listeners hear it too (the Telegram "integration problem" message, once per kind per hour by its own key)
  await tellListeners(scope, { kind: outboxKind, targetId: "", code: "delivery_dead", sinceMinutes: 0, backlog: 0, at: new Date().toISOString(), dead: true });
}

/** Forget this process's rows (tests; a store's rows also go with `invalidateStore`). */
export function clearStatusCache(storeId?: string): void {
  if (storeId) {
    rows.delete(storeId);
    queues.delete(storeId);
  } else {
    rows.clear();
    queues.clear();
  }
}
