import "server-only";
/**
 * The store profile's Activity tab, Audit view (platform.md PLA-§7.7, PL-07; core §F.5): T1's `listPlatformAudit`
 * for the store, merged with the store's view-as sessions, newest first, keyset by audit id, 50 per page.
 *
 *   const page = await listStoreActivity(ctx, storeId, { actorKind: "platform", area: "orders" }, beforeId);
 *
 * Filters: actor kind (member, platform, support view, system, API) and area go to `listPlatformAudit`; the staff
 * member and the date range are applied to the page it returns (the frozen T1 signature has no such filter; the page
 * may then hold fewer than 50 rows, the cursor stays exact). The meta is already redacted by src/lib/audit.ts; the IP
 * hash is shown short and to super_admins only. View-as sessions come from `imp_store_idx` through
 * `platformScope(ctx, storeId)` between the page's oldest and newest rows.
 */
import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { listPlatformAudit, type AuditEntry } from "@/lib/audit";
import { AuthRefusal } from "@/lib/auth/errors";
import { db } from "@/lib/db/client";
import { impersonationSessions, users } from "@/lib/db/schema";
import { whereStore } from "@/lib/tenancy/sql";
import type { PlatformCtx, StoreScope } from "@/lib/tenancy/types";
import { platformScope } from "../seam";

export const ACTIVITY_PAGE = 50;
export const ACTOR_FILTERS = ["user", "platform", "impersonation", "system", "api"] as const;
export const AREA_FILTERS = ["auth", "pages", "orders", "team", "settings", "integrations", "platform"] as const;

/** the action prefixes of each area filter */
const AREA_PREFIX: Record<(typeof AREA_FILTERS)[number], string> = {
  auth: "auth",
  pages: "page",
  orders: "orders",
  team: "store.member",
  settings: "store.settings",
  integrations: "integrations",
  platform: "platform",
};

export interface ActivityFilter {
  actorKind?: (typeof ACTOR_FILTERS)[number];
  area?: (typeof AREA_FILTERS)[number];
  staffId?: string;
  from?: string;
  to?: string;
}

export type ActivityRow =
  | {
      type: "audit";
      id: number;
      at: string;
      action: string;
      /** the member's name, the staff member's name with their role, or null for System */
      actor: { kind: AuditEntry["actorKind"]; name: string | null; impersonator: string | null };
      target: string | null;
      meta: Record<string, unknown> | null;
      /** 8 characters, super_admin only */
      ipHash: string | null;
    }
  | { type: "view"; id: string; at: string; staff: string | null; reason: string; endedAt: string | null; endedReason: string | null; ticketRef: string | null };

export interface ActivityPage {
  rows: ActivityRow[];
  /** the next page's `beforeId` */
  next: number | null;
}

async function viewsBetween(scope: StoreScope, from: Date, to: Date) {
  return db
    .select({
      id: impersonationSessions.id,
      at: impersonationSessions.startedAt,
      staffUserId: impersonationSessions.staffUserId,
      staffName: users.name,
      reason: impersonationSessions.reason,
      endedAt: impersonationSessions.endedAt,
      endedReason: impersonationSessions.endedReason,
      ticketRef: impersonationSessions.ticketRef,
    })
    .from(impersonationSessions)
    .leftJoin(users, eq(users.id, impersonationSessions.staffUserId))
    .where(whereStore(impersonationSessions, scope, and(gte(impersonationSessions.startedAt, from), lte(impersonationSessions.startedAt, to))))
    .orderBy(desc(impersonationSessions.startedAt))
    .limit(ACTIVITY_PAGE);
}

/** PLA-§7.7 (`audit.platform`). */
export async function listStoreActivity(ctx: PlatformCtx, storeId: string, filter: ActivityFilter = {}, beforeId: number | null = null): Promise<ActivityPage> {
  if (!ctx.can("console.read") || !ctx.can("audit.platform")) throw new AuthRefusal("forbidden");
  const scope = platformScope(ctx, storeId);
  const actorKind = filter.actorKind && (ACTOR_FILTERS as readonly string[]).includes(filter.actorKind) ? filter.actorKind : undefined;
  const area = filter.area && filter.area in AREA_PREFIX ? AREA_PREFIX[filter.area] : undefined;
  const entries = await listPlatformAudit(ctx, {
    storeId,
    ...(actorKind ? { actorKind } : {}),
    ...(area ? { area } : {}),
    ...(beforeId !== null && Number.isSafeInteger(beforeId) && beforeId > 0 ? { beforeId } : {}),
    limit: ACTIVITY_PAGE,
  });
  const from = filter.from && Number.isFinite(Date.parse(filter.from)) ? Date.parse(filter.from) : null;
  const to = filter.to && Number.isFinite(Date.parse(filter.to)) ? Date.parse(filter.to) : null;
  const staffId = filter.staffId && /^[0-9A-Z]{26}$/.test(filter.staffId) ? filter.staffId : null;
  const inRange = (t: number) => (from === null || t >= from) && (to === null || t < to);
  const audit: ActivityRow[] = entries
    .filter((e) => inRange(e.createdAt.getTime()) && (!staffId || e.userId === staffId || e.impersonatorId === staffId))
    .map((e) => ({
      type: "audit",
      id: e.id,
      at: e.createdAt.toISOString(),
      action: e.action,
      actor: { kind: e.actorKind, name: ctx.role === "analyst" && e.actorKind !== "user" ? null : e.actorName, impersonator: ctx.role === "analyst" ? null : e.impersonatorName },
      target: e.target,
      meta: e.meta,
      ipHash: ctx.role === "super_admin" && e.ipHash ? e.ipHash.slice(0, 8) : null,
    }));
  // the store's view-as sessions inside the page's window (none for an actor filter other than "Support view")
  let views: ActivityRow[] = [];
  if (!actorKind || actorKind === "impersonation") {
    const newest = beforeId === null ? new Date(Date.now() + 60_000) : (entries[0]?.createdAt ?? null);
    const oldest = entries.length === ACTIVITY_PAGE ? (entries[entries.length - 1]?.createdAt ?? null) : new Date(0);
    if (newest && oldest) {
      views = (await viewsBetween(scope, oldest, newest))
        .filter((v) => inRange(v.at.getTime()) && (!staffId || v.staffUserId === staffId))
        .map((v) => ({
          type: "view",
          id: v.id,
          at: v.at.toISOString(),
          staff: ctx.role === "analyst" ? null : (v.staffName ?? null),
          reason: v.reason,
          endedAt: v.endedAt?.toISOString() ?? null,
          endedReason: v.endedReason ?? null,
          ticketRef: ctx.role === "analyst" ? null : v.ticketRef,
        }));
    }
  }
  const rows = [...audit, ...views].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return { rows, next: entries.length === ACTIVITY_PAGE ? (entries[entries.length - 1]?.id ?? null) : null };
}

/**
 * The Activity tab's staff filter (`audit.platform`): the staff accounts by name, ids for the URL. Analysts read no
 * staff names (the rows hide them too), so their list is empty.
 */
export async function listStaffFilter(ctx: PlatformCtx): Promise<{ id: string; name: string }[]> {
  if (!ctx.can("console.read") || !ctx.can("audit.platform")) throw new AuthRefusal("forbidden");
  if (ctx.role === "analyst") return [];
  const rows = await db.select({ id: users.id, name: users.name }).from(users).where(sql`${users.platformRole} <> 'none'`).orderBy(asc(users.name)).limit(200);
  return rows;
}
