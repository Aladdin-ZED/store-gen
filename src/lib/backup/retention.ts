/**
 * The backup calendar (docs/STORE-SAAS.md §H.6, §F.9 SEC-20, PLA-§17; R1 P8 step 9). Pure: the job passes the runs,
 * the setting and the clock.
 *
 * - One run per platform day: a Sunday's run is the `weekly` one, every other day's is `daily` (the Sunday daily is
 *   kept as the weekly, so `backup_runs (kind, day)` stays unique).
 * - Kept: the N newest `done` runs whatever their kind (the dailies), plus the M newest `done` Sunday runs (the
 *   weeklies). Defaults 7 and 4 (`platform_backup.retention`), clamped to PLA-§17's bounds 3-30 and 1-12.
 * - A `failed` run is kept while it is not older than the oldest kept daily, so the console still shows its error
 *   code; older ones are pruned. `running` runs are never pruned; `pruned` ones are done with.
 * - purgeRequests: a store id is dropped once the oldest snapshot still kept (a `done` or `running` run) started after
 *   the request, i.e. every retained snapshot was written with the id filtered out. With no snapshot nothing is
 *   dropped.
 */

export type BackupKind = "daily" | "weekly";
export type BackupState = "running" | "done" | "failed" | "pruned";

export const RETENTION_BOUNDS = Object.freeze({ daily: { min: 3, max: 30, def: 7 }, weekly: { min: 1, max: 12, def: 4 } });

export interface RetentionRun {
  id: string;
  /** YYYY-MM-DD, platform timezone */
  day: string;
  kind: BackupKind;
  state: BackupState;
}

/** Sunday, read from the calendar day itself (no timezone involved). */
export function isSunday(day: string): boolean {
  return new Date(`${day}T12:00:00Z`).getUTCDay() === 0;
}

export function kindOfDay(day: string): BackupKind {
  return isSunday(day) ? "weekly" : "daily";
}

const clampInt = (v: unknown, b: { min: number; max: number; def: number }) => {
  const n = typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : b.def;
  return Math.min(b.max, Math.max(b.min, n));
};

export function clampRetention(r: { daily?: unknown; weekly?: unknown } | null | undefined): { daily: number; weekly: number } {
  return { daily: clampInt(r?.daily, RETENTION_BOUNDS.daily), weekly: clampInt(r?.weekly, RETENTION_BOUNDS.weekly) };
}

/** Which runs stay and which are pruned (ids; running and pruned runs appear in neither list). */
export function retentionPlan(runs: readonly RetentionRun[], retention: { daily?: unknown; weekly?: unknown }): { keep: string[]; prune: string[] } {
  const { daily, weekly } = clampRetention(retention);
  const newestFirst = (a: RetentionRun, b: RetentionRun) => (a.day < b.day ? 1 : a.day > b.day ? -1 : a.id < b.id ? 1 : -1);
  const done = runs.filter((r) => r.state === "done").sort(newestFirst);
  const kept = new Set<string>(done.slice(0, daily).map((r) => r.id));
  for (const r of done.filter((x) => isSunday(x.day) || x.kind === "weekly").slice(0, weekly)) kept.add(r.id);
  // failed runs: kept back to the oldest kept daily (all of them while fewer than N dailies exist)
  const floor = done.length >= daily ? done[daily - 1]!.day : null;
  for (const r of runs) if (r.state === "failed" && (floor === null || r.day >= floor)) kept.add(r.id);
  const prune = runs.filter((r) => (r.state === "done" || r.state === "failed") && !kept.has(r.id)).sort(newestFirst).map((r) => r.id);
  const keep = runs.filter((r) => kept.has(r.id)).sort(newestFirst).map((r) => r.id);
  return { keep, prune };
}

/**
 * The store ids to drop from `platform_backup.purgeRequests`: those requested before the oldest retained snapshot
 * started (`retained` = the done and running runs left after pruning). Nothing while no snapshot is retained.
 */
export function purgeIdsToDrop(requests: readonly { storeId: string; at: string }[], retained: readonly { startedAt: string }[]): string[] {
  const starts = retained.map((r) => Date.parse(r.startedAt)).filter((n) => Number.isFinite(n));
  if (!starts.length) return [];
  const oldest = Math.min(...starts);
  return requests.filter((q) => Number.isFinite(Date.parse(q.at)) && Date.parse(q.at) < oldest).map((q) => q.storeId);
}
