import "server-only";
/**
 * Server-side idempotency of the agent hot path (P4 CALL CENTER; operations.md OD36, OD37, OPE-§5.2, §13.2b, §L).
 *
 * The console mints a UUID when it renders a control and sends it as `Idempotency-Key`, so a double tap, or the retry
 * of a request whose response a dropped network lost, carries the same key. `withIdem` keeps the serialised result of
 * the first request for 10 minutes under `${storeId}:${userId}:${idem}` (`scopedCache("ops-idem")`); a second request
 * with the key returns that result marked `replayed` and runs nothing. One running at the same moment waits for the
 * first and gets its result. Only an answer is kept: a request that threw is forgotten, so its retry runs for real.
 *
 * Memory is enough (OPE-§5.2): a lost entry only means the second request runs the real statement, which the claim's
 * own WHERE and the outcome's `expectRev` make safe. Bounded per store (≤ 2,000 entries and ≤ 3 MB, oldest out first)
 * so one store's flood never evicts another's, and by the cache's 32 MB in all. A key is a UUID; any other value runs
 * the request without the cache (the hot-path routes refuse a missing key with 400 `idem_required`, OD36). The clock
 * is `Date.now()`, so the offline suite proves the 10-minute expiry with a fake clock (OPE-§O.1).
 */
import { scopedCache } from "@/lib/tenancy/cache";
import type { StoreScope } from "@/lib/tenancy/types";

export const IDEM_TTL_MS = 10 * 60_000;
export const IDEM_MAX_PER_STORE = 2_000;
/** a store's stored results stay under this, so its one cache entry stays under the cache's per-entry cap (32 MB / 8) */
const STORE_MAX_BYTES = 3 * 1024 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** An `Idempotency-Key` the cache accepts: a UUID (OD36). */
export const isIdemKey = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);

interface Entry {
  /** when the result was stored (or the run started, while pending) */
  at: number;
  json?: string;
  bytes: number;
  /** the first request, still running: a duplicate awaits it */
  pending?: Promise<string>;
}
/** One store's results, oldest first (a Map keeps insertion order). */
interface Bucket {
  entries: Map<string, Entry>;
  bytes: number;
}

const cache = scopedCache<Bucket>({ name: "ops-idem", maxEntries: 2_000, maxBytes: 32 * 1024 * 1024, sizeOf: (b) => b.bytes, ttlMs: IDEM_TTL_MS });
const SLOT = "results";

function bucketOf(storeId: string): Bucket {
  return cache.get(storeId, SLOT) ?? { entries: new Map(), bytes: 0 };
}

function drop(b: Bucket, key: string): void {
  const e = b.entries.get(key);
  if (!e) return;
  b.entries.delete(key);
  b.bytes -= e.bytes;
}

/** Expired results out, then the oldest finished ones while the store is over its bounds. */
function prune(b: Bucket, now: number): void {
  for (const [key, e] of b.entries) if (!e.pending && now - e.at >= IDEM_TTL_MS) drop(b, key);
  for (const [key, e] of b.entries) {
    if (b.entries.size <= IDEM_MAX_PER_STORE && b.bytes <= STORE_MAX_BYTES) break;
    if (!e.pending) drop(b, key);
  }
}

/** Writes the bucket back (its size and its 10-minute life are counted again on every write). */
function save(storeId: string, b: Bucket): void {
  cache.set(storeId, SLOT, b);
}

/**
 * Runs `run` once per (store, user, key) within 10 minutes; a repeat answers the stored result through `replayed`
 * (which marks it, e.g. `{ ...r, replayed: true }`). The result must be JSON-safe (ISO strings, no Date).
 */
export async function withIdem<T>(scope: StoreScope, userId: string, idem: string | null | undefined, run: () => Promise<T>, replayed: (stored: T) => T): Promise<T> {
  if (!isIdemKey(idem)) return run();
  const storeId = scope.storeId;
  const key = `${userId}:${idem.toLowerCase()}`;
  const b = bucketOf(storeId);
  prune(b, Date.now());
  const hit = b.entries.get(key);
  if (hit?.json !== undefined) return replayed(JSON.parse(hit.json) as T);
  if (hit?.pending) {
    const json = await hit.pending.then(
      (j) => j,
      () => null,
    );
    // the first request threw: nothing was stored, this one runs for real
    if (json !== null) return replayed(JSON.parse(json) as T);
  }

  let settle!: { ok: (json: string) => void; fail: (err: unknown) => void };
  const pending = new Promise<string>((ok, fail) => (settle = { ok, fail }));
  pending.catch(() => undefined); // a duplicate may never come: the rejection is handled here
  const entry: Entry = { at: Date.now(), bytes: 0, pending };
  b.entries.set(key, entry);
  save(storeId, b);
  try {
    const result = await run();
    const json = JSON.stringify(result);
    const live = bucketOf(storeId);
    // the bucket may have been evicted meanwhile: the result goes into the store's bucket as it is now
    if (live.entries.get(key) === entry || !live.entries.has(key)) {
      drop(live, key);
      live.entries.set(key, { at: Date.now(), json, bytes: Buffer.byteLength(json) + key.length });
      live.bytes += Buffer.byteLength(json) + key.length;
      prune(live, Date.now());
      save(storeId, live);
    }
    settle.ok(json);
    return result;
  } catch (err) {
    const live = bucketOf(storeId);
    if (live.entries.get(key) === entry) {
      drop(live, key);
      save(storeId, live);
    }
    settle.fail(err);
    throw err;
  }
}

/** Every stored result of one store (tests; a store's purge goes through `invalidateStore`). */
export function forgetIdem(scope: StoreScope): void {
  cache.delete(scope.storeId);
}
