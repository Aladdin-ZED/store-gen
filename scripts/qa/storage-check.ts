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
