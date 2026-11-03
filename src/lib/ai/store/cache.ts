import "server-only";
/**
 * The `ai_cache` repository (P7 AI; ai.md AI-§A.4 step 3, AI-§E.5, AI-§M.1; docs/STORE-SAAS.md §E.3). Keyed by
 * (store, task, input hash, prompt version, model): one store's entry can never answer another store's lookup, even
 * for an identical input hash.
 *
 *   - `cacheLookup`: a live entry (not expired) and `hits + 1`; the caller re-runs `finalize` on it (the guard may
 *     have changed) and writes its `via = 'cache'` run row with 0 credits;
 *   - `cacheWrite`: an output ≤ 64 KB with its expiry (the task's TTL, or 10 minutes for a TTL-0 Director task so an
 *     identical input is not paid twice; "Regenerate" adds a nonce upstream and never reaches the cache);
 *   - `purgeStoreCache`: the store's expired entries (the retention job walks stores with a system scope).
 */
import { and, eq, gt, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { aiCache } from "@/lib/db/schema";
import { storeValues, whereStore } from "@/lib/tenancy/sql";
import type { StoreScope, WriteScope } from "@/lib/tenancy/types";
import type { AiTaskId } from "../tasks";
import { OUTPUT_MAX_BYTES } from "./runs";

export interface CacheKey {
  task: AiTaskId;
  inputHash: string;
  promptVersion: string;
  model: string;
}

const HASH_RE = /^[0-9a-f]{64}$/;

function keyWhere(k: CacheKey) {
  if (!HASH_RE.test(k.inputHash)) throw new RangeError("ai cache: the input hash is a sha256 hex");
  return and(eq(aiCache.task, k.task), eq(aiCache.inputHash, k.inputHash), eq(aiCache.promptVersion, k.promptVersion), eq(aiCache.model, k.model))!;
}

/** A live entry of the scope's store, or null, without counting (the console's view). */
export async function cachePeek(scope: StoreScope, k: CacheKey, now = new Date()): Promise<{ output: unknown; hits: number } | null> {
  const [row] = await db.select({ output: aiCache.output, hits: aiCache.hits }).from(aiCache).where(whereStore(aiCache, scope, keyWhere(k), gt(aiCache.expiresAt, now))).limit(1);
  return row ? { output: row.output, hits: row.hits } : null;
}

/** A live entry of the scope's store, or null; a hit counts itself (a run serves it, so the scope can write). */
export async function cacheLookup(scope: WriteScope, k: CacheKey, now = new Date()): Promise<{ output: unknown; hits: number } | null> {
  const row = await cachePeek(scope, k, now);
  if (!row) return null;
  await db.update(aiCache).set({ hits: sql`${aiCache.hits} + 1` }).where(whereStore(aiCache, scope, keyWhere(k)));
  return { output: row.output, hits: row.hits + 1 };
}

/** Stores an output until `expiresAt`; false when it is over 64 KB (not cached). An existing entry is replaced. */
export async function cacheWrite(scope: WriteScope, k: CacheKey, output: unknown, expiresAt: Date): Promise<boolean> {
  keyWhere(k);
  const text = JSON.stringify(output);
  if (text === undefined) return false;
  const bytes = Buffer.byteLength(text, "utf8");
  if (bytes > OUTPUT_MAX_BYTES) return false;
  const now = new Date();
  await db
    .insert(aiCache)
    .values(storeValues(scope, { task: k.task, inputHash: k.inputHash, promptVersion: k.promptVersion, model: k.model, output, bytes, hits: 0, expiresAt, createdAt: now }))
    .onDuplicateKeyUpdate({ set: { output, bytes, hits: 0, expiresAt, createdAt: now } });
  return true;
}

/** Drops the store's expired entries; returns how many. */
export async function purgeStoreCache(scope: WriteScope, now = new Date()): Promise<number> {
  const [res] = await db.delete(aiCache).where(whereStore(aiCache, scope, lte(aiCache.expiresAt, now)));
  return (res as { affectedRows?: number }).affectedRows ?? 0;
}

/** The expiry of a fresh entry: the task's TTL in days, else 10 minutes (TTL-0 Director tasks, AI-§A.4 step 3). */
export function cacheExpiry(ttlDays: number, now = new Date()): Date {
  return new Date(now.getTime() + (ttlDays > 0 ? ttlDays * 86_400_000 : 10 * 60_000));
}
