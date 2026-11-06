import "server-only";
/**
 * Short-link click counters (P3 LANDING; landing.md LAN-§12.1 "Clicks", §23.4 `links.flush`; core §H.2 slot 7).
 *
 * A redirect never writes: it adds one to an in-memory counter keyed by store id, then link id, kept on `globalThis`
 * under `__sgLinkClicks` (the one name `scripts/qa/tenancy-allow.json` registers for lint L4, P0b CCR P3-9; counts
 * only, never a store's rows, and a store only ever adds to its own keys). The counters reach the table with
 *   UPDATE short_links SET clicks = clicks + ?, last_click_at = ? WHERE store_id = ? AND id = ?
 * from the `links.flush` job every tick and from the route's `after()` once a store's counts are 30 s old. A failed
 * write puts its counts back for the next flush (bounded: a store keeps at most MAX_LINKS_PER_STORE pending links).
 * Counts are labelled "clicks", never visitors: a refresh counts again.
 */
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { shortLinks } from "@/lib/db/schema";
import { errorSummary } from "@/lib/orders/log";
import { whereStore } from "@/lib/tenancy/sql";
import type { WriteScope } from "@/lib/tenancy/types";

interface Pending {
  n: number;
  last: number;
}
interface StoreClicks {
  links: Map<string, Pending>;
  /** when this store's counts were last written (or first counted) */
  since: number;
}
type ClickMap = Map<string, StoreClicks>;

/** A store's counts are written from the route's `after()` once they are this old (and by every tick). */
export const FLUSH_EVERY_MS = 30_000;
const MAX_LINKS_PER_STORE = 5_000;
const MAX_STORES = 20_000;

declare global {
  var __sgLinkClicks: Map<string, { links: Map<string, { n: number; last: number }>; since: number }> | undefined;
}
const counters = (): ClickMap => (globalThis.__sgLinkClicks ??= new Map());

/** Counts one click of store `storeId`'s link `linkId` (no I/O). */
export function recordClick(storeId: string, linkId: string, now = Date.now(), n = 1): void {
  const clicks = counters();
  let store = clicks.get(storeId);
  if (!store) {
    if (clicks.size >= MAX_STORES) return;
    store = { links: new Map(), since: now };
    clicks.set(storeId, store);
  }
  const p = store.links.get(linkId);
  if (p) {
    p.n += n;
    if (now > p.last) p.last = now;
  } else if (store.links.size < MAX_LINKS_PER_STORE) store.links.set(linkId, { n, last: now });
}

/** The clicks counted for a store and not written yet (the links screen adds them to the stored counts). */
export function pendingClicks(storeId: string): ReadonlyMap<string, { n: number; last: number }> {
  return counters().get(storeId)?.links ?? new Map();
}

/** Writes one store's pending counts; answers the number of link rows updated. */
async function flushStore(scope: WriteScope, now: number): Promise<number> {
  const clicks = counters();
  const store = clicks.get(scope.storeId);
  if (!store) return 0;
  clicks.delete(scope.storeId);
  let written = 0;
  for (const [linkId, p] of store.links) {
    try {
      await db
        .update(shortLinks)
        .set({ clicks: sql`${shortLinks.clicks} + ${p.n}`, lastClickAt: new Date(p.last) })
        .where(whereStore(shortLinks, scope, eq(shortLinks.id, linkId)));
      written++;
    } catch (err) {
      console.error("[links] click flush failed:", errorSummary(err));
      recordClick(scope.storeId, linkId, p.last, p.n);
    }
  }
  const back = clicks.get(scope.storeId);
  if (back) back.since = now;
  return written;
}

/**
 * Writes the pending counts of every store (the `links.flush` job), store by store until `deadline`; `scopeOf`
 * mints the store's scope (the job's system scope). Answers the stores and rows written.
 */
export async function flushClicks(scopeOf: (storeId: string) => WriteScope, opts: { deadline?: number; now?: () => number } = {}): Promise<{ stores: number; rows: number; done: boolean }> {
  const now = opts.now ?? Date.now;
  let stores = 0;
  let rows = 0;
  for (const storeId of [...counters().keys()]) {
    if (opts.deadline !== undefined && now() >= opts.deadline) return { stores, rows, done: false };
    rows += await flushStore(scopeOf(storeId), now());
    stores++;
  }
  return { stores, rows, done: true };
}

/** The route's `after()`: writes this store's counts when they are FLUSH_EVERY_MS old. Never throws. */
export async function flushStoreIfDue(scope: WriteScope, now = Date.now()): Promise<void> {
  const store = counters().get(scope.storeId);
  if (!store || now - store.since < FLUSH_EVERY_MS) return;
  try {
    await flushStore(scope, now);
  } catch (err) {
    console.error("[links] click flush failed:", errorSummary(err));
  }
}

/** Tests: drop every pending count. */
export function __resetClicks(): void {
  counters().clear();
}
