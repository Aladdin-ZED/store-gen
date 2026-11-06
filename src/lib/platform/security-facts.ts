import "server-only";
/**
 * The Security facts of the console (platform.md PLA-§14.3 "Security settings", D44 rev 3, SEC-14): read-only lines
 * the owner checks before the domain move. No secret and no address list is answered: the allowlist says configured
 * or not with its count, and the one address the current request was matched with (the viewer's own).
 *
 *   const f = await securityFacts(ctx, await headers());
 *   // f.allowlist.source === "cloudflare" behind Cloudflare, f.adminHostMissing in S mode without ADMIN_HOST (red)
 */
import { and, gt, inArray, ne, sql } from "drizzle-orm";
import { AuthRefusal } from "@/lib/auth/errors";
import { adminHost, adminIpAllowlist } from "@/lib/auth/config";
import { allowlistAddress } from "@/lib/auth/gate";
import { db } from "@/lib/db/client";
import { sessions, users } from "@/lib/db/schema";
import { subdomainMode } from "@/lib/edge/env";
import type { PlatformCtx } from "@/lib/tenancy/types";

export interface SecurityFacts {
  /** the console gate (§B.7) is always on: every /admin route needs staff, TOTP and a gate cookie */
  gate: true;
  allowlist: { configured: boolean; count: number; source: "right_most" | "cloudflare"; matched: string | null; admitted: boolean };
  adminHost: string | null;
  sMode: boolean;
  /** S mode on and ADMIN_HOST unset: `console.security.admin_host_missing` (red) */
  adminHostMissing: boolean;
  staff: { total: number; withTotp: number };
  /** staff sessions seen in the last 24 h */
  sessions24h: number;
}

/** `staff.manage`: the facts of PLA-§14.3, for the request in hand. */
export async function securityFacts(ctx: PlatformCtx, headers: Headers, now: Date = new Date()): Promise<SecurityFacts> {
  if (!ctx.can("staff.manage")) throw new AuthRefusal("forbidden");
  const list = adminIpAllowlist();
  const matched = allowlistAddress(headers);
  const host = adminHost();
  const sMode = subdomainMode();
  // tenancy: platform staff accounts (users_prole_idx): two counts over the platform roles, no store data
  const [staff] = await db
    .select({ total: sql<number>`COUNT(*)`, withTotp: sql<number>`COALESCE(SUM(${users.totpEnabled} = 1), 0)` })
    .from(users)
    .where(ne(users.platformRole, "none"));
  // tenancy: platform staff sessions of the last 24 h (a count; the sessions table holds no store data)
  const [live] = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(sessions)
    .where(and(gt(sessions.lastSeenAt, new Date(now.getTime() - 86_400_000)), inArray(sessions.userId, db.select({ id: users.id }).from(users).where(ne(users.platformRole, "none")))));
  return {
    gate: true,
    allowlist: {
      configured: list.length > 0,
      count: list.length,
      source: process.env.BEHIND_CLOUDFLARE === "1" ? "cloudflare" : "right_most",
      matched,
      admitted: list.length === 0 || (matched !== null && list.includes(matched)),
    },
    adminHost: host,
    sMode,
    adminHostMissing: sMode && !host,
    staff: { total: Number(staff?.total ?? 0), withTotp: Number(staff?.withTotp ?? 0) },
    sessions24h: Number(live?.n ?? 0),
  };
}
