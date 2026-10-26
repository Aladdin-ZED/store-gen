import "server-only";
/**
 * Per-process memory of what the public store routes serve (docs/STORE-SAAS.md §E.6, PUB-04, PUB-13): published
 * pages, a store's home, its rendered legal documents and SEO files, per store. Entries live in the `render`
 * ScopedCache under (storeId, key), so one store's slug can never answer another store's request, and
 * `invalidateStore(storeId)` (lifecycle, renames, settings) drops a store's entries with every other cache.
 *
 *   key = `${kind}:${path}:${catalogVersion}:${addressVersion}`   (a bump of either version is a new key)
 *
 * Byte-bounded (32 MB, one entry ≤ 4 MB); misses (random slugs) live in their own, smaller cache so they can
 * never push real pages out. Positive and negative entries expire after RENDER_CACHE_TTL_MS (another Node process
 * may have published or unpublished).
 *
 * Call invalidateStoreRender(storeId) after anything that changes what a store's visitors get: publish (the publish
 * path does it), unpublish, slug change, page deletion, the home page, the store's identity and policies.
 * invalidatePublished() (deprecated) clears every store of this process for the single-tenant callers.
 * Deliberately free of the renderer and the database so admin actions can import it cheaply.
 */
import { scopedCache } from "@/lib/tenancy/cache";

/** Entries older than this are reloaded (other processes may have changed the database). */
export const RENDER_CACHE_TTL_MS = 60_000;

const MAX_BYTES = 32 * 1024 * 1024;

interface Sized {
  value: unknown;
  bytes: number;
}

const pagesCache = scopedCache<Sized>({ name: "render", maxEntries: 4_096, maxBytes: MAX_BYTES, ttlMs: RENDER_CACHE_TTL_MS, sizeOf: (v) => v.bytes });
const missCache = scopedCache<true>({ name: "render-miss", maxEntries: 4_096, ttlMs: 30_000 });

/** A fresh cached value of the store (`{ value }`, null for a recorded miss) or undefined. */
export function cacheGet<T>(storeId: string, key: string): { value: T | null } | undefined {
  if (missCache.get(storeId, key)) return { value: null };
  const hit = pagesCache.get(storeId, key);
  return hit ? { value: hit.value as T } : undefined;
}

/**
 * Remembers `value` (null: a miss) for the store. `bytes` is the value's approximate size (the strings it holds),
 * which bounds the cache; a value larger than an eighth of the budget is simply not kept.
 */
export function cacheSet<T>(storeId: string, key: string, value: T | null, bytes = 0): T | null {
  if (value === null) {
    pagesCache.delete(storeId, key);
    missCache.set(storeId, key, true);
    return null;
  }
  missCache.delete(storeId, key);
  pagesCache.set(storeId, key, { value, bytes: Math.max(256, bytes) });
  return value;
}

/** Forget every cached page, home, legal document and SEO file of this store (this process). */
export function invalidateStoreRender(storeId: string): void {
  pagesCache.delete(storeId);
  missCache.delete(storeId);
}

/** @deprecated single-tenant callers (they do not know the store yet): forgets every store's entries in this process. */
export function invalidatePublished(): void {
  pagesCache.clear();
  missCache.clear();
}
