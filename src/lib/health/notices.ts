/**
 * What the `platform.health` job sends, decided without a database (platform.md PLA-§6.3.4, PD67, PLA-§13.3 item 2):
 * the dedupe keys, the quota crossings, the `health.issue_new` candidates. Pure (Node's hash only), so `test:health`
 * proves the once-only rules; src/lib/health/run.ts sends.
 */
import { createHash } from "node:crypto";
import { isoWeek } from "@/lib/platform/health-score";
import type { SnapshotDraft } from "./engine";
import { quotaPct, QUOTA_FULL_PCT, QUOTA_HIGH_PCT, QUOTA_METRICS } from "./rules/platform";
import type { HealthInputs, HealthIssue } from "./types";

/** A protected term's hash for the weekly alarm key (the term never enters a dedupe key in clear). */
export const termHash = (term: string): string => createHash("sha256").update(term.normalize("NFC").toLowerCase()).digest("hex").slice(0, 12);

/** The dedupe keys of the job's notifications (PLA-§6.3.4, PD67, PLA-§13.3). */
export const healthDedupe = {
  quota: (level: 80 | 100, storeId: string, metric: string, period: string) => `quota${level}:${storeId}:${metric}:${period}`,
  issueNew: (storeId: string, issueId: string, at: Date) => `health:${storeId}:${issueId}:${isoWeek(at)}`,
  brandTermLive: (storeId: string, term: string, at: Date) => `alarm:brand_term_live:${storeId}:${termHash(term)}:${isoWeek(at)}`,
};

/** The quota rows at ≥ 80 % and ≥ 100 % of their plan limit (the notifications' source). */
export function quotaCrossings(inputs: HealthInputs): { level: 80 | 100; metric: string; period: string; used: number; limit: number; percent: number }[] {
  const out: { level: 80 | 100; metric: string; period: string; used: number; limit: number; percent: number }[] = [];
  for (const metric of QUOTA_METRICS) {
    const row = inputs.usage?.find((u) => u.metric === metric);
    const pct = row ? quotaPct(row) : null;
    if (!row || pct === null || row.limit === null) continue;
    const used = Math.max(0, Math.round(row.used));
    if (pct >= QUOTA_HIGH_PCT) out.push({ level: 80, metric, period: row.period, used, limit: row.limit, percent: Math.min(1000, pct) });
    if (pct >= QUOTA_FULL_PCT) out.push({ level: 100, metric, period: row.period, used, limit: row.limit, percent: Math.min(1000, pct) });
  }
  return out;
}

/** The `health.issue_new` candidates: new since a computed previous row, at or above the platform's severity. */
export function issuesToNotify(draft: Pick<SnapshotDraft, "newIssues">, previousComputed: boolean, minSeverity: 2 | 3): HealthIssue[] {
  if (!previousComputed) return [];
  return draft.newIssues.filter((i) => i.severity >= minSeverity && !i.snoozedUntil);
}
