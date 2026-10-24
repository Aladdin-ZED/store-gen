/**
 * Process caches keyed by store (docs/STORE-SAAS.md §E.6, TN-11). Every in-memory cache of tenant data is a
 * `ScopedCache` made by `scopedCache()`: entries live under (storeId, key), so one store's value can never
 * answer another store's lookup, and `invalidateStore(storeId)` drops a store from every cache at once
 * (lifecycle transitions, handle renames, settings and entitlement writes).
 *
 *   const pulse = scopedCache<StorePulse>({ name: "pulse", maxEntries: 2_000, ttlMs: 5_000 });
 *   const value = await pulse.getOrLoad(scope.storeId, "summary", () => loadPulse(scope));
 *
 * Bounded by entries (LRU) and optionally by bytes (`maxBytes` + `sizeOf`); entries expire after `ttlMs`
 * (another process may have written the database). `null` is a value (negative caching); `undefined` is a
 * miss. Platform-keyed caches use the store id "p" (§E.6). Framework-free and synchronous except
 * `getOrLoad`; registered on globalThis.__sgCaches by name so every module instance shares one cache.
 */

export interface ScopedCacheOptions<V> {
  name: string;
  maxEntries: number;
  maxBytes?: number;
  ttlMs: number;
  sizeOf?: (v: V) => number;
}

interface Entry<V> {
  storeId: string;
  key: string;
  value: V;
  expires: number;
  size: number;
}

const SEP = "\u0000";

export class ScopedCache<V> {
  readonly name: string;
  private readonly maxEntries: number;
  private readonly maxBytes: number | null;
  private readonly maxEntryBytes: number;
  private readonly ttlMs: number;
  private readonly sizeOf: ((v: V) => number) | null;
  /** insertion order = LRU order (a hit re-inserts) */
  private readonly entries = new Map<string, Entry<V>>();
  private readonly byStore = new Map<string, Set<string>>();
  private readonly inflight = new Map<string, Promise<V>>();
  /**
   * bumped by delete(storeId): a load that started before it does not write its (stale) result. Never
   * reset, so it holds one number per store ever invalidated in this process (bounded by the store count).
   */
  private readonly generation = new Map<string, number>();
  private bytes = 0;

  constructor(opts: ScopedCacheOptions<V>) {
    if (!opts.name || !(opts.maxEntries > 0) || !(opts.ttlMs > 0)) throw new Error(`ScopedCache "${opts.name}": name, maxEntries and ttlMs are required`);
    if (opts.maxBytes !== undefined && !opts.sizeOf) throw new Error(`ScopedCache "${opts.name}": maxBytes needs sizeOf`);
    this.name = opts.name;
    this.maxEntries = opts.maxEntries;
    this.maxBytes = opts.maxBytes ?? null;
    // one entry may take at most an eighth of the budget (like media/lru.ts), so a single value can't flush the cache
    this.maxEntryBytes = this.maxBytes === null ? Infinity : Math.floor(this.maxBytes / 8);
    this.ttlMs = opts.ttlMs;
    this.sizeOf = opts.sizeOf ?? null;
  }

  get(storeId: string, key: string): V | undefined {
    const id = slot(storeId, key);
    const hit = this.entries.get(id);
    if (!hit) return undefined;
    if (hit.expires <= Date.now()) {
      this.drop(id);
      return undefined;
    }
    this.entries.delete(id);
    this.entries.set(id, hit);
    return hit.value;
  }

  set(storeId: string, key: string, value: V, opts?: { ttlMs?: number /* per-entry override, e.g. "valid until the announcement ends" */ }): V {
    const id = slot(storeId, key);
    const size = this.sizeOf ? Math.max(0, this.sizeOf(value)) : 0;
    this.drop(id);
    if (size > this.maxEntryBytes) return value;
    const ttl = opts?.ttlMs ?? this.ttlMs;
    if (!(ttl > 0)) return value;
    this.entries.set(id, { storeId, key, value, expires: Date.now() + ttl, size });
    let keys = this.byStore.get(storeId);
    if (!keys) this.byStore.set(storeId, (keys = new Set()));
    keys.add(id);
    this.bytes += size;
    while (this.entries.size > this.maxEntries || (this.maxBytes !== null && this.bytes > this.maxBytes)) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.drop(oldest.value);
    }
    return value;
  }

  /** single flight: concurrent callers share one in-flight Promise; a rejected Promise is evicted at once (STO-R24) */
  getOrLoad(storeId: string, key: string, load: () => Promise<V>, opts?: { ttlMs?: number }): Promise<V> {
    const hit = this.get(storeId, key);
    if (hit !== undefined) return Promise.resolve(hit);
    const id = slot(storeId, key);
    const running = this.inflight.get(id);
    if (running) return running;
    const gen = this.generation.get(storeId) ?? 0;
    // load() runs on a later tick, so even a synchronous throw settles `promise` after it is registered
    const promise: Promise<V> = Promise.resolve()
      .then(load)
      .then((value) => {
        if ((this.generation.get(storeId) ?? 0) === gen) this.set(storeId, key, value, opts);
        return value;
      })
      .finally(() => {
        if (this.inflight.get(id) === promise) this.inflight.delete(id);
      });
    this.inflight.set(id, promise);
    return promise;
  }

  /** key omitted = the whole store */
  delete(storeId: string, key?: string): void {
    // any delete voids the store's in-flight loads (a single-key delete just costs the others one cache write)
    this.generation.set(storeId, (this.generation.get(storeId) ?? 0) + 1);
    if (key !== undefined) {
      const id = slot(storeId, key);
      this.drop(id);
      this.inflight.delete(id);
      return;
    }
    for (const id of [...(this.byStore.get(storeId) ?? [])]) this.drop(id);
    for (const id of [...this.inflight.keys()]) if (id.startsWith(storeId + SEP)) this.inflight.delete(id);
  }

  /** Every entry of every store (tests, a settings import). */
  clear(): void {
    const stores = new Set([...this.byStore.keys(), ...[...this.inflight.keys()].map((id) => id.slice(0, id.indexOf(SEP)))]);
    for (const storeId of stores) this.generation.set(storeId, (this.generation.get(storeId) ?? 0) + 1);
    this.entries.clear();
    this.byStore.clear();
    this.inflight.clear();
    this.bytes = 0;
  }

  /** Live counts for the health page and tests. */
  stats(): { entries: number; bytes: number; stores: number } {
    return { entries: this.entries.size, bytes: this.bytes, stores: this.byStore.size };
  }

  private drop(id: string): void {
    const hit = this.entries.get(id);
    if (!hit) return;
    this.entries.delete(id);
    this.bytes -= hit.size;
    const keys = this.byStore.get(hit.storeId);
    if (keys) {
      keys.delete(id);
      if (keys.size === 0) this.byStore.delete(hit.storeId);
    }
  }
}

function slot(storeId: string, key: string): string {
  if (!storeId || storeId.includes(SEP)) throw new Error("ScopedCache: bad store id");
  return storeId + SEP + key;
}

declare global {
  var __sgCaches: Map<string, ScopedCache<unknown>> | undefined;
  var __sgStoreInvalidators: Map<string, (storeId: string) => void> | undefined;
}

const registry = () => (globalThis.__sgCaches ??= new Map<string, ScopedCache<unknown>>());

/**
 * The cache registered under `opts.name`, created on first use. A second call with the same name (another
 * module instance, a dev reload) gets the same cache, so every importer shares one copy per process.
 */
export function scopedCache<V>(opts: ConstructorParameters<typeof ScopedCache<V>>[0]): ScopedCache<V> {
  const caches = registry();
  const existing = caches.get(opts.name);
  if (existing) return existing as ScopedCache<V>;
  const cache = new ScopedCache<V>(opts);
  caches.set(opts.name, cache as ScopedCache<unknown>);
  return cache;
}

/**
 * Process state that is not a ScopedCache but must forget a store with it (a legacy cache until its owner
 * converts it, the export-origin union). Registered once by name; `invalidateStore` calls each.
 */
export function onStoreInvalidated(name: string, fn: (storeId: string) => void): void {
  (globalThis.__sgStoreInvalidators ??= new Map()).set(name, fn);
}

/** Drop `storeId` from every registered cache (entitlements, settings, render, stores, flags, …) and invalidator. */
export function invalidateStore(storeId: string): void {
  for (const cache of registry().values()) cache.delete(storeId);
  for (const [name, fn] of globalThis.__sgStoreInvalidators ?? []) {
    try {
      fn(storeId);
    } catch (err) {
      console.error(`[cache] invalidator "${name}" failed:`, err instanceof Error ? err.message : String(err));
    }
  }
}
