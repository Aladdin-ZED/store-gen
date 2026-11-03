import "server-only";
/**
 * The console pulse (platform.md PLA-§4.6, PD38, PD56, PD57): what `GET /api/admin/pulse` answers every 15 s while a
 * console tab is visible.
 *
 *   const pulse = await consolePulse(ctx);
 *   const etag = pulseEtag(pulse);           // 304 when `If-None-Match` names it (etagMatches)
 *
 * The platform part (queue counts, alarms, kill switches, the dangerous-action ledger, the audit head, the health
 * engine, the render queue, the build) is cached 5 s under the platform key ("p"); the per-user part (the staff
 * member's unread count and this session's view-as) is computed on every call, so two staff members never share
 * one. A source that is a later track's stub (P8's render summary) is `null`, never a made-up 0.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { inArray, sql } from "drizzle-orm";
import { AuthRefusal } from "@/lib/auth/errors";
import { db } from "@/lib/db/client";
import { platformRequests } from "@/lib/db/schema";
import { renderSummary } from "@/lib/jobs/renders";
import { scopedCache } from "@/lib/tenancy/cache";
import { activeKillSwitches } from "@/lib/tenancy/entitlements";
import type { PlatformCtx } from "@/lib/tenancy/types";
import { activeImpersonation } from "./impersonation";
import { unreadCount } from "./notify";
import { auditHead, cachedAlarms, healthEngineSummary } from "./overview";
import { optional } from "./panel";
import { alarmCounts, type ConsolePulse } from "./pulse-rules";
import { queueSnapshot } from "./queue";

export { etagMatches, pulseEtag, stableJson, type ConsolePulse } from "./pulse-rules";

type PlatformPart = Omit<ConsolePulse, "v" | "at" | "unread" | "impersonation">;

/** PLA-§M.5: the platform part, 5 s, one entry under "p" */
const pulseCache = scopedCache<PlatformPart>({ name: "console-pulse-platform", maxEntries: 1, ttlMs: 5_000 });

let buildId: string | null = null;
/** The first 8 characters of `.next/BUILD_ID` ("dev" without a build), read once per process. */
function build(): string {
  if (buildId === null) {
    try {
      buildId = readFileSync(join(process.cwd(), ".next", "BUILD_ID"), "utf8").trim().slice(0, 8) || "dev";
    } catch {
      buildId = "dev";
    }
  }
  return buildId;
}

/** Four-eyes or delayed rows still waiting (preq_due_idx). */
async function pendingPlatformRequests(): Promise<number> {
  // tenancy: platform the dangerous-action ledger's open rows across stores (PLA-§4.6, §M.4 preq_due_idx): one count
  const [row] = await db.select({ n: sql<number>`COUNT(*)` }).from(platformRequests).where(inArray(platformRequests.status, ["pending", "confirmed"]));
  return Number(row?.n ?? 0);
}

async function platformPart(now: Date): Promise<PlatformPart> {
  const [queue, alarms, kill, requests, head, health, renders] = await Promise.all([
    queueSnapshot(now),
    optional("pulse.alarms", () => cachedAlarms(now)),
    activeKillSwitches(),
    pendingPlatformRequests(),
    auditHead(),
    healthEngineSummary(now),
    optional("pulse.renders", () => renderSummary()),
  ]);
  return {
    queue: {
      review: queue.counts.review,
      hold: queue.counts.hold,
      requests: queue.counts.requests,
      needsInfoAnswered: queue.answered,
      oldestMinutes: queue.sla.oldestWaitingMin,
      overSla: queue.sla.pastSla ?? 0,
    },
    alarms: alarmCounts((alarms ?? []).map((a) => a.level)),
    kill: [...kill].sort(),
    pendingPlatformRequests: requests,
    auditHead: head,
    health: { staleSnapshots: health.staleSnapshots, dirtyRows: health.dirtyRows, lastRunAt: health.lastRunAt },
    renders: renders
      ? {
          pending: renders.byReason.reduce((n, r) => n + r.pending, 0),
          failed: renders.byReason.reduce((n, r) => n + r.failed, 0),
          oldestMin: renders.oldestPending?.ageMin ?? null,
        }
      : null,
    build: build(),
  };
}

/** Drops the cached platform part (a queue decision, a kill switch, a lifecycle write). */
export function invalidateConsolePulse(): void {
  pulseCache.delete("p");
}

/** PLA-§4.6 (`console.read`): the platform part (5 s) with this staff member's own unread count and view-as. */
export async function consolePulse(ctx: PlatformCtx, now: Date = new Date()): Promise<ConsolePulse> {
  if (!ctx.can("console.read")) throw new AuthRefusal("forbidden");
  const [part, unread, view] = await Promise.all([
    pulseCache.getOrLoad("p", "platform", () => platformPart(now)),
    unreadCount({ userId: ctx.user.id, storeId: null, role: null, platformRole: ctx.role }),
    activeImpersonation(ctx),
  ]);
  return {
    v: 1,
    at: now.toISOString(),
    ...part,
    unread,
    impersonation: view && view.handle ? { storeId: view.storeId, handle: view.handle, endsAt: view.expiresAt.toISOString() } : null,
  };
}
