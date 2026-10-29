/**
 * Jobs of the integrations track (P5): sheets.push, sheets.pull, sheets.bind_legacy, int.telegram_daily, ops.capi_ctx_purge.
 * Extension file (docs/STORE-SAAS.md §H.2, §K.3) imported by src/lib/jobs/registry.ts.
 *
 * - `sheets.push` (slot 1, every tick, 18 s; OPE-§19.5, §19.7, OPE-§J): the stores matching `pending_sheets`, the
 *   oldest waiting order first, one run of ≤ 3 Google calls each (src/lib/sheets/push.ts `runSheetsPushTick`), the
 *   deadline checked before every call and `ctx.yield()` awaited between stores; a store whose step throws is
 *   skipped and logged. The `p:sheets:sa` bucket (50 / 60 s) caps it near 16 stores per tick.
 * The other jobs arrive with their steps (5: the pull and the legacy binding; 6: the capi_ctx purge; 7: Telegram).
 */
import { runSheetsPushTick } from "@/lib/sheets/push";
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
        calls: report.calls,
        failedStores: report.failedStores,
        stoppedBy: report.stoppedBy ?? "none",
      },
    };
  },
};

export const jobs: Job[] = [sheetsPushJob];
