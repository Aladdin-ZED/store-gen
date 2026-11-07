import "server-only";
/**
 * Where a short link goes (P3 LANDING; landing.md LAN-§12.1 "Destination", rev 3 SEC-6, LD14).
 *
 * The destination is resolved from the row's typed reference inside the store's scope at redirect time, never read
 * from a string: no column of `short_links` holds a path or a host, so `//evil.example/x`, `/\evil.example` and
 * `https://…` can neither be stored nor redirected to.
 *   page    → the page of this store (`byId`), `status = 'published'`, its kind served by the store's mode → "/<slug>"
 *             (the slug re-asserted against the store slug rule)
 *   home    → "/"
 *   policy  → `target_ref` ∈ POLICY_KINDS → "/policies/<kind>"
 *   R2 product / collection, or anything else → null (the route answers the store's 404)
 *
 * Every path leaves through `assertStoreRelativePath`, whose branded return type is the only `StoreRelativePath`
 * there is: `linkLocation` takes nothing else, so no string can reach `Location` without passing the assertion.
 */
import { db } from "@/lib/db/client";
import { pages, type shortLinks } from "@/lib/db/schema";
import { isStoreSlug } from "@/lib/render/publish.server";
import { getStoreSetting } from "@/lib/settings";
import { modeAllows, type StoreMode } from "@/lib/tenancy/mode";
import { getStoreById } from "@/lib/tenancy/public";
import { byId } from "@/lib/tenancy/sql";
import type { StoreScope } from "@/lib/tenancy/types";
import { storePath, type StoreAddress } from "@/lib/urls";
import { isPolicyKind } from "./types";

declare const STORE_RELATIVE: unique symbol;
/** A path of the store, checked by `assertStoreRelativePath` (the only producer of this type). */
export type StoreRelativePath = `/${string}` & { readonly [STORE_RELATIVE]: true };

export class UnsafeLinkPathError extends Error {
  constructor(readonly reason: string) {
    super(`unsafe link path: ${reason}`);
    this.name = "UnsafeLinkPathError";
  }
}

/** The characters a store path may hold: the slug alphabet and "/" (slugs, "policies/<kind>"). */
const PATH_CHARS = /^\/[a-z0-9/-]*$/;

/**
 * Throws unless `path` is a path of the store's own origin: it starts with exactly one "/", holds no "\", no "//",
 * no ":" before its first "/", no control, whitespace or NUL byte, no percent escape and nothing outside the slug
 * alphabet. The rule a future target kind must also meet (LAN-§12.1).
 */
export function assertStoreRelativePath(path: string): StoreRelativePath {
  if (typeof path !== "string" || path.length === 0) throw new UnsafeLinkPathError("empty");
  if (path.length > 200) throw new UnsafeLinkPathError("too long");
  if (/[\u0000-\u0020\u007f-\u00a0\u2028\u2029\ufeff]/.test(path)) throw new UnsafeLinkPathError("control or whitespace");
  if (path.includes("\\")) throw new UnsafeLinkPathError("backslash");
  const colon = path.indexOf(":");
  const slash = path.indexOf("/");
  if (colon >= 0 && (slash < 0 || colon < slash)) throw new UnsafeLinkPathError("scheme");
  if (!path.startsWith("/")) throw new UnsafeLinkPathError("not absolute");
  if (path.includes("//")) throw new UnsafeLinkPathError("double slash");
  if (path.includes("%")) throw new UnsafeLinkPathError("escape");
  if (!PATH_CHARS.test(path)) throw new UnsafeLinkPathError("characters");
  return path as StoreRelativePath;
}

/** The redirect `Location` of a resolved link: `storePath(store, path)` plus the query of the query rule. */
export function linkLocation(store: StoreAddress, path: StoreRelativePath, query: string): string {
  const base = storePath(store, path);
  return query ? `${base}?${query}` : base;
}

type LinkRef = Pick<typeof shortLinks.$inferSelect, "targetKind" | "pageId" | "targetRef">;

export interface ResolveOpts {
  /** the store's mode and its `landing.inStoreMode` setting (read through the scope when left out) */
  mode?: StoreMode;
  landingInStoreMode?: boolean;
}

/** Does the store's mode serve a page of this kind (landing pages: `modeAllows(…, "landing")`; the rest: the storefront)? */
export function kindServed(kind: string, mode: StoreMode, landingInStoreMode: boolean): boolean {
  return kind === "landing" ? modeAllows(mode, "landing", { landingInStoreMode }) : modeAllows(mode, "storefront");
}

async function modeOf(scope: StoreScope, opts: ResolveOpts): Promise<{ mode: StoreMode; inStore: boolean }> {
  const mode = opts.mode ?? (await getStoreById(scope.storeId))?.mode ?? "landing";
  const inStore = opts.landingInStoreMode ?? (mode === "store" ? (await getStoreSetting(scope, "landing")).inStoreMode : false);
  return { mode, inStore };
}

/**
 * The store-relative path a link row opens now, or null (unknown kind, a page of another store, a page no longer
 * published or hidden by the mode, a policy kind that is not served, an R2 kind). Never throws for a bad row: a path
 * that would break the rule answers null, so the route's answer is the 404 (LAN-§12.3).
 */
export async function resolveLinkTarget(scope: StoreScope, row: LinkRef, opts: ResolveOpts = {}): Promise<StoreRelativePath | null> {
  let path: string;
  switch (row.targetKind) {
    case "home":
      path = "/";
      break;
    case "policy":
      if (!isPolicyKind(row.targetRef)) return null;
      path = `/policies/${row.targetRef}`;
      break;
    case "page": {
      if (!row.pageId) return null;
      const [page] = await db
        .select({ slug: pages.slug, kind: pages.kind, status: pages.status, versionId: pages.publishedVersionId })
        .from(pages)
        .where(byId(pages, scope, row.pageId))
        .limit(1);
      if (!page || page.status !== "published" || !page.versionId || !isStoreSlug(page.slug)) return null;
      const { mode, inStore } = await modeOf(scope, opts);
      if (!kindServed(page.kind, mode, inStore)) return null;
      path = `/${page.slug}`;
      break;
    }
    default:
      // R2 product / collection: not served in R1
      return null;
  }
  try {
    return assertStoreRelativePath(path);
  } catch {
    return null;
  }
}
