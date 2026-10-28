/**
 * Jobs of the platform track (P1): platform.health, platform.alarms, platform.requests, platform.entitlements.
 * Extension file (docs/STORE-SAAS.md §H.2, §K.3) imported by src/lib/jobs/registry.ts.
 *
 * Slot 9 (§H.2: 3 s guaranteed + up to 6 s of leftover, PLA Q.18). The file holds no query of its own (the
 * `src/lib/jobs/**` pin is 0): the work is src/lib/health/run.ts and src/lib/platform/alarms.ts.
 *   - `platform.health` (PLA-§6.3.4, PD78): budget-driven until `ctx.deadline`, dirty rows first; its summary records
 *     `{ stores, perStoreP50Ms, perStoreP95Ms, rulesSlowest, cycleMin }`;
 *   - `platform.alarms` (PLA-§15.2): every tick, ≤ 1 s;
 *   - `platform.requests`, `platform.entitlements`: step 5.
 */
import { runHealthTick } from "@/lib/health/run";
import { runAlarms } from "@/lib/platform/alarms";
import type { Job } from "../runner";

/** §H.2 slot 9's guaranteed slice of the health job (the runner adds the tick's leftover to its deadline). */
export const HEALTH_BUDGET_MS = 3_000;
/** PLA-§15.2: the alarms evaluate in at most a second. */
export const ALARMS_BUDGET_MS = 1_000;

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
];
