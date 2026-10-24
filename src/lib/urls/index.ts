/**
 * URL builders (docs/STORE-SAAS.md §C.6, OS-03). Every link in published HTML, canonical / og / JSON-LD,
 * CAPI `event_source_url`, sitemaps, "view live" links and e-mails is built here; no `/admin` or `/${slug}`
 * literal stays in src/** (lint L8). Pure functions of the store row and the environment, no DB.
 *
 * Isomorphic on purpose: client components import `appHref` / `apiHref` (they need no environment). The
 * builders that read the environment (origins, store bases, media and console URLs) refuse to run in a
 * browser, where every server variable reads as unset and they would silently build P-mode or relative URLs:
 * the server computes those and passes the strings down.
 *
 * Addressing modes (§C.1): C (verified primary custom domain, R3) > S (subdomain, STORE_ROOT_DOMAIN + EDGE_KEY)
 * > P (path, `/s/<handle>` on the platform host; always available).
 */
import { releaseOn } from "@/lib/auth/permissions";
import { adminHostName, legacyPlatformHosts, platformHost, platformUrl, storeRootDomain, subdomainMode } from "@/lib/edge/env";

export interface StoreAddress {
  id: string;
  handle: string;
  primaryDomain?: string | null;
}
export type AddressMode = "P" | "S" | "C";

function serverOnly(fn: string): void {
  if (typeof window !== "undefined") throw new Error(`urls.${fn}() reads server configuration; compute it on the server and pass the string`);
}

/** the verified primary custom domain; C mode ships in R3, so it is ignored before then */
function primaryDomainOf(store: StoreAddress): string | null {
  const d = store.primaryDomain?.trim().toLowerCase();
  return d && releaseOn("R3") ? d : null;
}

export function addressMode(store: StoreAddress): AddressMode {
  serverOnly("addressMode");
  if (primaryDomainOf(store)) return "C";
  return subdomainMode() ? "S" : "P";
}

/** "https://<PLATFORM_HOST>" (the scheme of PLATFORM_URL, so http://localhost works in dev); "" when unset (relative links). */
export function platformOrigin(): string {
  serverOnly("platformOrigin");
  return platformUrl()?.origin ?? "";
}

/** P: platformOrigin(); S: "https://<h>.<root>"; C: "https://<domain>" */
export function storeOrigin(store: StoreAddress): string {
  const mode = addressMode(store);
  if (mode === "C") return `https://${primaryDomainOf(store)}`;
  if (mode === "S") return `https://${store.handle}.${storeRootDomain()}`;
  return platformOrigin();
}

/** path prefix for in-page links (D48): "/s/<h>" in P mode, "" in S and C */
export function storeBase(store: StoreAddress): "" | `/s/${string}` {
  return addressMode(store) === "P" ? `/s/${store.handle}` : "";
}

/** storeBase + path (absolute path, no origin). The store home is "/s/<h>" in P mode, never "/s/<h>/" (ENGC-15). */
export function storePath(store: StoreAddress, path: `/${string}`): string {
  const base = storeBase(store);
  return base && path === "/" ? base : `${base}${path}`;
}

/** absolute canonical URL */
export function storeUrl(store: StoreAddress, path: `/${string}` = "/"): string {
  return `${storeOrigin(store)}${storePath(store, path)}`;
}

/** every host the store owns (§C.9): the platform host, its subdomain in S mode, a verified custom domain, the legacy hosts */
export function storeHosts(store: StoreAddress): ReadonlySet<string> {
  serverOnly("storeHosts");
  const hosts = new Set<string>();
  const platform = platformHost();
  if (platform) hosts.add(platform);
  if (subdomainMode()) hosts.add(`${store.handle}.${storeRootDomain()}`);
  const custom = primaryDomainOf(store);
  if (custom) hosts.add(custom);
  for (const legacy of legacyPlatformHosts()) hosts.add(legacy);
  return hosts;
}

/** P: "/media/<key>"; S/C: platformOrigin() + "/media/<key>" (media is served by the platform host, R-D11) */
export function mediaUrl(store: StoreAddress, key: string): string {
  const path = `/media/${encodeURIComponent(key)}`;
  return addressMode(store) === "P" ? path : `${platformOrigin()}${path}`;
}

/** "/app/<h><path>" (the tenant dashboard; the URL is the store context, D1) */
export function appHref(handle: string, path: `/${string}` | "" = ""): string {
  return `/app/${handle}${path}`;
}

/**
 * rev 4 (PLA Q4.2): "https://<ADMIN_HOST>/admin<path>" when ADMIN_HOST is set (from the domain move, D44),
 * else the relative "/admin<path>". `consoleHref()` is "/admin", never "/admin/".
 */
export function consoleHref(path: `/${string}` = "/"): string {
  serverOnly("consoleHref");
  const rest = path === "/" ? "" : path;
  const admin = adminHostName();
  if (!admin) return `/admin${rest}`;
  const scheme = platformUrl()?.protocol === "http:" ? "http" : "https";
  return `${scheme}://${admin}/admin${rest}`;
}

/** "/api/app/<h><path>" */
export function apiHref(handle: string, path: `/${string}`): string {
  return `/api/app/${handle}${path}`;
}

/** platformOrigin() + "/preview/<token>" (D20: private previews live on the platform host only) */
export function previewUrl(token: string): string {
  return `${platformOrigin()}/preview/${encodeURIComponent(token)}`;
}

const REPORT_PATH_MAX = 300;

/**
 * rev 4 (CRIT15, PLA Q4.1): the one "Report this store" URL every renderer uses (landing footer, Shell
 * fallback, thank-you, tracking, legal pages, store chrome): platformOrigin() + "/report/<handle>" + (pagePath
 * ? "?p=" + encodeURIComponent(path without its query, ≤ 300 chars) : ""). Never an order id, a token or a
 * query string; always absolute (store hosts 404 /report/*). Undefined in every export (the caller's rule).
 */
export function reportUrl(store: StoreAddress, pagePath?: string): string {
  const base = `${platformOrigin()}/report/${store.handle}`;
  const path = pagePath?.split(/[?#]/)[0]?.slice(0, REPORT_PATH_MAX) ?? "";
  return path ? `${base}?p=${encodeURIComponent(path)}` : base;
}
