import "server-only";
/**
 * One store export job, slice by slice (docs/STORE-SAAS.md §F.9, §H.2 slot 5, PL-09; R1 P8 step 8). The cron's
 * `exports` job (src/lib/jobs/exports.ts) claims one `export_jobs` row and calls `runExportJob` with a system scope of
 * its store; everything below is scoped to that store.
 *
 *   pending  → the preflight: a DATA_DIR that passed its boot check ('no_data_dir'), the estimated bytes against what
 *              the last DATA_DIR walk leaves of the budget ('no_space'), a fresh folder, then running with a cursor
 *   running  → sections (./sections.ts) slice by slice until the tick's deadline; the cursor
 *              `{ s, after, stage, rows, zip, notes, written }` is saved after every slice, so a dead tick costs one
 *   ready    → the last part finished: `parts` [{ name, bytes, sha256 }], `bytes`, `expires_at` = now + 72 h, the stage
 *              folder removed; the export_ready mail once (member requests, when the §B.10 mailer is on), linking to
 *              /app/<h>/settings/danger, never to a signed URL
 *   failed   → a code (`no_data_dir`, `no_space`, `store_gone`, `cursor_lost`, `part_lost`, `write_failed`) and the
 *              job's files removed; a slice that throws is retried at the next tick, the third failure in a row fails
 *   expired  → `expireExportJob`: the parts deleted 72 h after ready (the cleanup branch of the cron job)
 *
 * Not charged to `exports_month`: a data-portability export is not a PHP export (recorded in r1-p8-report.md).
 */
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { and, eq, inArray } from "drizzle-orm";
import { appHref, platformOrigin } from "@/lib/urls";
import { db } from "@/lib/db/client";
import { exportJobs, users } from "@/lib/db/schema";
import { errorCode, recordError } from "@/lib/jobs/errors";
import { readJobState } from "@/lib/jobs/storage/state";
import { mailer } from "@/lib/mail";
import { mediaStorageChecked } from "@/lib/media/storage";
import { errorSummary } from "@/lib/orders/log";
import { dataDir, dataPath } from "@/lib/storage/paths";
import { readWalkSnapshot, WALK_JOB } from "@/lib/storage/walk";
import { getStoreById } from "@/lib/tenancy/public";
import { byId } from "@/lib/tenancy/sql";
import type { StoreRow, WriteScope } from "@/lib/tenancy/types";
import { estimateExportBytes, SECTIONS } from "./sections";
import { parsePartsState, PART_LIMIT_BYTES, ZipParts, ZipResumeError, type PartInfo, type PartsState } from "./zip";

/** §F.9: parts are deleted 72 h after the export was ready */
export const EXPORT_TTL_MS = 72 * 60 * 60_000;
/** rows read per slice of a table section */
export const ROWS_PER_SLICE = 500;
/** consecutive failed slices before the job fails */
const MAX_SLICE_ERRORS = 3;

export type ExportFailCode = "no_data_dir" | "no_space" | "store_gone" | "cursor_lost" | "part_lost" | "write_failed";

export interface ExportCursor {
  v: 1;
  /** the section being written (index into SECTIONS) */
  s: number;
  /** keyset position inside it */
  after: unknown;
  /** bytes and rows of its stage file */
  stage: number;
  rows: number;
  zip: PartsState | null;
  notes: string[];
  written: string[];
  /** archive entries written so far */
  entries: number;
  /** consecutive failed slices */
  errors: number;
}

const initialCursor = (): ExportCursor => ({ v: 1, s: 0, after: null, stage: 0, rows: 0, zip: null, notes: [], written: [], entries: 0, errors: 0 });

const nat = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");

/** A saved cursor, or null when it is not one. */
export function parseExportCursor(raw: unknown): ExportCursor | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Partial<ExportCursor>;
  if (c.v !== 1 || !nat(c.s) || c.s > SECTIONS.length || !nat(c.stage) || !nat(c.rows) || !nat(c.entries) || !nat(c.errors)) return null;
  if (!strings(c.notes) || !strings(c.written)) return null;
  const zip = c.zip === null || c.zip === undefined ? null : parsePartsState(c.zip);
  if (c.zip && !zip) return null;
  return { v: 1, s: c.s, after: c.after ?? null, stage: c.stage, rows: c.rows, zip, notes: c.notes, written: c.written, entries: c.entries, errors: c.errors };
}

/** DATA_DIR/exports/<storeId>/<jobId>/ */
export const exportDir = (storeId: string, jobId: string): string => dataPath("exports", storeId, jobId);

export interface ExportRunCtx {
  /** epoch ms: no slice starts after it */
  deadline: number;
  yield(): Promise<void>;
}

export interface ExportRunOpts {
  /** slices this call runs at most (tests force several ticks) */
  maxSlices?: number;
  rowsPerSlice?: number;
  /** the part size cap (500 MB; tests pass a few KB) */
  partLimitBytes?: number;
  /** the clock of `expires_at` / `done_at` (tests) */
  now?: () => number;
}

export interface ExportRunOutcome {
  state: "running" | "ready" | "failed" | "gone";
  slices: number;
  entries: number;
  parts?: number;
  bytes?: number;
  error?: ExportFailCode;
}

async function removeDir(storeId: string, jobId: string): Promise<void> {
  if (!dataDir()) return;
  await rm(/* turbopackIgnore: true */ exportDir(storeId, jobId), { recursive: true, force: true }).catch(() => undefined);
}

/** Fails the job with `code` and removes its files (a pending or running job only). */
export async function failExportJob(scope: WriteScope, jobId: string, code: ExportFailCode, nowMs: number = Date.now()): Promise<void> {
  await removeDir(scope.storeId, jobId);
  await db
    .update(exportJobs)
    .set({ state: "failed", error: code, cursor: null, doneAt: new Date(nowMs) })
    .where(and(byId(exportJobs, scope, jobId), inArray(exportJobs.state, ["pending", "running"])));
}

/** A ready job past its 72 h: the parts deleted, the row kept as `expired` (its part list and bytes stay for the record). */
export async function expireExportJob(scope: WriteScope, jobId: string): Promise<boolean> {
  await removeDir(scope.storeId, jobId);
  const [res] = await db
    .update(exportJobs)
    .set({ state: "expired" })
    .where(and(byId(exportJobs, scope, jobId), eq(exportJobs.state, "ready")));
  return ((res as { affectedRows?: number } | undefined)?.affectedRows ?? 0) > 0;
}

async function saveCursor(scope: WriteScope, jobId: string, cursor: ExportCursor): Promise<boolean> {
  const [res] = await db
    .update(exportJobs)
    .set({ cursor: cursor as unknown as Record<string, unknown> })
    .where(and(byId(exportJobs, scope, jobId), eq(exportJobs.state, "running")));
  return ((res as { affectedRows?: number } | undefined)?.affectedRows ?? 0) > 0;
}

/** §F.9 'no_space': the estimate against what the last complete DATA_DIR walk left of the budget (no walk: no check). */
async function spaceRefusal(scope: WriteScope): Promise<boolean> {
  const snap = readWalkSnapshot(await readJobState(WALK_JOB));
  if (!snap) return false;
  const left = snap.budgetBytes - snap.bytes;
  return (await estimateExportBytes(scope)) > left;
}

function failCodeOf(err: unknown): ExportFailCode | null {
  if (err instanceof ZipResumeError) return "part_lost";
  const code = (err as { code?: unknown } | null)?.code;
  if (code === "ENOSPC" || code === "EDQUOT") return "no_space";
  return null;
}

const MAIL_LOCALES = new Set(["ar", "fr", "en"]);

/** The export_ready mail, once, to the member who asked (never a signed link: the Danger zone lists the parts). */
async function mailReady(store: StoreRow, requestedBy: string, jobId: string): Promise<void> {
  const m = mailer();
  if (!m.enabled) return;
  // users is a platform table: the requester's own address
  const [u] = await db.select({ email: users.email, locale: users.locale }).from(users).where(eq(users.id, requestedBy)).limit(1);
  if (!u) return;
  const locale = (MAIL_LOCALES.has(u.locale ?? "") ? u.locale : MAIL_LOCALES.has(store.defaultLocale) ? store.defaultLocale : "en") as "ar" | "fr" | "en";
  await m.enqueue({
    to: u.email,
    locale,
    template: "export_ready",
    vars: { storeName: store.name, url: `${platformOrigin()}${appHref(store.handle, "/settings/danger")}` },
    storeId: store.id,
    dedupeKey: `export_ready:${jobId}`,
  });
}

/**
 * Runs the job `jobId` of the scope's store until `ctx.deadline` (or `maxSlices`), from where its cursor stands.
 * Never throws for a job's own failure: that is the `failed` outcome (a database error reading the row does throw).
 */
export async function runExportJob(ctx: ExportRunCtx, scope: WriteScope, jobId: string, opts: ExportRunOpts = {}): Promise<ExportRunOutcome> {
  const now = opts.now ?? Date.now;
  const [job] = await db
    .select({ state: exportJobs.state, cursor: exportJobs.cursor, requestedAs: exportJobs.requestedAs, requestedBy: exportJobs.requestedBy, createdAt: exportJobs.createdAt })
    .from(exportJobs)
    .where(byId(exportJobs, scope, jobId))
    .limit(1);
  if (!job || (job.state !== "pending" && job.state !== "running")) return { state: "gone", slices: 0, entries: 0 };
  const fail = async (code: ExportFailCode, entries = 0): Promise<ExportRunOutcome> => {
    await failExportJob(scope, jobId, code, now());
    return { state: "failed", slices: 0, entries, error: code };
  };

  const store = await getStoreById(scope.storeId);
  if (!store) return fail("store_gone");
  if (!dataDir() || !(await mediaStorageChecked()).ok) return fail("no_data_dir");
  const dir = exportDir(scope.storeId, jobId);

  let cursor: ExportCursor;
  if (job.state === "pending") {
    if (await spaceRefusal(scope)) return fail("no_space");
    await rm(/* turbopackIgnore: true */ dir, { recursive: true, force: true });
    await mkdir(/* turbopackIgnore: true */ join(dir, "stage"), { recursive: true, mode: 0o700 });
    cursor = initialCursor();
    const [res] = await db
      .update(exportJobs)
      .set({ state: "running", cursor: cursor as unknown as Record<string, unknown>, error: null })
      .where(and(byId(exportJobs, scope, jobId), eq(exportJobs.state, "pending")));
    if (((res as { affectedRows?: number } | undefined)?.affectedRows ?? 0) === 0) return { state: "gone", slices: 0, entries: 0 };
  } else {
    const parsed = parseExportCursor(job.cursor);
    if (!parsed) return fail("cursor_lost");
    cursor = parsed;
    await mkdir(/* turbopackIgnore: true */ join(dir, "stage"), { recursive: true, mode: 0o700 });
  }

  let zip: ZipParts;
  try {
    zip = await ZipParts.open(dir, cursor.zip, opts.partLimitBytes ?? PART_LIMIT_BYTES);
  } catch (err) {
    if (err instanceof ZipResumeError) return fail("part_lost", cursor.entries);
    throw err;
  }

  const maxSlices = opts.maxSlices ?? Number.POSITIVE_INFINITY;
  let slices = 0;
  try {
    while (cursor.s < SECTIONS.length) {
      if (slices >= maxSlices || Date.now() >= ctx.deadline) return { state: "running", slices, entries: cursor.entries };
      const section = SECTIONS[cursor.s]!;
      const notes = [...cursor.notes];
      const written = [...cursor.written];
      let r;
      try {
        r = await section.slice({
          scope,
          store,
          dir,
          zip,
          after: cursor.after,
          stage: cursor.stage,
          rows: cursor.rows,
          notes,
          written,
          rowsPerSlice: opts.rowsPerSlice ?? ROWS_PER_SLICE,
          deadline: ctx.deadline,
          yield: ctx.yield,
          createdAt: job.createdAt,
        });
      } catch (err) {
        const code = failCodeOf(err);
        console.error(`[exports] ${jobId}: section ${section.id} failed:`, errorSummary(err));
        recordError("jobs", err, { storeId: scope.storeId, route: "job:exports", code: code ?? errorCode(err) });
        if (code) return fail(code, cursor.entries);
        if (cursor.errors + 1 >= MAX_SLICE_ERRORS) return fail("write_failed", cursor.entries);
        // the next tick resumes from the saved cursor (the archive and the stage are cut back to it)
        cursor.errors++;
        await saveCursor(scope, jobId, cursor);
        return { state: "running", slices, entries: cursor.entries };
      }
      slices++;
      cursor = {
        ...cursor,
        s: r.done ? cursor.s + 1 : cursor.s,
        after: r.done ? null : r.after,
        stage: r.done ? 0 : r.stage,
        rows: r.done ? 0 : r.rows,
        zip: zip.state(),
        notes,
        written,
        entries: cursor.entries + r.entries,
        errors: 0,
      };
      if (!(await saveCursor(scope, jobId, cursor))) return { state: "gone", slices, entries: cursor.entries };
      await ctx.yield();
    }

    // every section written: finish the last part, then the row
    let parts: PartInfo[];
    try {
      parts = await zip.finish();
    } catch (err) {
      const code = failCodeOf(err) ?? "write_failed";
      recordError("jobs", err, { storeId: scope.storeId, route: "job:exports", code });
      return fail(code, cursor.entries);
    }
    await rm(/* turbopackIgnore: true */ join(dir, "stage"), { recursive: true, force: true }).catch(() => undefined);
    const bytes = parts.reduce((n, p) => n + p.bytes, 0);
    const at = now();
    const [res] = await db
      .update(exportJobs)
      .set({ state: "ready", parts, bytes, cursor: null, error: null, doneAt: new Date(at), expiresAt: new Date(at + EXPORT_TTL_MS) })
      .where(and(byId(exportJobs, scope, jobId), eq(exportJobs.state, "running")));
    const flipped = ((res as { affectedRows?: number } | undefined)?.affectedRows ?? 0) > 0;
    if (flipped && job.requestedAs === "member") {
      await mailReady(store, job.requestedBy, jobId).catch((err: unknown) => console.error(`[exports] ${jobId}: export_ready mail:`, errorSummary(err)));
    }
    return flipped ? { state: "ready", slices, entries: cursor.entries, parts: parts.length, bytes } : { state: "gone", slices, entries: cursor.entries };
  } finally {
    await zip.close();
  }
}
