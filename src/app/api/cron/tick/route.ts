/**
 * GET /api/cron/tick — hPanel cron (every 5 min), key in the `X-Cron-Key` header (kept out of URL
 * access logs) or as `?key=<CRON_KEY>` (still accepted in R1 for a first test in a browser; removed in R2, D33).
 *
 * The body is the job runner (src/lib/jobs/runner.ts, docs/STORE-SAAS.md §H.2): the tick lease, then every
 * registered job in its slot inside a 100 s budget — each store's Google Sheet (push and the due pull, SHT-11),
 * housekeeping (rate-limit buckets, visitor markers > 2 days, sessions, abandoned leads > 30 days per store) and
 * the tracks' jobs — with one job_runs row per run. A tick that finds another one running answers
 * `{ ok: true, skipped: true }` (200), so the HANDOFF smoke `{"ok":true` holds either way. Also keeps the Node
 * process warm.
 *
 * Invisible unless the key is right: a wrong or missing key, too many guesses from one network
 * (in memory first, then in the database), a guard that cannot run (database down) and every other
 * method answer the public 404 of any unknown URL (auth/unknown-page).
 */
import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { cronKeySecret } from "@/lib/auth/config";
import { unknownPageResponse } from "@/lib/auth/unknown-page";
import { errorCode } from "@/lib/jobs/errors";
import { runTick } from "@/lib/jobs/runner";
import { clientContext, json, logError } from "@/lib/orders/http";
import { burstLimit } from "@/lib/security/burst-limit";
import { hashIp, safeEqual } from "@/lib/security/crypto";
import { platformBucket, rateLimit } from "@/lib/security/rate-limit";

/** Hostinger ends a request after about 120 s; the tick's budget is 100 s of it (§H.2, §H.12) */
export const maxDuration = 120;

const hidden = (req: NextRequest) => unknownPageResponse(req.method);

const digest = (v: string) => createHash("sha256").update(v, "utf8").digest("hex");

export async function GET(req: NextRequest): Promise<Response> {
  const expected = cronKeySecret(); // null when unset, shorter than 8 or a template value
  if (!expected) return hidden(req);
  const given = req.headers.get("x-cron-key")?.trim() || req.nextUrl.searchParams.get("key") || "";
  const { ip } = clientContext(req);
  // key guessing is throttled per network (the real cron calls twice per 10 min at most)
  if (!burstLimit("cron", ip).ok) return hidden(req);
  try {
    const gate = await rateLimit(platformBucket("cron:ip", hashIp(ip)), 60, 600);
    // digests: constant time whatever the lengths of the two keys
    if (!gate.ok || !safeEqual(digest(given), digest(expected))) return hidden(req);
  } catch (err) {
    logError("cron:guard", err);
    return hidden(req);
  }

  try {
    const report = await runTick();
    return json({ ok: true, ...report });
  } catch (err) {
    // the lease or the job state could not be read (database down): the cron's curl -f sees the failure
    logError("cron:tick", err);
    return json({ ok: false, error: errorCode(err) }, 500);
  }
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
