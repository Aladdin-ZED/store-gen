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
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { auditFrom } from "@/lib/audit";
import { AuthRefusal, FieldsError } from "@/lib/auth/errors";
import { backupFiles, listBackupRuns, type BackupRunSummary } from "@/lib/backup";
import { zipStream, type ZipEntry } from "@/lib/export/zip";
import { getPlatformSetting, setPlatformSetting } from "@/lib/settings";
import type { PlatformCtx } from "@/lib/tenancy/types";
import { recordPlatformError } from "./log";
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

/** Why a staff member downloads a backup (PLA-§17 "Download ↑ with a reason"; recorded in the audit meta). */
export const BACKUP_DOWNLOAD_REASONS = ["offsite_copy", "restore_test", "incident", "other"] as const;
export type BackupDownloadReason = (typeof BACKUP_DOWNLOAD_REASONS)[number];
export const isBackupDownloadReason = (v: unknown): v is BackupDownloadReason => typeof v === "string" && (BACKUP_DOWNLOAD_REASONS as readonly string[]).includes(v);

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
export async function recordBackupDownload(ctx: PlatformCtx, day: string, now: Date = new Date(), reason: BackupDownloadReason | null = null): Promise<void> {
  requireManage(ctx);
  if (!DAY_RE.test(day)) throw new FieldsError({ day: "console.backups.day_invalid" });
  const platform = await getPlatformSetting("platform");
  await setPlatformSetting("platform", { ...platform, backup: { ...platform.backup, lastDownloadAt: now.toISOString() } }, { id: ctx.user.id, ip: ctx.actor.ip, kind: "platform" });
  await auditFrom(ctx, "platform.backup.downloaded", { target: day, meta: { day, ...(reason ? { reason } : {}) } });
}

/* ------------------------------------------------------------------ */
/* The download archive (PLA-§17, OS-10; GET /api/admin/backups/<day>) */
/* ------------------------------------------------------------------ */

const README = [
  "Store Gen backup",
  "",
  "This archive holds one day of the platform's logical backup, as the server wrote it:",
  "- the part files (NDJSON per table slice, gzip, then sealed with the platform key: envelope backup:v1);",
  "- manifest.json: the day, each part's name, size in bytes and SHA-256, and the backup run's table counts.",
  "",
  "The parts are encrypted. They can only be opened by a Store Gen server holding the same APP_SECRET.",
  "Keep this file somewhere other than the hosting account (an off-site copy).",
  "Check a part with: sha256sum <part> and compare it with manifest.json.",
  "",
].join("\n");

/**
 * `backups.manage` ↑ (the route's guard checks it, and `backupDayFiles` again): one stored (level 0) ZIP of the day's
 * sealed parts, then `manifest.json` (each part's size and SHA-256, computed while it streams) and `README.txt`. A
 * part outside `DATA_DIR/backups/` or missing on disk ends the answer as the neutral 404 (null). When the archive has
 * been fully produced, the download is recorded (`recordBackupDownload`: audit and `lastDownloadAt`).
 */
export async function backupArchive(ctx: PlatformCtx, day: string, now: Date = new Date(), reason: BackupDownloadReason | null = null): Promise<{ stream: ReadableStream<Uint8Array>; filename: string } | null> {
  const files = await backupDayFiles(ctx, day);
  const root = process.env.DATA_DIR?.trim();
  if (!files || !root) return null;
  const base = path.resolve(root, "backups");
  const parts: { name: string; file: string; bytes: number }[] = [];
  for (const f of files) {
    const file = path.resolve(root, f.path);
    if (!file.startsWith(base + path.sep) || !/^[A-Za-z0-9._-]{1,120}$/.test(f.name)) return null;
    parts.push({ name: f.name, file, bytes: f.bytes });
  }
  const runs = await listBackupRuns().catch(() => []);
  const run = runs.find((r) => r.day === day && r.state === "done") ?? null;
  const sums = new Map<string, { bytes: number; sha256: string }>();
  const entries: ZipEntry[] = parts.map((p) => ({
    path: `${day}/${p.name}`,
    compress: false,
    async load() {
      const data = await readFile(p.file).catch(() => null);
      if (!data) return null;
      sums.set(p.name, { bytes: data.length, sha256: createHash("sha256").update(data).digest("hex") });
      return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    },
  }));
  entries.push({
    path: `${day}/manifest.json`,
    compress: false,
    async load() {
      const manifest = {
        v: 1,
        day,
        createdAt: now.toISOString(),
        run: run ? { id: run.id, kind: run.kind, doneAt: run.doneAt, tables: run.tables } : null,
        parts: parts.map((p) => ({ name: p.name, bytes: sums.get(p.name)?.bytes ?? null, sha256: sums.get(p.name)?.sha256 ?? null, missing: !sums.has(p.name) })),
      };
      return new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`);
    },
  });
  entries.push({ path: `${day}/README.txt`, compress: false, load: async () => new TextEncoder().encode(README) });
  const stream = zipStream(entries, {
    mtime: now,
    onDone: () => {
      void recordBackupDownload(ctx, day, now, reason).catch((err: unknown) => recordPlatformError("backup download record", err));
    },
  });
  return { stream, filename: `store-gen-backup-${day}.zip` };
}
