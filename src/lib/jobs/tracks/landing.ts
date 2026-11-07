/**
 * Jobs of the landing track (P3): leads.followups, delivery.holidays_review, links.flush, campaigns.share_expiry
 * (landing.md LAN-§23.4).
 * Extension file (docs/STORE-SAAS.md §H.2, §K.3) imported by src/lib/jobs/registry.ts; slot 6 (nightly / hourly) for
 * the first two, slot 7 for links.flush.
 *
 * `delivery.holidays_review` (slot 6, 2 s): "daily at 08:00 store time" with a frozen `Job.every` whose daily form is
 * in the platform time zone, so it runs hourly and each store's step decides by its own clock (from 08:00, never at
 * night) and its own 30-day dedupe; a store not reached inside the budget is reached by the next run.
 *
 * `leads.followups` (slot 6, hourly, 2 s; LAN-§10.4): one in-app digest per assignee whose leads came due in the last
 * hour ("5 leads to follow up", kind `leads.followups_due`, batched per 60 min), with the count of every lead due for
 * them now. Test leads and closed leads are left out; nothing is ever sent to a shopper (LD10).
 *
 * `links.flush` (slot 7, every tick, 1 s; LAN-§12.1): writes the short-link click counters kept in memory by the
 * `/go/<code>` route (src/lib/links/clicks.ts) store by store, each with that store's system scope; the route's own
 * `after()` writes a store's counts once they are 30 s old, so a quiet cron loses no more than the process does.
 *
 * `campaigns.share_expiry` (slot 6, daily 04:35, 2 s; core §H.11, LAN-§13.5, CCR r1-p3-15 item 2): the read-only kit
 * links of campaigns ended more than 90 days ago stop working (`expireShares`, one statement per store).
 */
import { expireShares } from "@/lib/campaigns/share.server";
import { holidaysReviewStep } from "@/lib/delivery/holidays-review.server";
import { followUpsDue } from "@/lib/leads/followups.server";
import { flushClicks } from "@/lib/links/clicks";
import { notify } from "@/lib/platform/notify";
import { forEachStore, systemScope } from "../scope";
import type { Job } from "../runner";

const HOLIDAYS_REVIEW_MS = 2_000;
const FOLLOWUPS_MS = 2_000;
const LINKS_FLUSH_MS = 1_000;
const SHARE_EXPIRY_MS = 2_000;

const holidaysReview: Job = {
  name: "delivery.holidays_review",
  every: "hourly",
  budgetMs: HOLIDAYS_REVIEW_MS,
  async run(ctx) {
    let sent = 0;
    const now = new Date();
    const budgetMs = Math.max(1, Math.min(HOLIDAYS_REVIEW_MS, ctx.deadline - Date.now()));
    const r = await forEachStore(ctx, { job: "delivery.holidays_review", states: ["active", "restricted"], budgetMs }, async (scope, store) => {
      if ((await holidaysReviewStep(scope, store, now)) === "sent") sent++;
    });
    return { done: r.done, summary: { visited: r.visited, sent } };
  },
};

const leadFollowUps: Job = {
  name: "leads.followups",
  every: "hourly",
  budgetMs: FOLLOWUPS_MS,
  async run(ctx) {
    let sent = 0;
    const now = new Date();
    const budgetMs = Math.max(1, Math.min(FOLLOWUPS_MS, ctx.deadline - Date.now()));
    const r = await forEachStore(ctx, { job: "leads.followups", states: ["active", "restricted"], budgetMs }, async (scope, store) => {
      for (const due of await followUpsDue(scope, now)) {
        const res = await notify(
          { audience: "user", userId: due.assigneeId, storeId: scope.storeId },
          "leads.followups_due",
          { count: due.count },
          { link: `/app/${store.handle}/leads?view=due`, dedupeKey: `leads.followups_due:${scope.storeId}:${due.assigneeId}` },
        );
        if ("id" in res) sent++;
      }
    });
    return { done: r.done, summary: { visited: r.visited, sent } };
  },
};

const linksFlush: Job = {
  name: "links.flush",
  every: "tick",
  budgetMs: LINKS_FLUSH_MS,
  async run(ctx) {
    const deadline = Math.min(Date.now() + LINKS_FLUSH_MS, ctx.deadline);
    const r = await flushClicks((storeId) => systemScope(ctx, storeId), { deadline });
    return { done: r.done, summary: { stores: r.stores, rows: r.rows } };
  },
};

const shareExpiry: Job = {
  name: "campaigns.share_expiry",
  every: { dailyAt: "04:35" },
  budgetMs: SHARE_EXPIRY_MS,
  async run(ctx) {
    let revoked = 0;
    const now = new Date();
    const budgetMs = Math.max(1, Math.min(SHARE_EXPIRY_MS, ctx.deadline - Date.now()));
    const r = await forEachStore(ctx, { job: "campaigns.share_expiry", states: ["active", "restricted"], budgetMs }, async (_scope, store) => {
      revoked += await expireShares(systemScope(ctx, store.id), ctx.actor, now);
    });
    return { done: r.done, summary: { visited: r.visited, revoked } };
  },
};

export const jobs: Job[] = [holidaysReview, leadFollowUps, linksFlush, shareExpiry];
