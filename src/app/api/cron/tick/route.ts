/**
 * GET /api/cron/tick — hPanel cron (every 5 min), key in the `X-Cron-Key` header (kept out of URL
 * access logs) or as `?key=<CRON_KEY>` (handy for a first test in a browser):
 * push queued orders to Google Sheets, pull agent statuses (≤ every 5 min), housekeeping
 * (rate-limit buckets, visitor markers > 2 days, abandoned leads > 30 days per store, expired sessions).
 * Also keeps the Node process warm.
 *
 * Invisible unless the key is right: a wrong or missing key, too many guesses from one network
 * (in memory first, then in the database), a guard that cannot run (database down) and every other
 * method answer the public 404 of any unknown URL (auth/unknown-page).
 */
import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { purgeExpiredSessions } from "@/lib/auth";
import { cronKeySecret } from "@/lib/auth/config";
import { unknownPageResponse } from "@/lib/auth/unknown-page";
import { forEachStore, systemCtx, systemScope } from "@/lib/jobs/scope";
import { purgeAbandonedLeads } from "@/lib/orders/admin";
import { clientContext, errorSummary, json, logError } from "@/lib/orders/http";
import { burstLimit } from "@/lib/security/burst-limit";
import { hashIp, safeEqual } from "@/lib/security/crypto";
import { purgeRateLimits, rateLimit } from "@/lib/security/rate-limit";
import { pullStatuses, syncPendingOrders } from "@/lib/sheets/sync";
import { purgeVisitorMarkers } from "@/lib/stats";

export const maxDuration = 120;

const hidden = (req: NextRequest) => unknownPageResponse(req.method);

const digest = (v: string) => createHash("sha256").update(v, "utf8").digest("hex");

/** Abandoned leads older than 30 days, store by store (ORD-13; every store that still keeps data). */
async function purgeLeadsPerStore(): Promise<number> {
  const ctx = systemCtx("orders.leads_purge");
  let removed = 0;
  await forEachStore(ctx, { job: ctx.job, states: ["pending", "active", "restricted", "suspended", "closed"], budgetMs: 10_000 }, async (_scope, store) => {
    // the frozen callback types its scope as a StoreScope; the delete needs the job's own WriteScope
    removed += await purgeAbandonedLeads(systemScope(ctx, store.id), 30);
  });
  return removed;
}

async function step<T>(name: string, fn: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await fn();
  } catch (err) {
    logError(`cron:${name}`, err);
    // the error's name and driver code only: a message can quote bound values (customer data)
    return { error: errorSummary(err).slice(0, 200) };
  }
}

export async function GET(req: NextRequest): Promise<Response> {
  const expected = cronKeySecret(); // null when unset, shorter than 8 or a template value
  if (!expected) return hidden(req);
  const given = req.headers.get("x-cron-key")?.trim() || req.nextUrl.searchParams.get("key") || "";
  const { ip } = clientContext(req);
  // key guessing is throttled per network (the real cron calls twice per 10 min at most)
  if (!burstLimit("cron", ip).ok) return hidden(req);
  try {
    const gate = await rateLimit(`cron:ip:${hashIp(ip)}`, 60, 600);
    // digests: constant time whatever the lengths of the two keys
    if (!gate.ok || !safeEqual(digest(given), digest(expected))) return hidden(req);
  } catch (err) {
    logError("cron:guard", err);
    return hidden(req);
  }

  const started = Date.now();
  const sync = await step("sync", () => syncPendingOrders({ limit: 100 }));
  const pull = await step("pull", () => pullStatuses());
  const purged = {
    rateLimits: await step("rate_limits", async () => {
      await purgeRateLimits();
      return true;
    }),
    visitorMarkers: await step("visitors", () => purgeVisitorMarkers(2)),
    abandonedLeads: await step("leads", purgeLeadsPerStore),
    sessions: await step("sessions", () => purgeExpiredSessions()),
  };
  return json({ ok: true, ms: Date.now() - started, sync, pull, purged });
}

/*
 * Every other method answers like an unknown URL too (left to Next, HEAD would run the tick and
 * OPTIONS / POST would answer 204 / 405 with an Allow list).
 */
async function unknown(req: NextRequest): Promise<Response> {
  return hidden(req);
}
export const HEAD = unknown;
export const OPTIONS = unknown;
export const POST = unknown;
export const PUT = unknown;
export const PATCH = unknown;
export const DELETE = unknown;
