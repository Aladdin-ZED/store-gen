import "server-only";
/**
 * The Telegram daily summary (P5 INTEGRATIONS; operations.md OPE-§21.2, OPE-§J `int.telegram_daily`; OD17, OD38,
 * OD48). The hourly job visits the active stores; a store whose Telegram is on, with `notifications.telegram
 * .dailySummary`, and whose store-local hour is `dailySummaryHour` gets today's figures queued once (the dedupe key
 * `tg:daily:<storeId>:<day>`: a second run in the same hour, or another process, queues nothing).
 *
 * The figures are P4's reads over the store's own rows, test orders excluded: `orderKpis(scope, "today")` (placed,
 * confirmed with the confirmation rate and its n, delivered) and `queueCounts(scope)` (callbacks due, delivery
 * problems), plus the Sheets row of `integrationHealth`. A read that fails, or is still P4's P0 stub, leaves its
 * figures out: never a 0 standing in for an unknown, never an estimate. With no figure at all nothing is queued.
 * Cash held (R2, OPE-§16.7) joins when S3's reads exist; the line is built only for statement accounts (OD52).
 */
import { forEachStore, systemScope } from "@/lib/jobs/scope";
import type { JobCtx } from "@/lib/jobs/runner";
import { errorSummary } from "@/lib/orders/log";
import type { StoreScope } from "@/lib/tenancy/types";
import { integrationHealth } from "../health";
import type { DailyFigures } from "./messages";
import { notBuiltYet, queueTelegram, telegramDeps, telegramState } from "./queue";

/** The store-local hour (0-23) and calendar day (YYYY-MM-DD) of `now`. Pure. */
export function localHourAndDay(now: Date, tz: string): { hour: number; day: string } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(now);
  } catch {
    parts = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(now);
  }
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? "";
  return { hour: Number(get("hour")) % 24, day: `${get("year")}-${get("month")}-${get("day")}` };
}

/** A read that may be P4's stub or fail: null then, logged unless it is the stub. */
async function maybe<T>(label: string, read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch (err) {
    if (!notBuiltYet(err)) console.error(`[int.telegram_daily] ${label}:`, errorSummary(err));
    return null;
  }
}

/** Today's figures of one store (absent where a read failed). */
export async function dailyFigures(scope: StoreScope, day: string): Promise<DailyFigures> {
  const deps = telegramDeps();
  const [kpis, counts, health] = await Promise.all([maybe("orderKpis", () => deps.orderKpis(scope, "today")), maybe("queueCounts", () => deps.queueCounts(scope)), maybe("health", () => integrationHealth(scope))]);
  const f: DailyFigures = { day };
  if (kpis) {
    f.placed = kpis.placed;
    f.confirmed = kpis.confirmed;
    f.confirmationRate = kpis.confirmationRate;
    f.delivered = kpis.delivered;
  }
  if (counts) {
    f.callbacksDue = counts.callbacksDue;
    f.deliveryProblems = counts.deliveryRescue;
  }
  const sheets = health?.find((r) => r.kind === "sheets" && r.targetId === "");
  if (sheets && sheets.state !== "off") f.sheets = sheets.state;
  return f;
}

/** Has the summary something to say? (the day alone is nothing) */
export const hasFigures = (f: DailyFigures): boolean => Object.keys(f).some((k) => k !== "day" && f[k as keyof DailyFigures] !== undefined);

export interface DailyReport {
  done: boolean;
  visited: number;
  due: number;
  queued: number;
}

/** One run of `int.telegram_daily` (≤ 2 s, slot 7). */
export async function runTelegramDailyTick(ctx: JobCtx, opts: { budgetMs: number; now?: Date }): Promise<DailyReport> {
  const now = opts.now ?? new Date();
  const report: DailyReport = { done: true, visited: 0, due: 0, queued: 0 };
  const run = await forEachStore(ctx, { job: ctx.job, states: ["active", "restricted"], budgetMs: Math.max(1, opts.budgetMs) }, async (_scope, store) => {
    if (Date.now() >= ctx.deadline) return;
    const scope = systemScope(ctx, store.id);
    const state = await telegramState(scope);
    if (!state.ready || !state.notifications.telegram.dailySummary) return;
    const { hour, day } = localHourAndDay(now, store.timezone || "Africa/Casablanca");
    if (hour !== state.notifications.telegram.dailySummaryHour) return;
    report.due++;
    const figures = await dailyFigures(scope, day);
    if (!hasFigures(figures)) return;
    const r = await queueTelegram(scope, { kind: "daily", figures });
    if (r.queued && r.inserted > 0) report.queued++;
    await ctx.yield();
  });
  report.visited = run.visited;
  report.done = run.done;
  return report;
}
