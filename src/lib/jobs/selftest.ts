/**
 * Jobs and platform-ops self-test (offline: no database, no server; the walk section builds and removes one small
 * tree under os.tmpdir(), nothing else is written):
 *   npm run test:jobs   (tsx src/lib/jobs/selftest.ts; docs/STORE-SAAS.md §J.1, core group, ≤ 3 s)
 *
 * Sections (P8 steps 1-2; later steps add theirs):
 *  1. paths      the DATA_AREAS registry (§G.7, SEC-21), the roots, dataPath's layouts and refusals, mediaFilePath,
 *                perStoreDirs, the media temp folder and the cache fallback after a refused DATA_DIR;
 *  1b. walk      the bounded DATA_DIR walk on a temp tree (§G.2, ENGC-14): totals, one-directory slices resumed to the
 *                same totals, a JSON round trip of the cursor, yields between directories, unsafe or foreign cursors
 *                never followed, links never followed; DATA_DIR_BUDGET_BYTES, the 70 / 85 % levels, the 300,000-file
 *                warning, the snapshot reader (≤ 200 ms);
 *  2. errors     the §H.5 error ring: hour bucket, dedupe key, code choice, no raw message or customer value in a
 *                sample, the 500-key bound, the flush SQL, its errno 1452 / 1146 / other-failure handling;
 *  3. metrics    the percentile helper, the rolling 5-minute wait windows on a fake clock, the query-pool sampler
 *                on a fake pool (a direct hand-over to a waiter emits no 'acquire'), event-loop lag sampling;
 *  4. locks      §E.7 on a fake 2-connection pool: with both connections busy a request-path lock answers
 *                { ran: false } within its 1 s timeout (§J.1), the late connection goes back, a nested lock throws,
 *                GET_LOCK refused / RELEASE_LOCK failed, the waits reach the lock-pool window;
 *  5. registry   every registered job has a unique valid name and a positive budget;
 *  5b. asset refs (P8 step 6, §G.5) extractAssetIds on fixtures: a landing document (every AssetRef of product, items,
 *                offers, seo and sections, once; a damaged document), a theme (AssetRefs and *AssetId strings, the
 *                depth bound), the brand setting's logo roles and another setting; usageByPage's per-page merge;
 *  6. runner     (./selftest-runner.ts, P8 step 3) the slot table and the job budget rules, the Sheets capacity
 *                arithmetic, the due logic, the round robin's fairness, and runTickWith on a fake lease and fake clocks:
 *                skipped on overlap, an expired lease taken over, no lock-pool connection between jobs, the budget
 *                allocation, lag shortening, the yield contract, isolation, job_runs rows, the legacy Sheets shim;
 *  7. outbox     (./selftest-outbox.ts, P8 step 4) the backoff ladder and dead rules, httpRetryable, resendKey, the
 *                replay rule table, the §H.1 claim statement, the enqueue refusals; the drainer on an in-memory outbox:
 *                per-kind and per-store caps, timeouts, the kill switch, a missing handler, the budget, merged sends,
 *                mail's caps, unreadable payloads, lost claims and claim contention;
 *  8. renders    (./selftest-renders.ts, P8 step 5) the enqueue checks, the §H.3 claim statement, the outcomes and the
 *                retry ladder, the notes text, the CPU cap, the summary maths and the fan-out row; the drain on an
 *                in-memory queue: dedupe cleared on claim (a second render after an enqueue mid-render, ENGC-4), two
 *                enqueues while pending → one, priority order, ≤ 10 per store, the 4 s CPU cap, 3 retries then failed,
 *                runtime_v 1 skipped; the fan-out across pages of stores, and forEachStore's `stop`.
 */
import Module from "node:module";
import { EventEmitter } from "node:events";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { FakeClock, Harness, sleep } from "./testing/harness";

// the modules under test are marked `import "server-only"`; outside Next that import throws
{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = require.resolve("zod"); // any resolvable module: server-only exports nothing used
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    return req === "server-only" ? stub : orig.call(this, req, ...rest);
  };
}

const env = process.env as Record<string, string | undefined>;
// lock names carry db8(database name): a name only, never connected to (port 1 refuses at once if anything tried)
env.DATABASE_URL = "mysql://selftest@127.0.0.1:1/cod_test_p8_selftest";
for (const k of ["DATA_DIR", "MEDIA_DIR", "MEDIA_CACHE_DIR"]) delete env[k];

const STORE = "01JB8ZK3Q4R5S6T7V8W9XYZ0AB";
const OTHER = "7ZZZZZZZZZZZZZZZZZZZZZZZZZ";
const KEY = "9f2ce1aa55aa55aa55aa55aa55aa55aa-960.webp";

/** sets the three roots for one case (undefined = unset) */
function roots(r: { DATA_DIR?: string; MEDIA_DIR?: string; MEDIA_CACHE_DIR?: string }): void {
  for (const k of ["DATA_DIR", "MEDIA_DIR", "MEDIA_CACHE_DIR"] as const) {
    if (r[k] === undefined) delete env[k];
    else env[k] = r[k];
  }
}

async function main(): Promise<void> {
  const P = await import("@/lib/storage/paths");
  const W = await import("@/lib/storage/walk");
  const E = await import("./errors");
  const M = await import("./metrics");
  const L = await import("@/lib/db/locks");
  const { errorSummary } = await import("@/lib/orders/log");
  const { JOBS } = await import("./registry");

  const h = new Harness("test:jobs");
  const DATA = resolve(sep, "srv", "sg-data"); // absolute on every OS ("C:\srv\sg-data" on Windows); never created
  const MEDIA = resolve(sep, "mnt", "sg-media");
  const CACHE = resolve(sep, "var", "cache", "sg-media");

  /* ---------------------------------------------------------------- */
  h.section("paths: registry", (t) => {
    t.eq("DATA_AREAS: the §G.7 areas, in order", Object.keys(P.DATA_AREAS), ["media", "exports", "imports", "receipts", "ai", "backups", "cache"]);
    t.eq("media is per store under media/v1", P.DATA_AREAS.media, { perStore: true, root: "media/v1" });
    for (const a of ["exports", "imports", "receipts", "ai"] as const) t.eq(`${a} is per store`, P.DATA_AREAS[a], { perStore: true });
    for (const a of ["backups", "cache"] as const) t.eq(`${a} is not per store`, P.DATA_AREAS[a], { perStore: false });
    t.check("the registry is frozen", Object.isFrozen(P.DATA_AREAS) && Object.values(P.DATA_AREAS).every((d) => Object.isFrozen(d)));
    t.check("isDataArea refuses prototype names", !P.isDataArea("__proto__") && !P.isDataArea("constructor") && !P.isDataArea("toString"));
  });

  h.section("paths: roots", (t) => {
    roots({});
    t.eq("dataDir: unset → null", P.dataDir(), null);
    t.eq("mediaRoot: nothing set → null", P.mediaRoot(), null);
    t.eq("mediaCacheDir: nothing set → tmpdir()/store-gen-media", P.mediaCacheDir(), join(tmpdir(), "store-gen-media"));
    roots({ DATA_DIR: "relative/data" });
    t.eq("dataDir: relative → null", P.dataDir(), null);
    roots({ DATA_DIR: "   " });
    t.eq("dataDir: blank → null", P.dataDir(), null);
    roots({ DATA_DIR: `${DATA}${sep}` });
    t.eq("dataDir: absolute, normalized", P.dataDir()?.replace(/[\\/]+$/, ""), DATA);
    roots({ DATA_DIR: DATA });
    t.eq("mediaRoot: DATA_DIR/media", P.mediaRoot(), join(DATA, "media"));
    t.eq("mediaCacheDir: DATA_DIR/cache/media", P.mediaCacheDir(), join(DATA, "cache", "media"));
    roots({ DATA_DIR: DATA, MEDIA_DIR: MEDIA });
    t.eq("mediaRoot: MEDIA_DIR overrides DATA_DIR/media", P.mediaRoot(), MEDIA);
    roots({ DATA_DIR: DATA, MEDIA_DIR: "media-here" });
    t.eq("mediaRoot: a relative MEDIA_DIR turns media off, never a guess", P.mediaRoot(), null);
    roots({ DATA_DIR: DATA, MEDIA_CACHE_DIR: CACHE });
    t.eq("mediaCacheDir: MEDIA_CACHE_DIR first", P.mediaCacheDir(), CACHE);
    roots({ DATA_DIR: DATA, MEDIA_CACHE_DIR: "rel-cache" });
    t.eq("mediaCacheDir: a relative MEDIA_CACHE_DIR falls back", P.mediaCacheDir(), join(DATA, "cache", "media"));
    roots({ DATA_DIR: DATA });
    t.eq("mediaCacheDir(false): a refused DATA_DIR gets no cache, tmpdir() instead", P.mediaCacheDir(false), join(tmpdir(), "store-gen-media"));
    roots({ DATA_DIR: DATA, MEDIA_CACHE_DIR: CACHE });
    t.eq("mediaCacheDir(false): MEDIA_CACHE_DIR still wins", P.mediaCacheDir(false), CACHE);
    roots({ DATA_DIR: DATA });
    t.eq("mediaTmpDir: <media root>/tmp", P.mediaTmpDir(), join(DATA, "media", "tmp"));
    roots({ DATA_DIR: DATA, MEDIA_DIR: MEDIA });
    t.eq("mediaTmpDir: under MEDIA_DIR (same file system as v1)", P.mediaTmpDir(), join(MEDIA, "tmp"));
    roots({});
    t.eq("mediaTmpDir: no media root → null", P.mediaTmpDir(), null);
    t.eq("areaBaseUnder: explicit roots, no environment", P.areaBaseUnder("media", { dataDir: DATA, mediaRoot: MEDIA }), join(MEDIA, "v1"));
    t.eq("areaBaseUnder: backups under dataDir", P.areaBaseUnder("backups", { dataDir: DATA, mediaRoot: null }), join(DATA, "backups"));
    t.eq("areaBaseUnder: a null root → null", P.areaBaseUnder("exports", { dataDir: null, mediaRoot: MEDIA }), null);
  });

  h.section("paths: layouts", (t) => {
    roots({ DATA_DIR: DATA });
    t.eq("exports: <area>/<storeId>/…", P.dataPath("exports", STORE, "JOB1", "part-1.zip"), join(DATA, "exports", STORE, "JOB1", "part-1.zip"));
    t.eq("imports", P.dataPath("imports", STORE), join(DATA, "imports", STORE));
    t.eq("receipts", P.dataPath("receipts", STORE, "r.webp"), join(DATA, "receipts", STORE, "r.webp"));
    t.eq("ai", P.dataPath("ai", STORE, "blob.json"), join(DATA, "ai", STORE, "blob.json"));
    t.eq("backups: no store level", P.dataPath("backups", null, "2026-10-28", "orders.0001.sgb"), join(DATA, "backups", "2026-10-28", "orders.0001.sgb"));
    t.eq("cache: no store level (undefined id)", P.dataPath("cache", undefined, "media"), join(DATA, "cache", "media"));
    t.eq("media: v1/<id[0..1]>/<id>", P.dataPath("media", STORE), join(DATA, "media", "v1", "01", STORE));
    t.eq("mediaFilePath: …/<key[0..1]>/<key>", P.mediaFilePath(STORE, KEY), join(DATA, "media", "v1", "01", STORE, "9f", KEY));
    roots({ DATA_DIR: DATA, MEDIA_DIR: MEDIA });
    t.eq("mediaFilePath under MEDIA_DIR: <MEDIA_DIR>/v1/…", P.mediaFilePath(STORE, KEY), join(MEDIA, "v1", "01", STORE, "9f", KEY));
    t.eq("exports stay under DATA_DIR with MEDIA_DIR set", P.dataPath("exports", STORE), join(DATA, "exports", STORE));
  });

  h.section("paths: refusals", (t) => {
    roots({ DATA_DIR: DATA });
    const area = (a: string) => a as Parameters<typeof P.dataPath>[0];
    for (const a of ["tmp", "__proto__", "constructor", "media/v1", "", "MEDIA"]) t.throws(`unknown area "${a}"`, () => P.dataPath(area(a), STORE), /unknown data area/);
    t.throws("a per-store area without a store id", () => P.dataPath("exports"), /needs a store id/);
    t.throws("a per-store area with a null id", () => P.dataPath("media", null), /needs a store id/);
    t.throws("a store id on a platform area", () => P.dataPath("backups", STORE), /not a per-store area/);
    const badIds = [STORE.toLowerCase(), STORE.slice(1), `${STORE}0`, "01JB8ZK3Q4R5S6T7V8W9XYZ0AI", "01JB8ZK3Q4R5S6T7V8W9XYZ0AL", "01JB8ZK3Q4R5S6T7V8W9XYZ0AO", "01JB8ZK3Q4R5S6T7V8W9XYZ0AU", "../../../../etc/passwd....", `01JB8ZK3Q4R5S6T7V8W9XYZ0A${sep}`];
    for (const id of badIds) t.throws(`store id "${id}" refused`, () => P.dataPath("exports", id), /needs a store id/);
    const badSegments = ["..", ".", "", "a/b", "a\\b", "/etc", "C:", "C:\\x", "x\0y", "a:b", "x".repeat(256)];
    for (const s of badSegments) t.throws(`segment ${JSON.stringify(s.length > 20 ? `${s.slice(0, 8)}…(${s.length})` : s)} refused`, () => P.dataPath("exports", STORE, "ok", s), /bad path segment 2/);
    t.throws("a non-string segment refused", () => P.dataPath("backups", null, 5 as unknown as string), /bad path segment 1/);
    t.throws("mediaFilePath: a key outside keys.ts refused", () => P.mediaFilePath(STORE, "../x-960.webp"), /bad media key/);
    t.throws("mediaFilePath: an upper-case key refused", () => P.mediaFilePath(STORE, KEY.toUpperCase()), /bad media key/);
    t.throws("mediaFilePath: a bad store id refused", () => P.mediaFilePath("x", KEY), /needs a store id/);
    roots({});
    t.throws("no DATA_DIR: dataPath throws", () => P.dataPath("exports", STORE), /DATA_DIR is not set/);
    t.throws("no media root: mediaFilePath throws", () => P.mediaFilePath(STORE, KEY), /no media root/);
    // whatever the inputs, a built path stays inside its area's base
    roots({ DATA_DIR: DATA });
    const inside = (base: string, p: string) => {
      const r = relative(base, p);
      return r !== "" && !r.startsWith("..") && !isAbsolute(r);
    };
    t.check("built paths stay inside their base", inside(join(DATA, "exports", STORE), P.dataPath("exports", STORE, "a", "b")) && inside(join(DATA, "media", "v1"), P.mediaFilePath(STORE, KEY)));
  });

  h.section("paths: perStoreDirs", (t) => {
    roots({ DATA_DIR: DATA });
    t.eq(
      "every per-store area, the media shard included",
      P.perStoreDirs(OTHER),
      [
        { area: "media", dir: join(DATA, "media", "v1", "7Z", OTHER) },
        { area: "exports", dir: join(DATA, "exports", OTHER) },
        { area: "imports", dir: join(DATA, "imports", OTHER) },
        { area: "receipts", dir: join(DATA, "receipts", OTHER) },
        { area: "ai", dir: join(DATA, "ai", OTHER) },
      ],
    );
    const perStore = Object.entries(P.DATA_AREAS)
      .filter(([, d]) => d.perStore)
      .map(([a]) => a);
    t.eq("perStoreDirs covers exactly the perStore areas", P.perStoreDirs(OTHER).map((d) => d.area), perStore);
    roots({ MEDIA_DIR: MEDIA });
    t.eq("only MEDIA_DIR set: the media shard alone", P.perStoreDirs(OTHER), [{ area: "media", dir: join(MEDIA, "v1", "7Z", OTHER) }]);
    roots({});
    t.eq("nothing configured: nothing to purge on disk", P.perStoreDirs(OTHER), []);
    t.throws("perStoreDirs refuses a bad id", () => P.perStoreDirs("../x"), /bad store id/);
  });


  /* ---------------------------------------------------------------- */
  h.section("walk: accounting", async (t) => {
    const root = mkdtempSync(join(tmpdir(), "sg-walk-"));
    try {
      // root/f1 (10) · a/f2 (100) · a/b/f3 (1000) · a/b/f4 (0) · c/f5 (7): 5 files, 1117 bytes, 4 directories
      mkdirSync(join(root, "a", "b"), { recursive: true });
      mkdirSync(join(root, "c"));
      writeFileSync(join(root, "f1"), Buffer.alloc(10));
      writeFileSync(join(root, "a", "f2"), Buffer.alloc(100));
      writeFileSync(join(root, "a", "b", "f3"), Buffer.alloc(1000));
      writeFileSync(join(root, "a", "b", "f4"), Buffer.alloc(0));
      writeFileSync(join(root, "c", "f5"), Buffer.alloc(7));
      const want = { bytes: 1117, files: 5, dirs: 4, skipped: 0 };
      const totals = (r: { bytes: number; files: number; dirs: number; skipped: number }) => ({ bytes: r.bytes, files: r.files, dirs: r.dirs, skipped: r.skipped });

      let yields = 0;
      const full = await W.walkDataDir({ budgetMs: 60_000, root, yieldFn: async () => void yields++ });
      t.eq("one slice: the whole tree", { ...totals(full), complete: full.complete, cursor: full.cursor }, { ...want, complete: true, cursor: null });
      t.eq("it yields between directories (dirs − 1 times)", yields, 3);

      // budget 0: one directory per slice, each cursor resumed after a JSON round trip (as cron_cursors keeps it)
      let slices = 0;
      let r = await W.walkDataDir({ budgetMs: 0, root });
      slices++;
      t.check("budget 0 still makes progress (the root)", !r.complete && r.dirs === 1 && r.files === 1 && r.bytes === 10 && (r.cursor?.stack.length ?? 0) > 0);
      while (!r.complete && slices < 20) {
        r = await W.walkDataDir({ budgetMs: 0, root, resume: JSON.parse(JSON.stringify(r.cursor)) as typeof r.cursor });
        slices++;
      }
      t.eq("resumed slices reach the same totals", { ...totals(r), complete: r.complete }, { ...want, complete: true });
      t.eq("one directory per slice", slices, 4);

      const now = { t: 0 };
      const clocked = await W.walkDataDir({ budgetMs: 5, root, now: () => (now.t += 3) });
      t.check("the budget is checked after each directory", !clocked.complete && clocked.dirs === 2, JSON.stringify(totals(clocked)));

      const foreign = await W.walkDataDir({ budgetMs: 60_000, root, resume: { v: 1, root: join(root, "elsewhere"), stack: ["a"], bytes: 999, files: 9, dirs: 9, skipped: 0 } });
      t.eq("a cursor of another root is not resumed (fresh walk)", totals(foreign), want);
      const unsafe = await W.walkDataDir({ budgetMs: 60_000, root, resume: { v: 1, root, stack: ["../x", "/etc", "a\\b", "a/../c", "C:", "", "gone"], bytes: 0, files: 0, dirs: 0, skipped: 0 } });
      t.eq("unsafe entries are skipped, never followed; a vanished folder is ignored", totals(unsafe), { ...want, skipped: 5 });

      let linked = false;
      try {
        symlinkSync(join(root, "a"), join(root, "link"), process.platform === "win32" ? "junction" : "dir");
        linked = true;
      } catch {
        // no link privilege here: the case is skipped
      }
      if (linked) {
        const withLink = await W.walkDataDir({ budgetMs: 60_000, root });
        t.eq("a link is one file, never followed", totals(withLink), { ...want, files: want.files + 1 });
      }
      await t.rejects("no root configured → throws", () => W.walkDataDir({ budgetMs: 0 }), /DATA_DIR is not set/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  h.section("walk: budget and levels", (t) => {
    const GiB = 1024 ** 3;
    t.eq("budgetBytes: unset → 20 GiB", W.budgetBytes(undefined), 20 * GiB);
    t.eq("budgetBytes: an integer", W.budgetBytes(" 1073741824 "), GiB);
    for (const bad of ["", "abc", "-5", "0", "1.5", "1e9", "20GiB", "99999999999999999999"]) t.eq(`budgetBytes: "${bad}" → default`, W.budgetBytes(bad), 20 * GiB);
    const B = 1000;
    t.eq("level: below 70 % → null", W.dataDirLevel(699, B), null);
    t.eq("level: 70 % → data_dir_70", W.dataDirLevel(700, B), "data_dir_70");
    t.eq("level: 84.9 % → data_dir_70", W.dataDirLevel(849, B), "data_dir_70");
    t.eq("level: 85 % → data_dir_85", W.dataDirLevel(850, B), "data_dir_85");
    t.eq("level: over budget → data_dir_85", W.dataDirLevel(5 * B, B), "data_dir_85");
    t.eq("level: no budget → null", W.dataDirLevel(5, 0), null);
    t.eq("inodes: 300,000 files → no warning", W.inodeWarning(300_000), false);
    t.eq("inodes: 300,001 files → warning", W.inodeWarning(300_001), true);
    const snap = { bytes: 5, files: 2, dirs: 1, budgetBytes: B, complete: true, at: "2026-10-28T02:15:00.000Z" };
    t.eq("snapshot: read back", W.readWalkSnapshot({ snapshot: snap, cursor: null }), snap);
    t.eq("snapshot: none", W.readWalkSnapshot(null), null);
    t.eq("snapshot: an incomplete one is ignored", W.readWalkSnapshot({ snapshot: { ...snap, complete: false } }), null);
    t.eq("snapshot: a malformed one is ignored", W.readWalkSnapshot({ snapshot: { ...snap, bytes: -1 } }), null);
  });

  /* ---------------------------------------------------------------- */
  h.section("errors: keys", (t) => {
    const clock = new FakeClock(Date.UTC(2026, 9, 28, 9, 59, 59, 999));
    t.eq("bucket: YYYY-MM-DDTHH in UTC", E.errorBucket(clock.now()), "2026-10-28T09");
    clock.advance(1);
    t.eq("bucket: the next hour one ms later", E.errorBucket(clock.now()), "2026-10-28T10");
    clock.set(Date.UTC(2026, 11, 31, 23, 30));
    t.eq("bucket: across the year", E.errorBucket(clock.advance(31 * 60_000)), "2027-01-01T00");
    const want = createHash("sha256").update("2026-10-28T09|orders|ER_DUP_ENTRY||", "utf8").digest("hex");
    t.eq("dedupe = sha256(bucket|area|code|route|storeId), empty route and store", E.errorDedupe("2026-10-28T09", "orders", "ER_DUP_ENTRY", null, null), want);
    const base = E.errorDedupe("2026-10-28T09", "action", "TypeError", "/r", STORE);
    t.check("dedupe differs by bucket", base !== E.errorDedupe("2026-10-28T10", "action", "TypeError", "/r", STORE));
    t.check("dedupe differs by route", base !== E.errorDedupe("2026-10-28T09", "action", "TypeError", "/s", STORE));
    t.check("dedupe differs by store", base !== E.errorDedupe("2026-10-28T09", "action", "TypeError", "/r", OTHER));
    t.check("dedupe differs by area and code", base !== E.errorDedupe("2026-10-28T09", "orders", "TypeError", "/r", STORE) && base !== E.errorDedupe("2026-10-28T09", "action", "RangeError", "/r", STORE));
    t.check("dedupe is 64 hex chars", /^[a-f0-9]{64}$/.test(base));

    const driver = Object.assign(new Error("Deadlock found"), { code: "ER_LOCK_DEADLOCK", errno: 1213, sqlState: "40001", sqlMessage: "Deadlock found" });
    t.eq("code: the option first", E.errorCode(driver, "path_unsigned"), "path_unsigned");
    t.eq("code: the driver's code", E.errorCode(driver), "ER_LOCK_DEADLOCK");
    t.eq("code: the driver's code through the cause chain", E.errorCode(Object.assign(new Error("Failed query"), { cause: driver })), "ER_LOCK_DEADLOCK");
    t.eq("code: a network code of the driver", E.errorCode(Object.assign(new Error("connect"), { code: "ECONNREFUSED", errno: -4078 })), "ECONNREFUSED");
    t.eq("code: else the error's name", E.errorCode(new TypeError("x")), "TypeError");
    t.eq("code: no error object", E.errorCode(null), "unknown");
    t.eq("code: a hostile option is cleaned", E.errorCode(null, "bad code\n<x>"), "bad_code_x_");
  });

  h.section("errors: buffer and samples", (t) => {
    E.resetErrorBuffer();
    E.recordError("orders", new TypeError("boom"), { storeId: STORE, route: "/api/app/[store]/orders?x=1#f" });
    E.recordError("orders", new TypeError("boom again"), { storeId: STORE, route: "/api/app/[store]/orders" });
    E.recordError("orders", new TypeError("boom"), { storeId: OTHER, route: "/api/app/[store]/orders" });
    const rows = E.pendingErrors();
    t.eq("same key merges, another store is its own row", rows.map((r) => r.count).sort(), [1, 2]);
    const mine = rows.find((r) => r.storeId === STORE)!;
    t.eq("route: the query and fragment are cut", mine.route, "/api/app/[store]/orders");
    t.eq("the row's key fields", { area: mine.area, code: mine.code, bucket: mine.bucket }, { area: "orders", code: "TypeError", bucket: E.errorBucket(Date.now()) });
    t.eq("dedupe matches errorDedupe", mine.dedupe, E.errorDedupe(mine.bucket, "orders", "TypeError", "/api/app/[store]/orders", STORE));
    t.eq("the first sample is kept", mine.sample, { summary: "TypeError: boom" });

    // canaries: a failed query whose message and driver error quote a phone and an e-mail
    E.resetErrorBuffer();
    const PHONE = "+212612345678";
    const MAIL = "canary.p8@example.com";
    const dup = Object.assign(new Error(`Duplicate entry '${PHONE}' for key 'uq'`), { code: "ER_DUP_ENTRY", errno: 1062, sqlState: "23000", sqlMessage: `Duplicate entry '${PHONE}' for key 'uq'`, sql: `insert into customers values ('${PHONE}', '${MAIL}')` });
    const failed = Object.assign(new Error(`Failed query: insert into customers (phone, email) values (?, ?)\nparams: ${PHONE},${MAIL}`), { query: "insert into customers (phone, email) values (?, ?)", params: [PHONE, MAIL], cause: dup });
    E.recordError("orders", failed, { storeId: STORE });
    const [q] = E.pendingErrors();
    t.eq("a failed query: the sample is errorSummary only", q?.sample, { summary: errorSummary(failed) });
    t.eq("a failed query: its code is the driver's", q?.code, "ER_DUP_ENTRY");
    const blob = JSON.stringify(E.pendingErrors());
    t.check("no phone canary anywhere in the buffer", !blob.includes("612345678"), blob);
    t.check("no e-mail canary anywhere in the buffer", !blob.includes("canary.p8") && !blob.includes("example.com"), blob);
    t.check("no driver message in the buffer", !blob.includes("Duplicate entry") && !blob.includes("insert into"), blob);

    E.resetErrorBuffer();
    E.recordError("api", new Error(`could not reach ${MAIL} or ${"+212 6 12-34-56-78"} (ref 0612345678)`));
    const [plain] = E.pendingErrors();
    const s = plain?.sample?.summary ?? "";
    t.check("a plain Error: e-mails and digit runs are masked", s.startsWith("Error: could not reach <email> or <n> (ref <n>)") && !s.includes("canary") && !/\d{6}/.test(s), s);
    t.eq("a plain Error: the sample holds the summary key only", Object.keys(plain?.sample ?? {}), ["summary"]);
    E.recordError("api", new Error("x".repeat(500)));
    t.check("a summary is at most 200 characters", E.pendingErrors().every((r) => (r.sample?.summary.length ?? 0) <= 200));

    E.resetErrorBuffer();
    E.recordError("edge", null, { code: "path_unsigned" });
    const [edge] = E.pendingErrors();
    t.eq("a counted event without an error: no sample", { code: edge?.code, sample: edge?.sample, storeId: edge?.storeId }, { code: "path_unsigned", sample: null, storeId: null });
    E.recordError("Bad Area!/x".repeat(10), "not an error", { storeId: "../evil", route: 42 as unknown as string });
    const odd = E.pendingErrors().find((r) => r.code !== "path_unsigned");
    t.check("hostile inputs are cleaned, never thrown", !!odd && odd.area.length <= 32 && /^[a-z0-9_.-]+$/.test(odd.area) && odd.storeId === null && odd.route === null && odd.code === "unknown");
    let threw = false;
    try {
      const evil = { get name(): string { throw new Error("getter"); } };
      E.recordError(undefined as unknown as string, Object.setPrototypeOf(evil, Error.prototype));
      E.recordError("x", Symbol("s"));
    } catch {
      threw = true;
    }
    t.check("recordError never throws", !threw);

    E.resetErrorBuffer();
    for (let i = 0; i < 600; i++) E.recordError("spam", null, { code: `C${i}` });
    const all = E.pendingErrors();
    t.eq("at most 500 keys", all.length, 500);
    t.eq("no count is lost: 600 events", all.reduce((n, r) => n + r.count, 0), 600);
    t.eq("the overflow row holds the rest", all.find((r) => r.code === "buffer_full")?.count, 101);
    E.resetErrorBuffer();
  });

  h.section("errors: flush", async (t) => {
      const calls: { sql: string; values: unknown[] }[] = [];
      const ok = async (sql: string, values: unknown[]) => {
        calls.push({ sql, values });
        return [{ affectedRows: 1 }];
      };
      E.resetErrorBuffer();
      await E.flushErrors(ok);
      t.eq("nothing buffered: no statement", calls.length, 0);
      for (let i = 0; i < 250; i++) E.recordError("jobs", null, { code: `C${i}`, storeId: STORE });
      E.recordError("jobs", null, { code: "C0", storeId: STORE });
      await E.flushErrors(ok);
      t.eq("250 rows in batches of 100", calls.map((c) => c.values.length / 10), [100, 100, 50]);
      t.check(
        "the upsert adds counts and moves last_at",
        calls.every((c) => /^INSERT INTO error_events \(dedupe, bucket, area, code, route, store_id, count, first_at, last_at, sample\) VALUES \(\?(, \?){9}\)/.test(c.sql) && c.sql.endsWith("ON DUPLICATE KEY UPDATE count = count + VALUES(count), last_at = VALUES(last_at)")),
        calls[0]?.sql,
      );
      t.eq("the merged row carries count 2", calls[0]?.values[6], 2);
      t.eq("the buffer is empty after a flush", E.pendingErrors().length, 0);

      // a vanished store (FK, errno 1452): the batch is retried row by row and that row is kept store-less
      calls.length = 0;
      E.recordError("jobs", null, { code: "A", storeId: STORE });
      E.recordError("jobs", null, { code: "B", storeId: OTHER });
      const fk = async (sql: string, values: unknown[]) => {
        const stores = [];
        for (let i = 5; i < values.length; i += 10) stores.push(values[i]);
        if (stores.includes(OTHER)) throw Object.assign(new Error("fk"), { errno: 1452, code: "ER_NO_REFERENCED_ROW_2" });
        calls.push({ sql, values });
        return [{}];
      };
      await E.flushErrors(fk);
      t.eq("1452: both rows stored, the vanished store as NULL", calls.map((c) => [c.values[3], c.values[5]]), [["A", STORE], ["B", null]]);
      t.eq("1452: nothing left over", E.pendingErrors().length, 0);

      // other failures keep the rest of the counts for the next flush; a missing table drops them, logged once
      const logs: string[] = [];
      const origError = console.error;
      console.error = (...args: unknown[]) => void logs.push(args.map(String).join(" "));
      try {
        for (let i = 0; i < 150; i++) E.recordError("jobs", null, { code: `D${i}` });
        let n = 0;
        await E.flushErrors(async () => {
          if (n++ === 1) throw Object.assign(new Error("gone"), { code: "PROTOCOL_CONNECTION_LOST", errno: -4077 });
          return [{}];
        });
        t.eq("a failure part-way: only the unwritten rows go back", E.pendingErrors().length, 50);
        t.check("a failure part-way: one log line, the driver code only", logs.length === 1 && logs[0]!.includes("PROTOCOL_CONNECTION_LOST") && !logs[0]!.includes("gone"), logs.join(" | "));
        const missing = async () => {
          throw Object.assign(new Error("Table 'cod.error_events' doesn't exist"), { errno: 1146, code: "ER_NO_SUCH_TABLE", sqlMessage: "x" });
        };
        await E.flushErrors(missing);
        t.eq("1146: the buffer is dropped", E.pendingErrors().length, 0);
        E.recordError("jobs", null, { code: "E" });
        await E.flushErrors(missing);
        t.eq("1146: logged once per process", logs.filter((l) => l.includes("error_events is missing")).length, 1);
      } finally {
        console.error = origError;
        E.resetErrorBuffer();
      }
  });

  /* ---------------------------------------------------------------- */
  h.section("metrics: percentile", (t) => {
    const oneTo = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
    t.eq("empty → null", M.percentile([], 95), null);
    t.eq("one sample", M.percentile([7], 95), 7);
    t.eq("p95 of 1..100 = 95 (nearest rank)", M.percentile(oneTo(100), 95), 95);
    t.eq("p95 of 1..20 = 19", M.percentile(oneTo(20), 95), 19);
    t.eq("p50 of 1..10 = 5", M.percentile(oneTo(10), 50), 5);
    t.eq("p0 = min, p100 = max, unsorted input", [M.percentile([9, 1, 5], 0), M.percentile([9, 1, 5], 100)], [1, 9]);
    t.eq("non-finite values are ignored", M.percentile([NaN, 3, Infinity, 1], 100), 3);
    t.eq("p out of range is clamped", M.percentile([1, 2, 3], 150), 3);
  });

  h.section("metrics: wait windows", (t) => {
    M.resetOpsMetrics();
    const clock = new FakeClock();
    t.eq("no samples → null (query pool)", M.poolWaitP95Ms(clock.now()), null);
    t.eq("no samples → null (lock pool)", M.lockPoolWaitP95Ms(clock.now()), null);
    for (let i = 1; i <= 20; i++) M.recordLockPoolWait(i * 10, clock.advance(1000));
    t.eq("lock pool p95 over the window", M.lockPoolWaitP95Ms(clock.now()), 190);
    clock.advance(M.WAIT_WINDOW_MS - 10_500);
    t.eq("samples older than 5 minutes drop out", M.lockPoolWaitP95Ms(clock.now()), 200);
    clock.advance(60_000);
    t.eq("an empty window → null again", M.lockPoolWaitP95Ms(clock.now()), null);
    M.recordLockPoolWait(-5, clock.now());
    t.eq("a negative wait counts as 0", M.lockPoolWaitP95Ms(clock.now()), 0);
    for (let i = 0; i < M.MAX_WAIT_SAMPLES + 600; i++) M.recordLockPoolWait(i < 600 ? 10_000 : 1, clock.now());
    t.eq("only the newest 4,096 samples count", M.lockPoolWaitP95Ms(clock.now()), 1);

    // the query-pool sampler on a fake mysql2 pool: emits 'enqueue' / 'acquire', exposes pool._connectionQueue
    M.resetOpsMetrics();
    const queue: unknown[] = [];
    const fake = Object.assign(new EventEmitter(), { pool: { _connectionQueue: queue } });
    t.check("ensureOpsSamplers attaches to a pool", M.ensureOpsSamplers(fake, clock.now));
    t.check("a second call is a no-op", M.ensureOpsSamplers(fake, clock.now) && fake.listenerCount("acquire") === 1);
    t.check("a different pool is refused", !M.ensureOpsSamplers(Object.assign(new EventEmitter(), { pool: { _connectionQueue: [] } }), clock.now));
    fake.emit("acquire");
    fake.emit("acquire");
    t.eq("free connections: 0 ms waits", M.poolWaitP95Ms(clock.now()), 0);
    queue.push("w1");
    fake.emit("enqueue");
    clock.advance(300);
    queue.push("w2");
    fake.emit("enqueue");
    clock.advance(400);
    queue.shift(); // a release handed its connection straight to w1: mysql2 emits nothing for that
    t.eq("a direct hand-over is still measured (700 ms)", M.poolWaitP95Ms(clock.now()), 700);
    clock.advance(100);
    queue.shift(); // w2 served through a fresh connection: 'acquire' is emitted
    fake.emit("acquire");
    const p95 = M.poolWaitP95Ms(clock.now());
    t.eq("the 'acquire' of a waiter is one sample (500 ms), not an extra 0", p95, 700);
    fake.emit("acquire");
    t.eq("samples: 0, 0, 700, 500, 0 → p95 700", M.poolWaitP95Ms(clock.now()), 700);
    M.resetOpsMetrics();
    fake.emit("enqueue");
    t.eq("after a reset the old pool's listeners are quiet", M.poolWaitP95Ms(clock.now()), null);
  });

  h.section("metrics: event-loop lag", async (t) => {
    M.resetOpsMetrics();
    t.eq("stop without a start → nulls", M.stopLagSampling(), { p95Ms: null, maxMs: null });
    t.eq("currentLagMs outside a tick → 0", M.currentLagMs(), 0);
    M.startLagSampling();
    await sleep(60);
    const spin = Date.now();
    while (Date.now() - spin < 120) {
      // a blocked loop: the next timer fires ~120 ms late
    }
    await sleep(60);
    const during = M.currentLagMs();
    const lag = M.stopLagSampling();
    t.check("currentLagMs during a tick is a number ≥ 0", Number.isFinite(during) && during >= 0, String(during));
    t.check("a 120 ms block shows as max lag ≥ 80 ms", (lag.maxMs ?? 0) >= 80, JSON.stringify(lag));
    t.check("p95 ≤ max", lag.p95Ms !== null && lag.maxMs !== null && lag.p95Ms <= lag.maxMs, JSON.stringify(lag));
    t.eq("the last tick's lag is kept", M.lastTickLag(), lag);
    t.eq("after stop: currentLagMs → 0", M.currentLagMs(), 0);
  });

  /* ---------------------------------------------------------------- */
  h.section("locks: fake 2-connection pool", async (t) => {
    M.resetOpsMetrics();
    const pool = fakeLockPool(2);
    const lock = L.platformLock("selftest");
    t.check("lock names carry db8 of the database", /^[a-f0-9]{8}:p:selftest$/.test(lock), lock);

    const ran = await L.withNamedLockOnPool(pool, lock, 1, async () => 42);
    t.eq("a free pool: ran with the value", ran, { ran: true, value: 42 });
    t.eq("GET_LOCK then RELEASE_LOCK, with the lock name", pool.log.map((q) => q.sql.match(/(GET|RELEASE)_LOCK/)?.[0] + ":" + String(q.values[0])), [`GET_LOCK:${lock}`, `RELEASE_LOCK:${lock}`]);
    t.eq("the connection went back to the pool", pool.free(), 2);

    // both connections busy (the tick's job and another request each hold one): a request path gets { ran: false }
    const a = await pool.getConnection();
    const b = await pool.getConnection();
    let called = false;
    const t0 = performance.now();
    const busy = await L.withNamedLockOnPool(pool, lock, 1, async () => {
      called = true;
    });
    const waited = performance.now() - t0;
    t.eq("both connections busy → { ran: false }", busy, { ran: false });
    t.check("…within its 1 s timeout (≤ 1.1 s)", waited >= 950 && waited <= 1100, `${waited.toFixed(0)} ms`);
    t.check("…and the body never ran", !called);
    t.check("the timed-out wait is a lock-pool sample (p95 ≥ 1000 ms)", (M.lockPoolWaitP95Ms() ?? 0) >= 1000, String(M.lockPoolWaitP95Ms()));
    a.release();
    await sleep(0);
    t.eq("a connection that arrives after the deadline goes straight back", pool.free(), 1);
    b.release();
    t.eq("both back", pool.free(), 2);

    // nesting would deadlock a pool of 2: it throws, for the seam and for the app entry point alike
    await t.rejects(
      "a nested lock throws",
      () => L.withNamedLockOnPool(pool, lock, 1, () => L.withNamedLockOnPool(pool, L.platformLock("inner"), 1, async () => 1)),
      /one named lock at a time/,
    );
    await t.rejects(
      "a nested withNamedLock throws before touching its pool",
      () => L.withNamedLockOnPool(pool, lock, 1, () => L.withNamedLock(L.platformLock("inner"), 1, async () => 1)),
      /one named lock at a time/,
    );
    t.eq("the outer connection is back after the throw", pool.free(), 2);
    const after = await L.withNamedLockOnPool(pool, lock, 1, async () => L.withNamedLockOnPool(pool, lock, 1, async () => 0).catch(() => "nested"));
    t.eq("still refused inside the body", after, { ran: true, value: "nested" });
    const sequential = await L.withNamedLockOnPool(pool, lock, 1, async () => 1);
    t.eq("a lock after a released one is fine", sequential, { ran: true, value: 1 });

    // GET_LOCK refused (another session holds the name): { ran: false }, the connection is reusable
    pool.getLockAnswer = 0;
    t.eq("GET_LOCK 0 → { ran: false }", await L.withNamedLockOnPool(pool, lock, 1, async () => 1), { ran: false });
    t.eq("…and its connection went back", [pool.free(), pool.destroyed], [2, 0]);
    pool.getLockAnswer = 1;
    // RELEASE_LOCK failed: the connection may still hold the lock, so it is destroyed, never pooled
    pool.failRelease = true;
    t.eq("RELEASE_LOCK failing still returns the value", await L.withNamedLockOnPool(pool, lock, 1, async () => "v"), { ran: true, value: "v" });
    t.eq("…and destroys that connection", pool.destroyed, 1);
    t.check("every acquisition is a lock-pool sample", M.lockPoolWaitP95Ms() !== null);
  });

  /* ---------------------------------------------------------------- */
  h.section("registry", (t) => {
    const names = JOBS.map((j) => j.name);
    t.eq("job names are unique", new Set(names).size, names.length);
    t.check("job names are valid (≤ 48 chars, not 'tick')", JOBS.every((j) => /^[a-z][a-z0-9_.:-]{0,47}$/.test(j.name) && j.name !== "tick"), names.join(", "));
    t.check("every job declares a positive budget", JOBS.every((j) => Number.isFinite(j.budgetMs) && j.budgetMs > 0));
  });

  /* ---------------------------------------------------------------- */
  const AR = await import("@/lib/storage/asset-refs");
  h.section("asset refs: extractAssetIds", (t) => {
    const id = (c: string) => c.repeat(32);
    const [a1, a2, a3, a4, a5, a6] = ["a", "b", "c", "d", "e", "f"].map(id) as [string, string, string, string, string, string];
    const doc = {
      product: { images: [{ id: a1, alt: "Argan" }], hero: { id: a2, fx: 0.5, fy: 0.4 } },
      items: [{ image: { id: a3 } }],
      offers: [{ badge: { id: a1 } }],
      seo: { ogImage: { id: a4 } },
      sections: [
        { type: "gallery", data: { photos: [{ id: a5, box: { x: 0, y: 0, w: 1, h: 1 } }, { id: "NOT-HEX" }, { id: a6, caption: "an object with more than an AssetRef's keys" }] } },
        null,
        "junk",
      ],
    };
    t.eq("doc: every AssetRef in product, items, offers, seo and sections, once, in that order", AR.extractAssetIds({ kind: "doc", doc }), [a1, a2, a3, a4, a5]);
    t.eq("doc: a damaged document yields what it can (no sections, no product)", AR.extractAssetIds({ kind: "doc", doc: { seo: { ogImage: { id: a4 } }, sections: "nope" } }), [a4]);
    t.eq("doc: not an object → []", [AR.extractAssetIds({ kind: "doc", doc: null }), AR.extractAssetIds({ kind: "doc", doc: "x" })], [[], []]);
    const theme = { header: { logo: { id: a1 } }, blocks: [{ heroAssetId: a2 }, { assetId: a3 }, { assetId: "BAD" }, { title: a4 }], nested: [[[{ id: a5, alt: "" }]]] };
    t.eq("theme: AssetRefs and *AssetId / assetId strings, never a plain string", AR.extractAssetIds({ kind: "theme", theme }), [a1, a2, a3, a5]);
    let deep: Record<string, unknown> = { id: a6 };
    for (let i = 0; i < 20; i++) deep = { child: deep };
    t.eq("theme: the walk stops at its depth bound", AR.extractAssetIds({ kind: "theme", theme: deep }), []);
    const brand = { v: 1, logo: { primary: a1, mark: null, wordmark: a1, inverse: a2, source: "upload" }, colors: { accent: "#123456" } };
    t.eq("brand settings: the logo roles (null skipped, unique)", AR.extractAssetIds({ kind: "settings", key: "brand", value: brand }), [a1, a2]);
    t.eq("brand settings without a logo → []", AR.extractAssetIds({ kind: "settings", key: "brand", value: { v: 1 } }), []);
    t.eq("another setting: the generic walk", AR.extractAssetIds({ kind: "settings", key: "store", value: { banner: { id: a3 }, coverAssetId: a4 } }), [a3, a4]);
  });

  h.section("asset refs: usageByPage", (t) => {
    const uses: import("@/lib/storage/asset-refs").AssetUse[] = [
      { ownerKind: "page", ownerId: "P1", live: false, pageId: "P1", pageName: "Zeta", pageSlug: "zeta" },
      { ownerKind: "page_version", ownerId: "V1", live: true, pageId: "P1", pageName: "Zeta", pageSlug: "zeta" },
      { ownerKind: "page", ownerId: "P2", live: false, pageId: "P2", pageName: "Alpha", pageSlug: "alpha" },
      { ownerKind: "page_version", ownerId: "V9", live: false, pageId: "P3", pageName: "Old", pageSlug: "old" },
      { ownerKind: "brand", ownerId: "brand", live: true },
    ];
    t.eq("per page: draft and live merged, live first, a version that is not live left out; the logo flag", AR.usageByPage(uses), {
      pages: [
        { id: "P1", name: "Zeta", slug: "zeta", inDraft: true, live: true },
        { id: "P2", name: "Alpha", slug: "alpha", inDraft: true, live: false },
      ],
      storeLogo: true,
    });
    t.eq("nothing → no page, no logo", AR.usageByPage([]), { pages: [], storeLogo: false });
  });

  /* ---------------------------------------------------------------- */
  const { runnerSections } = await import("./selftest-runner");
  const { databaseUrl } = await import("@/lib/db/url");
  const savedLockPool = globalThis.__sgLockPool;
  let gets = 0;
  runnerSections(h, {
    R: await import("./runner"),
    S: await import("./slots"),
    D: await import("./due"),
    C: await import("./capacity"),
    SC: await import("./scope"),
    REC: await import("./recorder"),
    L,
    JOBS,
    Clock: FakeClock,
    installLockPool() {
      const p = fakeLockPool(2);
      gets = 0;
      const counted = { getConnection: () => (gets++, p.getConnection()) };
      // the process's lock pool for this database name: withNamedLock takes it from here
      globalThis.__sgLockPool = { url: databaseUrl()!, pool: counted as unknown as NonNullable<typeof globalThis.__sgLockPool>["pool"] };
      return { pool: counted, free: () => p.free(), gets: () => gets };
    },
    restoreLockPool() {
      globalThis.__sgLockPool = savedLockPool;
    },
  });

  /* ---------------------------------------------------------------- */
  const { outboxSections } = await import("./selftest-outbox");
  const SC = await import("./scope");
  outboxSections(h, {
    O: await import("./outbox"),
    RU: await import("./outbox/rules"),
    DR: await import("./outbox/drain"),
    Clock: FakeClock,
    scope: (storeId) => SC.systemScope(SC.systemCtx("qa.outbox"), storeId),
  });

  /* ---------------------------------------------------------------- */
  const { renderSections } = await import("./selftest-renders");
  renderSections(h, {
    RU: await import("./renders/rules"),
    DR: await import("./renders/drain"),
    FO: await import("./renders/fanout"),
    SC,
    Clock: FakeClock,
    scope: (storeId) => SC.systemScope(SC.systemCtx("qa.renders"), storeId),
  });

  /* ---------------------------------------------------------------- */
  const { storageJobSections } = await import("./selftest-storage");
  storageJobSections(h, { RU: await import("./storage/rules"), S: await import("./slots"), SC, W, JOBS });

  await h.run();
}

/** A fake mysql2 lock pool of `size` connections: FIFO waiters, a release hands the connection to the oldest one. */
function fakeLockPool(size: number) {
  type Conn = { query(sql: string, values: unknown[]): Promise<unknown>; release(): void; destroy(): void };
  const waiters: ((c: Conn) => void)[] = [];
  const freeList: Conn[] = [];
  const self = {
    log: [] as { sql: string; values: unknown[] }[],
    getLockAnswer: 1,
    failRelease: false,
    destroyed: 0,
    free: () => freeList.length,
    getConnection(): Promise<Conn> {
      const c = freeList.pop();
      if (c) return Promise.resolve(c);
      return new Promise<Conn>((r) => waiters.push(r));
    },
  };
  const make = (): Conn => {
    const conn: Conn = {
      async query(sql, values) {
        self.log.push({ sql, values });
        if (sql.includes("RELEASE_LOCK") && self.failRelease) throw new Error("connection lost");
        return [[{ got: sql.includes("GET_LOCK") ? self.getLockAnswer : 1 }]];
      },
      release() {
        const w = waiters.shift();
        if (w) w(conn);
        else freeList.push(conn);
      },
      destroy() {
        self.destroyed++;
        const w = waiters.shift();
        if (w) w(make());
        else freeList.push(make()); // the pool opens a new connection in its place
      },
    };
    return conn;
  };
  for (let i = 0; i < size; i++) freeList.push(make());
  return self;
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
