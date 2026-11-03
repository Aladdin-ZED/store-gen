/**
 * Jobs of the integrations track (P5): sheets.push, sheets.pull, sheets.bind_legacy, int.telegram_daily, ops.capi_ctx_purge.
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
 * The other jobs arrive with their steps (6: the capi_ctx purge; 7: Telegram).
 */
import { runBindLegacyTick } from "@/lib/sheets/bind-legacy";
import { runSheetsPullTick, runSheetsPushTick } from "@/lib/sheets/push";
import type { Job } from "../runner";

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

export const jobs: Job[] = [sheetsPushJob, sheetsPullJob, sheetsBindLegacyJob];
