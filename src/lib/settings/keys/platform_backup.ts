/**
 * Platform setting `platform_backup` (docs/STORE-SAAS.md §D.10, §H.6; owner: core): retention, the tables the daily
 * logical backup writes, the last console download. The table list is the §H.6 R1 set; R2 money tables are added
 * by the release that creates them.
 */
import { z } from "zod";
import { isoDateTime } from "../fields";

export const BACKUP_TABLES = [
  "stores", "store_members", "store_settings", "store_entitlements", "store_usage", "store_subscriptions", "plans", "users",
  "pages", "page_versions", "orders", "leads", "customers", "order_events", "delivery_zones", "message_templates",
  "sheet_bindings", "assets", "media_files", "audit_log", "settings",
] as const;

export const PlatformBackupSetting = z.object({
  /** the Sunday daily is kept as the weekly */
  retention: z.object({ daily: z.number().int().min(1).max(31).default(7), weekly: z.number().int().min(0).max(12).default(4) }).prefault({}),
  tables: z
    .array(z.string().regex(/^[a-z][a-z0-9_]{1,63}$/))
    .min(1)
    .max(200)
    .default([...BACKUP_TABLES]),
  lastDownloadAt: isoDateTime.nullable().default(null),
});
export type PlatformBackupSetting = z.output<typeof PlatformBackupSetting>;
