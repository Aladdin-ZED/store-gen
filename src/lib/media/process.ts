import "server-only";
/**
 * Upload pipeline: sniff → decode (EXIF auto-rotate, sRGB, ALL metadata stripped by re-encoding) →
 * master ≤ 2048 px → responsive WebP/AVIF variants → palette → subject analysis (focal point,
 * subject box, heads/hands — ./focus-analyze.ts) → quota charge → files on the storage backend → rows in one
 * transaction.
 *
 * Multi-tenant (docs/STORE-SAAS.md §G.4, D21; TENANCY-MAP MED-01 … MED-04):
 *  - asset id = HMAC(master bytes, "media-id:<storeId>")[:32] (./ids.ts): identical uploads dedupe to the same
 *    asset inside the store only; another store's identical bytes make another asset, with other files, so nothing
 *    answers "deduped" (or faster) because a different store holds the file;
 *  - a cutout's `sourceAssetId` is kept only when it is an asset of the same store (MED-02);
 *  - the sharp gate is shared fairly: at most one job running and one waiting per store inside the process-wide
 *    2 running + 4 waiting. It covers the CPU half only (`prepareUpload`); the storage half (`persistUpload`) runs
 *    after the gate is released, so a slow disk or database never holds another store's processing slot.
 *
 * The storage half, §G.4 steps 4-6 (P8 from the R1.0 integration, ENGC-32):
 *  4. the files' total size (`stored_bytes`: master + variants + AVIF) is charged: a pending store's shared sandbox
 *     budget first, then the store's own gauge (./quota.ts, D69). A refused charge writes nothing (QuotaError → 413).
 *  5. every file is written through `mediaBackendReady().put` (durable, idempotent) BEFORE the transaction that inserts
 *     the `assets` row and its `media_files` rows: `storage = 'fs'` and no chunk on the filesystem backend, today's
 *     chunks inside the transaction on the database backend.
 *  6. any failure after the charge refunds both counters and removes the files this upload wrote, in one `finally`.
 *     When the failure is the deduped race (another upload of the same bytes in this store committed first, with
 *     the same keys and so the same files), files whose key now has a row are kept.
 *  Once committed, a cutout made from one of the store's photos re-renders the store's live pages that show that
 *  photo (render reason `cutout`, DES-§4.11, DES-R22), after the response.
 */
import { after } from "next/server";
import sharp, { type Metadata, type Sharp, type SharpOptions } from "sharp";
import { db, pool } from "@/lib/db/client";
import { assets, type AssetVariant } from "@/lib/db/schema";
import { recordError } from "@/lib/jobs/errors";
import { logError } from "@/lib/orders/log";
import { livePagesUsing } from "@/lib/storage/asset-refs";
import { byId } from "@/lib/tenancy/sql";
import type { WriteScope } from "@/lib/tenancy/types";
import { extractPalette, type ExtractedPalette } from "@/lib/theme";
import { MEDIA_WIDTHS, MIME, variantKey } from "./keys";
import { ASSET_ID_RE, VIDEO_MIME, getAsset, videoKey, type AssetRecord } from "./assets";
import { MediaError } from "./errors";
import { acquireMediaGate, releaseMediaGate } from "./gate";
import { forgetMisses, insertStoreFiles, storedBytesOf } from "./files";
import { FOCUS_VERSION, type AssetFocus } from "./focus";
import { analyzeImageFocus } from "./focus-analyze";
import { mediaAssetId } from "./ids";
import { chargeMediaBytes, quotaKind, type MediaStore, type QuotaError } from "./quota";
import { sniff } from "./sniff";
import { mediaBackendReady, type MediaStorage, type StoredFile } from "./storage";
import { fsFilePresent } from "./storage/fs";
import { sha256hex } from "./storage/io";
import { insertFsFileRows, keysWithRows, type FileToStore } from "./store";
import { inspectVideo } from "./video";

export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 25 * 1024 * 1024;
export const MAX_PIXELS = 40_000_000;
const MIN_SIDE = 32;
const MASTER_MAX = 2048;
/** AVIF encoding is slow: skip it above this width (WebP covers the largest sizes). */
const AVIF_MAX_WIDTH = 1440;

export interface ProcessOptions {
  /** background-removed product image (from the in-browser AI); transparent margins are trimmed */
  cutout?: boolean;
  /** asset this one was derived from (e.g. the original photo of a cutout); kept only when it is the store's own */
  sourceAssetId?: string | null;
  createdBy?: string | null;
  tags?: string[];
}

export interface UploadResult {
  asset: AssetRecord;
  /** true when an identical asset already existed (nothing new stored) */
  deduped: boolean;
}

/* ------------------------------------------------------------------ */
/* concurrency gate — sharp/libvips work is CPU-heavy on shared hosting */
/* ------------------------------------------------------------------ */

/*
 * libvips sizes each operation's thread pool from the CPU count the OS reports, which on shared
 * hosting is the whole server's, not the plan's 2 cores. Two threads per operation (and at most
 * MAX_CONCURRENT operations, ./gate.ts) fit the plan; the operation cache stays in memory only (no open file
 * handles kept between uploads). Both settings are process-wide.
 */
sharp.concurrency(2);
sharp.cache({ memory: 64, files: 0 });

/* ------------------------------------------------------------------ */

const cleanName = (name: string) =>
  name
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200) || null;

interface RawImage {
  data: Buffer;
  width: number;
  height: number;
  channels: 1 | 2 | 3 | 4;
}

/** Real transparency: at least 0.1 % of pixels with alpha < 250 (not merely an alpha channel). */
function hasTransparency(img: RawImage): boolean {
  if (img.channels !== 4) return false;
  const threshold = Math.max(1, Math.floor(img.width * img.height * 0.001));
  let n = 0;
  for (let i = 3; i < img.data.length; i += 4) if (img.data[i]! < 250 && ++n >= threshold) return true;
  return false;
}

/** Most frequent colour (4-bit/channel bins, alpha-weighted), averaged within its bin. */
function dominantHex(rgba: Buffer): string {
  const weight = new Float64Array(4096);
  const sums = new Float64Array(4096 * 3);
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    const a = rgba[i + 3]!;
    if (a < 128) continue;
    const r = rgba[i]!;
    const g = rgba[i + 1]!;
    const b = rgba[i + 2]!;
    const bin = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const w = a / 255;
    weight[bin] += w;
    sums[bin * 3] += r * w;
    sums[bin * 3 + 1] += g * w;
    sums[bin * 3 + 2] += b * w;
  }
  let best = -1;
  let bestW = 0;
  for (let i = 0; i < 4096; i++) if (weight[i]! > bestW) [best, bestW] = [i, weight[i]!];
  if (best < 0) return "#cccccc";
  const hex = (v: number) => Math.round(v).toString(16).padStart(2, "0");
  return `#${hex(sums[best * 3]! / bestW)}${hex(sums[best * 3 + 1]! / bestW)}${hex(sums[best * 3 + 2]! / bestW)}`;
}

function fromRaw(img: RawImage, alpha: boolean) {
  const s = sharp(img.data, { raw: { width: img.width, height: img.height, channels: img.channels } });
  return img.channels === 4 && !alpha ? s.removeAlpha() : s;
}

async function encode(img: RawImage, alpha: boolean, width: number, fmt: "webp" | "avif"): Promise<Buffer> {
  let s = fromRaw(img, alpha);
  if (width !== img.width) s = s.resize({ width, kernel: "lanczos3" });
  if (fmt === "webp") {
    return s
      .webp(alpha ? { quality: 90, alphaQuality: 100, effort: 4, smartSubsample: true } : { quality: 80, effort: 4, smartSubsample: true })
      .toBuffer();
  }
  return s.avif({ quality: alpha ? 60 : 55, effort: 4 }).toBuffer();
}

async function toRaw(pipeline: Sharp): Promise<RawImage> {
  const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: info.channels as RawImage["channels"] };
}

async function decodeImage(file: Buffer, format: "jpeg" | "png" | "webp" | "avif"): Promise<RawImage> {
  const opts: SharpOptions = { failOn: "error", limitInputPixels: MAX_PIXELS, sequentialRead: true };
  let meta: Metadata;
  try {
    // header only: the pixel limit is checked below with a clear error instead of a decode failure
    meta = await sharp(file, { ...opts, limitInputPixels: false }).metadata();
  } catch {
    throw new MediaError("corrupt");
  }
  const decodedAs = meta.format === "heif" && meta.compression === "av1" ? "avif" : meta.format;
  if (decodedAs !== format) throw new MediaError("unsupported");
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (w * h > MAX_PIXELS) throw new MediaError("too_many_pixels");
  if (w < MIN_SIDE || h < MIN_SIDE) throw new MediaError("too_small");
  try {
    return await toRaw(
      sharp(file, opts)
        .rotate() // EXIF orientation applied, then dropped with all other metadata
        .resize({ width: MASTER_MAX, height: MASTER_MAX, fit: "inside", withoutEnlargement: true })
        .toColourspace("srgb"),
    );
  } catch {
    throw new MediaError("corrupt");
  }
}

async function paletteOf(img: RawImage, alpha: boolean): Promise<{ palette: ExtractedPalette | null; dominant: string }> {
  const small = await toRaw(fromRaw(img, alpha).resize(96, 96, { fit: "inside" }).ensureAlpha());
  let palette: ExtractedPalette | null = null;
  try {
    palette = extractPalette(new Uint8Array(small.data.buffer, small.data.byteOffset, small.data.length), small.width, small.height);
  } catch {
    palette = null; // theme engine unavailable or failed — palette can be recomputed later
  }
  return { palette, dominant: dominantHex(small.data) };
}

/**
 * Subject analysis of the processed master (after the cutout trim, so boxes match the stored image).
 * Never fails an upload: an analysis error stores null and the renderer keeps the classic centred crop.
 */
async function focusOf(img: RawImage, alpha: boolean): Promise<AssetFocus | null> {
  try {
    return await analyzeImageFocus(img.data, { alpha, raw: { width: img.width, height: img.height, channels: img.channels } });
  } catch {
    return null;
  }
}

/** A re-upload of an asset analysed by an older algorithm (or never): refresh its focus in place. */
async function refreshFocus(scope: WriteScope, existing: AssetRecord, img: RawImage, alpha: boolean): Promise<AssetRecord> {
  if (existing.kind !== "image" || (existing.focusVersion ?? 0) >= FOCUS_VERSION) return existing;
  const focus = await focusOf(img, alpha);
  if (!focus) return existing;
  try {
    await db.update(assets).set({ focus, focusVersion: FOCUS_VERSION }).where(byId(assets, scope, existing.id));
    return { ...existing, focus, focusVersion: FOCUS_VERSION };
  } catch {
    return existing;
  }
}

interface NewAsset {
  id: string;
  kind: "image" | "video";
  mime: string;
  width: number;
  height: number;
  bytes: number;
  alpha: boolean;
  dominant: string;
  palette: ExtractedPalette | null;
  focus: AssetFocus | null;
  variants: AssetVariant[];
  files: FileToStore[];
}

/**
 * The CPU half's result, ready for `persistUpload`: the processed asset (master, variants, AVIF in memory), its
 * original name and the options. It belongs to the store it was prepared in.
 */
export interface PreparedUpload {
  readonly storeId: string;
  readonly asset: NewAsset;
  readonly originalName: string;
  readonly opts: ProcessOptions;
}

/** What `prepareUpload` answers: an identical asset of the store (`done`), or the work for `persistUpload` (`ready`). */
export type Prepared = { done: UploadResult } | { ready: PreparedUpload };

const isDuplicateKey = (err: unknown) =>
  typeof err === "object" && err !== null && (err as { code?: string }).code === "ER_DUP_ENTRY";

/** The stored file a variant becomes (§G.1 `StoredFile` without its backend). */
const storedFileOf = (storeId: string, assetId: string, f: FileToStore): Omit<StoredFile, "storage"> => ({
  storeId,
  key: f.key,
  assetId,
  mime: f.mime,
  bytes: f.data.length,
  sha256: sha256hex(f.data),
});

/**
 * Remove the files an upload wrote that no row names (§G.4 step 6). Never throws: a file left behind is an orphan the
 * daily `media.sweep` deletes after an hour (§G.3), counted here as `media` / `orphan_left`.
 */
async function removeUnclaimed(scope: WriteScope, backend: MediaStorage, written: readonly Omit<StoredFile, "storage">[]): Promise<void> {
  if (!written.length) return;
  try {
    // the deduped race: the winner in this store committed rows for the same keys, and so for the same files
    const claimed = await keysWithRows(scope, written.map((f) => f.key));
    for (const f of written) {
      if (claimed.has(f.key)) continue;
      await backend.remove({ storeId: f.storeId, key: f.key, storage: backend.kind }).catch((err: unknown) => {
        recordError("media", err, { code: "orphan_left", storeId: scope.storeId });
      });
    }
  } catch (err) {
    recordError("media", err, { code: "orphan_left", storeId: scope.storeId });
  }
}

/** `fn` after the response (Next's `after()`); outside a request (scripts, tests) it runs now and is awaited. */
async function afterResponse(fn: () => Promise<void>): Promise<void> {
  try {
    after(fn);
  } catch {
    await fn();
  }
}

/**
 * A cutout made from one of the store's photos: the store's live pages that show the photo are re-rendered in place
 * (reason `cutout`, DES-§4.11, DES-R22), so a page waiting on the real mask swaps its framed photo for the cutout.
 * The visual swap is the renderer's (P6); this only queues the pages. A failure is logged, never the upload's.
 */
function enqueueCutoutRenders(scope: WriteScope, sourceAssetId: string): Promise<void> {
  return afterResponse(async () => {
    try {
      const pageIds = await livePagesUsing(scope, sourceAssetId);
      if (!pageIds.length) return;
      // loaded on use: the render queue (and the renderer behind it) stays out of the upload route's module graph
      const { enqueueRenders } = await import("@/lib/jobs/renders");
      await enqueueRenders(scope, pageIds, "cutout");
    } catch (err) {
      logError("media:cutout:enqueue", err);
    }
  });
}

/**
 * The storage half (§G.4 steps 4-6) of an upload `prepareUpload` processed in the same store: charge, files, rows.
 * Throws QuotaError when the store's media quota (or the budget pending stores share) is full; nothing is then
 * written. Runs outside the CPU gate.
 */
export async function persistUpload(scope: WriteScope, store: MediaStore, prepared: PreparedUpload): Promise<UploadResult> {
  if (prepared.storeId !== scope.storeId) throw new Error("media: an upload prepared in another store");
  const { asset: a, originalName, opts } = prepared;
  const tags = [...new Set([...(opts.tags ?? []), ...(opts.cutout ? ["cutout"] : [])])]
    .map((t) => t.trim().slice(0, 40))
    .filter(Boolean)
    .slice(0, 20);
  // MED-02: only an asset of the same store can be the source (another store's id reads as missing)
  const source = opts.sourceAssetId && ASSET_ID_RE.test(opts.sourceAssetId) && (await getAsset(scope, opts.sourceAssetId)) ? opts.sourceAssetId : null;
  const storedBytes = storedBytesOf(a.files);

  // step 4: charged before anything is written (a QuotaError writes nothing); every failure below gives it back
  const refund = await chargeMediaBytes(scope, store, storedBytes);
  const written: Omit<StoredFile, "storage">[] = [];
  let backend: MediaStorage | null = null;
  let committed = false;
  try {
    // step 5: every file durable on its backend before the rows that name it (the db backend checks the bytes here
    // and writes its chunks with the rows, inside the transaction)
    backend = await mediaBackendReady();
    for (const f of a.files) {
      const file = storedFileOf(scope.storeId, a.id, f);
      // a file already on disk is not this upload's to remove (a twin upload of the same bytes in this store)
      const there = backend.kind === "fs" && (await fsFilePresent(file));
      await backend.put(file, f.data);
      if (backend.kind === "fs" && !there) written.push(file);
    }
    const conn = await pool().getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute(
        `INSERT INTO assets (id, store_id, kind, mime, width, height, bytes, stored_bytes, alpha, dominant, palette, variants,
           original_name, source_asset_id, tags, focus, focus_version, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          a.id,
          scope.storeId,
          a.kind,
          a.mime,
          a.width,
          a.height,
          a.bytes,
          storedBytes,
          a.alpha ? 1 : 0,
          a.dominant,
          a.palette ? JSON.stringify(a.palette) : null,
          JSON.stringify(a.variants),
          cleanName(originalName),
          source,
          tags.length ? JSON.stringify(tags) : null,
          a.focus ? JSON.stringify(a.focus) : null,
          a.focus ? FOCUS_VERSION : null,
          opts.createdBy ?? null,
          new Date(),
        ],
      );
      if (backend.kind === "fs") await insertFsFileRows(conn, scope, a.id, a.files);
      else await insertStoreFiles(conn, scope, a.id, a.files);
      await conn.commit();
      committed = true;
    } catch (err) {
      await conn.rollback().catch(() => undefined);
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    if (isDuplicateKey(err)) {
      // a concurrent upload of the same content in this store won the race (ids are per store, never another's)
      const existing = await getAsset(scope, a.id);
      if (existing) return { asset: existing, deduped: true };
    }
    throw err;
  } finally {
    // step 6: one place for every failure after the charge (the deduped answer above included)
    if (!committed) {
      await refund();
      if (backend) await removeUnclaimed(scope, backend, written);
    }
  }

  if (backend.kind === "fs") {
    // a twin upload that failed between our put and our commit may have removed a file it took for its own: put it back
    for (const f of a.files) {
      const file = storedFileOf(scope.storeId, a.id, f);
      if (!(await fsFilePresent(file))) await backend.put(file, f.data);
    }
  }
  forgetMisses(a.files.map((f) => f.key));
  const stored = await getAsset(scope, a.id);
  if (!stored) throw new Error(`asset ${a.id} vanished after insert`);
  if (opts.cutout && source) await enqueueCutoutRenders(scope, source);
  return { asset: stored, deduped: false };
}

async function prepareImage(scope: WriteScope, file: Buffer, format: "jpeg" | "png" | "webp" | "avif", originalName: string, opts: ProcessOptions): Promise<Prepared> {
  if (file.length > MAX_IMAGE_BYTES) throw new MediaError("too_large");
  let img = await decodeImage(file, format);
  let alpha = hasTransparency(img);
  if (opts.cutout && alpha) {
    // tighten the canvas around the subject (transparent margins only)
    try {
      const trimmed = await toRaw(fromRaw(img, true).trim());
      if (trimmed.width >= MIN_SIDE && trimmed.height >= MIN_SIDE) {
        img = trimmed;
        // the transparency may have been margins only
        alpha = hasTransparency(img);
      }
    } catch {
      // nothing to trim
    }
  }

  const masterWebp = await encode(img, alpha, img.width, "webp");
  const id = mediaAssetId(scope, masterWebp);
  const existing = await getAsset(scope, id);
  if (existing) return { done: { asset: await refreshFocus(scope, existing, img, alpha), deduped: true } };

  const widths = [...MEDIA_WIDTHS.filter((w) => w < img.width), img.width];
  const variants: AssetVariant[] = [];
  const files: FileToStore[] = [];
  for (const w of widths) {
    const h = Math.max(1, Math.round((img.height * w) / img.width));
    const [webp, avif] = await Promise.all([
      w === img.width ? Promise.resolve(masterWebp) : encode(img, alpha, w, "webp"),
      w <= AVIF_MAX_WIDTH ? encode(img, alpha, w, "avif") : Promise.resolve(null),
    ]);
    if (avif) {
      const key = variantKey(id, w, "avif");
      variants.push({ key, w, h, fmt: "avif", bytes: avif.length });
      files.push({ key, mime: MIME.avif, data: avif });
    }
    const key = variantKey(id, w, "webp");
    variants.push({ key, w, h, fmt: "webp", bytes: webp.length });
    files.push({ key, mime: MIME.webp, data: webp });
  }

  const [{ palette, dominant }, focus] = await Promise.all([paletteOf(img, alpha), focusOf(img, alpha)]);
  return {
    ready: {
      storeId: scope.storeId,
      asset: { id, kind: "image", mime: MIME.webp, width: img.width, height: img.height, bytes: masterWebp.length, alpha, dominant, palette, focus, variants, files },
      originalName,
      opts,
    },
  };
}

async function prepareVideo(scope: WriteScope, file: Buffer, format: "mp4" | "webm", originalName: string, opts: ProcessOptions): Promise<Prepared> {
  if (file.length > MAX_VIDEO_BYTES) throw new MediaError("too_large");
  const info = inspectVideo(file, format);
  const id = mediaAssetId(scope, info.data);
  const existing = await getAsset(scope, id);
  if (existing) return { done: { asset: existing, deduped: true } };
  const key = videoKey(id, info.width, format);
  return {
    ready: {
      storeId: scope.storeId,
      asset: {
        id,
        kind: "video",
        mime: VIDEO_MIME[format],
        width: info.width,
        height: info.height,
        bytes: info.data.length,
        alpha: false,
        dominant: "#111111",
        palette: null,
        focus: null,
        // the playable file is addressed with videoSource(asset); `variants` lists image renditions only
        variants: [],
        files: [{ key, mime: VIDEO_MIME[format], data: info.data }],
      },
      originalName,
      opts: { ...opts, cutout: false },
    },
  };
}

/**
 * The CPU half of an upload (sniff, decode, encode, analyse) in the scope's store, without the gate: an identical
 * asset of the store answers `{ done }` at once (its focus refreshed when an older algorithm analysed it), anything
 * else `{ ready }` for `persistUpload`. `processUpload` runs it under the media gate; test:storage drives the two
 * halves to race the storage half alone. Throws MediaError for user-facing rejections.
 */
export async function prepareUpload(scope: WriteScope, file: Buffer, originalName: string, opts: ProcessOptions = {}): Promise<Prepared> {
  if (file.length > Math.max(MAX_IMAGE_BYTES, MAX_VIDEO_BYTES)) throw new MediaError("too_large");
  const kind = sniff(file);
  if (!kind) throw new MediaError("unsupported");
  return kind.kind === "image" ? prepareImage(scope, file, kind.format, originalName, opts) : prepareVideo(scope, file, kind.format, originalName, opts);
}

/**
 * Validate, process and store an uploaded image (JPEG/PNG/WebP/AVIF ≤ 15 MB, ≤ 40 MP) or video
 * (MP4/WebM ≤ 25 MB) in the scope's store. Throws MediaError for user-facing rejections ("busy" when the
 * processing queue, or the store's share of it, is full) and QuotaError when the store's media quota (or the
 * budget pending stores share) is full. Video bytes are scrubbed in place: hand over a buffer nothing else reads.
 */
export async function processUpload(scope: WriteScope, store: MediaStore, file: Buffer, originalName: string, opts: ProcessOptions = {}): Promise<UploadResult> {
  if (file.length > Math.max(MAX_IMAGE_BYTES, MAX_VIDEO_BYTES)) throw new MediaError("too_large");
  if (!sniff(file)) throw new MediaError("unsupported");
  await acquireMediaGate(scope.storeId);
  let prepared: Prepared;
  try {
    prepared = await prepareUpload(scope, file, originalName, opts);
  } finally {
    releaseMediaGate(scope.storeId);
  }
  return "done" in prepared ? prepared.done : persistUpload(scope, store, prepared.ready);
}

/* ------------------------------------------------------------------ */
/* The route's answer to a refused charge (§G.4 step 4, MED-13)        */
/* ------------------------------------------------------------------ */

/** What the member reads: the store's own storage, or the sandbox while the store waits for review. Never a platform figure. */
export const QUOTA_MESSAGES = {
  store: "Your store's media storage is full. Delete photos or videos you no longer use, then upload again.",
  pending: "Uploads are limited while your store is waiting for review. Delete files you no longer use, or try again after the review.",
} as const;

/**
 * The upload route's 413 for a refused charge: `{ error: "quota" }` with the sandbox message when the shared pending
 * budget refused (D69), the store's own otherwise. It never carries the limit, the usage or the platform database's
 * fill level (MED-13).
 */
export function quotaRefusal(err: QuotaError): { status: 413; body: { ok: false; error: "quota"; message: string } } {
  return { status: 413, body: { ok: false, error: "quota", message: QUOTA_MESSAGES[quotaKind(err)] } };
}
