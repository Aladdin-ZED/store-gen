import "server-only";
/**
 * The lifecycle sheet's preview (platform.md PLA-§8.0 step 1, PD54; PL-08): read-only, nothing is written and
 * nothing is audited ("the preview itself is audited only when the action follows"). The rules it decides with are
 * ./lifecycle-rules.ts, the same ones `runLifecycleAction` enforces (./lifecycle-actions.ts).
 *
 *   const p = await lifecyclePreview(ctx, storeId, "restricted", { reason: "fake_orders" });
 *   p.storeSees.banner          // "Les commandes sont en pause : Fausses commandes. Vos pages restent en ligne."
 *   p.affects.agentsWithLease   // 3 ("3 agents hold a lease: it is released")
 *   p.cooldown.typedHandleRequired
 *
 * Sources, each in parallel and on its own (a failing or still-stubbed one leaves its numbers null and is named in
 * `affects.unavailable`, never a guessed 0): T4 `listPagesForConsole` (live pages), P4 `queueCounts` (open orders,
 * callbacks due, agents online), the store's orders with a live lease (agents holding one: what P4's
 * `releaseAllLeases` releases), P5 `integrationHealth` (what pauses, core §A.5.3), P8 `renderSummary` (pending
 * renders), the store's open review rows, the store row (status, dates, the last change). One store's data only,
 * through `platformScope(ctx, storeId)`; the store row is read fresh (never the 15 s cache: the cooldown and the
 * stale-`from` check need the row as it is). The result is cached 10 s per (store, target, reason) in
 * `scopedCache("lifecycle-preview")`; `transitionStore`'s `invalidateStore` drops it. Budget ≤ 400 ms (PLA-§L).
 */
import { countDistinct, desc, eq, gt, inArray, isNotNull, sql } from "drizzle-orm";
import { listPagesForConsole } from "@/lib/admin-data/pages";
import { AuthRefusal } from "@/lib/auth/errors";
import { db } from "@/lib/db/client";
import { auditLog, orders, platformRequests, signupReviews, stores, users } from "@/lib/db/schema";
import { integrationHealth } from "@/lib/integrations/health";
import { renderSummary } from "@/lib/jobs/renders";
import { notificationKind } from "@/lib/notify/registry";
import { queueCounts } from "@/lib/orders/profile";
import { getPlatformSetting } from "@/lib/settings";
import { scopedCache } from "@/lib/tenancy/cache";
import { whereStore } from "@/lib/tenancy/sql";
import type { PlatformCtx, StoreScope, StoreStatus } from "@/lib/tenancy/types";
import type { AuditAction } from "@/lib/audit";
import type { NotificationKind } from "@/lib/notify/registry";
import {
  cooldownState,
  isQueueEdge,
  lifecycleActionOf,
  predictedDates,
  reasonAllowed,
  releasesLeases,
  requirementsOf,
  storeLocaleOf,
  storeSeesFor,
  writesOf,
  type LifecycleAction,
  type LifecycleRequirements,
  type StoreSees,
} from "./lifecycle-rules";
import { recordPlatformError } from "./log";
import { kindText, labelsOf } from "./notify-kinds";
import type { StoreStatusReason } from "./reasons";
import { platformScope } from "./seam";

export { cooldownState, storeSeesFor } from "./lifecycle-rules";

const STATUSES: readonly StoreStatus[] = ["pending", "active", "restricted", "suspended", "closed", "scheduled_deletion", "purged", "rejected"];
/** each source answers within this or counts as unavailable (the whole preview stays ≤ 400 ms) */
const SOURCE_BUDGET_MS = 300;
const PREVIEW_TTL_MS = 10_000;

export type IntegrationPaused = "sheets" | "capi" | "telegram" | "webhooks";

export interface LifecycleAffects {
  livePages: number | null;
  openOrders: number | null;
  dueCallbacks: number | null;
  /** agents holding a live lease on one of the store's orders (the leases `releaseAllLeases` releases) */
  agentsWithLease: number | null;
  agentsOnline: number | null;
  /** configured integrations the target state pauses (restricted: for new orders only; existing orders keep syncing) */
  integrationsPaused: IntegrationPaused[] | null;
  renderJobsPending: number | null;
  openReview: boolean;
  /** an open purge request on the store (the sheet links to it) */
  purgeRequest: { id: string; mode: "four_eyes" | "delayed"; executeAfter: string | null } | null;
  reopenUntil: string | null;
  purgeAfter: string | null;
  /** the sources that did not answer (a stub before its track merges, an error, the budget) */
  unavailable: string[];
}

export interface LifecyclePreview {
  storeId: string;
  handle: string | null;
  from: StoreStatus;
  to: StoreStatus;
  action: LifecycleAction | null;
  allowed: boolean;
  /** "permission": this staff member lacks the edge's permission (the menu hides the action, PLA-§7.1) */
  blockedBy: "edge" | "permission" | "pending_request" | null;
  /** the message key of the block (console.lifecycle.*), for the disabled menu row and the sheet */
  blockedKey: string | null;
  requires: LifecycleRequirements | null;
  /** the reason the store text is rendered with (the first of the action's list until the sheet picks one) */
  reason: StoreStatusReason | null;
  storeSees: StoreSees;
  affects: LifecycleAffects;
  willWrite: { audit: AuditAction | null; notification: NotificationKind | null; leasesReleased: boolean; templatesEnsured: boolean; reviewWithdrawn: boolean };
  cooldown: { lastChangeAt: string | null; lastChangeBy: string | null; lastReason: string | null; minutesAgo: number | null; until: string | null; typedHandleRequired: boolean };
  computedAt: string;
}

/** The parts of a preview that do not depend on who asks (cached); `allowed` and `blockedBy` are per staff member. */
type StorePart = Omit<LifecyclePreview, "allowed" | "blockedBy" | "blockedKey"> & { edgeBlock: "edge" | "pending_request" | null; edgeBlockKey: string | null };

const previewCache = scopedCache<StorePart>({ name: "lifecycle-preview", maxEntries: 500, ttlMs: PREVIEW_TTL_MS });

/* ------------------------------------------------------------------ */
/* Reads (one store, through its platform scope)                       */
/* ------------------------------------------------------------------ */

export interface LifecycleStoreRow {
  id: string;
  handle: string | null;
  status: StoreStatus;
  mode: "landing" | "store" | "both";
  statusReason: string | null;
  statusChangedAt: Date | null;
  statusChangedBy: string | null;
  suspendNotice: boolean;
  closedAt: Date | null;
  purgeAfter: Date | null;
  timezone: string;
  defaultLocale: string;
}

/** The store row as it is now (not the 15 s cache): the cooldown and the stale-`from` check read it. */
export async function lifecycleStoreRow(storeId: string): Promise<LifecycleStoreRow | null> {
  if (!/^[0-9A-Z]{26}$/.test(storeId)) return null;
  const [row] = await db
    .select({
      id: stores.id,
      handle: stores.handle,
      status: stores.status,
      mode: stores.mode,
      statusReason: stores.statusReason,
      statusChangedAt: stores.statusChangedAt,
      statusChangedBy: stores.statusChangedBy,
      suspendNotice: stores.suspendNotice,
      closedAt: stores.closedAt,
      purgeAfter: stores.purgeAfter,
      timezone: stores.timezone,
      defaultLocale: stores.defaultLocale,
    })
    .from(stores)
    .where(eq(stores.id, storeId))
    .limit(1);
  return row ?? null;
}

/** The state the store was closed from (its last close audit row; lifecycle.ts reads the same row), or null. */
export async function closedFromOf(scope: StoreScope): Promise<StoreStatus | null> {
  const [row] = await db
    .select({ meta: auditLog.meta })
    .from(auditLog)
    .where(whereStore(auditLog, scope, inArray(auditLog.action, ["store.closed", "platform.store.closed"])))
    .orderBy(desc(auditLog.id))
    .limit(1);
  const from = row?.meta && typeof row.meta === "object" ? (row.meta as { from?: unknown }).from : undefined;
  return typeof from === "string" && (STATUSES as readonly string[]).includes(from) ? (from as StoreStatus) : null;
}

/** The store's open purge request, if any (PLA-§2.2: at most one pending per store and kind). */
export async function openPurgeRequest(scope: StoreScope): Promise<LifecycleAffects["purgeRequest"]> {
  const [row] = await db
    .select({ id: platformRequests.id, mode: platformRequests.mode, executeAfter: platformRequests.executeAfter })
    .from(platformRequests)
    .where(whereStore(platformRequests, scope, eq(platformRequests.kind, "store_purge"), inArray(platformRequests.status, ["pending", "confirmed"])))
    .limit(1);
  return row ? { id: row.id, mode: row.mode, executeAfter: row.executeAfter?.toISOString() ?? null } : null;
}

/** Agents holding a live lease on one of the store's orders. */
async function agentsWithLease(scope: StoreScope, now: Date): Promise<number> {
  const [row] = await db
    .select({ n: countDistinct(orders.assigneeId) })
    .from(orders)
    .where(whereStore(orders, scope, isNotNull(orders.claimToken), gt(orders.leaseUntil, now)));
  return Number(row?.n ?? 0);
}

async function openReviewRows(scope: StoreScope): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(signupReviews)
    .where(whereStore(signupReviews, scope, inArray(signupReviews.status, ["pending", "needs_info", "snoozed"])));
  return Number(row?.n ?? 0);
}

async function nameOf(userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const [row] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
  return row?.name ?? null;
}

/** One source with the budget: its value, or null and its name in `unavailable` (a stub's "not implemented" is quiet). */
function source<T>(label: string, run: () => Promise<T>, unavailable: string[], storeId: string): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const budget = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), SOURCE_BUDGET_MS);
  });
  return Promise.race([run(), budget])
    .then((v) => {
      if (v === "timeout") {
        unavailable.push(label);
        return null;
      }
      return v as T;
    })
    .catch((err: unknown) => {
      unavailable.push(label);
      if (!(err instanceof Error && err.message.startsWith("not implemented"))) recordPlatformError(`lifecycle preview ${label}`, err, { storeId });
      return null;
    })
    .finally(() => clearTimeout(timer));
}

const PAUSES: Record<string, IntegrationPaused | undefined> = { sheets: "sheets", capi: "capi", telegram: "telegram", webhook: "webhooks" };

/** core §A.5.3: restricted pauses integrations for new orders (existing ones keep syncing); suspended and after: all. */
const pausesIn = (to: StoreStatus): boolean => to !== "active" && to !== "pending";

/* ------------------------------------------------------------------ */
/* The preview                                                         */
/* ------------------------------------------------------------------ */

/**
 * PLA-§8.0 step 1 (`console.read`): what `to` would do to the store, as the seller will read it and with the numbers
 * it touches. `opts.reason` renders the store's text with that reason (the sheet asks again when the picker changes;
 * default the first reason of the action). Unknown store → `not_found`; any status not reachable from the current
 * one → `allowed: false, blockedBy: "edge"`. `opts.suspendNotice` previews the suspension's notice toggle.
 */
export async function lifecyclePreview(ctx: PlatformCtx, storeId: string, to: StoreStatus, opts: { reason?: string; suspendNotice?: boolean } = {}): Promise<LifecyclePreview> {
  const scope = platformScope(ctx, storeId);
  if (!(STATUSES as readonly string[]).includes(to)) throw new AuthRefusal("invalid", "console.lifecycle.not_an_edge");
  const store = await lifecycleStoreRow(storeId);
  if (!store || store.status === "purged") throw new AuthRefusal("not_found");
  const action = lifecycleActionOf(store.status, to);
  const reason: StoreStatusReason | null = action ? (reasonAllowed(action, opts.reason) ? opts.reason : requirementsOf(action).reasons[0]!) : null;

  // a suspension shows the notice the sheet's toggle chose (the 404 or the neutral 503, D32)
  const notice = to === "suspended" && typeof opts.suspendNotice === "boolean" ? opts.suspendNotice : store.suspendNotice;
  const row = notice === store.suspendNotice ? store : { ...store, suspendNotice: notice };
  const part = await previewCache.getOrLoad(storeId, `${to}:${reason ?? "-"}:${notice ? 1 : 0}`, () => storePart(scope, row, to, action, reason));
  // the cached part was computed against the row as it was then: a change since (another process) re-reads it
  const fresh = part.from === store.status ? part : await storePart(scope, row, to, action, reason);
  const permitted = fresh.requires ? ctx.can(fresh.requires.permission) : false;
  const blockedBy = fresh.edgeBlock ?? (permitted ? null : "permission");
  const { edgeBlock, edgeBlockKey, ...rest } = fresh;
  void edgeBlock;
  return { ...rest, allowed: blockedBy === null, blockedBy, blockedKey: edgeBlockKey ?? (permitted ? null : "console.lifecycle.no_permission") };
}

async function storePart(scope: StoreScope, store: LifecycleStoreRow, to: StoreStatus, action: LifecycleAction | null, reason: StoreStatusReason | null): Promise<StorePart> {
  const now = new Date();
  const from = store.status;
  const unavailable: string[] = [];
  const [setting, closedFrom, purgeRequest, pages, counts, leases, integrations, renders, openReviews, changedBy] = await Promise.all([
    getPlatformSetting("platform"),
    from === "closed" ? closedFromOf(scope).catch(() => null) : Promise.resolve(null),
    source("purge_request", () => openPurgeRequest(scope), unavailable, store.id),
    source("pages", () => listPagesForConsole(scope), unavailable, store.id),
    source("queue", () => queueCounts(scope), unavailable, store.id),
    source("leases", () => agentsWithLease(scope, now), unavailable, store.id),
    source("integrations", () => integrationHealth(scope), unavailable, store.id),
    source("renders", () => renderSummary(scope), unavailable, store.id),
    source("review", () => openReviewRows(scope), unavailable, store.id),
    nameOf(store.statusChangedBy).catch(() => null),
  ]);

  // the edge: a console action, the reopen target the store was closed from, the reopen window, an open purge request
  let edgeBlock: StorePart["edgeBlock"] = null;
  let edgeBlockKey: string | null = null;
  if (!action) {
    edgeBlock = "edge";
    edgeBlockKey = isQueueEdge(from, to) ? "console.lifecycle.use_queue" : "console.lifecycle.not_an_edge";
  } else if (action === "reopen" && closedFrom && closedFrom !== to) {
    edgeBlock = "edge";
    edgeBlockKey = "console.lifecycle.reopen_to_previous";
  } else if (action === "reopen" && store.purgeAfter && store.purgeAfter.getTime() <= now.getTime()) {
    edgeBlock = "edge";
    edgeBlockKey = "console.lifecycle.reopen_window_passed";
  } else if (purgeRequest && (action === "purge" || action === "reopen" || action === "cancel_deletion")) {
    // a purge request waits: a second one is refused, and moving the store out of closed would void it
    edgeBlock = "pending_request";
    edgeBlockKey = "console.lifecycle.purge_pending";
  }

  const locale = storeLocaleOf(store.defaultLocale);
  const writes = action ? writesOf(from, to) : null;
  const dates = action && action !== "purge" ? predictedDates(from, to, now, store) : { closedAt: store.closedAt, purgeAfter: store.purgeAfter };
  const def = writes?.notification ? notificationKind(writes.notification) : undefined;
  const notification = writes?.notification ? kindText(writes.notification, labelsOf(def), reason ? { reason } : {}, locale, store.timezone, null) : null;
  const after = action === "purge" || !action ? from : to;
  const storeSees = storeSeesFor({
    from,
    status: after,
    reason: action && action !== "purge" ? reason : store.statusReason,
    closedAt: dates.closedAt,
    purgeAfter: dates.purgeAfter,
    suspendNotice: store.suspendNotice,
    locale,
    timeZone: store.timezone,
    notification,
  });

  const live = pages ? pages.filter((p) => p.status === "published").length : null;
  const paused = integrations
    ? [...new Set(integrations.filter((r) => r.state !== "off").flatMap((r) => (PAUSES[r.kind] ? [PAUSES[r.kind]!] : [])))].filter(() => pausesIn(to))
    : null;
  const cooldown = cooldownState(store.statusChangedAt, now, setting.lifecycle.cooldownMinutes);
  const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

  return {
    storeId: store.id,
    handle: store.handle,
    from,
    to,
    action,
    requires: action ? requirementsOf(action) : null,
    reason,
    storeSees,
    affects: {
      livePages: live,
      openOrders: counts ? counts.toCallNow + counts.callbacksDue + counts.waitingRetry + counts.toShip : null,
      dueCallbacks: counts ? counts.callbacksDue : null,
      agentsWithLease: leases,
      agentsOnline: counts ? counts.liveAgents : null,
      integrationsPaused: paused,
      renderJobsPending: renders ? renders.byReason.reduce((n, r) => n + r.pending + r.running, 0) : null,
      openReview: (openReviews ?? 0) > 0,
      purgeRequest,
      reopenUntil: to === "closed" ? iso(dates.purgeAfter) : from === "closed" ? iso(store.purgeAfter) : null,
      purgeAfter: to === "scheduled_deletion" ? iso(dates.purgeAfter) : from === "scheduled_deletion" ? iso(store.purgeAfter) : null,
      unavailable: unavailable.sort(),
    },
    willWrite: {
      audit: writes?.audit ?? null,
      notification: writes?.notification ?? null,
      leasesReleased: !!action && action !== "purge" && releasesLeases(to),
      templatesEnsured: from === "pending" && to === "active" && store.mode !== "landing",
      reviewWithdrawn: action === "close" && (openReviews ?? 0) > 0,
    },
    cooldown: {
      lastChangeAt: iso(store.statusChangedAt),
      lastChangeBy: changedBy,
      lastReason: store.statusReason,
      minutesAgo: cooldown.minutesAgo,
      until: iso(cooldown.until),
      typedHandleRequired: cooldown.inside,
    },
    computedAt: now.toISOString(),
    edgeBlock,
    edgeBlockKey,
  };
}

/** Drops a store's cached previews (a write in this process; `invalidateStore` drops them too). */
export function invalidateLifecyclePreview(storeId: string): void {
  previewCache.delete(storeId);
}

