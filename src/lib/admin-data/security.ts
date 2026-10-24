import "server-only";
/**
 * Account security helpers for Settings → Security / Team: the signed-in devices of a user,
 * revoking one of them, temporary passwords for invited users, the store's audit log with user names, and
 * the owner's view of the proxy headers the client IP is read from.
 *
 * Multi-tenant (docs/STORE-SAAS.md §E.3, §F.5, ADM-25): the audit log is the scope's store only, and its target labels
 * resolve only the store's own pages and members (never a name from another store). Devices and sessions are the
 * signed-in user's own (no store).
 */
import { randomInt } from "node:crypto";
import { and, desc, eq, gt, inArray, like, lt, type SQL } from "drizzle-orm";
import { headers } from "next/headers";
import { audit } from "@/lib/audit";
import { adminIpAllowlist } from "@/lib/auth/config";
import { allowlistAddress } from "@/lib/auth/gate";
import { db } from "@/lib/db/client";
import { auditLog, pages, sessions, storeMembers, users } from "@/lib/db/schema";
import { deleteSession } from "@/lib/auth/session";
import { clientIpReport, type ClientIpReport } from "@/lib/security/ip";
import { inStore, whereStore } from "@/lib/tenancy/sql";
import type { StoreScope } from "@/lib/tenancy/types";

export interface DeviceSession {
  id: string;
  current: boolean;
  device: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
}

/** "Chrome · Windows" style label from a user agent (best effort, no fingerprinting). */
export function describeUserAgent(ua: string | null): string {
  if (!ua) return "Unknown device";
  const browser =
    /Edg\//.test(ua) ? "Edge"
    : /OPR\//.test(ua) ? "Opera"
    : /SamsungBrowser\//.test(ua) ? "Samsung Internet"
    : /Firefox\//.test(ua) ? "Firefox"
    : /Chrome\//.test(ua) ? "Chrome"
    : /Safari\//.test(ua) ? "Safari"
    : "Browser";
  const os =
    /iPhone|iPad|iPod/.test(ua) ? "iOS"
    : /Android/.test(ua) ? "Android"
    : /Windows/.test(ua) ? "Windows"
    : /Mac OS X|Macintosh/.test(ua) ? "macOS"
    : /Linux/.test(ua) ? "Linux"
    : "";
  return os ? `${browser} · ${os}` : browser;
}

export async function listDeviceSessions(userId: string, currentId: string): Promise<DeviceSession[]> {
  const rows = await db
    .select({ id: sessions.id, ua: sessions.ua, createdAt: sessions.createdAt, lastSeenAt: sessions.lastSeenAt, expiresAt: sessions.expiresAt })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), eq(sessions.mfaPassed, true), gt(sessions.expiresAt, new Date())))
    .orderBy(desc(sessions.lastSeenAt));
  return rows
    .map((r) => ({
      id: r.id,
      current: r.id === currentId,
      device: describeUserAgent(r.ua),
      createdAt: r.createdAt.toISOString(),
      lastSeenAt: r.lastSeenAt.toISOString(),
      expiresAt: r.expiresAt.toISOString(),
    }))
    .sort((a, b) => Number(b.current) - Number(a.current));
}

/** End one of the user's own sessions (never someone else's). */
export async function revokeDeviceSession(userId: string, sessionId: string, actor: { ip?: string | null }): Promise<boolean> {
  if (!/^[a-f0-9]{64}$/.test(sessionId)) return false;
  const [row] = await db.select({ id: sessions.id }).from(sessions).where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId))).limit(1);
  if (!row) return false;
  await deleteSession(row.id);
  await audit("auth.sessions.revoked", { userId, target: userId, meta: { count: 1 }, ip: actor.ip });
  return true;
}

const TEMP_ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Readable temporary password (4 groups of 4, ~94 bits) — shown once to the owner who creates it. */
export function temporaryPassword(): string {
  const groups: string[] = [];
  for (let g = 0; g < 4; g++) {
    let s = "";
    for (let i = 0; i < 4; i++) s += TEMP_ALPHABET[randomInt(TEMP_ALPHABET.length)];
    groups.push(s);
  }
  return groups.join("-");
}

export interface AuditRow {
  id: number;
  action: string;
  target: string | null;
  /** human name of the target when it is a page or a user that still exists */
  targetLabel: string | null;
  meta: Record<string, unknown> | null;
  createdAt: string;
  user: { id: string; name: string; email: string } | null;
}

/** Audit areas offered as filters (action prefixes). */
export const AUDIT_AREAS = ["auth", "page", "orders", "blocklist", "media", "settings", "export"] as const;
export type AuditArea = (typeof AUDIT_AREAS)[number];

/** The store's audit entries (newest first, keyset-paginated) with the acting user resolved. */
export async function auditPage(
  scope: StoreScope,
  opts: { beforeId?: number; area?: AuditArea; userId?: string; limit?: number },
): Promise<{ items: AuditRow[]; nextBefore: number | null }> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
  const where: SQL[] = [];
  if (opts.beforeId !== undefined) where.push(lt(auditLog.id, opts.beforeId));
  if (opts.userId) where.push(eq(auditLog.userId, opts.userId));
  if (opts.area) where.push(like(auditLog.action, `${opts.area}.%`));
  const rows = await db
    .select({ id: auditLog.id, action: auditLog.action, target: auditLog.target, meta: auditLog.meta, createdAt: auditLog.createdAt, userId: auditLog.userId, name: users.name, email: users.email })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.userId))
    .where(whereStore(auditLog, scope, ...where))
    .orderBy(desc(auditLog.id))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  const labels = await targetLabels(scope, page);
  return {
    items: page.map((e) => ({
      id: e.id,
      action: e.action,
      target: e.target,
      targetLabel: (e.target && labels.get(e.target)) ?? null,
      meta: e.meta ?? null,
      createdAt: e.createdAt.toISOString(),
      user: e.userId && e.name && e.email ? { id: e.userId, name: e.name, email: e.email } : null,
    })),
    nextBefore: rows.length > limit ? (page[page.length - 1]?.id ?? null) : null,
  };
}

const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/** Names for the store's page and member ids found in audit targets (one query per kind). */
async function targetLabels(scope: StoreScope, rows: { action: string; target: string | null }[]): Promise<Map<string, string>> {
  const pageIds = new Set<string>();
  const userIds = new Set<string>();
  for (const r of rows) {
    if (!r.target || !ULID_RE.test(r.target)) continue;
    if (r.action.startsWith("page.")) pageIds.add(r.target);
    else if (r.action.startsWith("auth.")) userIds.add(r.target);
  }
  const [pageRows, userRows] = await Promise.all([
    pageIds.size ? db.select({ id: pages.id, name: pages.name }).from(pages).where(whereStore(pages, scope, inArray(pages.id, [...pageIds]))) : Promise.resolve([]),
    userIds.size
      ? db
          .select({ id: users.id, name: users.name })
          .from(users)
          .innerJoin(storeMembers, eq(storeMembers.userId, users.id))
          .where(and(inStore(storeMembers, scope), inArray(users.id, [...userIds])))
      : Promise.resolve([]),
  ]);
  return new Map([...pageRows, ...userRows].map((r) => [r.id, r.name]));
}

/**
 * The current request as the app sees it behind the host's proxies (Settings → Security, owners
 * only): the address rate limits and the order blocklist use must be the viewer's own public IP,
 * or TRUSTED_PROXY_HOPS does not match the proxies in front of the app. The viewer's own request
 * only; nothing here is logged or stored.
 */
export interface NetworkView extends ClientIpReport {
  /** ADMIN_IP_ALLOWLIST is set */
  allowlistSet: boolean;
  /** the address ADMIN_IP_ALLOWLIST is matched against (always the right-most valid entry) */
  allowlistIp: string | null;
  behindCloudflare: boolean;
}

export async function requestNetworkView(): Promise<NetworkView> {
  const h = await headers();
  return {
    ...clientIpReport(h),
    allowlistSet: adminIpAllowlist().length > 0,
    allowlistIp: allowlistAddress(h)?.slice(0, 64) ?? null,
    behindCloudflare: process.env.BEHIND_CLOUDFLARE === "1",
  };
}
