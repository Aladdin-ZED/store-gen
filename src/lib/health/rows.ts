import "server-only";
/**
 * The `store_health` statements (docs/STORE-SAAS.md §E.3 rule 6, §I.7, D53; platform.md PLA-§2.2, PLA-§6.3.4).
 *
 * Every statement on one store takes that store's scope: reads through `whereStore`, writes through a `WriteScope`
 * (the job's `systemScope`, a member's scope for a snooze) with `storeValues` / `whereStore`, so lint L1-L6 hold with
 * no exemption, the upsert included. The one cross-store statement of `src/lib/health/**` (the pin of 1 in
 * scripts/qa/tenancy-allow.json) is `scanHealthRows`: the queue view the job takes its stores from (dirty rows first,
 * then stores with no snapshot, then the oldest `computed_at`, `sh_due_idx`) and the alarm job reads its overdue and
 * flagged rows from, one SQL text for both.
 *
 * A dirty stub (`markDirtyRow` on a store with no row yet) carries `computed_at = STUB_COMPUTED_AT`: a row that was
 * never computed, which `getStoreHealth` answers as null ("computing") and the queue serves right after the dirty rows.
 */
import { and, count, inArray, isNotNull, sql } from "drizzle-orm";
import type { RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/db/client";
import { storeHealth, stores } from "@/lib/db/schema";
import { HEALTH_CAPS, type HealthFlag, type HealthGroup, type HealthMetrics } from "@/lib/health/types";
import { storeValues, whereStore } from "@/lib/tenancy/sql";
import type { StoreScope, StoreStatus, WriteScope } from "@/lib/tenancy/types";

export type HealthRow = typeof storeHealth.$inferSelect;
/** The columns a run writes (the store id comes from the scope, `dirty_at` from the commit rule). */
export type HealthRowValues = Omit<typeof storeHealth.$inferInsert, "storeId" | "dirtyAt">;

/** `computed_at` of a dirty stub: never a computation. */
export const STUB_COMPUTED_AT = new Date(0);

/** A row that holds a computation (not a dirty stub). */
export function isComputed(row: Pick<HealthRow, "computedAt"> | null | undefined): boolean {
  return !!row && row.computedAt instanceof Date && row.computedAt.getTime() > STUB_COMPUTED_AT.getTime();
}

const EMPTY_METRICS: HealthMetrics = { orders7d: 0, risky7d: 0, lastActiveAt: null, lastOrderAt: null, publishedPages: 0, mediaPct: null };
const EMPTY_COMPONENTS = Object.fromEntries(Object.keys(HEALTH_CAPS).map((g) => [g, 0])) as Record<HealthGroup, number>;

/** The store's own row, or null. */
export async function readHealthRow(scope: StoreScope): Promise<HealthRow | null> {
  const [row] = await db.select().from(storeHealth).where(whereStore(storeHealth, scope)).limit(1);
  return row ?? null;
}

/**
 * `dirty_at` set, keeping an earlier mark (the oldest dirty row is served first, so a store marked again keeps its
 * place); a store with no row gets a dirty stub. One statement.
 */
export async function markDirtyRow(scope: WriteScope, at: Date): Promise<void> {
  await db
    .insert(storeHealth)
    .values(
      storeValues(scope, {
        score: 0,
        attention: 0,
        flags: [] as HealthFlag[],
        issues: [],
        components: EMPTY_COMPONENTS,
        metrics: EMPTY_METRICS,
        milestones: null,
        snoozed: null,
        dormant: false,
        computedAt: STUB_COMPUTED_AT,
        dirtyAt: at,
      }),
    )
    .onDuplicateKeyUpdate({ set: { dirtyAt: sql`COALESCE(${storeHealth.dirtyAt}, ${at})` } });
}

/**
 * One run's row, written under a lock of the previous one: `build` gets the locked row (or null) and answers the
 * columns, so a snooze written while the run read its inputs is kept, and the score is computed with it. `dirty_at`
 * is cleared only when no mark arrived after `startedAt` (a change during the run is computed again next tick).
 */
export async function commitSnapshot<T>(scope: WriteScope, startedAt: Date, build: (locked: HealthRow | null) => { values: HealthRowValues; result: T }): Promise<T> {
  return db.transaction(async (tx) => {
    const [locked] = await tx.select().from(storeHealth).where(whereStore(storeHealth, scope)).for("update");
    const { values, result } = build(locked ?? null);
    if (locked) {
      await tx
        .update(storeHealth)
        .set({ ...values, dirtyAt: sql`IF(${storeHealth.dirtyAt} > ${startedAt}, ${storeHealth.dirtyAt}, NULL)` })
        .where(whereStore(storeHealth, scope));
    } else {
      await tx.insert(storeHealth).values(storeValues(scope, { ...values, dirtyAt: null }));
    }
    return result;
  });
}

/**
 * A snooze or an unsnooze under a lock (PD67): `apply` gets the locked computed row and answers the new columns, or
 * null when the issue is not in it (`not_found`). A store with no computed row has nothing to snooze.
 */
export async function updateSnoozed(scope: WriteScope, apply: (row: HealthRow) => Pick<HealthRowValues, "snoozed" | "issues" | "score" | "components" | "attention"> | null): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(storeHealth).where(whereStore(storeHealth, scope)).for("update");
    if (!row || !isComputed(row)) return false;
    const next = apply(row);
    if (!next) return false;
    await tx.update(storeHealth).set(next).where(whereStore(storeHealth, scope));
    return true;
  });
}

/* ------------------------------------------------------------------ */
/* The queue view (the one cross-store statement)                      */
/* ------------------------------------------------------------------ */

/** The stores the job visits besides dirty rows (PD78: pending, active, restricted). */
export const ROTATION_STATES: readonly StoreStatus[] = ["pending", "active", "restricted"];

export interface HealthQueueRow {
  storeId: string;
  status: StoreStatus;
  createdAt: Date;
  /** a computed row exists (not a stub) */
  computed: boolean;
  dirtyAt: Date | null;
  computedAt: Date | null;
  attention: number;
  /** only for rows at or above `attentionMin` */
  flags: HealthFlag[] | null;
}

export interface HealthScan {
  /** the stores outside dirty rows to consider */
  states: readonly StoreStatus[];
  /** rows whose `computed_at` is before this instant (the job: the tick's start; the alarms: the staleness bound) */
  computedBefore: Date;
  /** also rows at or above this attention, with their flags (the alarms: 2; the job: none) */
  attentionMin: number | null;
  exclude?: readonly string[];
  limit: number;
}

const toDate = (v: unknown): Date | null => (v instanceof Date ? v : v ? new Date(String(v)) : null);

/**
 * In queue order: dirty rows (oldest mark first; any state but `purged`, so a suspension is computed at once), then
 * stores of `states` with no row or a stub, then the rows computed before `computedBefore`, oldest first; plus, with
 * `attentionMin`, the rows at that attention or above (with their flags).
 */
export async function scanHealthRows(q: HealthScan): Promise<HealthQueueRow[]> {
  const states = q.states.length ? [...q.states] : ["active"];
  const exclude = q.exclude?.length ? [...q.exclude] : [""];
  const attentionMin = q.attentionMin ?? 99;
  const limit = Math.max(1, Math.min(10_000, Math.trunc(q.limit)));
  // tenancy: platform the health queue across stores (§E.3 rule 6, §I.7: dirty, missing, oldest; the alarm job's overdue and flagged rows)
  const [rows] = (await db.execute(sql`
    SELECT s.id AS store_id, s.status, s.created_at, (h.store_id IS NOT NULL AND h.computed_at > ${STUB_COMPUTED_AT}) AS computed,
      h.dirty_at, h.computed_at, COALESCE(h.attention, 0) AS attention, IF(h.attention >= ${attentionMin}, h.flags, NULL) AS flags
    FROM stores s LEFT JOIN store_health h ON h.store_id = s.id
    WHERE s.handle IS NOT NULL
      AND (s.status IN (${sql.join(states.map((st) => sql`${st}`), sql`, `)}) OR (h.dirty_at IS NOT NULL AND s.status <> 'purged'))
      AND (h.store_id IS NULL OR h.dirty_at IS NOT NULL OR h.computed_at < ${q.computedBefore} OR h.attention >= ${attentionMin})
      AND s.id NOT IN (${sql.join(exclude.map((id) => sql`${id}`), sql`, `)})
    ORDER BY h.dirty_at IS NULL, h.dirty_at, (h.store_id IS NOT NULL AND h.computed_at > ${STUB_COMPUTED_AT}), h.computed_at, s.id
    LIMIT ${limit}
  `)) as unknown as [RowDataPacket[]];
  return rows.map((r) => {
    let flags: HealthFlag[] | null = null;
    if (typeof r.flags === "string") {
      try {
        flags = JSON.parse(r.flags) as HealthFlag[];
      } catch {
        flags = null;
      }
    }
    return {
      storeId: String(r.store_id),
      status: r.status as StoreStatus,
      createdAt: toDate(r.created_at) ?? new Date(0),
      computed: Number(r.computed) === 1,
      dirtyAt: toDate(r.dirty_at),
      computedAt: toDate(r.computed_at),
      attention: Number(r.attention) || 0,
      flags,
    };
  });
}

/** The stores the job's rotation covers (the `activeStores` of the measured cycle; `stores` is not a tenant table). */
export async function countRotationStores(): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(stores)
    .where(and(inArray(stores.status, [...ROTATION_STATES]), isNotNull(stores.handle)));
  return Number(row?.n ?? 0);
}
