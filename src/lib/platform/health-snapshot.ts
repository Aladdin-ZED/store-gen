import "server-only";
/**
 * Store Health snapshots (docs/STORE-SAAS.md §I.7, §E.6; platform.md PLA-§6.3.4, PD53, PD67, PD78). P1 owns the file;
 * its API is frozen at P0 / P0b (src/lib/contracts/r1-p0.ts, r1-p0b-platform.ts) because P2 (the tenant ring,
 * "Recompute now", snooze) merges before P1.
 *
 *   getStoreHealth(scope)                 → the store's own row as both rings read it, cached 5 min ("health" scopedCache,
 *                                            key `<storeId>:view`); null = not computed yet; flags only for staff scopes
 *   markHealthDirty(storeId)              → one statement: `dirty_at` set (an earlier mark kept) or a dirty stub inserted;
 *                                            never throws (T1's transitionStore, T3's publish, the settings hooks call it)
 *   snoozeHealthIssue(ctx, issueId, 7)    → health.snooze: `snoozed[issueId]`, the score without its points at once,
 *                                            audit `store.health.snoozed`
 *   unsnoozeHealthIssue(ctx, issueId)     → the same, removed, audit `{ unsnoozed: true }`
 *   requestHealthRecompute(ctx)           → `s:<sid>:health:recompute` 6/h, then markHealthDirty; the job computes the
 *                                            store within ≤ 5 min while the dirty queue fits one tick (PD78)
 *
 * Every statement on the row takes the store's scope (src/lib/health/rows.ts: `whereStore` / `storeValues`, a
 * `WriteScope` for the writes: the job's `systemScope`, a member's own scope for a snooze), so none of them is a
 * cross-store statement. A tenant scope never sees `flags` (the owner's view, PLA-§6.3.3); an impersonating staff
 * member reads what the store reads.
 */
import { auditFrom } from "@/lib/audit";
import { AuthRefusal } from "@/lib/auth/errors";
import { fromStoredIssue, resnooze } from "@/lib/health/engine";
import { isComputed, markDirtyRow, readHealthRow, updateSnoozed, type HealthRow } from "@/lib/health/rows";
import type { HealthFlag, HealthGroup, HealthIssue, HealthMetrics, StoreHealthView } from "@/lib/health/types";
import { HEALTH_CAPS } from "@/lib/health/types";
import { readHealthJobState } from "@/lib/health/window";
import { systemCtx, systemScope } from "@/lib/jobs/scope";
import { rateLimit, storeBucket } from "@/lib/security/rate-limit";
import { getPlatformSetting } from "@/lib/settings";
import { scopedCache } from "@/lib/tenancy/cache";
import { memberWriteScope, SeamError } from "@/lib/tenancy/seam";
import type { StoreCtx, StoreScope } from "@/lib/tenancy/types";
import { isSnoozed, liveSnoozes, staleAfterMin } from "./health-score";
import { recordPlatformError } from "./log";

export type { StoreHealthView } from "@/lib/health/types";

/** "Recompute now" (PD67): 6 an hour per store. */
export const RECOMPUTE_LIMIT = { limit: 6, windowSec: 3_600 } as const;
const STORE_ID_RE = /^[0-9A-Z]{26}$/;
const ISSUE_ID_RE = /^[a-z0-9_]+:[a-z0-9_]+$/;
const DAY_MS = 86_400_000;

/** The staff view of a row (with flags), cached per store; a tenant read drops the flags (§E.6 key `<storeId>:view`). */
const viewCache = scopedCache<StoreHealthView | null>({ name: "health", maxEntries: 2_000, ttlMs: 5 * 60_000 });

/** Drops the cached view (the job after a computation, a snooze, a dirty mark). */
export function invalidateHealthView(storeId: string): void {
  viewCache.delete(storeId);
}

const STAFF_KINDS: ReadonlySet<StoreScope["kind"]> = new Set(["platform", "system"]);
const EMPTY_METRICS: HealthMetrics = { orders7d: 0, risky7d: 0, lastActiveAt: null, lastOrderAt: null, publishedPages: 0, mediaPct: null };

/** A stored row as the view both rings read (pure; the issues rebuilt, each live snooze marked, ≤ 20). */
export function viewOfRow(row: HealthRow, staleAfter: number, now: Date = new Date()): StoreHealthView {
  const snoozed = liveSnoozes(row.snoozed, now);
  const issues: HealthIssue[] = [];
  for (const raw of Array.isArray(row.issues) ? (row.issues as unknown[]) : []) {
    const issue = fromStoredIssue(raw);
    if (!issue) continue;
    const { snoozedUntil, ...rest } = issue;
    void snoozedUntil;
    issues.push(isSnoozed(issue.id, snoozed, now) ? { ...rest, snoozedUntil: snoozed[issue.id] } : rest);
    if (issues.length === 20) break;
  }
  const components = Object.fromEntries(
    (Object.keys(HEALTH_CAPS) as HealthGroup[]).map((g) => {
      const v = (row.components as Partial<Record<HealthGroup, unknown>> | null)?.[g];
      return [g, typeof v === "number" && Number.isFinite(v) ? v : 0];
    }),
  ) as Record<HealthGroup, number>;
  const attention = row.attention >= 0 && row.attention <= 3 ? (row.attention as 0 | 1 | 2 | 3) : 0;
  return {
    score: row.score,
    attention,
    components,
    issues,
    snoozed,
    metrics: { ...EMPTY_METRICS, ...(row.metrics ?? {}) },
    milestones: row.milestones ?? {},
    dormant: !!row.dormant,
    computedAt: row.computedAt.toISOString(),
    dirty: row.dirtyAt !== null,
    flags: Array.isArray(row.flags) ? (row.flags as HealthFlag[]) : [],
    staleAfterMin: staleAfter,
  };
}

/** What a scope may read of the view: tenants (members, impersonation, public) never get the console flags. */
export function viewFor(scope: StoreScope, view: StoreHealthView | null): StoreHealthView | null {
  if (!view) return null;
  if (STAFF_KINDS.has(scope.kind)) return view;
  const { flags, ...tenant } = view;
  void flags;
  return tenant;
}

/** The staleness bound of the view (PD78): the setting and the job's measured cycle. */
async function currentStaleAfter(): Promise<number> {
  const [health, state] = await Promise.all([getPlatformSetting("platform").then((p) => p.health), readHealthJobState()]);
  return staleAfterMin(health.staleAlarmMinutes, state.cycleMin);
}

/** The store's own row, cached 5 min ("health" scopedCache, §E.6); null = not computed yet; flags only for staff scopes. */
export async function getStoreHealth(scope: StoreScope): Promise<StoreHealthView | null> {
  const view = await viewCache.getOrLoad(scope.storeId, "view", async () => {
    const row = await readHealthRow(scope);
    if (!row || !isComputed(row)) return null;
    return viewOfRow(row, await currentStaleAfter());
  });
  return viewFor(scope, view);
}

/** Every console action on a store, every publish, zone save, integration change: recompute this store first. Never throws. */
export async function markHealthDirty(storeId: string): Promise<void> {
  try {
    if (!STORE_ID_RE.test(storeId)) return;
    await markDirtyRow(systemScope(systemCtx("platform.health"), storeId), new Date());
    invalidateHealthView(storeId);
  } catch (err) {
    // a hint that only reorders the job's work: a store that no longer exists, or a database hiccup
    recordPlatformError("markHealthDirty", err, { storeId: STORE_ID_RE.test(storeId) ? storeId : undefined, area: "health" });
  }
}

/** A snooze map change on the store's computed row under its lock; `not_found` when the issue is not in the row. */
async function changeSnooze(ctx: StoreCtx, issueId: string, change: (live: Record<string, string>, now: Date) => Record<string, string>): Promise<void> {
  if (!ctx.can("health.snooze")) throw new SeamError("forbidden");
  const scope = memberWriteScope(ctx);
  if (typeof issueId !== "string" || !ISSUE_ID_RE.test(issueId) || issueId.length > 60) throw new SeamError("not_found");
  const now = new Date();
  const changed = await updateSnoozed(scope, (row) => {
    const stored = Array.isArray(row.issues) ? (row.issues as unknown[]) : [];
    if (!stored.some((raw) => fromStoredIssue(raw)?.id === issueId)) return null;
    const snoozed = change(liveSnoozes(row.snoozed, now), now);
    const next = resnooze(stored, Array.isArray(row.flags) ? row.flags : [], snoozed, now);
    return {
      snoozed: Object.keys(snoozed).length ? snoozed : null,
      issues: next.issues as unknown as HealthIssue[],
      score: next.score,
      components: next.components,
      attention: next.attention,
    };
  });
  if (!changed) throw new SeamError("not_found");
  invalidateHealthView(ctx.store.id);
}

/** health.snooze: writes `snoozed[issueId]` for 7 days, audits store.health.snoozed, invalidates the cache. */
export async function snoozeHealthIssue(ctx: StoreCtx, issueId: string, days: 7): Promise<void> {
  if (days !== 7) throw new AuthRefusal("invalid");
  let until = "";
  await changeSnooze(ctx, issueId, (live, now) => {
    until = new Date(now.getTime() + days * DAY_MS).toISOString();
    return { ...live, [issueId]: until };
  });
  await auditFrom(ctx, "store.health.snoozed", { target: issueId, meta: { issueId, until, days, role: ctx.membership.role } });
}

/** health.snooze: removes `snoozed[issueId]`, audits store.health.snoozed with `{ unsnoozed: true }`, invalidates the cache. */
export async function unsnoozeHealthIssue(ctx: StoreCtx, issueId: string): Promise<void> {
  await changeSnooze(ctx, issueId, (live) => {
    const next = { ...live };
    delete next[issueId];
    return next;
  });
  await auditFrom(ctx, "store.health.snoozed", { target: issueId, meta: { issueId, unsnoozed: true, role: ctx.membership.role } });
}

/**
 * "Recompute now" (§I.7, PLA-§6.3, PD67): `s:<sid>:health:recompute` 6/h (the 7th answers `rate_limited`), then
 * markHealthDirty; the job computes within ≤ 5 min. The bucket is counted here only: the calling action must not count
 * it again (CCR r1-p1-4 item 2).
 */
export async function requestHealthRecompute(ctx: StoreCtx): Promise<{ queuedAt: string }> {
  if (!(await rateLimit(storeBucket(ctx.scope, "health:recompute"), RECOMPUTE_LIMIT.limit, RECOMPUTE_LIMIT.windowSec)).ok) throw new SeamError("rate_limited");
  const queuedAt = new Date().toISOString();
  await markHealthDirty(ctx.store.id);
  return { queuedAt };
}
