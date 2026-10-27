import "server-only";
/**
 * The job registry (docs/STORE-SAAS.md §H.2, §K.3): every job of every track, read by the runner (P8). Maintainer-
 * owned: a job is registered only from its track's `./tracks/<track>.ts`, so no track edits this file. `test:jobs`
 * fails when the guaranteed budgets sum above 95 s, a job declares no budget or two jobs share a name.
 *
 * It also loads the outbox handlers (§H.1): each `./handlers/<kind>.ts` registers itself with
 * `registerOutboxHandler` at import, so whatever drains the outbox (the runner's `outbox` slot, the `after()` drain of a
 * request) loads this registry first. The import lines are written at P0 (`scripts/qa/registries-check.ts`).
 */
import "./handlers/capi";
import "./handlers/telegram";
import type { Job } from "./runner";
import { jobs as aiJobs } from "./tracks/ai";
import { jobs as coreJobs } from "./tracks/core";
import { jobs as designJobs } from "./tracks/design";
import { jobs as integrationsJobs } from "./tracks/integrations";
import { jobs as landingJobs } from "./tracks/landing";
import { jobs as opsJobs } from "./tracks/ops";
import { jobs as platformJobs } from "./tracks/platform";

/** The guaranteed slices of one tick (§H.2: 95 s of the 100 s budget; the last 5 s is the leftover slot). */
export const TICK_GUARANTEED_MS = 95_000;

/** Every registered job (the runner orders them by the §H.2 slots: Sheets first, platform last). */
export const JOBS: readonly Job[] = [...integrationsJobs, ...coreJobs, ...aiJobs, ...opsJobs, ...landingJobs, ...designJobs, ...platformJobs];

export function jobNamed(name: string): Job | undefined {
  return JOBS.find((j) => j.name === name);
}
