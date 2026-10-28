/**
 * Notification kinds of the landing track (P3 LANDING, landing.md LAN-§23.6).
 * Extension file (docs/STORE-SAAS.md §I.4, §K.3; PLA-§18.1), created empty at P0 and imported by
 * src/lib/notify/registry.ts; texts `notify.<kind>.*` live in the track's own i18n file (D67), in ar, fr and en.
 * `vars` carry counts, years and short labels only, never customer data.
 */
import { z } from "zod";
import type { NotificationKindDef } from "../registry";

export const kinds: NotificationKindDef[] = [
  // the yearly holiday check of the delivery calendar (LAN-§7.2): owners and admins, at most once per 30 days
  {
    kind: "delivery.holidays_review",
    group: "store",
    defaultSeverity: "info",
    audienceHint: "store_role",
    vars: z.object({ year: z.number().int().min(2026).max(2100) }),
    link: (_vars, ctx) => (ctx.handle ? `/app/${ctx.handle}/settings/delivery` : "/app"),
    tenant: true,
  },
];
