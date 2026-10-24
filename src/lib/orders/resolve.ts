import "server-only";
/**
 * The PUBLISHED document a public request is about (never a draft), in the target's store.
 *  - the page key itself is resolved by `resolvePublicTarget` (src/lib/tenancy/public.ts, the only code that finds
 *    a row by a random global key, docs/STORE-SAAS.md §E.3 rule 6): pages.public_key → the page's store, its
 *    published version; exports.public_key → the export's store, the version baked into it (ORD-01:
 *    `PageTarget.storeId` comes from the key's row, never from input)
 *  - this module reads the versions of a resolved target, inside its store: the parsed document (cached per
 *    store and version id: versions never change), the version an order is validated against, and whether a
 *    published HTML embeds a Turnstile site key.
 *
 * orderVersion(scope, target, payload) — which published version an order is validated against
 * (docs/OFFERS.md §G.2): the version the shopper saw while it was replaced less than 72 h ago, else
 * the current one with `fallback` (the validation then answers "stale" on any mismatch).
 */
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { pageVersions } from "@/lib/db/schema";
import type { PageDoc } from "@/lib/page/schema";
import { scopedCache } from "@/lib/tenancy/cache";
import { byId, whereStore } from "@/lib/tenancy/sql";
import type { StoreScope } from "@/lib/tenancy/types";
import { chooseOrderVersion, orderDocOf } from "./versions";

export const PAGE_KEY_RE = /^[a-zA-Z0-9_-]{8,80}$/;

export interface PageTarget {
  kind: "page" | "export";
  /** the store of the key's row (pages.store_id / exports.store_id) */
  storeId: string;
  pageId: string;
  versionId: string;
  exportId: string | null;
  exportMode: "connected" | "php" | "whatsapp" | null;
  /** origins allowed to call the API cross-origin (exports only) */
  allowedOrigins: string[];
  doc: PageDoc;
  source: "live" | "export";
}

/** "order": orders/leads/upsells (connected exports only) · "event": analytics (any active export). */
export type ResolvePurpose = "order" | "event";

/** Parsed version documents per (store, version id); null caches "no such version in this store" briefly. */
const docs = scopedCache<PageDoc | null>({ name: "version-docs", maxEntries: 64, ttlMs: 60 * 60_000 });
/** Does a version's HTML embed a site key, per (store, version id + key). */
const captcha = scopedCache<boolean>({ name: "version-captcha", maxEntries: 500, ttlMs: 60 * 60_000 });
const MISS_TTL_MS = 10_000;

async function loadDoc(where: ReturnType<typeof byId>, versionId: string): Promise<PageDoc | null> {
  const [row] = await db.select({ doc: pageVersions.doc }).from(pageVersions).where(where).limit(1);
  return row ? orderDocOf(row.doc, versionId) : null;
}

/** Parsed, validated document of a page version of the scope's store (cached; versions never change). */
export function versionDoc(scope: StoreScope, versionId: string): Promise<PageDoc | null>;
/** @deprecated single-tenant (T4's order detail): pass the scope */
export function versionDoc(versionId: string): Promise<PageDoc | null>;
export async function versionDoc(...args: [StoreScope, string] | [string]): Promise<PageDoc | null> {
  if (typeof args[0] === "string") {
    const versionId = args[0];
    // tenancy: legacy single-tenant read, removed with its last caller (T4 moves to the scoped form)
    const [row] = await db.select({ doc: pageVersions.doc }).from(pageVersions).where(eq(pageVersions.id, versionId)).limit(1);
    return row ? orderDocOf(row.doc, versionId) : null;
  }
  const [scope, versionId] = args as [StoreScope, string];
  const hit = docs.get(scope.storeId, versionId);
  if (hit !== undefined) return hit;
  const doc = await loadDoc(byId(pageVersions, scope, versionId), versionId);
  return docs.set(scope.storeId, versionId, doc, doc ? undefined : { ttlMs: MISS_TTL_MS });
}

export { STALE_WINDOW_MS } from "./versions";

export interface OrderVersion {
  versionId: string;
  doc: PageDoc;
  /** the current version, used although the shopper may have seen another one: mismatches answer "stale" */
  fallback: boolean;
}

/**
 * The version an order is validated against (§G.2, rule in ./versions.ts chooseOrderVersion): an
 * export's pinned version; on live pages the version the shopper's tab was rendered from while it was
 * replaced less than 72 h ago, else the current one with `fallback`. A database error falls back to the
 * current version without `fallback` (v1 behaviour). Every read stays in the scope's store.
 */
export async function orderVersion(scope: StoreScope, target: PageTarget, payload: { v?: unknown; ver?: unknown }, now = Date.now()): Promise<OrderVersion> {
  const current: OrderVersion = { versionId: target.versionId, doc: target.doc, fallback: false };
  if (target.kind === "export") return current;
  if (payload.v === 2 && payload.ver === target.versionId) return current;
  try {
    const rows = await db
      .select({ id: pageVersions.id, createdAt: pageVersions.createdAt, runtimeV: pageVersions.runtimeV })
      .from(pageVersions)
      .where(whereStore(pageVersions, scope, eq(pageVersions.pageId, target.pageId), eq(pageVersions.kind, "publish")))
      .orderBy(desc(pageVersions.createdAt))
      .limit(200);
    const choice = chooseOrderVersion(target.versionId, rows, payload, now);
    if (choice.versionId === target.versionId) return { ...current, fallback: choice.fallback };
    const doc = await versionDoc(scope, choice.versionId);
    return doc ? { versionId: choice.versionId, doc, fallback: false } : { ...current, fallback: true };
  } catch (err) {
    console.error("[orders] version lookup failed, using the current version:", err instanceof Error ? err.message : "unknown error");
    return current;
  }
}

/**
 * @deprecated pageKey → target without its store row: use `resolvePublicTarget` (src/lib/tenancy/public.ts), which
 * answers the store, its public scope and the same fields. Kept for the re-export in ./index until T4 drops it.
 */
export async function resolvePageKey(pageKey: string, purpose: ResolvePurpose): Promise<PageTarget | null> {
  const { resolvePublicTarget } = await import("@/lib/tenancy/public");
  return resolvePublicTarget(pageKey, { purpose });
}

/** Does the published HTML of this version (in the scope's store) embed the Turnstile widget for `siteKey`? (cached) */
export async function versionEmbedsSiteKey(scope: StoreScope, versionId: string, siteKey: string): Promise<boolean> {
  const key = `${versionId}:${siteKey}`;
  const hit = captcha.get(scope.storeId, key);
  if (hit !== undefined) return hit;
  const [row] = await db
    .select({ found: sql<number>`LOCATE(${siteKey}, COALESCE(${pageVersions.html}, ''))` })
    .from(pageVersions)
    .where(byId(pageVersions, scope, versionId))
    .limit(1);
  return captcha.set(scope.storeId, key, Number(row?.found ?? 0) > 0);
}
