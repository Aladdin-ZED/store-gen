import "server-only";
/**
 * The console overview, the platform pulse of `/admin` (platform.md PLA-§5, PL-05; PD15, PD21, PD37): what the five
 * blocks of the page read. Each block is its own loader, so the page streams one `<Suspense>` + `<PanelBoundary>` per
 * block and a failing query shows that block's error state while the others render (`panel()`).
 *
 *   const tiles = await overviewKpis(ctx);          // the six KPI tiles (cached 60 s, suppressed per role)
 *   const rows = await needsAttention(ctx);         // ≤ 20 rows, most severe first
 *   const feed = await activityFeed(ctx);           // the last 50 FEED_ACTIONS rows
 *   const q = await queueSnapshotBlock(ctx);        // the tab counts, the SLA tile, the five oldest reviews
 *   const sys = await systemSummary(ctx);           // P8's machinery, the health engine, the build
 *
 * Real data only (PLA-§5.2): orders and sales read `orders_created_idx` over the last 24 h with `is_test = 0` (core
 * D54); money stays per currency, never summed across (PD21); a tile without data says so instead of a 0 with an
 * arrow; for an analyst both order tiles are hidden while fewer than `analytics.k` (≥ 5) stores contribute (PD15).
 * Every cross-store statement is annotated `// tenancy: platform …` (core §E.3 rule 6); one store's details are never
 * read here.
 */
import { and, desc, eq, gte, inArray, isNotNull, lt, or, sql } from "drizzle-orm";
import { PLATFORM_TIMEZONE } from "@/lib/auth/config";
import { AuthRefusal } from "@/lib/auth/errors";
import { db } from "@/lib/db/client";
import { abuseReports, auditLog, errorEvents, platformRequests, signupReviews, storeHealth, stores, users } from "@/lib/db/schema";
import { getDbUsage, type DbUsage } from "@/lib/db/usage";
import { parseBrandDetail } from "@/lib/health/platform-flags";
import { readHealthJobState } from "@/lib/health/window";
import type { HealthFlag } from "@/lib/health/types";
import { getPlatformSetting } from "@/lib/settings";
import { scopedCache } from "@/lib/tenancy/cache";
import type { PlatformCtx } from "@/lib/tenancy/types";
import { suppressedFor } from "./console-rules";
import { FEED_ACTIONS, type FeedAction } from "./overview-keys";
import { ALARM_STATE_KEY, evaluateAlarms, type AlarmJobState, type AlarmState } from "./alarms";
import { getHealth, type PlatformHealth } from "./health";
import { staleAfterMin } from "./health-score";
import { readJobState } from "./job-state";
import { optional, panel, type Panel } from "./panel";
import { listQueue, queueSnapshot, type QueueListRow, type QueueSnapshot } from "./queue";
import { REQUEST_KINDS, REVIEW_KINDS } from "./queue-rules";

const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

/** PLA-§5.2 / §M.5 `console-kpi`: the tiles and the alarm evaluation, platform-keyed ("p"), 60 s */
const kpiCache = scopedCache<unknown>({ name: "console-kpi", maxEntries: 32, ttlMs: 60_000 });
const P = "p";

function requireRead(ctx: PlatformCtx): void {
  if (!ctx.can("console.read")) throw new AuthRefusal("forbidden");
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

/* ------------------------------------------------------------------ */
/* KPI tiles (PLA-§5.2)                                                */
/* ------------------------------------------------------------------ */

export interface ActiveStoresTile {
  active: number;
  restricted: number;
  inReview: number;
}

export interface WaitingTile {
  count: number;
  oldestMin: number | null;
  /** past `signup.slaHours` (yellow); null while the target is unset */
  pastSla: number | null;
}

export type OrdersTile =
  | { kind: "ok"; count: number; prev: number; stores: number; confirmed: number; risky: number }
  /** "No orders in the last 24 h" (never 0 with a trend arrow) */
  | { kind: "empty" }
  /** analyst, fewer than k stores contribute: "Hidden: fewer than {k} stores contribute" */
  | { kind: "hidden"; k: number };

export type SalesTile =
  /** per currency, integer cents, never summed across currencies; "placed, not delivered" */
  | { kind: "ok"; byCurrency: { currency: string; cents: number; orders: number }[] }
  | { kind: "empty" }
  | { kind: "hidden"; k: number };

export type ErrorsTile = { kind: "ok"; count: number; top: { area: string; code: string; count: number } | null } | { kind: "empty" };

export interface KpiTiles {
  activeStores: Panel<ActiveStoresTile>;
  waiting: Panel<WaitingTile>;
  orders: Panel<OrdersTile>;
  sales: Panel<SalesTile>;
  errors: Panel<ErrorsTile>;
  /** `getDbUsage()` used / quota: yellow ≥ 70 %, crimson ≥ 85 % (`level`) */
  database: Panel<DbUsage | null>;
  /** platform time of the figures (the tiles' hint) */
  timezone: string;
}

async function activeStoresTile(): Promise<ActiveStoresTile> {
  // stores_status_idx: a count per status (the stores table holds no tenant rows of another table)
  const rows = await db
    .select({ status: stores.status, n: sql<number>`COUNT(*)` })
    .from(stores)
    .where(inArray(stores.status, ["active", "restricted", "pending"]))
    .groupBy(stores.status);
  const by = new Map(rows.map((r) => [r.status, Number(r.n)]));
  return { active: by.get("active") ?? 0, restricted: by.get("restricted") ?? 0, inReview: by.get("pending") ?? 0 };
}

async function waitingTile(now: Date): Promise<WaitingTile> {
  const snap = await queueSnapshot(now);
  return { count: snap.counts.review, oldestMin: snap.sla.oldestWaitingMin, pastSla: snap.sla.pastSla };
}

/** The raw order figures of the last 48 h, per store and currency (cached; suppression is applied per role). */
interface OrderFigures {
  cur: { stores: number; count: number; confirmed: number; risky: number; byCurrency: { currency: string; cents: number; orders: number }[] };
  prev: number;
}

async function orderFigures(now: Date): Promise<OrderFigures> {
  const t24 = new Date(now.getTime() - DAY);
  const t48 = new Date(now.getTime() - 2 * DAY);
  // tenancy: platform the overview's order tiles across stores (PLA-§5.2, §M.4 orders_created_idx range, PD37): counts and sums per store and currency, no customer column, test orders excluded (D54)
  const [rows] = (await db.execute(sql`
    SELECT store_id, currency, (created_at >= ${t24}) AS cur, COUNT(*) AS n, ROUND(SUM(total) * 100) AS cents,
      SUM(confirm_state = 'confirmed') AS confirmed, SUM(risk_score >= 70) AS risky
    FROM orders
    WHERE created_at >= ${t48} AND created_at < ${now} AND is_test = 0
    GROUP BY store_id, currency, cur
  `)) as unknown as [{ store_id: string; currency: string; cur: number; n: number; cents: number; confirmed: number; risky: number }[]];
  const storesCur = new Set<string>();
  const byCurrency = new Map<string, { cents: number; orders: number }>();
  let count = 0;
  let confirmed = 0;
  let risky = 0;
  let prev = 0;
  for (const r of rows) {
    const n = Number(r.n);
    if (Number(r.cur) !== 1) {
      prev += n;
      continue;
    }
    storesCur.add(r.store_id);
    count += n;
    confirmed += Number(r.confirmed);
    risky += Number(r.risky);
    const c = byCurrency.get(r.currency) ?? { cents: 0, orders: 0 };
    c.cents += Number(r.cents);
    c.orders += n;
    byCurrency.set(r.currency, c);
  }
  return {
    cur: {
      stores: storesCur.size,
      count,
      confirmed,
      risky,
      byCurrency: [...byCurrency.entries()].map(([currency, v]) => ({ currency, ...v })).sort((a, b) => b.cents - a.cents || (a.currency < b.currency ? -1 : 1)),
    },
    prev,
  };
}

async function errorsTile(now: Date): Promise<ErrorsTile> {
  const bucket = new Date(now.getTime() - DAY).toISOString().slice(0, 13);
  // tenancy: platform the overview's error tile (PLA-§5.2, ee_bucket_idx): counts per area and code of the last 24 h, platform-wide
  const rows = await db
    .select({ area: errorEvents.area, code: errorEvents.code, n: sql<number>`SUM(${errorEvents.count})` })
    .from(errorEvents)
    .where(gte(errorEvents.bucket, bucket))
    .groupBy(errorEvents.area, errorEvents.code);
  if (!rows.length) return { kind: "empty" };
  const sorted = rows.map((r) => ({ area: r.area, code: r.code, count: Number(r.n) })).sort((a, b) => b.count - a.count || (a.code < b.code ? -1 : 1));
  return { kind: "ok", count: sorted.reduce((s, r) => s + r.count, 0), top: sorted[0] ?? null };
}

/** The six tiles of PLA-§5.2 (`console.read`): raw figures cached 60 s, the analyst's k-suppression applied per call. */
export async function overviewKpis(ctx: PlatformCtx, now: Date = new Date()): Promise<KpiTiles> {
  requireRead(ctx);
  const [setting, activeStores, waiting, figures, errors, database] = await Promise.all([
    getPlatformSetting("platform"),
    panel("overview.active_stores", () => kpiCache.getOrLoad(P, "active", () => activeStoresTile()) as Promise<ActiveStoresTile>),
    panel("overview.waiting", () => waitingTile(now)),
    panel("overview.orders", () => kpiCache.getOrLoad(P, "orders", () => orderFigures(now)) as Promise<OrderFigures>),
    panel("overview.errors", () => kpiCache.getOrLoad(P, "errors", () => errorsTile(now)) as Promise<ErrorsTile>),
    panel("overview.database", () => getDbUsage()),
  ]);
  const k = setting.analytics.k;
  const derive = <T>(make: (f: OrderFigures) => T): Panel<T> => (figures.state === "ok" ? { state: "ok", at: figures.at, data: make(figures.data) } : figures);
  const hidden = (f: OrderFigures) => f.cur.count > 0 && suppressedFor(ctx.role, f.cur.stores, k);
  return {
    activeStores,
    waiting,
    orders: derive((f): OrdersTile => (hidden(f) ? { kind: "hidden", k: Math.max(5, k) } : f.cur.count === 0 ? { kind: "empty" } : { kind: "ok", count: f.cur.count, prev: f.prev, stores: f.cur.stores, confirmed: f.cur.confirmed, risky: f.cur.risky })),
    sales: derive((f): SalesTile => (hidden(f) ? { kind: "hidden", k: Math.max(5, k) } : f.cur.count === 0 ? { kind: "empty" } : { kind: "ok", byCurrency: f.cur.byCurrency })),
    errors,
    database,
    timezone: PLATFORM_TIMEZONE,
  };
}

/* ------------------------------------------------------------------ */
/* Needs attention (PLA-§5.3)                                          */
/* ------------------------------------------------------------------ */

export const ATTENTION_MAX = 20;
/** queue rows on hold / reject candidates waiting longer than this */
export const HOLD_WAIT_MS = 2 * HOUR;
/** store requests waiting longer than this */
export const REQUEST_WAIT_MS = DAY;

export type AttentionLevel = "danger" | "warn" | "info";
export type AttentionAction = "open_profile" | "open_risk" | "open_queue" | "open_health" | "review_request" | "open_signup_settings" | "open_waitlist" | "open_backups" | "open_security";

export interface AttentionRow {
  /** the sentence is `console.attention.<code>` with `vars` */
  code: string;
  level: AttentionLevel;
  vars: Record<string, string | number>;
  store: { id: string; handle: string | null; name: string } | null;
  /** when the condition was first seen (ISO), null when unknown */
  since: string | null;
  action: AttentionAction;
  href: string;
}

export interface NeedsAttention {
  rows: AttentionRow[];
  /** more rows than shown (the "See all in Stores" link) */
  more: boolean;
  checkedAt: string;
}

const LEVEL_RANK: Record<AttentionLevel, number> = { danger: 0, warn: 1, info: 2 };

/** The alarm evaluation of PLA-§15.2, shared by the overview and the pulse (60 s; nothing is sent from here). */
export async function cachedAlarms(now: Date = new Date()): Promise<AlarmState[]> {
  return kpiCache.getOrLoad(P, "alarms", () => evaluateAlarms(now)) as Promise<AlarmState[]>;
}

const ALARM_ACTION: Partial<Record<string, AttentionAction>> = {
  signup_capped: "open_waitlist",
  pending_media_budget: "open_signup_settings",
  signup_unguarded: "open_signup_settings",
  backup_failed: "open_backups",
  backup_not_downloaded: "open_backups",
  breakglass_unreviewed: "open_security",
  brand_term_live: "open_risk",
  abuse_reports_spike: "open_profile",
};

function hrefOf(action: AttentionAction, storeId: string | null): string {
  switch (action) {
    case "open_profile":
      return storeId ? `/admin/stores/${storeId}` : "/admin/stores?attention=1";
    case "open_risk":
      return storeId ? `/admin/stores/${storeId}?strip=risk` : "/admin/stores?flag=brand_term_live";
    case "open_queue":
      return "/admin/queue";
    case "review_request":
      return "/admin/queue?tab=requests";
    case "open_signup_settings":
      return "/admin/settings/signup";
    case "open_waitlist":
      return "/admin/settings/signup?tab=waitlist";
    case "open_backups":
      return "/admin/settings/backups";
    case "open_security":
      return "/admin/security/break-glass";
    case "open_health":
    default:
      return "/admin/health";
  }
}

async function storeChips(ids: readonly string[]): Promise<Map<string, { id: string; handle: string | null; name: string }>> {
  const list = [...new Set(ids)].filter((id) => /^[0-9A-Z]{26}$/.test(id));
  if (!list.length) return new Map();
  const rows = await db.select({ id: stores.id, handle: stores.handle, name: stores.name }).from(stores).where(inArray(stores.id, list));
  return new Map(rows.map((r) => [r.id, r]));
}

/** Queue rows waiting past their bound: holds > 2 h, store requests > 24 h (one statement, sr_kind_queue_idx). */
async function queueOverdue(now: Date): Promise<{ holds: number; holdsSince: Date | null; requests: number; requestsSince: Date | null }> {
  const holdBound = new Date(now.getTime() - HOLD_WAIT_MS);
  const reqBound = new Date(now.getTime() - REQUEST_WAIT_MS);
  const waitFrom = sql`COALESCE(${signupReviews.answeredAt}, ${signupReviews.submittedAt}, ${signupReviews.createdAt})`;
  const isHold = sql`${signupReviews.kind} IN ('signup','reopen') AND ${signupReviews.band} IN ('hold','reject_candidate') AND ${waitFrom} < ${holdBound}`;
  const isReq = sql`${signupReviews.kind} NOT IN ('signup','reopen') AND ${signupReviews.createdAt} < ${reqBound}`;
  // tenancy: platform the overview's overdue queue rows across stores (PLA-§5.3 item 2, §M.4 sr_kind_queue_idx): counts and the oldest wait only
  const [row] = await db
    .select({
      holds: sql<number>`COALESCE(SUM(${isHold}), 0)`,
      holdsSince: sql<Date | null>`MIN(CASE WHEN ${isHold} THEN ${waitFrom} END)`.mapWith(signupReviews.createdAt),
      requests: sql<number>`COALESCE(SUM(${isReq}), 0)`,
      requestsSince: sql<Date | null>`MIN(CASE WHEN ${isReq} THEN ${signupReviews.createdAt} END)`.mapWith(signupReviews.createdAt),
    })
    .from(signupReviews)
    .where(
      and(
        inArray(signupReviews.kind, [...REVIEW_KINDS, ...REQUEST_KINDS]),
        or(eq(signupReviews.status, "pending"), and(eq(signupReviews.status, "snoozed"), lt(signupReviews.snoozeUntil, now))),
      ),
    );
  return { holds: Number(row?.holds ?? 0), holdsSince: row?.holdsSince ?? null, requests: Number(row?.requests ?? 0), requestsSince: row?.requestsSince ?? null };
}

/** The store_health rows at attention ≥ 2, most severe and lowest score first (sh_attention_idx). */
async function attentionStores(limit: number): Promise<{ storeId: string; attention: number; score: number; flags: HealthFlag[]; computedAt: Date; handle: string | null; name: string }[]> {
  // tenancy: platform the overview's flagged stores (PLA-§5.3 item 3, §M.4 sh_attention_idx): the health row's numbers and console flags, never customer data
  const rows = await db
    .select({ storeId: storeHealth.storeId, attention: storeHealth.attention, score: storeHealth.score, flags: storeHealth.flags, computedAt: storeHealth.computedAt, handle: stores.handle, name: stores.name })
    .from(storeHealth)
    .innerJoin(stores, eq(stores.id, storeHealth.storeId))
    .where(gte(storeHealth.attention, 2))
    .orderBy(desc(storeHealth.attention), storeHealth.score, storeHealth.storeId)
    .limit(limit);
  return rows.map((r) => ({ ...r, flags: Array.isArray(r.flags) ? r.flags : [] }));
}

/** Four-eyes platform requests waiting for a second person (preq_due_idx). */
async function waitingPlatformRequests(): Promise<{ count: number; since: Date | null; kinds: string[] }> {
  // tenancy: platform the dangerous-action ledger across stores (PLA-§5.3 item 4, §M.4 preq_due_idx): counts and kinds only
  const rows = await db
    .select({ kind: platformRequests.kind, n: sql<number>`COUNT(*)`, since: sql<Date | null>`MIN(${platformRequests.requestedAt})`.mapWith(platformRequests.requestedAt) })
    .from(platformRequests)
    .where(and(eq(platformRequests.status, "pending"), eq(platformRequests.mode, "four_eyes")))
    .groupBy(platformRequests.kind);
  const since = rows.map((r) => r.since).filter((d): d is Date => d instanceof Date);
  return { count: rows.reduce((n, r) => n + Number(r.n), 0), since: since.length ? new Date(Math.min(...since.map((d) => d.getTime()))) : null, kinds: rows.map((r) => r.kind) };
}

/** New abuse reports in 24 h: the count, the stores and the most reported store (ar_status_idx; never details or contact). */
async function newAbuseReports(now: Date): Promise<{ count: number; stores: number; top: string | null; since: Date | null }> {
  const since = new Date(now.getTime() - DAY);
  // tenancy: platform the overview's abuse row (PLA-§5.3 item 5, PD70, ar_status_idx): counts per store of new reports, no reporter data
  const rows = await db
    .select({ storeId: abuseReports.storeId, n: sql<number>`COUNT(*)`, first: sql<Date | null>`MIN(${abuseReports.createdAt})`.mapWith(abuseReports.createdAt) })
    .from(abuseReports)
    .where(and(eq(abuseReports.status, "new"), gte(abuseReports.createdAt, since)))
    .groupBy(abuseReports.storeId)
    .orderBy(desc(sql`COUNT(*)`))
    .limit(200);
  const firsts = rows.map((r) => r.first).filter((d): d is Date => d instanceof Date);
  return {
    count: rows.reduce((n, r) => n + Number(r.n), 0),
    stores: rows.length,
    top: rows[0]?.storeId ?? null,
    since: firsts.length ? new Date(Math.min(...firsts.map((d) => d.getTime()))) : null,
  };
}

/** The flag that ranks a flagged store's row: its most severe console flag (brand_term_live first among equals). */
function headFlag(flags: readonly HealthFlag[]): HealthFlag | null {
  const order = (f: HealthFlag) => (f.code === "brand_term_live" ? -1 : 0);
  return [...flags].sort((a, b) => b.severity - a.severity || order(a) - order(b))[0] ?? null;
}

/** PLA-§5.3: at most 20 rows, most severe first, each with one action (`console.read`). */
export async function needsAttention(ctx: PlatformCtx, now: Date = new Date()): Promise<NeedsAttention> {
  requireRead(ctx);
  const [alarms, alarmState, queue, flagged, requests, abuse] = await Promise.all([
    optional("attention.alarms", () => cachedAlarms(now)),
    optional("attention.alarm_state", () => readJobState<AlarmJobState>(ALARM_STATE_KEY)),
    optional("attention.queue", () => queueOverdue(now)),
    optional("attention.health", () => attentionStores(ATTENTION_MAX + 1)),
    optional("attention.requests", () => waitingPlatformRequests()),
    optional("attention.abuse", () => newAbuseReports(now)),
  ]);
  const rows: AttentionRow[] = [];
  const sinceOf = (key: string) => alarmState?.raised?.[key] ?? null;

  // 1. platform alarms (the machinery, the ceilings, backups, break-glass, the per-store brand and abuse alarms)
  const alarmStores = new Set<string>();
  for (const a of alarms ?? []) {
    const action = ALARM_ACTION[a.code] ?? (a.storeId ? "open_profile" : "open_health");
    if (a.storeId) alarmStores.add(a.storeId);
    rows.push({ code: a.code, level: a.level, vars: a.vars, store: a.storeId ? { id: a.storeId, handle: null, name: "" } : null, since: sinceOf(a.key), action, href: hrefOf(action, a.storeId ?? null) });
  }

  // 2. the queue waiting past its bounds
  if (queue && queue.holds > 0) rows.push({ code: "queue_holds_waiting", level: "warn", vars: { count: queue.holds, hours: Math.floor(HOLD_WAIT_MS / HOUR) }, store: null, since: iso(queue.holdsSince), action: "open_queue", href: "/admin/queue?tab=hold" });
  if (queue && queue.requests > 0) rows.push({ code: "requests_waiting", level: "warn", vars: { count: queue.requests, hours: Math.floor(REQUEST_WAIT_MS / HOUR) }, store: null, since: iso(queue.requestsSince), action: "review_request", href: hrefOf("review_request", null) });

  // 3. flagged stores (brand_term_live is Danger with its term and field)
  for (const s of flagged ?? []) {
    if (alarmStores.has(s.storeId)) continue; // already listed by its alarm
    const head = headFlag(s.flags);
    const brand = head?.code === "brand_term_live" ? parseBrandDetail(head.detail) : null;
    const level: AttentionLevel = s.attention >= 3 || brand ? "danger" : "warn";
    const action: AttentionAction = brand ? "open_risk" : "open_profile";
    rows.push({
      code: brand ? "brand_term_live" : `store_flag.${head?.code ?? "attention"}`,
      level,
      vars: brand ? { handle: s.handle ?? "", field: brand.field, term: brand.term } : { handle: s.handle ?? "", score: s.score, flags: s.flags.length, ...(head?.value !== undefined ? { value: head.value } : {}) },
      store: { id: s.storeId, handle: s.handle, name: s.name },
      since: head?.since ?? iso(s.computedAt),
      action,
      href: hrefOf(action, s.storeId),
    });
  }

  // 4. dangerous actions waiting for a second person
  if (requests && requests.count > 0) rows.push({ code: "platform_requests_waiting", level: "warn", vars: { count: requests.count }, store: null, since: iso(requests.since), action: "open_security", href: "/admin/security/staff?tab=requests" });

  // 5. new abuse reports (the triage inbox is R3: the action opens the most reported store)
  if (abuse && abuse.count > 0) rows.push({ code: "abuse_reports_new", level: "warn", vars: { count: abuse.count, stores: abuse.stores }, store: abuse.top ? { id: abuse.top, handle: null, name: "" } : null, since: iso(abuse.since), action: "open_profile", href: hrefOf("open_profile", abuse.top) });

  rows.sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level]);
  const shown = rows.slice(0, ATTENTION_MAX);
  const chips = await storeChips(shown.filter((r) => r.store && r.store.handle === null).map((r) => r.store!.id));
  for (const r of shown) {
    if (!r.store || r.store.handle !== null) continue;
    const chip = chips.get(r.store.id);
    if (chip) {
      r.store = chip;
      if (!("handle" in r.vars) || r.vars.handle === "") r.vars = { ...r.vars, handle: chip.handle ?? "" };
    }
  }
  return { rows: shown, more: rows.length > ATTENTION_MAX || (flagged?.length ?? 0) > ATTENTION_MAX, checkedAt: now.toISOString() };
}

/* ------------------------------------------------------------------ */
/* Activity feed (PLA-§5.4)                                            */
/* ------------------------------------------------------------------ */

export { FEED_ACTIONS, type FeedAction };

/** the feed reads within the newest 20,000 audit ids (a bounded primary-key scan, §M.4) */
export const FEED_WINDOW = 20_000;
export const FEED_MAX = 50;

export interface FeedRow {
  id: number;
  action: FeedAction;
  at: string;
  store: { id: string; handle: string | null; name: string } | null;
  /** "staff" with a name (null for analysts), "system", or the store's own member ("member") */
  actor: { kind: "staff"; name: string | null } | { kind: "system" } | { kind: "member" };
  /** the code-only vars of `console.feed.<action>` (a milestone, a mode, a kill key) */
  vars: Record<string, string | number>;
}

export interface ActivityFeed {
  rows: FeedRow[];
  head: number;
}

const FEED_VAR_KEYS = ["milestone", "to", "from", "key", "reason", "mode"] as const;

function feedVars(meta: unknown): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  if (!meta || typeof meta !== "object") return out;
  for (const k of FEED_VAR_KEYS) {
    const v = (meta as Record<string, unknown>)[k];
    if (typeof v === "string" && /^[a-z0-9_.:-]{1,40}$/i.test(v)) out[k] = v;
    else if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    else if (typeof v === "boolean") out[k] = v ? "on" : "off";
  }
  return out;
}

/** The newest audit id (the pulse's `auditHead`; a primary-key read). */
export async function auditHead(): Promise<number> {
  // tenancy: platform the newest audit id (PLA-§4.6 auditHead): one number, no row
  const [row] = await db.select({ id: sql<number | null>`MAX(${auditLog.id})` }).from(auditLog);
  return Number(row?.id ?? 0);
}

/** PLA-§5.4: the last 50 rows of FEED_ACTIONS within the newest 20,000 ids; analysts see no staff names. */
export async function activityFeed(ctx: PlatformCtx, opts: { limit?: number } = {}): Promise<ActivityFeed> {
  requireRead(ctx);
  const head = await auditHead();
  if (head === 0) return { rows: [], head };
  const limit = Math.max(1, Math.min(FEED_MAX, opts.limit ?? FEED_MAX));
  // tenancy: platform the console activity feed (PLA-§5.4, §M.4 PK audit_log.id): a bounded id range of a fixed action list, codes only
  const rows = await db
    .select({ id: auditLog.id, action: auditLog.action, at: auditLog.createdAt, storeId: auditLog.storeId, userId: auditLog.userId, actorKind: auditLog.actorKind, meta: auditLog.meta })
    .from(auditLog)
    .where(and(gte(auditLog.id, head - FEED_WINDOW), inArray(auditLog.action, [...FEED_ACTIONS])))
    .orderBy(desc(auditLog.id))
    .limit(limit);
  const storeIds = rows.map((r) => r.storeId).filter((id): id is string => !!id);
  const staffIds = rows.filter((r) => r.actorKind === "platform" && r.userId).map((r) => r.userId!);
  const [chips, names] = await Promise.all([storeChips(storeIds), ctx.role === "analyst" ? Promise.resolve(new Map<string, string>()) : staffNames(staffIds)]);
  return {
    head,
    rows: rows.map((r) => ({
      id: r.id,
      action: r.action as FeedAction,
      at: r.at.toISOString(),
      store: r.storeId ? (chips.get(r.storeId) ?? { id: r.storeId, handle: null, name: "" }) : null,
      actor: r.actorKind === "platform" || r.actorKind === "impersonation" ? { kind: "staff", name: ctx.role === "analyst" ? null : (names.get(r.userId ?? "") ?? null) } : r.actorKind === "system" ? { kind: "system" } : { kind: "member" },
      vars: feedVars(r.meta),
    })),
  };
}

async function staffNames(ids: readonly string[]): Promise<Map<string, string>> {
  const list = [...new Set(ids)];
  if (!list.length) return new Map();
  const rows = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(and(inArray(users.id, list), sql`${users.platformRole} <> 'none'`));
  return new Map(rows.map((r) => [r.id, r.name]));
}

/* ------------------------------------------------------------------ */
/* Queue snapshot and System (PLA-§5.5)                                */
/* ------------------------------------------------------------------ */

export interface QueueSnapshotBlock {
  snapshot: QueueSnapshot;
  /** the five oldest Review rows: score ring, store, waiting */
  oldest: Pick<QueueListRow, "id" | "storeId" | "score" | "band" | "store" | "waitingSince">[];
}

export async function queueSnapshotBlock(ctx: PlatformCtx, now: Date = new Date()): Promise<QueueSnapshotBlock> {
  requireRead(ctx);
  const [snapshot, list] = await Promise.all([queueSnapshot(now), listQueue(ctx, "review", {}, null, now)]);
  return { snapshot, oldest: list.rows.slice(0, 5).map((r) => ({ id: r.id, storeId: r.storeId, score: r.score, band: r.band, store: r.store, waitingSince: r.waitingSince })) };
}

/** The health engine's own figures (PD57): stale `active` snapshots, dirty rows, the last run. */
export interface HealthEngineSummary {
  staleSnapshots: number;
  dirtyRows: number;
  lastRunAt: string | null;
  cycleMin: number | null;
  staleAfterMin: number;
}

/** One statement over store_health (a count per state), the job state from `job_runs` (P1's health window). */
export async function healthEngineSummary(now: Date = new Date()): Promise<HealthEngineSummary> {
  const [state, setting] = await Promise.all([readHealthJobState(), getPlatformSetting("platform")]);
  const after = staleAfterMin(setting.health.staleAlarmMinutes, state.cycleMin);
  const bound = new Date(now.getTime() - after * MIN);
  // tenancy: platform the health engine's pulse (PLA-§4.6 health, PD57): two counts over every store's snapshot row, no store data
  const [row] = await db
    .select({
      dirty: sql<number>`COALESCE(SUM(${storeHealth.dirtyAt} IS NOT NULL), 0)`,
      stale: sql<number>`COALESCE(SUM(${stores.status} = 'active' AND ${storeHealth.computedAt} < ${bound}), 0)`,
    })
    .from(storeHealth)
    .innerJoin(stores, eq(stores.id, storeHealth.storeId))
    .where(isNotNull(storeHealth.storeId));
  return { staleSnapshots: Number(row?.stale ?? 0), dirtyRows: Number(row?.dirty ?? 0), lastRunAt: state.lastRunAt, cycleMin: state.cycleMin, staleAfterMin: after };
}

export type TickState = "ok" | "late" | "stopped";

export interface SystemSummary {
  /** P8's `getHealth()`: unavailable until P8 merges (never guessed) */
  machine: Panel<{
    lastTickAt: string | null;
    tick: TickState | null;
    outbox: { pending: number; dead: number };
    renders: { pending: number; failed: number; oldestMin: number | null };
    edge: { sMode: boolean; workerVersion: string | null };
    mediaBackend: "fs" | "db" | null;
    build: string | null;
    ai: { state: "ok" | "paused" | "off"; capUsedPct: number | null } | null;
  }>;
  health: Panel<HealthEngineSummary>;
}

/** green < 6 min, yellow < 10 min, red (PLA-§5.5) */
export function tickState(lastTickAt: string | null, now: Date): TickState | null {
  if (!lastTickAt) return null;
  const min = (now.getTime() - Date.parse(lastTickAt)) / MIN;
  return min < 6 ? "ok" : min < 10 ? "late" : "stopped";
}

function machineOf(h: PlatformHealth, now: Date): Extract<SystemSummary["machine"], { state: "ok" }>["data"] {
  const outbox = h.outbox.byKind.reduce((acc, r) => ({ pending: acc.pending + (r.state === "pending" ? r.count : 0), dead: acc.dead + (r.state === "dead" ? r.count : 0) }), { pending: 0, dead: 0 });
  const renders = {
    pending: h.renders.byReason.reduce((n, r) => n + r.pending, 0),
    failed: h.renders.byReason.reduce((n, r) => n + r.failed, 0),
    oldestMin: h.renders.oldestPending?.ageMin ?? null,
  };
  const aiState = h.ai ? (!h.ai.enabled ? "off" : h.ai.classes.some((c) => c.state !== "ok") ? "paused" : "ok") : null;
  return {
    lastTickAt: h.cron.lastTickAt,
    tick: tickState(h.cron.lastTickAt, now),
    outbox,
    renders,
    edge: { sMode: h.edge.sMode, workerVersion: h.edge.workerVersion },
    mediaBackend: h.runtime.bootWarnings.some((w) => /media.*db|db.*fallback/i.test(w)) ? "db" : "fs",
    build: h.build.id,
    ai: aiState ? { state: aiState, capUsedPct: h.ai?.spend.usedPct ?? null } : null,
  };
}

export async function systemSummary(ctx: PlatformCtx, now: Date = new Date()): Promise<SystemSummary> {
  requireRead(ctx);
  const [machine, health] = await Promise.all([panel("overview.system", async () => machineOf(await getHealth(ctx), now)), panel("overview.health_engine", () => healthEngineSummary(now))]);
  return { machine, health };
}
