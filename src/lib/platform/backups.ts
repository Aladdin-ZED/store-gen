import "server-only";
/**
 * Backups in the console (platform.md PLA-§17, OS-10; core §H.6): `/admin/settings/backups`.
 *
 *   const view = await backupsView(ctx);              // P8's runs, the retention, the off-site reminder
 *   await saveBackupRetention(ctx, { daily: 7, weekly: 4 });
 *   const day = await backupDayFiles(ctx, "2026-11-02");   // the download route's files (P8 `backupFiles`)
 *   await recordBackupDownload(ctx, "2026-11-02");    // audit + `platform.backup.lastDownloadAt`
 *
 * The runs and the files are P8's (`listBackupRuns`, `backupFiles`; "unavailable" until P8 merges). The retention is
 * the `platform_backup` setting (daily 3-30, weekly 1-12, core keys); the reminder reads `platform.backup` (the last
 * download and `remindAfterDays`): a yellow Needs-attention row when no off-site copy was taken for that long (the
 * alarm `backup_not_downloaded`, src/lib/platform/alarms.ts). Every write here is `backups.manage` with a fresh
 * step-up (super_admin).
 */
import { z } from "zod";
import { auditFrom } from "@/lib/audit";
import { AuthRefusal, FieldsError } from "@/lib/auth/errors";
import { backupFiles, listBackupRuns, type BackupRunSummary } from "@/lib/backup";
import { getPlatformSetting, setPlatformSetting } from "@/lib/settings";
import type { PlatformCtx } from "@/lib/tenancy/types";
import { panel, type Panel } from "./panel";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY = 86_400_000;

export interface BackupsView {
  runs: Panel<BackupRunSummary[]>;
  retention: { daily: number; weekly: number };
  lastDownloadAt: string | null;
  remindAfterDays: number;
  /** days since the last download (null: never downloaded) */
  daysSinceDownload: number | null;
  /** the reminder row shows (a done run exists and the last download is older than `remindAfterDays`, or none) */
  remind: boolean;
}

function requireRead(ctx: PlatformCtx): void {
  if (!ctx.can("console.read")) throw new AuthRefusal("forbidden");
}

function requireManage(ctx: PlatformCtx): void {
  if (!ctx.can("backups.manage")) throw new AuthRefusal("forbidden");
  if (!ctx.stepUpFresh) throw new AuthRefusal("step_up");
}

/** PLA-§17 (`console.read`): the runs newest first, the retention and the reminder. */
export async function backupsView(ctx: PlatformCtx, now: Date = new Date()): Promise<BackupsView> {
  requireRead(ctx);
  const [runs, retention, platform] = await Promise.all([panel("backups.runs", () => listBackupRuns()), getPlatformSetting("platform_backup"), getPlatformSetting("platform")]);
  const last = platform.backup.lastDownloadAt;
  const since = last ? Math.floor((now.getTime() - Date.parse(last)) / DAY) : null;
  const hasDone = runs.state === "ok" && runs.data.some((r) => r.state === "done");
  return {
    runs,
    retention: { daily: retention.retention.daily, weekly: retention.retention.weekly },
    lastDownloadAt: last,
    remindAfterDays: platform.backup.remindAfterDays,
    daysSinceDownload: since,
    remind: hasDone && (since === null || since >= platform.backup.remindAfterDays),
  };
}

export const RetentionInput = z.object({ daily: z.number().int().min(3).max(30), weekly: z.number().int().min(1).max(12) });

/** `backups.manage` ↑: the retention (core `platform_backup` bounds); audit `platform.settings.updated`. */
export async function saveBackupRetention(ctx: PlatformCtx, input: unknown): Promise<{ changed: boolean }> {
  requireManage(ctx);
  const parsed = RetentionInput.safeParse(input);
  if (!parsed.success) throw new FieldsError({ [String(parsed.error.issues[0]?.path[0] ?? "daily")]: "console.backups.retention_invalid" });
  const current = await getPlatformSetting("platform_backup");
  if (current.retention.daily === parsed.data.daily && current.retention.weekly === parsed.data.weekly) return { changed: false };
  await setPlatformSetting("platform_backup", { ...current, retention: parsed.data }, { id: ctx.user.id, ip: ctx.actor.ip, kind: "platform" });
  await auditFrom(ctx, "platform.settings.updated", { meta: { key: "platform_backup", daily: parsed.data.daily, weekly: parsed.data.weekly } });
  return { changed: true };
}

/** `backups.manage` ↑: the day's sealed part files for the download route (P8 `backupFiles`), or null for no such day. */
export async function backupDayFiles(ctx: PlatformCtx, day: string): Promise<{ name: string; path: string; bytes: number }[] | null> {
  requireManage(ctx);
  if (!DAY_RE.test(day)) return null;
  const runs = await listBackupRuns();
  if (!runs.some((r) => r.day === day && r.state === "done")) return null;
  const files = await backupFiles(day);
  return files.length ? files : null;
}

/** After a completed download: audit `platform.backup.downloaded` and the reminder's `lastDownloadAt`. */
export async function recordBackupDownload(ctx: PlatformCtx, day: string, now: Date = new Date()): Promise<void> {
  requireManage(ctx);
  if (!DAY_RE.test(day)) throw new FieldsError({ day: "console.backups.day_invalid" });
  const platform = await getPlatformSetting("platform");
  await setPlatformSetting("platform", { ...platform, backup: { ...platform.backup, lastDownloadAt: now.toISOString() } }, { id: ctx.user.id, ip: ctx.actor.ip, kind: "platform" });
  await auditFrom(ctx, "platform.backup.downloaded", { target: day, meta: { day } });
}
