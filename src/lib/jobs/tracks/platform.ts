/**
 * Jobs of the platform track (P1): platform.health, platform.alarms, platform.requests, platform.entitlements.
 * Extension file (docs/STORE-SAAS.md §H.2, §K.3) imported by src/lib/jobs/registry.ts; empty until the track
 * registers its jobs.
 */
import type { Job } from "../runner";

export const jobs: Job[] = [];
