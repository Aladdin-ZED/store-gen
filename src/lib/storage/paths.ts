/**
 * The `DATA_DIR` areas and the one path builder (docs/STORE-SAAS.md §G.2, §G.7; rev 3, SEC-21). Every file the app
 * keeps outside the database lives under a registered area, and every such path is built here:
 *
 *   dataPath("exports", scope.storeId, jobId, "part-1.zip")   // DATA_DIR/exports/<storeId>/<jobId>/part-1.zip
 *   dataPath("backups", null, "2026-10-28", "orders.0001.sgb")  // DATA_DIR/backups/2026-10-28/orders.0001.sgb
 *   mediaFilePath(storeId, key)                                // <media root>/v1/<id[0..1]>/<id>/<key[0..1]>/<key>
 *
 * - `DATA_AREAS` is the registry: `dataPath` refuses an area that is not in it, and the purge (§F.9) deletes every
 *   `perStore` area of a store through `perStoreDirs(storeId)`, so a new area is purged without editing the purge.
 * - A store id is a ULID (`^[0-9A-HJKMNP-TV-Z]{26}$`); a segment is one plain name: never empty, `.` or `..`, never
 *   absolute, never carrying `/`, `\`, `:` (a Windows drive or stream) or NUL. Anything else throws, so a caller's
 *   bad input can never walk out of its area.
 * - Roots: `DATA_DIR` must be absolute (else `dataDir()` is null and no area resolves). `MEDIA_DIR` overrides
 *   `DATA_DIR/media` and must be absolute too: a relative one turns the media root off (null) rather than putting files
 *   somewhere nobody chose. `MEDIA_CACHE_DIR` (a cache, so a bad value only falls back) replaces
 *   `DATA_DIR/cache/media`, else `tmpdir()/store-gen-media` while `DATA_DIR` is unset or refused by the boot check
 *   (never COD Studio's directory, MED-07). The fs backend's temp files live in `<media root>/tmp` (`mediaTmpDir()`).
 *
 * Pure: reads process.env on every call (nothing cached) and touches no file; the filesystem work is the storage
 * driver's (src/lib/media/storage/**) and the jobs'.
 */
import { tmpdir } from "node:os";
import { isAbsolute, join, normalize } from "node:path";
import { KEY_RE } from "@/lib/media/keys";

export interface DataAreaDef {
  /** one directory per store: `<area>/<storeId>/…` (media: `<root>/<id[0..1]>/<id>/…`) */
  readonly perStore: boolean;
  /** the directory under DATA_DIR when it is not the area's name */
  readonly root?: string;
}

/** The registry of §G.7 (SEC-21). Frozen: an area is added here, in one place, or it does not exist. */
export const DATA_AREAS = Object.freeze({
  media: Object.freeze({ perStore: true, root: "media/v1" }),
  exports: Object.freeze({ perStore: true }),
  imports: Object.freeze({ perStore: true }),
  receipts: Object.freeze({ perStore: true }),
  ai: Object.freeze({ perStore: true }),
  backups: Object.freeze({ perStore: false }),
  cache: Object.freeze({ perStore: false }),
} as const satisfies Record<string, DataAreaDef>);

export type DataArea = keyof typeof DATA_AREAS;

/** a store id (ULID, Crockford base 32, upper case) */
export const STORE_DIR_ID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;
/** the disk cache when DATA_DIR is unset (store-gen's own name, never COD Studio's `cod-studio-media`, MED-07) */
export const FALLBACK_MEDIA_CACHE = "store-gen-media";

/** the temp folder under the media root (`<media root>/tmp/<random>`, §G.2) */
export const MEDIA_TMP = "tmp";

const MAX_SEGMENT = 255;
const BAD_SEGMENT_CHARS = /[/\\:\0]/;

/** An absolute directory from the environment, normalized; null when unset, blank or relative. */
function absoluteEnv(name: "DATA_DIR" | "MEDIA_DIR" | "MEDIA_CACHE_DIR"): string | null {
  const raw = process.env[name]?.trim();
  if (!raw || !isAbsolute(raw)) return null;
  return normalize(raw);
}

/** `DATA_DIR` when it is an absolute path, else null (the app then keeps media in the database, §G.3). */
export function dataDir(): string | null {
  return absoluteEnv("DATA_DIR");
}

/** The media root: the `MEDIA_DIR` override, else `DATA_DIR/media`; null when neither is usable. */
export function mediaRoot(): string | null {
  if (process.env.MEDIA_DIR?.trim()) return absoluteEnv("MEDIA_DIR"); // set but relative → off, never a guess
  const dir = dataDir();
  return dir ? join(dir, "media") : null;
}

/**
 * The media disk cache: `MEDIA_CACHE_DIR`, else `DATA_DIR/cache/media`, else `tmpdir()/store-gen-media`. Pass
 * `useDataDir = false` when `DATA_DIR` failed its boot check (src/lib/media/storage/check.ts): a directory the check
 * refused (another app's, a symlink…) never receives the cache either.
 */
export function mediaCacheDir(useDataDir = true): string {
  const override = absoluteEnv("MEDIA_CACHE_DIR");
  if (override) return override;
  if (useDataDir && dataDir()) return dataPath("cache", null, "media");
  return join(tmpdir(), FALLBACK_MEDIA_CACHE);
}

/** `<media root>/tmp`: the fs backend's temp files (same file system as `v1`, so the rename is atomic); null when off. */
export function mediaTmpDir(): string | null {
  const root = mediaRoot();
  return root ? join(root, MEDIA_TMP) : null;
}

export function isDataArea(area: string): area is DataArea {
  return Object.prototype.hasOwnProperty.call(DATA_AREAS, area);
}

/** Throws unless `segment` is one plain path component. */
function assertSegment(segment: unknown, what: string): asserts segment is string {
  if (typeof segment !== "string" || segment === "" || segment === "." || segment === "..") throw new Error(`storage: bad ${what}`);
  if (segment.length > MAX_SEGMENT || BAD_SEGMENT_CHARS.test(segment) || isAbsolute(segment)) throw new Error(`storage: bad ${what}`);
}

/**
 * The base directory of `area` under explicit roots (pure; the boot check passes the values it is judging): the media
 * area under the media root, every other area under `dataDir`. Null when that root is null.
 */
export function areaBaseUnder(area: DataArea, roots: { dataDir: string | null; mediaRoot: string | null }): string | null {
  const def: DataAreaDef = DATA_AREAS[area];
  const [top, ...rest] = (def.root ?? area).split("/");
  const root = area === "media" ? roots.mediaRoot : roots.dataDir;
  if (!root) return null;
  // the media root already is `DATA_DIR/media` (or MEDIA_DIR, which replaces it): only the rest of `media/v1` follows
  return area === "media" ? join(root, ...rest) : join(root, top!, ...rest);
}

/** The base directory of an area from the environment's roots, or null when its root is not configured. */
export function areaBase(area: DataArea): string | null {
  return areaBaseUnder(area, { dataDir: dataDir(), mediaRoot: mediaRoot() });
}

/** The store's own directory inside an area (media keeps a 2-char shard level above it). */
function storeDir(area: DataArea, base: string, storeId: string): string {
  return area === "media" ? join(base, storeId.slice(0, 2), storeId) : join(base, storeId);
}

/**
 * The absolute path of `segments` inside `area`: a perStore area needs the store id, any other area refuses one
 * (pass null). Throws on an unregistered area, a bad id or segment, or when the area's root is not configured
 * (check `dataDir()` / `mediaRoot()` first where that is a normal state).
 */
export function dataPath(area: DataArea, storeId?: string | null, ...segments: string[]): string {
  if (typeof area !== "string" || !isDataArea(area)) throw new Error("storage: unknown data area");
  const def: DataAreaDef = DATA_AREAS[area];
  if (def.perStore) {
    if (typeof storeId !== "string" || !STORE_DIR_ID_RE.test(storeId)) throw new Error(`storage: ${area} needs a store id`);
  } else if (storeId !== undefined && storeId !== null) {
    throw new Error(`storage: ${area} is not a per-store area`);
  }
  segments.forEach((s, i) => assertSegment(s, `path segment ${i + 1}`));
  const base = areaBase(area);
  if (!base) throw new Error(area === "media" ? "storage: no media root (DATA_DIR / MEDIA_DIR)" : "storage: DATA_DIR is not set");
  return join(def.perStore ? storeDir(area, base, storeId!) : base, ...segments);
}

/** `<media root>/v1/<storeId[0..1]>/<storeId>/<key[0..1]>/<key>` for a media key of src/lib/media/keys.ts. */
export function mediaFilePath(storeId: string, key: string): string {
  if (typeof key !== "string" || !KEY_RE.test(key)) throw new Error("storage: bad media key");
  return dataPath("media", storeId, key.slice(0, 2), key);
}

/**
 * Every per-store directory of `storeId` whose area root is configured (the media one is the shard path), in registry
 * order: the purge walks and deletes each after its table pass (§F.9). Nothing here checks that they exist.
 */
export function perStoreDirs(storeId: string): { area: DataArea; dir: string }[] {
  if (typeof storeId !== "string" || !STORE_DIR_ID_RE.test(storeId)) throw new Error("storage: bad store id");
  const out: { area: DataArea; dir: string }[] = [];
  for (const area of Object.keys(DATA_AREAS) as DataArea[]) {
    if (!DATA_AREAS[area].perStore) continue;
    const base = areaBase(area);
    if (base) out.push({ area, dir: storeDir(area, base, storeId) });
  }
  return out;
}
