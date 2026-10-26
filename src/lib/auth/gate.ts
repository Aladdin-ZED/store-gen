/**
 * Secret admin gate.
 * Visiting "/<ADMIN_GATE>" issues a signed, HttpOnly gate cookie; without a valid one every admin
 * URL answers like an unknown page. With ADMIN_HOST set, all of this works on that host only. The signature binds the issue time and a fingerprint of the
 * current ADMIN_GATE value, so rotating ADMIN_GATE (or APP_SECRET) invalidates every gate cookie.
 * The cookie slides: the proxy re-issues it once it is a day old, so a browser in regular use
 * keeps its access; one unused for GATE_TTL_MS has to visit the gate path again.
 *
 * No Next.js request APIs here: this module runs inside src/proxy.ts as well as in server code.
 */
import "server-only";
import { createHash } from "node:crypto";
// a function-only import cycle (host.ts reads requestHost from here): nothing runs at module evaluation
import { effectiveHost } from "@/lib/edge/host";
import { safeEqual, sign } from "@/lib/security/crypto";
import { isCloudflareIp, isInternalIp } from "@/lib/security/ip";
import {
  GATE_RENEW_AFTER_MS,
  GATE_TTL_MS,
  IS_PROD,
  adminGateSecret,
  adminHost,
  adminIpAllowlist,
  isAppSecretConfigured,
  isInternalHost,
  normalizeHost,
  normalizeIp,
} from "./config";

const PURPOSE = "admin-gate";
const TOKEN_RE = /^(\d{9,11})\.([A-Za-z0-9_-]{43})$/;
const CLOCK_SKEW_MS = 5 * 60_000;

const digest = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
/**
 * Also binds ADMIN_HOST when one is set: setting or changing it voids every gate cookie, including
 * those a browser still holds for the public host from before the admin moved to its own host.
 */
const fingerprint = (gate: string) => {
  const host = adminHost();
  return digest(host ? `gate:${gate}@${host}` : `gate:${gate}`).slice(0, 24);
};

/** The gate value when the gate is usable (ADMIN_GATE valid and APP_SECRET present for signing). */
function configuredGate(): string | null {
  return isAppSecretConfigured() ? adminGateSecret() : null;
}

/** Exact match on "/<ADMIN_GATE>", compared via digests so response timing leaks nothing. */
export function isGatePath(pathname: string): boolean {
  const gate = configuredGate();
  if (!gate) return false;
  return safeEqual(digest(pathname), digest(`/${gate}`));
}

export function issueGateToken(now: number = Date.now()): string {
  const gate = configuredGate();
  if (!gate) throw new Error("ADMIN_GATE / APP_SECRET are not configured");
  const issued = Math.floor(now / 1000);
  return `${issued}.${sign(`${issued}.${fingerprint(gate)}`, PURPOSE)}`;
}

/** Issue time (ms) of a valid, unexpired gate token; null for anything else. */
export function gateTokenIssuedAt(token: string | null | undefined, now: number = Date.now()): number | null {
  const gate = configuredGate();
  if (!gate || !token) return null;
  const m = TOKEN_RE.exec(token);
  if (!m) return null;
  const issued = Number(m[1]);
  const age = now - issued * 1000;
  if (age < -CLOCK_SKEW_MS || age > GATE_TTL_MS) return null;
  return safeEqual(m[2]!, sign(`${issued}.${fingerprint(gate)}`, PURPOSE)) ? issued * 1000 : null;
}

export function verifyGateToken(token: string | null | undefined, now: number = Date.now()): boolean {
  return gateTokenIssuedAt(token, now) !== null;
}

/** True when a valid token is old enough to be re-issued (keeps regular users gated in). */
export function shouldRenewGateToken(issuedAt: number, now: number = Date.now()): boolean {
  return now - issuedAt >= GATE_RENEW_AFTER_MS;
}

export function gateCookieOptions() {
  return {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: "lax" as const,
    path: "/",
    maxAge: Math.floor(GATE_TTL_MS / 1000),
  };
}

/**
 * The address ADMIN_IP_ALLOWLIST is matched against. security/ip's clientIp() serves rate limiting
 * and prefers CF-Connecting-IP / the left-most X-Forwarded-For entry — both are written by the
 * client, so an access-control check must not use them. The right-most X-Forwarded-For entry is
 * the one appended by the proxy in front of the app (Next only fills the header when it is absent),
 * i.e. the address that actually connected. Behind a second proxy layer (an extra CDN) that hop is
 * the CDN, and the allowlist fails closed.
 *
 * Behind Cloudflare (docs/STORE-SAAS.md §B.7, rev 3 SEC-14): with BEHIND_CLOUDFLARE=1 and the right-most
 * public hop inside Cloudflare's published ranges, the visitor is CF-Connecting-IP (Cloudflare overwrites it,
 * and only a Cloudflare edge can be that hop); a Cloudflare hop without the header fails closed (null). Any
 * other hop keeps today's rule, so a forged CF-Connecting-IP sent straight to the origin is never read. The
 * Worker's `x-sg-ip` is never read either: the console never runs on store hosts.
 */
export function allowlistAddress(headers: Headers): string | null {
  const hops = (headers.get("x-forwarded-for") ?? "").split(",");
  if (process.env.BEHIND_CLOUDFLARE === "1") {
    for (let i = hops.length - 1; i >= 0; i--) {
      const hop = normalizeIp(hops[i]);
      if (!hop || isInternalIp(hop)) continue;
      if (isCloudflareIp(hop)) return normalizeIp(headers.get("cf-connecting-ip"));
      break;
    }
  }
  for (let i = hops.length - 1; i >= 0; i--) {
    const hop = normalizeIp(hops[i]);
    if (hop) return hop;
  }
  return normalizeIp(headers.get("x-real-ip"));
}

/** ADMIN_IP_ALLOWLIST check (empty list → allowed). */
export function isAdminIpAllowed(headers: Headers): boolean {
  const allow = adminIpAllowlist();
  if (allow.length === 0) return true;
  const address = allowlistAddress(headers);
  return address !== null && allow.includes(address);
}

/**
 * The host the browser addressed. `Host` wins: browsers set it, page scripts cannot (unlike
 * X-Forwarded-Host, which fetch() may send), and the proxy in front of the app passes it on. Only when
 * that proxy replaced it with an internal address (missing, an IP literal or a single-label name such
 * as "localhost") is X-Forwarded-Host used, and then its right-most entry, the one that proxy wrote.
 */
export function requestHost(headers: Headers): string | null {
  const host = normalizeHost(headers.get("host"));
  if (host && !isInternalHost(host)) return host;
  const forwarded = (headers.get("x-forwarded-host") ?? "").split(",");
  for (let i = forwarded.length - 1; i >= 0; i--) {
    const hop = normalizeHost(forwarded[i]);
    if (hop) return hop;
  }
  return host;
}

/**
 * ADMIN_HOST check on the §C.2 effective host class, like the proxy (CCR r1.0-t3-2): true on the console host
 * (ADMIN_HOST), or on the platform host while no ADMIN_HOST is set; never on a store, custom, legacy, reserved,
 * invalid or foreign host. Outside production local hosts are `platform`, so development keeps working.
 */
export function isAdminHost(headers: Headers): boolean {
  const cls = effectiveHost(headers).cls;
  return adminHost() === null ? cls === "platform" : cls === "console";
}

/** The whole gate check outside the proxy: admin host, IP allowlist and a valid gate cookie. */
export function hasGateAccess(token: string | null | undefined, headers: Headers): boolean {
  return isAdminHost(headers) && isAdminIpAllowed(headers) && verifyGateToken(token);
}
