import "server-only";
/**
 * Lazy subject analysis for rows uploaded before it existed (or analysed by an older FOCUS_VERSION).
 * Uploads analyse new images (./process.ts); scripts/media-backfill.ts recomputes in bulk; this is
 * the on-demand path: the framing picker's GET /api/app/<handle>/media/[id] and the builder bootstrap call
 * it, the result is stored, and from then on the builder canvas, every published version and every
 * export crop the image around its subject — all from the same stored row.
 *
 * Input is the same as the backfill's: the largest stored still rendition (the processed master,
 * EXIF-rotated and trimmed for cutouts — the pixels the upload analysed). One analysis per asset at a
 * time per process; a failure (busy media store, undecodable file) keeps the stored value.
 *
 * Multi-tenant (docs/STORE-SAAS.md §E.3; TENANCY-MAP MED-15): callers hand over rows they read through their own
 * store scope (getAsset / getAssetsByIds), never an id from input. The analysis is a derived value of the row's
 * own stored bytes, written back as the system (job "media.focus") to that row in its own store only, so a
 * read-only viewer (an impersonating staff member, a builder open) fills it in like the backfill would and no
 * write ever reaches another store's row.
 */
import { db } from "@/lib/db/client";
import { assets } from "@/lib/db/schema";
import { systemCtx, systemScope } from "@/lib/jobs/scope";
import { byId } from "@/lib/tenancy/sql";
import type { WriteScope } from "@/lib/tenancy/types";
import type { AssetRecord } from "./assets";
import { FOCUS_VERSION, parseFocus, type AssetFocus } from "./focus";
import { analyzeImageFocus } from "./focus-analyze";
import { getMediaFile } from "./store";

declare global {
  var __codFocusFlights: Map<string, Promise<AssetFocus | null>> | undefined;
  var __codFocusMisses: Map<string, number> | undefined;
}

const flights = () => (globalThis.__codFocusFlights ??= new Map());

/** The writer of the derived analysis (see the header). */
const FOCUS_JOB = systemCtx("media.focus");

/**
 * Images that could not be analysed (no stored rendition, undecodable pixels) → when to try again.
 * Without it every builder open and every framing-picker view would decode the same broken file
 * again; a busy store or database is not remembered (those retry on the next call).
 */
const RETRY_AFTER_MS = 10 * 60_000;
const MISSES_MAX = 500;
const misses = () => (globalThis.__codFocusMisses ??= new Map());

function rememberMiss(id: string): void {
  const map = misses();
  if (map.size >= MISSES_MAX) map.delete(map.keys().next().value as string);
  map.set(id, Date.now() + RETRY_AFTER_MS);
}

function recentlyMissed(id: string): boolean {
  const until = misses().get(id);
  if (until === undefined) return false;
  if (until > Date.now()) return true;
  misses().delete(id);
  return false;
}

/** The row's analysis is current (no work to do). */
export function focusIsCurrent(asset: Pick<AssetRecord, "kind" | "focus" | "focusVersion">): boolean {
  return asset.kind !== "image" || ((asset.focusVersion ?? 0) >= FOCUS_VERSION && !!parseFocus(asset.focus));
}

function largestRendition(asset: AssetRecord) {
  const still = asset.variants.filter((v) => v.fmt === "webp" || v.fmt === "png" || v.fmt === "jpeg");
  const webp = still.filter((v) => v.fmt === "webp");
  const pool = webp.length ? webp : still;
  return [...pool].sort((a, b) => b.w - a.w)[0] ?? null;
}

async function analyse(asset: AssetRecord, stored: AssetFocus | null): Promise<AssetFocus | null> {
  const variant = largestRendition(asset);
  const file = variant ? await getMediaFile(variant.key) : null;
  if (!file) {
    rememberMiss(asset.id);
    return stored;
  }
  let focus: AssetFocus;
  try {
    focus = await analyzeImageFocus(file.data, { alpha: asset.alpha });
  } catch {
    rememberMiss(asset.id);
    return stored;
  }
  await storeFocus(systemScope(FOCUS_JOB, asset.storeId), asset.id, focus);
  misses().delete(asset.id);
  return focus;
}

/** The analysis of one asset of the scope's store (0 rows when it was deleted meanwhile). */
async function storeFocus(scope: WriteScope, id: string, focus: AssetFocus): Promise<void> {
  await db.update(assets).set({ focus, focusVersion: FOCUS_VERSION }).where(byId(assets, scope, id));
}

/**
 * Stored analysis when current, else analysed now (once per id at a time) and stored. Videos: null.
 * An image that could not be analysed keeps its stored value for a while before the next attempt.
 */
export async function ensureFocus(asset: AssetRecord): Promise<AssetFocus | null> {
  if (asset.kind !== "image") return null;
  const stored = parseFocus(asset.focus);
  if (stored && (asset.focusVersion ?? 0) >= FOCUS_VERSION) return stored;
  if (recentlyMissed(asset.id)) return stored;
  const map = flights();
  let p = map.get(asset.id);
  if (!p) {
    p = analyse(asset, stored).finally(() => map.delete(asset.id));
    map.set(asset.id, p);
  }
  return p;
}

export interface EnsureManyOptions {
  /** stop starting new analyses after this long (ms); rows not reached keep their stored value */
  budgetMs?: number;
  /** analyses running at once (sharp is CPU-bound; a shared host has few cores) */
  parallel?: number;
}

/**
 * The rows with their analysis brought up to date, as far as the time budget allows: a page opened
 * in the builder for the first time since its images were uploaded gets them analysed (and stored)
 * once, the next opens are free. Never throws; rows keep their order and identity when unchanged.
 */
export async function ensureFocusMany(rows: readonly AssetRecord[], opts: EnsureManyOptions = {}): Promise<AssetRecord[]> {
  const todo = rows.map((r, i) => [r, i] as const).filter(([r]) => !focusIsCurrent(r));
  if (!todo.length) return rows.slice();
  const out = rows.slice();
  const deadline = Date.now() + Math.max(0, opts.budgetMs ?? 2500);
  let next = 0;
  const worker = async () => {
    while (next < todo.length && Date.now() < deadline) {
      const [row, i] = todo[next++]!;
      try {
        const focus = await ensureFocus(row);
        if (focus) out[i] = { ...row, focus };
      } catch {
        // a busy store or database: this row keeps what it had (the canvas and the page agree)
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(opts.parallel ?? 2, todo.length)) }, worker));
  return out;
}
