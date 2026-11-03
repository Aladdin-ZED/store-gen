/**
 * Jobs of the ops track (P4 CALL CENTER; operations.md OPE-§J, §14.4, §9.1, §21.4, OD8, OD46; core §H.2 slots 6 and 7).
 * Extension file (docs/STORE-SAAS.md §H.2, §K.3) imported by src/lib/jobs/registry.ts. Each job visits stores through
 * `forEachStore` (round-robin cursor, a store's failure skips only that store), checks `ctx.deadline`, awaits
 * `ctx.yield()` between stores and never moves an order state (OD8: leases expire by comparison, ladders are computed
 * at the outcome, the queue on read). Budgets are slices of the core's slots: 1 s of slot 7 for the presence sweep,
 * 2 s and 1.5 s of slot 6 for the two nightly jobs (≤ 2 daily jobs per tick); `fin.alerts` joins with the finance
 * step.
 *
 *   ops.presence             every tick (slot 7): per store, agents still "online" or on "break" whose heartbeat is
 *                            silent for 15 min go offline and their claim is released (`released`, why "break", actor
 *                            system). The same pass emits `ops.callback_due` (the owning agent, one row per order and
 *                            due time, for callbacks that came due in the last 30 min) and `ops.first_touch_breach`
 *                            (managers, at most one row per store and 30-minute window, with the count of new orders
 *                            past the first-touch target in window minutes). Decision (P4 step 7): both notifications
 *                            come from this job, not from the pulse contributor, so the pulse GET stays read-only and
 *                            inside its 50 ms. Per store rather than one platform statement: `src/lib/jobs/**` pins
 *                            zero `tenancy: platform` queries (scripts/qa/tenancy-allow.json); CCR r1-p4-7 proposes
 *                            the one-statement sweep with its pin.
 *   ops.rollup               daily 02:40 (slot 6): `agent_stats_daily` for the last 14 store-local days (OPE-§14.4),
 *                            then the risk calibration cache (`ops-risk-cal`) of that store is dropped
 *   ops.customers_reconcile  daily 03:10 (slot 6): the customers' counters, ≤ 5,000 per store per night, the drift
 *                            summed into `job_runs.summary`
 */
import { eq, gt, isNotNull, isNull, lt, lte, ne, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { agentProfiles, orders } from "@/lib/db/schema";
import { forgetOpsAggregates } from "@/lib/callcenter/aggregates";
import { notHoneypot, storeTz } from "@/lib/callcenter/insights-sql";
import { rollupAgentStats } from "@/lib/callcenter/kpis.server";
import { opsNow, releaseClaims, writePresence } from "@/lib/callcenter/presence";
import { windowMinutesBetween } from "@/lib/callcenter/window";
import { callingWindowFor } from "@/lib/callcenter/window.server";
import { reconcileCustomers } from "@/lib/orders/customers";
import { logError } from "@/lib/orders/log";
import { notify } from "@/lib/platform/notify";
import { getStoreSetting } from "@/lib/settings";
import { scopedCache } from "@/lib/tenancy/cache";
import { whereStore } from "@/lib/tenancy/sql";
import type { StoreRow, WriteScope } from "@/lib/tenancy/types";
import { forEachStore, systemScope } from "../scope";
import type { Job, JobCtx } from "../runner";

const MINUTE = 60_000;
/** OPE-§5.5: a heartbeat silent this long means the agent left */
export const PRESENCE_SILENT_MS = 15 * MINUTE;
/** callbacks that came due this recently are announced (a missed tick still finds them; the dedupe key holds) */
const CALLBACK_LOOKBACK_MS = 30 * MINUTE;
const BREACH_WINDOW_MS = 30 * MINUTE;
const MANAGERS = ["owner", "admin", "manager"] as const;

/** one `ops.first_touch_breach` per store per 30-minute window in this process (the batch key is the window) */
const breachSent = scopedCache<number>({ name: "ops-ftb-sent", maxEntries: 20_000, ttlMs: BREACH_WINDOW_MS });

const timeLeft = (ctx: JobCtx, budgetMs: number) => Math.max(1, Math.min(budgetMs, ctx.deadline - Date.now()));
const hhmm = (d: Date, tz: string): string => new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);

/** One store's presence sweep (see the header); answers what it did, counts only. */
export async function presenceSweep(scope: WriteScope, store: Pick<StoreRow, "handle">): Promise<{ offline: number; released: number; callbacks: number; breaches: number }> {
  const now = opsNow();
  const out = { offline: 0, released: 0, callbacks: 0, breaches: 0 };
  // 1. silent agents → offline, their claim released
  const silent = await db
    .select({ userId: agentProfiles.userId })
    .from(agentProfiles)
    .where(whereStore(agentProfiles, scope, ne(agentProfiles.presence, "offline"), or(isNull(agentProfiles.lastSeenAt), lt(agentProfiles.lastSeenAt, new Date(now.getTime() - PRESENCE_SILENT_MS)))))
    .limit(200);
  for (const a of silent) {
    await writePresence(scope, a.userId, "offline", now);
    out.offline++;
    out.released += (await releaseClaims(scope, a.userId, null, "break", { kind: "system", userId: null })).length;
  }
  const tz = await storeTz(scope);
  // 2. callbacks that came due: the owning agent, once per (order, due time)
  const due = await db
    .select({ id: orders.id, assigneeId: orders.assigneeId, dueAt: orders.dueAt })
    .from(orders)
    .where(whereStore(orders, scope, eq(orders.confirmState, "callback"), isNotNull(orders.assigneeId), gt(orders.dueAt, new Date(now.getTime() - CALLBACK_LOOKBACK_MS)), lte(orders.dueAt, now)))
    .limit(200);
  for (const c of due) {
    if (!c.assigneeId || !c.dueAt) continue;
    const r = await notify(
      { audience: "user", userId: c.assigneeId, storeId: scope.storeId },
      "ops.callback_due",
      { orderId: c.id, dueTime: hhmm(c.dueAt, tz) },
      { link: `/app/${store.handle}/queue`, dedupeKey: `ops.callback_due:${c.id}:${c.dueAt.getTime()}`, expiresInDays: 2 },
    );
    if ("id" in r) out.callbacks++;
  }
  // 3. first-touch breaches (real orders; window minutes past the target), one row per 30-minute window
  const windowStart = Math.floor(now.getTime() / BREACH_WINDOW_MS) * BREACH_WINDOW_MS;
  if (breachSent.get(scope.storeId, String(windowStart)) === undefined) {
    const [ops, w] = await Promise.all([getStoreSetting(scope, "ops"), callingWindowFor(scope)]);
    const fresh = await db
      .select({ createdAt: orders.createdAt })
      .from(orders)
      .where(whereStore(orders, scope, eq(orders.confirmState, "new"), isNull(orders.firstTouchAt), lte(orders.createdAt, new Date(now.getTime() - ops.firstTouchTargetMin * MINUTE)), eq(orders.isTest, false), notHoneypot))
      .limit(2_000);
    out.breaches = fresh.filter((f) => windowMinutesBetween(f.createdAt, now, w) > ops.firstTouchTargetMin).length;
    if (out.breaches > 0) {
      breachSent.set(scope.storeId, String(windowStart), now.getTime());
      await notify(
        { audience: "store_role", storeId: scope.storeId, roles: MANAGERS },
        "ops.first_touch_breach",
        { count: out.breaches, minutes: ops.firstTouchTargetMin },
        { link: `/app/${store.handle}/queue/board`, dedupeKey: `ops.first_touch_breach:${scope.storeId}:${windowStart}` },
      );
    }
  }
  return out;
}

const presenceJob: Job = {
  name: "ops.presence",
  every: "tick",
  budgetMs: 1_000,
  async run(ctx) {
    const sum = { stores: 0, offline: 0, released: 0, callbacks: 0, breaches: 0 };
    const r = await forEachStore(ctx, { job: "ops.presence", states: ["active", "restricted"], budgetMs: timeLeft(ctx, 1_000) }, async (_scope, store) => {
      if (Date.now() >= ctx.deadline) return;
      const s = await presenceSweep(systemScope(ctx, store.id), store);
      sum.stores++;
      sum.offline += s.offline;
      sum.released += s.released;
      sum.callbacks += s.callbacks;
      sum.breaches += s.breaches;
      await ctx.yield();
    });
    return { done: r.done, summary: sum };
  },
};

const rollupJob: Job = {
  name: "ops.rollup",
  every: { dailyAt: "02:40" },
  budgetMs: 2_000,
  async run(ctx) {
    const sum = { stores: 0, rows: 0 };
    const r = await forEachStore(ctx, { job: "ops.rollup", states: ["active", "restricted", "suspended"], budgetMs: timeLeft(ctx, 2_000) }, async (_scope, store) => {
      if (Date.now() >= ctx.deadline) return;
      const scope = systemScope(ctx, store.id);
      const res = await rollupAgentStats(scope);
      forgetOpsAggregates(scope);
      sum.stores++;
      sum.rows += res.rows;
      await ctx.yield();
    });
    return { done: r.done, summary: sum };
  },
};

const reconcileJob: Job = {
  name: "ops.customers_reconcile",
  every: { dailyAt: "03:10" },
  budgetMs: 1_500,
  async run(ctx) {
    const sum: Record<string, number> = { stores: 0, scanned: 0, fixed: 0 };
    const r = await forEachStore(ctx, { job: "ops.customers_reconcile", states: ["active", "restricted", "suspended"], budgetMs: timeLeft(ctx, 1_500) }, async (_scope, store) => {
      if (Date.now() >= ctx.deadline) return;
      try {
        const res = await reconcileCustomers(systemScope(ctx, store.id));
        sum.stores!++;
        sum.scanned! += res.scanned;
        sum.fixed! += res.fixed;
        for (const [k, v] of Object.entries(res.drift)) sum[`drift_${k}`] = (sum[`drift_${k}`] ?? 0) + v;
      } catch (err) {
        logError("ops:customers_reconcile", err);
      }
      await ctx.yield();
    });
    return { done: r.done, summary: sum };
  },
};

export const jobs: Job[] = [presenceJob, rollupJob, reconcileJob];
