import "server-only";
/**
 * The `platform.health` job's work (docs/STORE-SAAS.md §H.2 slot 9, §I.7, D53; platform.md PLA-§6.3.4, PD40, PD67,
 * PD78): one store's computation and the budget-driven tick that runs it store after store. The job file
 * (src/lib/jobs/tracks/platform.ts) only calls `runHealthTick`; nothing here is a cross-store statement except the queue
 * view of ./rows.ts.
 *
 *   per store: collectHealthInputs → runRules(HEALTH_RULES) → platformFlags → milestonesOf → computeHealth
 *              → the store_health upsert (dirty_at NULL, ≤ 20 issues, expired snoozes dropped) under a lock of the row
 *              → once-only side effects: `store.milestone.reached` (actor system), `quota.80` / `quota.100` per metric
 *                and period, `health.issue_new` per new issue id and ISO week, `staff.alarm brand_term_live` per store,
 *                term and ISO week (every one deduplicated by its key, so a re-run never repeats it)
 *   per tick:  the queue (dirty rows by dirty_at, then stores without a snapshot, then the oldest computed_at) until
 *              `ctx.deadline`, `ctx.yield()` between stores; summary { stores, perStoreP50Ms, perStoreP95Ms,
 *              rulesSlowest, cycleMin } and the measured window kept in `cron_cursors` (`platform.health:window`).
 *
 * Decisions (for the report): a store's first computation (no computed row before) notifies no `health.issue_new`: the
 * issues are on the ring the seller is looking at, and every one would be "new"; quota and health notifications go
 * only to stores in the rotation (pending, active, restricted); the job never writes a tenant table other than
 * `store_health` (notifications and audit rows are the platform's own writers).
 */
import { auditFrom } from "@/lib/audit";
import type { JobCtx, JobResult } from "@/lib/jobs/runner";
import { systemScope } from "@/lib/jobs/scope";
import { activeProtectedTerms } from "@/lib/platform/brand-check";
import type { ProtectedTerm } from "@/lib/platform/brand-match";
import { percentile } from "@/lib/platform/health-score";
import { invalidateHealthView } from "@/lib/platform/health-snapshot";
import { writeJobState } from "@/lib/platform/job-state";
import { recordPlatformError } from "@/lib/platform/log";
import { notify } from "@/lib/platform/notify";
import { getPlatformSetting } from "@/lib/settings";
import { getStoreById } from "@/lib/tenancy/public";
import type { StoreRow, SystemCtx } from "@/lib/tenancy/types";
import { buildSnapshot, issueSinceOf, runRulesReport, toStoredIssue, type PreviousSnapshot, type RuleFailure } from "./engine";
import { collectHealthInputsReport, DEFAULT_SOURCES, type HealthSources } from "./inputs";
import { healthDedupe, issuesToNotify, quotaCrossings } from "./notices";
import { carrySince, parseBrandDetail, platformFlags } from "./platform-flags";
import { HEALTH_RULES } from "./registry";
import { commitSnapshot, countRotationStores, isComputed, ROTATION_STATES, scanHealthRows, type HealthRow } from "./rows";
import type { HealthFlag, HealthIssue, HealthRule, Milestone } from "./types";
import { HEALTH_STATE_KEY, nextHealthState, readHealthJobState } from "./window";

/* ------------------------------------------------------------------ */
/* One store                                                           */
/* ------------------------------------------------------------------ */

export interface StoreHealthOpts {
  now?: Date;
  sources?: HealthSources;
  rules?: readonly HealthRule[];
  release?: "R1" | "R2" | "R3";
  /** the active protected terms (read once per tick by the job) */
  terms?: readonly ProtectedTerm[];
  /** `platform.health.issueNotifyMinSeverity` (read once per tick by the job) */
  issueNotifyMinSeverity?: 2 | 3;
  record?: (failure: RuleFailure) => void;
}

export interface StoreHealthReport {
  storeId: string;
  ms: number;
  score: number;
  attention: 0 | 1 | 2 | 3;
  issues: number;
  flags: HealthFlag["code"][];
  newMilestones: Milestone[];
  notified: { quota: number; issueNew: number; brandAlarm: number };
  /** rule timings of this store (the tick keeps the slowest) */
  timings: { id: string; ms: number }[];
  failedSources: string[];
  ruleFailures: RuleFailure[];
}

/** The stored row as the engine's previous snapshot (a dirty stub keeps its snoozes, has no issues and no flags). */
export function previousOf(row: HealthRow | null): PreviousSnapshot | null {
  if (!row) return null;
  const computed = isComputed(row);
  return {
    issues: computed && Array.isArray(row.issues) ? (row.issues as PreviousSnapshot["issues"]) : [],
    snoozed: row.snoozed ?? null,
    milestones: row.milestones ?? null,
    flags: computed && Array.isArray(row.flags) ? row.flags : null,
  };
}

const OWNERS_ADMINS = ["owner", "admin"] as const;
/** stores read from the queue view per query */
const QUEUE_PAGE = 10;

/**
 * One store: inputs, rules, flags, the snapshot under a lock of the previous row, then the once-only side effects.
 * Throws only when the snapshot cannot be written (the tick records it and goes on).
 */
export async function computeStoreHealth(ctx: SystemCtx, store: StoreRow, opts: StoreHealthOpts = {}): Promise<StoreHealthReport> {
  const t0 = performance.now();
  const now = opts.now ?? new Date();
  const scope = systemScope(ctx, store.id);
  const { inputs, failed } = await collectHealthInputsReport(scope, store, now, opts.sources ?? DEFAULT_SOURCES);
  const run = await runRulesReport(opts.rules ?? HEALTH_RULES, scope, inputs, { release: opts.release ?? "R1", mode: store.mode, record: opts.record });
  let terms = opts.terms;
  if (terms === undefined) {
    try {
      terms = await activeProtectedTerms();
    } catch (err) {
      recordPlatformError("health brand terms", err, { storeId: store.id, area: "health" });
      terms = [];
    }
  }

  let previousComputed = false;
  const draft = await commitSnapshot(scope, now, (locked) => {
    previousComputed = isComputed(locked);
    const previous = previousOf(locked);
    const issueSince = issueSinceOf(run.issues, previous, now);
    const flags = carrySince(platformFlags(inputs, run.issues, { terms, issueSince }), previous?.flags);
    const next = buildSnapshot({ inputs, issues: run.issues, flags, previous });
    return {
      result: next,
      values: {
        score: next.score,
        attention: next.attention,
        flags: next.flags,
        issues: next.issues.map((i) => toStoredIssue(i, issueSince[i.id])) as unknown as HealthIssue[],
        components: next.components,
        metrics: next.metrics,
        milestones: next.milestones,
        snoozed: Object.keys(next.snoozed).length ? next.snoozed : null,
        dormant: next.dormant,
        computedAt: now,
      },
    };
  });
  invalidateHealthView(store.id);

  const notified = { quota: 0, issueNew: 0, brandAlarm: 0 };
  const inRotation = ROTATION_STATES.includes(store.status);
  const sent = (res: { id: number } | { deduped: true }) => ("id" in res ? 1 : 0);

  // milestones once (PD40): the stored map already holds them, so a re-run finds none new
  for (const milestone of draft.newMilestones) {
    await auditFrom(ctx, "store.milestone.reached", { storeId: store.id, target: milestone, meta: { milestone } });
  }

  if (inRotation) {
    for (const q of quotaCrossings(inputs)) {
      const target = { audience: "store_role" as const, storeId: store.id, roles: OWNERS_ADMINS };
      const dedupeKey = healthDedupe.quota(q.level, store.id, q.metric, q.period);
      notified.quota += sent(
        q.level === 80
          ? await notify(target, "quota.80", { metric: q.metric, used: q.used, limit: q.limit, percent: q.percent }, { dedupeKey })
          : await notify(target, "quota.100", { metric: q.metric, used: q.used, limit: q.limit }, { dedupeKey }),
      );
    }
    for (const issue of issuesToNotify(draft, previousComputed, opts.issueNotifyMinSeverity ?? 3)) {
      notified.issueNew += sent(
        await notify(
          { audience: "store_role", storeId: store.id, roles: OWNERS_ADMINS },
          "health.issue_new",
          { issueId: issue.id, group: issue.group, severity: issue.severity, metric: issue.evidence.metric, value: issue.evidence.value, n: issue.evidence.n },
          { dedupeKey: healthDedupe.issueNew(store.id, issue.id, now) },
        ),
      );
    }
  }

  // the live brand guard (PD70, PLA-§13.3 item 2): staff only, once per store, term and ISO week
  const live = draft.flags.find((f) => f.code === "brand_term_live");
  const hit = parseBrandDetail(live?.detail);
  if (hit) {
    notified.brandAlarm += sent(
      await notify(
        { audience: "platform_staff", minRole: "admin" },
        "staff.alarm",
        { alarm: "brand_term_live", store: store.handle, storeId: store.id, term: hit.term.slice(0, 60), field: hit.field },
        { dedupeKey: healthDedupe.brandTermLive(store.id, hit.term, now), severity: "danger", link: `/admin/stores/${store.id}` },
      ),
    );
  }

  return {
    storeId: store.id,
    ms: Math.round(performance.now() - t0),
    score: draft.score,
    attention: draft.attention,
    issues: draft.issues.length,
    flags: draft.flags.map((f) => f.code),
    newMilestones: draft.newMilestones,
    notified,
    timings: run.timings,
    failedSources: failed,
    ruleFailures: run.failures,
  };
}

/* ------------------------------------------------------------------ */
/* The tick                                                            */
/* ------------------------------------------------------------------ */

export interface HealthTickOpts extends Omit<StoreHealthOpts, "now" | "terms" | "issueNotifyMinSeverity"> {
  /** the clock of the run (tests); default `new Date()` */
  now?: () => Date;
  /** keep each store's report (tests) */
  onStore?: (report: StoreHealthReport) => void;
}

export interface HealthTickSummary extends Record<string, number | string | boolean> {
  stores: number;
  failed: number;
  perStoreP50Ms: number;
  perStoreP95Ms: number;
  /** the three slowest rules of the run, "id:ms" joined by "," (job_runs.summary takes scalars, §H.2) */
  rulesSlowest: string;
  cycleMin: number;
  rotation: number;
}

/**
 * `platform.health` (slot 9): stores from the queue view until `ctx.deadline`, one at a time, `ctx.yield()` between
 * them. `done` is true when the queue had no store left that was computed before this run started.
 */
export async function runHealthTick(ctx: JobCtx, opts: HealthTickOpts = {}): Promise<JobResult & { summary: HealthTickSummary }> {
  const clock = opts.now ?? (() => new Date());
  const startedAt = clock();
  const [settings, terms, prevState] = await Promise.all([
    getPlatformSetting("platform").then((p) => p.health),
    activeProtectedTerms().catch((err: unknown) => {
      recordPlatformError("health brand terms", err, { area: "health" });
      return [] as readonly ProtectedTerm[];
    }),
    readHealthJobState(),
  ]);

  const durations: number[] = [];
  const slowest = new Map<string, number>();
  const seen: string[] = [];
  let failed = 0;
  let done = false;

  outer: while (Date.now() < ctx.deadline) {
    const batch = await scanHealthRows({ states: ROTATION_STATES, computedBefore: startedAt, attentionMin: null, exclude: seen, limit: QUEUE_PAGE });
    if (!batch.length) {
      done = true;
      break;
    }
    for (const row of batch) {
      if (Date.now() >= ctx.deadline) break outer;
      seen.push(row.storeId);
      const t0 = performance.now();
      try {
        const store = await getStoreById(row.storeId);
        if (!store) continue; // purged or handle-less between the scan and now
        const report = await computeStoreHealth(ctx, store, { ...opts, now: clock(), terms, issueNotifyMinSeverity: settings.issueNotifyMinSeverity });
        for (const t of report.timings) slowest.set(t.id, Math.max(slowest.get(t.id) ?? 0, t.ms));
        opts.onStore?.(report);
        durations.push(Math.round(performance.now() - t0));
      } catch (err) {
        failed++;
        recordPlatformError("health store skipped", err, { storeId: row.storeId, area: "health" });
      }
      await ctx.yield();
    }
  }

  const rotation = await countRotationStores();
  const p50 = durations.length ? percentile(durations, 50) : null;
  const state = nextHealthState(prevState, { stores: durations.length, p50Ms: p50, rotation, at: startedAt, done });
  try {
    await writeJobState(HEALTH_STATE_KEY, state);
  } catch (err) {
    recordPlatformError("health job state write", err, { area: "health" });
  }
  const rulesSlowest = [...slowest.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, 3)
    .map(([id, ms]) => `${id}:${ms}`)
    .join(",");
  return {
    done,
    summary: {
      stores: durations.length,
      failed,
      perStoreP50Ms: p50 ?? 0,
      perStoreP95Ms: durations.length ? percentile(durations, 95) : 0,
      rulesSlowest,
      cycleMin: state.cycleMin ?? 0,
      rotation,
    },
  };
}
