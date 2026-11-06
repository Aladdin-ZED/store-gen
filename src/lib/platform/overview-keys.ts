/**
 * The overview's codes and their catalog keys (platform.md PLA-§5.3, §5.4): pure, shared by src/lib/platform/overview.ts
 * and `test:platform`, which checks that each code has its `console.attention.*` / `console.feed.*` sentence.
 */
import type { HealthFlagCode } from "@/lib/health/types";

/** PLA-§5.4: the actions of the activity feed */
export const FEED_ACTIONS = [
  "store.created",
  "store.milestone.reached",
  "platform.signup.approved",
  "platform.signup.rejected",
  "platform.store.restricted",
  "platform.store.suspended",
  "platform.store.restored",
  "store.closed",
  "store.reopened",
  "store.mode_changed",
  "platform.kill.changed",
  "platform.impersonation.started",
] as const;
export type FeedAction = (typeof FEED_ACTIONS)[number];

/** The Needs-attention codes beyond the alarms (each `console.attention.<code>`). */
export const ATTENTION_CODES = ["queue_holds_waiting", "requests_waiting", "platform_requests_waiting", "abuse_reports_new", "empty"] as const;

/** Every console flag code a flagged store's row can carry (`console.attention.store_flag.<code>`). */
export const STORE_FLAG_CODES = [
  "attention",
  "sheets_backlog",
  "sheets_error",
  "outbox_dead",
  "capi_failing",
  "telegram_failing",
  "quota_high",
  "quota_full",
  "risky_orders",
  "inactive_14d",
  "dormant_60d",
  "setup_incomplete",
  "render_failed",
  "review_waiting",
  "restricted",
  "suspended",
  "brand_term_live",
  "brand_near_live",
  "abuse_reports_new",
] as const satisfies readonly (HealthFlagCode | "attention")[];

export const ATTENTION_KEYS: readonly string[] = [
  ...ATTENTION_CODES.map((c) => `console.attention.${c}`),
  ...STORE_FLAG_CODES.map((c) => `console.attention.store_flag.${c}`),
  ...FEED_ACTIONS.map((a) => `console.feed.${a}`),
];
