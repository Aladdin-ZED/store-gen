/**
 * Hash-based strict Content-Security-Policy for rendered landing / thank-you documents.
 * Pure and isomorphic; the hashes come from the exact inline <script>/<style> texts of the document.
 *
 *  script-src      'sha256-<runtime>' 'strict-dynamic' + hosts  (CSP3: only the hashed runtime + what it
 *                                                                loads — the pixel loaders; CSP2 browsers,
 *                                                                which ignore 'strict-dynamic', get the
 *                                                                configured platforms' script hosts only)
 *  style-src-elem  'sha256-<style>'                              (the single inlined stylesheet)
 *  style-src-attr  'unsafe-inline'                               (style attributes carry ONLY CSS custom
 *                                                                properties such as --rot / --pos; all text
 *                                                                is escaped by React, so no CSS injection)
 *  style-src       'unsafe-inline'                               (fallback for pre-2022 Safari/Chrome that
 *                                                                ignore the -elem/-attr split)
 *  connect-src     'self' + pixel hosts (+ <app>/api/public/)    (live: 'self' becomes <origin>/api/public/
 *                                                                per request, scopeToPublicApi; exports
 *                                                                keep 'self' = their own static host)
 *  form-action     'self' (+ <app>/api/public/)                  (idem)
 *
 * Isolation rule. Through 'strict-dynamic', every script the vendor loaders pull in runs with this
 * document's origin, and live pages share that origin with /admin and /api/admin unless ADMIN_HOST
 * gives the admin its own host. A same-origin script carries the admin's cookies, so nothing of
 * that origin outside the public API may be reachable from it: connect-src / form-action never keep
 * a bare 'self' or a bare app origin on a live document (the stored 'self' is narrowed per request
 * by scopeToPublicApi), and the documents are served with a COOP that differs from the admin's
 * (serve.server). Origin storage (localStorage, IndexedDB, Cache Storage) stays shared while the
 * origin is shared, so the four pixel loaders (fixed vendor URLs, ids checked by regex) are the only
 * third-party code a live document may load: no "custom head script", chat widget or other vendor
 * tag is added to the renderer unless the admin is on its own origin.
 */

export interface PixelFlags {
  meta?: boolean;
  tiktok?: boolean;
  snap?: boolean;
  ga4?: boolean;
}

export interface LandingCspInput {
  mode: "live" | "export";
  /** CSP source expressions for every executable inline <script>, e.g. "sha256-AbC…=" */
  scriptHashes: readonly string[];
  /** CSP source expressions for every inline <style> */
  styleHashes: readonly string[];
  pixels: PixelFlags;
  /**
   * origins of API endpoints that are not same-origin (connected exports → the app's origin); only
   * their public API path (PUBLIC_API_PATH) is allowed, never the whole origin
   */
  apiOrigins?: readonly string[];
  /**
   * origins media is served from when it is not the document's own (S / C modes: the platform host, R-D11,
   * docs/STORE-SAAS.md §C.9); added to img-src and media-src. P-mode documents load /media/* from 'self'.
   */
  mediaOrigins?: readonly string[];
  /** Cloudflare Turnstile widget embedded */
  turnstile?: boolean;
  /** live pages: add upgrade-insecure-requests (off for http://localhost development) */
  upgradeInsecureRequests?: boolean;
}

interface PixelHosts {
  /** where the loader and its own sub-scripts come from (CSP2 fallback; CSP3 uses 'strict-dynamic') */
  script: readonly string[];
  img: readonly string[];
  connect: readonly string[];
}

/**
 * Hosts of each ad pixel — its scripts, its image beacons and its fetch/sendBeacon endpoints. Only
 * the platforms a document actually configures are added (PixelFlags).
 */
export const PIXEL_HOSTS: Record<keyof PixelFlags, PixelHosts> = {
  // fbevents.js + signals/config/<id> scripts; events: www.facebook.com/tr (image, beacon or fetch)
  meta: {
    script: ["https://connect.facebook.net"],
    img: ["https://www.facebook.com"],
    connect: ["https://www.facebook.com", "https://connect.facebook.net"],
  },
  // events.js + its main/config chunks; events: analytics.tiktok.com/api/v2/pixel; events.js also
  // enriches with the visitor's IPv6 address (analytics-ipv6.tiktokw.us/ipv6/enrich_ipv6)
  tiktok: {
    script: ["https://analytics.tiktok.com"],
    img: ["https://analytics.tiktok.com"],
    connect: ["https://analytics.tiktok.com", "https://analytics-ipv6.tiktokw.us"],
  },
  // scevent.min.js; events: tr.snapchat.com/p (tr-shadow mirrors it)
  snap: {
    script: ["https://sc-static.net"],
    img: ["https://tr.snapchat.com", "https://tr-shadow.snapchat.com", "https://sc-static.net"],
    connect: ["https://tr.snapchat.com", "https://tr-shadow.snapchat.com", "https://sc-static.net"],
  },
  // Google's documented GA4 policy (+ *.g.doubleclick.net, used when Google Signals is on)
  ga4: {
    script: ["https://*.googletagmanager.com"],
    img: ["https://*.googletagmanager.com", "https://*.google-analytics.com", "https://*.g.doubleclick.net"],
    connect: [
      "https://*.googletagmanager.com",
      "https://*.google-analytics.com",
      "https://*.analytics.google.com",
      "https://*.g.doubleclick.net",
    ],
  },
};

const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";
const HASH_SOURCE = /^sha(256|384|512)-[A-Za-z0-9+/]+={0,2}$/;
const ORIGIN = /^https?:\/\/[a-z0-9.-]+(?::\d{1,5})?$/;

/**
 * Path prefix of every endpoint the landing runtime calls (PUBLIC_ENDPOINTS, connected exports).
 * The trailing slash makes the CSP source a prefix match: /api/public/order, /api/public/lead…
 */
export const PUBLIC_API_PATH = "/api/public/";

/** "https://shop.ma" → "https://shop.ma/api/public/" (the origin must already be validated). */
const publicApiSource = (origin: string) => `${origin}${PUBLIC_API_PATH}`;

/** Directives whose same-origin part is narrowed to the public API on live documents. */
const SCOPED_DIRECTIVES = new Set(["connect-src", "form-action"]);

const quoteHashes = (hashes: readonly string[]) => [...new Set(hashes.filter((h) => HASH_SOURCE.test(h)))].map((h) => `'${h}'`);

/** Origin ("https://host[:port]") of an absolute URL, or null for relative / non-http URLs. */
export function originOf(url: string): string | null {
  try {
    if (!/^https?:\/\//i.test(url)) return null;
    const o = new URL(url).origin.toLowerCase();
    return ORIGIN.test(o) ? o : null;
  } catch {
    return null;
  }
}

export function buildLandingCsp(input: LandingCspInput): string {
  const scripts = quoteHashes(input.scriptHashes);
  const styles = quoteHashes(input.styleHashes);
  const img = new Set<string>(["'self'", "data:"]);
  const connect = new Set<string>(["'self'"]);
  const scriptHosts = new Set<string>();
  for (const key of Object.keys(PIXEL_HOSTS) as (keyof PixelFlags)[]) {
    if (!input.pixels[key]) continue;
    for (const h of PIXEL_HOSTS[key].script) scriptHosts.add(h);
    for (const h of PIXEL_HOSTS[key].img) img.add(h);
    for (const h of PIXEL_HOSTS[key].connect) connect.add(h);
  }
  const media = [...new Set((input.mediaOrigins ?? []).filter((o) => ORIGIN.test(o)))];
  for (const o of media) img.add(o);
  const api = [...new Set((input.apiOrigins ?? []).filter((o) => ORIGIN.test(o)))].map(publicApiSource);
  for (const s of api) connect.add(s);
  if (input.turnstile) {
    connect.add(TURNSTILE_ORIGIN);
    scriptHosts.add(TURNSTILE_ORIGIN);
  }

  const directives: [string, readonly string[]][] = [
    ["default-src", ["'self'"]],
    // 'strict-dynamic' (CSP3) ignores the host list; CSP2 browsers fall back to it — only the
    // configured vendors' script hosts, never a blanket https:
    ["script-src", scripts.length ? [...scripts, "'strict-dynamic'", ...scriptHosts] : ["'none'"]],
    ["style-src", ["'self'", "'unsafe-inline'"]],
    ["style-src-elem", styles.length ? styles : ["'none'"]],
    ["style-src-attr", ["'unsafe-inline'"]],
    ["img-src", [...img]],
    ["font-src", ["'self'"]],
    ["connect-src", [...connect]],
    ["media-src", ["'self'", ...media]],
    ["frame-src", input.turnstile ? [TURNSTILE_ORIGIN] : ["'none'"]],
    ["worker-src", ["'none'"]],
    ["manifest-src", ["'self'"]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'none'"]],
    ["form-action", ["'self'", ...api]],
  ];
  // frame-ancestors / upgrade-insecure-requests only work as response headers (live pages);
  // exports may ship the policy in a <meta> tag where both are ignored.
  if (input.mode === "live") directives.push(["frame-ancestors", ["'none'"]]);
  const parts = directives.map(([name, values]) => `${name} ${values.join(" ")}`);
  if (input.mode === "live" && input.upgradeInsecureRequests !== false) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}

/**
 * Narrows a stored live policy to the origin(s) the document is served from: in connect-src and
 * form-action, 'self' becomes "<origin>/api/public/" for each origin. A same-origin script — any
 * sub-resource of a pixel loader — can still call the public API, but can no longer fetch, beacon
 * or post to /admin/**, /api/admin/** or anything else the admin's cookies unlock. Every other
 * directive is copied unchanged. Applies to policies stored before this rule too (served per request).
 *
 * `origins`: where the browser may be showing the document (PUBLIC_URL's origin, the request's own
 * host). With none usable the policy is returned as is: a page that cannot reach its own API would
 * silently stop taking orders.
 */
export function scopeToPublicApi(csp: string, origins: readonly string[]): string {
  const sources = [...new Set(origins.map((o) => o.toLowerCase()).filter((o) => ORIGIN.test(o)))].map(publicApiSource);
  if (!sources.length) return csp;
  return csp
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [name = "", ...values] = part.split(/\s+/);
      const isSelf = (v: string) => v.toLowerCase() === "'self'";
      if (!SCOPED_DIRECTIVES.has(name.toLowerCase()) || !values.some(isSelf)) return part;
      return [name, ...new Set([...sources, ...values.filter((v) => !isSelf(v))])].join(" ");
    })
    .join("; ");
}
