import "server-only";
/**
 * Effective host and host classes (docs/STORE-SAAS.md §C.2). Used by src/proxy.ts and by every route
 * handler that answers per host (D18: handlers re-verify the edge themselves; `/media/*` and the upload
 * endpoints never pass the proxy, so no handler trusts a proxy-set flag). No Next.js request APIs and no
 * shared state: plain functions of the request headers and the environment.
 *
 *  1. The Cloudflare Worker verified (x-sg-edge = EDGE_KEY or EDGE_KEY_PREV, x-sg-ts within 5 minutes):
 *     host = x-sg-host, via = "edge".
 *  2. An x-sg-edge header that does not verify (wrong key, stale timestamp, no key configured): class
 *     "invalid", the neutral 404. A direct client never sends it, so it is a rotation mistake or a forgery,
 *     never "the platform" (rev 3, SEC-4: failing open served /login on every tenant hostname).
 *  3. Otherwise host = the Host the browser addressed (requestHost), via = "direct"; x-sg-host / x-sg-ip
 *     without x-sg-edge are ignored.
 *  4. classifyHost (the §C.2 table).
 */
import { createHash } from "node:crypto";
import { IS_PROD, isInternalHost, isPlaceholderSecret, normalizeHost, normalizeIp } from "@/lib/auth/config";
import { requestHost } from "@/lib/auth/gate";
import { releaseOn } from "@/lib/auth/permissions";
import { safeEqual } from "@/lib/security/crypto";
import { RESERVED_HANDLES, isHandle } from "@/lib/tenancy/handles";
import { adminHostName, isIpLiteral, legacyPlatformHosts, platformHost, storeRootDomain } from "./env";

export { subdomainMode } from "./env";

export type HostVia = "edge" | "direct";
export type HostClass = "platform" | "console" | "legacy" | "store" | "custom" | "reserved" | "invalid" | "foreign";
export interface EffectiveHost {
  host: string;
  via: HostVia;
  cls: HostClass;
  label: string | null; // store handle for "store"
  workerVersion: string | null; // rev 3, SEC-16: x-sg-worker when the edge verified
}

/** Request headers the Worker stamps (§C.5). The proxy deletes every client-sent x-sg-* unless the edge verified. */
export const EDGE_HEADERS = {
  key: "x-sg-edge",
  host: "x-sg-host",
  ip: "x-sg-ip",
  proto: "x-sg-proto",
  worker: "x-sg-worker",
  ts: "x-sg-ts",
} as const;

/** A verified header set older (or further in the future) than this is refused: no replay from a direct client. */
export const EDGE_TS_WINDOW_MS = 5 * 60_000;

const TS_RE = /^\d{10,16}$/;
const WORKER_VERSION_RE = /^[A-Za-z0-9._-]{1,64}$/;

const digest = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

function edgeKey(name: "EDGE_KEY" | "EDGE_KEY_PREV"): string | null {
  const value = process.env[name]?.trim();
  return value && value.length >= 32 && !isPlaceholderSecret(value) ? value : null;
}

/**
 * Why the edge headers do or do not verify: `absent` (no x-sg-edge, a direct request), `verified` (with the
 * key that matched: `prev` during an EDGE_KEY rotation, logged once per hour by the caller as `prev_key`),
 * or `invalid` (the caller records error_events area `edge`, code `bad_key`).
 */
export type EdgeCheck =
  | { state: "absent" }
  | { state: "verified"; key: "current" | "prev" }
  | { state: "invalid"; reason: "bad_key" | "stale" | "unconfigured" };

export function edgeCheck(headers: Headers, now: number = Date.now()): EdgeCheck {
  const given = headers.get(EDGE_HEADERS.key);
  if (given === null) return { state: "absent" };
  const current = edgeKey("EDGE_KEY");
  const prev = edgeKey("EDGE_KEY_PREV");
  if (!current && !prev) return { state: "invalid", reason: "unconfigured" };
  // sha256 digests compared in constant time (like the cron key); both keys are always compared
  const d = digest(given);
  const isCurrent = current !== null && safeEqual(d, digest(current));
  const isPrev = prev !== null && safeEqual(d, digest(prev));
  if (!isCurrent && !isPrev) return { state: "invalid", reason: "bad_key" };
  const ts = headers.get(EDGE_HEADERS.ts)?.trim() ?? "";
  if (!TS_RE.test(ts) || Math.abs(now - Number(ts)) > EDGE_TS_WINDOW_MS) return { state: "invalid", reason: "stale" };
  return { state: "verified", key: isCurrent ? "current" : "prev" };
}

/** x-sg-edge matches EDGE_KEY or EDGE_KEY_PREV (constant time) AND x-sg-ts is within 5 minutes (rev 3, SEC-4). */
export function edgeVerified(headers: Headers, now?: number): boolean {
  return edgeCheck(headers, now).state === "verified";
}

/** x-sg-ip (Cloudflare's CF-Connecting-IP, set by the Worker), only when the edge verified. */
export function edgeClientIp(headers: Headers, now?: number): string | null {
  return edgeVerified(headers, now) ? normalizeIp(headers.get(EDGE_HEADERS.ip)) : null;
}

function workerVersionOf(headers: Headers): string | null {
  const value = headers.get(EDGE_HEADERS.worker)?.trim() ?? "";
  return WORKER_VERSION_RE.test(value) ? value : null;
}

const INVALID = { cls: "invalid", label: null } as const;

/**
 * The §C.2 table. Order matters: the platform and console hosts first (at launch STORE_ROOT_DOMAIN is the
 * platform apex), legacy hosts only when reached directly, then store subdomains (edge only), then the rest.
 * Without PLATFORM_URL / PUBLIC_URL outside production, a local host (localhost, an IP) is the platform, so
 * `next dev` works with no env; in production an unset platform host fails closed (`foreign`).
 */
export function classifyHost(host: string, via: HostVia): Omit<EffectiveHost, "host" | "via" | "workerVersion"> {
  const h = normalizeHost(host);
  if (!h) return INVALID;
  const platform = platformHost();
  if (platform !== null && h === platform) return { cls: "platform", label: null };
  if (platform === null && !IS_PROD && isInternalHost(h)) return { cls: "platform", label: null };
  const admin = adminHostName();
  if (admin !== null && h === admin) return { cls: "console", label: null };
  if (via === "direct" && legacyPlatformHosts().has(h)) return { cls: "legacy", label: null };
  if (isIpLiteral(h)) return INVALID;
  const root = storeRootDomain();
  if (root !== null && h.endsWith(`.${root}`)) {
    const label = h.slice(0, -(root.length + 1));
    if (label.includes(".")) return INVALID; // deeper (a.b.<root>), either way
    if (via !== "edge") return { cls: "foreign", label: null };
    if (RESERVED_HANDLES.has(label)) return { cls: "reserved", label: null };
    return isHandle(label) ? { cls: "store", label } : INVALID;
  }
  if (via === "edge") return { cls: releaseOn("R3") ? "custom" : "foreign", label: null }; // C mode is R3
  return { cls: "foreign", label: null };
}

/** The host this request is for, how it arrived and its class (§C.2 steps 1-4). */
export function effectiveHost(headers: Headers, opts?: { now?: number }): EffectiveHost {
  const check = edgeCheck(headers, opts?.now);
  if (check.state === "verified") {
    const host = normalizeHost(headers.get(EDGE_HEADERS.host));
    const workerVersion = workerVersionOf(headers);
    if (!host) return { host: "", via: "edge", ...INVALID, workerVersion };
    return { host, via: "edge", ...classifyHost(host, "edge"), workerVersion };
  }
  const host = requestHost(headers) ?? "";
  if (check.state === "invalid") return { host, via: "direct", ...INVALID, workerVersion: null };
  if (!host) return { host, via: "direct", ...INVALID, workerVersion: null };
  return { host, via: "direct", ...classifyHost(host, "direct"), workerVersion: null };
}
