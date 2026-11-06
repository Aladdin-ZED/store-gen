import "server-only";
/**
 * A platform job's own state row (docs/STORE-SAAS.md §D.5 `cron_cursors`, a P table with no `store_id`; §H.2): the
 * row keyed `<job>:<what>` holds a small JSON `state`, the way the purge records its progress under `purge:<storeId>`
 * (§H.9). P1 keeps two: the measured window of `platform.health` (PD78: the stores per tick of the last 12 runs, the
 * slow-run streak) and the raised / recovered times of `platform.alarms` (PLA-§15.2 "Recovered 14:20").
 *
 * Never store data: counts, codes and ISO instants only. The runner's own `cursor` column is left alone.
 */
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { cronCursors } from "@/lib/db/schema";

const KEY_RE = /^[a-z][a-z0-9_.]*:[a-z][a-z0-9_]*$/;

function checkKey(key: string): string {
  if (!KEY_RE.test(key) || key.length > 48) throw new Error(`job state: bad key "${key.slice(0, 60)}"`);
  return key;
}

/** The state of `key`, or null (no row yet, or a value that is not an object). */
export async function readJobState<T extends object>(key: string): Promise<T | null> {
  const [row] = await db.select({ state: cronCursors.state }).from(cronCursors).where(eq(cronCursors.job, checkKey(key))).limit(1);
  const state = row?.state;
  return state && typeof state === "object" && !Array.isArray(state) ? (state as T) : null;
}

/** Replaces the state of `key` (≤ 16 KB of JSON). */
export async function writeJobState(key: string, state: object): Promise<void> {
  const json = state as Record<string, unknown>;
  if (JSON.stringify(json).length > 16_384) throw new Error(`job state: "${key}" is over 16 KB`);
  const now = new Date();
  await db
    .insert(cronCursors)
    .values({ job: checkKey(key), cursor: "", state: json, updatedAt: now })
    .onDuplicateKeyUpdate({ set: { state: json, updatedAt: now } });
}
