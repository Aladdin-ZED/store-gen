import "server-only";
/**
 * The AI rate buckets (P7 AI; ai.md AI-§A.4 step 1, AI-§C.3, AI-§A.7; docs/STORE-SAAS.md §E.8): every one a store
 * bucket built with `storeBucket()`, so one store's traffic never spends another's budget.
 *
 *   s:<sid>:ai:<task>              120 / h per task (after the credits)
 *   s:<sid>:ai:u:<userId>          60 / 10 min per user
 *   s:<sid>:ai:jobs                10 / h deep job creation
 *   s:<sid>:ai:report:<userId>     120 / h local-run telemetry
 */
import { rateLimit, storeBucket, type Bucket } from "@/lib/security/rate-limit";
import type { StoreScope } from "@/lib/tenancy/types";
import type { AiTaskId } from "../tasks";

export const AI_RATES = {
  task: { limit: 120, windowSec: 3_600 },
  user: { limit: 60, windowSec: 600 },
  jobs: { limit: 10, windowSec: 3_600 },
  report: { limit: 120, windowSec: 3_600 },
} as const;

export const aiTaskBucket = (scope: StoreScope, task: AiTaskId): Bucket => storeBucket(scope, `ai:${task}`);
export const aiUserBucket = (scope: StoreScope, userId: string): Bucket => storeBucket(scope, "ai:u", userId);
export const aiJobsBucket = (scope: StoreScope): Bucket => storeBucket(scope, "ai:jobs");
export const aiReportBucket = (scope: StoreScope, userId: string): Bucket => storeBucket(scope, "ai:report", userId);

/** The per-task then per-user limits of one call; `retryAfterSec` from the first that refuses. */
export async function aiRateGate(scope: StoreScope, task: AiTaskId, userId: string | null): Promise<{ ok: true } | { ok: false; retryAfterSec: number }> {
  const t = await rateLimit(aiTaskBucket(scope, task), AI_RATES.task.limit, AI_RATES.task.windowSec);
  if (!t.ok) return { ok: false, retryAfterSec: t.retryAfter };
  if (userId) {
    const u = await rateLimit(aiUserBucket(scope, userId), AI_RATES.user.limit, AI_RATES.user.windowSec);
    if (!u.ok) return { ok: false, retryAfterSec: u.retryAfter };
  }
  return { ok: true };
}
