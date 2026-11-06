import "server-only";
/**
 * The pulse's sources (P2 SHELL; docs/STORE-SAAS.md §I.4, D57; platform.md PLA-§22.6, §M.5; SF-06): what `./route.ts`
 * answers and what the store layout paints first (the sidebar's counts before the first poll), read through the same
 * function so the two never disagree.
 *
 *   const { body, etag } = await storePulse(ctx, { since: searchParams.get("since") });
 *
 * - The store part (status and reason, review, the kill switches tenants see, the build, the health summary) is one
 *   load per store every 5 s (`scopedCache("store-pulse")`, key "base"; `invalidateStore` drops it on a transition).
 * - The user part is the viewer's own, read for every call and never cached across viewers: `unread` (P1's
 *   `unreadCount`, its own 5 s cache per reader), `impersonation` (the viewer's own "view as store"), `reaccept` (P1's
 *   legal stub; never for staff viewing a store), `jobs` (P7's `aiJobsForPulse` from the clamped `since`).
 * - The counts come from the registered contributors, each within 50 ms (`runContributors`); this module wires the
 *   shell contributor's database readers when it loads.
 *
 * A pulse is complete or not sent: a frozen field whose source fails makes the whole call fail (the poller keeps its
 * last body), never a made-up value. The one exception is `health`, whose `null` already means "not known yet": a
 * failing or unmerged health read answers null.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isNotImplemented, pendingInviteCount, reviewState, storeStatusOf } from "@/lib/admin-data/dashboard";
import { aiJobsForPulse } from "@/lib/ai/jobs/pulse";
import { logError } from "@/lib/orders/log";
import { getStoreHealth } from "@/lib/platform/health-snapshot";
import { pendingReacceptance } from "@/lib/platform/legal";
import { unreadCount } from "@/lib/platform/notify";
import { shellUnreadReader, wireShellPulseSources } from "@/lib/pulse/contributors/shell";
import { PULSE_CONTRIBUTORS } from "@/lib/pulse/registry";
import type { StorePulse } from "@/lib/pulse/types";
import { scopedCache } from "@/lib/tenancy/cache";
import { activeKillSwitches } from "@/lib/tenancy/entitlements";
import type { StoreCtx, StoreScope } from "@/lib/tenancy/types";
import {
  buildPulse,
  clampSince,
  impersonationOf,
  readerRoleOf,
  tenantKills,
  type ContributorFailure,
  type PulseStoreCache,
  type PulseStorePart,
  type PulseUserPart,
} from "./compose";

// the shell contributor's database readers (its file stays free of server-only imports for the pure test:pulse)
wireShellPulseSources({
  pendingInvites: (scope) => pendingInviteCount(scope),
  unread: (scope, viewer, inStore) => unreadCount(shellUnreadReader(scope, viewer, inStore)),
});

const storeParts = scopedCache<PulseStorePart>({ name: "store-pulse", maxEntries: 2_000, ttlMs: 5_000 });
const cache: PulseStoreCache = { getOrLoad: (storeId, key, load) => storeParts.getOrLoad(storeId, key, load) };

let buildId: string | null = null;
/** The running build (`.next/BUILD_ID`, first 8 characters; "dev" without one): a change shows "New version available". */
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

/** The health ring's summary; null = not computed yet, and also when P1's read is missing or fails (logged). */
async function healthSummary(scope: StoreScope): Promise<StorePulse["health"]> {
  try {
    const view = await getStoreHealth(scope);
    return view ? { score: view.score, attention: view.attention, computedAt: view.computedAt } : null;
  } catch (err) {
    if (!isNotImplemented(err)) logError("pulse:health", err);
    return null;
  }
}

async function loadStorePart(scope: StoreScope): Promise<PulseStorePart> {
  const [status, review, kills, health] = await Promise.all([storeStatusOf(scope), reviewState(scope), activeKillSwitches(), healthSummary(scope)]);
  return { build: build(), store: { status: status.status, statusReason: status.statusReason, review: review.status }, kill: tenantKills(kills), health };
}

async function loadUserPart(ctx: StoreCtx, since: Date): Promise<PulseUserPart> {
  const impersonation = impersonationOf({ userId: ctx.user.id, storeId: ctx.store.id }, ctx.impersonation);
  const staffView = !!ctx.impersonation || !!ctx.membership.synthetic;
  const [unread, legal, jobs] = await Promise.all([
    unreadCount({ userId: ctx.user.id, storeId: ctx.store.id, role: readerRoleOf(ctx.membership), platformRole: ctx.user.platformRole }),
    // the re-acceptance sheet is a seller's: staff viewing a store accept nothing on its behalf
    staffView ? Promise.resolve(null) : pendingReacceptance(ctx.user.id),
    aiJobsForPulse(ctx.scope, { userId: ctx.user.id }, since),
  ]);
  return { unread, impersonation, reaccept: legal !== null, jobs: { running: jobs.running, done: jobs.done } };
}

/** One viewer's pulse: the cached store part, the fresh user part and the contributors' counts (frozen `StorePulse`). */
export async function storePulse(ctx: StoreCtx, opts: { since?: string | null; now?: Date } = {}): Promise<{ body: StorePulse; etag: string; failures: ContributorFailure[] }> {
  const now = opts.now ?? new Date();
  const since = clampSince(opts.since, now);
  const built = await buildPulse({
    scope: ctx.scope,
    viewer: { userId: ctx.user.id, role: ctx.membership.role },
    cache,
    loadStorePart: () => loadStorePart(ctx.scope),
    loadUserPart: () => loadUserPart(ctx, since),
    contributors: PULSE_CONTRIBUTORS,
    now,
  });
  // a late contributor is expected now and then (its keys are left out); one that throws is a bug to see in the logs
  for (const f of built.failures) if (f.reason === "error") logError(`pulse:${f.id}`, f.detail ?? "error");
  return built;
}
