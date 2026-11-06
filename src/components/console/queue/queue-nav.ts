/**
 * The approval queue's tabs in order and its URLs (platform.md PLA-§3.5 "Queue header", §4.5 "filters and the cursor
 * live in the URL"): pure, shared by the server skeleton and the client header, list and split view.
 *
 *   queueHref("fast", "argan", { r: reviewId })   // "/admin/queue?tab=fast&q=argan&r=…"
 */
import type { QueueTab } from "@/lib/platform/queue-rules";
import { consoleUrl } from "@/lib/platform/console-url";

export const TAB_ORDER: readonly QueueTab[] = ["review", "fast", "hold", "needs_info", "requests", "snoozed", "decided"];

export function queueHref(tab: QueueTab, q: string, extra: Record<string, string> = {}): string {
  const p = new URLSearchParams();
  if (tab !== "review") p.set("tab", tab);
  if (q) p.set("q", q);
  for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v);
  const qs = p.toString();
  return qs ? consoleUrl(`/queue?${qs}`) : consoleUrl("/queue");
}
