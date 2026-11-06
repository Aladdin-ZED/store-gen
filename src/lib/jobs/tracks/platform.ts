/**
 * Jobs of the platform track (P1): platform.health, platform.alarms, platform.requests, platform.entitlements,
 * platform.rerender.
 * Extension file (docs/STORE-SAAS.md §H.2, §K.3) imported by src/lib/jobs/registry.ts.
 *
 * Slot 9 (§H.2: 3 s guaranteed + up to 6 s of leftover, PLA Q.18). The file holds no query of its own (the
 * `src/lib/jobs/**` pin is 0): the work is src/lib/health/run.ts and src/lib/platform/alarms.ts.
 *   - `platform.health` (PLA-§6.3.4, PD78): budget-driven until `ctx.deadline`, dirty rows first; its summary records
 *     `{ stores, perStoreP50Ms, perStoreP95Ms, rulesSlowest, cycleMin }`;
 *   - `platform.alarms` (PLA-§15.2): every tick, ≤ 1 s;
 *   - `platform.requests` (PLA-§2.2, PD7): every tick, ≤ 1 s: unconfirmed four-eyes requests expire after 7 days, due
 *     ones execute (src/lib/platform/platform-requests.ts `runDueRequests`);
 *   - `platform.entitlements` (PLA-§9.4): hourly, ≤ 1 s: `plan.boost_ending` 3 days before a boost expires (once per
 *     row and expiry), override and boost rows expired for more than 30 days deleted
 *     (src/lib/platform/plans.ts `runEntitlementsJob`); the counts go into `job_runs.summary`;
 *   - `platform.rerender` (PLA-§16.2): every tick, ≤ 0.5 s, idle in one read without an open request: the "Re-render
 *     all live pages" fan-out, P8's `enqueueRenders` per store in slices (src/lib/platform/domain-move.ts).
 */
import { runHealthTick } from "@/lib/health/run";
import { runAlarms } from "@/lib/platform/alarms";
import { runRerenderJob } from "@/lib/platform/domain-move";
import { runDueRequests } from "@/lib/platform/platform-requests";
import { runEntitlementsJob } from "@/lib/platform/plans";
import type { Job } from "../runner";

/** §H.2 slot 9's guaranteed slice of the health job (the runner adds the tick's leftover to its deadline). */
export const HEALTH_BUDGET_MS = 3_000;
/** PLA-§15.2: the alarms evaluate in at most a second. */
export const ALARMS_BUDGET_MS = 1_000;
/** PLA-§2.2: a tick executes a few due requests at most (a purge request only moves the store; the purge job deletes). */
export const REQUESTS_BUDGET_MS = 1_000;
/** PLA-§9.4: an hourly sweep of the boosts ending soon and the long-expired rows. */
export const ENTITLEMENTS_BUDGET_MS = 1_000;
/** PLA-§16.2: a slice of the re-render fan-out (one indexed read when idle). */
export const RERENDER_BUDGET_MS = 500;

export const jobs: Job[] = [
  {
    name: "platform.health",
    every: "tick",
    budgetMs: HEALTH_BUDGET_MS,
    run: (ctx) => runHealthTick(ctx),
  },
  {
    name: "platform.alarms",
    every: "tick",
    budgetMs: ALARMS_BUDGET_MS,
    run: (ctx) => runAlarms(ctx),
  },
  {
    name: "platform.requests",
    every: "tick",
    budgetMs: REQUESTS_BUDGET_MS,
    run: async (ctx) => {
      const { executed, failed, expired, done } = await runDueRequests(new Date(), { ctx, deadline: ctx.deadline });
      return { done, summary: { executed, failed, expired } };
    },
  },
  {
    name: "platform.entitlements",
    every: "hourly",
    budgetMs: ENTITLEMENTS_BUDGET_MS,
    run: async (ctx) => {
      const { boostsEnding, notified, deleted, done } = await runEntitlementsJob(new Date(), { deadline: ctx.deadline });
      return { done, summary: { boostsEnding, notified, deleted } };
    },
  },
  {
    name: "platform.rerender",
    every: "tick",
    budgetMs: RERENDER_BUDGET_MS,
    run: (ctx) => runRerenderJob(ctx),
  },
];
