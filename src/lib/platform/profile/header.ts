import "server-only";
/**
 * The store profile's header (platform.md PLA-§7.1, PL-07; TN-03, PD35, PD56): what `stores/[id]/layout.tsx` renders
 * on every tab. The store row is read **fresh** (not the 15 s store cache): a lifecycle action just taken must show.
 *
 *   const h = await getStoreHeader(ctx, storeId);   // null → the console's own "No store with this id"
 *
 * Everything about the store goes through `platformScope(ctx, storeId)` and the normal repositories: the owners
 * (`listMembersByScope`), the health row (`getStoreHealth`), the open requests (`listStoreRequests`), the open purge
 * request, and the store's active view-as sessions (a store-scoped read of `impersonation_sessions`). Seller contact
 * follows PD35 (masked for support and analysts).
 */
import { and, asc, eq, gt, isNull } from "drizzle-orm";
import { AuthRefusal } from "@/lib/auth/errors";
import { db } from "@/lib/db/client";
import { impersonationSessions, plans, stores, users } from "@/lib/db/schema";
import { LEGACY_STORE_ID } from "@/lib/db/store-handles";
import type { HealthFlag, HealthGroup } from "@/lib/health/types";
import { listMembersByScope } from "@/lib/tenancy/invites";
import { whereStore } from "@/lib/tenancy/sql";
import type { PlatformCtx, StoreScope, StoreStatus } from "@/lib/tenancy/types";
import { storeUrl } from "@/lib/urls";
import { notificationKind } from "@/lib/notify/registry";
import { getStoreHealth } from "../health-snapshot";
import { IMPERSONATION_REASONS, type ImpersonationReason } from "../impersonation";
import { closedFromOf, openPurgeRequest } from "../lifecycle-preview";
import { storeLocaleOf } from "../lifecycle-rules";
import { sellerContact, type Masked } from "../mask";
import { kindText, labelsOf } from "../notify-kinds";
import { NOTICE_FROM, NOTICE_TO } from "./notice";
import { optional } from "../panel";
import { listStoreRequests } from "../requests";
import { platformScope } from "../seam";

const ID_RE = /^[0-9A-Z]{26}$/;
/** a live store: its public pages answer (PLA-§7.1 "Open live store" is disabled with a reason otherwise) */
const LIVE_STATES: ReadonlySet<StoreStatus> = new Set(["active", "restricted"]);

export interface StoreHeader {
  store: {
    id: string;
    handle: string | null;
    name: string;
    status: StoreStatus;
    statusReason: string | null;
    statusChangedAt: string | null;
    mode: "landing" | "store" | "both";
    plan: { id: string; name: string | null };
    market: string;
    currency: string;
    timezone: string;
    defaultLocale: string;
    createdAt: string;
    suspendNotice: boolean;
    /** plan `internal` or store #1 (TN-03) */
    internal: boolean;
  };
  owners: { userId: string; firstName: string; email: string | Masked; twoFactor: boolean }[];
  health: { score: number; attention: number; components: Record<HealthGroup, number>; flags: HealthFlag[]; computedAt: string; dirty: boolean } | null;
  /** open store requests and reviews ("2 requests") */
  openRequests: number;
  /** active view-as sessions of other staff ("Karim is viewing this store until 14:32"), and this staff's own */
  impersonations: { staffUserId: string; staffName: string | null; expiresAt: string; self: boolean }[];
  /** the open purge request (banner) */
  pendingPurge: { id: string; mode: "four_eyes" | "delayed"; executeAfter: string | null } | null;
  /** a closed store's reopen deadline (`purge_after`) */
  reopenDeadline: string | null;
  /** "Open live store": the URL, or why it is disabled */
  live: { url: string } | { disabled: "not_live" | "no_handle" };
  /** a closed store reopens to the state it was closed from (the lifecycle menu's Reopen target) */
  closedFrom: StoreStatus | null;
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? "";

/** The store row, fresh (PLA-§7.1: not the 15 s cache). */
async function freshStore(storeId: string) {
  const [row] = await db
    .select({
      id: stores.id,
      handle: stores.handle,
      name: stores.name,
      status: stores.status,
      statusReason: stores.statusReason,
      statusChangedAt: stores.statusChangedAt,
      mode: stores.mode,
      planId: stores.planId,
      planName: plans.name,
      market: stores.market,
      currency: stores.currency,
      timezone: stores.timezone,
      defaultLocale: stores.defaultLocale,
      createdAt: stores.createdAt,
      suspendNotice: stores.suspendNotice,
      purgeAfter: stores.purgeAfter,
    })
    .from(stores)
    .leftJoin(plans, eq(plans.id, stores.planId))
    .where(eq(stores.id, storeId))
    .limit(1);
  return row ?? null;
}

/** The store's active view-as sessions (imp_store_idx), with the staff names. */
export async function activeViews(scope: StoreScope, now: Date = new Date()): Promise<{ staffUserId: string; staffName: string | null; expiresAt: Date }[]> {
  const rows = await db
    .select({ staffUserId: impersonationSessions.staffUserId, expiresAt: impersonationSessions.expiresAt, staffName: users.name })
    .from(impersonationSessions)
    .leftJoin(users, eq(users.id, impersonationSessions.staffUserId))
    .where(whereStore(impersonationSessions, scope, and(isNull(impersonationSessions.endedAt), gt(impersonationSessions.expiresAt, now))))
    .orderBy(asc(impersonationSessions.expiresAt))
    .limit(20);
  return rows.map((r) => ({ staffUserId: r.staffUserId, staffName: r.staffName ?? null, expiresAt: r.expiresAt }));
}

/** PLA-§7.1 (`console.read`): null for an unknown id (the console's own not-found state). */
export async function getStoreHeader(ctx: PlatformCtx, storeId: string, now: Date = new Date()): Promise<StoreHeader | null> {
  if (!ctx.can("console.read")) throw new AuthRefusal("forbidden");
  if (!ID_RE.test(storeId)) return null;
  const row = await freshStore(storeId);
  if (!row) return null;
  const scope = platformScope(ctx, storeId);
  const [members, health, requests, views, purge, closedFrom] = await Promise.all([
    listMembersByScope(scope),
    optional("header.health", () => getStoreHealth(scope), { storeId }),
    optional("header.requests", () => listStoreRequests(scope), { storeId }),
    activeViews(scope, now),
    optional("header.purge", () => openPurgeRequest(scope), { storeId }),
    row.status === "closed" ? optional("header.closed_from", () => closedFromOf(scope), { storeId }) : Promise.resolve(null),
  ]);
  const owners = members
    .filter((m) => m.role === "owner" && m.status === "active")
    .map((m) => ({ userId: m.userId, firstName: firstName(m.name), email: sellerContact(ctx.role, { email: m.email, phone: null }).email, twoFactor: m.totpEnabled }));
  const live: StoreHeader["live"] = !row.handle ? { disabled: "no_handle" } : LIVE_STATES.has(row.status) ? { url: storeUrl({ id: row.id, handle: row.handle }) } : { disabled: "not_live" };
  return {
    store: {
      id: row.id,
      handle: row.handle,
      name: row.name,
      status: row.status,
      statusReason: row.statusReason,
      statusChangedAt: row.statusChangedAt?.toISOString() ?? null,
      mode: row.mode,
      plan: { id: row.planId, name: row.planName ?? null },
      market: row.market,
      currency: row.currency,
      timezone: row.timezone,
      defaultLocale: row.defaultLocale,
      createdAt: row.createdAt.toISOString(),
      suspendNotice: row.suspendNotice,
      internal: row.planId === "internal" || row.id === LEGACY_STORE_ID,
    },
    owners,
    health: health ? { score: health.score, attention: health.attention, components: health.components, flags: health.flags ?? [], computedAt: health.computedAt, dirty: health.dirty } : null,
    openRequests: (requests ?? []).filter((r) => r.status === "pending" || r.status === "needs_info").length,
    impersonations: views.map((v) => ({ staffUserId: v.staffUserId, staffName: ctx.role === "analyst" ? null : v.staffName, expiresAt: v.expiresAt.toISOString(), self: v.staffUserId === ctx.user.id })),
    pendingPurge: purge ?? null,
    reopenDeadline: row.status === "closed" || row.status === "scheduled_deletion" ? (row.purgeAfter?.toISOString() ?? null) : null,
    live,
    closedFrom: closedFrom ?? null,
  };
}

/**
 * PLA-§10.1: the exact notification the store's owners will read when a view starts (`store.impersonation_started`,
 * in the store's default locale), one per reason. The window's times are the `NOTICE_FROM` / `NOTICE_TO` stand-ins:
 * the sheet replaces them with the chosen duration from "now", formatted like `displayVar` in the store's time zone.
 */
export function viewAsNotice(store: { defaultLocale: string; timezone: string }): { locale: "ar" | "fr" | "en"; byReason: Record<ImpersonationReason, { title: string; body: string | null }> } {
  const locale = storeLocaleOf(store.defaultLocale);
  const kind = "store.impersonation_started";
  const labels = labelsOf(notificationKind(kind));
  const byReason = Object.fromEntries(IMPERSONATION_REASONS.map((reason) => [reason, kindText(kind, labels, { reason, from: NOTICE_FROM, to: NOTICE_TO }, locale, store.timezone, null)])) as Record<ImpersonationReason, { title: string; body: string | null }>;
  return { locale, byReason };
}
