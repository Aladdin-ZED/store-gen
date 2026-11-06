import "server-only";
/**
 * The `store_info` re-render after a landing settings write (P3 LANDING; landing.md LAN-§8.5, §3.3, §7.1): the store's
 * live pages bake the delivery fallback line, the thank-you blocks and the timeline steps, so a save of the delivery
 * calendar, the "After the order" card, the checkout options or the policies queues every live page of the store for
 * a `store_info` render job (one cron tick; core D50: only the rendered columns change, never a price). A queue
 * failure is logged and never undoes the save.
 */
import { enqueueRenders } from "@/lib/jobs/renders";
import { errorSummary } from "@/lib/orders/log";
import type { WriteScope } from "@/lib/tenancy/types";

/** `render_jobs.priority` of a settings re-render (the zones' own save uses the same) */
const RENDER_PRIORITY = 6;

export async function rerenderLive(scope: WriteScope, area: string): Promise<void> {
  try {
    await enqueueRenders(scope, "all-live", "store_info", RENDER_PRIORITY);
  } catch (err) {
    console.error(`[landing] ${area}: live pages not queued for a re-render:`, errorSummary(err));
  }
}
