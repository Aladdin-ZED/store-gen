/**
 * Notification kinds of the landing track (P3 LANDING, landing.md LAN-§23.6).
 * Extension file (docs/STORE-SAAS.md §I.4, §K.3; PLA-§18.1), created empty at P0 and imported by
 * src/lib/notify/registry.ts; texts `notify.<kind>.*` live in the track's own i18n file (D67), in ar, fr and en.
 * `vars` carry ids, counts, years and short labels only, never customer data.
 */
import { z } from "zod";
import type { NotificationKindDef } from "../registry";

const ID26 = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/);
const ORDER_ID = z.string().regex(/^[A-Z0-9-]{6,20}$/);
const appLink = (ctx: { handle: string | null }, path: `/${string}`) => (ctx.handle ? `/app/${ctx.handle}${path}` : "/app");

/** The tracking page's customer requests (LAN-§9.3): a short code, never the shopper's words. */
export const CUSTOMER_REQUESTS = ["change_address", "change_phone", "cancel", "other"] as const;

export const kinds: NotificationKindDef[] = [
  // the yearly holiday check of the delivery calendar (LAN-§7.2): owners and admins, at most once per 30 days
  {
    kind: "delivery.holidays_review",
    group: "store",
    defaultSeverity: "info",
    audienceHint: "store_role",
    vars: z.object({ year: z.number().int().min(2026).max(2100) }),
    link: (_vars, ctx) => appLink(ctx, "/settings/delivery"),
    tenant: true,
  },
  // an order arrived from a lead the agent had contacted (LAN-§10.4 step 3): the lead's assignee
  {
    kind: "lead.recovered",
    group: "orders",
    defaultSeverity: "success",
    audienceHint: "user",
    vars: z.object({ leadId: ID26, orderId: ORDER_ID }),
    link: (vars, ctx) => appLink(ctx, `/leads?lead=${vars.leadId}`),
    tenant: true,
  },
  // the hourly digest of due follow-ups (job leads.followups): one per assignee and hour
  {
    kind: "leads.followups_due",
    group: "orders",
    defaultSeverity: "info",
    audienceHint: "user",
    vars: z.object({ count: z.number().int().min(1).max(10_000) }),
    link: (_vars, ctx) => appLink(ctx, "/leads?view=due"),
    tenant: true,
    batch: { windowMin: 60 },
  },
  // a shopper's request from the tracking page (LAN-§9.3): owners, admins, managers and the order's assignee
  {
    kind: "order.customer_request",
    group: "orders",
    defaultSeverity: "warn",
    audienceHint: "store_role",
    vars: z.object({ orderId: ORDER_ID, request: z.enum(CUSTOMER_REQUESTS) }),
    link: (vars, ctx) => appLink(ctx, `/orders?order=${vars.orderId}`),
    tenant: true,
  },
  // "I confirm my order" on the tracking page: a badge on the queue row only, never a notification row (LAN-§23.6)
  {
    kind: "order.confirm_intent",
    group: "orders",
    defaultSeverity: "info",
    audienceHint: "store_role",
    vars: z.object({ orderId: ORDER_ID }),
    link: (vars, ctx) => appLink(ctx, `/orders?order=${vars.orderId}`),
    tenant: true,
  },
];
