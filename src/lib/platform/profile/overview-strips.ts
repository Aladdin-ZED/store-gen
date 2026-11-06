import "server-only";
/**
 * The store profile's Overview tab, "every detail" (platform.md PLA-§7.3; PL-07, PD32, PD55, PD2, D54): the KPI row and
 * the ten strips. Each strip is one loader over one P0 read API, wrapped in `panel()` so it fails alone (its own
 * error state with the reference; a later track's stub reads "unavailable"), cached 30 s in `scopedCache("console-
 * strips")` under the platform key "p" : `<storeId>:<strip>:<audience>` (PLA-§M.5; the audience keeps PD35's masking
 * and the analyst's hidden names apart), and every customer field is masked before it leaves (src/lib/platform/mask.ts).
 *
 *   const kpis = await getStoreOverview(ctx, storeId, 30);         // the KPI row (range 7 / 30 / 90, store time zone)
 *   const s = await loadStrip(ctx, storeId, "orders");             // Panel<OrdersStrip>
 *   const all = await loadStrips(ctx, storeId);                    // the ten, in parallel (the page streams each)
 *
 * Sources: 1 the store row, `store_handle_history`, P8 `renderSummary(scope)`; 2 `getStoreHealth(platformScope)`; 3 T4
 * `listPagesForConsole`, P6 `designHealth`; 4 P4 `orderKpis`, `orderRiskMix`, `listOrdersForConsole`; 5 T2 members and
 * invites, P4 agents; 6 P5 `integrationHealth`, P8 `outboxSummary`; 7 P7 `aiStoreSummary`; 8 T1 `entitlements` and the
 * usage rows; 9 the risk read (./risk.ts); 10 `listStoreTimeline` with the milestones. Every read goes through
 * `platformScope(ctx, storeId)`.
 */
import { count, eq } from "drizzle-orm";
import { AuthRefusal } from "@/lib/auth/errors";
import type { AiStoreSummary } from "@/lib/ai/summary.server";
import { aiStoreSummary } from "@/lib/ai/summary.server";
import { listPagesForConsole } from "@/lib/admin-data/pages";
import { db } from "@/lib/db/client";
import { storeHandleHistory, stores } from "@/lib/db/schema";
import { designHealth } from "@/lib/design/health.server";
import type { HealthFlag, HealthGroup, HealthIssue, Milestone } from "@/lib/health/types";
import { integrationHealth, type IntegrationHealthRow } from "@/lib/integrations/health";
import { outboxSummary, type OutboxSummary } from "@/lib/jobs/outbox";
import { renderSummary } from "@/lib/jobs/renders";
import { listOrdersForConsole, orderKpis, orderRiskMix, type OrderKpis } from "@/lib/orders/profile";
import { mintPreviewToken } from "@/lib/render/preview-token";
import { dayKey, getPageStats, validTimeZone } from "@/lib/stats/index";
import { scopedCache } from "@/lib/tenancy/cache";
import { whereStore } from "@/lib/tenancy/sql";
import type { PlatformCtx, StoreScope, StoreStatus } from "@/lib/tenancy/types";
import { addressMode, storeUrl, type AddressMode } from "@/lib/urls";
import { getStoreHealth } from "../health-snapshot";
import { maskName, type Masked } from "../mask";
import { optional, panel, type Panel } from "../panel";
import { platformScope } from "../seam";
import { loadRiskStrip, type RiskStrip } from "./risk";
import { getStoreTeam } from "./team";
import { listStoreTimeline, type TimelineEvent } from "./timeline";
import { getStoreUsage, stateCapsInForce, type UsageMeter } from "./usage";

export const STRIPS = ["identity", "health", "pages", "orders", "team", "integrations", "ai", "usage", "risk", "timeline"] as const;
export type StripId = (typeof STRIPS)[number];

/** PLA-§M.5 `console-strips`: 30 s, 2,000 entries */
const stripCache = scopedCache<unknown>({ name: "console-strips", maxEntries: 2_000, ttlMs: 30_000 });
const P = "p";

/** Drops a store's cached strips (console actions on the store: mark dirty, a transition, a plan change). */
export function invalidateStrips(storeId: string): void {
  for (const strip of STRIPS) for (const audience of AUDIENCES) stripCache.delete(P, `${storeId}:${strip}:${audience}`);
}

const AUDIENCES = ["full", "masked", "analyst"] as const;
/** PD35 and the analyst rule decide what a strip may carry: one cache entry per audience, never per person */
const audienceOf = (ctx: PlatformCtx): (typeof AUDIENCES)[number] => (ctx.role === "analyst" ? "analyst" : ctx.role === "support" ? "masked" : "full");

/* ------------------------------------------------------------------ */
/* Strip shapes                                                        */
/* ------------------------------------------------------------------ */

export interface IdentityStrip {
  mode: "landing" | "store" | "both";
  addressMode: AddressMode;
  canonicalUrl: string | null;
  handleHistory: number;
  /** re-render jobs of reason `address` (pending / failed); null while P8's summary is unavailable */
  addressRenders: { pending: number; failed: number } | null;
  storeId: string;
}

export interface HealthStrip {
  score: number;
  components: Record<HealthGroup, number>;
  /** the top 5 unsnoozed issues (text key with evidence, severity) and the snoozed ones with their date */
  issues: Pick<HealthIssue, "id" | "group" | "severity" | "evidence" | "text">[];
  snoozed: { id: string; until: string }[];
  flags: HealthFlag[];
  computedAt: string;
  dirty: boolean;
}

export interface PagesStrip {
  published: number;
  drafts: number;
  lastPublishAt: string | null;
  liveUrl: string | null;
  /** the newest page (the Preview button mints its 10-minute link, PD16) */
  newest: { id: string; name: string; status: string; design: { q: number | null; slop: number | null; hasLook: boolean } | null } | null;
}

export interface OrdersStrip {
  kpis7d: OrderKpis | null;
  kpis28d: OrderKpis | null;
  riskMix: { low: number; check: number; high: number; n: number } | null;
  latest: { id: string; createdAt: string; status: string; totalCents: number; currency: string; customer: Masked; phone: Masked; storeCheckout: boolean }[] | null;
}

export interface TeamStrip {
  byRole: Record<string, number>;
  pendingInvites: number;
  twoFactor: { on: number; of: number };
  requireMember2fa: boolean;
  agentsOnline: number | null;
}

export interface IntegrationsStrip {
  rows: IntegrationHealthRow[] | null;
  outbox: OutboxSummary | null;
}

export type AiStrip = Pick<AiStoreSummary, "mode" | "director" | "credits" | "costMicrosMonth" | "openJobs"> & {
  runs: AiStoreSummary["runs"];
  last: Omit<AiStoreSummary["recent"][number], "id"> | null;
};

export interface UsageStrip {
  plan: { id: string; name: string | null; since: string | null };
  meters: UsageMeter[];
  boosts: { key: string; expiresAt: string | null }[];
  stateCaps: { key: string; mib?: number; value: number | boolean | null }[];
}

export interface TimelineStrip {
  events: TimelineEvent[];
  milestones: Partial<Record<Milestone, string>>;
}

export interface StripData {
  identity: IdentityStrip;
  health: HealthStrip | null;
  pages: PagesStrip;
  orders: OrdersStrip;
  team: TeamStrip;
  integrations: IntegrationsStrip;
  ai: AiStrip;
  usage: UsageStrip;
  risk: RiskStrip;
  timeline: TimelineStrip;
}

/* ------------------------------------------------------------------ */
/* Loaders                                                             */
/* ------------------------------------------------------------------ */

async function storeAddress(storeId: string) {
  const [row] = await db.select({ id: stores.id, handle: stores.handle, mode: stores.mode, status: stores.status, timezone: stores.timezone, currency: stores.currency }).from(stores).where(eq(stores.id, storeId)).limit(1);
  if (!row) throw new AuthRefusal("not_found");
  return row;
}

const LIVE: ReadonlySet<StoreStatus> = new Set(["active", "restricted"]);

/** The tabs' store facts (`console.read`): the time zone per-store figures use and the currency; null for an unknown id. */
export async function profileStoreFacts(ctx: PlatformCtx, storeId: string): Promise<{ timezone: string; currency: string } | null> {
  if (!ctx.can("console.read")) throw new AuthRefusal("forbidden");
  if (!/^[0-9A-Z]{26}$/.test(storeId)) return null;
  const [row] = await db.select({ timezone: stores.timezone, currency: stores.currency }).from(stores).where(eq(stores.id, storeId)).limit(1);
  return row ? { timezone: validTimeZone(row.timezone), currency: row.currency } : null;
}

async function handleHistoryCount(scope: StoreScope): Promise<number> {
  const [row] = await db.select({ n: count() }).from(storeHandleHistory).where(whereStore(storeHandleHistory, scope));
  return Number(row?.n ?? 0);
}

const LOADERS: { [K in StripId]: (ctx: PlatformCtx, storeId: string) => Promise<StripData[K]> } = {
  async identity(ctx, storeId) {
    const scope = platformScope(ctx, storeId);
    const store = await storeAddress(storeId);
    const [history, renders] = await Promise.all([
      handleHistoryCount(scope),
      optional("strip.identity.renders", () => renderSummary(scope), { storeId }),
    ]);
    const address = renders?.byReason.find((r) => r.reason === "address");
    return {
      mode: store.mode,
      addressMode: store.handle ? addressMode({ id: store.id, handle: store.handle }) : "P",
      canonicalUrl: store.handle && LIVE.has(store.status) ? storeUrl({ id: store.id, handle: store.handle }) : null,
      handleHistory: history,
      addressRenders: renders ? { pending: address?.pending ?? 0, failed: address?.failed ?? 0 } : null,
      storeId,
    };
  },

  async health(ctx, storeId) {
    const view = await getStoreHealth(platformScope(ctx, storeId));
    if (!view) return null;
    const snoozed = Object.entries(view.snoozed ?? {}).map(([id, until]) => ({ id, until }));
    const open = view.issues.filter((i) => !view.snoozed?.[i.id]);
    return {
      score: view.score,
      components: view.components,
      issues: open.slice(0, 5).map((i) => ({ id: i.id, group: i.group, severity: i.severity, evidence: i.evidence, text: i.text })),
      snoozed,
      flags: view.flags ?? [],
      computedAt: view.computedAt,
      dirty: view.dirty,
    };
  },

  async pages(ctx, storeId) {
    const scope = platformScope(ctx, storeId);
    const store = await storeAddress(storeId);
    const [rows, design] = await Promise.all([listPagesForConsole(scope), optional("strip.pages.design", () => designHealth(scope), { storeId })]);
    const published = rows.filter((r) => r.status === "published");
    const lastPublish = rows.map((r) => r.lastPublishedAt?.getTime() ?? 0).reduce((a, b) => Math.max(a, b), 0);
    const newest = rows[0];
    const genome = newest ? design?.pages.find((p) => p.pageId === newest.id) : undefined;
    return {
      published: published.length,
      drafts: rows.filter((r) => r.status === "draft").length,
      lastPublishAt: lastPublish > 0 ? new Date(lastPublish).toISOString() : null,
      liveUrl: store.handle && LIVE.has(store.status) && published.length ? storeUrl({ id: store.id, handle: store.handle }) : null,
      newest: newest ? { id: newest.id, name: newest.name, status: newest.status, design: genome ? { q: genome.q, slop: genome.slop, hasLook: genome.hasLook } : null } : null,
    };
  },

  async orders(ctx, storeId) {
    const scope = platformScope(ctx, storeId);
    const [kpis7d, kpis28d, mix, latest] = await Promise.all([
      optional("strip.orders.kpis7d", () => orderKpis(scope, "7d"), { storeId }),
      optional("strip.orders.kpis28d", () => orderKpis(scope, "28d"), { storeId }),
      optional("strip.orders.mix", () => orderRiskMix(scope, 28), { storeId }),
      optional("strip.orders.latest", () => listOrdersForConsole(scope, { limit: 5 }), { storeId }),
    ]);
    if (!kpis7d && !kpis28d && !mix && !latest) throw new Error("not implemented: P4 console reads");
    return {
      kpis7d,
      kpis28d,
      riskMix: mix ? { low: mix.low, check: mix.check, high: mix.high, n: mix.n } : null,
      latest: latest
        ? latest.items
            .filter((o) => !o.isTest)
            .slice(0, 5)
            .map((o) => ({ id: o.id, createdAt: o.createdAt, status: o.status, totalCents: o.totalCents, currency: o.currency, customer: maskName(o.customer), phone: o.phoneMasked as Masked, storeCheckout: o.pageId === null }))
        : null,
    };
  },

  async team(ctx, storeId) {
    const team = await getStoreTeam(ctx, storeId);
    if (!team) throw new AuthRefusal("not_found");
    return {
      byRole: team.byRole as Record<string, number>,
      pendingInvites: team.invites.filter((i) => i.state === "pending").length,
      twoFactor: { on: team.twoFactor.on, of: team.twoFactor.of },
      requireMember2fa: team.requireMember2fa,
      agentsOnline: team.agentsOnline,
    };
  },

  async integrations(ctx, storeId) {
    const scope = platformScope(ctx, storeId);
    const [rows, outbox] = await Promise.all([optional("strip.integrations.health", () => integrationHealth(scope), { storeId }), optional("strip.integrations.outbox", () => outboxSummary(scope), { storeId })]);
    if (!rows && !outbox) throw new Error("not implemented: P5 integrationHealth, P8 outboxSummary");
    return { rows, outbox };
  },

  async ai(ctx, storeId) {
    const s = await aiStoreSummary(ctx, storeId);
    const last = s.recent[0];
    return {
      mode: s.mode,
      director: s.director,
      credits: s.credits,
      costMicrosMonth: s.costMicrosMonth,
      openJobs: s.openJobs,
      runs: s.runs.filter((r) => r.by === "provider"),
      last: last ? { at: last.at, task: last.task, class: last.class, provider: last.provider, model: last.model, status: last.status, credits: last.credits, ms: last.ms } : null,
    };
  },

  async usage(ctx, storeId) {
    const u = await getStoreUsage(ctx, storeId);
    if (!u) throw new AuthRefusal("not_found");
    return {
      plan: u.plan,
      meters: u.meters,
      boosts: u.boosts.map((b) => ({ key: b.key, expiresAt: b.expiresAt })),
      stateCaps: stateCapsInForce(u).map((c) => ({ key: c.key, value: c.value, ...(c.mib !== undefined ? { mib: c.mib } : {}) })),
    };
  },

  async risk(ctx, storeId) {
    return loadRiskStrip(ctx, storeId);
  },

  async timeline(ctx, storeId) {
    const [t, health] = await Promise.all([listStoreTimeline(ctx, storeId, { limit: 8 }), optional("strip.timeline.milestones", () => getStoreHealth(platformScope(ctx, storeId)), { storeId })]);
    return { events: t.events, milestones: health?.milestones ?? {} };
  },
};

/** PLA-§L / core §E.2: the console's preview links live 10 minutes */
const PREVIEW_TTL_SEC = 600;

/**
 * PD16 (`console.read`): the pages strip's Preview, a 10-minute staff link to one page of the store, opened in an
 * iframe sandboxed `allow-scripts` only. Minted on demand (a row per opening), never while the strip renders.
 */
export async function stripPreview(ctx: PlatformCtx, storeId: string, pageId: unknown): Promise<{ url: string; expiresAt: string }> {
  if (!ctx.can("console.read")) throw new AuthRefusal("forbidden");
  if (typeof pageId !== "string" || !/^[0-9A-Z]{26}$/.test(pageId)) throw new AuthRefusal("not_found");
  const link = await mintPreviewToken(platformScope(ctx, storeId), { pageId, ttlSec: PREVIEW_TTL_SEC, audience: "staff", staffUserId: ctx.user.id, actor: ctx.actor });
  return { url: link.url, expiresAt: link.expiresAt.toISOString() };
}

/** One strip (`console.read`): its data, "unavailable" (a later track's stub) or its error state. */
export async function loadStrip<K extends StripId>(ctx: PlatformCtx, storeId: string, strip: K): Promise<Panel<StripData[K]>> {
  if (!ctx.can("console.read")) throw new AuthRefusal("forbidden");
  return panel(`strip.${strip}`, () => stripCache.getOrLoad(P, `${storeId}:${strip}:${audienceOf(ctx)}`, () => LOADERS[strip](ctx, storeId)) as Promise<StripData[K]>, { storeId });
}

/** The ten strips in parallel (the page streams each through its own boundary; this is for tests and the perf run). */
export async function loadStrips(ctx: PlatformCtx, storeId: string): Promise<{ [K in StripId]: Panel<StripData[K]> }> {
  const entries = await Promise.all(STRIPS.map(async (s) => [s, await loadStrip(ctx, storeId, s)] as const));
  return Object.fromEntries(entries) as { [K in StripId]: Panel<StripData[K]> };
}

/* ------------------------------------------------------------------ */
/* The KPI row (PLA-§7.3)                                              */
/* ------------------------------------------------------------------ */

export type OverviewRange = 7 | 30 | 90;

export interface StoreOverviewKpis {
  range: OverviewRange;
  /** the store's days of the range, in its time zone */
  from: string;
  to: string;
  timezone: string;
  /** the store's currency (money is never summed across currencies, PD21) */
  currency: string;
  /** unique visitors, orders and placed sales per day (`stats_daily`, test orders never counted, D54) */
  stats: Panel<{ uniques: number; orders: number; placedCents: number; days: { day: string; uniques: number; orders: number }[] }>;
  /**
   * P4's `orderKpis`: placed, confirmed, the confirmation rate with its n. P4 measures 7 and 28 days: the 30-day range
   * reads its 28-day window (the hint says so); the 90-day range has no P4 window (CCR r1-p1-7 item 2) and reads
   * "unavailable", never a guess.
   */
  orders: Panel<OrderKpis & { windowDays: 7 | 28 }>;
  /** delivery, delivered sales and refusal / return rates fill in with delivery tracking (R2) */
  deliveryR2: true;
}

const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** PLA-§7.3's KPI row (`console.read`): every rate with its n; placed, confirmed and delivered never share a value. */
export async function getStoreOverview(ctx: PlatformCtx, storeId: string, range: OverviewRange = 30, now: Date = new Date()): Promise<StoreOverviewKpis> {
  if (!ctx.can("console.read")) throw new AuthRefusal("forbidden");
  const r: OverviewRange = range === 7 || range === 90 ? range : 30;
  const scope = platformScope(ctx, storeId);
  const store = await storeAddress(storeId);
  const tz = validTimeZone(store.timezone);
  const to = dayKey(now, tz);
  const from = addDays(to, -(r - 1));
  const [stats, orders] = await Promise.all([
    panel(
      "overview.kpi.stats",
      async () => {
        const s = await getPageStats(scope, { from, to });
        return { uniques: s.totals.uniques, orders: s.totals.orders, placedCents: Math.round(s.totals.revenue * 100), days: s.days.map((d) => ({ day: d.day, uniques: d.uniques, orders: d.orders })) };
      },
      { storeId },
    ),
    panel(
      "overview.kpi.orders",
      async () => {
        if (r === 90) throw new Error("not implemented: P4 orderKpis has no 90-day window");
        const windowDays = r === 7 ? 7 : 28;
        return { ...(await orderKpis(scope, windowDays === 7 ? "7d" : "28d")), windowDays } as OrderKpis & { windowDays: 7 | 28 };
      },
      { storeId },
    ),
  ]);
  return { range: r, from, to, timezone: tz, currency: store.currency, stats, orders, deliveryR2: true };
}
