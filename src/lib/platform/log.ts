import "server-only";
/**
 * The platform track's error line (docs/STORE-SAAS.md §H.5: area "platform"). P8's `recordError(area, err, opts)`
 * (src/lib/jobs/errors.ts, P0b CCR P8-8) is not in this branch yet: until it is, one server-log line with
 * `errorSummary(err)` only, never a raw message (they quote bound values). The P1 merge points this body at
 * `recordError("platform", err, { storeId })`; callers stay unchanged.
 */
import { errorSummary } from "@/lib/orders/log";

export function recordPlatformError(where: string, err: unknown, opts: { storeId?: string } = {}): void {
  console.error(`[platform] ${where}${opts.storeId ? ` (store ${opts.storeId})` : ""}:`, errorSummary(err));
}
