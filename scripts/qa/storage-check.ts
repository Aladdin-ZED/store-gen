/**
 * The media storage driver against a real MariaDB and a temp DATA_DIR (docs/STORE-SAAS.md §G.1, §G.2, §J.2
 * `test:storage`; R1 P8). Exit code 1 on failure.
 *
 *   npm run test:storage [-- --db cod_test_p8_storage] [--keep]
 *
 * Creates a throwaway database on XAMPP's MariaDB (root, no password, 127.0.0.1:3306; the name must be cod_test_*,
 * never cod_studio or cod_storegen), migrates it with the app's migrator, seeds two stores (A and B), and points
 * DATA_DIR at a fresh folder under os.tmpdir(). Both are removed at the end (unless --keep). Nothing is read from
 * the .env files.
 *
 * Sections (P8 step 2; later steps add theirs under their own names: media, storage-jobs, export, backups, purge):
 *  - boot check: refusals      unset, relative, inside the app (or a parent of it), public_html, a symlink (and a
 *                              planted link inside), missing parent, a file, not writable, no database, POSIX owner
 *  - boot check: owner marker  written once (O_EXCL), a db X marker refuses db Y, another app's marker, a garbage
 *                              one, concurrent first boots, MEDIA_DIR inside and outside DATA_DIR (ENGC-14)
 *  - boot check: verdict       the verdict on globalThis.__sgMediaBackend, mediaBackend() fs / db, memoised runs,
 *                              a check that never throws, storageFor follows the row
 *  - fs: durable put           layout, modes, read-back, ranges, refusals, head
 *  - fs: idempotent put        the same sha resolves at once, another sha replaces atomically, parallel puts
 *  - fs: crash before the row  a crash between files and DB row → an immediate retry succeeds (ENGC-20)
 *  - fs: remove                idempotent, prunes the folders it emptied, never another store's
 *  - store: fs rows            the chunk store's front (meta, LRU, ranges) serves fs rows; a missing or changed file
 *                              is a 404 counted in the error ring, never served
 *  - db backend                the chunk store wrapped unchanged; remove keeps a db row's chunks; the migrator's
 *                              flip is followed by readers that cached the old row
 *  - disk cache                the large-file cache lives in DATA_DIR/cache/media once DATA_DIR passed its check
 *  - usage                     the fs backend reads the last walk snapshot; the db backend measures its table
 *  - runner (P8 step 3)        the tick lease on the real cron_cursors row: two concurrent ticks → one skipped, an
 *                              expired lease taken over, a lost seed row re-seeded, the lease cleared after each tick;
 *                              job_runs rows (run, per store through forEachStore, tick, skipped); the due state merged
 *                              into a job's own state; the legacy Sheets shim (a fake syncStores); runTick() itself with
 *                              the registered housekeeping (an abandoned lead > 30 days purged, a fresh one kept)
 *  - forEachStore (P8 step 3)  the round robin over the real stores table (cursor row, wrap, budget stop, a throwing
 *                              store counted in the error ring and skipped), the refined pending_renders /
 *                              pending_outbox predicates (pending and due, or running past its lease; store rows only),
 *                              "tick" refused
 *  - outbox (P8 step 4)        enqueue twice → duplicates 1 (and reportDuplicates in the ring), a rolled-back
 *                              transaction takes its items with it, impersonation / platform scopes and bad items
 *                              refused; a pii payload stored sealed (no canary in the row) and opened for the handler;
 *                              20 parallel drains never deliver one item twice; an expired lease is re-claimed, a live
 *                              one is not; a dead transition counted (dead_<kind>); the capi_enabled kill switch pauses
 *                              capi only; mail's per-minute cap reschedules (platform items); replay: B's scope on A's
 *                              row → not_found and A's row unchanged, impersonation refused, a done capi row refused, a
 *                              done telegram row re-sent, a second click a no-op, the audit rows; outboxSummary(B) shows
 *                              nothing of A and never a payload; the platform summary; runTick() runs the outbox in slot 3
 */
import Module from "node:module";
import { randomBytes, createHash } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

// the modules under test are marked `import "server-only"`; outside Next that import throws
{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = require.resolve("drizzle-orm"); // any resolvable module: server-only exports nothing used
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    return req === "server-only" ? stub : orig.call(this, req, ...rest);
  };
}

/* ---------------- the throwaway database: cod_test_* only ---------------- */
const flag = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const dbName = flag("db") ?? "cod_test_p8_storage";
const KEEP = process.argv.includes("--keep");
if (!/^cod_test_[a-z0-9_]{1,48}$/.test(dbName) || dbName === "cod_studio" || dbName === "cod_storegen") {
  console.error(`✗ refusing to run on database "${dbName}": use a throwaway cod_test_* name`);
  process.exit(1);
}
const DB_SERVER = "mysql://root@127.0.0.1:3306";
const ROOT = mkdtempSync(join(tmpdir(), "sg-storage-"));
const DATA = join(ROOT, "data");
{
  // this process's platform: a temp DATA_DIR and the throwaway database, never the owner's environment
  const env = process.env as Record<string, string | undefined>;
  for (const k of ["MEDIA_DIR", "MEDIA_CACHE_DIR", "DATA_DIR_BUDGET_BYTES", "PUBLIC_URL", "STORE_ROOT_DOMAIN", "EDGE_KEY"]) delete env[k];
  env.DATABASE_URL = `${DB_SERVER}/${dbName}`;
  env.DATA_DIR = DATA;
  // the envelopes of the outbox's pii payloads (§F.3): a throwaway key, never the owner's
  env.APP_SECRET = randomBytes(32).toString("hex");
  env.PLATFORM_URL = "http://localhost:3451";
}

async function rootQuery(q: string): Promise<void> {
  const mysql = (await import("mysql2/promise")).default;
  const conn = await mysql.createConnection({ uri: DB_SERVER, charset: "utf8mb4_unicode_ci" });
  try {
    await conn.query(q);
  } finally {
    await conn.end();
  }
}

const STORE_A = "01JB8ZK3Q4R5S6T7V8W9XYZ0AA";
const STORE_B = "01JB8ZK3Q4R5S6T7V8W9XYZ0BB";
const POSIX = process.platform !== "win32";
const ROOT_USER = POSIX && typeof process.getuid === "function" && process.getuid() === 0;

const hex = (n: number) => randomBytes(n).toString("hex");
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const newKey = (variant = "640.webp") => `${hex(16)}-${variant}`;
const mode = (p: string) => statSync(p).mode & 0o777;

async function streamBytes(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const parts: Buffer[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(Buffer.from(value));
  }
  return Buffer.concat(parts);
}

/** A junction on Windows (no privilege needed), a directory symlink elsewhere; false when neither can be made. */
function linkDir(target: string, link: string): boolean {
  try {
    symlinkSync(target, link, process.platform === "win32" ? "junction" : "dir");
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<number> {
  await rootQuery(`DROP DATABASE IF EXISTS \`${dbName}\``);
  await rootQuery(`CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  const { runMigrations } = await import("@/lib/db/migrate");
  await runMigrations();
  const { db, pool } = await import("@/lib/db/client");
  const { stores } = await import("@/lib/db/schema");
  const { systemCtx, systemScope } = await import("@/lib/jobs/scope");
  const { Harness } = await import("@/lib/jobs/testing/harness");
  const C = await import("@/lib/media/storage/check");
  const S = await import("@/lib/media/storage");
  const store = await import("@/lib/media/store");
  const files = await import("@/lib/media/files");
  const P = await import("@/lib/storage/paths");
  const E = await import("@/lib/jobs/errors");
  const { fsStorage, dbStorage } = S;

  for (const [id, handle] of [
    [STORE_A, "storage-a"],
    [STORE_B, "storage-b"],
  ] as const) {
    await db.insert(stores).values({ id, handle, name: handle, status: "active", brandSeed: "0123456789abcdef" });
  }
  const ctx = systemCtx("qa.storage");
  const scopeA = systemScope(ctx, STORE_A);

  const h = new Harness("test:storage");
  const DB_X = dbName;
  const DB_Y = `${dbName}_other`;
  const base = (dataDir: string | undefined, over: Partial<import("@/lib/media/storage/check").MediaCheckInput> = {}) => ({
    dataDir,
    mediaDir: undefined,
    database: DB_X,
    cwd: process.cwd(),
    platform: process.platform,
    uid: POSIX && typeof process.getuid === "function" ? process.getuid() : null,
    ...over,
  });
  const check = (dataDir: string | undefined, over: Partial<import("@/lib/media/storage/check").MediaCheckInput> = {}) => C.checkMediaStorage(base(dataDir, over));
  const fresh = (name: string) => join(ROOT, `${name}-${hex(3)}`);
  const tmpEntries = () => readdirSync(P.mediaTmpDir()!);
  const fileOf = (storeId: string, data: Buffer, key = newKey()) => ({ storeId, key, assetId: key.split("-")[0]!, mime: "image/webp", bytes: data.length, sha256: sha(data) });
  const insertRow = async (f: ReturnType<typeof fileOf>, storage: "db" | "fs") => {
    await pool().query("INSERT INTO media_files (`key`, store_id, asset_id, mime, bytes, chunks, sha256, storage) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [
      f.key,
      f.storeId,
      f.assetId,
      f.mime,
      f.bytes,
      Math.max(1, Math.ceil(f.bytes / store.CHUNK_SIZE)),
      f.sha256,
      storage,
    ]);
    files.forgetMisses([f.key]);
  };
  const chunkCount = async (key: string) => {
    const [rows] = (await pool().query("SELECT COUNT(*) AS n FROM media_chunks WHERE `key` = ?", [key])) as unknown as [{ n: number }[]];
    return Number(rows[0]?.n ?? 0);
  };

  /* ================================================================ */
  h.section("boot check: refusals", async (t) => {
    const code = async (dataDir: string | undefined, over: Parameters<typeof check>[1] = {}) => (await check(dataDir, over)).code;
    t.eq("unset", await code(undefined), "unset");
    t.eq("blank", await code("   "), "unset");
    t.eq("relative", await code("storegen-data"), "relative");
    const inside = join(process.cwd(), "qa", `sg-inside-${hex(3)}`);
    t.eq("inside the app folder", await code(inside), "inside_app");
    t.check("…and nothing was created there", !existsSync(inside));
    const parent = dirname(process.cwd());
    t.eq("a parent of the app folder (it would hold every site)", await code(parent), "inside_app");
    t.check("…and no marker was written there", !existsSync(join(parent, C.OWNER_MARKER)));
    const web = join(ROOT, "public_html", "data");
    t.eq("under public_html", await code(web), "public_html");
    t.check("…and nothing was created there", !existsSync(join(ROOT, "public_html")));
    const real = fresh("real");
    mkdirSync(real);
    const link = fresh("link");
    if (linkDir(real, link)) {
      t.eq("a symbolic link (a junction on Windows)", await code(link), "symlink");
      t.check("…nothing written through it", readdirSync(real).length === 0);
    } else t.check("a symbolic link could be made for the case", false);
    const planted = fresh("planted");
    mkdirSync(planted);
    const elsewhere = fresh("elsewhere");
    mkdirSync(elsewhere);
    if (linkDir(elsewhere, join(planted, "exports"))) {
      const v = await check(planted);
      t.eq("a planted link as an area folder", [v.code, v.variable], ["symlink", "DATA_DIR"]);
    }
    t.eq("missing, and so is its parent", await code(join(ROOT, `no-parent-${hex(3)}`, "data")), "missing");
    const created = fresh("created");
    t.eq("missing with an existing parent: created", await code(created), "ok");
    t.check("…as a folder", existsSync(created) && lstatSync(created).isDirectory());
    const afile = fresh("afile");
    writeFileSync(afile, "x");
    t.eq("a file", await code(afile), "not_dir");
    const blocked = fresh("blocked");
    mkdirSync(blocked);
    writeFileSync(join(blocked, "media"), "a file where media/ belongs");
    t.eq("not writable: a folder cannot be created", await code(blocked), "not_writable");
    if (POSIX && !ROOT_USER) {
      const ro = fresh("readonly");
      mkdirSync(ro);
      chmodSync(ro, 0o500);
      t.eq("not writable: a read-only folder (POSIX)", await code(ro), "not_writable");
      chmodSync(ro, 0o700);
    }
    t.eq("no database name", await code(fresh("nodb"), { database: null }), "no_database");
    t.eq("POSIX: owned by another user", await code(fresh("owner"), { platform: "linux", uid: 4_000_000 }), "owner");
    t.eq("win32: the owner check is skipped", await code(fresh("owner-win"), { platform: "win32", uid: 4_000_000 }), "ok");
    t.eq("a NUL byte never throws", await code(join(ROOT, "bad\0name")), "error");
  });

  /* ================================================================ */
  h.section("boot check: owner marker", async (t) => {
    const dir = fresh("marker");
    const v1 = await check(dir);
    t.eq("first boot: ok", [v1.ok, v1.code, v1.variable], [true, "ok", null]);
    t.check("…the verdict carries its time", !Number.isNaN(Date.parse(v1.at)));
    const marker = join(dir, C.OWNER_MARKER);
    t.eq("the marker names the app and the database", JSON.parse(readFileSync(marker, "utf8")), { app: "store-gen", db: DB_X });
    const areas = ["media/v1", "media/tmp", "cache/media", "exports", "imports", "receipts", "ai", "backups"];
    t.check("the area folders exist", areas.every((a) => lstatSync(join(dir, ...a.split("/"))).isDirectory()));
    t.eq("the probe left nothing behind", readdirSync(join(dir, "media", "tmp")), []);
    if (POSIX) {
      t.check("folders 0700, marker 0600", areas.every((a) => mode(join(dir, ...a.split("/"))) === 0o700) && mode(marker) === 0o600);
    }
    const before = statSync(marker);
    const text = readFileSync(marker, "utf8");
    const v2 = await check(dir);
    const after = statSync(marker);
    t.check("second boot: ok", v2.ok);
    t.check("the marker is written only once (same file, same time, same text)", after.ino === before.ino && after.mtimeMs === before.mtimeMs && readFileSync(marker, "utf8") === text);
    const v3 = await check(dir, { database: DB_Y });
    t.eq(".sg-owner written for db X, checked for db Y → refused", [v3.ok, v3.code, v3.variable], [false, "owner_mismatch", "DATA_DIR"]);
    t.eq("…and the marker still names X", JSON.parse(readFileSync(marker, "utf8")).db, DB_X);

    const foreign = fresh("foreign");
    mkdirSync(foreign);
    writeFileSync(join(foreign, C.OWNER_MARKER), JSON.stringify({ app: "cod-studio", db: DB_X }));
    t.eq("another app's marker → refused", (await check(foreign)).code, "owner_mismatch");
    t.check("…before anything was written into its folder", readdirSync(foreign).length === 1);
    const garbage = fresh("garbage");
    mkdirSync(garbage);
    writeFileSync(join(garbage, C.OWNER_MARKER), "not json");
    t.eq("a garbage marker → refused", (await check(garbage)).code, "marker_unreadable");
    const big = fresh("bigmarker");
    mkdirSync(big);
    writeFileSync(join(big, C.OWNER_MARKER), JSON.stringify({ app: "store-gen", db: DB_X, pad: "x".repeat(5000) }));
    t.eq("an oversized marker → refused", (await check(big)).code, "marker_unreadable");

    const race = fresh("race");
    mkdirSync(race);
    const both = await Promise.all([check(race), check(race), check(race)]);
    t.check("three concurrent first boots: all ok, one marker", both.every((v) => v.ok) && JSON.parse(readFileSync(join(race, C.OWNER_MARKER), "utf8")).db === DB_X);
    const raceY = fresh("race-y");
    mkdirSync(raceY);
    const mixed = await Promise.all([check(raceY), check(raceY, { database: DB_Y })]);
    t.check("concurrent boots of two databases: exactly one owns the folder", mixed.filter((v) => v.ok).length === 1 && mixed.some((v) => v.code === "owner_mismatch"));

    const dm = fresh("mediadir");
    const md = fresh("media-outside");
    const vm = await check(dm, { mediaDir: md });
    t.check("MEDIA_DIR outside DATA_DIR: its v1 and tmp are created there", vm.ok && lstatSync(join(md, "v1")).isDirectory() && lstatSync(join(md, "tmp")).isDirectory());
    t.check("…and DATA_DIR gets no media folder", !existsSync(join(dm, "media")));
    t.eq("MEDIA_DIR relative → refused", [(await check(fresh("md-rel"), { mediaDir: "media" })).code, (await check(fresh("md-rel2"), { mediaDir: "media" })).variable], ["relative", "MEDIA_DIR"]);
    const mw = await check(fresh("md-web"), { mediaDir: join(ROOT, "public_html", "m") });
    t.eq("MEDIA_DIR under public_html → refused", [mw.code, mw.variable], ["public_html", "MEDIA_DIR"]);
    const di = fresh("md-inside");
    const vi = await check(di, { mediaDir: join(di, "m") });
    t.check("MEDIA_DIR inside DATA_DIR: judged with it", vi.ok && lstatSync(join(di, "m", "v1")).isDirectory());
  });

  /* ================================================================ */
  h.section("boot check: verdict", async (t) => {
    // read through a function: after the reset below, TypeScript would narrow the global to undefined for good
    const backend = (): import("@/lib/media/storage").MediaBackendState | undefined => globalThis.__sgMediaBackend;
    globalThis.__sgMediaBackend = undefined;
    t.eq("no verdict yet: mediaBackend() is db", S.mediaBackend().kind, "db");
    t.check("…and it started the check once", backend()?.running instanceof Promise);
    t.eq("mediaBackendReady() waits for it: fs", (await S.mediaBackendReady()).kind, "fs");
    const v = backend()?.verdict;
    t.eq("the verdict on globalThis.__sgMediaBackend", v && { ok: v.ok, code: v.code, variable: v.variable }, { ok: true, code: "ok", variable: null });
    t.eq("mediaBackend() is fs once the check passed", S.mediaBackend().kind, "fs");
    t.check("the marker of the run names the test database", JSON.parse(readFileSync(join(DATA, C.OWNER_MARKER), "utf8")).db === DB_X);
    t.check("a stored verdict is returned as is (memoised)", (await S.runMediaStorageCheck()) === v && (await S.mediaStorageChecked()) === v);
    globalThis.__sgMediaBackend = undefined;
    const p1 = S.runMediaStorageCheck();
    const p2 = S.runMediaStorageCheck();
    t.check("concurrent first runs share one run", p1 === p2);
    await p1;

    const env = process.env as Record<string, string | undefined>;
    const notADir = join(ROOT, `not-a-dir-${hex(3)}`);
    writeFileSync(notADir, "x");
    for (const bad of [join(ROOT, "public_html", "x"), notADir, "relative/dir"]) {
      env.DATA_DIR = bad;
      let threw = false;
      const r = await S.runMediaStorageCheck({ force: true }).catch(() => ((threw = true), null));
      t.check(`a refused DATA_DIR never throws, media falls back to the database (${r?.code})`, !threw && r?.ok === false && S.mediaBackend().kind === "db");
    }
    env.DATA_DIR = DATA;
    t.eq("restored: fs again", [(await S.runMediaStorageCheck({ force: true })).ok, S.mediaBackend().kind], [true, "fs"]);
    t.eq("storageFor follows the row: fs", S.storageFor({ storage: "fs" }).kind, "fs");
    t.eq("storageFor follows the row: db", S.storageFor({ storage: "db" }).kind, "db");
    t.eq("the verdict reader", S.mediaStorageVerdict()?.ok, true);
  });

  /* ================================================================ */
  h.section("fs: durable put", async (t) => {
    const data = randomBytes(300 * 1024);
    const f = fileOf(STORE_A, data);
    await fsStorage.put(f, data);
    const path = P.mediaFilePath(STORE_A, f.key);
    t.check("the file is at DATA_DIR/media/v1/<id[0..1]>/<id>/<key[0..1]>/<key>", path === join(DATA, "media", "v1", STORE_A.slice(0, 2), STORE_A, f.key.slice(0, 2), f.key) && readFileSync(path).equals(data));
    t.eq("no temp file is left", tmpEntries(), []);
    if (POSIX) t.check("file 0600, folders 0700", mode(path) === 0o600 && mode(dirname(path)) === 0o700 && mode(dirname(dirname(path))) === 0o700);
    const meta = { ...f, storage: "fs" as const };
    t.check("readAll: the same bytes", (await fsStorage.readAll(meta)).equals(data));
    t.check("readRange: a slice", (await streamBytes(await fsStorage.readRange(meta, 100, 70_099))).equals(data.subarray(100, 70_100)));
    t.check("readRange: one byte", (await streamBytes(await fsStorage.readRange(meta, 1000, 1000))).equals(data.subarray(1000, 1001)));
    t.check("readRange: the last byte", (await streamBytes(await fsStorage.readRange(meta, data.length - 1, data.length - 1))).equals(data.subarray(data.length - 1)));
    t.check("readRange: the whole file", (await streamBytes(await fsStorage.readRange(meta, 0, data.length - 1))).equals(data));
    for (const [a, b] of [
      [10, 5],
      [0, data.length],
      [-1, 3],
      [1.5, 3],
    ] as const) {
      await t.rejects(`readRange ${a}-${b} → RangeError`, () => fsStorage.readRange(meta, a, b), /bad byte range/);
    }
    const other = randomBytes(1024);
    const wrongSha = fileOf(STORE_A, other);
    await t.rejects("put: a sha256 that is not the data's", () => fsStorage.put({ ...wrongSha, sha256: sha(data) }, other), /sha256/);
    await t.rejects("put: a length that is not the data's", () => fsStorage.put({ ...wrongSha, bytes: other.length + 1 }, other), /bytes/);
    t.check("…and neither wrote a file", !existsSync(P.mediaFilePath(STORE_A, wrongSha.key)));
    await t.rejects("put: a key outside keys.ts", () => fsStorage.put({ ...wrongSha, key: "../../escape-640.webp" }, other), /bad media key/);
    await t.rejects("put: a store id that is not a ULID", () => fsStorage.put({ ...wrongSha, storeId: "../A" }, other), /store id/);
    t.eq("head before the row: null", await fsStorage.head(f.key), null);
    await insertRow(f, "fs");
    t.eq("head after the row: the fs file", await fsStorage.head(f.key), meta);
    t.eq("the db backend's head of an fs row: null", await dbStorage.head(f.key), null);
  });

  /* ================================================================ */
  h.section("fs: idempotent put", async (t) => {
    const data = randomBytes(64 * 1024);
    const f = fileOf(STORE_A, data);
    await fsStorage.put(f, data);
    const path = P.mediaFilePath(STORE_A, f.key);
    const st = statSync(path);
    await new Promise((r) => setTimeout(r, 20));
    await fsStorage.put(f, data);
    const st2 = statSync(path);
    t.check("the same sha256 resolves at once: the file is not rewritten", st2.ino === st.ino && st2.mtimeMs === st.mtimeMs);
    t.eq("…and no temp file was left", tmpEntries(), []);
    const next = randomBytes(64 * 1024);
    await fsStorage.put({ ...f, sha256: sha(next) }, next);
    t.check("another sha256 for the key is replaced (temp + rename)", readFileSync(path).equals(next));
    t.eq("…and no temp file was left", tmpEntries(), []);
    const g = fileOf(STORE_A, randomBytes(128 * 1024));
    const gData = randomBytes(128 * 1024);
    const gFile = { ...g, sha256: sha(gData), bytes: gData.length };
    const parallel = await Promise.allSettled(Array.from({ length: 6 }, () => fsStorage.put(gFile, gData)));
    t.check("six parallel puts of one file all resolve", parallel.every((p) => p.status === "fulfilled"), JSON.stringify(parallel.filter((p) => p.status === "rejected").map((p) => String((p as PromiseRejectedResult).reason))));
    t.check("…to the right bytes, no temp file left", readFileSync(P.mediaFilePath(STORE_A, gFile.key)).equals(gData) && tmpEntries().length === 0);
  });

  /* ================================================================ */
  h.section("fs: crash before the row", async (t) => {
    // the upload wrote its files (step 5), then the process died before the DB transaction inserted the rows
    const data = randomBytes(200 * 1024);
    const f = fileOf(STORE_A, data);
    await fsStorage.put(f, data);
    writeFileSync(join(P.mediaTmpDir()!, hex(16)), randomBytes(1000)); // a killed write's temp file (the sweeper's, §G.3)
    const st = statSync(P.mediaFilePath(STORE_A, f.key));
    const t0 = performance.now();
    let retried = true;
    await fsStorage.put(f, data).catch(() => (retried = false));
    const ms = performance.now() - t0;
    t.check("crash between files and DB row → an immediate retry succeeds (ENGC-20)", retried, `${ms.toFixed(1)} ms`);
    t.check("…without rewriting the file", statSync(P.mediaFilePath(STORE_A, f.key)).mtimeMs === st.mtimeMs);
    await insertRow(f, "fs");
    t.check("…and the retried upload's row serves the bytes", (await store.getMediaFile(f.key))?.data.equals(data) === true);
    for (const name of tmpEntries()) rmSync(join(P.mediaTmpDir()!, name));
  });

  /* ================================================================ */
  h.section("fs: remove", async (t) => {
    const a1 = randomBytes(4096);
    const fa1 = fileOf(STORE_B, a1, `aa${hex(15)}-640.webp`);
    const a2 = randomBytes(4096);
    const fa2 = fileOf(STORE_B, a2, `bb${hex(15)}-640.webp`);
    const sameBytesA = fileOf(STORE_A, a1, `aa${hex(15)}-960.webp`);
    await fsStorage.put(fa1, a1);
    await fsStorage.put(fa2, a2);
    await fsStorage.put(sameBytesA, a1);
    const p1 = P.mediaFilePath(STORE_B, fa1.key);
    const storeDirB = dirname(dirname(p1));
    t.check("identical bytes in A and B: two files in two store folders", existsSync(P.mediaFilePath(STORE_A, sameBytesA.key)) && existsSync(p1) && dirname(dirname(P.mediaFilePath(STORE_A, sameBytesA.key))) !== storeDirB);
    await fsStorage.remove({ storeId: STORE_B, key: fa1.key, storage: "fs" });
    t.check("remove: the file is gone", !existsSync(p1));
    t.check("…its emptied key shard is pruned, the store folder (still holding a file) stays", !existsSync(dirname(p1)) && existsSync(storeDirB));
    t.check("…and A's identical bytes are untouched", readFileSync(P.mediaFilePath(STORE_A, sameBytesA.key)).equals(a1));
    let again = true;
    await fsStorage.remove({ storeId: STORE_B, key: fa1.key, storage: "fs" }).catch(() => (again = false));
    t.check("remove again: idempotent", again);
    let never = true;
    await fsStorage.remove({ storeId: STORE_B, key: newKey(), storage: "fs" }).catch(() => (never = false));
    t.check("remove of a key never written: fine", never);
    await fsStorage.remove({ storeId: STORE_B, key: fa2.key, storage: "fs" });
    t.check("the last file of a store: its store folder is pruned", !existsSync(storeDirB));
    t.check("…the shard folder A shares stays, and so does v1", existsSync(dirname(storeDirB)) && existsSync(join(DATA, "media", "v1")));
    const lone = randomBytes(512);
    const loneStore = "7ZZZZZZZZZZZZZZZZZZZZZZZZZ"; // a shard of its own ("7Z"); no row needed for the file layer
    const fl = fileOf(loneStore, lone);
    await fsStorage.put(fl, lone);
    const shard = dirname(dirname(dirname(P.mediaFilePath(loneStore, fl.key))));
    await fsStorage.remove({ storeId: loneStore, key: fl.key, storage: "fs" });
    t.check("a store alone in its shard: pruned up to the shard, never v1", !existsSync(shard) && existsSync(join(DATA, "media", "v1")));
    await t.rejects("remove: a bad key is refused before any file call", () => fsStorage.remove({ storeId: STORE_B, key: "..", storage: "fs" }), /bad media key/);
  });

  /* ================================================================ */
  h.section("store: fs rows", async (t) => {
    const small = randomBytes(300 * 1024);
    const fs1 = fileOf(STORE_A, small);
    const big = randomBytes(store.MAX_CACHED_FILE + 54_321);
    const fb = { ...fileOf(STORE_A, big, newKey("1280.mp4")), mime: "video/mp4" };
    await fsStorage.put(fs1, small);
    await fsStorage.put(fb, big);
    await insertRow(fs1, "fs");
    await insertRow(fb, "fs");
    t.eq("the metadata carries the row's backend", (await store.getMediaMeta(fs1.key))?.storage, "fs");
    t.check("getMediaFile: the bytes from DATA_DIR", (await store.getMediaFile(fs1.key))?.data.equals(small) === true);
    t.check("…then from the LRU", store.peekMediaFile(fs1.key)?.data.equals(small) === true);
    const bigMeta = (await store.getMediaMeta(fb.key))!;
    t.check("an fs body never needs database work", store.mediaBodyCached(bigMeta));
    t.check("getMediaFile of a large fs file (not kept in the LRU)", (await store.getMediaFile(fb.key))?.data.equals(big) === true && store.peekMediaFile(fb.key) === undefined);
    t.check("openMediaRange of a large fs file", (await streamBytes(await store.openMediaRange(bigMeta, 1_000_000, 1_200_000))).equals(big.subarray(1_000_000, 1_200_001)));
    t.eq("no chunk was ever written for fs rows", [await chunkCount(fs1.key), await chunkCount(fb.key)], [0, 0]);
    const cache = join(DATA, "cache", "media");
    t.check("no disk-cache copy of an fs file (it already is one)", !existsSync(join(cache, store.diskName(bigMeta))));

    E.resetErrorBuffer();
    const tampered = Buffer.from(small);
    tampered[7] = tampered[7]! ^ 0xff;
    writeFileSync(P.mediaFilePath(STORE_A, fs1.key), tampered);
    store.evictKeys([fs1.key]);
    t.eq("a file that is not its row's → null (a 404), never served", await store.getMediaFile(fs1.key), null);
    const pending = () => E.pendingErrors().map((e) => `${e.area}/${e.code}/${e.storeId}`);
    t.check("…counted in the error ring (media / file_mismatch, its store)", pending().includes(`media/file_mismatch/${STORE_A}`), pending().join(","));
    rmSync(P.mediaFilePath(STORE_A, fb.key));
    await t.rejects("a missing large file: the range read fails (503), never a wrong body", () => store.openMediaRange(bigMeta, 0, 10), /missing/);
    t.check("…counted as media / missing_file", pending().includes(`media/missing_file/${STORE_A}`), pending().join(","));
    store.evictKeys([fb.key]);
    t.eq("getMediaFile of the missing file → null", await store.getMediaFile(fb.key), null);
    await t.rejects("readAll of a file over 8 MB → RangeError", () => fsStorage.readAll({ ...fb, storage: "fs" }), /up to 8 MB/);
    E.resetErrorBuffer();
  });

  /* ================================================================ */
  h.section("db backend", async (t) => {
    const data = randomBytes(store.CHUNK_SIZE * 2 + 999);
    const key = newKey();
    const assetId = key.split("-")[0]!;
    const conn = await pool().getConnection();
    try {
      await conn.beginTransaction();
      await files.insertStoreFiles(conn, scopeA, assetId, [{ key, mime: "image/webp", data }]);
      await conn.commit();
    } finally {
      conn.release();
    }
    files.forgetMisses([key]);
    const row = await dbStorage.head(key);
    t.eq("head: the db row", row, { storeId: STORE_A, key, assetId, mime: "image/webp", bytes: data.length, sha256: sha(data), storage: "db" });
    t.eq("the fs backend's head of a db row: null (no file)", await fsStorage.head(key), null);
    t.check("readAll: the chunks", (await dbStorage.readAll(row!)).equals(data));
    t.check("readRange across a chunk boundary", (await streamBytes(await dbStorage.readRange(row!, store.CHUNK_SIZE - 10, store.CHUNK_SIZE + 10))).equals(data.subarray(store.CHUNK_SIZE - 10, store.CHUNK_SIZE + 11)));
    let ok = true;
    await dbStorage.put({ storeId: STORE_A, key, assetId, mime: "image/webp", bytes: data.length, sha256: sha(data) }, data).catch(() => (ok = false));
    t.check("put: the bytes travel with the row (checked, nothing written)", ok);
    await t.rejects("put: wrong bytes refused", () => dbStorage.put({ storeId: STORE_A, key, assetId, mime: "image/webp", bytes: data.length, sha256: sha(data) }, randomBytes(data.length)), /sha256/);
    const chunks = await chunkCount(key);
    await dbStorage.remove({ storeId: STORE_A, key, storage: "db" });
    t.eq("remove keeps the chunks a db row still points at", await chunkCount(key), chunks);
    await dbStorage.remove({ storeId: STORE_B, key, storage: "db" });
    t.eq("…and another store's id removes nothing of A's", await chunkCount(key), chunks);
    await pool().query("DELETE FROM media_files WHERE store_id = ? AND `key` = ?", [STORE_A, key]);
    store.evictKeys([key]);
    await dbStorage.remove({ storeId: STORE_A, key, storage: "db" });
    t.eq("once the asset's row is gone, remove deletes its chunks", await chunkCount(key), 0);

    // the migrator's order (§G.3): put to fs → flip the row → delete the chunks; a reader cached the old row
    const mKey = newKey();
    const mData = randomBytes(100 * 1024);
    const c2 = await pool().getConnection();
    try {
      await c2.beginTransaction();
      await files.insertStoreFiles(c2, scopeA, mKey.split("-")[0]!, [{ key: mKey, mime: "image/webp", data: mData }]);
      await c2.commit();
    } finally {
      c2.release();
    }
    files.forgetMisses([mKey]);
    t.eq("a reader caches the row as db", (await store.getMediaMeta(mKey))?.storage, "db");
    await fsStorage.put({ storeId: STORE_A, key: mKey, assetId: mKey.split("-")[0]!, mime: "image/webp", bytes: mData.length, sha256: sha(mData) }, mData);
    await pool().query("UPDATE media_files SET storage = 'fs' WHERE store_id = ? AND `key` = ? AND storage = 'db'", [STORE_A, mKey]);
    await dbStorage.remove({ storeId: STORE_A, key: mKey, storage: "db" });
    t.eq("after the flip, remove deletes the chunks", await chunkCount(mKey), 0);
    t.check("the reader with the stale row still gets the bytes (from DATA_DIR)", (await store.getMediaFile(mKey))?.data.equals(mData) === true);
    t.eq("…and now knows the row is fs", store.peekMediaMeta(mKey)?.storage, "fs");
    let again = true;
    await dbStorage.remove({ storeId: STORE_A, key: mKey, storage: "db" }).catch(() => (again = false));
    t.check("remove again: idempotent", again);
  });

  /* ================================================================ */
  h.section("disk cache", async (t) => {
    const big = randomBytes(store.MAX_CACHED_FILE + 4321);
    const key = newKey("1280.mp4");
    const conn = await pool().getConnection();
    try {
      await conn.beginTransaction();
      await files.insertStoreFiles(conn, scopeA, key.split("-")[0]!, [{ key, mime: "video/mp4", data: big }]);
      await conn.commit();
    } finally {
      conn.release();
    }
    files.forgetMisses([key]);
    const meta = (await store.getMediaMeta(key))!;
    t.check("a large db file's range", (await streamBytes(await store.openMediaRange(meta, 5, 500))).equals(big.subarray(5, 501)));
    const name = store.diskName(meta);
    t.check("its disk copy lives in DATA_DIR/cache/media (the check passed)", existsSync(join(DATA, "cache", "media", name)));
    t.check("…not in tmpdir()/store-gen-media", !existsSync(join(tmpdir(), P.FALLBACK_MEDIA_CACHE, name)));
    await store.evictStore(STORE_A);
    await new Promise((r) => setTimeout(r, 30));
    t.check("evictStore drops it from DATA_DIR/cache/media", !existsSync(join(DATA, "cache", "media", name)));
  });

  /* ================================================================ */
  h.section("usage", async (t) => {
    t.eq("fs usage without a walk snapshot: zeros", await fsStorage.usage(), { bytes: 0, files: 0, freeBytes: null });
    (process.env as Record<string, string>).DATA_DIR_BUDGET_BYTES = "1000000";
    const snapshot = { bytes: 123_456, files: 42, dirs: 9, budgetBytes: 1_000_000, complete: true, at: new Date().toISOString() };
    await pool().query("INSERT INTO cron_cursors (job, `cursor`, state, updated_at) VALUES ('storage.walk', '', ?, UTC_TIMESTAMP(3))", [JSON.stringify({ snapshot, cursor: null })]);
    t.eq("fs usage: the last snapshot, free bytes against DATA_DIR_BUDGET_BYTES", await fsStorage.usage(), { bytes: 123_456, files: 42, freeBytes: 1_000_000 - 123_456 });
    delete (process.env as Record<string, string | undefined>).DATA_DIR_BUDGET_BYTES;
    const u = await dbStorage.usage();
    const [rows] = (await pool().query("SELECT COUNT(*) AS n FROM media_chunks WHERE idx = 0")) as unknown as [{ n: number }[]];
    t.check("db usage: the chunk table's size and its file count", u.bytes > 0 && u.files === Number(rows[0]?.n) && u.files >= 1 && u.freeBytes === null, JSON.stringify(u));
  });

  /* ================================================================ */
  h.section("runner", async (t) => {
    const R = await import("@/lib/jobs/runner");
    const { forEachStore } = await import("@/lib/jobs/scope");
    type Job = import("@/lib/jobs/runner").Job;
    type Row = { job: string; store_id: string | null; ok: number; processed: number; summary: string | null; error_code: string | null };
    const runsOf = async (tickId: string) =>
      ((await pool().query("SELECT job, store_id, ok, processed, summary, error_code FROM job_runs WHERE tick_id = ? ORDER BY id", [tickId])) as unknown as [Row[]])[0].map((r) => ({
        ...r,
        summary: r.summary ? (JSON.parse(r.summary) as Record<string, unknown>) : null,
      }));
    const one = async <T>(q: string, v: unknown[] = []) => ((await pool().query(q, v)) as unknown as [T[]])[0][0];
    const lease = async () => (await one<{ c: string }>("SELECT `cursor` AS c FROM cron_cursors WHERE job = 'tick'"))?.c ?? null;
    const base = await R.defaultRunnerDeps();
    const legacy: { job: string; budgetMs: number }[] = [];
    const fakeSheets: typeof base.legacySheets = async (ctx, budgetMs) => {
      legacy.push({ job: ctx.job, budgetMs });
      return { done: true, processed: 0, summary: { visited: 0, appended: 0, pulled: 0, failedStores: 0 } };
    };

    // two concurrent ticks: the second is skipped while the first holds the lease
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let entered!: () => void;
    const inside = new Promise<void>((r) => (entered = r));
    const waitJob: Job = { name: "qa.wait", every: "tick", budgetMs: 2_000, run: async () => (entered(), await gate, { done: true, summary: { waited: true } }) };
    const deps = { ...base, jobs: [waitJob], legacySheets: fakeSheets };
    t.eq("0005 seeded the lease row, free", await lease(), "");
    const first = R.runTickWith(deps);
    await inside;
    const held = await lease();
    const second = await R.runTickWith(deps);
    t.check("two concurrent ticks: the second answers skipped", second.skipped && second.jobs.length === 0, JSON.stringify(second));
    t.check("…while the first holds the lease (its tick id in `cursor`)", !!held && held.length === 26 && held !== second.tickId, String(held));
    t.eq("…and the skipped tick wrote its job_runs row", (await runsOf(second.tickId)).map((r) => [r.job, r.ok, r.summary]), [["tick", 1, { skipped: true }]]);
    release();
    const a = await first;
    t.check("the first tick ran to the end", !a.skipped && a.tickId === held, JSON.stringify(a));
    t.eq("the lease is cleared after the tick", await lease(), "");
    const rows = await runsOf(a.tickId);
    t.eq("job_runs: the shim's run, the job's run, then the tick row", rows.map((r) => [r.job, r.store_id, r.ok]), [["sheets.push", null, 1], ["qa.wait", null, 1], ["tick", null, 1]]);
    t.check("the legacy shim ran as sheets.push with slot 1's budget", legacy.length === 1 && legacy[0]!.job === "sheets.push" && legacy[0]!.budgetMs > 17_000 && legacy[0]!.budgetMs <= 18_000, JSON.stringify(legacy));
    t.eq("…its row says legacy", rows[0]?.summary?.legacy, true);
    const tickSummary = rows[2]?.summary ?? {};
    t.check(
      "the tick row: skipped false, lagP95Ms, cpuMs per job, the job list",
      tickSummary.skipped === false && "lagP95Ms" in tickSummary && typeof (tickSummary.cpuMs as Record<string, number>)?.["qa.wait"] === "number" && Array.isArray(tickSummary.jobs),
      JSON.stringify(tickSummary),
    );
    t.eq("the tick row counts its runs", rows[2]?.processed, 2);

    // an expired lease (> 110 s) is taken over; a recent one is not; a lost seed row is put back
    const idle = { ...deps, jobs: [] };
    await pool().query("UPDATE cron_cursors SET `cursor` = 'CRASHED', updated_at = UTC_TIMESTAMP(3) - INTERVAL 100 SECOND WHERE job = 'tick'");
    t.check("a lease renewed 100 s ago: skipped", (await R.runTickWith(idle)).skipped && (await lease()) === "CRASHED");
    await pool().query("UPDATE cron_cursors SET updated_at = UTC_TIMESTAMP(3) - INTERVAL 111 SECOND WHERE job = 'tick'");
    t.check("a lease older than 110 s: taken over, then cleared", !(await R.runTickWith(idle)).skipped && (await lease()) === "");
    await pool().query("DELETE FROM cron_cursors WHERE job = 'tick'");
    t.check("a lost seed row: re-seeded and acquired (not skipped forever)", !(await R.runTickWith(idle)).skipped && (await lease()) === "");

    // per-store rows through forEachStore's recorder: only the store that did work
    const storesJob: Job = {
      name: "qa.stores",
      every: "tick",
      budgetMs: 2_000,
      run: async (ctx) => {
        const r = await forEachStore(ctx, { job: "qa.stores", states: ["active"], budgetMs: 1_000 }, async (_scope, store) => (store.id === STORE_A ? 2 : 0));
        return { done: r.done, summary: { visited: r.visited } };
      },
    };
    const s = await R.runTickWith({ ...deps, jobs: [storesJob] });
    const sRows = (await runsOf(s.tickId)).filter((r) => r.job === "qa.stores");
    t.eq("forEachStore in a run: the run row, then one row for the store that did work", sRows.map((r) => [r.store_id, r.processed, r.ok]), [[null, 2, 1], [STORE_A, 2, 1]]);
    t.eq("…the run's summary counts the visits", [sRows[0]?.summary?.stores, sRows[0]?.summary?.storesWorked, sRows[0]?.summary?.visited], [2, 1, 2]);
    t.eq("…and the job's cursor moved (round robin)", (await one<{ c: string }>("SELECT `cursor` AS c FROM cron_cursors WHERE job = 'qa.stores'"))?.c, STORE_B);

    // the due state is merged into the job's own state, once per hour
    await pool().query("INSERT INTO cron_cursors (job, `cursor`, state, updated_at) VALUES ('qa.hourly', 'C1', ?, UTC_TIMESTAMP(3))", [JSON.stringify({ keep: { n: 1 } })]);
    let hourlyRuns = 0;
    const hourly: Job = { name: "qa.hourly", every: "hourly", budgetMs: 1_000, run: async (ctx) => (hourlyRuns++, { done: true, summary: { cursor: ctx.cursor } }) };
    const h1 = await R.runTickWith({ ...deps, jobs: [hourly] });
    await R.runTickWith({ ...deps, jobs: [hourly] });
    const st = await one<{ c: string; state: string }>("SELECT `cursor` AS c, state FROM cron_cursors WHERE job = 'qa.hourly'");
    const state = JSON.parse(st?.state ?? "{}") as { keep?: unknown; due?: { lastHour?: string } };
    t.eq("an hourly job runs once in two ticks of the same hour", hourlyRuns, 1);
    t.eq("…its ctx.cursor came from its row", (await runsOf(h1.tickId)).find((r) => r.job === "qa.hourly")?.summary?.cursor, "C1");
    t.eq("…the due state merged in, the job's own keys and cursor kept", [state.due?.lastHour, state.keep, st?.c], [h1.startedAt.slice(0, 13), { n: 1 }, "C1"]);

    // runTick() itself: the registered housekeeping, the real (unconfigured) Sheets step
    const old = new Date(Date.now() - 31 * 86_400_000);
    for (const [id, at] of [
      ["01JB8ZK3Q4R5S6T7V8W9LEAD01", old],
      ["01JB8ZK3Q4R5S6T7V8W9LEAD02", new Date()],
    ] as const) {
      await pool().query("INSERT INTO leads (id, store_id, page_id, idem, phone, created_at) VALUES (?, ?, ?, ?, ?, ?)", [id, STORE_A, "01JB8ZK3Q4R5S6T7V8W9PAGE01", `00000000-0000-4000-8000-0000000000${id.slice(-2)}`, "+212600000000", at]);
    }
    const real = await R.runTick();
    const realRows = await runsOf(real.tickId);
    const hk = realRows.find((r) => r.job === "housekeeping" && r.store_id === null);
    t.check("runTick(): housekeeping ran in its slot with its budget", !!hk && hk.ok === 1 && hk.summary?.slot === "8" && Number(hk.summary?.budgetMs) <= 4_000, JSON.stringify(hk));
    t.check("…purged the lead older than 30 days", Number(hk?.summary?.abandonedLeads) >= 1, JSON.stringify(hk?.summary));
    const leadsLeft = ((await pool().query("SELECT id FROM leads WHERE id LIKE '01JB8ZK3Q4R5S6T7V8W9LEAD%' ORDER BY id")) as unknown as [{ id: string }[]])[0].map((r) => r.id);
    t.eq("…and kept the fresh one", leadsLeft, ["01JB8ZK3Q4R5S6T7V8W9LEAD02"]);
    t.eq("…a per-store row for the store whose lead went", realRows.filter((r) => r.job === "housekeeping" && r.store_id).map((r) => [r.store_id, r.processed]), [[STORE_A, 1]]);
    t.check("runTick(): the legacy Sheets step ran as sheets.push (not configured here: nothing to push)", realRows.some((r) => r.job === "sheets.push" && r.summary?.legacy === true && r.ok === 1), JSON.stringify(realRows.map((r) => r.job)));
    t.eq("…and the lease is free again", await lease(), "");
  });

  /* ================================================================ */
  h.section("forEachStore", async (t) => {
    const SC = await import("@/lib/jobs/scope");
    const STORE_C = "01JB8ZK3Q4R5S6T7V8W9XYZ0CC";
    const STORE_D = "01JB8ZK3Q4R5S6T7V8W9XYZ0DD";
    await db.insert(stores).values([
      { id: STORE_C, handle: "storage-c", name: "storage-c", status: "active", brandSeed: "0123456789abcdef" },
      { id: STORE_D, handle: "storage-d", name: "storage-d", status: "suspended", brandSeed: "0123456789abcdef" },
    ]);
    const fctx = systemCtx("qa.foreach");
    const run = async (job: string, opts: { budgetMs?: number; where?: "pending_outbox" | "pending_renders"; states?: ("active" | "suspended")[]; sleepMs?: number; throwFor?: string } = {}) => {
      const seen: string[] = [];
      const r = await SC.forEachStore(fctx, { job, states: opts.states ?? ["active"], budgetMs: opts.budgetMs ?? 5_000, where: opts.where }, async (scope, store) => {
        if (scope.storeId !== store.id || scope.kind !== "system") throw new Error("scope mismatch");
        seen.push(store.id);
        if (opts.sleepMs) await new Promise((r) => setTimeout(r, opts.sleepMs));
        if (opts.throwFor === store.id) throw new Error("boom");
      });
      return { seen, ...r };
    };
    const all = await run("qa.rr");
    t.eq("every active store once, in id order, done", [all.seen, all.done], [[STORE_A, STORE_B, STORE_C], true]);
    t.eq("the cursor row holds the last store served", ((await pool().query("SELECT `cursor` AS c FROM cron_cursors WHERE job = 'qa.rr'")) as unknown as [{ c: string }[]])[0][0]?.c, STORE_C);
    const budget1 = await run("qa.budget", { budgetMs: 150, sleepMs: 200 });
    t.eq("a spent budget stops after the store in flight, done false", [budget1.seen, budget1.done], [[STORE_A], false]);
    const budget2 = await run("qa.budget", { budgetMs: 150, sleepMs: 200 });
    t.eq("the next run starts after the cursor", budget2.seen, [STORE_B]);
    E.resetErrorBuffer();
    const origError = console.error;
    console.error = () => undefined;
    let thrown: Awaited<ReturnType<typeof run>>;
    try {
      thrown = await run("qa.throw", { throwFor: STORE_B });
    } finally {
      console.error = origError;
    }
    t.eq("a throwing store is skipped, the others still run", [thrown.seen, thrown.done], [[STORE_A, STORE_B, STORE_C], true]);
    // a fresh buffer's first flush is immediate (its timer may already have run): flush, then read the ring's table
    await E.flushErrors();
    const ring = ((await pool().query("SELECT area, code, route, store_id, count FROM error_events WHERE route = 'job:qa.throw'")) as unknown as [{ area: string; code: string; route: string; store_id: string | null; count: number }[]])[0];
    t.check("…and counted in the error ring under the job, with its store", ring.length === 1 && ring[0]!.area === "jobs" && ring[0]!.store_id === STORE_B && ring[0]!.code === "Error" && Number(ring[0]!.count) === 1, JSON.stringify(ring));
    E.resetErrorBuffer();
    t.eq("other states", (await run("qa.states", { states: ["suspended"] })).seen, [STORE_D]);

    // pending_renders: pending and due only
    const page = "01JB8ZK3Q4R5S6T7V8W9PAGE01";
    for (const [id, storeId, state, inSec] of [
      ["01JB8ZK3Q4R5S6T7V8W9RJ0001", STORE_A, "pending", -5],
      ["01JB8ZK3Q4R5S6T7V8W9RJ0002", STORE_B, "pending", 600],
      ["01JB8ZK3Q4R5S6T7V8W9RJ0003", STORE_C, "running", -5],
    ] as const) {
      await pool().query("INSERT INTO render_jobs (id, store_id, page_id, reason, state, not_before) VALUES (?, ?, ?, 'runtime', ?, UTC_TIMESTAMP(3) + INTERVAL ? SECOND)", [id, storeId, page, state, inSec]);
    }
    t.eq("pending_renders: a pending job that is due (not one waiting for not_before, not a running one)", (await run("qa.renders", { where: "pending_renders" })).seen, [STORE_A]);

    // pending_outbox: pending and due store items only
    for (const [id, storeId, state, inSec] of [
      ["01JB8ZK3Q4R5S6T7V8W9OB0001", null, "pending", -5],
      ["01JB8ZK3Q4R5S6T7V8W9OB0002", STORE_B, "dead", -5],
      ["01JB8ZK3Q4R5S6T7V8W9OB0003", STORE_C, "pending", -5],
      ["01JB8ZK3Q4R5S6T7V8W9OB0004", STORE_A, "pending", 600],
    ] as const) {
      await pool().query("INSERT INTO outbox (id, store_id, kind, topic, dedupe_key, payload, state, next_at) VALUES (?, ?, 'telegram', 'qa', ?, '{}', ?, UTC_TIMESTAMP(3) + INTERVAL ? SECOND)", [id, storeId, `qa:${id}`, state, inSec]);
    }
    t.eq("pending_outbox: a store's pending item that is due (not a platform row, a dead one or a later one)", (await run("qa.outbox", { where: "pending_outbox" })).seen, [STORE_C]);
    await pool().query(
      "INSERT INTO outbox (id, store_id, kind, topic, dedupe_key, payload, state, next_at, claim, lease_until) VALUES (?, ?, 'telegram', 'qa', ?, '{}', 'running', UTC_TIMESTAMP(3), ?, UTC_TIMESTAMP(3) - INTERVAL 1 SECOND), (?, ?, 'telegram', 'qa', ?, '{}', 'running', UTC_TIMESTAMP(3), ?, UTC_TIMESTAMP(3) + INTERVAL 1 MINUTE)",
      ["01JB8ZK3Q4R5S6T7V8W9OB0005", STORE_B, "qa:01JB8ZK3Q4R5S6T7V8W9OB0005", "01JB8ZK3Q4R5S6T7V8W9CLAIM1", "01JB8ZK3Q4R5S6T7V8W9OB0006", STORE_A, "qa:01JB8ZK3Q4R5S6T7V8W9OB0006", "01JB8ZK3Q4R5S6T7V8W9CLAIM2"],
    );
    t.eq("pending_outbox: …or one claimed by a drain that died (running past its lease; not a live lease)", (await run("qa.outbox2", { where: "pending_outbox" })).seen, [STORE_B, STORE_C]);
    await t.rejects('the job name "tick" (the lease row) is refused', () => SC.forEachStore(fctx, { job: "tick", states: ["active"], budgetMs: 10 }, async () => undefined), /bad job name/);
  });

  /* ================================================================ */
  h.section("outbox", async (t) => {
    const O = await import("@/lib/jobs/outbox");
    const R = await import("@/lib/jobs/runner");
    const { mintScope } = await import("@/lib/tenancy/seam");
    const { invalidateFlags } = await import("@/lib/tenancy/entitlements");
    const crypto = await import("@/lib/security/crypto");
    type StoreCtx = import("@/lib/tenancy/types").StoreCtx;
    type PlatformCtx = import("@/lib/tenancy/types").PlatformCtx;
    type WriteScope = import("@/lib/tenancy/types").WriteScope;
    type ClaimedItem = import("@/lib/jobs/outbox").ClaimedItem;
    await import("@/lib/jobs/registry"); // P5's handler files register first; the fakes below replace them for this section
    await pool().query("DELETE FROM outbox"); // the forEachStore section's probe rows
    const scopeB = systemScope(ctx, STORE_B);
    const canary = "+212612345678";

    type Row = { id: string; store_id: string | null; kind: string; state: string; attempts: number; payload: string; encrypted: number; next_at: Date; claim: string | null; done_at: Date | null; last_error: string | null; last_status: number | null };
    const rowOf = async (id: string) => ((await pool().query("SELECT * FROM outbox WHERE id = ?", [id])) as unknown as [Row[]])[0][0];
    const rowByKey = async (key: string) => ((await pool().query("SELECT * FROM outbox WHERE dedupe_key = ?", [key])) as unknown as [Row[]])[0][0];
    const count = async (where: string, params: unknown[] = []) => Number(((await pool().query(`SELECT COUNT(*) AS n FROM outbox WHERE ${where}`, params)) as unknown as [{ n: number }[]])[0][0]!.n);
    const tg = (key: string, over: Partial<import("@/lib/jobs/outbox").OutboxItem> = {}) => ({ kind: "telegram" as const, topic: "new_order", dedupeKey: key, payload: { orderId: "CMD-QA0001" }, ...over });
    const refusal = async (fn: () => Promise<unknown>) => {
      try {
        await fn();
        return "ok";
      } catch (err) {
        return (err as { code?: string }).code ?? (err as Error).name;
      }
    };

    // fake handlers (restored at the end): every send recorded
    const saved = new Map(globalThis.__sgOutboxHandlers ?? []);
    const sent: ClaimedItem[] = [];
    let capiAnswer: (item: ClaimedItem) => import("@/lib/jobs/outbox").SendResult = () => ({ ok: true, status: 200 });
    const fake = (kind: import("@/lib/jobs/outbox").OutboxKind, per: number, answer: (item: ClaimedItem) => import("@/lib/jobs/outbox").SendResult = () => ({ ok: true, status: 200 })) =>
      O.registerOutboxHandler({
        kind,
        maxPerTick: 1_000,
        perStorePerTick: per,
        timeoutMs: 5_000,
        send: async (item) => {
          sent.push(item);
          await new Promise((r) => setTimeout(r, 1 + Math.floor(Math.random() * 3)));
          return answer(item);
        },
      });
    fake("telegram", 10);
    fake("capi", 20, (item) => capiAnswer(item));
    fake("mail", 20);
    const memberCtx = (storeId: string, o: { impersonation?: boolean; can?: boolean } = {}): StoreCtx =>
      ({
        user: { id: "01JB8ZK3Q4R5S6T7V8W9USER01" },
        store: { id: storeId, handle: storeId === STORE_A ? "storage-a" : "storage-b" },
        membership: o.impersonation ? { role: "owner", status: "active", synthetic: "impersonation" } : { role: "owner", status: "active" },
        scope: mintScope(o.impersonation ? "impersonation" : "member", storeId),
        actor: { kind: o.impersonation ? "impersonation" : "user", userId: "01JB8ZK3Q4R5S6T7V8W9USER01", impersonatorId: o.impersonation ? "01JB8ZK3Q4R5S6T7V8W9STAFF1" : null, ip: null },
        impersonation: o.impersonation ? { id: "01JB8ZK3Q4R5S6T7V8W9IMP001", storeId, staffUserId: "01JB8ZK3Q4R5S6T7V8W9STAFF1", mode: "read", reason: "ticket", expiresAt: new Date(Date.now() + 60_000) } : null,
        stepUpUntil: null,
        can: () => o.can ?? true,
      }) as unknown as StoreCtx;
    const staffCtx = (can = true): PlatformCtx =>
      ({ user: { id: "01JB8ZK3Q4R5S6T7V8W9STAFF1" }, role: "super_admin", actor: { kind: "platform", userId: "01JB8ZK3Q4R5S6T7V8W9STAFF1", impersonatorId: null, ip: null }, can: () => can, stepUpFresh: false, stepUpUntil: null }) as unknown as PlatformCtx;
    const audits = async (action: string, target: string) => ((await pool().query("SELECT store_id, actor_kind, meta FROM audit_log WHERE action = ? AND target = ?", [action, target])) as unknown as [{ store_id: string | null; actor_kind: string; meta: string | null }[]])[0];

    try {
      // ---- enqueue: INSERT IGNORE on dedupe_key, the re-send rule's duplicates
      const k1 = `qa:tg:${hex(4)}`;
      const first = await O.enqueue(scopeA, [tg(k1)]);
      const again = await O.enqueue(scopeA, [tg(k1)]);
      t.eq("enqueue twice → inserted 1, then duplicates 1", [first, again], [
        { inserted: 1, duplicates: 0 },
        { inserted: 0, duplicates: 1 },
      ]);
      const k2 = `qa:tg:${hex(4)}`;
      t.eq("the same key twice in one batch → one row, one duplicate", await O.enqueue(scopeA, [tg(k2), tg(k2)]), { inserted: 1, duplicates: 1 });
      const r1 = await rowByKey(k1);
      t.check("the row: store A, pending, attempts 0, plain JSON, due now", r1?.store_id === STORE_A && r1.state === "pending" && r1.attempts === 0 && r1.encrypted === 0 && JSON.parse(r1.payload).orderId === "CMD-QA0001" && r1.next_at.getTime() <= Date.now() + 1_000, JSON.stringify(r1));
      E.resetErrorBuffer();
      t.eq("reportDuplicates returns the result", O.reportDuplicates(again, { area: "qa:hooks", storeId: STORE_A }), again);
      t.check("…and counts duplicate_enqueue in the ring (area outbox, the caller's area, the store)", E.pendingErrors().some((e) => e.area === "outbox" && e.code === "duplicate_enqueue" && e.route === "qa:hooks" && e.storeId === STORE_A && e.count === 1));
      E.resetErrorBuffer();
      const later = new Date(Date.now() + 3_600_000);
      const k3 = `qa:tg:${hex(4)}`;
      await O.enqueue(scopeA, [tg(k3, { notBefore: later, targetId: "chat:9f2c" })]);
      const r3 = await rowByKey(k3);
      t.check("notBefore becomes next_at; targetId kept", Math.abs(r3!.next_at.getTime() - later.getTime()) < 5 && (r3 as unknown as { target_id: string }).target_id === "chat:9f2c");

      // ---- the caller's transaction (OD6): items roll back with it
      const kTx = `qa:tg:${hex(4)}`;
      await db
        .transaction(async (tx) => {
          await O.enqueue(scopeA, [tg(kTx)], { tx });
          throw new Error("order rolled back");
        })
        .catch(() => undefined);
      t.eq("enqueue on a rolled-back transaction leaves no row", await count("dedupe_key = ?", [kTx]), 0);
      await db.transaction(async (tx) => void (await O.enqueue(scopeA, [tg(kTx)], { tx })));
      t.eq("…and a committed one keeps it", await count("dedupe_key = ?", [kTx]), 1);

      // ---- refusals
      t.eq("an impersonation scope is refused (impersonation_read_only)", await refusal(() => O.enqueue(mintScope("impersonation", STORE_A) as unknown as WriteScope, [tg(`qa:${hex(4)}`)])), "impersonation_read_only");
      t.eq("a platform read scope is refused (forbidden)", await refusal(() => O.enqueue(mintScope("platform", STORE_A) as unknown as WriteScope, [tg(`qa:${hex(4)}`)])), "forbidden");
      t.eq("a kind 0005 does not store is refused before the database", await refusal(() => O.enqueue(scopeA, [tg(`qa:${hex(4)}`, { kind: "push" })])), "RangeError");
      t.eq("an empty batch is a no-op", await O.enqueue(scopeA, []), { inserted: 0, duplicates: 0 });

      // ---- pii: sealed at rest, opened for the handler
      const kPii = `qa:capi:${hex(4)}`;
      await O.enqueue(scopeA, [{ kind: "capi", topic: "Purchase", dedupeKey: kPii, payload: { phone: canary, name: "Canary Name" }, pii: true }]);
      const pii = await rowByKey(kPii);
      t.check("a pii payload is stored sealed: encrypted = 1, a v2 envelope, no canary in the row", pii?.encrypted === 1 && pii.payload.startsWith("v2.k1.") && !JSON.stringify(pii).includes("212612345678") && !JSON.stringify(pii).includes("Canary"));
      t.eq("…it opens with store A's key and purpose outbox:v1", JSON.parse(crypto.open(pii!.payload, { store: STORE_A }, "outbox:v1")).phone, canary);
      t.throws("…never with store B's", () => crypto.open(pii!.payload, { store: STORE_B }, "outbox:v1"), /does not open/);
      sent.length = 0;
      const d1 = await O.drainOutbox({ storeId: STORE_A, budgetMs: 10_000 });
      const piiSent = sent.find((i) => i.dedupeKey === kPii);
      t.check("the drain opens it for the handler", (piiSent?.payload as { phone?: string } | undefined)?.phone === canary && piiSent?.storeId === STORE_A);
      t.check("drainOutbox({ storeId: A }): A's due items only, then done (the later one waits)", d1.done >= 4 && sent.every((i) => i.storeId === STORE_A) && !sent.some((i) => i.dedupeKey === k3) && (await rowByKey(k1))?.state === "done", JSON.stringify(d1));
      const done1 = await rowByKey(k1);
      t.check("…a done row: done_at, last_status, last_ms, no claim, no lease", done1?.done_at instanceof Date && done1.last_status === 200 && done1.claim === null && (done1 as unknown as { lease_until: Date | null }).lease_until === null);

      // ---- 20 parallel drains: one delivery per item
      await pool().query("DELETE FROM outbox");
      const keys: string[] = [];
      for (const [scope, n] of [
        [scopeA, 120],
        [scopeB, 60],
      ] as const) {
        const batch = Array.from({ length: n }, (_, i) => tg(`qa:par:${scope.storeId.slice(-2)}:${i}`));
        keys.push(...batch.map((b) => b.dedupeKey));
        await O.enqueue(scope, batch);
      }
      sent.length = 0;
      let rounds = 0;
      while ((await count("state IN ('pending', 'running')")) > 0 && rounds < 6) {
        rounds++;
        await Promise.all(Array.from({ length: 20 }, (_, i) => O.drainOutbox(i % 2 ? { budgetMs: 20_000 } : { budgetMs: 20_000, storeId: i % 4 ? STORE_A : STORE_B })));
      }
      const ids = sent.map((i) => i.id);
      t.eq("20 parallel drains: every item delivered exactly once", [ids.length, new Set(ids).size, await count("state = 'done'")], [180, 180, 180]);
      t.check(`…within ${rounds} round(s) of 20 drains`, rounds >= 1 && rounds <= 3, String(rounds));

      // ---- an expired lease is re-claimed; a live one is not
      await pool().query("DELETE FROM outbox");
      await pool().query(
        "INSERT INTO outbox (id, store_id, kind, topic, dedupe_key, payload, state, next_at, claim, lease_until) VALUES (?, ?, 'telegram', 'new_order', ?, '{}', 'running', UTC_TIMESTAMP(3), ?, UTC_TIMESTAMP(3) - INTERVAL 1 SECOND), (?, ?, 'telegram', 'new_order', ?, '{}', 'running', UTC_TIMESTAMP(3), ?, UTC_TIMESTAMP(3) + INTERVAL 2 MINUTE)",
        ["01JB8ZK3Q4R5S6T7V8W9EXP001", STORE_B, "qa:exp:1", "01JB8ZK3Q4R5S6T7V8W9DEAD01", "01JB8ZK3Q4R5S6T7V8W9LIV001", STORE_B, "qa:live:1", "01JB8ZK3Q4R5S6T7V8W9LIVE01"],
      );
      sent.length = 0;
      await O.drainOutbox({ budgetMs: 10_000 }); // no store given: the stores with due work (pending_outbox) are visited
      t.eq("an expired lease is re-claimed and sent (the cron finds the store by it)", [(await rowOf("01JB8ZK3Q4R5S6T7V8W9EXP001"))?.state, sent.map((i) => i.id)], ["done", ["01JB8ZK3Q4R5S6T7V8W9EXP001"]]);
      t.eq("…a live lease is left to its drain", [(await rowOf("01JB8ZK3Q4R5S6T7V8W9LIV001"))?.state, (await rowOf("01JB8ZK3Q4R5S6T7V8W9LIV001"))?.claim], ["running", "01JB8ZK3Q4R5S6T7V8W9LIVE01"]);

      // ---- dead transitions are counted; retries move up the ladder
      E.resetErrorBuffer();
      capiAnswer = (item) => (item.topic === "Refused" ? { ok: false, retry: false, status: 400, error: `(#100) Invalid parameter for ${canary}` } : { ok: false, retry: true, status: 503, error: "HTTP 503" });
      const kDead = `qa:capi:${hex(4)}`;
      const kRetry = `qa:capi:${hex(4)}`;
      await O.enqueue(scopeA, [
        { kind: "capi", topic: "Refused", dedupeKey: kDead, payload: {} },
        { kind: "capi", topic: "Purchase", dedupeKey: kRetry, payload: {} },
      ]);
      const before = Date.now();
      const d2 = await O.drainOutbox({ storeId: STORE_A, budgetMs: 10_000, kinds: ["capi"] });
      const dead = await rowByKey(kDead);
      const retry = await rowByKey(kRetry);
      t.eq("retry: false → dead at once with its status", [dead?.state, dead?.attempts, dead?.last_status, dead?.done_at instanceof Date], ["dead", 1, 400, true]);
      t.check("…last_error is plain text with the digits masked (never a phone)", dead?.last_error === "(#100) Invalid parameter for <n>", String(dead?.last_error));
      t.check("a retryable failure → pending, attempts 1, next try in ~1 min", retry?.state === "pending" && retry.attempts === 1 && Math.abs(retry.next_at.getTime() - before - 60_000) < 5_000 && retry.last_error === "HTTP 503");
      t.eq("…the report", [d2.claimed, d2.dead, d2.retried, d2.done], [2, 1, 1, 0]);
      // a fresh buffer's first flush is immediate (its timer may already have run): flush, then read the ring's table
      await E.flushErrors();
      const deadRing = ((await pool().query("SELECT store_id, count FROM error_events WHERE area = 'outbox' AND code = 'dead_capi'")) as unknown as [{ store_id: string | null; count: number }[]])[0];
      t.check("…the dead transition is counted (area outbox, dead_capi, store A)", deadRing.length === 1 && deadRing[0]!.store_id === STORE_A && Number(deadRing[0]!.count) === 1, JSON.stringify(deadRing));
      E.resetErrorBuffer();
      capiAnswer = () => ({ ok: true, status: 200 });

      // ---- the capi_enabled kill switch pauses capi only
      const kCapi = `qa:capi:${hex(4)}`;
      const kTg = `qa:tg:${hex(4)}`;
      await O.enqueue(scopeB, [
        { kind: "capi", topic: "Purchase", dedupeKey: kCapi, payload: {} },
        tg(kTg),
      ]);
      await pool().query("UPDATE flags SET default_value = 'false' WHERE `key` = 'capi_enabled'");
      invalidateFlags();
      const capiBefore = await rowByKey(kCapi);
      await O.drainOutbox({ storeId: STORE_B, budgetMs: 10_000 });
      t.eq("capi_enabled off: the capi item waits untouched (state, attempts, next_at, claim)", JSON.stringify(await rowByKey(kCapi)), JSON.stringify(capiBefore));
      t.eq("…telegram still goes", (await rowByKey(kTg))?.state, "done");
      await pool().query("UPDATE flags SET default_value = 'true' WHERE `key` = 'capi_enabled'");
      invalidateFlags();
      await O.drainOutbox({ storeId: STORE_B, budgetMs: 10_000 });
      t.eq("…and goes out unchanged once the switch is back", [(await rowByKey(kCapi))?.state, (await rowByKey(kCapi))?.attempts], ["done", 0]);

      // ---- mail (platform items): 4 a minute, the rest rescheduled, never attempted
      const mails = Array.from({ length: 6 }, (_, i) => ({ kind: "mail" as const, topic: "payout_ready", dedupeKey: `qa:mail:${hex(3)}:${i}`, payload: { to: "<owner>" } }));
      t.eq("enqueue('platform', …): platform items, store_id NULL", await O.enqueue("platform", mails), { inserted: 6, duplicates: 0 });
      sent.length = 0;
      await O.drainOutbox({ budgetMs: 10_000, kinds: ["mail"] });
      const mailRows = ((await pool().query("SELECT state, attempts, next_at, store_id FROM outbox WHERE kind = 'mail' ORDER BY dedupe_key")) as unknown as [{ state: string; attempts: number; next_at: Date; store_id: string | null }[]])[0];
      t.eq("4 mails a minute: four sent, two rescheduled (pending, attempts 0, later)", [sent.length, mailRows.filter((r) => r.state === "done").length, mailRows.filter((r) => r.state === "pending" && r.attempts === 0 && r.next_at.getTime() > Date.now()).length], [4, 4, 2]);
      t.check("…every mail row is a platform item", mailRows.every((r) => r.store_id === null));
      const hourValue = ((await pool().query("SELECT value FROM platform_usage WHERE metric = 'mail_sent'")) as unknown as [{ value: number }[]])[0];
      t.eq("…mail_sent charged for the hour, once per send", hourValue.map((r) => Number(r.value)), [4]);

      // ---- replay
      const kDeadA = `qa:tg:${hex(4)}`;
      await O.enqueue(scopeA, [tg(kDeadA)]);
      await pool().query("UPDATE outbox SET state = 'dead', attempts = 7, last_error = 'Forbidden: bot was blocked', last_status = 403, done_at = UTC_TIMESTAMP(3) WHERE dedupe_key = ?", [kDeadA]);
      const deadA = (await rowByKey(kDeadA))!;
      const snap = JSON.stringify(deadA);
      t.eq("replay: store B's scope on A's row → not_found", await refusal(() => O.replay(memberCtx(STORE_B), deadA.id)), "not_found");
      t.eq("…A's row unchanged", JSON.stringify(await rowOf(deadA.id)), snap);
      t.eq("replay: an impersonation scope → impersonation_read_only, row unchanged", [await refusal(() => O.replay(memberCtx(STORE_A, { impersonation: true }), deadA.id)), JSON.stringify(await rowOf(deadA.id)) === snap], ["impersonation_read_only", true]);
      t.eq("replay: without integrations.manage → forbidden", await refusal(() => O.replay(memberCtx(STORE_A, { can: false }), deadA.id)), "forbidden");
      t.eq("replay: an id that is no row id → not_found", await refusal(() => O.replay(memberCtx(STORE_A), "../../x")), "not_found");
      t.eq("replay: A's own dead row", await refusal(() => O.replay(memberCtx(STORE_A), deadA.id)), "ok");
      const back = (await rowOf(deadA.id))!;
      t.check("…dead → pending, attempts 0, due now, not finished; the last error kept", back.state === "pending" && back.attempts === 0 && back.done_at === null && back.next_at.getTime() <= Date.now() + 1_000 && back.last_error === "Forbidden: bot was blocked");
      const audited = await audits("integrations.outbox.replayed", deadA.id);
      t.check("…audited integrations.outbox.replayed with { kind, topic, outboxId } on store A", audited.length === 1 && audited[0]!.store_id === STORE_A && /"kind":"telegram"/.test(audited[0]!.meta ?? "") && /"outboxId"/.test(audited[0]!.meta ?? ""), JSON.stringify(audited));
      t.eq("…a second click while it is pending is a no-op (no second audit row)", [await refusal(() => O.replay(memberCtx(STORE_A), deadA.id)), (await audits("integrations.outbox.replayed", deadA.id)).length], ["ok", 1]);

      const kDoneCapi = `qa:capi:${hex(4)}`;
      const kDoneTg = `qa:tg:${hex(4)}`;
      const kCancelled = `qa:capi:${hex(4)}`;
      await O.enqueue(scopeA, [{ kind: "capi", topic: "Purchase", dedupeKey: kDoneCapi, payload: {} }, tg(kDoneTg), { kind: "capi", topic: "Purchase", dedupeKey: kCancelled, payload: {} }]);
      await pool().query("UPDATE outbox SET state = 'done', done_at = UTC_TIMESTAMP(3) WHERE dedupe_key IN (?, ?)", [kDoneCapi, kDoneTg]);
      await pool().query("UPDATE outbox SET state = 'cancelled' WHERE dedupe_key = ?", [kCancelled]);
      const doneCapi = (await rowByKey(kDoneCapi))!;
      t.eq("replay: a done capi row is refused (invalid), row unchanged", [await refusal(() => O.replay(memberCtx(STORE_A), doneCapi.id)), JSON.stringify(await rowOf(doneCapi.id)) === JSON.stringify(doneCapi)], ["invalid", true]);
      t.eq("replay: a cancelled row is refused (invalid)", await refusal(async () => O.replay(memberCtx(STORE_A), (await rowByKey(kCancelled))!.id)), "invalid");
      const doneTg = (await rowByKey(kDoneTg))!;
      t.eq("replay: a done telegram row is sent again (the deliberate re-send)", [await refusal(() => O.replay(memberCtx(STORE_A), doneTg.id)), (await rowOf(doneTg.id))?.state], ["ok", "pending"]);

      const kDeadB = `qa:tg:${hex(4)}`;
      await O.enqueue(scopeB, [tg(kDeadB)]);
      await pool().query("UPDATE outbox SET state = 'dead', attempts = 7, done_at = UTC_TIMESTAMP(3) WHERE dedupe_key = ?", [kDeadB]);
      const deadB = (await rowByKey(kDeadB))!;
      t.eq("replay from the console without stores.lifecycle → forbidden", await refusal(() => O.replay(staffCtx(false), deadB.id)), "forbidden");
      t.eq("replay from the console (any store)", [await refusal(() => O.replay(staffCtx(), deadB.id)), (await rowOf(deadB.id))?.state], ["ok", "pending"]);
      const staffAudit = await audits("platform.outbox.replayed", deadB.id);
      t.check("…audited platform.outbox.replayed on store B, actor platform", staffAudit.length === 1 && staffAudit[0]!.store_id === STORE_B && staffAudit[0]!.actor_kind === "platform", JSON.stringify(staffAudit));

      // ---- summaries
      await O.enqueue(scopeA, [{ kind: "capi", topic: "Purchase", dedupeKey: `qa:capi:${hex(4)}`, payload: { phone: canary }, pii: true }]);
      await pool().query("UPDATE outbox SET state = 'dead', attempts = 7, last_error = 'HTTP 410', last_status = 410, done_at = UTC_TIMESTAMP(3) WHERE store_id = ? AND kind = 'capi' AND state = 'pending'", [STORE_A]);
      const grouped = async (storeId: string) =>
        ((await pool().query("SELECT kind, state, COUNT(*) AS n FROM outbox WHERE store_id = ? GROUP BY kind, state", [storeId])) as unknown as [{ kind: string; state: string; n: number }[]])[0];
      const sumA = await O.outboxSummary(scopeA);
      const sumB = await O.outboxSummary(scopeB);
      const flat = (s: typeof sumA) => s.byKind.flatMap((k) => (["pending", "running", "done", "dead", "cancelled"] as const).filter((st) => k[st] > 0).map((st) => `${k.kind}:${st}:${k[st]}`)).sort();
      t.eq("outboxSummary(B): exactly B's rows by kind × state", flat(sumB), (await grouped(STORE_B)).map((r) => `${r.kind}:${r.state}:${Number(r.n)}`).sort());
      t.eq("outboxSummary(A): exactly A's", flat(sumA), (await grouped(STORE_A)).map((r) => `${r.kind}:${r.state}:${Number(r.n)}`).sort());
      const aIds = ((await pool().query("SELECT id FROM outbox WHERE store_id = ?", [STORE_A])) as unknown as [{ id: string }[]])[0].map((r) => r.id);
      t.check("outboxSummary(B) names no row of A", aIds.length > 0 && !aIds.some((id) => JSON.stringify(sumB).includes(id)));
      t.check("outboxSummary(A): the dead rows (≤ 5, newest first) with kind, topic, attempts, last status and error", sumA.deadCount >= 2 && sumA.dead.length >= 2 && sumA.dead.length <= 5 && sumA.dead.every((d) => d.attempts >= 1 && typeof d.at === "string") && sumA.dead.some((d) => d.lastStatus === 410 && d.lastError === "HTTP 410"), JSON.stringify(sumA.dead));
      t.check("…never a payload (no canary in either summary)", !JSON.stringify(sumA).includes("212612345678") && !JSON.stringify(sumB).includes("212612345678") && !/payload/.test(JSON.stringify(sumA)));
      t.check("…the oldest pending as a time and an age in minutes", sumB.byKind.filter((k) => k.pending > 0).every((k) => typeof k.oldestPendingAt === "string" && typeof k.oldestPendingMin === "number" && k.oldestPendingMin >= 0));
      const plat = await O.platformOutboxSummary();
      const total = ((await pool().query("SELECT COUNT(*) AS n FROM outbox")) as unknown as [{ n: number }[]])[0][0]!.n;
      t.eq("platformOutboxSummary: every row counted once (stores and platform items)", plat.byKind.reduce((n, r) => n + r.count, 0), Number(total));
      t.check("…dead rows carry their store; oldest pending per store and kind; no payload", plat.dead.some((d) => d.storeId === STORE_A) && plat.oldestPending.length > 0 && !JSON.stringify(plat).includes("212612345678"));

      // ---- the cron: runTick() runs the outbox in slot 3, with a per-store row
      await pool().query("DELETE FROM outbox WHERE state IN ('pending', 'running')");
      await O.enqueue(scopeB, [tg(`qa:tick:${hex(4)}`)]);
      const tick = await R.runTick();
      const runs = ((await pool().query("SELECT job, store_id, ok, processed, summary FROM job_runs WHERE tick_id = ? AND job = 'outbox'", [tick.tickId])) as unknown as [{ job: string; store_id: string | null; ok: number; processed: number; summary: string | null }[]])[0];
      const run = runs.find((r) => r.store_id === null);
      const summary = run?.summary ? (JSON.parse(run.summary) as Record<string, unknown>) : {};
      t.check("runTick(): the outbox job ran in slot 3 within 13 s, delivered the item", run?.ok === 1 && summary.slot === "3" && Number(summary.budgetMs) <= 13_000 && summary.delivered === 1 && Number(run.processed) === 1, JSON.stringify(runs));
      t.eq("…with a per-store job_runs row for B", runs.filter((r) => r.store_id).map((r) => [r.store_id, Number(r.processed)]), [[STORE_B, 1]]);
      t.check("…job_runs holds counts only (no payload, no canary)", !JSON.stringify(runs).includes("orderId") && !JSON.stringify(runs).includes("212612345678"));
    } finally {
      globalThis.__sgOutboxHandlers = saved;
      await pool().query("UPDATE flags SET default_value = 'true' WHERE `key` = 'capi_enabled'");
      invalidateFlags();
    }
  });

  await h.run();
  const failed = process.exitCode === 1;
  await pool().end().catch(() => undefined);
  await globalThis.__codMediaState?.read.pool?.end().catch(() => undefined);
  return failed ? 1 : 0;
}

let exit = 1;
main()
  .then((code) => {
    exit = code;
  })
  .catch((err: unknown) => {
    console.error(err);
  })
  .finally(async () => {
    if (KEEP) console.log(`kept: database ${dbName}, DATA_DIR ${DATA}`);
    else {
      await rootQuery(`DROP DATABASE IF EXISTS \`${dbName}\``).catch((err: unknown) => console.error("could not drop", dbName, err instanceof Error ? err.message : err));
      rmSync(ROOT, { recursive: true, force: true });
    }
    process.exit(exit);
  });
