/**
 * The producer of `StorePulse.jobs` (P7 AI; ai.md AI-§S.2, AI R26; docs/STORE-SAAS.md §I.4, §H.12, §K.2 P0 ai stubs).
 * P2's pulse route calls it with `since` = the poller's last `at`, clamped to [now − 10 min, now] (absent or invalid
 * → now − 30 s): `running` = the viewer's `ai_jobs` queued or running, `done` = the ids that reached done, failed or
 * cancelled after `since`. Part of the per-user (uncached) half of the payload. Frozen at P0
 * (src/lib/contracts/r1-p0.ts). P0 stub: `{ running: 0, done: [] }` (no job exists before P7 creates them).
 */
import type { StoreScope } from "@/lib/tenancy/types";

export async function aiJobsForPulse(scope: StoreScope, viewer: { userId: string }, since: Date): Promise<{ running: number; done: string[] }> {
  void scope;
  void viewer;
  void since;
  return { running: 0, done: [] };
}
