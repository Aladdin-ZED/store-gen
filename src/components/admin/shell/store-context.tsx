"use client";
/**
 * The store on screen, for client components (docs/STORE-SAAS.md §I.1, §C.6): every link of the dashboard is
 * `appHref(handle, …)`, every API call `apiHref(handle, …)`, every live page `<store base>/<slug>`, and controls are
 * hidden with the member's grants (the server re-checks every one through the seam). The `[store]` layout provides
 * it from the seam's ctx (`storeClientInfo`, src/lib/admin-data/shell.ts); nothing here reads the environment.
 *
 *   const store = useStore();
 *   <Link href={store.href("/orders")}>   ·   fetch(store.api("/export"))   ·   store.live(page.slug)   ·   store.can("pages.write")
 */
import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { StorePermission, StoreRole } from "@/lib/auth/permissions";
import type { StoreMode } from "@/lib/tenancy/mode";
import type { StoreStatus } from "@/lib/tenancy/types";
import { apiHref, appHref } from "@/lib/urls";

/** What the browser knows about the store on screen (serializable: the layout passes it down). */
export interface StoreClientInfo {
  id: string;
  handle: string;
  name: string;
  mode: StoreMode;
  status: StoreStatus;
  role: StoreRole;
  /** the signed-in member's own user id (the per-member keys of the browser drafts, §E.6) */
  viewerId: string;
  /** every key `ctx.can` grants this member in this store (matrix ∧ mode ∧ release ∧ state) */
  grants: readonly StorePermission[];
  /** the store's public home without a trailing slash: "https://<host>/s/<h>" (P), "https://<h>.<root>" (S) */
  liveBase: string;
  timeZone: string;
  currency: string;
}

export interface StoreView extends StoreClientInfo {
  /** "/app/<h><path>" */
  href(path?: `/${string}` | ""): string;
  /** "/api/app/<h><path>" */
  api(path: `/${string}`): string;
  /** the public URL of one of the store's pages ("" slug = the store home) */
  live(slug: string): string;
  /** the public path shown next to a page ("/s/<h>/<slug>" in P mode, "/<slug>" otherwise) */
  livePath(slug: string): string;
  can(p: StorePermission): boolean;
}

const StoreContext = createContext<StoreView | null>(null);

function viewOf(info: StoreClientInfo): StoreView {
  const grants = new Set(info.grants);
  const base = info.liveBase.replace(/\/+$/, "");
  // the path part of the base ("/s/<h>" in P mode, "" on a store host)
  const basePath = base.replace(/^https?:\/\/[^/]+/i, "");
  return {
    ...info,
    href: (path = "") => appHref(info.handle, path),
    api: (path) => apiHref(info.handle, path),
    live: (slug) => (slug ? `${base}/${slug}` : base || "/"),
    livePath: (slug) => (slug ? `${basePath}/${slug}` : basePath || "/"),
    can: (p) => grants.has(p),
  };
}

export function StoreProvider({ value, children }: { value: StoreClientInfo; children: ReactNode }) {
  const view = useMemo(() => viewOf(value), [value]);
  return <StoreContext.Provider value={view}>{children}</StoreContext.Provider>;
}

/** The store on screen; throws outside a store's dashboard (a programming error, never user input). */
export function useStore(): StoreView {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useStore() needs the store layout (<StoreProvider>)");
  return store;
}

/** The store on screen, or null (shared components that also render outside a dashboard). */
export function useOptionalStore(): StoreView | null {
  return useContext(StoreContext);
}

/**
 * A fix link of a checklist or a data helper: hrefs under "/app/" or absolute URLs pass through, store-relative
 * ones ("/settings/general") are put under the store's dashboard.
 */
export function resolveStoreHref(store: Pick<StoreView, "href"> | null, href: string): string {
  if (!href.startsWith("/") || href.startsWith("/app/") || href.startsWith("//")) return href;
  return store ? store.href(href as `/${string}`) : href;
}
