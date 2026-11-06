/**
 * Jobs of the integrations track (P5): sheets.push, sheets.pull, sheets.bind_legacy, ops.capi_ctx_purge, int.telegram_daily.
 * Extension file (docs/STORE-SAAS.md §H.2, §K.3) imported by src/lib/jobs/registry.ts.
 *
 * - `sheets.push` (slot 1, every tick, 18 s; OPE-§19.5, §19.7, OPE-§J): the stores matching `pending_sheets`, the
 *   oldest waiting order first, one run of ≤ 3 Google calls each (src/lib/sheets/push.ts `runSheetsPushTick`), the
 *   deadline checked before every call and `ctx.yield()` awaited between stores; a store whose step throws is
 *   skipped and logged. The `p:sheets:sa` bucket (50 / 60 s) caps it near 16 stores per tick. A run whose store's
 *   pull window is open (`s:<sid>:sheets:pull`, 1 / 290 s) pulls on its own read (OPE-§19.6).
 * - `sheets.pull` (slot 2, every tick, 12 s): round-robin over the active stores (cursor `sheets.pull`); a store with
 *   "Bring status changes back" on whose window is still open (slot 1 did not read it) gets one read-only run, 1 call
 *   (`runSheetsPullTick`).
 * - `sheets.bind_legacy` (slot 7, every tick, ≤ 50 ms): the legacy binding pass (src/lib/sheets/bind-legacy.ts), a
 *   no-op once done.
 * - `ops.capi_ctx_purge` (slot 8 housekeeping, daily at 03:20, ≤ 800 ms; OPE-§20.4 (5), OPE-§J): every store's
 *   `orders.capi_ctx` of orders 8 to 30 days old is nulled (src/lib/orders/conversions.ts `purgeCapiContexts`, 500 rows
 *   per statement over `orders_store_created_idx`), the deadline checked between statements and stores, `ctx.yield()`
 *   awaited between stores; a store left unfinished is caught up on the next run (the 30-day look-back).
 * - `int.telegram_daily` (slot 7, hourly, ≤ 2 s; OPE-§21.2, OPE-§J): the stores whose store-local hour is their
 *   `dailySummaryHour`, with Telegram on and the summary on, get today's summary queued once per day (dedupe key
 *   `tg:daily:<storeId>:<day>`; src/lib/integrations/telegram/daily.ts), `ctx.yield()` awaited between stores.
 */
import { runTelegramDailyTick } from "@/lib/integrations/telegram/daily";
import { purgeCapiContexts } from "@/lib/orders/conversions";
import { errorSummary } from "@/lib/orders/log";
import { runBindLegacyTick } from "@/lib/sheets/bind-legacy";
import { runSheetsPullTick, runSheetsPushTick } from "@/lib/sheets/push";
import type { Job } from "../runner";
import { forEachStore, systemScope } from "../scope";

export const sheetsPushJob: Job = {
  name: "sheets.push",
  every: "tick",
  budgetMs: 18_000,
  perStore: { states: ["active", "restricted"], maxStoresPerTick: 50, where: "pending_sheets" },
  async run(ctx) {
    const report = await runSheetsPushTick(ctx, { budgetMs: Math.max(1, ctx.deadline - Date.now()), deadline: ctx.deadline, yieldLoop: () => ctx.yield() });
    return {
      done: report.done,
      summary: {
        visited: report.visited,
        appended: report.appended,
        updated: report.updated,
        pulled: report.pulled,
        calls: report.calls,
        failedStores: report.failedStores,
        stoppedBy: report.stoppedBy ?? "none",
      },
    };
  },
};

export const sheetsPullJob: Job = {
  name: "sheets.pull",
  every: "tick",
  budgetMs: 12_000,
  perStore: { states: ["active", "restricted"], maxStoresPerTick: 50 },
  async run(ctx) {
    const report = await runSheetsPullTick(ctx, { budgetMs: Math.max(1, ctx.deadline - Date.now()), deadline: ctx.deadline, yieldLoop: () => ctx.yield() });
    return {
      done: report.done,
      summary: { visited: report.visited, read: report.read, pulled: report.pulled, calls: report.calls, failedStores: report.failedStores, stoppedBy: report.stoppedBy ?? "none" },
    };
  },
};

export const sheetsBindLegacyJob: Job = {
  name: "sheets.bind_legacy",
  every: "tick",
  budgetMs: 50,
  async run(ctx) {
    const report = await runBindLegacyTick(ctx, { budgetMs: Math.max(1, Math.min(50, ctx.deadline - Date.now())) });
    return { done: report.done, summary: { visited: report.visited, bound: report.bound, moved: report.moved, conflicts: report.conflicts } };
  },
};

export const capiCtxPurgeJob: Job = {
  name: "ops.capi_ctx_purge",
  every: { dailyAt: "03:20" },
  budgetMs: 800,
  async run(ctx) {
    let cleared = 0;
    let unfinished = 0;
    const run = await forEachStore(
      ctx,
      { job: ctx.job, states: ["active", "restricted", "pending", "suspended", "closed"], budgetMs: Math.max(1, ctx.deadline - Date.now()) },
      async (_scope, store) => {
        if (Date.now() >= ctx.deadline) return;
        try {
          const r = await purgeCapiContexts(systemScope(ctx, store.id), { deadline: ctx.deadline });
          cleared += r.cleared;
          if (!r.done) unfinished++;
        } catch (err) {
          unfinished++;
          console.error(`[ops.capi_ctx_purge] store ${store.id}:`, errorSummary(err));
        }
        await ctx.yield();
      },
    );
    return { done: run.done && unfinished === 0, summary: { visited: run.visited, cleared, unfinished } };
  },
};

export const telegramDailyJob: Job = {
  name: "int.telegram_daily",
  every: "hourly",
  budgetMs: 2_000,
  async run(ctx) {
    const report = await runTelegramDailyTick(ctx, { budgetMs: Math.max(1, Math.min(2_000, ctx.deadline - Date.now())) });
    return { done: report.done, summary: { visited: report.visited, due: report.due, queued: report.queued } };
  },
};

export const jobs: Job[] = [sheetsPushJob, sheetsPullJob, sheetsBindLegacyJob, capiCtxPurgeJob, telegramDailyJob];
