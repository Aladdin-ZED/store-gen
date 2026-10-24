/**
 * Jobs of the core track (P8, platform ops): the outbox drain, renders, exports, backup, purge, usage.reconcile,
 * media.migrate, lifecycle, housekeeping.
 * Extension file (docs/STORE-SAAS.md §H.2, §K.3) imported by src/lib/jobs/registry.ts; empty until the track
 * registers its jobs.
 */
import type { Job } from "../runner";

export const jobs: Job[] = [];
