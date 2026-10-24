/**
 * Origin policy for the public API (docs/STORE-SAAS.md §C.9; no I/O and no framework imports, so the admin's export
 * dialog can prove its allow-list entries with the same matcher; the addressing environment is read at call time
 * and reads as unset in a browser, where the server re-checks every entry anyway).
 *  - live pages: the Origin, when sent, must be one of the target STORE's hosts (`storeHosts(store)`: the platform
 *    host, its subdomain in S mode, its verified custom domains (R3), the legacy hosts), never a reflected Host
 *    outside development. In S / C mode store A's page posting store B's page key is refused (V6); in P mode every
 *    store shares the platform origin, so the Origin cannot tell A's page from B's and host-level isolation begins
 *    with S mode (SEC-23: tenant JS is forbidden, so no first-party cross-store post exists).
 *  - exports: the Origin must be on that export's allow-list → reflected in Access-Control-Allow-Origin
 *    (never "*", never credentials). An entry naming the platform's own namespace (the platform, legacy and
 *    console hosts, the store root domain and every name under it) is never honoured (SEC-23), and a wildcard
 *    must cover one registrable domain that is not shared by unrelated sites (R-D8).
 * Requests without Origin (non-browser clients) pass, flagged `noOrigin` for the risk score, unless Sec-Fetch-Site
 * says the browser sent them from another site.
 */
import { adminHostName, hostOf, isIpLiteral, legacyPlatformHosts, platformHost, storeRootDomain } from "@/lib/edge/env";
import { storeHosts, type StoreAddress } from "@/lib/urls";

interface ParsedOrigin {
  scheme: string;
  host: string; // hostname[:port], default ports dropped
}

function parseOrigin(value: string): ParsedOrigin | null {
  const v = value.trim();
  if (!v || v === "null") return null;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? v : `https://${v}`);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return { scheme: u.protocol, host: u.host.toLowerCase() };
  } catch {
    return null;
  }
}

/** Second-level labels used as registry suffixes under country TLDs ("co.ma", "com.es", "org.uk"…). */
const REGISTRY_SLD = new Set(["co", "com", "net", "org", "gov", "gouv", "ac", "edu", "or", "ne", "press"]);

/**
 * Shared hosting namespaces (the private section of the Public Suffix List, trimmed to the hosts a
 * seller is likely to use): every subdomain is a different customer's site, so "*.netlify.app" would
 * let any Netlify site post orders from its visitors' browsers. Exact origins still work.
 */
const SHARED_HOSTING_SUFFIXES = new Set([
  // static & app hosting
  "netlify.app", "github.io", "gitlab.io", "codeberg.page", "bitbucket.io",
  "pages.dev", "workers.dev", "r2.dev", "trycloudflare.com",
  "vercel.app", "vercel.dev", "now.sh",
  "web.app", "firebaseapp.com", "appspot.com", "run.app",
  "herokuapp.com", "onrender.com", "fly.dev", "railway.app", "up.railway.app",
  "glitch.me", "repl.co", "replit.app", "replit.dev", "surge.sh", "deno.dev",
  "azurewebsites.net", "azurestaticapps.net", "cloudfront.net", "amplifyapp.com",
  "ngrok.io", "ngrok.app", "ngrok-free.app", "loca.lt", "duckdns.org", "ddns.net",
  // site builders & shop platforms
  "myshopify.com", "youcan.shop", "wixsite.com", "squarespace.com", "webflow.io",
  "framer.app", "framer.website", "carrd.co", "blogspot.com", "wordpress.com", "weebly.com",
  "godaddysites.com", "zyrosite.com",
  // shared PHP hosting & temporary domains
  "hostingersite.com", "000webhostapp.com", "infinityfreeapp.com", "epizy.com",
]);

/** Cloud zones where every level below is shared between customers (bucket / region endpoints). */
const SHARED_HOSTING_ZONES = ["amazonaws.com", "windows.net", "azure.com", "googleusercontent.com"];

/** A public suffix, a shared hosting namespace or an IP literal (static lists only). */
function publicNamespace(name: string): boolean {
  const n = name.toLowerCase().replace(/:\d+$/, "");
  if (n.startsWith("[") || /^[\d.]+$/.test(n)) return true;
  const labels = n.split(".");
  if (labels.length < 2 || labels.some((l) => !l)) return true;
  if (labels.length === 2 && labels[1]!.length === 2 && REGISTRY_SLD.has(labels[0]!)) return true;
  if (SHARED_HOSTING_SUFFIXES.has(n)) return true;
  return SHARED_HOSTING_ZONES.some((z) => n === z || n.endsWith(`.${z}`));
}

/**
 * The registrable domain of a host (no Public Suffix List here): its last two labels, or three under a registry
 * second level or a shared hosting suffix ("shop.co.ma", "site.hostingersite.com"), so the platform's temporary
 * Hostinger host never claims every other Hostinger site.
 */
export function registrableDomain(host: string): string {
  const labels = host.toLowerCase().replace(/:\d+$/, "").split(".");
  if (labels.length <= 2) return labels.join(".");
  const two = labels.slice(-2).join(".");
  return publicNamespace(two) ? labels.slice(-3).join(".") : two;
}

/**
 * The zones the platform owns (SEC-23): STORE_ROOT_DOMAIN and PLATFORM_HOST's registrable domain (none for an IP
 * or single-label platform host such as localhost in development: that host alone is the platform's).
 */
function platformZones(): string[] {
  const zones = new Set<string>();
  const root = storeRootDomain();
  if (root) zones.add(root);
  const platform = platformHost()?.replace(/:\d+$/, "");
  if (platform && platform.includes(".") && !isIpLiteral(platform)) zones.add(registrableDomain(platform));
  return [...zones];
}

const within = (host: string, zone: string) => host === zone || host.endsWith(`.${zone}`);

/** `host` is the platform's own (platform, legacy or console host, or a name in a platform zone). */
function platformOwned(host: string): boolean {
  const h = hostOf(host) ?? host.toLowerCase();
  const bare = h.replace(/:\d+$/, "");
  if (h === platformHost() || h === adminHostName() || legacyPlatformHosts().has(h)) return true;
  return platformZones().some((z) => within(bare, z));
}

/**
 * Is `name` a namespace shared by unrelated sites (public suffix, shared hosting, IP literal), or one of the
 * platform's own zones (STORE_ROOT_DOMAIN, PLATFORM_HOST's registrable domain: every store lives under them)?
 */
export function sharedSuffix(name: string): boolean {
  const n = name.toLowerCase().replace(/:\d+$/, "");
  return publicNamespace(n) || platformZones().includes(n);
}

/**
 * A wildcard must cover one registrable domain of the seller: "*.shop.ma" is fine, while "*.com", "*.ma",
 * "*.co.ma", "*.netlify.app", an IP literal or anything at or under the platform's zones would let unrelated
 * sites (or every store) call the API with CORS.
 */
function wildcardBaseOk(host: string): boolean {
  if (sharedSuffix(host)) return false;
  const bare = host.toLowerCase().replace(/:\d+$/, "");
  return !platformZones().some((z) => within(bare, z));
}

export type ExportOriginProblem = "invalid" | "shared_suffix" | "platform";

/**
 * Why an allow-list entry can never be honoured, or null when it can (SEC-23): `invalid` (not an http(s) origin,
 * a bare host or a wildcard), `shared_suffix` (a wildcard over a shared namespace), `platform` (the platform,
 * legacy or console host, the store root domain or a name under it, the platform's registrable domain). The
 * export save refuses such entries (`settings.write` → invalid) and `originAllowed` skips them at check time.
 */
export function exportOriginProblem(raw: string): ExportOriginProblem | null {
  const entry = raw.trim().toLowerCase();
  const wildcard = entry.replace(/^[a-z][a-z0-9+.-]*:\/\//, "").startsWith("*.");
  const e = parseOrigin(entry.replace("*.", ""));
  if (!e) return "invalid";
  if (wildcard) {
    if (publicNamespace(e.host)) return "shared_suffix";
    return wildcardBaseOk(e.host) ? null : "platform";
  }
  return platformOwned(e.host) ? "platform" : null;
}

/**
 * Does `origin` match an allow-list entry? Entries are origins ("https://shop.ma"), bare hosts
 * ("shop.ma" → any scheme) or wildcard subdomains ("https://*.shop.ma", "*.shop.ma"). Entries that
 * `exportOriginProblem` refuses never match, and neither does an origin of the platform's own namespace.
 */
export function originAllowed(origin: string, allowed: readonly string[]): boolean {
  const o = parseOrigin(origin);
  if (!o || platformOwned(o.host)) return false;
  for (const raw of allowed) {
    const entry = raw.trim().toLowerCase();
    if (exportOriginProblem(entry)) continue;
    const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//.test(entry);
    const wildcard = entry.replace(/^[a-z][a-z0-9+.-]*:\/\//, "").startsWith("*.");
    const e = parseOrigin(entry.replace("*.", ""))!;
    if (hasScheme && e.scheme !== o.scheme) continue;
    if (wildcard ? o.host.endsWith(`.${e.host}`) : o.host === e.host) return true;
  }
  return false;
}

/** What an Origin is checked against: the target's store (null: no store resolved) and an export's allow-list. */
export interface OriginTarget {
  store: StoreAddress | null;
  /** origins allowed to call the API cross-origin (exports only; null for live pages) */
  allowedOrigins: readonly string[] | null;
}

const firstHost = (v: string | null) => hostOf(v?.split(",")[0]);

/**
 * The hosts a live page of the target may post from: `storeHosts(store)`, or with no store resolved the hosts
 * every store shares (the platform and legacy hosts). In development only, the request's own Host and
 * X-Forwarded-Host too (LAN devices, tunnels); production never reflects them (§C.9).
 */
function ownHosts(headers: Headers, store: StoreAddress | null): ReadonlySet<string> {
  const hosts = new Set<string>(store ? storeHosts(store) : legacyPlatformHosts());
  if (!store) {
    const platform = platformHost();
    if (platform) hosts.add(platform);
  }
  if (process.env.NODE_ENV !== "production") {
    for (const h of [firstHost(headers.get("host")), firstHost(headers.get("x-forwarded-host"))]) if (h) hosts.add(h);
  }
  return hosts;
}

export type OriginVerdict = { ok: true; cors: string | null; noOrigin: boolean } | { ok: false };

/**
 * Origin policy for public POSTs (§C.9): a live page's Origin must be one of its store's hosts (and the fetch not
 * cross-site); an export's Origin must be on its allow-list (→ CORS). No Origin passes, flagged `noOrigin`,
 * unless Sec-Fetch-Site shows a browser request from another site.
 */
export function checkOrigin(req: Request, target: OriginTarget): OriginVerdict {
  const origin = req.headers.get("origin");
  const site = req.headers.get("sec-fetch-site");
  if (!origin) {
    if (site && site !== "same-origin" && site !== "none") return { ok: false };
    return { ok: true, cors: null, noOrigin: true };
  }
  const o = parseOrigin(origin);
  if (!o) return { ok: false };
  if (ownHosts(req.headers, target.store).has(hostOf(o.host) ?? o.host)) {
    return site === "cross-site" ? { ok: false } : { ok: true, cors: null, noOrigin: false };
  }
  if (target.allowedOrigins && originAllowed(origin, target.allowedOrigins)) return { ok: true, cors: origin, noOrigin: false };
  return { ok: false };
}

/** CORS response headers for an allowed cross-origin caller (never "*", never credentials). */
export function corsHeaders(origin: string | null): Record<string, string> {
  const h: Record<string, string> = { Vary: "Origin" };
  if (origin) {
    h["Access-Control-Allow-Origin"] = origin;
    h["Access-Control-Allow-Methods"] = "POST, OPTIONS";
    h["Access-Control-Allow-Headers"] = "Content-Type";
    h["Access-Control-Max-Age"] = "600";
  }
  return h;
}
