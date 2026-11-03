import "server-only";
/**
 * The dashboard's data (P2 SHELL; platform.md PLA-§22.17, §22.16, §22.7, §22.10.2; docs/STORE-SAAS.md §I.4, D54, D57,
 * D70). One call, `dashboardPanels(ctx, range)`, answers every block of `/app/<h>` as its own settled panel, so a block
 * whose source is not there yet, is not the viewer's, or fails renders its own state and never takes the page with it:
 *
 *   const panels = await dashboardPanels(ctx, "7d");
 *   panels.kpis      // { ok: true, data: { today, range } } | { ok: false, reason: "unavailable" | "hidden" | "error" }
 *
 * The sources are the P0 read APIs: P4's `orderKpis`, `queueCounts`, `opsPulse`; P5's `integrationHealth`,
 * `sheetsBacklog`; P1's `getStoreHealth` and the review card; P7's `aiUsageForStore`; T3's stats; T4's page reads. A
 * source that throws `not implemented` is `unavailable` (build note item 14): its block leaves out what it would show
 * and never writes a made-up 0. The few direct reads here (latest orders, preview links, the store's status, the
 * shell's pulse counters) carry the store predicate (§E.3) and leave test orders out (`is_test = 0`, D54, with the
 * honeypot rows); customer fields go through the impersonation mask (D70). Money is integer minor units (cents),
 * formatted by the view through src/lib/markets/money.ts.
 *
 * The setup checklist of R1.0 and `navCounts` are gone: the Store Health ring replaces the one (§I.4, PLA-§22.16) and
 * the pulse the other (D57). `getDashboard` and `navCounts` stay as deprecated shims only while the maintainer's
 * tenancy harness still names them (CCR r1-p2-3).
 */
import { and, asc, count, desc, eq, gt, isNotNull, isNull, ne } from "drizzle-orm";
import { can as roleCan, type StorePermission } from "@/lib/auth/permissions";
import type { AiUsageSummary } from "@/lib/ai/summary.server";
import { aiUsageForStore } from "@/lib/ai/summary.server";
import { db } from "@/lib/db/client";
import { orders, pages, previewTokens, storeInvites, stores } from "@/lib/db/schema";
import type { ShellFacts } from "@/lib/health/rules/shell";
import type { StoreHealthView } from "@/lib/health/types";
import { integrationHealth, sheetsBacklog, type IntegrationHealthRow, type SheetsBacklog } from "@/lib/integrations/health";
import { logError } from "@/lib/orders/log";
import { orderKpis, queueCounts, type Kpi, type OrderKpis, type QueueCounts } from "@/lib/orders/profile";
import { opsPulse, type OpsPulse } from "@/lib/orders/queue";
import { toCents } from "@/lib/page/money";
import { getStoreHealth } from "@/lib/platform/health-snapshot";
import { getReviewCard, type ReviewCard } from "@/lib/platform/requests";
import { getStoreSetting, type StoreSettingValue } from "@/lib/settings";
import { getSheetsConfig, isSheetsConfigured } from "@/lib/sheets";
import { getPageStats } from "@/lib/stats";
import { entitlements } from "@/lib/tenancy/entitlements";
import { USAGE_METRICS, usageMetric } from "@/lib/tenancy/entitlement-keys";
import { listMembersByScope, type MemberSummary } from "@/lib/tenancy/invites";
import { usageValue } from "@/lib/tenancy/usage";
import { inStore, whereStore } from "@/lib/tenancy/sql";
import type { StoreCtx, StoreRow, StoreScope, StoreStatus } from "@/lib/tenancy/types";
import { storeUrl } from "@/lib/urls";
import { storeStorage, type StoreStorage } from "./assets";
import { maskCustomer } from "./mask";
import { pageCounts, pageOptions } from "./pages";
import { addDays, dayKey } from "./time";

/* ------------------------------------------------------------------ */
/* panels                                                              */
/* ------------------------------------------------------------------ */

export type DashboardRange = "7d" | "28d";
export const DASHBOARD_RANGES: readonly DashboardRange[] = ["7d", "28d"];
const RANGE_DAYS: Record<DashboardRange, number> = { "7d": 7, "28d": 28 };

/**
 * Why a panel has no data: `hidden` (not the viewer's: a permission the block needs), `unavailable` (its source is not
 * merged yet, or answered "not implemented"), `error` (the read failed; logged, the block shows its error state).
 */
export type PanelGap = "hidden" | "unavailable" | "error";
export type Panel<T> = { ok: true; data: T } | { ok: false; reason: PanelGap };

/** A source that throws `not implemented: P<n> …` (a P0 stub) is unavailable, never an error (build note item 14). */
export function isNotImplemented(err: unknown): boolean {
  return err instanceof Error && err.message.startsWith("not implemented:");
}

/** One panel: `load` settled, with the viewer's right to it checked first. */
async function panel<T>(area: string, allowed: boolean, load: () => Promise<T>): Promise<Panel<T>> {
  if (!allowed) return { ok: false, reason: "hidden" };
  try {
    return { ok: true, data: await load() };
  } catch (err) {
    if (isNotImplemented(err)) return { ok: false, reason: "unavailable" };
    logError(`dashboard:${area}`, err);
    return { ok: false, reason: "error" };
  }
}

/** A panel derived from another: the source's gap when it has none. */
function derive<S, T>(source: Panel<S>, fn: (data: S) => T): Panel<T> {
  return source.ok ? { ok: true, data: fn(source.data) } : source;
}

/** What one span of store days placed: orders, their value, and the unique visitors of the store's pages. */
export interface PlacedSum {
  count: number;
  cents: number;
  visitors: number;
}

/** Orders placed in the range and the range before it, from the store's own stats (bots and test orders never counted). */
export interface PlacedTotals extends PlacedSum {
  /** store-local days of the range, inclusive */
  from: string;
  to: string;
  previous: PlacedSum;
  today: PlacedSum;
  /** the last `PLACED_SERIES_DAYS` store days, oldest first: a day with no order is a real 0 (the stats are gap-free) */
  series: ({ day: string } & PlacedSum)[];
}

/** The daily series always covers four weeks (a sparkline needs ≥ 7 points, the chart reads the whole series). */
export const PLACED_SERIES_DAYS = 28;

/** The COD funnel (PLA-§22.17 item 5): R1 has the first two steps; the rest are `null` (shown as "with delivery tracking (R2)"). */
export interface FunnelStep {
  id: "placed" | "confirmed" | "shipped" | "delivered" | "collected";
  n: number | null;
}
export interface FunnelData {
  window: DashboardRange;
  steps: FunnelStep[];
  confirmationRate: Kpi;
}

/** What the live address card shows (PLA-§22.10.2, UX-05): the store's canonical address and the live page it points at. */
export interface AddressFacts {
  /** the canonical store home (`storeUrl`, P / S / C mode) */
  storeUrl: string;
  livePages: number;
  /** pages not live yet (drafts): the dashboard's first-run state is "no page at all" */
  draftPages: number;
  /** the home page when it is live, else the newest live page; null before the first publish */
  page: { id: string; name: string; slug: string; url: string; isHome: boolean } | null;
  /** `stores.address_version`: bumped by every change of address (a rename, §C.6) */
  addressVersion: number;
}

/** One active seller preview link (core §E.2 `mintPreviewToken`, PLA-§L: at most 10 per store). Never the token itself. */
export interface PreviewLink {
  id: string;
  pageId: string;
  /** null when the page was deleted since */
  pageName: string | null;
  expiresAt: string;
  opened: number;
  lastOpenedAt: string | null;
  createdAt: string;
}

/** One of the store's newest real orders (customer name through the impersonation mask). */
export interface LatestOrder {
  id: string;
  name: string;
  city: string | null;
  totalCents: number;
  currency: string;
  status: string;
  createdAt: string;
  pageName: string | null;
  sheetStatus: "pending" | "synced" | "failed" | "disabled";
  riskScore: number;
}

export interface DashboardPanels {
  range: DashboardRange;
  /** the store's calendar day */
  today: string;
  currency: string;
  /** P4 `orderKpis` for today and the range (counts and rates with their n) */
  kpis: Panel<{ today: OrderKpis; range: OrderKpis }>;
  /** what was placed (count and value), from the store's stats */
  placed: Panel<PlacedTotals>;
  funnel: Panel<FunnelData>;
  /** P4 `opsPulse` for the viewer: the Today brief's queue line */
  ops: Panel<OpsPulse>;
  /** P4 `queueCounts`: the work lists' counters */
  queue: Panel<QueueCounts>;
  /** P5's integration rows with the Sheets backlog (`sheets` null when only the backlog read failed) */
  integrations: Panel<{ rows: IntegrationHealthRow[]; sheets: SheetsBacklog | null }>;
  /** R1.0's Sheets queue health: the Sheets tile until P5's rows exist */
  sheet: Panel<SheetHealth>;
  /** P1's snapshot; `data: null` = not computed yet (the ring's "computing" state) */
  health: Panel<StoreHealthView | null>;
  /** the inputs of the local setup pass (`localSetupIssues`, run by the view: PLA-§22.16 item 1, before the first health run) */
  setup: Panel<ShellFacts>;
  /** the In-review card's state (PLA-§22.7) */
  review: Panel<ReviewCard>;
  address: Panel<AddressFacts>;
  previews: Panel<PreviewLink[]>;
  latestOrders: Panel<LatestOrder[]>;
  /** media storage against the plan, and this month's AI credits */
  usage: Panel<{ storage: StoreStorage | null; ai: AiUsageSummary | null }>;
}

/**
 * The viewer a panel is read for: a `StoreCtx` fits. `user` and `membership` are optional only for the deprecated
 * `getDashboard` shim (no viewer: the per-viewer panels are hidden).
 */
export type DashboardCtx = Pick<StoreCtx, "scope" | "store" | "can"> & Partial<Pick<StoreCtx, "user" | "membership">>;

const LATEST_ORDERS = 5;
const PREVIEW_LINKS_MAX = 10;

/** Every block of the dashboard, each settled on its own; nothing here throws for one source. */
export async function dashboardPanels(ctx: DashboardCtx, range: DashboardRange = "7d"): Promise<DashboardPanels> {
  const { scope, store } = ctx;
  const now = new Date();
  const today = dayKey(now, store.timezone);
  const viewer = ctx.user && ctx.membership ? { userId: ctx.user.id, role: ctx.membership.role } : null;
  const ordersAll = ctx.can("orders.read_all");

  const [kpis, placed, ops, queue, integrations, sheet, health, setup, review, address, previews, latest, usage] = await Promise.all([
    panel("kpis", true, async () => {
      const [t, r] = await Promise.all([orderKpis(scope, "today"), orderKpis(scope, range)]);
      return { today: t, range: r };
    }),
    panel("placed", true, () => placedTotals(scope, today, range)),
    panel("ops", viewer !== null && ctx.can("orders.read"), () => opsPulse(scope, viewer!)),
    panel("queue", ctx.can("orders.read"), () => queueCounts(scope)),
    panel("integrations", true, async () => {
      const [rows, sheets] = await Promise.all([integrationHealth(scope), sheetsBacklog(scope).catch((err: unknown) => (isNotImplemented(err) ? null : Promise.reject(err)))]);
      return { rows, sheets };
    }),
    panel("sheet", true, () => getSheetHealth(scope)),
    panel("health", true, () => getStoreHealth(scope)),
    panel("setup", true, async () => {
      const [settings, members] = await Promise.all([getStoreSetting(scope, "store"), ctx.can("members.read") ? memberFacts(scope) : Promise.resolve(null)]);
      return setupFacts(settings, members);
    }),
    panel("review", true, () => reviewState(scope)),
    panel("address", true, () => addressFacts(scope, store)),
    panel("previews", ctx.can("pages.read"), () => activePreviewLinks(scope)),
    panel("latest", ordersAll, () => latestOrders(scope)),
    panel("usage", true, async () => {
      const [storage, ai] = await Promise.all([storeStorage(scope).catch(() => null), aiUsageForStore(scope, today.slice(0, 7)).catch(() => null)]);
      return { storage, ai };
    }),
  ]);

  return {
    range,
    today,
    currency: store.currency,
    kpis,
    placed,
    funnel: derive(kpis, (k) => funnelOf(k.range, range)),
    ops,
    queue,
    integrations,
    sheet,
    health,
    setup,
    review,
    address,
    previews,
    latestOrders: latest,
    usage,
  };
}

/** The funnel of one range: placed and confirmed from P4's counts; shipped, delivered and collected arrive with R2. */
export function funnelOf(k: OrderKpis, range: DashboardRange): FunnelData {
  return {
    window: range,
    steps: [
      { id: "placed", n: k.placed },
      { id: "confirmed", n: k.confirmed },
      { id: "shipped", n: null },
      { id: "delivered", n: null },
      { id: "collected", n: null },
    ],
    confirmationRate: k.confirmationRate,
  };
}

/* ------------------------------------------------------------------ */
/* reads                                                               */
/* ------------------------------------------------------------------ */

/** Placed counts and value for the range ending today and the one before it, and the four-week series (T3's stats, store days). */
async function placedTotals(scope: StoreScope, today: string, range: DashboardRange): Promise<PlacedTotals> {
  const n = RANGE_DAYS[range];
  const from = addDays(today, -(n - 1));
  const previousFrom = addDays(from, -n);
  const seriesFrom = addDays(today, -(PLACED_SERIES_DAYS - 1));
  const stats = await getPageStats(scope, { from: previousFrom < seriesFrom ? previousFrom : seriesFrom, to: today });
  const point = (d: (typeof stats.days)[number]): PlacedSum => ({ count: d.orders, cents: toCents(d.revenue), visitors: d.uniques });
  const sum = (days: typeof stats.days): PlacedSum =>
    days.map(point).reduce((a, p) => ({ count: a.count + p.count, cents: a.cents + p.cents, visitors: a.visitors + p.visitors }), { count: 0, cents: 0, visitors: 0 });
  const todayRow = stats.days.find((d) => d.day === today);
  return {
    from,
    to: today,
    ...sum(stats.days.filter((d) => d.day >= from)),
    previous: sum(stats.days.filter((d) => d.day >= previousFrom && d.day < from)),
    today: todayRow ? point(todayRow) : { count: 0, cents: 0, visitors: 0 },
    series: stats.days.filter((d) => d.day >= seriesFrom).map((d) => ({ day: d.day, ...point(d) })),
  };
}

/** The In-review card's state: the store's newest signup or reopen row (P1's read; `signup_reviews`, PLA-§22.7). */
export function reviewState(scope: StoreScope): Promise<ReviewCard> {
  return getReviewCard(scope);
}

/** The store's active seller preview links, newest first, at most 10 (read-only; revoking is `revokePreviewToken`). */
export async function activePreviewLinks(scope: StoreScope): Promise<PreviewLink[]> {
  const rows = await db
    .select({
      id: previewTokens.id,
      pageId: previewTokens.pageId,
      pageName: pages.name,
      expiresAt: previewTokens.expiresAt,
      opened: previewTokens.opened,
      lastOpenedAt: previewTokens.lastOpenedAt,
      createdAt: previewTokens.createdAt,
    })
    .from(previewTokens)
    .leftJoin(pages, and(eq(pages.id, previewTokens.pageId), inStore(pages, scope)))
    .where(whereStore(previewTokens, scope, eq(previewTokens.audience, "seller"), isNull(previewTokens.revokedAt), gt(previewTokens.expiresAt, new Date())))
    .orderBy(desc(previewTokens.createdAt))
    .limit(PREVIEW_LINKS_MAX);
  return rows.map((r) => ({
    id: r.id,
    pageId: r.pageId,
    pageName: r.pageName ?? null,
    expiresAt: r.expiresAt.toISOString(),
    opened: r.opened,
    lastOpenedAt: r.lastOpenedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  }));
}

/**
 * The facts the shell's setup rules read (src/lib/health/rules/shell.ts), for the synchronous local pass before the
 * first health run (PLA-§22.16 item 1). `settings` is the `store` setting (null: not readable, the contact and legal
 * rules stay silent); `members` the member facts (null: not read, the 2FA rule stays silent). Pure.
 */
export function setupFacts(settings: StoreSettingValue<"store"> | null, members: ShellFacts["members"] = null): ShellFacts {
  return {
    contact: settings ? { phone: settings.phone ?? null, whatsapp: settings.whatsapp ?? null } : null,
    legalName: settings ? (settings.legalName ?? null) : undefined,
    members,
  };
}

/** Active members, and those who read every order without two-step verification (counts only, never who). */
export async function memberFacts(scope: StoreScope): Promise<NonNullable<ShellFacts["members"]>> {
  return memberFactsOf(await listMembersByScope(scope));
}

/** The same facts from a member list (pure). */
export function memberFactsOf(list: readonly Pick<MemberSummary, "role" | "status" | "totpEnabled">[]): NonNullable<ShellFacts["members"]> {
  const active = list.filter((m) => m.status === "active");
  return { total: active.length, withoutTotpWithOrdersReadAll: active.filter((m) => !m.totpEnabled && roleCan(m.role, "orders.read_all")).length };
}

/** The address card's facts: the canonical address and the live page it leads to (T4's page reads). */
async function addressFacts(scope: StoreScope, store: StoreRow): Promise<AddressFacts> {
  const [counts, options] = await Promise.all([pageCounts(scope), pageOptions(scope)]);
  const live = options.filter((p) => p.status === "published");
  const home = store.homePageId ? live.find((p) => p.id === store.homePageId) : undefined;
  const pick = home ?? live[0];
  return {
    storeUrl: storeUrl(store, "/"),
    livePages: counts.published,
    draftPages: counts.draft,
    page: pick ? { id: pick.id, name: pick.name, slug: pick.slug, url: home ? storeUrl(store, "/") : storeUrl(store, `/${pick.slug}`), isHome: !!home } : null,
    addressVersion: store.addressVersion,
  };
}

/** The store's newest real orders, customer fields masked under impersonation (D70); test and honeypot orders left out (D54). */
async function latestOrders(scope: StoreScope): Promise<LatestOrder[]> {
  const rows = await db
    .select({
      id: orders.id,
      name: orders.name,
      city: orders.city,
      total: orders.total,
      currency: orders.currency,
      status: orders.status,
      createdAt: orders.createdAt,
      pageName: pages.name,
      sheetStatus: orders.sheetStatus,
      riskScore: orders.riskScore,
    })
    .from(orders)
    .leftJoin(pages, and(eq(pages.id, orders.pageId), inStore(pages, scope)))
    .where(whereStore(orders, scope, eq(orders.isTest, false), ne(orders.sheetStatus, "disabled")))
    .orderBy(desc(orders.createdAt))
    .limit(LATEST_ORDERS);
  return rows
    .map((row) => maskCustomer(scope, row))
    .map((o) => ({
      id: o.id,
      name: o.name,
      city: o.city,
      totalCents: toCents(Number(o.total)),
      currency: o.currency,
      status: o.status,
      createdAt: o.createdAt.toISOString(),
      pageName: o.pageName ?? null,
      sheetStatus: o.sheetStatus,
      riskScore: o.riskScore,
    }));
}

/** The store's status and its reason code, fresh from its row (the pulse's store part, 5 s; the store cache is 15 s). */
export async function storeStatusOf(scope: StoreScope): Promise<{ status: StoreStatus; statusReason: string | null }> {
  // the scope's own row: `stores` is the tenancy root, its id is the scope's store id
  const [row] = await db.select({ status: stores.status, statusReason: stores.statusReason }).from(stores).where(eq(stores.id, scope.storeId)).limit(1);
  if (!row) throw new Error("dashboard: the scope's store row is missing");
  return { status: row.status, statusReason: row.statusReason ?? null };
}

/**
 * The two store-row facts the cached `StoreRow` does not carry: the platform category (null until set) and when the
 * store was created (the onboarding's `revealMs`). Read-only; `stores.category` is written by the core's store-row
 * writer (CCR r1-p2-4 §1).
 */
export async function storeRowFacts(scope: StoreScope): Promise<{ category: string | null; createdAt: Date }> {
  // the scope's own row: `stores` is the tenancy root, its id is the scope's store id
  const [row] = await db.select({ category: stores.category, createdAt: stores.createdAt }).from(stores).where(eq(stores.id, scope.storeId)).limit(1);
  if (!row) throw new Error("dashboard: the scope's store row is missing");
  return { category: row.category ?? null, createdAt: row.createdAt };
}

/* ------------------------------------------------------------------ */
/* the shell chrome's facts (step p2-07: banners, state pages, ⌘K)     */
/* ------------------------------------------------------------------ */

/** The closed banner's and the deletion page's dates (`stores.closed_at`, `stores.purge_after`), ISO or null. */
export async function storeLifecycleDates(scope: StoreScope): Promise<{ closedAt: string | null; purgeAfter: string | null }> {
  const [row] = await db.select({ closedAt: stores.closedAt, purgeAfter: stores.purgeAfter }).from(stores).where(eq(stores.id, scope.storeId)).limit(1);
  return { closedAt: row?.closedAt?.toISOString() ?? null, purgeAfter: row?.purgeAfter?.toISOString() ?? null };
}

/** Active members without two-step verification (the owners' require-2FA banner, PLA-§22.8). */
export async function membersWithout2faCount(scope: StoreScope): Promise<number> {
  return (await listMembersByScope(scope)).filter((m) => m.status === "active" && !m.totpEnabled).length;
}

/** The gauges the quota banner watches (period "total"; the monthly counters show in Plan & usage). */
const BANNER_GAUGES = ["media_bytes", "pages", "members", "agents"] as const;

/** The store's gauges with a limit (`null` = unlimited, never a banner): `{ metric, used, limit }` (PLA-§22.8 "quota ≥ 80 %"). */
export async function quotaGauges(scope: StoreScope, timeZone: string): Promise<{ metric: string; used: number; limit: number | null }[]> {
  const values = await entitlements(scope);
  const now = new Date();
  return Promise.all(
    BANNER_GAUGES.map(async (metric) => {
      const limitKey = USAGE_METRICS[metric].limit;
      const limit = limitKey ? (values[limitKey] as number | null) : null;
      const used = await usageValue(scope, usageMetric(metric, now, timeZone));
      return { metric, used, limit };
    }),
  );
}

/** ⌘K's local index (PLA-§22.13): the 20 most recently edited pages and, with `members.read`, the active members. */
export async function paletteIndex(scope: StoreScope, opts: { pages: boolean; members: boolean }): Promise<{ pages: { id: string; name: string; slug: string; status: string }[]; members: { userId: string; name: string; role: string }[] }> {
  const [pageRows, memberRows] = await Promise.all([opts.pages ? pageOptions(scope) : Promise.resolve([]), opts.members ? listMembersByScope(scope) : Promise.resolve([])]);
  return {
    pages: pageRows.slice(0, 20).map((p) => ({ id: p.id, name: p.name, slug: p.slug, status: p.status })),
    members: memberRows.filter((m) => m.status === "active").map((m) => ({ userId: m.userId, name: m.name, role: m.role })),
  };
}

/**
 * Does `/app/<h>` send the owner to `/welcome` (PLA-§22.2)? While `onboarding.step` is not `done` or `skipped`, for a
 * store that started the flow (`startedAt`) or has no page yet: a store from before the flow existed, with its pages,
 * is never sent back to a welcome it never had.
 */
export async function welcomePending(scope: StoreScope): Promise<boolean> {
  const onboarding = await getStoreSetting(scope, "onboarding");
  if (onboarding.step === "done" || onboarding.step === "skipped") return false;
  if (onboarding.startedAt) return true;
  const counts = await pageCounts(scope);
  return counts.draft + counts.published + counts.archived === 0;
}

/** The shell's store-level pulse counter (src/lib/pulse/contributors/shell.ts): open invites, not accepted, revoked or expired. */
export async function pendingInviteCount(scope: StoreScope): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(storeInvites)
    .where(whereStore(storeInvites, scope, isNull(storeInvites.acceptedAt), isNull(storeInvites.revokedAt), gt(storeInvites.expiresAt, new Date())));
  return Number(row?.n ?? 0);
}

/* ------------------------------------------------------------------ */
/* Sheets queue health (R1.0, ADM-03; P5's Sheets page reads it too)   */
/* ------------------------------------------------------------------ */

export interface SheetHealth {
  /** GOOGLE_SA_JSON_B64 present and valid */
  configured: boolean;
  connected: boolean;
  enabled: boolean;
  title: string | null;
  url: string | null;
  pending: number;
  failed: number;
  synced: number;
  /** minutes the oldest queued order has been waiting (null when the queue is empty) */
  oldestPendingMinutes: number | null;
  lastError: string | null;
}

/** The store's sheet queue (ADM-03): its own orders only. */
export async function getSheetHealth(scope: StoreScope): Promise<SheetHealth> {
  const [cfg, counts, [oldest], [lastFailed]] = await Promise.all([
    getSheetsConfig(scope),
    db.select({ s: orders.sheetStatus, n: count() }).from(orders).where(inStore(orders, scope)).groupBy(orders.sheetStatus),
    db
      .select({ at: orders.createdAt })
      .from(orders)
      .where(whereStore(orders, scope, eq(orders.sheetStatus, "pending")))
      .orderBy(asc(orders.createdAt))
      .limit(1),
    db
      .select({ error: orders.sheetError })
      .from(orders)
      .where(whereStore(orders, scope, eq(orders.sheetStatus, "failed"), isNotNull(orders.sheetError)))
      .orderBy(desc(orders.updatedAt))
      .limit(1),
  ]);
  const by = Object.fromEntries(counts.map((c) => [c.s, Number(c.n)])) as Partial<Record<"pending" | "synced" | "failed", number>>;
  return {
    configured: isSheetsConfigured(),
    connected: !!cfg,
    enabled: !!cfg?.enabled,
    title: cfg?.sheetTitle ?? null,
    url: cfg?.url ?? null,
    pending: by.pending ?? 0,
    failed: by.failed ?? 0,
    synced: by.synced ?? 0,
    oldestPendingMinutes: oldest ? Math.max(0, Math.round((Date.now() - oldest.at.getTime()) / 60_000)) : null,
    lastError: lastFailed?.error ?? null,
  };
}

/* ------------------------------------------------------------------ */
/* deprecated shims (scripts/qa/tenancy-check.ts names them; CCR r1-p2-3) */
/* ------------------------------------------------------------------ */

/**
 * @deprecated R1.0's sidebar badges; the pulse's counts replace them (D57). Kept only because the maintainer's tenancy
 * harness calls it (CCR r1-p2-3 drops the call, then this goes).
 */
export async function navCounts(scope: StoreScope): Promise<{ newOrders: number; syncFailed: number }> {
  const [[n], [f]] = await Promise.all([
    db.select({ n: count() }).from(orders).where(whereStore(orders, scope, eq(orders.status, "new"), ne(orders.sheetStatus, "disabled"), eq(orders.isTest, false))),
    db.select({ n: count() }).from(orders).where(whereStore(orders, scope, eq(orders.sheetStatus, "failed"))),
  ]);
  return { newOrders: Number(n?.n ?? 0), syncFailed: Number(f?.n ?? 0) };
}

/**
 * @deprecated R1.0's entry point, now `dashboardPanels` without a viewer (the per-viewer panels hidden). Kept only
 * because the maintainer's tenancy harness calls it (CCR r1-p2-3 moves the harness to `dashboardPanels`).
 */
export async function getDashboard(scope: StoreScope, store: StoreRow, user: { totpEnabled: boolean }, opts: { orders: boolean } = { orders: true }): Promise<DashboardPanels> {
  void user;
  const grants = new Set<StorePermission>(["store.read", ...(opts.orders ? (["orders.read", "orders.read_all"] as const) : [])]);
  return dashboardPanels({ scope, store, can: (p) => grants.has(p) }, "7d");
}
