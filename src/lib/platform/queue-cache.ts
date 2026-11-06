import "server-only";
/**
 * The console pulse's queue entry (platform.md PLA-§M.5 `console-pulse`, key "p" : "queue", 5 s): the tab counts and
 * the SLA tile the console polls. Its own small module so the tenant-side writes (src/lib/platform/requests.ts: a
 * submit, an answer, an appeal, a store request) drop it without loading the queue's console reads.
 */
import { scopedCache } from "@/lib/tenancy/cache";
import type { QueueTab, SlaTile } from "./queue-rules";

export interface QueueSnapshot {
  counts: Record<QueueTab, number>;
  sla: SlaTile;
  /** review rows whose seller answered a staff question (back in Review with `answered_at`) */
  answered: number;
}

export const queuePulseCache = scopedCache<QueueSnapshot>({ name: "console-pulse", maxEntries: 8, ttlMs: 5_000 });
export const QUEUE_PULSE = { scope: "p", key: "queue" } as const;

/** Every queue write calls this, so the console pulse shows the new counts on its next poll. */
export function invalidateQueueSnapshot(): void {
  queuePulseCache.delete(QUEUE_PULSE.scope, QUEUE_PULSE.key);
}
