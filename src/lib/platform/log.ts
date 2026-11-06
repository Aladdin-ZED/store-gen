import "server-only";
/**
 * The platform track's error line (docs/STORE-SAAS.md §H.5: area "platform", or "health" for the health engine),
 * through P8's `recordError(area, err, opts)` (src/lib/jobs/errors.ts): the error ring and `error_events`, never a raw
 * message (they quote bound values). Applied at the P1 merge (CCR r1-p1-3 item 3, r1-p1-4 item 4); callers unchanged.
 */
import { recordError } from "@/lib/jobs/errors";

export function recordPlatformError(where: string, err: unknown, opts: { storeId?: string; area?: "platform" | "health" } = {}): void {
  recordError(opts.area ?? "platform", err, { storeId: opts.storeId, route: where });
}
