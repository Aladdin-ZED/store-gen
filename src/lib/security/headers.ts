/**
 * Security response headers (docs/STORE-SAAS.md §F.6, one function per response class):
 *  - baseSecurityHeaders(): every public / route-handler response (store documents add their own hash CSP).
 *  - platformUiHeaders(): base + the nonce CSP of the platform UI (console, dashboard, auth, kit, marketing),
 *    set by src/proxy.ts. Today's adminSecurityHeaders, renamed.
 *  - hstsValue(): Strict-Transport-Security per host class (rev 3, SEC-15).
 * The neutral 404 / 410 / 503 set lives next to its page (src/lib/auth/unknown-page.ts).
 * Framework-free and runtime-agnostic (no Node APIs, no server-only import) so it runs in the proxy, route
 * handlers and the export builder alike.
 */
import { platformUrl, subdomainMode } from "@/lib/edge/env";
import type { HostClass } from "@/lib/edge/host";

const isProd = () => process.env.NODE_ENV === "production";
/**
 * The site is served over HTTPS (PLATFORM_URL, else PUBLIC_URL, starts with https:). Production on Hostinger
 * always is; `npm run start` on http://localhost is not: upgrading its requests to https would break navigation.
 */
const servedOverHttps = () => platformUrl()?.protocol !== "http:";

export const HSTS_MAX_AGE = 63_072_000; // two years

/**
 * Strict-Transport-Security for a response on a host of this class. On the platform host once S mode is on,
 * `includeSubDomains`: every `*.<STORE_ROOT_DOMAIN>` is a Store Gen tenant, so a first `http://<handle>.<root>`
 * visit from an ad is protected too. Nowhere else: in P mode, on legacy hosts and on custom domains (R3) the
 * other subdomains (mail, tracking CNAMEs, a merchant's own sites) are outside our control and may not serve
 * HTTPS. `preload` waits for the owner's commitment.
 */
export function hstsValue(cls?: HostClass | null): string {
  return cls === "platform" && subdomainMode() ? `max-age=${HSTS_MAX_AGE}; includeSubDomains` : `max-age=${HSTS_MAX_AGE}`;
}

export interface SecurityHeaderOptions {
  /**
   * X-Frame-Options fallback (CSP frame-ancestors is the primary control where a CSP exists).
   * "deny" (default) · "sameorigin" for documents the admin previews in an iframe · false to omit.
   */
  frame?: "deny" | "sameorigin" | false;
  /** Strict-Transport-Security; defaults to on in production only. */
  hsts?: boolean;
  /** host class of the request (effectiveHost().cls): picks the HSTS value (hstsValue) */
  cls?: HostClass | null;
}

export const PERMISSIONS_POLICY = [
  "camera=()",
  "microphone=()",
  "geolocation=()",
  "payment=()",
  "usb=()",
  "browsing-topics=()",
].join(", ");

export function baseSecurityHeaders(opts: SecurityHeaderOptions = {}): Record<string, string> {
  const headers: Record<string, string> = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": PERMISSIONS_POLICY,
    "Cross-Origin-Opener-Policy": "same-origin",
  };
  const frame = opts.frame ?? "deny";
  if (frame) headers["X-Frame-Options"] = frame === "deny" ? "DENY" : "SAMEORIGIN";
  if (opts.hsts ?? isProd()) headers["Strict-Transport-Security"] = hstsValue(opts.cls);
  return headers;
}

/** Copies the given headers onto `target` (does not overwrite values a handler already set). */
export function applySecurityHeaders(target: Headers, headers: Record<string, string>): Headers {
  for (const [name, value] of Object.entries(headers)) {
    if (!target.has(name)) target.set(name, value);
  }
  return target;
}

/** External origins the admin may fetch from (in-browser AI models + onnxruntime wasm). */
export const ADMIN_CONNECT_SOURCES = [
  "https://huggingface.co",
  "https://*.huggingface.co",
  "https://*.hf.co",
  "https://cdn.jsdelivr.net",
] as const;

const NONCE_RE = /^[A-Za-z0-9+/]{16,64}={0,2}$/;

/** 128-bit random nonce, base64 (Web Crypto — works in every runtime). */
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** Nonce-based strict CSP for platform UI HTML (Next.js applies the nonce to its own scripts). */
export function adminCsp(nonce: string, opts: { dev?: boolean } = {}): string {
  if (!NONCE_RE.test(nonce)) throw new Error("invalid CSP nonce");
  const dev = opts.dev ?? !isProd();
  const directives: [string, string[]][] = [
    ["default-src", ["'self'"]],
    [
      "script-src",
      ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", "'wasm-unsafe-eval'", ...(dev ? ["'unsafe-eval'"] : [])],
    ],
    ["worker-src", ["'self'", "blob:"]],
    ["connect-src", ["'self'", ...ADMIN_CONNECT_SOURCES]],
    ["img-src", ["'self'", "data:", "blob:"]],
    ["media-src", ["'self'", "blob:"]],
    ["style-src", ["'self'", "'unsafe-inline'"]],
    ["font-src", ["'self'", "data:"]],
    ["frame-src", ["'self'"]],
    ["frame-ancestors", ["'none'"]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'none'"]],
    ["form-action", ["'self'"]],
    ["manifest-src", ["'self'"]],
  ];
  const parts = directives.map(([name, values]) => `${name} ${values.join(" ")}`);
  if (!dev && servedOverHttps()) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}

/** The proxy areas that render platform UI (§C.3): each gets the nonce CSP. */
export type PlatformUiArea = "console" | "app" | "auth" | "kit" | "marketing";

export interface PlatformUiOptions {
  dev?: boolean;
  /** default "console" */
  area?: PlatformUiArea;
  cls?: HostClass | null;
}

/**
 * Everything the proxy sets on a platform UI response (§F.6 "Platform UI"): base headers, the nonce CSP,
 * CORP `same-origin` and:
 *  - console, app, auth: `Referrer-Policy: same-origin`, `private, no-store`, `X-Robots-Tag: noindex`;
 *  - kit (`/kit/*`, no actions): the same with `Referrer-Policy: no-referrer` (rev 3, ENGC-16);
 *  - marketing: indexable, `public, max-age=0, s-maxage=300`.
 * "same-origin", not "no-referrer", wherever forms post: under no-referrer browsers serialize the Origin of a
 * same-origin form POST as "null" (Fetch spec), and Next's Server Actions check then rejects a form sent before
 * hydration with a 500 (the proxy answers an explicit `Origin: null` action with a 403 first, §C.3 step 4).
 * Other sites still receive no referrer at all.
 */
export function platformUiHeaders(nonce: string, opts: PlatformUiOptions = {}): Record<string, string> {
  const area = opts.area ?? "console";
  const headers: Record<string, string> = {
    ...baseSecurityHeaders({ frame: "deny", cls: opts.cls }),
    "Content-Security-Policy": adminCsp(nonce, { dev: opts.dev }),
    "Referrer-Policy": area === "kit" ? "no-referrer" : "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Cache-Control": area === "marketing" ? "public, max-age=0, s-maxage=300" : "private, no-store",
  };
  if (area !== "marketing") headers["X-Robots-Tag"] = "noindex, nofollow, noarchive";
  return headers;
}

/**
 * Every redirect the proxy produces (§C.3 step 4; the 303 gate, the 307 / 308 host moves): base headers and
 * `Cache-Control: private, no-store`. (Canonical store 308s from the store routes are `public, max-age=300`.)
 */
export function redirectHeaders(cls?: HostClass | null): Record<string, string> {
  return { ...baseSecurityHeaders({ cls }), "Cache-Control": "private, no-store" };
}
