/**
 * Notification kinds of the ops track (P4 CALL CENTER, operations.md OPE-§21.4, OD45).
 * Extension file (docs/STORE-SAAS.md §I.4, §K.3; PLA-§18.1), created empty at P0 and imported by
 * src/lib/notify/registry.ts; texts `notify.<kind>.*` live in the track's own i18n files (D67: ops.ts, and finance.ts
 * for `fin.*`), in ar, fr and en. `vars` carry ids, counts and codes only (core §I.4): never a customer field.
 *
 *   kind                    audience (the caller's target)          batch / dedupe                       link
 *   ops.new_orders          store_role owner, admin, manager        5 min                                /orders?view=to-call
 *   ops.callback_due        the owning agent (user)                 one per (order, due time)            /queue
 *   ops.first_touch_breach  store_role owner, admin, manager        30 min (one row per store window)    /queue/board
 *   ops.abandoned_claims    store_role owner, admin, manager        60 min                               /queue/board
 *   fin.profit_alert        store_role owner, admin                 one per (alert kind, key, day)       /finance
 */
import { z } from "zod";
import type { NotificationKindDef } from "../registry";

const ORDER_ID = z.string().regex(/^[A-Z0-9]{2,8}-[A-Z0-9]{4,12}$/);
const CODE = z.string().regex(/^[a-z0-9_.:*-]{1,40}$/);

export const kinds: NotificationKindDef[] = [
  // the `ops.created` hook, one row per 5-minute window ("12 new orders since 14:02"); test and honeypot orders: none
  {
    kind: "ops.new_orders",
    group: "orders",
    defaultSeverity: "info",
    audienceHint: "store_role",
    vars: z.object({ count: z.number().int().min(1), sinceTime: z.string().regex(/^\d{2}:\d{2}$/) }),
    link: (_vars, { handle }) => (handle ? `/app/${handle}/orders?view=to-call` : "/app"),
    tenant: true,
    batch: { windowMin: 5 },
  },
  // `ops.presence` (src/lib/jobs/tracks/ops.ts): a callback that came due, to the agent who owns it
  {
    kind: "ops.callback_due",
    group: "orders",
    defaultSeverity: "info",
    audienceHint: "user",
    vars: z.object({ orderId: ORDER_ID, dueTime: z.string().regex(/^\d{2}:\d{2}$/) }),
    link: (_vars, { handle }) => (handle ? `/app/${handle}/queue` : "/app"),
    tenant: true,
  },
  // `ops.presence`: new orders past the first-touch target in window minutes, one row per store and 30-minute window
  {
    kind: "ops.first_touch_breach",
    group: "orders",
    defaultSeverity: "warn",
    audienceHint: "store_role",
    vars: z.object({ count: z.number().int().min(1), minutes: z.number().int().min(1).max(240) }),
    link: (_vars, { handle }) => (handle ? `/app/${handle}/queue/board` : "/app"),
    tenant: true,
    batch: { windowMin: 30 },
  },
  // the claim that takes over an expired lease (OD46, src/lib/orders/queue.ts), one row per 60-minute window
  {
    kind: "ops.abandoned_claims",
    group: "orders",
    defaultSeverity: "info",
    audienceHint: "store_role",
    vars: z.object({ count: z.number().int().min(1) }),
    link: (_vars, { handle }) => (handle ? `/app/${handle}/queue/board` : "/app"),
    tenant: true,
    batch: { windowMin: 60 },
  },
  // `fin.alerts` (Profit Guardian lite, OPE-§16.2): a code, a key (a page id, a city slug), the value, its threshold and n
  {
    kind: "fin.profit_alert",
    group: "orders",
    defaultSeverity: "warn",
    audienceHint: "store_role",
    vars: z.object({ alertKind: CODE, key: CODE.optional(), value: z.number(), threshold: z.number(), n: z.number().int().min(0) }),
    link: (_vars, { handle }) => (handle ? `/app/${handle}/finance` : "/app"),
    tenant: true,
  },
];
