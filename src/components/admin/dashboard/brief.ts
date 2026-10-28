/**
 * The Today brief's lines (P2 SHELL; platform.md PLA-§22.17 item 1, §L, PD62; SF-11 R1 slice). Pure and isomorphic:
 * the dashboard reads the counts on the server and `TodayBrief` renders the lines in the viewer's locale. Template
 * lines from real counts, never a model text in R1, at most three:
 *
 *   1. orders   "1 order confirmed today · 2 callbacks due"  (P4's orderKpis(today) and opsPulse)   → /orders
 *   2. health   "To fix first: <the worst open issue>"       (getStoreHealth, rendered by the caller) → its fix
 *   3. queue    "n orders waiting in the queue"               (R1's third line; the opportunity line needs n ≥ 30)
 *
 * Honesty (owner rule 4, build note item 14): a source that is unavailable (null: P4 not merged, a read failed)
 * leaves its line out and never becomes a made-up 0; `brief.empty` ("No orders yet") is said only when the order
 * sources were read and show no order at all; when nothing could be read, no line is returned and the brief hides.
 * The inputs already exclude test orders (D54): the caller reads them with the test filter.
 */
import type { MessageKey } from "@/lib/i18n/admin";
import type { OrderKpis } from "@/lib/orders/profile";
import type { OpsPulse } from "@/lib/orders/queue";

export interface BriefLine {
  key: MessageKey;
  vars: Record<string, string | number>;
  href?: string;
}

/** The opportunity line's sample floor (PLA-§L). */
export const BRIEF_OPPORTUNITY_MIN_N = 30;
export const BRIEF_MAX_LINES = 3;

export interface BriefInput {
  /** today's order KPIs in the store's time zone (test orders excluded); null = unavailable */
  kpisToday: Pick<OrderKpis, "placed" | "confirmed" | "lastOrderAt"> | null;
  /** the queue counters for this viewer; null = unavailable */
  queue: Pick<OpsPulse, "queueNow" | "dueCallbacks"> | null;
  /** the worst open health issue: its sentence already rendered in the viewer's locale, and its fix link */
  worstIssue: { text: string; href: string } | null;
  /** R2: one comparison with its sample size; ignored below `BRIEF_OPPORTUNITY_MIN_N` */
  opportunity?: { a: string; b: string; rateA: number; rateB: number; n: number; href: string } | null;
  /** the store-relative link builder (`appHref` bound to the handle) */
  href: (path: `/${string}` | "") => string;
}

const isCount = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;

export function todayBrief(input: BriefInput): BriefLine[] {
  const { kpisToday, queue, worstIssue, href } = input;
  const k = kpisToday && isCount(kpisToday.placed) && isCount(kpisToday.confirmed) ? kpisToday : null;
  const q = queue && isCount(queue.queueNow) && isCount(queue.dueCallbacks) ? queue : null;
  const lines: BriefLine[] = [];

  // zero data: the order sources were read and there is no order at all (none today, none ever, nothing queued)
  const noOrders = k !== null && k.placed === 0 && k.confirmed === 0 && k.lastOrderAt === null && (q === null || (q.queueNow === 0 && q.dueCallbacks === 0));

  if (noOrders) lines.push({ key: "brief.empty", vars: {}, href: href("/pages") });
  else if (k && q) lines.push({ key: "brief.orders", vars: { confirmed: k.confirmed, callbacks: q.dueCallbacks }, href: href("/orders") });
  else if (k) lines.push({ key: "brief.confirmed", vars: { count: k.confirmed }, href: href("/orders") });
  else if (q && q.dueCallbacks > 0) lines.push({ key: "brief.callbacks", vars: { count: q.dueCallbacks }, href: href("/queue") });

  if (worstIssue && worstIssue.text.trim() !== "") lines.push({ key: "brief.health", vars: { issue: worstIssue.text }, href: worstIssue.href });

  const opp = input.opportunity;
  if (opp && isCount(opp.n) && opp.n >= BRIEF_OPPORTUNITY_MIN_N && Number.isFinite(opp.rateA) && Number.isFinite(opp.rateB)) {
    lines.push({ key: "brief.opportunity", vars: { a: opp.a, b: opp.b, rateA: Math.round(opp.rateA), rateB: Math.round(opp.rateB), n: opp.n }, href: opp.href });
  } else if (!noOrders && q && q.queueNow > 0) {
    lines.push({ key: "brief.queue", vars: { count: q.queueNow }, href: href("/queue") });
  }

  return lines.slice(0, BRIEF_MAX_LINES);
}
