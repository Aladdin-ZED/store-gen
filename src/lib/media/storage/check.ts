import "server-only";
/**
 * The media storage boot check (docs/STORE-SAAS.md §G.2, §H.4 step 3; R-D11, D22, rev 3 ENGC-14). It decides whether
 * uploads go to the filesystem (`mediaBackend()` = fs) or stay in the database, and it NEVER stops the app: a refusal
 * logs `[boot] ERROR media storage <code>: …`, keeps media in the database and turns the health tile red.
 *
 *   await runMediaStorageCheck();      // boot step 3 (CCR r1-p8-1); until then mediaBackend() runs it once, lazily
 *   mediaStorageChecked();             // the memoised verdict (the disk cache and the upload path await it)
 *
 * In order, for DATA_DIR (and for MEDIA_DIR when it is set outside DATA_DIR), never writing before the path checks:
 *  1. set and absolute;
 *  2. its path is not inside `process.cwd()` (a deploy replaces the app folder) nor a parent of it, and has no
 *     `public_html` segment (judged on the path first, so nothing is ever created inside the app or a web root);
 *  3. it exists or is created (0700) when its parent exists; it is a directory and not a symbolic link or junction;
 *  4. its real path passes 2 again (a parent link cannot smuggle it into the app);
 *  5. on POSIX it is owned by `process.getuid()` (skipped on win32, where the owner develops);
 *  6. the owner marker `DATA_DIR/.sg-owner` = `{ app: "store-gen", db: <DATABASE_URL's database> }`, when present,
 *     names this app and this database, else the directory is refused before anything is written into it (COD Studio
 *     shares the hosting account: two apps on one DATA_DIR would sweep each other's files, MED-07);
 *  7. the area folders exist (0700, none a link): media/v1, media/tmp, cache/media, exports, imports, receipts, ai,
 *     backups (the media ones under MEDIA_DIR when it is set);
 *  8. a probe file is written, fsynced, renamed and deleted in the media temp folder;
 *  9. the marker is written once (`wx`, 0600, fsynced); a concurrent boot that wrote it first is re-read and judged.
 * No `fs.statfs` (the quota is per account): disk use is the bounded walk's (src/lib/storage/walk.ts).
 *
 * The verdict `{ ok, code, at, variable }` is kept on `globalThis.__sgMediaBackend` (declared in ./index.ts). The
 * check runs once per process; `force` re-runs it (tests, a later console "check again").
 */
import { randomBytes } from "node:crypto";
import { lstat, mkdir, readFile, realpath, rename, unlink } from "node:fs/promises";
import { dirname, isAbsolute, join, normalize, relative, sep } from "node:path";
import { databaseUrl } from "@/lib/db/url";
import { areaBaseUnder, DATA_AREAS, MEDIA_TMP, type DataArea } from "@/lib/storage/paths";
import { fsyncDir, isErrno, writeFileDurable } from "./io";
import type { MediaBackendState, MediaCheckCode, MediaCheckVerdict } from "./types";

/** the owner marker's file name, directly under DATA_DIR */
export const OWNER_MARKER = ".sg-owner";
export const OWNER_APP = "store-gen";
/** a marker larger than this is not ours */
const MARKER_MAX = 4096;
/** a concurrent first boot that lost the `wx` race re-reads the winner's marker this often, this far apart */
const MARKER_RACE_READS = 10;
const MARKER_RACE_WAIT_MS = 20;

export interface MediaCheckInput {
  /** the raw DATA_DIR / MEDIA_DIR values (unset = undefined) */
  dataDir: string | undefined;
  mediaDir?: string | undefined;
  /** the database name the marker binds the directory to; null when DATABASE_URL names none */
  database: string | null;
  cwd: string;
  platform: NodeJS.Platform;
  /** `process.getuid()` on POSIX; null on win32 (the owner check is skipped) */
  uid: number | null;
}

type Variable = "DATA_DIR" | "MEDIA_DIR";
type Refusal = { code: Exclude<MediaCheckCode, "ok">; variable: Variable };

const refuse = (code: Refusal["code"], variable: Variable): Refusal => ({ code, variable });

/** DATABASE_URL's database name (no connection), or null. */
export function databaseNameOf(raw: string | undefined = databaseUrl()): string | null {
  if (!raw) return null;
  try {
    const name = decodeURIComponent(new URL(raw).pathname.replace(/^\//, ""));
    return name && !name.includes("/") ? name : null;
  } catch {
    return null;
  }
}

/** The check's inputs from this process. */
export function mediaCheckInput(): MediaCheckInput {
  return {
    dataDir: process.env.DATA_DIR,
    mediaDir: process.env.MEDIA_DIR,
    database: databaseNameOf(),
    cwd: process.cwd(),
    platform: process.platform,
    uid: process.platform !== "win32" && typeof process.getuid === "function" ? process.getuid() : null,
  };
}

/* ------------------------------------------------------------------ */
/* path rules                                                          */
/* ------------------------------------------------------------------ */

const fold = (p: string, platform: NodeJS.Platform) => (platform === "win32" ? p.toLowerCase() : p);

/** `child` is `parent` or lies below it. */
function within(parent: string, child: string, platform: NodeJS.Platform): boolean {
  const r = relative(fold(parent, platform), fold(child, platform));
  return r === "" || (!r.startsWith("..") && !isAbsolute(r));
}

/** Step 2 on one spelling of the path: inside the app, a parent of the app, or under a web root. */
function placeRefusal(dir: string, cwds: readonly string[], variable: Variable, platform: NodeJS.Platform): Refusal | null {
  for (const cwd of cwds) if (within(cwd, dir, platform) || within(dir, cwd, platform)) return refuse("inside_app", variable);
  if (dir.split(/[\\/]+/).some((seg) => fold(seg, platform) === "public_html")) return refuse("public_html", variable);
  return null;
}

/** Steps 2 to 5 for one root; creates it (0700) when only it is missing. */
async function rootRefusal(dir: string, variable: Variable, input: MediaCheckInput): Promise<Refusal | null> {
  const realCwd = await realpath(/* turbopackIgnore: true */ input.cwd).catch(() => input.cwd);
  const cwds = realCwd === input.cwd ? [input.cwd] : [input.cwd, realCwd];
  const lexical = placeRefusal(dir, cwds, variable, input.platform);
  if (lexical) return lexical;

  let st = await lstat(/* turbopackIgnore: true */ dir).catch((err: unknown) => (isErrno(err, "ENOENT") ? null : Promise.reject(err)));
  if (!st) {
    // only the last segment may be created: a typo higher up never becomes a new tree
    const parent = await lstat(/* turbopackIgnore: true */ dirname(dir)).catch(() => null);
    if (!parent?.isDirectory()) return refuse("missing", variable);
    try {
      await mkdir(/* turbopackIgnore: true */ dir, { mode: 0o700 });
    } catch (err) {
      if (!isErrno(err, "EEXIST")) return refuse("not_writable", variable);
    }
    st = await lstat(/* turbopackIgnore: true */ dir);
  }
  if (st.isSymbolicLink()) return refuse("symlink", variable);
  if (!st.isDirectory()) return refuse("not_dir", variable);

  const real = await realpath(/* turbopackIgnore: true */ dir);
  const resolved = placeRefusal(real, cwds, variable, input.platform);
  if (resolved) return resolved;
  if (input.platform !== "win32" && input.uid !== null && st.uid !== input.uid) return refuse("owner", variable);
  return null;
}

/* ------------------------------------------------------------------ */
/* owner marker                                                        */
/* ------------------------------------------------------------------ */

type Marker = { app: string; db: string };

/** The marker on disk: null when absent, "unreadable" when it is not the marker's JSON (or a link). */
async function readMarker(root: string): Promise<Marker | null | "unreadable"> {
  const path = join(root, OWNER_MARKER);
  const st = await lstat(/* turbopackIgnore: true */ path).catch((err: unknown) => (isErrno(err, "ENOENT") ? null : Promise.reject(err)));
  if (!st) return null;
  if (!st.isFile() || st.size > MARKER_MAX) return "unreadable";
  try {
    const value: unknown = JSON.parse(await readFile(/* turbopackIgnore: true */ path, "utf8"));
    const m = value as Partial<Marker> | null;
    return m && typeof m === "object" && typeof m.app === "string" && typeof m.db === "string" ? { app: m.app, db: m.db } : "unreadable";
  } catch {
    return "unreadable";
  }
}

const markerRefusal = (m: Marker | "unreadable", database: string): Refusal | null =>
  m === "unreadable" ? refuse("marker_unreadable", "DATA_DIR") : m.app !== OWNER_APP || m.db !== database ? refuse("owner_mismatch", "DATA_DIR") : null;

/** Writes the marker once; a marker another process wrote first is read back and judged. */
async function writeMarker(root: string, database: string): Promise<Refusal | null> {
  const body = Buffer.from(`${JSON.stringify({ app: OWNER_APP, db: database })}\n`);
  try {
    await writeFileDurable(join(root, OWNER_MARKER), body, 0o600);
    await fsyncDir(root);
    return null;
  } catch (err) {
    if (!isErrno(err, "EEXIST")) return refuse("not_writable", "DATA_DIR");
    // the winner created the file (wx) and may still be writing it: read again for a moment before judging
    let m = await readMarker(root);
    for (let i = 0; i < MARKER_RACE_READS && m === "unreadable"; i++) {
      await new Promise((resolve) => setTimeout(resolve, MARKER_RACE_WAIT_MS));
      m = await readMarker(root);
    }
    return m === null ? refuse("marker_unreadable", "DATA_DIR") : markerRefusal(m, database);
  }
}

/* ------------------------------------------------------------------ */
/* folders and probe                                                   */
/* ------------------------------------------------------------------ */

/**
 * Step 7: the area folders under their roots (the media ones under the media root), each a real folder up to the
 * root that was judged by steps 2 to 5 (`mediaTop`: MEDIA_DIR when it lies outside DATA_DIR, else DATA_DIR).
 */
async function foldersRefusal(root: string, media: string, mediaVar: Variable, mediaTop: string): Promise<Refusal | null> {
  const roots = { dataDir: root, mediaRoot: media };
  const wanted: { dir: string; variable: Variable }[] = [
    { dir: areaBaseUnder("media", roots)!, variable: mediaVar },
    { dir: join(media, MEDIA_TMP), variable: mediaVar },
    { dir: join(areaBaseUnder("cache", roots)!, "media"), variable: "DATA_DIR" },
  ];
  for (const area of Object.keys(DATA_AREAS) as DataArea[]) {
    if (area === "media" || area === "cache") continue;
    wanted.push({ dir: areaBaseUnder(area, roots)!, variable: "DATA_DIR" });
  }
  for (const { dir, variable } of wanted) {
    try {
      await mkdir(/* turbopackIgnore: true */ dir, { recursive: true, mode: 0o700 });
    } catch {
      return refuse("not_writable", variable);
    }
    // the folder and every folder between it and its root must be real folders (a planted link redirects writes)
    const top = variable === "MEDIA_DIR" ? mediaTop : root;
    for (let p = dir; p.length > top.length; p = dirname(p)) {
      const st = await lstat(/* turbopackIgnore: true */ p).catch(() => null);
      if (!st) return refuse("not_writable", variable);
      if (st.isSymbolicLink()) return refuse("symlink", variable);
      if (!st.isDirectory()) return refuse("not_dir", variable);
      if (dirname(p) === p) break;
    }
  }
  return null;
}

/** Step 8: write, fsync, rename, fsync the folder, delete. */
async function probeRefusal(dir: string, variable: Variable): Promise<Refusal | null> {
  const a = join(dir, `.probe-${process.pid}-${randomBytes(6).toString("hex")}`);
  const b = `${a}.renamed`;
  try {
    await writeFileDurable(a, Buffer.from("store-gen media probe\n"), 0o600);
    await rename(/* turbopackIgnore: true */ a, b);
    await fsyncDir(dir);
    await unlink(/* turbopackIgnore: true */ b);
    return null;
  } catch (err) {
    await unlink(/* turbopackIgnore: true */ a).catch(() => undefined);
    await unlink(/* turbopackIgnore: true */ b).catch(() => undefined);
    return refuse(isErrno(err, "EACCES", "EPERM", "EROFS", "ENOSPC", "EDQUOT") ? "not_writable" : "probe", variable);
  }
}

/* ------------------------------------------------------------------ */
/* the check                                                           */
/* ------------------------------------------------------------------ */

/** The whole check against explicit inputs (tests pass theirs). Never throws; writes only after steps 1 to 6 pass. */
export async function checkMediaStorage(input: MediaCheckInput): Promise<MediaCheckVerdict> {
  const at = new Date().toISOString();
  const verdict = (r: Refusal | null): MediaCheckVerdict => (r ? { ok: false, code: r.code, at, variable: r.variable } : { ok: true, code: "ok", at, variable: null });
  try {
    const raw = input.dataDir?.trim();
    if (!raw) return verdict(refuse("unset", "DATA_DIR"));
    if (!isAbsolute(raw)) return verdict(refuse("relative", "DATA_DIR"));
    const root = stripSep(normalize(raw));
    const r1 = await rootRefusal(root, "DATA_DIR", input);
    if (r1) return verdict(r1);

    // MEDIA_DIR replaces DATA_DIR/media; outside DATA_DIR it is judged as a root of its own
    let media = join(root, "media");
    let mediaVar: Variable = "DATA_DIR";
    let mediaTop = root;
    const mediaRaw = input.mediaDir?.trim();
    if (mediaRaw) {
      if (!isAbsolute(mediaRaw)) return verdict(refuse("relative", "MEDIA_DIR"));
      media = stripSep(normalize(mediaRaw));
      mediaVar = "MEDIA_DIR";
      if (!within(root, media, input.platform)) {
        const r2 = await rootRefusal(media, "MEDIA_DIR", input);
        if (r2) return verdict(r2);
        mediaTop = media;
      }
    }

    if (!input.database) return verdict(refuse("no_database", "DATA_DIR"));
    const marker = await readMarker(root);
    if (marker !== null) {
      const r = markerRefusal(marker, input.database);
      if (r) return verdict(r);
    }
    const r3 = (await foldersRefusal(root, media, mediaVar, mediaTop)) ?? (await probeRefusal(join(media, MEDIA_TMP), mediaVar));
    if (r3) return verdict(r3);
    return verdict(marker === null ? await writeMarker(root, input.database) : null);
  } catch (err) {
    // a bad value the fs layer rejects outright (a NUL byte…) or anything unforeseen: refused, never thrown
    return verdict(refuse(isErrno(err, "EACCES", "EPERM") ? "not_writable" : "error", "DATA_DIR"));
  }
}

const stripSep = (p: string) => (p.length > 1 && (p.endsWith(sep) || p.endsWith("/")) && !/^[A-Za-z]:[\\/]$/.test(p) ? p.slice(0, -1) : p);

const HINTS: Record<Exclude<MediaCheckCode, "ok" | "unset">, string> = {
  relative: "must be an absolute path",
  inside_app: "is inside the app folder (or contains it), which a deploy replaces",
  public_html: "is under public_html, where the web server could serve it",
  missing: "does not exist and neither does its parent folder",
  not_dir: "is a file, not a folder",
  symlink: "is (or holds) a symbolic link",
  owner: "is owned by another user",
  not_writable: "is not writable (a folder or the owner marker could not be created)",
  probe: "failed the write / fsync / rename / delete probe",
  no_database: "cannot be bound to a database: DATABASE_URL names none",
  owner_mismatch: `holds a ${OWNER_MARKER} marker of another app or database`,
  marker_unreadable: `holds a ${OWNER_MARKER} file that is not this app's marker`,
  error: "could not be checked",
};

function logVerdict(v: MediaCheckVerdict): void {
  if (v.ok) {
    console.info("[boot] media storage: filesystem (DATA_DIR checked, owner marker in place).");
    return;
  }
  // unset outside production: the boot config line already says media stays in the database (src/lib/db/boot-config.ts)
  if (v.code === "unset" && process.env.NODE_ENV !== "production") return;
  const why = v.code === "unset" || v.code === "ok" ? "DATA_DIR is not set" : `${v.variable} ${HINTS[v.code]}`;
  console.error(`[boot] ERROR media storage ${v.code}: ${why}; media stays in the database.`);
}

function backendState(): MediaBackendState {
  globalThis.__sgMediaBackend ??= { verdict: null, running: null };
  return globalThis.__sgMediaBackend;
}

/**
 * Runs the check once per process (concurrent callers share the run), stores the verdict and logs it. Never rejects.
 * `force` runs it again whatever is stored.
 */
export function runMediaStorageCheck(opts: { force?: boolean } = {}): Promise<MediaCheckVerdict> {
  const s = backendState();
  if (!opts.force) {
    if (s.verdict) return Promise.resolve(s.verdict);
    if (s.running) return s.running;
  }
  const run: Promise<MediaCheckVerdict> = (async () => {
    let v: MediaCheckVerdict;
    try {
      v = await checkMediaStorage(mediaCheckInput());
    } catch {
      v = { ok: false, code: "error", at: new Date().toISOString(), variable: "DATA_DIR" };
    }
    s.verdict = v;
    try {
      logVerdict(v);
    } catch {
      // logging never decides anything
    }
    return v;
  })().finally(() => {
    if (s.running === run) s.running = null;
  });
  s.running = run;
  return run;
}

/** The memoised verdict: the stored one, else the run in flight, else a first run. */
export function mediaStorageChecked(): Promise<MediaCheckVerdict> {
  return runMediaStorageCheck();
}

/** The stored verdict without running anything (null before the first check finished). */
export function mediaStorageVerdict(): MediaCheckVerdict | null {
  return globalThis.__sgMediaBackend?.verdict ?? null;
}
