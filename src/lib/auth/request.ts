/**
 * Request-scoped helpers for Server Components, Server Actions and Route Handlers.
 */
import "server-only";
import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import { clientIp } from "@/lib/security/ip";
import { getRequestIdentity, identityHeaders } from "@/lib/tenancy/context";
import { verifiedRequestPath } from "@/lib/edge/path-sig";
import { DEVICE_COOKIE, GATE_COOKIE, NONCE_HEADER } from "./config";
import { hasGateAccess } from "./gate";
import { deviceMarkerFromCookieHeader, isDeviceMarker } from "./identity";
import { safeAdminPath } from "./paths";

export interface RequestContext {
  /** client IP (see security/ip.ts for the proxy trust model) */
  ip: string;
  /** user agent, control characters stripped, ≤ 300 chars */
  ua: string;
}

/** The caller's IP and user agent; inside runAsIdentity (tests, §E.4) from the identity's headers. */
export async function getRequestContext(): Promise<RequestContext> {
  const identity = getRequestIdentity();
  const h = identity ? (identityHeaders(identity) ?? new Headers()) : await headers();
  return {
    ip: clientIp(h),
    ua: (h.get("user-agent") ?? "").replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 300),
  };
}

/** The `__Host-sgd` device marker of the request (set by T3's proxy, PLA Q.3), or null; inside runAsIdentity from its Cookie header. */
export async function getDeviceMarker(): Promise<string | null> {
  const identity = getRequestIdentity();
  if (identity) return deviceMarkerFromCookieHeader(identityHeaders(identity)?.get("cookie"));
  const value = (await cookies()).get(DEVICE_COOKIE)?.value;
  return isDeviceMarker(value) ? value : null;
}

/**
 * Re-checks the admin gate (signed cookie + optional IP allowlist + ADMIN_HOST when set) inside the
 * app. The proxy already enforces it; this is defense in depth for every admin page, action and route
 * handler, e.g. a server action reached through a public path on the public host.
 */
export async function hasAdminAccess(): Promise<boolean> {
  const [c, h] = await Promise.all([cookies(), headers()]);
  return hasGateAccess(c.get(GATE_COOKIE)?.value, h);
}

/** Responds exactly like an unknown URL when the gate check fails. */
export async function assertAdminAccess(): Promise<void> {
  if (!(await hasAdminAccess())) notFound();
}

/** The per-request CSP nonce set by the proxy (pass to next/script or next-themes `nonce`). */
export async function getCspNonce(): Promise<string | undefined> {
  return (await headers()).get(NONCE_HEADER) ?? undefined;
}

/** Path + query of the current admin request (set by the proxy), when safe to redirect back to. */
export async function getRequestedAdminPath(): Promise<string | null> {
  return safeAdminPath(verifiedRequestPath(await headers()));
}
