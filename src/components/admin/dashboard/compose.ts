/**
 * The dashboard composer (P2 SHELL; platform.md PLA-§22.17, §22.16; docs/STORE-SAAS.md §I.6, §I.8 rule 3, D54). Pure and
 * isomorphic: it turns the settled panels of `dashboardLoaders()` into what each block draws, so the honesty rules
 * live in one place `test:shell` reads:
 *
 *   composeTiles({ kpis, placed, range })      the six COD KPI tiles, in the spec's order
 *   funnelSteps(funnel)                         the five funnel steps (R1: orders and confirmed; the rest null)
 *   workLines({ queue, pulse, sheet, can })     the work lists' counters with their "See all" paths
 *   healthIssuesFor({ health, setup, status })  the issues the ring lists: the snapshot's, or the local setup pass
 *   wireIssue(issue, handle) / unwireIssue(w)   a health issue across the server → client boundary (fix links built)
 *
 * The rules: a source that is unavailable leaves its tile or line out, never a made-up 0 (build note item 14); placed,
 * confirmed and delivered never share a tile; a rate travels with its `n`, and below the sample it is "needs 30
 * orders"; R2 numbers (delivered, cash to collect) are the honest hint with no number; money is integer cents of
 * placed orders, never a sales total. The inputs already leave test orders out where money is counted (T3's stats,
 * D54); the queue counters count them, because a test order is real work for the person testing.
 */
import type { DashboardPanels, DashboardRange, FunnelData, Panel, PlacedTotals, SheetHealth } from "@/lib/admin-data/dashboard";
import type { StorePermission } from "@/lib/auth/permissions";
import { localSetupIssues, type ShellFacts } from "@/lib/health/rules/shell";
import type { HealthFix, HealthGroup, HealthIssue, StoreHealthView } from "@/lib/health/types";
import type { MessageKey } from "@/lib/i18n/admin";
import type { Kpi, OrderKpis, QueueCounts } from "@/lib/orders/profile";
import type { StoreStatus } from "@/lib/tenancy/types";

type Vars = Record<string, string | number>;

/* ------------------------------------------------------------------ */
/* KPI tiles                                                           */
/* ------------------------------------------------------------------ */

export type TileId = "placed_count" | "confirmed" | "delivered" | "first_touch" | "placed_money" | "cash";

export interface TileSpec {
  id: TileId;
  kind: "count" | "money" | "rate" | "duration";
  label: { key: MessageKey; vars?: Vars };
  /** a count, integer cents (money) or minutes (duration); null = no number (an R2 tile, a sample below its floor) */
  value: number | null;
  /** percent change against the previous period of the same length, only when that period had something */
  delta?: { pct: number; days: number };
  n?: number;
  /** daily points, only from 7 (the tile refuses shorter series anyway) */
  spark?: number[];
  hint: { key: MessageKey; vars?: Vars };
  emphasis?: boolean;
}

const RANGE_DAYS: Record<DashboardRange, number> = { "7d": 7, "28d": 28 };
const SPARK_MIN = 7;

/** Percent change, one decimal; null when there is nothing to compare with (a 0 base is not "+∞ %"). */
export function pctChange(now: number, before: number): number | null {
  if (!Number.isFinite(now) || !Number.isFinite(before) || before <= 0) return null;
  return Math.round(((now - before) / before) * 1000) / 10;
}

const isCount = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const sufficient = (k: Kpi): k is Extract<Kpi, { value: number }> => !("insufficient" in k) && Number.isFinite(k.value);

/** The confirmation rate from the counts (OD17: confirmed ÷ decided), one decimal; null without a decided order. */
export function confirmationPct(k: Pick<OrderKpis, "confirmed" | "decided">): number | null {
  if (!isCount(k.confirmed) || !isCount(k.decided) || k.decided === 0) return null;
  return Math.round((Math.min(k.confirmed, k.decided) * 1000) / k.decided) / 10;
}

export function composeTiles(p: { kpis: DashboardPanels["kpis"]; placed: Panel<PlacedTotals>; range: DashboardRange }): TileSpec[] {
  const days = RANGE_DAYS[p.range];
  const placed = p.placed.ok ? p.placed.data : null;
  const k = p.kpis.ok ? p.kpis.data.range : null;
  const series = placed?.series.slice(-days) ?? [];
  const spark = (pick: (d: PlacedTotals["series"][number]) => number) => (series.length >= SPARK_MIN ? series.map(pick) : undefined);
  const delta = (now: number, before: number) => {
    const pct = pctChange(now, before);
    return pct === null ? undefined : { pct, days };
  };
  const r2 = { key: "shell.honest.r2_delivery" as const };
  const tiles: TileSpec[] = [];

  // 1. Orders placed: the store's own stats (test orders never counted), P4's count when the stats are not there
  if (placed) {
    tiles.push({ id: "placed_count", kind: "count", label: { key: "shell.dash.tile.placed_count" }, value: placed.count, delta: delta(placed.count, placed.previous.count), spark: spark((d) => d.count), hint: { key: "shell.dash.tile.placed_count_hint" } });
  } else if (k && isCount(k.placed)) {
    tiles.push({ id: "placed_count", kind: "count", label: { key: "shell.dash.tile.placed_count" }, value: k.placed, hint: { key: "shell.dash.tile.placed_count_hint" } });
  }

  // 2. Confirmed: the count, and the rate with its n (below the sample: "needs 30")
  if (k && isCount(k.confirmed)) {
    const rate = k.confirmationRate;
    const pct = sufficient(rate) ? confirmationPct(k) : null;
    tiles.push({
      id: "confirmed",
      kind: "count",
      label: { key: "shell.dash.tile.confirmed" },
      value: k.confirmed,
      n: isCount(rate.n) ? rate.n : undefined,
      hint: pct !== null ? { key: "shell.dash.tile.confirmed_rate", vars: { rate: pct } } : { key: "shell.dash.tile.rate_needs", vars: { count: rate.min } },
    });
  }

  // 3. Delivered, 28 days: R2 (delivery tracking); the hint, never a number
  tiles.push({ id: "delivered", kind: "count", label: { key: "shell.dash.tile.delivered" }, value: null, hint: r2 });

  // 4. First touch, median minutes (P4): below the sample, "needs 30 orders"
  if (k) {
    const ft = k.firstTouchP50Min;
    tiles.push(
      sufficient(ft)
        ? { id: "first_touch", kind: "duration", label: { key: "shell.dash.tile.first_touch" }, value: Math.max(0, Math.round(ft.value)), n: ft.n, hint: { key: "shell.dash.tile.first_touch_hint" } }
        : { id: "first_touch", kind: "duration", label: { key: "shell.dash.tile.first_touch" }, value: null, n: isCount(ft.n) ? ft.n : undefined, hint: { key: "shell.dash.tile.rate_needs", vars: { count: ft.min } } },
    );
  }

  // 5. Placed · n days: the value of the orders placed, not delivered (R1.0 called it the sales of the week)
  if (placed) {
    tiles.push({
      id: "placed_money",
      kind: "money",
      label: { key: "shell.dash.tile.placed_money", vars: { days } },
      value: placed.cents,
      delta: delta(placed.cents, placed.previous.cents),
      spark: spark((d) => d.cents),
      hint: { key: "shell.dash.tile.placed_money_hint" },
      emphasis: true,
    });
  }

  // 6. Cash to collect: R2 (the delivered, not yet collected cash)
  tiles.push({ id: "cash", kind: "money", label: { key: "shell.dash.tile.cash" }, value: null, hint: r2 });
  return tiles;
}

/* ------------------------------------------------------------------ */
/* funnel                                                              */
/* ------------------------------------------------------------------ */

export interface FunnelStepSpec {
  id: "orders" | "confirmed" | "shipped" | "delivered" | "collected";
  label: MessageKey;
  value: number | null;
}

const FUNNEL_ID: Record<FunnelData["steps"][number]["id"], FunnelStepSpec["id"]> = { placed: "orders", confirmed: "confirmed", shipped: "shipped", delivered: "delivered", collected: "collected" };

/** The funnel's steps in order: a step without data is null (the R2 line), never 0. */
export function funnelSteps(f: FunnelData): FunnelStepSpec[] {
  return f.steps.map((s) => {
    const id = FUNNEL_ID[s.id];
    return { id, label: `shell.dash.funnel.${id}`, value: isCount(s.n) ? s.n : null };
  });
}

/* ------------------------------------------------------------------ */
/* work lists                                                          */
/* ------------------------------------------------------------------ */

export interface WorkLine {
  id: "to_call" | "callbacks" | "sync_failed" | "leads";
  key: MessageKey;
  count: number;
  /** the store-relative "See all" path (the saved view of the list) */
  path: `/${string}`;
}

/**
 * The work lists' counters: the live pulse's first (P4's `queueNow`, `dueCallbacks`, `syncFailed`; P3's `leadsDue`),
 * then the server's reads (P4's `queueCounts`, R1.0's Sheets queue). A counter no source answers is left out.
 */
export function workLines(p: { queue: Panel<QueueCounts> | null; pulse: Readonly<Record<string, number>> | null; sheet: Panel<SheetHealth> | null; can(perm: StorePermission): boolean }): WorkLine[] {
  const q = p.queue?.ok ? p.queue.data : null;
  const live = (key: string) => (p.pulse && isCount(p.pulse[key]) ? p.pulse[key] : undefined);
  const first = (...vals: (number | undefined | null)[]) => vals.find(isCount);
  const lines: WorkLine[] = [];
  const push = (line: Omit<WorkLine, "count">, count: number | undefined) => {
    if (count !== undefined) lines.push({ ...line, count });
  };
  if (p.can("orders.read")) {
    push({ id: "to_call", key: "shell.dash.work.to_call", path: "/orders?status=new" }, first(live("queueNow"), q?.toCallNow));
    push({ id: "callbacks", key: "shell.dash.work.callbacks", path: "/orders?status=callback" }, first(live("dueCallbacks"), q?.callbacksDue));
    push({ id: "sync_failed", key: "shell.dash.work.sync_failed", path: "/orders?sheet=failed" }, first(live("syncFailed"), p.sheet?.ok && p.sheet.data.connected ? p.sheet.data.failed : undefined));
  }
  if (p.can("leads.read")) push({ id: "leads", key: "shell.dash.work.leads", path: "/orders?tab=leads" }, first(live("leadsDue")));
  return lines;
}

/* ------------------------------------------------------------------ */
/* Store Health                                                        */
/* ------------------------------------------------------------------ */

/** The groups a pending store sees (PLA-§22.16): the rest say "after approval". */
export const PENDING_GROUPS: readonly HealthGroup[] = ["setup", "trust"];

export interface HealthIssueSet {
  issues: HealthIssue[];
  snoozed: Record<string, string>;
  /** "snapshot": the job's row; "local": the synchronous setup pass before the first run (PLA-§22.16 item 1) */
  source: "snapshot" | "local";
}

/**
 * The issues the ring lists for this store's state: the snapshot's, or before the first run the local setup pass over
 * the facts the page already read; a pending store keeps the setup and trust groups only. null = nothing to list from
 * (the snapshot failed and the facts too).
 */
export function healthIssuesFor(p: { health: StoreHealthView | null | undefined; setup: ShellFacts | null; status: StoreStatus }): HealthIssueSet | null {
  let set: HealthIssueSet | null = null;
  if (p.health) set = { issues: p.health.issues, snoozed: p.health.snoozed ?? {}, source: "snapshot" };
  else if (p.setup) set = { issues: localSetupIssues(p.setup), snoozed: {}, source: "local" };
  if (!set) return null;
  if (p.status === "pending") set = { ...set, issues: set.issues.filter((i) => PENDING_GROUPS.includes(i.group)) };
  return set;
}

/** A health fix as it crosses to the browser: a link is built for the store here (`appHref`), a command stays its id. */
export type WireFix = { kind: "link"; path: string; label: MessageKey } | { kind: "action"; actionId: string; label: MessageKey };
export type WireIssue = Omit<HealthIssue, "fix"> & { fix: WireFix };

export function wireIssue(issue: HealthIssue, handle: string): WireIssue {
  const fix: WireFix = issue.fix.kind === "link" ? { kind: "link", path: issue.fix.href(handle), label: issue.fix.label } : { kind: "action", actionId: issue.fix.actionId, label: issue.fix.label };
  return { ...issue, fix };
}

/** The browser's side: the link fix answers the path it was built with, whatever handle it is asked for. */
export function unwireIssue(w: WireIssue): HealthIssue {
  const fix: HealthFix = w.fix.kind === "link" ? { kind: "link", href: ((path: string) => () => path)(w.fix.path), label: w.fix.label } : { kind: "action", actionId: w.fix.actionId, label: w.fix.label };
  return { ...w, fix };
}

/** The celebration's condition (PLA-§22.16 item 4): a score of 90 or more with no severity-3 issue open. */
export function celebrates(score: number | null, issues: readonly Pick<HealthIssue, "severity">[]): boolean {
  return score !== null && Number.isInteger(score) && score >= 90 && !issues.some((i) => i.severity === 3);
}

/** `showScoreToTenantsBelowN`: the number hides (not the issues) while the store has fewer real orders than n. */
export function scoreHidden(policy: { hideScoreBelow: number; orders: number | null } | null): boolean {
  if (!policy || policy.hideScoreBelow <= 0) return false;
  return policy.orders === null || policy.orders < policy.hideScoreBelow;
}
