/**
 * Jobs of the landing track (P3): leads.followups, delivery.holidays_review, links.flush (landing.md LAN-§23.4).
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
 */
import { holidaysReviewStep } from "@/lib/delivery/holidays-review.server";
import { followUpsDue } from "@/lib/leads/followups.server";
import { notify } from "@/lib/platform/notify";
import { forEachStore } from "../scope";
import type { Job } from "../runner";

const HOLIDAYS_REVIEW_MS = 2_000;
const FOLLOWUPS_MS = 2_000;

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

export const jobs: Job[] = [holidaysReview, leadFollowUps];
