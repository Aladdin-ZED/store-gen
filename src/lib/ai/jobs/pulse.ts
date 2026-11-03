import "server-only";
/**
 * The producer of `StorePulse.jobs` (P7 AI; ai.md AI-§S.2, AI R26; docs/STORE-SAAS.md §I.4, §H.12, §K.2 P0 ai stubs).
 * P2's pulse route calls it with `since` = the poller's last `at`; it is clamped here to [now − 10 min, now] (absent or
 * invalid → now − 30 s): `running` = the viewer's own `ai_jobs` queued or running, `done` = the viewer's own ids that
 * reached done, failed or cancelled after `since` (at most 50, newest first). Never another store's job (the scope)
 * nor another member's (the viewer). Part of the per-user (uncached) half of the payload. Frozen at P0
 * (src/lib/contracts/r1-p0.ts).
 */
import type { StoreScope } from "@/lib/tenancy/types";
import { pulseJobsFor } from "../store/jobs";
import { clampSince } from "./stages";

export async function aiJobsForPulse(scope: StoreScope, viewer: { userId: string }, since: Date): Promise<{ running: number; done: string[] }> {
  return pulseJobsFor(scope, viewer, clampSince(since));
}
