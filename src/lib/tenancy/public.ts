import "server-only";
/**
 * Public resolvers (docs/STORE-SAAS.md §E.2, §E.3 rule 6, §E.5): the only code that finds a store's row by a random
 * global key (page key, export key, media key, tracking link, kit share token, test token) or by its handle, for the
 * public route handlers (store pages, order, lead, event, upsell, track, media). Each answers a `PublicTarget` whose
 * scope every later query uses; each key lookup is annotated `// tenancy: public-key <key>`.
 *
 *   const found = await resolveStoreHandle(params.store);          // the store routes: current, renamed (308) or gone (410)
 *   const target = await resolvePublicTarget(pageKey, { purpose: "order" });
 *   const { test } = resolveTestToken(target.store, url.searchParams.get("sg-test"));
 *   const upsell = await resolveUpsellOrder(orderId);               // the one-click upsell's order → its store
 *
 * Caches (§E.5): the `stores` ScopedCache (2,000 rows, 15 s; `invalidateStore` drops a row at once), a handle
 * index (15 s, verified against the row on every hit, so a rename is seen at the next invalidation) and the misses
 * (10 s, at most 4,096 negative entries, so random handles cannot flood memory). Other processes converge within
 * the TTL (§A.5.3). Store states decide what each public surface answers: `publicStoreAnswer` (pages),
 * `publicApiAnswer` (the APIs) and `mediaServable` (media), from the §A.5.3 table.
 *
 * T3 implements the bodies in R1.0 (§K.1, ENGC-27); the maintainer owns the file from P0. `resolveProductKey` and
 * `resolveContextKey` arrive with the R2 contract step (their row types do not exist yet).
 */
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { exportsTable, mediaFiles, orders, pages, storeHandleHistory, stores } from "@/lib/db/schema";
import { PAGE_KEY_RE, versionDoc, type PageTarget, type ResolvePurpose } from "@/lib/orders/resolve";
import { safeEqual, sign } from "@/lib/security/crypto";
import { scopedCache } from "./cache";
import { isHandle } from "./handles";
import { mintScope } from "./seam";
import type { PublicTarget, StoreRow, StoreScope, StoreStatus } from "./types";

const STORE_ID_RE = /^[0-9A-Z]{26}$/;
/** "CMD-7K3Q9X" (src/lib/db/ids.ts newOrderId), any prefix of 2-8 capitals; ≤ 20 chars like orders.id */
const ORDER_ID_RE = /^[A-Z]{2,8}-[0-9A-Z]{4,11}$/;
const MEDIA_KEY_RE = /^[A-Za-z0-9._-]{8,120}$/;
/** platform-keyed entries of the caches below (§E.6: the store id "p") */
const P = "p";

/* ------------------------------------------------------------------ */
/* Store rows                                                          */
/* ------------------------------------------------------------------ */

interface CachedStore {
  row: StoreRow;
  /** `stores.suspend_notice`: a suspended store answers the neutral 503 instead of the 404 (D32) */
  suspendNotice: boolean;
}

const storeRows = scopedCache<CachedStore | null>({ name: "stores", maxEntries: 2_000, ttlMs: 15_000 });

/** The `stores` row as the seam and the public routes see it; null for a purged tombstone (no handle). */
function toStoreRow(r: typeof stores.$inferSelect): StoreRow | null {
  if (!r.handle) return null;
  return {
    id: r.id,
    handle: r.handle,
    name: r.name,
    mode: r.mode,
    status: r.status,
    planId: r.planId,
    market: r.market,
    currency: r.currency,
    timezone: r.timezone,
    defaultLocale: r.defaultLocale,
    homePageId: r.homePageId,
    brandSeed: r.brandSeed,
    catalogVersion: r.catalogVersion,
    addressVersion: r.addressVersion,
    requireMember2fa: r.requireMember2fa,
    primaryDomain: null, // verified custom domains arrive with store_domains (R3)
  };
}

function cachedStore(storeId: string): Promise<CachedStore | null> {
  if (!STORE_ID_RE.test(storeId)) return Promise.resolve(null);
  return storeRows.getOrLoad(storeId, "row", async () => {
    const [r] = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
    const row = r ? toStoreRow(r) : null;
    return row ? { row, suspendNotice: r!.suspendNotice } : null;
  });
}

/** By id, any status but purged (jobs, lifecycle, the console, a resolved public key). Cached 15 s (§E.5). */
export async function getStoreById(storeId: string): Promise<StoreRow | null> {
  return (await cachedStore(storeId))?.row ?? null;
}

/* ------------------------------------------------------------------ */
/* Handles                                                             */
/* ------------------------------------------------------------------ */

type HandleEntry = { kind: "current" | "renamed"; storeId: string } | { kind: "gone" };

const handleIndex = scopedCache<HandleEntry>({ name: "store-handles", maxEntries: 2_000, ttlMs: 15_000 });
const handleMisses = scopedCache<true>({ name: "store-handle-misses", maxEntries: 4_096, ttlMs: 10_000 });

/** What a handle answers right now, straight from the database (current handle first, then its history). */
async function loadHandle(handle: string, now: Date): Promise<{ entry: HandleEntry; ttlMs?: number } | null> {
  const [current] = await db.select({ id: stores.id }).from(stores).where(eq(stores.handle, handle)).limit(1);
  if (current) return { entry: { kind: "current", storeId: current.id } };
  // tenancy: platform handle history (a handle is global: the history row names its store)
  const [old] = await db
    .select({ storeId: storeHandleHistory.storeId, reason: storeHandleHistory.reason, redirectUntil: storeHandleHistory.redirectUntil, reservedUntil: storeHandleHistory.reservedUntil })
    .from(storeHandleHistory)
    .where(eq(storeHandleHistory.handle, handle))
    .limit(1);
  if (!old) return null;
  const left = (until: Date | null) => (until ? until.getTime() - now.getTime() : 0);
  if (old.reason === "renamed" && left(old.redirectUntil) > 0) return { entry: { kind: "renamed", storeId: old.storeId }, ttlMs: Math.min(15_000, left(old.redirectUntil)) };
  if (left(old.reservedUntil) > 0) return { entry: { kind: "gone" }, ttlMs: Math.min(15_000, left(old.reservedUntil)) };
  return null;
}

/** The result of a handle lookup for the store routes: the store at its current handle, a renamed one, or a gone one. */
export type StoreHandleLookup = { kind: "current"; store: StoreRow } | { kind: "renamed"; store: StoreRow } | { kind: "gone" };

/**
 * A handle as the public store routes see it (§C.7): the store whose current handle it is; a renamed store while
 * the old handle's redirect lasts (12 months: the route answers 308 to the new canonical URL); `gone` for a
 * deleted or purged store's handle in quarantine (the neutral 410); null otherwise. Any status: the caller applies
 * `publicStoreAnswer`. Never across stores: a history row names exactly one store.
 */
export async function resolveStoreHandle(handle: string): Promise<StoreHandleLookup | null> {
  if (!isHandle(handle)) return null;
  if (handleMisses.get(P, handle)) return null;
  for (let attempt = 0; attempt < 2; attempt++) {
    let entry = handleIndex.get(P, handle);
    if (!entry) {
      const loaded = await loadHandle(handle, new Date());
      if (!loaded) {
        handleMisses.set(P, handle, true);
        return null;
      }
      entry = handleIndex.set(P, handle, loaded.entry, loaded.ttlMs ? { ttlMs: loaded.ttlMs } : undefined);
    }
    if (entry.kind === "gone") return { kind: "gone" };
    const store = await getStoreById(entry.storeId);
    // the index can lag a rename or a purge by its TTL: a row that disagrees sends us back to the database once
    const consistent = store && (entry.kind === "current" ? store.handle === handle : store.handle !== handle);
    if (store && consistent) return { kind: entry.kind, store };
    handleIndex.delete(P, handle);
  }
  return null;
}

/** By handle (the seam, the dashboard): the current handle, else a renamed store's old handle; null otherwise. Cached. */
export async function resolveStoreByHandle(handle: string): Promise<StoreRow | null> {
  const found = await resolveStoreHandle(handle);
  return found && found.kind !== "gone" ? found.store : null;
}

/** The scope of a resolved public target (kind "public": a WriteScope, so the public order path can insert). */
export function publicScope(store: StoreRow): PublicScope {
  return mintScope("public", store.id);
}

/* ------------------------------------------------------------------ */
/* What each public surface answers per store state (§A.5.3)           */
/* ------------------------------------------------------------------ */

/**
 * Public store pages (landing, thank-you, policies, home, robots, sitemap): `live` while active or restricted
 * (published HTML unchanged); a suspended store answers the neutral 503 when the console toggled its notice, else
 * the 404 like pending, closed, scheduled_deletion and rejected stores. (Purged handles never resolve: `gone`.)
 */
export async function publicStoreAnswer(store: StoreRow): Promise<"live" | "not_found" | "unavailable"> {
  if (store.status === "active" || store.status === "restricted") return "live";
  if (store.status !== "suspended") return "not_found";
  return (await cachedStore(store.id))?.suspendNotice ? "unavailable" : "not_found";
}

export type PublicApi = "order" | "lead" | "event" | "upsell" | "track";

/**
 * The public APIs per state (§A.5.3): `open`; `unavailable` (the runtime shows its generic try-again state);
 * `ignored` (events of a pending store: 204, nothing stored); `not_found` (the tracking API outside active and
 * restricted, every API of a closed, deleted or rejected store).
 */
export function publicApiAnswer(status: StoreStatus, api: PublicApi): "open" | "unavailable" | "ignored" | "not_found" {
  switch (status) {
    case "active":
      return "open";
    case "restricted":
      return api === "order" || api === "lead" ? "unavailable" : "open";
    case "pending":
      if (api === "event") return "ignored";
      return api === "track" ? "not_found" : "unavailable";
    case "suspended":
      return api === "track" ? "not_found" : "unavailable";
    default:
      return "not_found";
  }
}

/** `/media/<key>` serves pending (drafts, previews), active and restricted stores; others 404 (§A.5.3, §G.6). */
export function mediaServable(status: StoreStatus): boolean {
  return status === "pending" || status === "active" || status === "restricted";
}

/** Private previews (`/preview/<token>`) work for pending, active and restricted stores (§A.5.3). */
export function previewServable(status: StoreStatus): boolean {
  return mediaServable(status);
}

/** Stores a public target is returned for; `publicApiAnswer` then decides per API. */
const TARGET_STATES: ReadonlySet<StoreStatus> = new Set(["pending", "active", "restricted", "suspended"]);

/* ------------------------------------------------------------------ */
/* Page and export keys                                                */
/* ------------------------------------------------------------------ */

type KeyTarget = { storeId: string; base: Omit<PageTarget, "doc"> };

/** The public scope's type: a WriteScope, so the public write path (orders, leads, beacons) can insert with it. */
export type PublicScope = StoreScope & { readonly kind: "public" };

/** A resolved page key: the store, its public scope and the published document (the order, lead and event APIs). */
export type PublicPageTarget = PublicTarget & PageTarget & { scope: PublicScope };

const pageKeys = scopedCache<KeyTarget | null>({ name: "public-keys", maxEntries: 2_000, ttlMs: 15_000 });

async function lookupPageKey(pageKey: string): Promise<KeyTarget | null> {
  // tenancy: public-key pageKey (pages.public_key is unique across stores)
  const [page] = await db
    .select({ id: pages.id, storeId: pages.storeId, status: pages.status, versionId: pages.publishedVersionId })
    .from(pages)
    .where(eq(pages.publicKey, pageKey))
    .limit(1);
  if (page) {
    if (page.status !== "published" || !page.versionId) return null;
    return { storeId: page.storeId, base: { kind: "page", storeId: page.storeId, pageId: page.id, versionId: page.versionId, exportId: null, exportMode: null, allowedOrigins: [], source: "live" } };
  }
  // tenancy: public-key exportKey (exports.public_key is unique across stores)
  const [exp] = await db
    .select({ id: exportsTable.id, storeId: exportsTable.storeId, pageId: exportsTable.pageId, versionId: exportsTable.versionId, mode: exportsTable.mode, allowedOrigins: exportsTable.allowedOrigins })
    .from(exportsTable)
    .where(and(eq(exportsTable.publicKey, pageKey), isNull(exportsTable.revokedAt)))
    .limit(1);
  if (!exp) return null;
  return {
    storeId: exp.storeId,
    base: {
      kind: "export",
      storeId: exp.storeId,
      pageId: exp.pageId,
      versionId: exp.versionId,
      exportId: exp.id,
      exportMode: exp.mode,
      allowedOrigins: Array.isArray(exp.allowedOrigins) ? exp.allowedOrigins.filter((o) => typeof o === "string") : [],
      source: "export",
    },
  };
}

/**
 * pageKey → the store and the PUBLISHED document a public request is about, via pages.public_key /
 * exports.public_key (ORD-01: the target carries its store and status). `purpose` (default "order", the strict
 * one): orders, leads and upsells read fresh page state (a just-unpublished page stops taking orders at once) and
 * accept only connected exports; "event" (analytics beacons) uses the 15 s key cache and any active export.
 * Null for an unknown key, an unpublished page, a revoked export, and a store that is closed, deleted or rejected;
 * pending, restricted and suspended stores return their target and `publicApiAnswer` decides.
 */
export async function resolvePublicTarget(pageKey: string, opts: { purpose?: ResolvePurpose } = {}): Promise<PublicPageTarget | null> {
  if (!PAGE_KEY_RE.test(pageKey)) return null;
  const purpose = opts.purpose ?? "order";
  const found = purpose === "event" ? await pageKeys.getOrLoad(P, pageKey, () => lookupPageKey(pageKey)) : await lookupPageKey(pageKey);
  if (!found) return null;
  if (purpose === "order" && found.base.kind === "export" && found.base.exportMode !== "connected") return null;
  const store = await getStoreById(found.storeId);
  if (!store || !TARGET_STATES.has(store.status)) return null;
  const scope = publicScope(store);
  const doc = await versionDoc(scope, found.base.versionId);
  if (!doc) return null;
  return { ...found.base, doc, store, scope };
}

/* ------------------------------------------------------------------ */
/* One-click upsell orders, export allow-lists                         */
/* ------------------------------------------------------------------ */

/** The upsell's order as the public upsell API sees it before the token check (ORD-17). */
export interface UpsellOrderTarget extends PublicTarget {
  scope: PublicScope;
  orderId: string;
  /** the connected export the order came from (its allow-list decides CORS), else null */
  exportId: string | null;
}

/**
 * ORD-17: the order id posted by the thank-you page's one-click upsell → its store, for stores whose public APIs
 * may answer (pending, active, restricted, suspended; `publicApiAnswer(status, "upsell")` decides). The order is
 * protected by its single-use upsell token, which `acceptUpsell` checks inside the store; an unknown id and
 * another store's id are the same null for every later step.
 */
export async function resolveUpsellOrder(orderId: string): Promise<UpsellOrderTarget | null> {
  if (!ORDER_ID_RE.test(orderId)) return null;
  // tenancy: public-key orderId (the upsell token's order; order ids are unique across stores, D28)
  const [row] = await db.select({ storeId: orders.storeId, exportId: orders.exportId }).from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!row) return null;
  const store = await getStoreById(row.storeId);
  if (!store || !TARGET_STATES.has(store.status)) return null;
  return { store, scope: publicScope(store), orderId, exportId: row.exportId };
}

/**
 * The union of the allow-lists of every active (non-revoked) export, for CORS preflights: an OPTIONS request
 * carries no page key, so this is all a preflight can be checked against (the POST then checks its own export's
 * list). Origins only, never a store id; `originAllowed` still refuses the platform's own namespace (SEC-23).
 */
export async function listActiveExportOrigins(): Promise<string[]> {
  // tenancy: platform cors-preflight (the active exports' allow-lists of every store; origins only)
  const rows = await db.select({ origins: exportsTable.allowedOrigins }).from(exportsTable).where(isNull(exportsTable.revokedAt));
  return [...new Set(rows.flatMap((r) => (Array.isArray(r.origins) ? r.origins.filter((o): o is string => typeof o === "string") : [])))];
}

/* ------------------------------------------------------------------ */
/* Signed links: order tracking (LAN-§9.1), test orders (D54)          */
/* ------------------------------------------------------------------ */

/** The query parameter of a test link (D54): the store pages render a test document, the order and lead APIs mark it. */
export const TEST_PARAM = "sg-test";

/** Tracking links live 90 days (LAN-§9.1); test links 2 hours (D54). */
export const TRACK_LINK_TTL_SEC = 90 * 86_400;
export const TEST_TOKEN_TTL_SEC = 2 * 3_600;
/** clock skew tolerated on a link's expiry (a server a little ahead of the one that signed it) */
const SKEW_SEC = 60;
const SIG_CHARS = 22;
const SIGNED_RE = /^([0-9a-z]{1,11})\.([A-Za-z0-9_-]{22})$/;

const nowSec = (now: number) => Math.floor(now / 1000);

/** Parses "<exp base36>.<sig>"; null when malformed or the expiry is not a safe positive integer. */
function parseSigned(value: string | null | undefined): { exp: number; sig: string } | null {
  const m = value ? SIGNED_RE.exec(value) : null;
  if (!m) return null;
  const exp = parseInt(m[1]!, 36);
  return Number.isSafeInteger(exp) && exp > 0 ? { exp, sig: m[2]! } : null;
}

/**
 * The `s` parameter of a signed tracking link for store `storeId`: `<exp base36>.<sig>`, sig =
 * base64url(hmac(orderId + "|" + exp, "track-link:" + storeId))[:22], exp in Unix seconds (issue + 90 days).
 * P3's `signedTrackPath` / `trackUrl` build the link with it.
 */
export function signTrackLink(storeId: string, orderId: string, now = Date.now()): string {
  const exp = nowSec(now) + TRACK_LINK_TTL_SEC;
  return `${exp.toString(36)}.${sign(`${orderId}|${exp}`, `track-link:${storeId}`).slice(0, SIG_CHARS)}`;
}

function trackLinkValid(storeId: string, orderId: string, s: string, now: number): boolean {
  const parsed = parseSigned(s);
  if (!parsed || parsed.exp < nowSec(now)) return false;
  return safeEqual(parsed.sig, sign(`${orderId}|${parsed.exp}`, `track-link:${storeId}`).slice(0, SIG_CHARS));
}

const orderStores = scopedCache<string | null>({ name: "order-stores", maxEntries: 2_000, ttlMs: 15_000 });

/**
 * LAN Q11, `/track` and `POST /api/public/track`: an order id (global, D28) → its store, for active and restricted
 * stores (§A.5.3: tracking answers 404 elsewhere). With a non-null `sig` (the `s` of a signed link) the signature
 * is checked inside, so a forged `s` and an unknown order are indistinguishable (both null). The caller still
 * checks that the effective host is one of `storeHosts(store)` and pads its answers (LAN-§9.3).
 */
export async function resolveOrderForTracking(orderId: string, sig: string | null): Promise<(PublicTarget & { orderId: string }) | null> {
  if (!ORDER_ID_RE.test(orderId)) return null;
  const storeId = await orderStores.getOrLoad(P, orderId, async () => {
    // tenancy: public-key orderId (order ids are unique across stores, D28)
    const [row] = await db.select({ storeId: orders.storeId }).from(orders).where(eq(orders.id, orderId)).limit(1);
    return row?.storeId ?? null;
  });
  if (!storeId) return null;
  const store = await getStoreById(storeId);
  if (!store || (store.status !== "active" && store.status !== "restricted")) return null;
  if (sig !== null && !trackLinkValid(store.id, orderId, sig, Date.now())) return null;
  return { store, scope: publicScope(store), orderId };
}

/**
 * The `sg-test` token of store `storeId` (D54, LAN-§14.1): `<exp base36>.<sig>`, sig =
 * base64url(hmac(String(exp), "test-order:" + storeId))[:22], exp in Unix seconds (now + 2 h). It binds the store,
 * not a page. P3's `mintTestLink` builds the URL with it.
 */
export function signTestToken(storeId: string, now = Date.now()): string {
  const exp = nowSec(now) + TEST_TOKEN_TTL_SEC;
  return `${exp.toString(36)}.${sign(String(exp), `test-order:${storeId}`).slice(0, SIG_CHARS)}`;
}

/**
 * D54: is `token` a valid test token of this store right now (signed for it, not expired, not dated beyond its
 * 2 h life)? Pure (no DB), constant-time compare. An unsigned, expired or other-store token is an ordinary visit.
 */
export function resolveTestToken(store: StoreRow, token: string | null, now = Date.now()): { test: boolean } {
  const parsed = parseSigned(token);
  if (!parsed) return { test: false };
  const t = nowSec(now);
  if (parsed.exp < t || parsed.exp > t + TEST_TOKEN_TTL_SEC + SKEW_SEC) return { test: false };
  return { test: safeEqual(parsed.sig, sign(String(parsed.exp), `test-order:${store.id}`).slice(0, SIG_CHARS)) };
}

/* ------------------------------------------------------------------ */
/* Kit shares, media keys                                              */
/* ------------------------------------------------------------------ */

/**
 * LAN Q11: `/kit/<token>` by sha256(token) = campaigns.share_token_hash. The `campaigns` table is cut in 0005 (P0)
 * and P3 fills this body in R1 product; until then no share token exists, so every token answers null (the page's
 * neutral 404).
 */
export async function resolveKitShare(token: string): Promise<(PublicTarget & { campaignId: string }) | null> {
  void token;
  return null;
}

const mediaStores = scopedCache<string | null>({ name: "media-stores", maxEntries: 8_192, ttlMs: 30 * 60_000 });

/**
 * §G.6: a media key (global, content-addressed per store, D21) → its store, for the `/media/<key>` status check.
 * Keys never change store, so the mapping is kept 30 minutes (misses 60 s); the store row itself is the 15 s cache.
 */
export async function resolveMediaKey(key: string): Promise<{ store: StoreRow; scope: StoreScope } | null> {
  if (!MEDIA_KEY_RE.test(key)) return null;
  const storeId = await mediaStores.getOrLoad(
    P,
    key,
    async () => {
      // tenancy: public-key mediaKey (media_files.key is unique across stores)
      const [row] = await db.select({ storeId: mediaFiles.storeId }).from(mediaFiles).where(eq(mediaFiles.key, key)).limit(1);
      return row?.storeId ?? null;
    },
  );
  if (!storeId) {
    mediaStores.set(P, key, null, { ttlMs: 60_000 });
    return null;
  }
  const store = await getStoreById(storeId);
  return store ? { store, scope: publicScope(store) } : null;
}

/* ------------------------------------------------------------------ */
/* Platform robots.txt                                                 */
/* ------------------------------------------------------------------ */

const indexable = scopedCache<string[]>({ name: "indexable-stores", maxEntries: 1, ttlMs: 5 * 60_000 });

/**
 * Handles of the stores the platform robots.txt lists a `Sitemap:` line for while S mode is off (§C.8): active or
 * restricted, with at least one published page. At most 5,000, cached 5 minutes.
 */
export function listIndexableStoreHandles(): Promise<string[]> {
  return indexable.getOrLoad(P, "handles", async () => {
    // tenancy: platform robots.txt (one line per live store; no store data beyond the handle)
    const rows = await db
      .select({ handle: stores.handle })
      .from(stores)
      .where(
        and(
          sql`${stores.status} IN ('active', 'restricted')`,
          sql`EXISTS (SELECT 1 FROM ${pages} WHERE ${pages.storeId} = ${stores.id} AND ${pages.status} = 'published')`,
        ),
      )
      .orderBy(stores.handle)
      .limit(5_000);
    return rows.map((r) => r.handle).filter((h): h is string => !!h && isHandle(h));
  });
}

