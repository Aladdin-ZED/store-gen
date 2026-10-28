/**
 * Notification kinds of the ops track (P4 CALL CENTER, operations.md OPE-§21.4, OD45).
 * Extension file (docs/STORE-SAAS.md §I.4, §K.3; PLA-§18.1), created empty at P0 and imported by
 * src/lib/notify/registry.ts; texts `notify.<kind>.*` live in the track's own i18n file (D67), in ar, fr and en.
 * `vars` carry ids, counts and codes only (core §I.4): never a customer field.
 */
import { z } from "zod";
import type { NotificationKindDef } from "../registry";

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
];
