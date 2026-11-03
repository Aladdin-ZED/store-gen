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
 * Sections (P8 step 2; later steps add theirs under their own names: storage-jobs, export, backups, purge):
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
 *  - renders (P8 step 5)       enqueueRenders all-live / ids (dedupe while pending, B's page id under A's scope inserts
 *                              nothing and is counted, impersonation refused); the claim clears dedupe on the real
 *                              table (an enqueue mid-render inserts a second job; a retry behind it is superseded; B's
 *                              scope claims and writes nothing of A); rendersJob re-renders a seeded live page in place
 *                              (same version row, doc / checksum / runtime_v unchanged, html and etag new) and again
 *                              after a store contact change (store_info); runtime_v 1 skipped; a broken version: 3
 *                              retries then failed, retried on request; renderSummary on fixtures (oldest 61 min,
 *                              throughput, ETA, failures by code, notes, nothing of another store); the platform
 *                              summary; the fan-out (forbidden without domains.manage, one at a time, store by store,
 *                              its row shared with the runner's keys); runTick() runs renders in slot 4 and the fan-out in 7
 *  - media (P8 step 6)         §G.4-§G.6 through the real pipeline (sharp, the quota counters, both backends): an fs
 *                              upload's files on disk and no chunk; a same-store duplicate deduped, and two at once (one
 *                              charge, the winner's files kept by the loser's cleanup); identical bytes in
 *                              A and B → two ids and two file sets, A's delete never touching B's; the public route
 *                              serving an fs row and its db twin byte for byte (ranges, HEAD, 304, 416), refusing bad
 *                              keys, a missing file and a suspended (or closed) store's key with the neutral 404;
 *                              asset_refs (own assets only, replace, parallel syncs); the delete 409 with this store's
 *                              pages only, allowed when only B uses the same bytes, the brand logo (index and setting),
 *                              force; one cutout render per live page that shows the source; the quota race (20
 *                              parallel storage halves at the limit, no orphan file, the 413 body); D69 (the shared
 *                              pending budget charged first, given back by the store's own cap and on pending → active)
 *  - storage-jobs (P8 step 7)  §G.3, §G.2, §G.5, §D.7 against the real tables and DATA_DIR: media.migrate (rows flip,
 *                              chunks deleted, identical bytes, an interrupted slice and a second run are no-ops, bad
 *                              chunks left and reported, ≤ 50 a tick, the idle hour, nothing on the db backend);
 *                              an idempotent re-put refreshes the file's time; media.sweep (orphans > 1 h deleted, fresh
 *                              ones and temp files kept, a purged store's folder swept and pruned, a foreign folder
 *                              untouched, missing files reported and never deleted, rows without a folder); storage.walk
 *                              (the snapshot equals the real totals, resumed one folder a tick, MEDIA_DIR outside /
 *                              inside, the runner's due keys kept); refs.reconcile (built, deleted refs restored, a later
 *                              save rebuilt, live flags, archived pages dropped, the brand logo, never another store's
 *                              asset, a healed index untouched); usage.reconcile (a drifted gauge and the D69 pending
 *                              budget corrected, the drift in the summary, a second run finds none)
 *  - export (P8 step 8)        §F.9 against the real tables and DATA_DIR: two stores E and F with canaries; the request
 *                              (a read-only platform scope queues it, an active job answers its id, F lists nothing);
 *                              the job across many forced one-slice ticks with a 24 KB part limit, two dead ticks
 *                              leaving garbage after the saved cursor; every listed file in the parts, nothing of F, no
 *                              capi_ctx / token / claim / share / bot token / run id, E's full phones, the CSV dialect,
 *                              the tenant audit view, settings without secret keys, the largest media variant, README;
 *                              parts' bytes and sha256; the signature (F, expired); exportPartStream; 'no_space' from
 *                              the walk snapshot; 71 h kept, 73 h expired with its files gone (fake clock)
 *
 * `-- --only <prefix>[,…]` runs only the sections whose name starts with a prefix.
 */
import Module from "node:module";
import { randomBytes, createHash } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, unlinkSync, utimesSync, writeFileSync } from "node:fs";
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
    t.check("the same sha256 resolves at once: the file is not rewritten, only its time refreshed (the sweeper's hour)", st2.ino === st.ino && st2.size === st.size && st2.mtimeMs >= st.mtimeMs);
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
    t.check("…without rewriting the file", statSync(P.mediaFilePath(STORE_A, f.key)).ino === st.ino);
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
    await t.rejects("a missing large file: the range read fails (the route's 404), never a wrong body", () => store.openMediaRange(bigMeta, 0, 10), /missing/);
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
    const stopSeen: string[] = [];
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
    await pool().query(
      "INSERT INTO render_jobs (id, store_id, page_id, reason, state, not_before, claim, lease_until) VALUES (?, ?, ?, 'runtime', 'running', UTC_TIMESTAMP(3), ?, UTC_TIMESTAMP(3) - INTERVAL 1 SECOND), (?, ?, ?, 'runtime', 'running', UTC_TIMESTAMP(3), ?, UTC_TIMESTAMP(3) + INTERVAL 1 MINUTE)",
      ["01JB8ZK3Q4R5S6T7V8W9RJ0004", STORE_B, page, "01JB8ZK3Q4R5S6T7V8W9CLAIM3", "01JB8ZK3Q4R5S6T7V8W9RJ0005", STORE_C, page, "01JB8ZK3Q4R5S6T7V8W9CLAIM4"],
    );
    t.eq("pending_renders: …or one claimed by a render that died (running past its lease; not a live lease)", (await run("qa.renders2", { where: "pending_renders" })).seen, [STORE_A, STORE_B]);
    const stopAt = await SC.forEachStore(fctx, { job: "qa.stop", states: ["active"], budgetMs: 5_000, stop: () => stopSeen.length >= 2 }, async (_scope, store) => void stopSeen.push(store.id));
    t.eq("stop: true ends the call before the next store (done false)", [stopSeen, stopAt.done], [[STORE_A, STORE_B], false]);

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

  /* ================================================================ */
  h.section("renders", async (t) => {
    const RQ = await import("@/lib/jobs/renders");
    const RS = await import("@/lib/jobs/renders/sql");
    const RU = await import("@/lib/jobs/renders/rules");
    const R = await import("@/lib/jobs/runner");
    const { mintScope } = await import("@/lib/tenancy/seam");
    const { newId } = await import("@/lib/db/ids");
    const { getFixture } = await import("@/lib/page/fixtures");
    const { updateStoreSetting } = await import("@/lib/settings");
    type PlatformCtx = import("@/lib/tenancy/types").PlatformCtx;
    type WriteScope = import("@/lib/tenancy/types").WriteScope;
    type JobCtx = import("@/lib/jobs/runner").JobCtx;
    await pool().query("DELETE FROM render_jobs"); // the forEachStore section's probe rows
    const STORE_C = "01JB8ZK3Q4R5S6T7V8W9XYZ0CC"; // forEachStore's active store: the summary fixtures
    const scopeB = systemScope(ctx, STORE_B);
    const scopeC = systemScope(ctx, STORE_C);

    // seeded live pages (the argan fixture), as test:store seeds them: A has a v2 page, a runtime_v 1 page and a draft
    const fx = getFixture("argan", { now: "2026-10-24T12:00:00.000Z", locale: "fr" });
    const docJson = JSON.stringify({ ...fx.doc, seo: { ...fx.doc.seo, noindex: false } });
    const seedPage = async (storeId: string, slug: string, opts: { published: boolean; runtimeV?: number }) => {
      const id = newId();
      await pool().query("INSERT INTO pages (id, store_id, slug, name, status, locale, public_key, draft) VALUES (?, ?, ?, ?, ?, 'fr', ?, ?)", [id, storeId, slug, slug, opts.published ? "published" : "draft", `pk_${hex(12)}`, docJson]);
      if (!opts.published) return { id, versionId: null };
      const versionId = newId();
      const html = `<!DOCTYPE html><title>${slug}</title>`;
      await pool().query(
        "INSERT INTO page_versions (id, store_id, page_id, kind, doc, html, thank_you_html, csp, thank_you_csp, etag, checksum, runtime_v) VALUES (?, ?, ?, 'publish', ?, ?, ?, ?, ?, ?, ?, ?)",
        [versionId, storeId, id, docJson, html, `<!DOCTYPE html><title>merci ${slug}</title>`, "default-src 'self'", "default-src 'self'", sha(Buffer.from(html)), sha(Buffer.from(docJson)), opts.runtimeV ?? 2],
      );
      await pool().query("UPDATE pages SET published_version_id = ? WHERE id = ?", [versionId, id]);
      return { id, versionId };
    };
    const glow = await seedPage(STORE_A, "glow", { published: true });
    const retro = await seedPage(STORE_A, "retro", { published: true, runtimeV: 1 });
    const draft = await seedPage(STORE_A, "brouillon", { published: false });
    const pageB = await seedPage(STORE_B, "argan", { published: true });

    type Job = { id: string; store_id: string; page_id: string; reason: string; priority: number; dedupe: string | null; state: string; attempts: number; error: string | null; claim: string | null };
    const jobsOf = async (pageId: string) => ((await pool().query("SELECT * FROM render_jobs WHERE page_id = ? ORDER BY created_at, id", [pageId])) as unknown as [Job[]])[0];
    type Version = { id: string; doc: string; html: string; thank_you_html: string; csp: string; etag: string; checksum: string; runtime_v: number };
    const versionOf = async (id: string) => ((await pool().query("SELECT id, doc, html, thank_you_html, csp, etag, checksum, runtime_v FROM page_versions WHERE id = ?", [id])) as unknown as [Version[]])[0][0]!;
    const versionRows = async (pageId: string) => Number(((await pool().query("SELECT COUNT(*) AS n FROM page_versions WHERE page_id = ?", [pageId])) as unknown as [{ n: number }[]])[0][0]!.n);
    const refusal = async (fn: () => Promise<unknown>) => {
      try {
        await fn();
        return "ok";
      } catch (err) {
        return (err as { code?: string }).code ?? (err as Error).name;
      }
    };
    const jobCtx = (job: string, budgetMs = 10_000): JobCtx => ({ ...systemCtx(job), deadline: Date.now() + budgetMs, tickId: newId(), cursor: "", setCursor: async () => undefined, yield: async () => undefined, lagMs: () => 0 });
    const staffCtx = (can = true): PlatformCtx =>
      ({ user: { id: "01JB8ZK3Q4R5S6T7V8W9STAFF1" }, role: "super_admin", actor: { kind: "platform", userId: "01JB8ZK3Q4R5S6T7V8W9STAFF1", impersonatorId: null, ip: null }, can: () => can, stepUpFresh: false, stepUpUntil: null }) as unknown as PlatformCtx;

    // ---- enqueue
    t.eq("enqueueRenders(A, all-live): A's two live pages (not the draft)", await RQ.enqueueRenders(scopeA, "all-live", "store_info"), { enqueued: 2 });
    t.eq("…again while pending: nothing (one pending job per page, D25)", await RQ.enqueueRenders(scopeA, [glow.id, retro.id], "brand"), { enqueued: 0 });
    t.eq("…the pending job holds dedupe = its page id", (await jobsOf(glow.id)).map((j) => [j.state, j.dedupe, j.reason]), [["pending", glow.id, "store_info"]]);
    E.resetErrorBuffer();
    t.eq("store B's page id enqueued under A's scope inserts nothing", [await RQ.enqueueRenders(scopeA, [pageB.id, draft.id], "address"), (await jobsOf(pageB.id)).length], [{ enqueued: 1 }, 0]);
    // a fresh buffer's first flush is immediate (its timer may already have run): flush, then read the ring's table
    await E.flushErrors();
    const ring = ((await pool().query("SELECT store_id, route, count FROM error_events WHERE area = 'renders' AND code = 'foreign_page'")) as unknown as [{ store_id: string | null; route: string; count: number }[]])[0];
    t.check("…the foreign id counted in the error ring (renders / foreign_page, A, the reason's route)", ring.length === 1 && ring[0]!.store_id === STORE_A && ring[0]!.route === "renders:enqueue:address" && Number(ring[0]!.count) === 1, JSON.stringify(ring));
    E.resetErrorBuffer();
    await pool().query("DELETE FROM render_jobs WHERE page_id = ?", [draft.id]); // the draft's own job (a page of A): not needed here
    t.eq("an impersonation scope is refused", await refusal(() => RQ.enqueueRenders(mintScope("impersonation", STORE_A) as unknown as WriteScope, "all-live", "brand")), "impersonation_read_only");
    t.eq("a bad priority is refused", await refusal(() => RQ.enqueueRenders(scopeA, "all-live", "brand", 12)), "RangeError");

    // ---- the claim clears dedupe (ENGC-4), on the real table
    {
      const token = newId();
      const claimed = await RS.dbRenderRepo.claim(scopeA, 10, token);
      t.eq("claim: A's due jobs; B's scope claims none of A's", [claimed.map((j) => j.pageId).sort(), (await RS.dbRenderRepo.claim(scopeB, 10, newId())).length], [[glow.id, retro.id].sort(), 0]);
      t.eq("…running with dedupe NULL", (await jobsOf(glow.id)).map((j) => [j.state, j.dedupe, j.claim]), [["running", null, token]]);
      t.eq("an enqueue during the render inserts a second, pending job", await RQ.enqueueRenders(scopeA, [glow.id], "store_info"), { enqueued: 1 });
      const glowJob = claimed.find((j) => j.pageId === glow.id)!;
      const retroJob = claimed.find((j) => j.pageId === retro.id)!;
      t.eq("…a retry of the first behind it → superseded (UPDATE IGNORE)", await RS.dbRenderRepo.finish(scopeA, glowJob, token, { state: "pending", attempts: 1, retryInMs: 60_000, error: "TypeError" }), "superseded");
      t.eq("…B's scope cannot write A's outcome", await RS.dbRenderRepo.finish(scopeB, retroJob, token, { state: "done", error: null, requeue: false }), "lost");
      t.eq("…the rest of the claim released back to pending with its dedupe", await RS.dbRenderRepo.release(scopeA, [retroJob.id], token), { released: 1, superseded: 0 });
      t.eq("…glow: the old job skipped (superseded), the new one pending", (await jobsOf(glow.id)).map((j) => [j.state, j.error, j.dedupe]), [["skipped", "superseded", null], ["pending", null, glow.id]]);
    }

    // ---- the renders job: in place, then again after a store contact change (store_info)
    const before = await versionOf(glow.versionId!);
    const rowsBefore = await versionRows(glow.id);
    const r1 = await RQ.rendersJob(jobCtx("renders"));
    const v1 = await versionOf(glow.versionId!);
    t.check("rendersJob: one rendered, one skipped, done", r1.done && r1.summary?.rendered === 1 && r1.summary?.skipped === 1, JSON.stringify(r1));
    t.check("in place: same version row, html / etag / csp rewritten, the real document", v1.etag !== before.etag && v1.html !== before.html && v1.html.startsWith("<!DOCTYPE html>") && v1.html.includes(glow.versionId!) && v1.csp !== before.csp);
    t.eq("in place: doc, checksum and runtime_v unchanged; no version row created", [v1.doc === before.doc, v1.checksum, v1.runtime_v, await versionRows(glow.id)], [true, before.checksum, 2, rowsBefore]);
    t.eq("runtime_v 1 → skipped (runtime_v1), its version untouched", [(await jobsOf(retro.id)).map((j) => [j.state, j.error]), (await versionOf(retro.versionId!)).etag], [[["skipped", "runtime_v1"]], sha(Buffer.from("<!DOCTYPE html><title>retro</title>"))]);
    const phone = "+212612340077";
    await updateStoreSetting(scopeA, "store", { phone, whatsapp: phone }, { id: "system", kind: "system" });
    t.eq("a store contact change → enqueueRenders(store_info)", await RQ.enqueueRenders(scopeA, "all-live", "store_info"), { enqueued: 2 });
    await RQ.rendersJob(jobCtx("renders"));
    const v2 = await versionOf(glow.versionId!);
    t.check("…re-rendered in place: a new etag and html carrying the new contact", v2.etag !== v1.etag && v2.html !== v1.html && (v2.html.includes("612340077") || v2.thank_you_html.includes("612340077")), `${v1.etag} → ${v2.etag}`);
    t.eq("…doc, checksum, runtime_v and the row count still unchanged", [v2.doc === before.doc, v2.checksum, v2.runtime_v, await versionRows(glow.id)], [true, before.checksum, 2, rowsBefore]);
    const glowJobs = await jobsOf(glow.id);
    t.check("…every glow job finished (no error, or notes from the warn-mode gates ≤ 200)", glowJobs.filter((j) => j.state === "done").length === 2 && glowJobs.every((j) => j.error === null || j.error === "superseded" || (j.error.startsWith("notes:") && j.error.length <= 200)), JSON.stringify(glowJobs.map((j) => [j.state, j.error])));

    // ---- failures: 3 retries then failed (a live version whose doc no longer validates)
    {
      const bad = await seedPage(STORE_A, "casse", { published: true });
      await pool().query("UPDATE page_versions SET doc = '{\"v\":2}' WHERE id = ?", [bad.versionId]);
      await RQ.enqueueRenders(scopeA, [bad.id], "brand");
      const trail: string[] = [];
      for (let i = 0; i < 4; i++) {
        await RQ.rendersJob(jobCtx("renders"));
        const [j] = await jobsOf(bad.id);
        trail.push(`${j!.state}:${j!.attempts}`);
        // the fake clock: the backoff has passed
        await pool().query("UPDATE render_jobs SET not_before = UTC_TIMESTAMP(3) - INTERVAL 1 SECOND WHERE page_id = ? AND state = 'pending'", [bad.id]);
      }
      t.eq("a failing page: pending ×3 (1, 5, 30 min), then failed", trail, ["pending:1", "pending:2", "pending:3", "failed:4"]);
      const [failed] = await jobsOf(bad.id);
      t.check("…its code kept (invalid), never a message", failed!.error === "invalid", String(failed!.error));
      t.eq("retryFailedRenders(A) queues the failed page again", await RQ.retryFailedRenders(scopeA), { enqueued: 1 });
      t.eq("retryStoreRenders from the console needs domains.manage", await refusal(() => RQ.retryStoreRenders(staffCtx(false), STORE_A)), "forbidden");
      await pool().query("DELETE FROM render_jobs WHERE page_id = ?", [bad.id]);
      await pool().query("UPDATE pages SET status = 'draft', published_version_id = NULL WHERE id = ?", [bad.id]);
    }

    // ---- summaries on fixtures (store C: jobs only)
    {
      const pg = (n: number) => `01JB8ZK3Q4R5S6T7V8W9CP${String(n).padStart(4, "0")}`;
      const rows: unknown[][] = [];
      const add = (n: number, state: string, o: { reason?: string; doneMinAgo?: number; createdMinAgo?: number; error?: string | null } = {}) =>
        rows.push([newId(), STORE_C, pg(n), o.reason ?? "address", state, state === "pending" ? pg(n) : null, o.error ?? null, o.createdMinAgo ?? 0, o.doneMinAgo ?? null]);
      for (let i = 0; i < 30; i++) add(i, "pending", { createdMinAgo: i === 0 ? 61 : 5 });
      for (let i = 0; i < 12; i++) add(100 + i, "done", { doneMinAgo: 10 });
      for (let i = 0; i < 3; i++) add(200 + i, "skipped", { doneMinAgo: 20, error: "runtime_v1" });
      add(300, "done", { doneMinAgo: 55, error: "notes:budget:F5,honesty:D2" });
      add(301, "done", { doneMinAgo: 50, error: "notes:budget:F5" });
      add(302, "done", { doneMinAgo: 150 });
      add(400, "failed", { doneMinAgo: 120, error: "page_too_large" });
      add(401, "failed", { doneMinAgo: 125, error: "page_too_large", reason: "store_info" });
      add(402, "failed", { doneMinAgo: 30 * 60, error: "invalid" });
      for (const r of rows) {
        await pool().query(
          "INSERT INTO render_jobs (id, store_id, page_id, reason, state, dedupe, error, created_at, done_at) VALUES (?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(3) - INTERVAL ? MINUTE, IF(? IS NULL, NULL, UTC_TIMESTAMP(3) - INTERVAL ? MINUTE))",
          [...r.slice(0, 8), r[8], r[8]],
        );
      }
      const s = await RQ.renderSummary(scopeC);
      t.check("renderSummary(C): a job pending 61 min → oldestMin ≥ 61 (render_stuck), with its page", s.oldestMin !== null && s.oldestMin >= 61 && s.oldestPending?.pageId === pg(0) && s.oldestPending.slug === null, JSON.stringify(s.oldestPending));
      t.eq("…totals by state", [s.totals.pending, s.totals.done, s.totals.skipped, s.totals.failed], [30, 15, 3, 3]);
      t.eq("…throughput: 17 finished in the hour (12 + 3 + 2 done with notes), 0.3 / min; done 14", [s.finishedLastHour, s.throughputPerMin, s.doneLastHour], [17, 0.3, 14]);
      t.eq("…ETA = ceil(30 × 60 / 17) = 106 min", s.etaMin, 106);
      t.eq("…failures of 24 h (2, page_too_large) and the old one", [s.failed24h.map((f) => [f.storeId, f.count, f.error]), s.failedOld], [[[STORE_C, 2, "page_too_large"]], 1]);
      t.eq("…notes: 2 pages, the top ids", [s.notes, s.topNotes.map((n) => [n.id, n.count])], [2, [["budget:F5", 2], ["honesty:D2", 1]]]);
      t.eq("…by reason", s.byReason.map((r) => [r.reason, r.pending, r.done, r.failed]), [["address", 30, 15, 2], ["store_info", 0, 0, 1]]);
      const sumA = await RQ.renderSummary(scopeA);
      t.check("renderSummary(A) names nothing of C, and lists A's runtime_v 1 page for a manual republish", !JSON.stringify(sumA).includes(pg(0)) && !JSON.stringify(sumA).includes(STORE_C) && sumA.republish.some((p) => p.pageId === retro.id), JSON.stringify(sumA.republish));
      const sumB = await RQ.renderSummary(scopeB);
      t.check("renderSummary(B) names no page or job of A", ![glow.id, retro.id, STORE_A].some((id) => JSON.stringify(sumB).includes(id)));
      t.check("…never a document or HTML byte", !/DOCTYPE|"doc"|<html/i.test(JSON.stringify(s) + JSON.stringify(sumA)));
      const p = await RQ.platformRenderSummary();
      const total = Number(((await pool().query("SELECT COUNT(*) AS n FROM render_jobs")) as unknown as [{ n: number }[]])[0][0]!.n);
      t.eq("platformRenderSummary: every job counted once", Object.values(p.totals).reduce((n, v) => n + v, 0), total);
      t.check("…the oldest pending of any store (C's, 61 min), C first among the stores with failures", (p.oldestMin ?? 0) >= 61 && p.oldestPending?.storeId === STORE_C && p.stores[0]?.storeId === STORE_C && p.stores[0].failed === 3, JSON.stringify(p.stores.slice(0, 3)));
      const pa = await RQ.platformRenderSummary({ reason: "store_info" });
      t.eq("…narrowed to one reason (the Domains view uses address)", [pa.byReason.map((r) => r.reason), pa.totals.failed], [["store_info"], 1]);
      t.eq("renderSummary() without a scope is the platform summary", (await RQ.renderSummary()).totals, p.totals);
      await pool().query("DELETE FROM render_jobs WHERE store_id = ?", [STORE_C]);
      // a render that died: its expired lease is taken over by the claim, the lost try counted
      const dead = newId();
      await pool().query("INSERT INTO render_jobs (id, store_id, page_id, reason, state, attempts, claim, lease_until) VALUES (?, ?, ?, 'address', 'running', 1, 'DEADCLAIM0000000000000000A', UTC_TIMESTAMP(3) - INTERVAL 1 SECOND)", [dead, STORE_C, pg(999)]);
      const taken = await RS.dbRenderRepo.claim(scopeC, 10, newId());
      t.eq("the claim takes over an expired lease and counts the lost try", taken.map((j) => [j.id, j.attempts]), [[dead, 2]]);
      await pool().query("DELETE FROM render_jobs WHERE store_id = ?", [STORE_C]);
    }

    // ---- the fan-out (PLA-§16.2): the request returns at once, the job enqueues store by store
    {
      await pool().query("DELETE FROM render_jobs WHERE state = 'pending'");
      t.eq("enqueueRendersEverywhere without domains.manage → forbidden", await refusal(() => RQ.enqueueRendersEverywhere(staffCtx(false), "address")), "forbidden");
      t.eq("…a reason other than address / runtime is refused", await refusal(() => RQ.enqueueRendersEverywhere(staffCtx(), "brand" as "address")), "RangeError");
      const req = await RQ.enqueueRendersEverywhere(staffCtx(), "address");
      t.check("…started, nothing enqueued yet (the request returns at once)", req.started && req.fanout.stores === 0 && req.fanout.total >= 3 && !req.fanout.done && (await jobsOf(glow.id)).every((j) => j.state !== "pending"), JSON.stringify(req));
      const again = await RQ.enqueueRendersEverywhere(staffCtx(), "runtime");
      t.eq("…a second request while it runs → not started, the running one answered", [again.started, again.fanout.id, again.fanout.reason], [false, req.fanout.id, "address"]);
      const run = await RQ.rendersFanoutJob(jobCtx("renders.fanout"));
      const prog = await RQ.renderFanoutProgress();
      t.check("renders.fanout: every store handled, done, 100 %", run.done && prog?.done === true && prog.stores === req.fanout.total && prog.pct === 100 && prog.enqueued === run.processed, JSON.stringify([run, prog]));
      t.eq("…A's and B's live pages queued (address), store by store", [(await jobsOf(glow.id)).filter((j) => j.state === "pending").map((j) => j.reason), (await jobsOf(pageB.id)).map((j) => [j.state, j.reason])], [["address"], [["pending", "address"]]]);
      t.eq("…an idle run reads the row and does nothing", await RQ.rendersFanoutJob(jobCtx("renders.fanout")), { done: true, processed: 0 });
      // the runner's due keys (an hourly or daily job's) share the row: a fan-out write keeps them, and their merge keeps it
      const { dbJobState } = await import("@/lib/jobs/runs");
      await dbJobState.saveDue("renders.fanout", { lastHour: "2026-10-29T09", lastDay: null, fails: 0, failKey: null });
      const retry = await RQ.retryFailedEverywhere(staffCtx(), "address");
      t.check("a new request once it finished starts (Retry failed, address)", retry.started && retry.fanout.mode === "failed" && retry.fanout.id !== req.fanout.id);
      await RQ.rendersFanoutJob(jobCtx("renders.fanout"));
      // the cron: renders in slot 4 renders what the fan-out queued; the fan-out row keeps the runner's due keys
      const tick = await R.runTick();
      const state = ((await pool().query("SELECT state FROM cron_cursors WHERE job = 'renders.fanout'")) as unknown as [{ state: string }[]])[0][0]!.state;
      t.check("…the row keeps the fan-out and the runner's keys side by side", RU.parseFanout(state)?.id === retry.fanout.id && (JSON.parse(state) as { due?: { lastHour?: string } }).due?.lastHour === "2026-10-29T09", state);
      const runs = ((await pool().query("SELECT job, store_id, ok, processed, summary FROM job_runs WHERE tick_id = ? AND job IN ('renders', 'renders.fanout')", [tick.tickId])) as unknown as [{ job: string; store_id: string | null; ok: number; processed: number; summary: string | null }[]])[0];
      const rendersRun = runs.find((r) => r.job === "renders" && r.store_id === null);
      const sum = rendersRun?.summary ? (JSON.parse(rendersRun.summary) as Record<string, unknown>) : {};
      t.check("runTick(): renders ran in slot 4 within 12 s and rendered the fan-out's pages", rendersRun?.ok === 1 && sum.slot === "4" && Number(sum.budgetMs) <= 12_000 && Number(sum.rendered) >= 2, JSON.stringify(runs));
      t.check("…with per-store rows for A and B", [STORE_A, STORE_B].every((id) => runs.some((r) => r.job === "renders" && r.store_id === id)), JSON.stringify(runs.map((r) => [r.job, r.store_id])));
      t.check("…renders.fanout ran in slot 7", runs.some((r) => r.job === "renders.fanout" && r.store_id === null && (JSON.parse(r.summary ?? "{}") as { slot?: string }).slot === "7"));
      t.check("…job_runs hold counts only (no html, no doc)", !/DOCTYPE|"doc"/.test(JSON.stringify(runs)));
    }
  });

  /* ================================================================ */
  h.section("media", async (t) => {
    const sharp = (await import("sharp")).default;
    const MP = await import("@/lib/media/process");
    const MA = await import("@/lib/media/assets");
    const AR = await import("@/lib/storage/asset-refs");
    const U = await import("@/lib/tenancy/usage");
    const { invalidateStore } = await import("@/lib/tenancy/cache");
    const { invalidateEntitlements } = await import("@/lib/tenancy/entitlements");
    const { transitionStore } = await import("@/lib/tenancy/lifecycle");
    const { getPlatformSetting } = await import("@/lib/settings");
    const { newId } = await import("@/lib/db/ids");
    const mediaRoute = await import("@/app/media/[key]/route");
    type WriteScope = import("@/lib/tenancy/types").WriteScope;
    type PlatformCtx = import("@/lib/tenancy/types").PlatformCtx;
    type MediaStore = import("@/lib/media/quota").MediaStore;
    const env = process.env as Record<string, string | undefined>;
    const active: MediaStore = { status: "active", timezone: "Africa/Casablanca" };
    const scopeB = systemScope(ctx, STORE_B);
    const STORE_Q = "01JB8ZK3Q4R5S6T7V8W9XYZ0QQ"; // the quota race
    const STORE_P = "01JB8ZK3Q4R5S6T7V8W9XYZ0PP"; // a pending sandbox (D69)
    const STORE_S = "01JB8ZK3Q4R5S6T7V8W9XYZ0SS"; // suspended later (§A.5.3)
    for (const [id, status] of [
      [STORE_Q, "active"],
      [STORE_P, "pending"],
      [STORE_S, "active"],
    ] as const) {
      await db.insert(stores).values({ id, handle: `media-${id.slice(-2).toLowerCase()}`, name: id.slice(-2), status, brandSeed: "0123456789abcdef" });
    }
    const scopeQ = systemScope(ctx, STORE_Q);
    const scopeP = systemScope(ctx, STORE_P);
    const scopeS = systemScope(ctx, STORE_S);

    // ---- helpers: images, rows, files on disk, counters, pages, the public route
    const png = (w: number, hgt: number, alpha = false): Promise<Buffer> => {
      const ch = alpha ? 4 : 3;
      return sharp(randomBytes(w * hgt * ch), { raw: { width: w, height: hgt, channels: ch } }).png().toBuffer();
    };
    type FileRow = { key: string; storage: string; bytes: number; sha256: string };
    const fileRows = async (storeId: string, assetId?: string) =>
      ((await pool().query(`SELECT \`key\`, storage, bytes, sha256 FROM media_files WHERE store_id = ?${assetId ? " AND asset_id = ?" : ""} ORDER BY \`key\``, assetId ? [storeId, assetId] : [storeId])) as unknown as [FileRow[]])[0];
    const chunksOfAsset = async (assetId: string) =>
      Number(((await pool().query("SELECT COUNT(*) AS n FROM media_chunks c JOIN media_files f ON f.`key` = c.`key` WHERE f.asset_id = ?", [assetId])) as unknown as [{ n: number }[]])[0][0]!.n);
    const assetCount = async (storeId: string) => Number(((await pool().query("SELECT COUNT(*) AS n FROM assets WHERE store_id = ?", [storeId])) as unknown as [{ n: number }[]])[0][0]!.n);
    /** every file under the store's media folder (key → path) */
    const filesOnDisk = (storeId: string): Map<string, string> => {
      const out = new Map<string, string>();
      const root = join(DATA, "media", "v1", storeId.slice(0, 2), storeId);
      const walk = (dir: string) => {
        if (!existsSync(dir)) return;
        for (const e of readdirSync(dir, { withFileTypes: true })) {
          const p = join(dir, e.name);
          if (e.isDirectory()) walk(p);
          else out.set(e.name, p);
        }
      };
      walk(root);
      return out;
    };
    const gauge = async (storeId: string) =>
      Number(((await pool().query("SELECT value FROM store_usage WHERE store_id = ? AND metric = 'media_bytes' AND period = 'total'", [storeId])) as unknown as [{ value: number }[]])[0][0]?.value ?? 0);
    const pendingBudget = () => U.platformUsageValue("pending_media_bytes", "total");
    const docWith = (ids: readonly string[]) => JSON.stringify({ v: 2, locale: "fr", product: { images: ids.map((id) => ({ id, alt: "" })) }, items: [], offers: [], seo: {}, sections: [] });
    const seedPage = async (storeId: string, name: string, ids: readonly string[], opts: { live: boolean }) => {
      const id = newId();
      const slug = `${name}-${hex(2)}`;
      await pool().query("INSERT INTO pages (id, store_id, slug, name, status, locale, public_key, draft) VALUES (?, ?, ?, ?, ?, 'fr', ?, ?)", [id, storeId, slug, name, opts.live ? "published" : "draft", `pk_${hex(12)}`, docWith(ids)]);
      if (!opts.live) return id;
      const versionId = newId();
      const html = `<!DOCTYPE html><title>${slug}</title>`;
      await pool().query(
        "INSERT INTO page_versions (id, store_id, page_id, kind, doc, html, thank_you_html, csp, thank_you_csp, etag, checksum, runtime_v) VALUES (?, ?, ?, 'publish', ?, ?, ?, ?, ?, ?, ?, 2)",
        [versionId, storeId, id, docWith(ids), html, html, "default-src 'self'", "default-src 'self'", sha(Buffer.from(html)), sha(Buffer.from(docWith(ids)))],
      );
      await pool().query("UPDATE pages SET published_version_id = ? WHERE id = ?", [versionId, id]);
      return id;
    };
    const get = async (key: string, headers: Record<string, string> = {}, method: "GET" | "HEAD" = "GET") => {
      const req = new Request(`http://localhost:3451/media/${key}`, { method, headers: { "x-forwarded-for": "203.0.113.9", ...headers } });
      const handler = method === "GET" ? mediaRoute.GET : mediaRoute.HEAD;
      const res = await handler(req as unknown as Parameters<typeof mediaRoute.GET>[0], { params: Promise.resolve({ key }) });
      return { status: res.status, headers: res.headers, body: Buffer.from(await res.arrayBuffer()) };
    };
    const refusal = async (fn: () => Promise<unknown>): Promise<unknown> => {
      try {
        await fn();
        return null;
      } catch (err) {
        return err;
      }
    };
    const staffCtx = (): PlatformCtx =>
      ({ user: { id: "01JB8ZK3Q4R5S6T7V8W9STAFF1" }, role: "super_admin", actor: { kind: "platform", userId: "01JB8ZK3Q4R5S6T7V8W9STAFF1", impersonatorId: null, ip: null }, can: () => true, stepUpFresh: true, stepUpUntil: null }) as unknown as PlatformCtx;
    const upload = async (scope: WriteScope, store: MediaStore, data: Buffer, opts: import("@/lib/media/process").ProcessOptions = {}) => MP.processUpload(scope, store, Buffer.from(data), "photo.png", opts);

    t.eq("the fs backend is on (DATA_DIR passed its check)", (await S.mediaBackendReady()).kind, "fs");

    // ---- an fs-backend upload: files on disk, no chunk; stored_bytes = Σ files = the charge
    const photo1 = await png(48, 40);
    const g0 = await gauge(STORE_A);
    const a1 = await upload(scopeA, active, photo1);
    const rowsA1 = await fileRows(STORE_A, a1.asset.id);
    t.check("an upload on the fs backend: a new asset", !a1.deduped && rowsA1.length >= 2, JSON.stringify(rowsA1.map((r) => r.key)));
    t.check("…every file row says fs, and its file is at its path with its bytes", rowsA1.every((r) => r.storage === "fs" && existsSync(P.mediaFilePath(STORE_A, r.key)) && sha(readFileSync(P.mediaFilePath(STORE_A, r.key))) === r.sha256));
    t.eq("…and no media_chunks row", await chunksOfAsset(a1.asset.id), 0);
    const sum1 = rowsA1.reduce((n, r) => n + Number(r.bytes), 0);
    t.eq("stored_bytes = Σ the files = the gauge's charge", [Number(a1.asset.storedBytes), (await gauge(STORE_A)) - g0], [sum1, sum1]);
    const json1 = MA.assetToJson(a1.asset) as Record<string, unknown>;
    t.check("assetToJson carries neither the uploader nor the store (MED-06)", !("createdBy" in json1) && !("storeId" in json1) && !JSON.stringify(json1).includes(STORE_A));

    // ---- a same-store duplicate: deduped, nothing new stored or charged
    const filesA = filesOnDisk(STORE_A).size;
    const again = await upload(scopeA, active, photo1);
    t.eq("the same bytes again in the same store → deduped: true, the same asset", [again.deduped, again.asset.id], [true, a1.asset.id]);
    t.eq("…no new file, no new charge", [filesOnDisk(STORE_A).size, await gauge(STORE_A)], [filesA, g0 + sum1]);

    // ---- identical bytes in A and B: two ids, two file sets; deleting A's never touches B's
    const b1 = await upload(scopeB, active, photo1);
    const rowsB1 = await fileRows(STORE_B, b1.asset.id);
    t.check("identical bytes in B → another id, not deduped onto A's", !b1.deduped && b1.asset.id !== a1.asset.id);
    t.check("…other keys and other files (B's folder)", rowsB1.length === rowsA1.length && rowsB1.every((r) => !rowsA1.some((x) => x.key === r.key) && existsSync(P.mediaFilePath(STORE_B, r.key))));
    t.check("…the same bytes in both sets (the variants match one for one)", rowsB1.map((r) => r.sha256).sort().join() === rowsA1.map((r) => r.sha256).sort().join());
    t.eq("deleting A's (no page uses it) → deleted", await MA.deleteAsset(scopeA, active, a1.asset.id), true);
    t.check("…A's rows and files are gone", (await fileRows(STORE_A, a1.asset.id)).length === 0 && rowsA1.every((r) => !existsSync(P.mediaFilePath(STORE_A, r.key))));
    t.check("…B's rows and files are all there, served with their bytes", (await fileRows(STORE_B, b1.asset.id)).length === rowsB1.length && rowsB1.every((r) => sha(readFileSync(P.mediaFilePath(STORE_B, r.key))) === r.sha256));
    t.eq("…and A's gauge is refunded", await gauge(STORE_A), g0);
    t.eq("B's scope cannot delete A's id (answers like a missing one)", await MA.deleteAsset(scopeB, active, (await upload(scopeA, active, await png(41, 33))).asset.id), false);

    // ---- the deduped race (§G.4 step 6): two storage halves of the same bytes in one store, side by side
    const twin = await png(46, 42);
    const halves = await Promise.all([MP.prepareUpload(scopeA, Buffer.from(twin), "twin-1.png"), MP.prepareUpload(scopeA, Buffer.from(twin), "twin-2.png")]);
    const gTwin = await gauge(STORE_A);
    const twins = await Promise.all(halves.map((p) => ("ready" in p ? MP.persistUpload(scopeA, active, p.ready) : Promise.resolve(p.done))));
    const twinRows = await fileRows(STORE_A, twins[0].asset.id);
    t.check("two uploads of the same bytes at once: one stored, the other deduped onto it", twins[0].asset.id === twins[1].asset.id && twins.filter((r) => r.deduped).length === 1, JSON.stringify(twins.map((r) => r.deduped)));
    t.check("…the loser removed none of the winner's files (every row's file on disk with its bytes)", twinRows.length > 0 && twinRows.every((r) => existsSync(P.mediaFilePath(STORE_A, r.key)) && sha(readFileSync(P.mediaFilePath(STORE_A, r.key))) === r.sha256));
    t.eq("…charged once (the loser's charge given back)", (await gauge(STORE_A)) - gTwin, twinRows.reduce((n, r) => n + Number(r.bytes), 0));

    // ---- the public route: fs and db rows byte-identical, Range included; HEAD; the key regex first
    const photo2 = await png(64, 48);
    const fsUp = await upload(scopeA, active, photo2);
    delete env.DATA_DIR;
    t.eq("DATA_DIR unset → the db backend (fallback)", [(await S.runMediaStorageCheck({ force: true })).ok, (await S.mediaBackendReady()).kind], [false, "db"]);
    const dbUp = await upload(scopeB, active, photo2);
    env.DATA_DIR = DATA;
    t.eq("…restored: fs again", [(await S.runMediaStorageCheck({ force: true })).ok, (await S.mediaBackendReady()).kind], [true, "fs"]);
    const fsRows = await fileRows(STORE_A, fsUp.asset.id);
    const dbRows = await fileRows(STORE_B, dbUp.asset.id);
    t.check("one upload on each backend (fs rows without chunks, db rows with)", fsRows.every((r) => r.storage === "fs") && dbRows.every((r) => r.storage === "db") && (await chunksOfAsset(fsUp.asset.id)) === 0 && (await chunksOfAsset(dbUp.asset.id)) >= dbRows.length);
    const suffix = (k: string) => k.slice(k.indexOf("-"));
    let same = 0;
    for (const fr of fsRows) {
      const dr = dbRows.find((r) => suffix(r.key) === suffix(fr.key));
      if (!dr) continue;
      const [a, b] = [await get(fr.key), await get(dr.key)];
      const hdr = (x: typeof a) => ["content-type", "etag", "cache-control", "accept-ranges", "x-content-type-options", "content-security-policy", "cross-origin-resource-policy", "content-length"].map((n) => x.headers.get(n));
      if (a.status === 200 && b.status === 200 && a.body.equals(b.body) && JSON.stringify(hdr(a)) === JSON.stringify(hdr(b))) same++;
      const end = Math.min(60, Number(fr.bytes) - 1);
      const [ra, rb] = [await get(fr.key, { range: `bytes=5-${end}` }), await get(dr.key, { range: `bytes=5-${end}` })];
      if (!(ra.status === 206 && rb.status === 206 && ra.body.equals(rb.body) && ra.body.equals(a.body.subarray(5, end + 1)) && ra.headers.get("content-range") === rb.headers.get("content-range"))) same = -1000;
      const [sa, sb] = [await get(fr.key, { range: "bytes=-10" }), await get(dr.key, { range: "bytes=-10" })];
      if (!(sa.status === 206 && sa.body.equals(sb.body) && sa.body.equals(a.body.subarray(a.body.length - 10)))) same = -1000;
    }
    t.check("GET of every fs file and its db twin: the same bytes and headers; the same ranges (bytes=5-60, bytes=-10)", same === fsRows.length && same > 0, `matched ${same} of ${fsRows.length}`);
    const probe = await get(fsRows[0]!.key);
    t.eq("…immutable, sandboxed, nosniff, cross-origin embeddable", [probe.headers.get("cache-control"), probe.headers.get("content-security-policy"), probe.headers.get("x-content-type-options"), probe.headers.get("cross-origin-resource-policy")], ["public, max-age=31536000, immutable", "default-src 'none'; sandbox", "nosniff", "cross-origin"]);
    const head = await get(fsRows[0]!.key, {}, "HEAD");
    t.check("HEAD: the headers, no body", head.status === 200 && head.body.length === 0 && head.headers.get("content-length") === String(fsRows[0]!.bytes));
    t.eq("If-None-Match → 304", (await get(fsRows[0]!.key, { "if-none-match": `"${fsRows[0]!.sha256}"` })).status, 304);
    t.eq("an unsatisfiable range → 416", (await get(fsRows[0]!.key, { range: `bytes=${fsRows[0]!.bytes}-` })).status, 416);
    const unknown = await get(`${hex(16)}-640.webp`);
    t.eq("an unknown key → 404", unknown.status, 404);
    for (const bad of ["..%2F..%2Fetc%2Fpasswd", "x".repeat(30), `${hex(16)}-640.exe`]) t.eq(`a key that fails the regex → 404 (${bad.slice(0, 16)}…)`, (await get(bad)).status, 404);
    // a missing fs file: a 404 (counted), never a 503 a client would retry, never another file
    const victim = fsRows[fsRows.length - 1]!;
    rmSync(P.mediaFilePath(STORE_A, victim.key));
    store.evictKeys([victim.key]);
    t.eq("a row whose fs file is missing → 404", (await get(victim.key)).status, 404);

    // ---- a suspended store's key → the neutral 404; pending and restricted are served (§A.5.3, §G.6)
    const sUp = await upload(scopeS, active, await png(40, 36));
    const sKey = (await fileRows(STORE_S, sUp.asset.id))[0]!.key;
    t.eq("an active store's key → 200", (await get(sKey)).status, 200);
    const answers: Record<string, number> = {};
    for (const status of ["restricted", "suspended", "closed", "pending"] as const) {
      await pool().query("UPDATE stores SET status = ? WHERE id = ?", [status, STORE_S]);
      invalidateStore(STORE_S);
      answers[status] = (await get(sKey)).status;
    }
    t.eq("restricted 200, suspended 404, closed 404, pending 200", answers, { restricted: 200, suspended: 404, closed: 404, pending: 200 });
    await pool().query("UPDATE stores SET status = 'suspended' WHERE id = ?", [STORE_S]);
    invalidateStore(STORE_S);
    const susp = await get(sKey);
    t.check("…a suspended store's key answers exactly like an unknown key (status, body, cache headers)", susp.status === 404 && susp.body.equals(unknown.body) && susp.headers.get("cache-control") === unknown.headers.get("cache-control") && susp.headers.get("etag") === null);

    // ---- asset_refs: the store's own assets only, one owner's rows replaced, deadlocks retried
    const photo4 = await png(52, 44);
    const p4A = (await upload(scopeA, active, photo4)).asset.id;
    const p4B = (await upload(scopeB, active, photo4)).asset.id;
    const refsOf = async (storeId: string, ownerId: string) =>
      ((await pool().query("SELECT asset_id, owner_kind, live FROM asset_refs WHERE store_id = ? AND owner_id = ? ORDER BY asset_id", [storeId, ownerId])) as unknown as [{ asset_id: string; owner_kind: string; live: number }[]])[0];
    const ownerB = newId();
    t.eq("syncAssetRefs(B, …, [A's id, B's id, junk]) indexes B's own id only", [await AR.syncAssetRefs(scopeB, "page", ownerB, [p4A, p4B, "zz"], { live: false }), (await refsOf(STORE_B, ownerB)).map((r) => r.asset_id)], [{ refs: 1 }, [p4B]]);
    t.eq("…no row of A was written", (await refsOf(STORE_A, ownerB)).length, 0);
    t.eq("a second sync replaces the owner's rows (live flag included)", [await AR.syncAssetRefs(scopeB, "page", ownerB, [p4B], { live: true }), (await refsOf(STORE_B, ownerB)).map((r) => [r.asset_id, r.live])], [{ refs: 1 }, [[p4B, 1]]]);
    t.eq("…an empty list removes them", [await AR.syncAssetRefs(scopeB, "page", ownerB, [], { live: false }), (await refsOf(STORE_B, ownerB)).length], [{ refs: 0 }, 0]);
    t.eq("an unknown owner kind is refused", ((await refusal(() => AR.syncAssetRefs(scopeB, "nope" as "page", ownerB, [], { live: false }))) as Error | null)?.name, "RangeError");
    const extra = (await upload(scopeB, active, await png(42, 36))).asset.id;
    const syncs = await Promise.allSettled(Array.from({ length: 10 }, (_, i) => AR.syncAssetRefs(scopeB, "page", ownerB, i % 2 ? [p4B] : [p4B, extra], { live: false })));
    const finalRefs = (await refsOf(STORE_B, ownerB)).map((r) => r.asset_id);
    t.check("10 parallel syncs of one owner all succeed and leave one of the lists (never a mix)", syncs.every((s) => s.status === "fulfilled") && (finalRefs.join() === [p4B].join() || finalRefs.join() === [p4B, extra].sort().join()), JSON.stringify([syncs.map((s) => s.status), finalRefs]));
    await AR.syncAssetRefs(scopeB, "page", ownerB, [], { live: false });

    // ---- the delete: 409 with this store's page names only; allowed when only B uses the same bytes
    const liveA = await seedPage(STORE_A, "argan-live", [p4A], { live: true });
    const draftA = await seedPage(STORE_A, "argan-draft", [p4A], { live: false });
    const liveB = await seedPage(STORE_B, "b-secret-page", [p4A, p4B], { live: true }); // B's document names A's id too
    const usageA = await AR.assetUsage(scopeA, p4A);
    // the live page's draft is the document it published, so it shows the file too (live first, then by page name)
    t.eq("assetUsage(A): A's live version, then the drafts that show it (the draft page's, the live page's), nothing of B", usageA.map((u) => [u.ownerKind, u.pageId, u.live]), [
      ["page_version", liveA, true],
      ["page", draftA, false],
      ["page", liveA, false],
    ]);
    t.eq("assetUsage(B, A's id) → [] (B's document naming it is not B's asset)", await AR.assetUsage(scopeB, p4A), []);
    t.eq("livePagesUsing(A) → A's live page; livePagesUsing(B, A's id) → []", [await AR.livePagesUsing(scopeA, p4A), await AR.livePagesUsing(scopeB, p4A)], [[liveA], []]);
    const refused = await refusal(() => MA.deleteAsset(scopeA, active, p4A));
    t.check("deleteAsset of a file a live page of A shows → AssetInUseError", refused instanceof MA.AssetInUseError);
    const body409 = refused instanceof MA.AssetInUseError ? MA.inUseAnswer(refused.usage) : null;
    t.eq("…the 409 lists A's live page only (never B's page, never a draft as live)", body409 && [body409.pages.map((p) => p.id), body409.storeLogo, body409.message], [[liveA], false, "This file is shown on a live page. Confirm to delete it anyway."]);
    t.check("…and nothing of B in it", !!body409 && !JSON.stringify(body409).includes("b-secret-page") && !JSON.stringify(body409).includes(liveB));
    t.check("…the asset and its files are still there", (await fileRows(STORE_A, p4A)).length > 0 && (await fileRows(STORE_A, p4A)).every((r) => existsSync(P.mediaFilePath(STORE_A, r.key))));
    const photo5 = await png(50, 46);
    const p5A = (await upload(scopeA, active, photo5)).asset.id;
    const p5B = (await upload(scopeB, active, photo5)).asset.id;
    await seedPage(STORE_B, "b-uses-its-own", [p5B], { live: true });
    t.eq("the same bytes used only by B's live page: A's delete is allowed", await MA.deleteAsset(scopeA, active, p5A), true);
    t.check("…B's copy is untouched", (await fileRows(STORE_B, p5B)).every((r) => existsSync(P.mediaFilePath(STORE_B, r.key))) && (await AR.livePagesUsing(scopeB, p5B)).length === 1);
    const p6A = (await upload(scopeA, active, await png(47, 39))).asset.id;
    await seedPage(STORE_B, "b-names-a", [p6A], { live: true });
    t.eq("A's id named only in B's live document: A's delete is allowed", await MA.deleteAsset(scopeA, active, p6A), true);
    // the brand logo: through the index (owner brand, live), then through the scan of the setting
    const p7A = (await upload(scopeA, active, await png(45, 45))).asset.id;
    await AR.syncAssetRefs(scopeA, "brand", "brand", [p7A], { live: true });
    const logoRefused = await refusal(() => MA.deleteAsset(scopeA, active, p7A));
    t.eq("an indexed brand logo → refused, storeLogo: true", logoRefused instanceof MA.AssetInUseError ? [MA.inUseAnswer(logoRefused.usage).storeLogo, MA.inUseAnswer(logoRefused.usage).message] : null, [true, "This file is shown on your store logo. Confirm to delete it anyway."]);
    await AR.syncAssetRefs(scopeA, "brand", "brand", [], { live: true });
    const { updateStoreSetting } = await import("@/lib/settings");
    await updateStoreSetting(scopeA, "brand", (v) => ({ logo: { ...v.logo, primary: p7A } }), { id: "system", kind: "system" });
    t.check("the logo in the brand setting (not indexed yet) → refused as well", (await refusal(() => MA.deleteAsset(scopeA, active, p7A))) instanceof MA.AssetInUseError);
    t.eq("assetUsageByPage: the dashboard's shape", await AR.assetUsageByPage(scopeA, p4A), {
      pages: [
        { id: liveA, name: "argan-live", slug: (usageA[0]!.pageSlug ?? ""), inDraft: true, live: true },
        { id: draftA, name: "argan-draft", slug: (usageA[1]!.pageSlug ?? ""), inDraft: true, live: false },
      ],
      storeLogo: false,
    });
    // a confirmed delete (force): rows, refs and files go; the gauge is refunded
    await AR.syncAssetRefs(scopeA, "page", draftA, [p4A], { live: false });
    const p4Rows = await fileRows(STORE_A, p4A);
    const gBefore = await gauge(STORE_A);
    t.eq("force → deleted", await MA.deleteAsset(scopeA, active, p4A, { force: true }), true);
    const refsLeft = Number(((await pool().query("SELECT COUNT(*) AS n FROM asset_refs WHERE store_id = ? AND asset_id = ?", [STORE_A, p4A])) as unknown as [{ n: number }[]])[0][0]!.n);
    t.check("…its rows, its refs and its files are gone, the gauge refunded", (await fileRows(STORE_A, p4A)).length === 0 && refsLeft === 0 && p4Rows.every((r) => !existsSync(P.mediaFilePath(STORE_A, r.key))) && (await gauge(STORE_A)) === gBefore - p4Rows.reduce((n, r) => n + Number(r.bytes), 0));
    t.check("…B's twin of the same bytes is untouched", (await fileRows(STORE_B, p4B)).every((r) => existsSync(P.mediaFilePath(STORE_B, r.key))));

    // ---- the cutout: one render per live page of A that shows the source, after the upload (DES-§4.11)
    const photo9 = await png(56, 48);
    const p9A = (await upload(scopeA, active, photo9)).asset.id;
    const live1 = await seedPage(STORE_A, "cut-one", [p9A], { live: true });
    const live2 = await seedPage(STORE_A, "cut-two", [p9A, p7A], { live: true });
    const draft9 = await seedPage(STORE_A, "cut-draft", [p9A], { live: false });
    const other = await seedPage(STORE_A, "cut-unrelated", [p7A], { live: true });
    const bPage = await seedPage(STORE_B, "b-cut", [p9A], { live: true });
    const jobs = async (pageId: string) => ((await pool().query("SELECT reason, state FROM render_jobs WHERE page_id = ?", [pageId])) as unknown as [{ reason: string; state: string }[]])[0];
    const cutout = await png(56, 48, true);
    const cut = await upload(scopeA, active, cutout, { cutout: true, sourceAssetId: p9A });
    t.check("a cutout with the store's own photo as its source: stored with the source", !cut.deduped && cut.asset.sourceAssetId === p9A);
    t.eq("…exactly one cutout render per live page that shows the source", [await jobs(live1), await jobs(live2)], [[{ reason: "cutout", state: "pending" }], [{ reason: "cutout", state: "pending" }]]);
    t.eq("…none for the draft, a live page without the source, or B's page naming A's id", [(await jobs(draft9)).length, (await jobs(other)).length, (await jobs(bPage)).length], [0, 0, 0]);
    await upload(scopeA, active, cutout, { cutout: true, sourceAssetId: p9A });
    t.eq("the same cutout again (deduped) queues nothing more", [(await jobs(live1)).length, (await jobs(live2)).length], [1, 1]);
    const b9 = (await upload(scopeB, active, await png(43, 37))).asset.id;
    const cross = await upload(scopeA, active, await png(44, 38, true), { cutout: true, sourceAssetId: b9 });
    t.check("a cutout naming B's photo as its source: the source is dropped (MED-02), nothing queued for B", cross.asset.sourceAssetId === null && (await jobs(bPage)).length === 0);

    // ---- the quota race: 20 parallel storage halves at the limit → exactly the allowed ones, no orphan file
    const tmpBefore = new Set(tmpEntries());
    const readies: import("@/lib/media/process").PreparedUpload[] = [];
    for (let i = 0; i < 20; i++) {
      const p = await MP.prepareUpload(scopeQ, await png(36 + (i % 5), 34 + (i % 3)), `race-${i}.png`);
      if ("ready" in p) readies.push(p.ready);
    }
    const sizes = readies.map((r) => r.asset.files.reduce((n, f) => n + f.data.length, 0));
    const limit = Math.floor((sizes.reduce((a, b) => a + b, 0) / sizes.length) * 10.5);
    await pool().query("INSERT INTO store_entitlements (store_id, `key`, source, value, set_by, reason) VALUES (?, 'media_bytes', 'override', ?, ?, 'qa quota race')", [STORE_Q, String(limit), "01JB8ZK3Q4R5S6T7V8W9STAFF1"]);
    invalidateEntitlements(STORE_Q);
    const race = await Promise.allSettled(readies.map((r) => MP.persistUpload(scopeQ, active, r)));
    const okIdx = race.flatMap((r, i) => (r.status === "fulfilled" ? [i] : []));
    const refusedIdx = race.flatMap((r, i) => (r.status === "rejected" && r.reason instanceof U.QuotaError ? [i] : []));
    const okBytes = okIdx.reduce((n, i) => n + sizes[i]!, 0);
    t.check("20 parallel uploads at the limit: each one stored or refused for the quota, nothing else", readies.length === 20 && okIdx.length + refusedIdx.length === 20 && okIdx.length > 0 && refusedIdx.length > 0, `${okIdx.length} stored, ${refusedIdx.length} refused of ${readies.length}`);
    t.check("…the stored ones fit and no refused one would have fit (exactly the allowed ones)", okBytes <= limit && refusedIdx.every((i) => sizes[i]! > limit - okBytes), JSON.stringify({ limit, okBytes, refused: refusedIdx.map((i) => sizes[i]) }));
    t.eq("…the gauge is exactly what is stored", await gauge(STORE_Q), okBytes);
    const qRows = await fileRows(STORE_Q);
    const qDisk = filesOnDisk(STORE_Q);
    t.check("…no orphan file: the files on disk are exactly the rows'", (await assetCount(STORE_Q)) === okIdx.length && qRows.length === qDisk.size && qRows.every((r) => qDisk.has(r.key)), `${qRows.length} rows, ${qDisk.size} files`);
    t.check("…and no temp file left", tmpEntries().every((e) => tmpBefore.has(e)));
    const quota = refusedIdx.length ? (race[refusedIdx[0]!] as PromiseRejectedResult).reason : null;
    const answer = quota instanceof U.QuotaError ? MP.quotaRefusal(quota) : null;
    t.eq("the route's answer: 413 { error: quota } with the store's message", answer && [answer.status, answer.body.error, answer.body.message], [413, "quota", MP.QUOTA_MESSAGES.store]);
    t.check("…never a figure (no limit, usage or percentage)", !!answer && !/\d|%/.test(answer.body.message));

    // ---- D69: a pending store charges the shared sandbox budget first, and gets it back when it leaves pending
    const pending: MediaStore = { status: "pending", timezone: "Africa/Casablanca" };
    const MiB = 1024 * 1024;
    const budget = (await getPlatformSetting("platform")).signup.pendingMediaTotalMiB * MiB;
    const shared0 = await pendingBudget();
    const filler = budget - shared0 - 200; // 200 bytes of headroom: less than any upload
    await U.chargePlatformUsage("pending_media_bytes", "total", filler, { limit: budget });
    const full = await refusal(() => upload(scopeP, pending, photo2));
    t.check("the shared budget full → QuotaError on pending_media_bytes", full instanceof U.QuotaError && (full as InstanceType<typeof U.QuotaError>).metric.metric === "pending_media_bytes");
    t.eq("…the store's own gauge was never charged (the shared budget is charged first), nothing stored", [await gauge(STORE_P), await assetCount(STORE_P), filesOnDisk(STORE_P).size], [0, 0, 0]);
    t.eq("…the route's message is the sandbox one", full instanceof U.QuotaError ? MP.quotaRefusal(full).body.message : null, MP.QUOTA_MESSAGES.pending);
    await U.refundPlatformUsage("pending_media_bytes", "total", filler);
    await pool().query("INSERT INTO store_entitlements (store_id, `key`, source, value, set_by, reason) VALUES (?, 'media_bytes', 'override', '1000', ?, 'qa pending cap')", [STORE_P, "01JB8ZK3Q4R5S6T7V8W9STAFF1"]);
    invalidateEntitlements(STORE_P);
    const own = await refusal(() => upload(scopeP, pending, photo2));
    t.check("the store's own cap refuses → its shared charge is given back", own instanceof U.QuotaError && (own as InstanceType<typeof U.QuotaError>).metric.metric === "media_bytes" && (await pendingBudget()) === shared0);
    await pool().query("DELETE FROM store_entitlements WHERE store_id = ?", [STORE_P]);
    invalidateEntitlements(STORE_P);
    const pUp = await upload(scopeP, pending, photo2);
    const pBytes = Number(pUp.asset.storedBytes);
    t.eq("an upload in budget: both counters charged with stored_bytes", [(await pendingBudget()) - shared0, await gauge(STORE_P)], [pBytes, pBytes]);
    await transitionStore(staffCtx(), STORE_P, "active", { reason: "qa_approved" });
    t.eq("pending → active: the shared budget gets the store's bytes back, the store keeps its gauge", [await pendingBudget(), await gauge(STORE_P)], [shared0, pBytes]);
  });

  /* ================================================================ */
  h.section("storage-jobs", async (t) => {
    const sharp = (await import("sharp")).default;
    const MP = await import("@/lib/media/process");
    const MIG = await import("@/lib/jobs/storage/migrate");
    const { mediaSweepJob } = await import("@/lib/jobs/storage/sweep");
    const { storageWalkJob } = await import("@/lib/jobs/storage/walk");
    const { usageReconcileJob } = await import("@/lib/jobs/storage/usage");
    const { refsReconcileJob } = await import("@/lib/jobs/storage/refs");
    const ST = await import("@/lib/jobs/storage/state");
    const U = await import("@/lib/tenancy/usage");
    const W = await import("@/lib/storage/walk");
    const { newId } = await import("@/lib/db/ids");
    const { updateStoreSetting } = await import("@/lib/settings");
    type JobCtx = import("@/lib/jobs/runner").JobCtx;
    type JobResult = import("@/lib/jobs/runner").JobResult;
    const env = process.env as Record<string, string | undefined>;
    const STORE_M = "01JB8ZK3Q4R5S6T7V8W9XYZ0MM"; // the storage jobs' active store
    const STORE_N = "01JB8ZK3Q4R5S6T7V8W9XYZ0NN"; // a pending store (D69)
    const STORE_R = "01JB8ZK3Q4R5S6T7V8W9XYZ0RR"; // fs rows, no folder at all
    const STORE_X = "01JB8ZK3Q4R5S6T7V8W9XYZ0XX"; // a folder on disk, no store row (purged)
    for (const [id, status] of [
      [STORE_M, "active"],
      [STORE_N, "pending"],
      [STORE_R, "active"],
    ] as const) {
      await db.insert(stores).values({ id, handle: `jobs-${id.slice(-2).toLowerCase()}`, name: id.slice(-2), status, brandSeed: "0123456789abcdef" });
    }
    const scopeM = systemScope(ctx, STORE_M);
    const scopeN = systemScope(ctx, STORE_N);
    const jobCtx = (job: string, budgetMs = 60_000): JobCtx => ({
      ...systemCtx(job),
      deadline: Date.now() + budgetMs,
      tickId: newId(),
      cursor: "",
      setCursor: async () => undefined,
      yield: () => new Promise<void>((r) => setImmediate(r)),
      lagMs: () => 0,
    });
    /** runs a job like the runner would, tick after tick, until it answers done (or `max` ticks) */
    const untilDone = async (job: string, run: (c: JobCtx) => Promise<JobResult>, budgetMs = 60_000, max = 400) => {
      const results: JobResult[] = [];
      for (let i = 0; i < max; i++) {
        const r = await run(jobCtx(job, budgetMs));
        results.push(r);
        if (r.done) break;
      }
      return results;
    };
    const putDb = async (scope: WriteScope, data: Buffer, key = newKey()) => {
      const conn = await pool().getConnection();
      try {
        await conn.beginTransaction();
        await files.insertStoreFiles(conn, scope, key.split("-")[0]!, [{ key, mime: "image/webp", data }]);
        await conn.commit();
      } finally {
        conn.release();
      }
      files.forgetMisses([key]);
      return key;
    };
    type WriteScope = import("@/lib/tenancy/types").WriteScope;
    const storageOf = async (key: string) => ((await pool().query("SELECT storage FROM media_files WHERE `key` = ?", [key])) as unknown as [{ storage: string }[]])[0][0]?.storage ?? null;
    /** the error ring's count for (media, code, store): the buffer plus what a 30 s flush already wrote */
    const errorsOf = async (code: string, storeId: string) => {
      const buffered = E.pendingErrors().filter((e) => e.area === "media" && e.code === code && e.storeId === storeId).reduce((n, e) => n + e.count, 0);
      const [rows] = (await pool().query("SELECT COALESCE(SUM(count), 0) AS n FROM error_events WHERE area = 'media' AND code = ? AND store_id = ?", [code, storeId])) as unknown as [{ n: number }[]];
      return buffered + Number(rows[0]?.n ?? 0);
    };
    const hoursAgo = (path: string, hours: number) => {
      const at = new Date(Date.now() - hours * 3_600_000);
      utimesSync(path, at, at);
    };
    t.eq("the fs backend is on (DATA_DIR passed its check)", (await S.runMediaStorageCheck({ force: true })).ok, true);

    // ---- media.migrate (§G.3): db → fs, ≤ 50 a tick, idempotent, bad chunks left and reported
    MIG.resetMigrateIdle();
    await untilDone("media.migrate", MIG.mediaMigrateJob); // the earlier sections' db rows go first
    const [left0] = (await pool().query("SELECT COUNT(*) AS n FROM media_files WHERE storage = 'db'")) as unknown as [{ n: number }[]];
    t.eq("the migrator drains every db row of every store first", Number(left0[0]!.n), 0);
    t.eq("…then a run finds no work and returns at once (idle for the hour)", (await MIG.mediaMigrateJob(jobCtx("media.migrate"))).summary, { idle: true, bad: 0 });
    const big = randomBytes(store.CHUNK_SIZE * 2 + 777);
    const smalls = [randomBytes(1_000), randomBytes(70_000)];
    const kBig = await putDb(scopeM, big);
    const kSmall = await Promise.all(smalls.map((d) => putDb(scopeM, d)));
    t.eq("…a db row written meanwhile waits for the idle hour", (await MIG.mediaMigrateJob(jobCtx("media.migrate"))).summary, { idle: true });
    // an interrupted slice: its put landed, the tick died before the flip
    await fsStorage.put({ storeId: STORE_M, key: kBig, assetId: kBig.split("-")[0]!, mime: "image/webp", bytes: big.length, sha256: sha(big) }, big);
    const kBad = await putDb(scopeM, randomBytes(2_000));
    await pool().query("UPDATE media_chunks SET data = ? WHERE `key` = ? AND idx = 0", [randomBytes(2_000), kBad]);
    const kGone = await putDb(scopeM, randomBytes(500));
    await pool().query("DELETE FROM media_chunks WHERE `key` = ?", [kGone]);
    const { forEachStore } = await import("@/lib/jobs/scope");
    const withDb: string[] = [];
    await forEachStore(ctx, { job: "qa.pending-media", states: ["pending", "active", "restricted", "suspended", "closed"], budgetMs: 10_000, where: "pending_media_db" }, async (_s, st) => void withDb.push(st.id));
    t.eq("forEachStore pending_media_db: only the store with db rows", withDb, [STORE_M]);
    MIG.resetMigrateIdle();
    const errBefore = [await errorsOf("file_mismatch", STORE_M), await errorsOf("missing_file", STORE_M)];
    const m1 = await MIG.mediaMigrateJob(jobCtx("media.migrate"));
    t.eq("one run moves the good files", [m1.summary?.moved, m1.processed], [3, 3]);
    const good = [kBig, ...kSmall];
    t.eq("…their rows flip to fs", await Promise.all(good.map(storageOf)), ["fs", "fs", "fs"]);
    t.eq("…their chunks are deleted", await Promise.all(good.map(chunkCount)), [0, 0, 0]);
    t.check("…the bytes on disk are identical", [big, ...smalls].every((d, i) => readFileSync(P.mediaFilePath(STORE_M, good[i]!)).equals(d)));
    t.check("…and the chunk store serves them from DATA_DIR", (await store.getMediaFile(kBig))?.data.equals(big) === true);
    t.eq("a key whose chunks do not make its row stays db with its chunks", [await storageOf(kBad), await chunkCount(kBad)], ["db", 1]);
    t.eq("…and one with no chunk at all stays db", await storageOf(kGone), "db");
    t.eq("…both reported in the error ring", [(await errorsOf("file_mismatch", STORE_M)) - errBefore[0]!, (await errorsOf("missing_file", STORE_M)) - errBefore[1]!], [1, 1]);
    t.eq("…and remembered, so they never take a tick's budget again", [...((await ST.readJobState("media.migrate")).bad as string[])].sort(), [kBad, kGone].sort());
    MIG.resetMigrateIdle();
    const m2 = await MIG.mediaMigrateJob(jobCtx("media.migrate"));
    t.eq("a second run is a no-op (the bad keys aside, nothing is left)", [m2.summary, await Promise.all(good.map(storageOf))], [{ idle: true, bad: 2 }, ["fs", "fs", "fs"]]);
    const many: string[] = [];
    for (let i = 0; i < 55; i++) many.push(await putDb(scopeN, randomBytes(64 + i)));
    MIG.resetMigrateIdle();
    const c1 = await MIG.mediaMigrateJob(jobCtx("media.migrate"));
    t.eq("≤ 50 files a tick: 50 moved, work left", [c1.summary?.moved, c1.done], [50, false]);
    const c2 = await MIG.mediaMigrateJob(jobCtx("media.migrate"));
    t.eq("…the next tick moves the other 5", [c2.summary?.moved, c2.done], [5, true]);
    t.check("…every one of them on disk with its row flipped", (await Promise.all(many.map(storageOf))).every((s) => s === "fs") && many.every((k) => existsSync(P.mediaFilePath(STORE_N, k))));
    delete env.DATA_DIR;
    await S.runMediaStorageCheck({ force: true });
    MIG.resetMigrateIdle();
    t.eq("on the db backend the migrator does nothing", (await MIG.mediaMigrateJob(jobCtx("media.migrate"))).summary, { skipped: "backend_db" });
    t.eq("…nor does the sweeper", (await mediaSweepJob(jobCtx("media.sweep"))).summary, { skipped: "backend_db" });
    env.DATA_DIR = DATA;
    t.eq("…restored: fs again", (await S.runMediaStorageCheck({ force: true })).ok, true);
    await pool().query("DELETE FROM media_files WHERE `key` IN (?)", [[kBad, kGone]]);
    await pool().query("DELETE FROM media_chunks WHERE `key` IN (?)", [[kBad, kGone]]);
    await ST.patchJobState("media.migrate", { bad: null });

    // ---- fs put: an idempotent re-put refreshes the file's time (the sweeper's hour starts again)
    const rePut = randomBytes(300);
    const rpFile = fileOf(STORE_M, rePut);
    await fsStorage.put(rpFile, rePut);
    hoursAgo(P.mediaFilePath(STORE_M, rpFile.key), 3);
    await fsStorage.put(rpFile, rePut);
    t.check("an idempotent put of the same bytes refreshes the file's time", Date.now() - statSync(P.mediaFilePath(STORE_M, rpFile.key)).mtimeMs < 60_000);

    // ---- media.sweep (§G.3): orphans > 1 h deleted, fresh ones and temp files kept, missing files reported
    const orphanOld = fileOf(STORE_M, randomBytes(400));
    const orphanFresh = fileOf(STORE_M, randomBytes(401));
    for (const f of [orphanOld, orphanFresh]) {
      const p = P.mediaFilePath(STORE_M, f.key);
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, randomBytes(f.bytes));
    }
    hoursAgo(P.mediaFilePath(STORE_M, orphanOld.key), 2);
    hoursAgo(P.mediaFilePath(STORE_M, kSmall[0]!), 5); // an old file WITH its row
    const junk = join(DATA, "media", "v1", STORE_M.slice(0, 2), STORE_M, "stray.bin");
    writeFileSync(junk, "x");
    hoursAgo(junk, 2);
    const tmpOld = join(P.mediaTmpDir()!, `old-${hex(4)}`);
    const tmpFresh = join(P.mediaTmpDir()!, `fresh-${hex(4)}`);
    writeFileSync(tmpOld, "t");
    writeFileSync(tmpFresh, "t");
    hoursAgo(tmpOld, 2);
    const purgedFile = join(DATA, "media", "v1", STORE_X.slice(0, 2), STORE_X, "ab", `ab${hex(15)}-640.webp`);
    mkdirSync(dirname(purgedFile), { recursive: true });
    writeFileSync(purgedFile, "p");
    hoursAgo(purgedFile, 2);
    const foreignDir = join(DATA, "media", "v1", "zz", "not-a-store");
    mkdirSync(foreignDir, { recursive: true });
    writeFileSync(join(foreignDir, "keep.txt"), "f");
    // a row whose file is missing (M), and a store whose fs rows have no folder at all (R)
    const missM = fileOf(STORE_M, randomBytes(10));
    await insertRow(missM, "fs");
    const missR = [fileOf(STORE_R, randomBytes(11)), fileOf(STORE_R, randomBytes(12))];
    for (const f of missR) await insertRow(f, "fs");
    const missBefore = [await errorsOf("missing_file", STORE_M), await errorsOf("missing_file", STORE_R)];
    const sw = await untilDone("media.sweep", mediaSweepJob);
    t.check("the sweep completes", sw[sw.length - 1]!.done, JSON.stringify(sw.map((r) => r.summary)));
    t.check("a file with no row, older than 1 h: deleted", !existsSync(P.mediaFilePath(STORE_M, orphanOld.key)));
    t.check("a file with no row, fresh (an upload in flight): kept", existsSync(P.mediaFilePath(STORE_M, orphanFresh.key)));
    t.check("an old file with its row: kept", existsSync(P.mediaFilePath(STORE_M, kSmall[0]!)) && good.every((k) => existsSync(P.mediaFilePath(STORE_M, k))));
    t.check("a stray file in a store folder, old: deleted", !existsSync(junk));
    t.eq("temp files: the old one deleted, the fresh one kept", [existsSync(tmpOld), existsSync(tmpFresh)], [false, true]);
    t.check("a purged store's folder (no store row): its old files deleted and the folder pruned", !existsSync(purgedFile) && !existsSync(join(DATA, "media", "v1", STORE_X.slice(0, 2), STORE_X)));
    t.check("a folder that is no store id is never touched", existsSync(join(foreignDir, "keep.txt")));
    t.eq("a row whose file is missing: reported once, never deleted", [(await errorsOf("missing_file", STORE_M)) - missBefore[0]!, await storageOf(missM.key)], [1, "fs"]);
    t.eq("a store with fs rows and no folder: each file reported, rows kept", [(await errorsOf("missing_file", STORE_R)) - missBefore[1]!, await storageOf(missR[0]!.key), await storageOf(missR[1]!.key)], [2, "fs", "fs"]);
    const last = sw[sw.length - 1]!.summary!;
    t.check("the run's summary counts what it did", Number(last.orphans) + sw.slice(0, -1).reduce((n, r) => n + Number(r.summary?.orphans ?? 0), 0) >= 3 && Number(last.tmpDeleted ?? 0) + sw.slice(0, -1).reduce((n, r) => n + Number(r.summary?.tmpDeleted ?? 0), 0) >= 1, JSON.stringify(last));
    t.eq("…and leaves no sweep state behind", (await ST.readJobState("media.sweep")).sweep, undefined);
    await pool().query("DELETE FROM media_files WHERE `key` IN (?)", [[missM.key, ...missR.map((f) => f.key)]]);
    rmSync(join(DATA, "media", "v1", "zz"), { recursive: true, force: true });
    unlinkSync(P.mediaFilePath(STORE_M, orphanFresh.key));

    // ---- storage.walk (§G.2): the snapshot equals the real totals, resumable, MEDIA_DIR outside counted
    const realTotals = (root: string) => {
      const out = { bytes: 0, files: 0, dirs: 0 };
      const visit = (dir: string) => {
        out.dirs++;
        for (const e of readdirSync(dir, { withFileTypes: true })) {
          const p = join(dir, e.name);
          if (e.isDirectory()) visit(p);
          else {
            out.files++;
            if (e.isFile()) out.bytes += lstatSync(p).size;
          }
        }
      };
      visit(root);
      return out;
    };
    await ST.patchJobState("storage.walk", { walk: null, snapshot: null });
    const w1 = await untilDone("storage.walk", storageWalkJob);
    const snap1 = W.readWalkSnapshot(await ST.readJobState("storage.walk"));
    const real1 = realTotals(DATA);
    t.eq("one walk: the snapshot equals the real totals of DATA_DIR", snap1 && { bytes: snap1.bytes, files: snap1.files, dirs: snap1.dirs }, real1);
    t.check("…complete, with the budget and its time", !!snap1 && snap1.complete && snap1.budgetBytes === W.budgetBytes() && Date.now() - Date.parse(snap1.at) < 60_000 && w1.length === 1);
    t.eq("…the fs backend's usage() reads it", await fsStorage.usage(), { bytes: real1.bytes, files: real1.files, freeBytes: W.budgetBytes() - real1.bytes });
    writeFileSync(join(DATA, "exports", `walk-${hex(3)}.bin`), randomBytes(5_000));
    const first = await storageWalkJob(jobCtx("storage.walk", 0));
    const during = await ST.readJobState("storage.walk");
    t.check("a walk with no time left: one folder, its cursor kept, the last snapshot still served", !first.done && !!during.walk && W.readWalkSnapshot(during)?.at === snap1!.at);
    const w2 = await untilDone("storage.walk", storageWalkJob, 0, 2_000);
    const snap2 = W.readWalkSnapshot(await ST.readJobState("storage.walk"));
    t.check("…resumed tick after tick until done", w2.length > 5 && w2.slice(0, -1).every((r) => !r.done) && w2[w2.length - 1]!.done, `${w2.length} ticks`);
    t.eq("…the same totals as one walk (the new file counted)", snap2 && { bytes: snap2.bytes, files: snap2.files, dirs: snap2.dirs }, realTotals(DATA));
    t.check("…then the new snapshot replaced it", snap2 !== null && snap2.at > snap1!.at && !(await ST.readJobState("storage.walk")).walk);
    const outside = join(ROOT, `media-outside-${hex(3)}`);
    mkdirSync(join(outside, "v1"), { recursive: true });
    writeFileSync(join(outside, "v1", "x.bin"), randomBytes(1234));
    env.MEDIA_DIR = outside;
    await untilDone("storage.walk", storageWalkJob);
    const snap3 = W.readWalkSnapshot(await ST.readJobState("storage.walk"));
    const ro = realTotals(outside);
    const rd = realTotals(DATA);
    t.eq("MEDIA_DIR outside DATA_DIR: both counted", snap3 && [snap3.bytes, snap3.files], [rd.bytes + ro.bytes, rd.files + ro.files]);
    env.MEDIA_DIR = join(DATA, "media");
    await untilDone("storage.walk", storageWalkJob);
    t.eq("MEDIA_DIR inside DATA_DIR: counted once", W.readWalkSnapshot(await ST.readJobState("storage.walk"))?.bytes, realTotals(DATA).bytes);
    delete env.MEDIA_DIR;
    rmSync(outside, { recursive: true, force: true });
    // no null values: JSON_MERGE_PATCH removes a key whose patch is null
    const keepDue = { due: { lastHour: "2026-10-31T01", lastDay: "2026-10-31", fails: 1, failKey: "2026-10-31" } };
    await pool().query("UPDATE cron_cursors SET state = JSON_MERGE_PATCH(state, ?) WHERE job = 'storage.walk'", [JSON.stringify(keepDue)]);
    await untilDone("storage.walk", storageWalkJob);
    const dueAfter = ((await ST.readJobState("storage.walk")).due ?? {}) as Record<string, unknown>;
    t.check("the runner's due keys survive the walk's writes", Object.entries(keepDue.due).every(([k, v]) => dueAfter[k] === v), JSON.stringify(dueAfter));

    // ---- refs.reconcile (§G.5): the index heals from the documents
    const png = (w: number, hgt: number) => sharp(randomBytes(w * hgt * 3), { raw: { width: w, height: hgt, channels: 3 } }).png().toBuffer();
    const activeM: import("@/lib/media/quota").MediaStore = { status: "active", timezone: "Africa/Casablanca" };
    const x1 = (await MP.processUpload(scopeM, activeM, await png(40, 36), "a.png", {})).asset.id;
    const x2 = (await MP.processUpload(scopeM, activeM, await png(41, 37), "b.png", {})).asset.id;
    const aAsset = (await MP.processUpload(scopeA, activeM, await png(42, 38), "c.png", {})).asset.id;
    const docWith = (ids: readonly string[]) => JSON.stringify({ v: 2, locale: "fr", product: { images: ids.map((id) => ({ id, alt: "" })) }, items: [], offers: [], seo: {}, sections: [] });
    const seed = async (ids: readonly string[], live: boolean) => {
      const id = newId();
      await pool().query("INSERT INTO pages (id, store_id, slug, name, status, locale, public_key, draft) VALUES (?, ?, ?, ?, ?, 'fr', ?, ?)", [id, STORE_M, `r-${hex(3)}`, "refs", live ? "published" : "draft", `pk_${hex(12)}`, docWith(ids)]);
      if (!live) return { id, versionId: null as string | null };
      const versionId = newId();
      await pool().query(
        "INSERT INTO page_versions (id, store_id, page_id, kind, doc, html, thank_you_html, csp, thank_you_csp, etag, checksum, runtime_v) VALUES (?, ?, ?, 'publish', ?, 'h', 'h', 'c', 'c', 'e', ?, 2)",
        [versionId, STORE_M, id, docWith(ids), sha(Buffer.from(docWith(ids)))],
      );
      await pool().query("UPDATE pages SET published_version_id = ? WHERE id = ?", [versionId, id]);
      return { id, versionId };
    };
    type RefRow = { asset_id: string; owner_kind: string; owner_id: string; live: number };
    const refsOf = async (ownerId: string) => ((await pool().query("SELECT asset_id, owner_kind, owner_id, live FROM asset_refs WHERE store_id = ? AND owner_id = ? ORDER BY owner_kind, asset_id", [STORE_M, ownerId])) as unknown as [RefRow[]])[0].map((r) => [r.owner_kind, r.asset_id, Number(r.live)]);
    const liveP = await seed([x1, aAsset], true);
    const draftP = await seed([x2], false);
    const r1 = await untilDone("refs.reconcile", refsReconcileJob);
    t.check("the pass completes", r1[r1.length - 1]!.done);
    t.eq("a live page: its draft (not live) and its live version (live), own assets only", [await refsOf(liveP.id), await refsOf(liveP.versionId!)], [[["page", x1, 0]], [["page_version", x1, 1]]]);
    t.eq("a draft page: its draft", await refsOf(draftP.id), [["page", x2, 0]]);
    await pool().query("DELETE FROM asset_refs WHERE store_id = ? AND owner_id IN (?)", [STORE_M, [liveP.versionId, draftP.id]]);
    await untilDone("refs.reconcile", refsReconcileJob);
    t.eq("deleted refs are restored", [await refsOf(liveP.versionId!), await refsOf(draftP.id)], [[["page_version", x1, 1]], [["page", x2, 0]]]);
    await new Promise((r) => setTimeout(r, 20)); // a save after the refs were written (DATETIME(3))
    await pool().query("UPDATE pages SET draft = ?, updated_at = UTC_TIMESTAMP(3) WHERE id = ?", [docWith([x1, x2]), draftP.id]);
    await pool().query("UPDATE asset_refs SET live = 0 WHERE store_id = ? AND owner_id = ?", [STORE_M, liveP.versionId]);
    await untilDone("refs.reconcile", refsReconcileJob);
    t.eq("a draft saved after its refs: rebuilt from the new document", await refsOf(draftP.id), [x1, x2].sort().map((id) => ["page", id, 0]));
    t.eq("a live version's row not marked live: rebuilt live", await refsOf(liveP.versionId!), [["page_version", x1, 1]]);
    await pool().query("UPDATE pages SET status = 'archived', published_version_id = NULL WHERE id = ?", [liveP.id]);
    await updateStoreSetting(scopeM, "brand", (cur) => ({ logo: { ...cur.logo, primary: x2 } }), { id: "system", kind: "system" });
    await untilDone("refs.reconcile", refsReconcileJob);
    t.eq("an archived page: its draft and old version rows are removed", [await refsOf(liveP.id), await refsOf(liveP.versionId!)], [[], []]);
    t.eq("the brand logo: indexed, live", await refsOf("brand"), [["brand", x2, 1]]);
    const [[foreignRefs]] = (await pool().query("SELECT COUNT(*) AS n FROM asset_refs WHERE asset_id = ?", [aAsset])) as unknown as [{ n: number }[]];
    t.eq("another store's asset named in M's document is never indexed", Number(foreignRefs!.n), 0);
    const r4 = await refsReconcileJob(jobCtx("refs.reconcile"));
    t.eq("a pass over a healed index changes nothing", [r4.summary?.rebuilt, r4.summary?.removed], [0, 0]);

    // ---- usage.reconcile (§D.7, D69): a drifted gauge corrected, the pending budget recomputed
    const source = async (storeId: string) => Number(((await pool().query("SELECT COALESCE(SUM(bytes), 0) AS n FROM media_files WHERE store_id = ?", [storeId])) as unknown as [{ n: number }[]])[0][0]!.n);
    const gaugeOf = async (storeId: string) => Number(((await pool().query("SELECT value FROM store_usage WHERE store_id = ? AND metric = 'media_bytes' AND period = 'total'", [storeId])) as unknown as [{ value: number }[]])[0][0]?.value ?? -1);
    await untilDone("usage.reconcile", usageReconcileJob); // the earlier sections' drift first
    await pool().query(
      "INSERT INTO store_usage (store_id, metric, period, value, updated_at) VALUES (?, 'media_bytes', 'total', 12345, UTC_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE value = value + 12345",
      [STORE_M],
    );
    await pool().query("UPDATE store_usage SET value = 1 WHERE store_id = ? AND metric = 'media_bytes' AND period = 'total'", [STORE_N]);
    await U.chargePlatformUsage("pending_media_bytes", "total", 777_777, { allowOver: true });
    const nBytes = await source(STORE_N);
    const u1 = await untilDone("usage.reconcile", usageReconcileJob);
    const s1 = u1[u1.length - 1]!.summary!;
    t.eq("a drifted media gauge is set back to Σ media_files.bytes", [await gaugeOf(STORE_M), await gaugeOf(STORE_N)], [await source(STORE_M), nBytes]);
    t.eq("…the drift is in job_runs.summary (net delta, stores)", [s1.media_bytes_delta, s1.media_bytes_stores, s1.driftStores], [-12345 + (nBytes - 1), 2, 2]);
    const [[pend]] = (await pool().query("SELECT COALESCE(SUM(u.value), 0) AS n FROM store_usage u JOIN stores s ON s.id = u.store_id WHERE s.status = 'pending' AND u.metric = 'media_bytes' AND u.period = 'total'")) as unknown as [{ n: number }[]];
    t.eq("pending_media_bytes = Σ the pending stores' media gauges (the drift of 777,777 gone)", await U.platformUsageValue("pending_media_bytes", "total"), Number(pend!.n));
    t.eq("…before / after in the summary", Number(s1.pendingMediaBefore) - Number(s1.pendingMediaAfter), 777_777);
    const u2 = await untilDone("usage.reconcile", usageReconcileJob);
    t.eq("a second run finds no drift", [u2[u2.length - 1]!.summary?.driftStores, u2[u2.length - 1]!.processed], [0, 0]);
    t.eq("…and the pass leaves no state behind", (await ST.readJobState("usage.reconcile")).pass, undefined);
  });

  /* ================================================================ */
  h.section("export", async (t) => {
    const { unzipSync } = await import("fflate");
    const EX = await import("@/lib/exports-store");
    const JOBX = await import("@/lib/exports-store/job");
    const SIG = await import("@/lib/exports-store/sign");
    const { exportsJob } = await import("@/lib/jobs/exports");
    const ST = await import("@/lib/jobs/storage/state");
    const W = await import("@/lib/storage/walk");
    const { mintScope } = await import("@/lib/tenancy/seam");
    const { newId } = await import("@/lib/db/ids");
    type JobCtx = import("@/lib/jobs/runner").JobCtx;
    t.eq("the fs backend is on (DATA_DIR passed its check)", (await S.runMediaStorageCheck({ force: true })).ok, true);
    const STORE_E = "01JB8ZK3Q4R5S6T7V8W9XYZ0EE"; // the exported store (A's role)
    const STORE_F = "01JB8ZK3Q4R5S6T7V8W9XYZ0FF"; // the other store, whose canaries must never appear (B's role)
    for (const [id, handle] of [
      [STORE_E, "export-e"],
      [STORE_F, "export-f"],
    ] as const) {
      await db.insert(stores).values({ id, handle, name: `Store ${id.slice(-2)}`, status: "active", brandSeed: "0123456789abcdef" });
    }
    const scopeE = systemScope(ctx, STORE_E);
    const scopeF = systemScope(ctx, STORE_F);
    const q = (text: string, v: unknown[]) => pool().query(text, v);
    const uE = newId();
    const uF = newId();
    await q("INSERT INTO users (id, email, name, password_hash) VALUES (?, ?, ?, 'x'), (?, ?, ?, 'x')", [uE, `owner-e-${hex(3)}@example.test`, "Owner E", uF, `f-canary-mail-${hex(3)}@example.test`, "F-CANARY-MEMBER"]);
    await q("INSERT INTO store_members (store_id, user_id, role) VALUES (?, ?, 'owner'), (?, ?, 'owner')", [STORE_E, uE, STORE_F, uF]);
    // pages: E published + a draft; F published with its canary
    const page = async (storeId: string, slug: string, html: string | null) => {
      const id = newId();
      const vid = html ? newId() : null;
      const doc = JSON.stringify({ v: 2, title: `${slug} doc` });
      await q("INSERT INTO pages (id, store_id, slug, name, status, locale, public_key, draft, published_version_id) VALUES (?, ?, ?, ?, ?, 'fr', ?, ?, ?)", [id, storeId, slug, slug, html ? "published" : "draft", `pk_${hex(12)}`, doc, vid]);
      if (vid) {
        await q("INSERT INTO page_versions (id, store_id, page_id, kind, doc, html, thank_you_html, checksum, runtime_v) VALUES (?, ?, ?, 'publish', ?, ?, ?, ?, 2)", [vid, storeId, id, doc, html, `${html}-MERCI`, hex(32)]);
      }
      return id;
    };
    const pageE = await page(STORE_E, "argan-e", "<!doctype html><p>E-PAGE-HTML</p>");
    await page(STORE_E, "brouillon-e", null);
    const pageF = await page(STORE_F, "argan-f", "<!doctype html><p>F-CANARY-PAGE</p>");
    // orders: E's full phones, a test order, the never-exported columns filled with canaries; F's canary order
    const order = (storeId: string, phone: string, name: string, extra: { isTest?: boolean; capi?: string; upsell?: string; claim?: string; note?: string } = {}) =>
      q(
        "INSERT INTO orders (id, store_id, page_id, name, phone, product_name, items, qty, subtotal, shipping, total, currency, idem, is_test, capi_ctx, upsell_token_hash, claim_token, note, adjust_cents) VALUES (?, ?, ?, ?, ?, 'Argan', '[]', 1, 199.00, 0, 199.00, 'MAD', ?, ?, ?, ?, ?, ?, -150)",
        [`CMD-${hex(4).toUpperCase()}`, storeId, storeId === STORE_E ? pageE : pageF, name, phone, `${hex(16)}-${hex(9)}`.slice(0, 36), extra.isTest ? 1 : 0, extra.capi ?? null, extra.upsell ?? null, extra.claim ?? null, extra.note ?? null],
      );
    const CAPI = "CAPI-CANARY-E";
    const UPSELL = `ab${"c".repeat(60)}de`;
    const CLAIM = "CLAIMCANARYE00000000000000";
    await order(STORE_E, "+212600000101", "Amina الدار البيضاء", { capi: CAPI, upsell: UPSELL, claim: CLAIM, note: '=HYPERLINK("http://evil",1)' });
    await order(STORE_E, "+212600000102", "Youssef", { isTest: true });
    await order(STORE_E, "+212600000103", 'Salma, "Lwarda"');
    await order(STORE_F, "+212699999901", "F-CANARY-NAME");
    for (const [sid, tag] of [
      [STORE_E, "E"],
      [STORE_F, "F-CANARY"],
    ] as const) {
      await q("INSERT INTO leads (id, store_id, page_id, idem, phone, name) VALUES (?, ?, ?, ?, ?, ?)", [newId(), sid, sid === STORE_E ? pageE : pageF, `${hex(16)}-${hex(9)}`.slice(0, 36), sid === STORE_E ? "+212600000201" : "+212699999902", `${tag}-LEAD`]);
      await q("INSERT INTO customers (id, store_id, phone, name) VALUES (?, ?, ?, ?)", [newId(), sid, sid === STORE_E ? "+212600000101" : "+212699999901", `${tag}-CUSTOMER`]);
      await q("INSERT INTO order_events (store_id, order_id, actor_kind, type, note) VALUES (?, 'CMD-X', 'user', 'created', ?)", [sid, `${tag}-EVENT`]);
      await q("INSERT INTO message_templates (id, store_id, channel, kind, locale, name, body) VALUES (?, ?, 'whatsapp', 'confirm', 'ar', ?, 'سلام')", [newId(), sid, `${tag}-TEMPLATE`]);
      await q("INSERT INTO short_links (id, store_id, code, target_kind, page_id) VALUES (?, ?, ?, 'page', ?)", [newId(), sid, `c${hex(3)}`, sid === STORE_E ? pageE : pageF]);
      await q("INSERT INTO delivery_zones (id, store_id, name, cities) VALUES (?, ?, ?, ?)", [newId(), sid, `${tag}-ZONE`, JSON.stringify(["*"])]);
      await q("INSERT INTO agent_stats_daily (store_id, user_id, day, worked) VALUES (?, ?, '2026-11-01', 3)", [sid, sid === STORE_E ? uE : uF]);
    }
    await q("INSERT INTO audit_log (action, user_id, target, meta, ip, store_id, actor_kind, impersonator_id) VALUES ('store.page.published', ?, 'argan-e', ?, 'IPHASHCANARYSTAFF', ?, 'platform', ?)", [uF, JSON.stringify({ note: "STAFF-NOTE-HIDDEN" }), STORE_E, uF]);
    await q("INSERT INTO audit_log (action, user_id, target, store_id, actor_kind) VALUES ('store.page.published', ?, 'E-OWN-ROW', ?, 'user')", [uE, STORE_E]);
    await q("INSERT INTO audit_log (action, user_id, target, store_id, actor_kind) VALUES ('store.page.published', ?, 'F-CANARY-AUDIT', ?, 'user')", [uF, STORE_F]);
    const SHARE = `fe${"d".repeat(62)}`;
    await q(
      "INSERT INTO campaigns (id, store_id, name, slug, page_id, product_ref, channels, kit, offers_hash, share_token_hash) VALUES (?, ?, 'Promo E', 'promo-e', ?, ?, '[]', ?, 'abcdef0123456789', ?)",
      [newId(), STORE_E, pageE, JSON.stringify({ kind: "landing_items", id: "x" }), JSON.stringify({ headline: "Promo E", share: { token: "KIT-TOKEN-CANARY", url: "/k/x" } }), SHARE],
    );
    await q("INSERT INTO ai_memory (id, store_id, kind, text, evidence, active) VALUES (?, ?, 'fact', 'E-MEMORY', ?, 0)", [newId(), STORE_E, JSON.stringify({ edits: 2, runIds: ["RUNID-CANARY"] })]);
    // settings: a secret key (never read, never written) and a plain one
    await q("INSERT INTO store_settings (store_id, `key`, value, encrypted) VALUES (?, 'telegram', ?, 1), (?, 'defaults', '{}', 0)", [STORE_E, JSON.stringify("BOT-TOKEN-CANARY"), STORE_E]);
    // media: E's asset with two stored variants (the larger is exported), F's asset with a canary
    const asset = async (storeId: string, list: { variant: string; data: Buffer }[]) => {
      const assetId = hex(16);
      await q("INSERT INTO assets (id, store_id, mime, width, height, bytes, variants, stored_bytes) VALUES (?, ?, 'image/webp', 10, 10, ?, '[]', ?)", [assetId, storeId, list[0]!.data.length, list.reduce((n, f) => n + f.data.length, 0)]);
      for (const f of list) {
        const file = { storeId, key: `${assetId}-${f.variant}`, assetId, mime: "image/webp", bytes: f.data.length, sha256: sha(f.data) };
        await fsStorage.put(file, f.data);
        await insertRow(file, "fs");
      }
      return assetId;
    };
    const bigE = randomBytes(30_000);
    const assetE = await asset(STORE_E, [
      { variant: "640.webp", data: randomBytes(9_000) },
      { variant: "1600.webp", data: bigE },
    ]);
    await asset(STORE_F, [{ variant: "640.webp", data: Buffer.concat([Buffer.from("F-CANARY-MEDIA"), randomBytes(2_000)]) }]);

    // the request: a read-only platform scope still queues the store's own export (D71, §A.5.3); a second ask gets it
    const { jobId } = await EX.requestStoreExport(mintScope("platform", STORE_E), { requestedAs: "member", requestedBy: uE });
    t.eq("a request answers a jobId at once", /^[0-9A-HJKMNP-TV-Z]{26}$/.test(jobId), true);
    t.eq("an active job answers its jobId (one per store)", (await EX.requestStoreExport(scopeE, { requestedAs: "member", requestedBy: uE })).jobId, jobId);
    await t.rejects("a bad requester is refused", () => EX.requestStoreExport(scopeE, { requestedAs: "member", requestedBy: "nope" }));
    const pending = (await EX.listExportJobs(scopeE))[0]!;
    t.eq("listed pending: no bytes, no parts, no error yet", [pending.state, pending.bytes, pending.parts, pending.error, pending.progress], ["pending", null, [], null, null]);
    t.eq("F's list shows nothing of E", (await EX.listExportJobs(scopeF)).length, 0);

    const jobCtx = (budgetMs = 60_000): JobCtx => ({
      ...systemCtx("exports"),
      deadline: Date.now() + budgetMs,
      tickId: newId(),
      cursor: "",
      setCursor: async () => undefined,
      yield: () => new Promise<void>((r) => setImmediate(r)),
      lagMs: () => 0,
    });
    const LIMIT = 24 * 1024;
    const forced = { maxSlices: 1, rowsPerSlice: 2, partLimitBytes: LIMIT };
    const dirE = JOBX.exportDir(STORE_E, jobId);
    let ticks = 0;
    let state = "";
    let sawRunning = false;
    while (ticks < 200 && state !== "ready") {
      const r = await exportsJob(jobCtx(), forced);
      ticks++;
      state = String(r.summary?.state ?? "");
      if (state === "running" && !sawRunning) {
        sawRunning = true;
        const listed = (await EX.listExportJobs(scopeE))[0]!;
        t.check("running: progress has the part and the entries, bytes still null", listed.state === "running" && listed.progress !== null && listed.bytes === null);
      }
      if (ticks === 3 || ticks === 14) {
        // a tick that died after writing past its saved cursor: garbage at the end of the part and the stage files
        const [[row]] = (await pool().query("SELECT `cursor` FROM export_jobs WHERE id = ?", [jobId])) as unknown as [{ cursor: string }[]];
        const cur = JSON.parse(row!.cursor) as { s: number; zip: { n: number } | null };
        const part = join(dirE, `part-${cur.zip?.n ?? 1}.zip`);
        if (existsSync(part)) writeFileSync(part, Buffer.concat([readFileSync(part), randomBytes(3_000)]));
        const stageDir = join(dirE, "stage");
        for (const f of existsSync(stageDir) ? readdirSync(stageDir) : []) writeFileSync(join(stageDir, f), Buffer.concat([readFileSync(join(stageDir, f)), Buffer.from("GARBAGE-ROW\r\n")]));
      }
    }
    t.eq("the job ends ready", state, "ready");
    t.check("…across at least 3 forced slices (ticks)", ticks >= 3, `${ticks} ticks`);
    const [ready] = await EX.listExportJobs(scopeE);
    t.check("ready: expires 72 h after done", !!ready?.expiresAt && !!ready.doneAt && Date.parse(ready.expiresAt) - Date.parse(ready.doneAt) === 72 * 3_600_000);
    t.check("ready: bytes = Σ parts, several parts under the small limit", !!ready && ready.bytes === ready.parts.reduce((n, p) => n + p.bytes, 0) && ready.parts.length >= 2, `${ready?.parts.length} parts`);
    t.check("ready: every part has a signed href and the download name", !!ready && ready.parts.every((p) => !!p.href?.startsWith(`/api/app/export-e/exports/${jobId}/${p.n}?t=`) && /^export-e-export-\d{4}-\d{2}-\d{2}-\d+\.zip$/.test(p.name)));
    t.check("the stage folder is gone", !existsSync(join(dirE, "stage")));
    const [[jr]] = (await pool().query("SELECT parts, `cursor` FROM export_jobs WHERE id = ?", [jobId])) as unknown as [{ parts: string; cursor: string | null }[]];
    const stored = JSON.parse(jr!.parts) as { name: string; bytes: number; sha256: string }[];
    t.check("export_jobs.parts holds name, bytes and sha256 of each part file", stored.every((p) => statSync(join(dirE, p.name)).size === p.bytes && sha(readFileSync(join(dirE, p.name))) === p.sha256));
    t.eq("…and the cursor is cleared", jr!.cursor, null);

    // the archive: every listed file, nothing of F, no secret
    const files = new Map<string, Buffer>();
    let partsOk = true;
    for (const p of stored) {
      try {
        for (const [name, data] of Object.entries(unzipSync(new Uint8Array(readFileSync(join(dirE, p.name)))))) files.set(name, Buffer.from(data));
      } catch {
        partsOk = false;
      }
    }
    t.check("every part opens as a ZIP of its own", partsOk);
    const want = [
      "orders.csv",
      "leads.csv",
      "customers.csv",
      "order_events.csv",
      "members.csv",
      "audit.csv",
      "agent_stats_daily.csv",
      "message_templates.csv",
      "short_links.csv",
      "campaigns.json",
      "delivery_zones.json",
      "ai_memory.json",
      "settings.json",
      "README.txt",
      "pages/argan-e/doc.json",
      "pages/argan-e/index.html",
      "pages/argan-e/merci.html",
      "drafts/argan-e.json",
      "drafts/brouillon-e.json",
      `media/${assetE}.webp`,
    ];
    t.eq("every listed file is in the archive", want.filter((f) => !files.has(f)), []);
    t.eq("…and nothing else (health.json omitted: no snapshot yet)", [...files.keys()].filter((f) => !want.includes(f)), []);
    t.check("README.txt is in the last part", Object.keys(unzipSync(new Uint8Array(readFileSync(join(dirE, stored[stored.length - 1]!.name))))).includes("README.txt"));
    const all = Buffer.concat([...files.values()]).toString("utf8");
    t.eq("no F canary anywhere", ["F-CANARY", "f-canary", "+212699999901", "+212699999902"].filter((c) => all.includes(c)), []);
    t.eq("no secret: capi_ctx, the token hashes, the claim token, the bot token, the kit's share token, run ids", [CAPI, UPSELL, CLAIM, SHARE, "BOT-TOKEN-CANARY", "KIT-TOKEN-CANARY", "RUNID-CANARY"].filter((c) => all.includes(c)), []);
    const orders = files.get("orders.csv")!.toString("utf8");
    const header = orders.slice(1).split("\r\n")[0]!.split(",");
    t.check("orders.csv starts with the BOM", orders.startsWith("﻿"));
    t.eq("…no capi_ctx, upsell_token_hash or claim_token column", ["capi_ctx", "upsell_token_hash", "claim_token"].filter((c) => header.includes(c)), []);
    t.check("…every other column (currency, is_test, adjust_cents, phone_raw)", ["id", "phone", "currency", "is_test", "adjust_cents", "phone_raw", "subtotal", "items"].every((c) => header.includes(c)));
    t.eq("…E's full phones (as guarded text)", ["+212600000101", "+212600000102", "+212600000103"].filter((p) => !orders.includes(`'${p}`)), []);
    t.check("…the formula neutralised and quoted, names with quotes and commas kept", orders.includes(`"'=HYPERLINK(""http://evil"",1)"`) && orders.includes('"Salma, ""Lwarda"""') && orders.includes("الدار البيضاء"));
    t.check("…amounts exactly as stored, cents as integers", orders.includes(",199.00,") && orders.includes(",-150,") && orders.includes(",MAD,"));
    t.eq("…three rows (the test order kept), no garbage row from the dead ticks", [orders.split("\r\n").filter((l) => l.startsWith("CMD-")).length, orders.includes("GARBAGE-ROW"), all.includes("GARBAGE-ROW")], [3, false, false]);
    t.eq("members.csv: name, e-mail, role, status", files.get("members.csv")!.toString("utf8").replace("﻿", "").split("\r\n")[0], "name,email,role,status");
    const audit = files.get("audit.csv")!.toString("utf8");
    t.check("audit.csv: the store's own rows, staff rows without ids, IP hash or hidden note", audit.includes("E-OWN-ROW") && !audit.includes("IPHASHCANARYSTAFF") && !audit.includes("STAFF-NOTE-HIDDEN") && !audit.includes(uF));
    const settings = JSON.parse(files.get("settings.json")!.toString("utf8")) as Record<string, unknown>;
    t.check("settings.json: no secret key at all", !("telegram" in settings) && !("tracking_secrets" in settings) && !("turnstile" in settings) && !("export_key" in settings) && "defaults" in settings);
    const memory = JSON.parse(files.get("ai_memory.json")!.toString("utf8")) as { text: string; active: boolean; evidence: Record<string, unknown> }[];
    t.eq("ai_memory.json: inactive items too, evidence without run ids", [memory.length, memory[0]?.active, memory[0]?.evidence], [1, false, { edits: 2 }]);
    const campaignsJson = JSON.parse(files.get("campaigns.json")!.toString("utf8")) as Record<string, unknown>[];
    t.check("campaigns.json: no share token column", campaignsJson.length === 1 && !("share_token_hash" in campaignsJson[0]!));
    t.check("pages: the published html and merci, the draft", files.get("pages/argan-e/index.html")!.toString().includes("E-PAGE-HTML") && files.get("pages/argan-e/merci.html")!.toString().includes("-MERCI"));
    t.check("media: the largest stored variant, byte for byte", files.get(`media/${assetE}.webp`)!.equals(bigE));
    const readme = files.get("README.txt")!.toString("utf8");
    t.check("README.txt: ar, fr, en; the part count", readme.includes("تصدير") && readme.includes("Export des données") && readme.includes(`${stored.length} ZIP parts`));

    // download: the part stream is the file; another store, a foreign or expired signature: nothing
    const tok = new URL(ready!.parts[0]!.href!, "http://x").searchParams.get("t")!;
    t.check("the listed token verifies for E's job and part 1", SIG.verifyExportToken(STORE_E, jobId, "1", tok));
    t.check("…never for F (E's signature on F)", !SIG.verifyExportToken(STORE_F, jobId, "1", tok));
    t.check("…never once expired", !SIG.verifyExportToken(STORE_E, jobId, "1", tok, Date.now() + 25 * 3_600_000));
    const streamed = await streamBytes((await EX.exportPartStream(scopeE, jobId, "1"))!);
    t.check("exportPartStream(E) streams part 1 byte for byte", streamed.equals(readFileSync(join(dirE, stored[0]!.name))));
    t.eq("F's scope on E's job, a missing part, a bad id: null", [await EX.exportPartStream(scopeF, jobId, "1"), await EX.exportPartStream(scopeE, jobId, "99"), await EX.exportPartStream(scopeE, "nope", "1"), await EX.exportPartStream(scopeE, jobId, "../1")], [null, null, null, null]);

    // no space: the last walk leaves less than the estimate → failed 'no_space' before any file
    const savedState = await ST.readJobState(W.WALK_JOB);
    await ST.patchJobState(W.WALK_JOB, { snapshot: { bytes: 999_000, files: 1, dirs: 1, budgetBytes: 1_000_000, complete: true, at: new Date().toISOString() } });
    const { jobId: jobF } = await EX.requestStoreExport(scopeF, { requestedAs: "platform", requestedBy: uF });
    const rf = await exportsJob(jobCtx(), forced);
    const [lf] = await EX.listExportJobs(scopeF);
    t.eq("a job over the DATA_DIR budget fails 'no_space' at once, no files", [rf.summary?.state, lf?.id, lf?.state, lf?.error, existsSync(JOBX.exportDir(STORE_F, jobF))], ["failed", jobF, "failed", "no_space", false]);
    await ST.patchJobState(W.WALK_JOB, { snapshot: (savedState.snapshot as Record<string, unknown> | undefined) ?? null });

    // 72 h later (fake clock): the cleanup branch expires the job and deletes its files
    const idle = await exportsJob(jobCtx(), { now: () => Date.now() + 71 * 3_600_000 });
    t.eq("71 h: nothing expires", [idle.summary?.expired, existsSync(dirE)], [0, true]);
    const later = await exportsJob(jobCtx(), { now: () => Date.now() + 73 * 3_600_000 });
    const [gone] = await EX.listExportJobs(scopeE);
    t.eq("73 h: expired, the files gone, no href, the part list kept", [later.summary?.expired, gone?.state, existsSync(dirE), gone?.parts.every((p) => p.href === null), gone?.parts.length], [1, "expired", false, true, stored.length]);
    t.eq("…and no stream", await EX.exportPartStream(scopeE, jobId, "1"), null);
    t.check("a new request after expiry makes a new job (the bucket has room)", (await EX.requestStoreExport(scopeE, { requestedAs: "member", requestedBy: uE })).jobId !== jobId);
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
