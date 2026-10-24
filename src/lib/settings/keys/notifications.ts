/**
 * Store setting `notifications` (docs/STORE-SAAS.md §D.10, operations.md OPE-§2.9 / §21; owner: operations, P5): which
 * events go to Telegram and to the in-app centre, and the daily summary hour (store time zone).
 */
import { z } from "zod";

export const NotificationsSetting = z.object({
  telegram: z
    .object({
      newOrders: z.boolean().default(true),
      batchSeconds: z.number().int().min(0).max(300).default(45),
      dailySummary: z.boolean().default(true),
      dailySummaryHour: z.number().int().min(0).max(23).default(21),
      integrationErrors: z.boolean().default(true),
      profitAlerts: z.boolean().default(true),
      cashHeld: z.boolean().default(true),
    })
    .prefault({}),
  inApp: z.object({ newOrders: z.enum(["each", "batch", "off"]).default("batch"), callbacksDue: z.boolean().default(true) }).prefault({}),
  /** Telegram messages for test orders, prefixed "[TEST]" (the one exception of §H.1); off by default */
  testOrders: z.boolean().default(false),
});
export type NotificationsSetting = z.output<typeof NotificationsSetting>;
