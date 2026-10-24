/**
 * Media per store against a real MariaDB (docs/STORE-SAAS.md §G.4, D21, D23, D69; TENANCY-MAP MED-01 … MED-06,
 * MED-14, MED-15, MED-19). Two stores, A and B, plus a pending sandbox P; every check asks "does B ever see, use,
 * change or pay for A's media". It creates its own throwaway database and drops it at the end:
 *
 *   node --import tsx src/lib/media/selftest-tenancy.ts        (MariaDB root@127.0.0.1:3306, no password;
 *                                                              MEDIA_TEST_DB_URL overrides the server URL)
 *
 *  - ids: the same bytes uploaded by A and B make two assets; a re-upload in A dedupes to A's own row only
 *  - reads: get / getByIds / list / hasDerived / tags answer another store's id like a missing one
 *  - rows: assets and media_files carry the store; stored_bytes = SUM(media_files.bytes) = the quota charge (MED-03)
 *  - cutouts: another store's sourceAssetId is dropped, the store's own is kept (MED-02)
 *  - delete: another store's id deletes nothing; the store's own delete refunds stored_bytes and resets only the
 *    store's own derived rows (MED-05)
 *  - quota: a refused charge writes nothing; a pending store charges the shared sandbox budget first and gets it
 *    back when its own cap refuses (D69)
 *  - focus: the derived analysis is written to the row's own store only (MED-15)
 *  - JSON: never the uploader or the store id (MED-06)
 *  - daily byte budget per store (MED-14)
 *
 * Until T1 merges, `hmacBytes` and the platform settings are typed stubs: this check then answers them through a
 * local adapter (an HMAC under a test key; the registry defaults), and the real functions once they land. The usage
 * counters are ALWAYS the in-memory adapter below, so the limits are the test's own whatever T1's plans say.
 */
import Module from "node:module";
import path from "node:path";
import { createHmac, randomBytes } from "node:crypto";
import sharp from "sharp";

// the modules under test are marked `import "server-only"`; outside Next that import throws
const M = Module as unknown as {
  _resolveFilename: (req: string, parent: unknown, isMain: boolean, ...rest: unknown[]) => string;
  _load: (req: string, parent: unknown, isMain: boolean) => unknown;
};
{
  const orig = M._resolveFilename;
  const stub = require.resolve("drizzle-orm"); // any resolvable module: server-only exports nothing used
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    return req === "server-only" ? stub : (orig as (...a: unknown[]) => string).call(this, req, ...rest);
  };
}

/* ---------------- adapters ---------------- */

type Fn = (...args: unknown[]) => unknown;
const notYet = (e: unknown) => e instanceof Error && e.message.startsWith("not implemented: T1");
const adapterUsed = new Set<string>();

/** in-memory store_usage / platform_usage: `${storeId}|${metric}|${period}` → value */
const usage = new Map<string, number>();
const limits = new Map<string, number>(); // `${storeId}|media_bytes` or `platform|pending_media_bytes`
const usageKey = (owner: string, m: { metric: string; period: string }) => `${owner}|${m.metric}|${m.period}`;

const OVERRIDES: Record<string, (real: Record<string, Fn>) => Record<string, Fn>> = {
  [path.join("src", "lib", "tenancy", "usage.ts")]: (real) => {
    const QuotaError = real.QuotaError as unknown as new (metric: unknown, limit: number, used: number) => Error;
    const charge = (owner: string, m: { metric: string; period: string }, delta: number, limit: number | null) => {
      const k = usageKey(owner, m);
      const v = usage.get(k) ?? 0;
      if (limit !== null && v + delta > limit) throw new QuotaError(m, limit, v);
      usage.set(k, v + delta);
      return { value: v + delta, limit };
    };
    return {
      chargeUsage: async (scope, metric, delta, opts) => {
        const s = (scope as { storeId: string }).storeId;
        const m = metric as { metric: string; period: string };
        const o = opts as { limit?: number | null } | undefined;
        return charge(s, m, delta as number, o?.limit ?? limits.get(`${s}|${m.metric}`) ?? null);
      },
      refundUsage: async (scope, metric, delta) => {
        const k = usageKey((scope as { storeId: string }).storeId, metric as { metric: string; period: string });
        usage.set(k, Math.max(0, (usage.get(k) ?? 0) - (delta as number)));
      },
      chargePlatformUsage: async (metric, period, delta, opts) => {
        const m = { metric: metric as string, period: period as string };
        const o = opts as { limit?: number | null } | undefined;
        return charge("platform", m, delta as number, limits.get(`platform|${m.metric}`) ?? o?.limit ?? null);
      },
      refundPlatformUsage: async (metric, period, delta) => {
        const k = usageKey("platform", { metric: metric as string, period: period as string });
        usage.set(k, Math.max(0, (usage.get(k) ?? 0) - (delta as number)));
      },
    };
  },
  [path.join("src", "lib", "security", "crypto.ts")]: (real) => ({
    hmacBytes: (data, purpose) => {
      try {
        return real.hmacBytes!(data, purpose);
      } catch (e) {
        if (!notYet(e)) throw e;
        adapterUsed.add("hmacBytes");
        return createHmac("sha256", `media-selftest:${purpose as string}`).update(data as Uint8Array).digest("hex");
      }
    },
  }),
  [path.join("src", "lib", "settings", "index.ts")]: (real) => ({
    getPlatformSetting: async (key, opts) => {
      try {
        return await real.getPlatformSetting!(key, opts);
      } catch (e) {
        if (!notYet(e)) throw e;
        adapterUsed.add("getPlatformSetting");
        const { platformSettingSchema } = load<typeof import("@/lib/settings/platform-registry")>("@/lib/settings/platform-registry");
        return platformSettingSchema(key as never).parse({});
      }
    },
  }),
};
{
  const origLoad = M._load;
  const proxied = new Map<string, unknown>();
  M._load = function (req: string, parent: unknown, isMain: boolean) {
    const exp = origLoad.call(this, req, parent, isMain);
    if (req === "server-only" || !/usage|crypto|settings|^\.|^@\//.test(req)) return exp;
    let file = "";
    try {
      file = path.relative(process.cwd(), M._resolveFilename(req, parent, isMain));
    } catch {
      return exp;
    }
    const make = OVERRIDES[file];
    if (!make) return exp;
    if (!proxied.has(file)) {
      const real = exp as Record<string, Fn>;
      const over = make(real);
      proxied.set(file, new Proxy(real, { get: (t, p) => (typeof p === "string" && p in over ? over[p] : Reflect.get(t, p)) }));
    }
    return proxied.get(file);
  };
}

const load = <T>(id: string): T => Module.createRequire(__filename)(id) as T;

/* ---------------- harness ---------------- */

let pass = 0;
const failures: string[] = [];
const ok = (label: string, cond: boolean, info?: unknown) => {
  if (cond) pass++;
  else failures.push(`${label}${info === undefined ? "" : `\n    ${JSON.stringify(info)}`}`);
};

const SERVER = (process.env.MEDIA_TEST_DB_URL ?? "mysql://root@127.0.0.1:3306").replace(/\/+$/, "");
const DB_NAME = `cod_test_t4_media_${randomBytes(3).toString("hex")}`;
const STORE_A = "00000000000000000000000001";
const STORE_B = "00000000000000000000000002";
const STORE_P = "00000000000000000000000003";

async function main() {
  const mysql = load<typeof import("mysql2/promise")>("mysql2/promise");
  const admin = await mysql.createConnection(`${SERVER}/`);
  await admin.query(`CREATE DATABASE \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  process.env.DATABASE_URL = `${SERVER}/${DB_NAME}`;
  let closeDb: (() => Promise<void>) | null = null;
  try {
    const { runMigrations } = load<typeof import("@/lib/db/migrate")>("@/lib/db/migrate");
    await runMigrations();
    const { db, pool } = load<typeof import("@/lib/db/client")>("@/lib/db/client");
    closeDb = async () => {
      await pool().end().catch(() => undefined);
      await globalThis.__codMediaState?.read.pool?.end().catch(() => undefined);
    };
    await run(db, pool);
  } finally {
    await closeDb?.();
    await admin.query(`DROP DATABASE IF EXISTS \`${DB_NAME}\``);
    const [left] = (await admin.query("SHOW DATABASES LIKE 'cod_test_t4_media_%'")) as unknown as [unknown[]];
    ok("cleanup: no cod_test_t4_media_* database left", left.length === 0, left);
    await admin.end();
  }
}

async function run(db: typeof import("@/lib/db/client").db, pool: typeof import("@/lib/db/client").pool) {
  const { stores } = load<typeof import("@/lib/db/schema")>("@/lib/db/schema");
  const { systemCtx, systemScope } = load<typeof import("@/lib/jobs/scope")>("@/lib/jobs/scope");
  const media = load<typeof import("@/lib/media")>("@/lib/media");
  const { spendUploadBytes } = load<typeof import("@/lib/media/daily-bytes")>("@/lib/media/daily-bytes");
  const { QuotaError } = load<typeof import("@/lib/tenancy/usage")>("@/lib/tenancy/usage");

  for (const [id, handle, status] of [
    [STORE_A, "store-a", "active"],
    [STORE_B, "store-b", "active"],
    [STORE_P, "store-p", "pending"],
  ] as const) {
    await db.insert(stores).values({ id, handle, name: handle, status, brandSeed: "0123456789abcdef" });
  }
  const ctx = systemCtx("qa.media");
  const A = systemScope(ctx, STORE_A);
  const B = systemScope(ctx, STORE_B);
  const P = systemScope(ctx, STORE_P);
  const active = { status: "active" as const, timezone: "Africa/Casablanca" };
  const pendingStore = { status: "pending" as const, timezone: "Africa/Casablanca" };
  const gauge = (storeId: string) => usage.get(`${storeId}|media_bytes|total`) ?? 0;
  const platformBudget = () => usage.get("platform|pending_media_bytes|total") ?? 0;

  /** A distinct opaque photo (seeded noise, so the encoder keeps every variant) or a cutout with transparency. */
  const image = async (seed: number, opts: { width?: number; alpha?: boolean } = {}) => {
    const w = opts.width ?? 720;
    const h = Math.round((w * 3) / 4);
    const ch = opts.alpha ? 4 : 3;
    const raw = Buffer.alloc(w * h * ch);
    let x = seed * 2654435761;
    for (let i = 0; i < raw.length; i++) {
      x = (x ^ (x << 13)) >>> 0;
      x = (x ^ (x >>> 17)) >>> 0;
      x = (x ^ (x << 5)) >>> 0;
      raw[i] = x & 0xff;
    }
    // a transparent band inside the subject: real transparency that survives the cutout trim
    if (opts.alpha) for (let i = 3; i < raw.length; i += 4) raw[i] = Math.abs(((i - 3) / 4) % w - w / 2) < w / 10 ? 0 : 255;
    return sharp(raw, { raw: { width: w, height: h, channels: ch } }).png().toBuffer();
  };
  const rows = async (q: string, params: unknown[] = []) => ((await pool().query(q, params)) as unknown as [Record<string, unknown>[]])[0];
  const code = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      return "ok";
    } catch (e) {
      return e instanceof QuotaError ? "quota" : e instanceof media.MediaError ? e.code : e instanceof Error ? e.message : String(e);
    }
  };

  /* ---------------- ids and dedup (MED-01) ---------------- */
  const photo = await image(1);
  const a1 = await media.processUpload(A, active, Buffer.from(photo), "photo.png", { createdBy: "user-a" });
  const b1 = await media.processUpload(B, active, Buffer.from(photo), "photo.png", { createdBy: "user-b" });
  ok("ids: A's first upload is new", !a1.deduped);
  ok("ids: the same bytes in B are a new asset, not 'deduped'", !b1.deduped);
  ok("ids: A's and B's ids differ for the same bytes", a1.asset.id !== b1.asset.id, [a1.asset.id, b1.asset.id]);
  ok("ids: 32 lowercase hex", /^[a-f0-9]{32}$/.test(a1.asset.id) && /^[a-f0-9]{32}$/.test(b1.asset.id));
  const a1again = await media.processUpload(A, active, Buffer.from(photo), "again.png", { createdBy: "user-a" });
  ok("dedup: A's re-upload answers A's own row", a1again.deduped && a1again.asset.id === a1.asset.id);
  ok("rows: assets carry their store", a1.asset.storeId === STORE_A && b1.asset.storeId === STORE_B);

  /* ---------------- stored bytes = files = charge (MED-03, D23) ---------------- */
  const fileRows = await rows("SELECT store_id, asset_id, bytes, storage FROM media_files WHERE asset_id IN (?, ?)", [a1.asset.id, b1.asset.id]);
  ok("rows: media_files carry the asset's store", fileRows.length > 0 && fileRows.every((r) => r.store_id === (r.asset_id === a1.asset.id ? STORE_A : STORE_B)), fileRows);
  ok("rows: media_files are on the DB backend", fileRows.every((r) => r.storage === "db"));
  const sumA = fileRows.filter((r) => r.asset_id === a1.asset.id).reduce((n, r) => n + Number(r.bytes), 0);
  ok("stored_bytes = SUM(media_files.bytes) (master + variants + AVIF)", a1.asset.storedBytes === sumA && sumA > a1.asset.bytes, { stored: a1.asset.storedBytes, sumA, master: a1.asset.bytes });
  ok("quota: A's gauge is charged stored_bytes once (the dedup charged nothing)", gauge(STORE_A) === a1.asset.storedBytes, { gauge: gauge(STORE_A) });
  ok("quota: B pays for its own copy only", gauge(STORE_B) === b1.asset.storedBytes);

  /* ---------------- reads (MED-05) ---------------- */
  ok("get: another store's id reads as missing", (await media.getAsset(B, a1.asset.id)) === null && (await media.getAsset(A, a1.asset.id))?.id === a1.asset.id);
  const byIds = await media.getAssetsByIds(B, [a1.asset.id, b1.asset.id, "nothex"]);
  ok("getByIds: only the store's own rows", byIds.length === 1 && byIds[0]!.id === b1.asset.id);
  const listB = await media.listAssets(B, {});
  ok("list: only the store's library", listB.total === 1 && listB.items.every((r) => r.storeId === STORE_B));
  ok("list: search stays in the store", (await media.listAssets(B, { q: "photo" })).items.every((r) => r.storeId === STORE_B));
  ok("tags: another store's id is not written", !(await media.setAssetTags(B, a1.asset.id, ["alt:hijack"])));
  ok("tags: the store's own id is", await media.setAssetTags(A, a1.asset.id, ["alt:Argan oil"]));
  ok("tags: A's row unchanged by B", (await media.getAsset(A, a1.asset.id))?.tags?.includes("alt:Argan oil") === true);

  /* ---------------- cutouts (MED-02) ---------------- */
  const cut1 = await media.processUpload(B, active, await image(2, { alpha: true }), "cut.png", { cutout: true, sourceAssetId: a1.asset.id });
  ok("cutout: another store's sourceAssetId is dropped", cut1.asset.sourceAssetId === null);
  const cut2 = await media.processUpload(B, active, await image(3, { alpha: true }), "cut2.png", { cutout: true, sourceAssetId: b1.asset.id });
  ok("cutout: the store's own source is kept", cut2.asset.sourceAssetId === b1.asset.id);
  ok("derived: B sees its own derived cutout", await media.hasDerivedAssets(B, b1.asset.id));
  ok("derived: A doesn't see B's", !(await media.hasDerivedAssets(A, b1.asset.id)));
  const listCut = await media.listAssets(B, { filter: "cutout", sourceAssetId: b1.asset.id });
  ok("list: derived filter stays in the store", listCut.total === 1 && listCut.items[0]!.id === cut2.asset.id);

  /* ---------------- JSON (MED-06) ---------------- */
  const j = media.assetToJson(a1.asset) as Record<string, unknown>;
  ok("json: no uploader, no store id", !("createdBy" in j) && !("storeId" in j) && !JSON.stringify(j).includes("user-a") && !JSON.stringify(j).includes(STORE_A));

  /* ---------------- focus is written to the row's own store (MED-15) ---------------- */
  await pool().query("UPDATE assets SET focus = NULL, focus_version = NULL WHERE id IN (?, ?)", [a1.asset.id, b1.asset.id]);
  const staleB = (await media.getAsset(B, b1.asset.id))!;
  // a forged row: B's id claimed to be A's asset never writes B's row (the write is by id AND store)
  await media.ensureFocus({ ...staleB, storeId: STORE_A, focus: null, focusVersion: null });
  const afterForge = (await rows("SELECT focus_version FROM assets WHERE id = ?", [b1.asset.id]))[0]!;
  ok("focus: a row claiming another store writes nothing", afterForge.focus_version === null, afterForge);
  globalThis.__codFocusMisses?.clear();
  const focus = await media.ensureFocus(staleB);
  const afterOwn = (await rows("SELECT focus_version FROM assets WHERE id = ?", [b1.asset.id]))[0]!;
  ok("focus: the row's own store gets the analysis", !!focus && Number(afterOwn.focus_version) > 0, afterOwn);
  ok("focus: A's row untouched", (await rows("SELECT focus_version FROM assets WHERE id = ?", [a1.asset.id]))[0]!.focus_version === null);

  /* ---------------- quota refusal writes nothing ---------------- */
  const beforeB = { assets: (await rows("SELECT COUNT(*) n FROM assets WHERE store_id = ?", [STORE_B]))[0]!.n, files: (await rows("SELECT COUNT(*) n FROM media_files WHERE store_id = ?", [STORE_B]))[0]!.n, gauge: gauge(STORE_B) };
  limits.set(`${STORE_B}|media_bytes`, gauge(STORE_B) + 1000);
  ok("quota: an upload over the store's limit is refused", (await code(() => media.processUpload(B, active, Buffer.from(image4), "big.png"))) === "quota");
  const afterB = { assets: (await rows("SELECT COUNT(*) n FROM assets WHERE store_id = ?", [STORE_B]))[0]!.n, files: (await rows("SELECT COUNT(*) n FROM media_files WHERE store_id = ?", [STORE_B]))[0]!.n, gauge: gauge(STORE_B) };
  ok("quota: nothing written, nothing charged", JSON.stringify(beforeB) === JSON.stringify(afterB), { beforeB, afterB });
  ok("quota: A is not limited by B's quota", (await code(() => media.processUpload(A, active, Buffer.from(image4), "big.png"))) === "ok");
  limits.delete(`${STORE_B}|media_bytes`);

  /* ---------------- pending sandbox: the shared budget first (D69) ---------------- */
  const p1 = await media.processUpload(P, pendingStore, await image(5), "p1.png");
  ok("pending: the shared budget and the store's gauge are both charged", platformBudget() === p1.asset.storedBytes && gauge(STORE_P) === p1.asset.storedBytes, { platform: platformBudget(), gauge: gauge(STORE_P) });
  ok("active stores never touch the shared budget", platformBudget() === p1.asset.storedBytes);
  limits.set("platform|pending_media_bytes", platformBudget() + 1000);
  const pBefore = { platform: platformBudget(), gauge: gauge(STORE_P) };
  const img6 = await image(6);
  ok("pending: the shared budget refuses first", (await code(() => media.processUpload(P, pendingStore, img6, "p2.png"))) === "quota");
  ok("pending: the store's gauge isn't charged when the shared budget refuses", JSON.stringify(pBefore) === JSON.stringify({ platform: platformBudget(), gauge: gauge(STORE_P) }));
  limits.delete("platform|pending_media_bytes");
  limits.set(`${STORE_P}|media_bytes`, gauge(STORE_P) + 1000);
  const img7 = await image(7);
  ok("pending: the store's own cap refuses", (await code(() => media.processUpload(P, pendingStore, img7, "p3.png"))) === "quota");
  ok("pending: the shared budget is given back when the store's cap refuses", platformBudget() === pBefore.platform, { platform: platformBudget(), before: pBefore.platform });
  limits.delete(`${STORE_P}|media_bytes`);
  ok("pending: a delete refunds both", (await media.deleteAsset(P, pendingStore, p1.asset.id)) && platformBudget() === 0 && gauge(STORE_P) === 0, { platform: platformBudget(), gauge: gauge(STORE_P) });

  /* ---------------- delete (MED-05) ---------------- */
  // a row of B pointing at A's asset (as rows from before tenancy could): A's delete must not reset it
  await pool().query("UPDATE assets SET source_asset_id = ? WHERE id = ?", [a1.asset.id, cut1.asset.id]);
  const aCut = await media.processUpload(A, active, await image(8, { alpha: true }), "a-cut.png", { cutout: true, sourceAssetId: a1.asset.id });
  ok("delete: another store's id deletes nothing", !(await media.deleteAsset(B, active, a1.asset.id)) && (await media.getAsset(A, a1.asset.id)) !== null);
  const gaugeA = gauge(STORE_A);
  ok("delete: the store's own asset", await media.deleteAsset(A, active, a1.asset.id));
  ok("delete: stored_bytes refunded", gauge(STORE_A) === gaugeA - a1.asset.storedBytes, { before: gaugeA, after: gauge(STORE_A), stored: a1.asset.storedBytes });
  ok("delete: its files are gone", Number((await rows("SELECT COUNT(*) n FROM media_files WHERE asset_id = ?", [a1.asset.id]))[0]!.n) === 0);
  ok("delete: the store's derived cutout keeps living, unlinked", (await media.getAsset(A, aCut.asset.id))?.sourceAssetId === null);
  ok("delete: another store's row naming the id is not reset", (await rows("SELECT source_asset_id s FROM assets WHERE id = ?", [cut1.asset.id]))[0]!.s === a1.asset.id);
  ok("delete: B's copy of the same bytes is untouched", (await media.getAsset(B, b1.asset.id)) !== null && Number((await rows("SELECT COUNT(*) n FROM media_files WHERE asset_id = ?", [b1.asset.id]))[0]!.n) > 0);

  /* ---------------- the deprecated store-less read (T3's publish until CCR r1.0-t4-6) ---------------- */
  ok("deprecated getByIds(ids) still resolves any store's row", (await media.getAssetsByIds([b1.asset.id])).length === 1);

  /* ---------------- daily byte budget per store (MED-14) ---------------- */
  const MB = 1024 * 1024;
  ok("daily bytes: within the budget", (await spendUploadBytes(A, 600 * MB)).ok);
  const over = await spendUploadBytes(A, 500 * MB);
  ok("daily bytes: over the store's budget is refused, with a retry time", !over.ok && over.retryAfter > 0);
  ok("daily bytes: a refused file is not counted", (await spendUploadBytes(A, 400 * MB)).ok);
  ok("daily bytes: another store has its own budget", (await spendUploadBytes(B, 1000 * MB)).ok);
  const bucket = (await rows("SELECT bucket, count FROM rate_limits WHERE bucket LIKE 's:%:media:bytes' ORDER BY bucket"));
  ok("daily bytes: one bucket per store", bucket.length === 2 && bucket[0]!.bucket === `s:${STORE_A}:media:bytes` && Number(bucket[0]!.count) === 1000 * MB, bucket);
}

let image4: Buffer;

void (async () => {
  try {
    image4 = await sharp({ create: { width: 900, height: 700, channels: 3, background: "#3a6b8c" } }).png().toBuffer();
    await main();
  } catch (e) {
    failures.push(`crashed: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
  }
  if (adapterUsed.size) console.log(`(T1 stubs answered by the local adapter: ${[...adapterUsed].join(", ")})`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  console.log(`\nmedia tenancy: ${pass} passed, ${failures.length} failed`);
  process.exit(failures.length ? 1 : 0);
})();
