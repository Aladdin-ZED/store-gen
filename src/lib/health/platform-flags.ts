/**
 * The console flags (platform.md PLA-§6.3.3; core §I.7, PD42, PD70, PD79): the owner's view of a store, never shown
 * to its tenants. Pure over the inputs, this run's issues and the active protected terms. Flags add no points; their
 * highest severity is the row's `attention` (a suspended store is 3, a store with only a design issue 0).
 *
 *   const flags = carrySince(platformFlags(inputs, issues, { terms, issueSince }), previous?.flags);
 *
 * | Flag                                   | Raised by                                                                     | Sev   |
 * |----------------------------------------|-------------------------------------------------------------------------------|-------|
 * | sheets_backlog · outbox_dead · capi_failing · telegram_failing | derived from P5's `int:sheets_backlog` · `int:delivery_dead` · `int:capi_failing` · `int:telegram_failing` (same evidence, the issue's severity) | issue |
 * | sheets_error                           | `sheets.lastRunFailedAt` within the last hour                                 | 2     |
 * | setup_incomplete                       | P3's `landing:no_live_page` on an active store, present for 7 days            | 1     |
 * | quota_high / quota_full                | a plan limit at ≥ 80 % / ≥ 100 % (P1's quota issues)                          | 1 / 2 |
 * | risky_orders · render_failed           | P1's issues of the same name                                                  | 2     |
 * | inactive_14d                           | an active store, no member activity for 14 days                              | 1     |
 * | dormant_60d                            | no member activity and no order for 60 days (`dormant = true`)               | 1     |
 * | review_waiting                         | pending, submitted, waiting longer than `slaHours` (24 h when unset)          | 1     |
 * | restricted / suspended                 | the status itself                                                             | 2 / 3 |
 * | brand_term_live / brand_near_live      | the live brand scan (rules/platform.ts `brandScan`); detail `{ term, field, pageId? }` | 2 / 1 |
 * | abuse_reports_new                      | ≥ 1 report in 24 h (≥ 3 → severity 2)                                         | 1 / 2 |
 *
 * Deviation (additive, for the report): PLA-§6.3.1 freezes `platformFlags(inputs, issues?)`; the third argument
 * carries what the inputs cannot (the protected terms the brand scan needs, the first-seen date of each issue for the
 * age of `landing:no_live_page`). Without it the brand flags and `setup_incomplete` stay silent, never guessed.
 * Without `issues` the derived flags stay silent too: a flag never stands in for an issue no track emitted.
 */
import type { ProtectedTerm } from "@/lib/platform/brand-match";
import { brandScan, quotaPct, QUOTA_FULL_PCT, QUOTA_HIGH_PCT, QUOTA_METRICS, RISKY_MIN_N, RISKY_SHARE } from "./rules/platform";
import type { HealthFlag, HealthFlagCode, HealthInputs, HealthIssue } from "./types";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** PLA-§6.3.3's thresholds [to tune] */
export const FLAG_RULES = {
  sheetsErrorWithinMs: HOUR,
  setupIncompleteAfterMs: 7 * DAY,
  inactiveAfterMs: 14 * DAY,
  dormantAfterMs: 60 * DAY,
  reviewSlaDefaultHours: 24,
  abuseSevereFrom: 3,
} as const;

/** The issue a console flag mirrors (PD79: one condition, one issue; the flag adds no points). */
export const DERIVED_FLAGS: Readonly<Record<string, HealthFlagCode>> = {
  "int:sheets_backlog": "sheets_backlog",
  "int:delivery_dead": "outbox_dead",
  "int:capi_failing": "capi_failing",
  "int:telegram_failing": "telegram_failing",
};

/** The console flags whose condition is a tenant issue (`platformFlags` ↔ issues consistency, test:health). */
export const FLAG_ISSUE: Partial<Record<HealthFlagCode, string>> = {
  sheets_backlog: "int:sheets_backlog",
  outbox_dead: "int:delivery_dead",
  capi_failing: "int:capi_failing",
  telegram_failing: "int:telegram_failing",
  setup_incomplete: "landing:no_live_page",
  quota_high: "platform:quota_high",
  quota_full: "platform:quota_full",
  risky_orders: "platform:risky_orders",
  render_failed: "platform:render_failed",
};

export interface PlatformFlagOpts {
  /** the active protected terms (the brand scan); absent → no brand flag */
  terms?: readonly ProtectedTerm[] | null;
  /** issue id → ISO first-seen instant (the job keeps it in the stored issues) */
  issueSince?: Readonly<Record<string, string>>;
}

/** The `{ term, field, pageId? }` evidence of a brand flag as its `detail` (JSON; a protected term, never customer data). */
export function brandDetail(hit: { term: string; field: string; pageId?: string }): string {
  return JSON.stringify({ term: hit.term, field: hit.field, ...(hit.pageId ? { pageId: hit.pageId } : {}) });
}

/** A brand flag's detail back, or null. */
export function parseBrandDetail(detail: string | undefined): { term: string; field: string; pageId?: string } | null {
  if (!detail) return null;
  try {
    const d = JSON.parse(detail) as { term?: unknown; field?: unknown; pageId?: unknown };
    if (typeof d.term !== "string" || typeof d.field !== "string") return null;
    return { term: d.term, field: d.field, ...(typeof d.pageId === "string" ? { pageId: d.pageId } : {}) };
  } catch {
    return null;
  }
}

const ms = (d: Date | null | undefined) => (d instanceof Date && !Number.isNaN(d.getTime()) ? d.getTime() : null);

/** PLA-§6.3.3 (signature + the additive `opts`). `since` is `now`; `carrySince` keeps the first one across runs. */
export function platformFlags(inputs: HealthInputs, issues?: readonly HealthIssue[], opts: PlatformFlagOpts = {}): HealthFlag[] {
  const now = inputs.now.getTime();
  const since = inputs.now.toISOString();
  const status = inputs.store.status;
  const out: HealthFlag[] = [];
  const add = (code: HealthFlagCode, severity: 1 | 2 | 3, extra: { value?: number; detail?: string } = {}) => out.push({ code, severity, since, ...extra });

  // mirrored from another track's issue: the same evidence, the issue's severity
  for (const issue of issues ?? []) {
    const code = DERIVED_FLAGS[issue.id];
    if (code) add(code, issue.severity, { value: issue.evidence.value, detail: issue.evidence.metric });
  }
  const sheetsFailedAt = ms(inputs.sheets?.lastRunFailedAt);
  if (sheetsFailedAt !== null && now - sheetsFailedAt >= 0 && now - sheetsFailedAt <= FLAG_RULES.sheetsErrorWithinMs) add("sheets_error", 2);

  const noLivePage = issues?.find((i) => i.id === "landing:no_live_page");
  const noLiveSince = noLivePage ? Date.parse(opts.issueSince?.[noLivePage.id] ?? "") : Number.NaN;
  if (status === "active" && noLivePage && Number.isFinite(noLiveSince) && now - noLiveSince >= FLAG_RULES.setupIncompleteAfterMs) {
    add("setup_incomplete", 1, { value: Math.floor((now - noLiveSince) / DAY), detail: noLivePage.evidence.metric });
  }

  // P1's own issues' conditions (the same functions the rules use)
  let worstHigh: { metric: string; pct: number } | null = null;
  let worstFull: { metric: string; pct: number } | null = null;
  for (const metric of QUOTA_METRICS) {
    const row = inputs.usage?.find((u) => u.metric === metric);
    const pct = row ? quotaPct(row) : null;
    if (pct === null) continue;
    if (pct >= QUOTA_FULL_PCT && (!worstFull || pct > worstFull.pct)) worstFull = { metric, pct };
    else if (pct >= QUOTA_HIGH_PCT && pct < QUOTA_FULL_PCT && (!worstHigh || pct > worstHigh.pct)) worstHigh = { metric, pct };
  }
  if (worstHigh) add("quota_high", 1, { value: worstHigh.pct, detail: worstHigh.metric });
  if (worstFull) add("quota_full", 2, { value: worstFull.pct, detail: worstFull.metric });
  const orders = inputs.orders;
  if (orders && orders.placed >= RISKY_MIN_N && Math.min(orders.risky7d, orders.placed) / orders.placed >= RISKY_SHARE) add("risky_orders", 2, { value: orders.risky7d });
  if (inputs.pages && inputs.pages.renderFailed >= 1) add("render_failed", 2, { value: inputs.pages.renderFailed });

  // activity
  const lastActive = ms(inputs.members?.lastActiveAt);
  const lastLogin = Math.max(ms(inputs.members?.lastLoginAt) ?? 0, lastActive ?? 0) || null;
  if (status === "active" && lastActive !== null && now - lastActive >= FLAG_RULES.inactiveAfterMs) add("inactive_14d", 1, { value: Math.floor((now - lastActive) / DAY) });
  const lastOrder = orders ? (orders.lastOrderAt ? Date.parse(orders.lastOrderAt) : 0) : null;
  if ((status === "active" || status === "restricted") && inputs.members && lastLogin !== null && lastOrder !== null && Number.isFinite(lastOrder)) {
    const last = Math.max(lastLogin, lastOrder);
    if (now - last >= FLAG_RULES.dormantAfterMs) add("dormant_60d", 1, { value: Math.floor((now - last) / DAY) });
  }

  // review
  const submitted = ms(inputs.review?.submittedAt);
  if (status === "pending" && inputs.review?.status === "pending" && submitted !== null) {
    const waited = now - submitted;
    if (waited > (inputs.slaHours ?? FLAG_RULES.reviewSlaDefaultHours) * HOUR) add("review_waiting", 1, { value: Math.floor(waited / HOUR) });
  }

  // status
  if (status === "restricted") add("restricted", 2);
  if (status === "suspended") add("suspended", 3);

  // the live brand guard (PD70): staff only, 0 points
  if (opts.terms?.length) {
    const { live, near } = brandScan(inputs, opts.terms);
    if (live) add("brand_term_live", 2, { detail: brandDetail(live) });
    else if (near) add("brand_near_live", 1, { detail: brandDetail(near) });
  }

  const reports = inputs.abuseReports?.new24h ?? 0;
  if (reports >= 1) add("abuse_reports_new", reports >= FLAG_RULES.abuseSevereFrom ? 2 : 1, { value: reports });
  return out;
}

/** Keeps each flag's first `since` from the previous row while its code stays raised (the console's "since 2 h"). */
export function carrySince(flags: readonly HealthFlag[], previous: readonly HealthFlag[] | null | undefined): HealthFlag[] {
  const before = new Map((previous ?? []).map((f) => [f.code, f.since]));
  return flags.map((f) => {
    const was = before.get(f.code);
    return was && Date.parse(was) <= Date.parse(f.since) ? { ...f, since: was } : f;
  });
}
