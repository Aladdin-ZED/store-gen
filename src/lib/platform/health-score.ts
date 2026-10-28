/**
 * The Store Health score (docs/STORE-SAAS.md §I.7, D53; platform.md PLA-§6.3.1): pure, isomorphic, re-exported by
 * src/lib/health/engine.ts. One computation for both audiences:
 *
 *   score      = 100 − Σ_group min(HEALTH_CAPS[group], Σ points of the group's unsnoozed issues), clamped 0-100
 *   components = the penalty per group (what the tenant's seven bars draw)
 *   attention  = the highest console flag severity (a suspended store is 3; a design issue alone is 0)
 *
 * Points follow the severity (1 → 3, 2 → 6, 3 → 10) whatever a rule wrote, so no rule can weigh more than its
 * severity says. Monotonic by construction: removing or snoozing an issue only lowers a group's sum, and `min` with a
 * fixed cap never turns a smaller sum into a bigger penalty (`test:health` runs 1,000 random removals and snoozes).
 * Advisory: nothing reads the score to allow or refuse anything (publish gates are core §M).
 */
import { HEALTH_CAPS, type HealthFlag, type HealthGroup, type HealthIssue } from "@/lib/health/types";

/** The seven groups in the order the tenant's bars and the issue sort use (the caps' order, Σ = 100). */
export const HEALTH_GROUPS = Object.keys(HEALTH_CAPS) as HealthGroup[];

/** severity → points (core §I.7) */
export const SEVERITY_POINTS = { 1: 3, 2: 6, 3: 10 } as const satisfies Record<1 | 2 | 3, HealthIssue["points"]>;

/** PD78: the measured window of the health job is its last 12 runs. */
export const WINDOW_RUNS = 12;
/** `health_job_slow` (PLA-§6.3.4): the job's perStoreP50Ms above SLOW_P50_MS for SLOW_STREAK runs in a row. */
export const SLOW_P50_MS = 800;
export const SLOW_STREAK = 3;

/** At most this many issues are stored per store (PLA-§6.3.1); the tenant sees the first 5 unsnoozed. */
export const ISSUES_MAX = 20;

export function pointsFor(severity: HealthIssue["severity"]): HealthIssue["points"] {
  return SEVERITY_POINTS[severity] ?? 3;
}

/** Is the issue snoozed at `now`? (the map holds ISO "until" instants; an unreadable one counts as expired) */
export function isSnoozed(issueId: string, snoozed: Readonly<Record<string, string>> | null | undefined, now: Date): boolean {
  const until = snoozed?.[issueId];
  if (typeof until !== "string") return false;
  const t = Date.parse(until);
  return Number.isFinite(t) && t > now.getTime();
}

/** The snoozes still running at `now` (the job drops the others). */
export function liveSnoozes(snoozed: Readonly<Record<string, string>> | null | undefined, now: Date): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [id, until] of Object.entries(snoozed ?? {})) if (isSnoozed(id, snoozed, now)) out[id] = until;
  return out;
}

/** The core §I.7 signature. */
export function computeHealth(
  issues: readonly HealthIssue[],
  flags: readonly HealthFlag[],
  snoozed: Readonly<Record<string, string>>,
  now: Date,
): { score: number; components: Record<HealthGroup, number>; attention: 0 | 1 | 2 | 3 } {
  const sums = Object.fromEntries(HEALTH_GROUPS.map((g) => [g, 0])) as Record<HealthGroup, number>;
  for (const issue of issues) {
    if (!(issue.group in sums) || isSnoozed(issue.id, snoozed, now)) continue;
    sums[issue.group] += pointsFor(issue.severity);
  }
  const components = Object.fromEntries(HEALTH_GROUPS.map((g) => [g, Math.min(HEALTH_CAPS[g], sums[g])])) as Record<HealthGroup, number>;
  const penalty = HEALTH_GROUPS.reduce((s, g) => s + components[g], 0);
  let attention: 0 | 1 | 2 | 3 = 0;
  for (const f of flags) if (f.severity > attention) attention = f.severity;
  return { score: Math.max(0, Math.min(100, 100 - penalty)), components, attention };
}

/** PLA-§6.3.1's order: points DESC, then the group's place, then the id. */
export function sortIssues<T extends Pick<HealthIssue, "id" | "group" | "severity">>(issues: readonly T[]): T[] {
  const place = (g: HealthGroup) => HEALTH_GROUPS.indexOf(g);
  return [...issues].sort((a, b) => pointsFor(b.severity) - pointsFor(a.severity) || place(a.group) - place(b.group) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * The staleness bound of a snapshot (rev 4, PD78): `max(staleAlarmMinutes, 1.5 × cycleMin)`, where `cycleMin` is the
 * measured time the job needs to visit every store; unknown (no run yet) → the setting alone.
 */
export function staleAfterMin(staleAlarmMinutes: number, cycleMin: number | null | undefined): number {
  const floor = Math.max(1, Math.round(staleAlarmMinutes));
  return typeof cycleMin === "number" && Number.isFinite(cycleMin) && cycleMin > 0 ? Math.max(floor, Math.ceil(1.5 * cycleMin)) : floor;
}

/** The ISO 8601 week of `at` in UTC, "YYYY-Www" (the weekly dedupe keys of health.issue_new and brand_term_live). */
export function isoWeek(at: Date): string {
  const d = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
  const day = d.getUTCDay() || 7; // Monday 1 … Sunday 7
  d.setUTCDate(d.getUTCDate() + 4 - day); // the Thursday of this week decides the year
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** The hour bucket of the alarm dedupe key, "YYYY-MM-DDTHH" in UTC (PLA-§15.2). */
export function hourBucket(at: Date): string {
  return at.toISOString().slice(0, 13);
}

/** Nearest-rank percentile of a list of numbers (0 for an empty list), rounded to whole milliseconds. */
export function percentile(values: readonly number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.min(sorted.length, Math.max(1, Math.ceil((p / 100) * sorted.length)));
  return Math.round(sorted[rank - 1]!);
}

/**
 * The measured cycle (PD78): `ceil(rotation / max(1, storesPerTickP50)) × 5` minutes, where the median is over the
 * last 12 runs of the job and `rotation` the stores it visits (pending, active, restricted). Null before any run.
 */
export function cycleMinutes(rotation: number, storesPerTick: readonly number[]): number | null {
  if (!storesPerTick.length) return null;
  const p50 = percentile(storesPerTick.slice(-WINDOW_RUNS), 50);
  return Math.max(1, Math.ceil(Math.max(0, rotation) / Math.max(1, p50))) * 5;
}
