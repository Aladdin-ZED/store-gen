import "server-only";
/**
 * `ai_runs` → `ai_usage_daily` for one store (P7 AI; ai.md AI-§M.2, AI-§N `ai.rollups`, AI-§O "Rollups"; docs/STORE-SAAS.md
 * §E.3). Hourly, idempotent: today and yesterday (store time) are recomputed from the store's own run rows and upserted
 * whole, so a second pass over the same hour writes the same numbers. One row per (day, task, provider, model); the
 * latency histogram has 12 log buckets (p50 / p95 for the console). The store's credit notifications ride on the same
 * pass: `ai.credits_80` once a month at 80 % of the month's credits, `ai.credits_out` at 100 % (owners and admins).
 */
import { gte, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { aiRuns, aiUsageDaily } from "@/lib/db/schema";
import { notify } from "@/lib/platform/notify";
import { usageMetric } from "@/lib/tenancy/entitlement-keys";
import { entitlement, usageValue } from "@/lib/tenancy/entitlements";
import { storeValues, whereStore } from "@/lib/tenancy/sql";
import type { WriteScope } from "@/lib/tenancy/types";
import { appHref } from "@/lib/urls";
import { dayIn, usageRowsOf } from "./usage-rows";

/** Today and yesterday of one store, recomputed and upserted; the number of rows written. */
export async function rollupStoreUsage(scope: WriteScope, timeZone: string, now: Date = new Date()): Promise<number> {
  const days = new Set([dayIn(now, timeZone), dayIn(new Date(now.getTime() - 86_400_000), timeZone)]);
  const runs = await db
    .select({
      createdAt: aiRuns.createdAt,
      task: aiRuns.task,
      provider: aiRuns.provider,
      model: aiRuns.model,
      via: aiRuns.via,
      status: aiRuns.status,
      flags: aiRuns.flags,
      rejectedFields: aiRuns.rejectedFields,
      inTok: aiRuns.inTok,
      outTok: aiRuns.outTok,
      cacheReadTok: aiRuns.cacheReadTok,
      cacheWriteTok: aiRuns.cacheWriteTok,
      costMicros: aiRuns.costMicros,
      credits: aiRuns.credits,
      ms: aiRuns.ms,
    })
    .from(aiRuns)
    .where(whereStore(aiRuns, scope, gte(aiRuns.createdAt, new Date(now.getTime() - 50 * 3_600_000))));
  const rows = usageRowsOf(runs, timeZone, days);
  for (const u of rows) {
    const { day, task, provider, model, ...counts } = u;
    await db
      .insert(aiUsageDaily)
      .values(storeValues(scope, { day, task, provider, model, ...counts }))
      .onDuplicateKeyUpdate({
        set: {
          runs: sql`VALUES(runs)`,
          ok: sql`VALUES(ok)`,
          refused: sql`VALUES(refused)`,
          fallbacks: sql`VALUES(fallbacks)`,
          invalid: sql`VALUES(invalid)`,
          errors: sql`VALUES(errors)`,
          cacheHits: sql`VALUES(cache_hits)`,
          rejectedFields: sql`VALUES(rejected_fields)`,
          inTok: sql`VALUES(in_tok)`,
          outTok: sql`VALUES(out_tok)`,
          cacheReadTok: sql`VALUES(cache_read_tok)`,
          cacheWriteTok: sql`VALUES(cache_write_tok)`,
          costMicros: sql`VALUES(cost_micros)`,
          credits: sql`VALUES(credits)`,
          msSum: sql`VALUES(ms_sum)`,
          msHist: sql`VALUES(ms_hist)`,
        },
      });
  }
  return rows.length;
}

/** The month's credit notifications (AI-§C.3): 80 % once, 100 % once, to owners and admins. */
export async function creditNotifications(scope: WriteScope, store: { handle: string; timezone: string }, now: Date = new Date()): Promise<"80" | "out" | null> {
  const monthly = await entitlement(scope, "ai_credits_month");
  if (monthly === null || monthly <= 0) return null;
  const metric = usageMetric("ai_credits", now, store.timezone);
  const used = await usageValue(scope, metric);
  const pct = Math.floor((used * 100) / monthly);
  if (pct < 80) return null;
  const kind = pct >= 100 ? "ai.credits_out" : "ai.credits_80";
  await notify({ audience: "store_role", storeId: scope.storeId, roles: ["owner", "admin"] }, kind, { pct: Math.min(pct, 100), month: metric.period }, { dedupeKey: `${kind}:${scope.storeId}:${metric.period}`, link: appHref(store.handle, "/settings/ai"), severity: kind === "ai.credits_out" ? "warn" : "info" });
  return pct >= 100 ? "out" : "80";
}
