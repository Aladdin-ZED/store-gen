/**
 * The server provider's process state (P7 AI; ai.md AI-§B.1, AI-§B.2, AI-§B.9, AI-§B.10, AI-§B.11; docs/STORE-SAAS.md
 * §E.6, tenancy lint L4). The client, the breaker, the class semaphores, the class marks and the fast cooling are
 * platform state (no store data): they live in one `scopedCache` under the platform store id "p", so every module
 * instance (route bundles, a dev reload) shares one copy per process, and nothing here is a bare global.
 *
 *   - `processState(key, create)`: the value, created once;
 *   - `readProcessState` / `writeProcessState` / `dropProcessState`: a mark with an expiry the caller keeps in the value
 *     (the class marks' 24 h, the fast route's 10 minutes); the cache's own TTL is a year, so nothing expires under a
 *     run in flight.
 */
import { scopedCache } from "@/lib/tenancy/cache";

const P = "p";
const YEAR_MS = 365 * 86_400_000;
const state = scopedCache<unknown>({ name: "ai-process-state", maxEntries: 32, ttlMs: YEAR_MS });

/** The process value under `key`, created on first use. */
export function processState<T>(key: string, create: () => T): T {
  const hit = state.get(P, key);
  if (hit !== undefined) return hit as T;
  return state.set(P, key, create()) as T;
}

export function readProcessState<T>(key: string): T | undefined {
  return state.get(P, key) as T | undefined;
}

export function writeProcessState<T>(key: string, value: T): void {
  state.set(P, key, value);
}

export function dropProcessState(key: string): void {
  state.delete(P, key);
}
