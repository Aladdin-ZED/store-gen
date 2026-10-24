/**
 * test:migrate (docs/STORE-SAAS.md §J.2, §D.8, §H.4; R1.0 exit criterion 3) on XAMPP's MariaDB (root, no password,
 * 127.0.0.1:3306). Every database it makes is named cod_test_t1_* and dropped at the end (unless --keep).
 *
 *   npm run test:migrate          (tsx scripts/qa/migrate-check.ts [--keep] [--verbose])
 *
 * Each "boot" runs in a fresh child process (this file with --child), like a server start: the migrations, then the
 * §H.4 boot tasks (runBootTasks: published checksums, the store #1 conversion, the seeds) and the read-only checks.
 *
 *  (a) EMPTY database → 0000…0004: the live columns equal meta/0004_snapshot.json and schema.ts; the conversion
 *      writes the empty-install marker; booted twice → the second boot changes nothing.
 *  (b) LEGACY database: 0000-0003 only, seeded as today's single-tenant install writes it (owner, editor, agents,
 *      pages with is_home, versions, an export, orders, leads, blocklist, stats, media, v1-sealed tracking_secrets and
 *      turnstile, ai, home, pixels, the old audit rows): the pre-tenancy dry run passes; after 0004 store #1's
 *      Turnstile and CAPI secrets read through getStoreSetting BEFORE the conversion (ENGC-19) and the tenancy gate
 *      flags the missing marker; after the boot: every store_id is store #1, memberships and super_admin, the home
 *      page, first_published_at (CRIT2-5), the derived handle and the free rename (ENGC-30, consumed once), settings
 *      readable under v2, store facts moved (logo → brand, defaults → stores columns, ai → store_ai), the pixel
 *      library built for store #1, asset_refs, gauges, legacy keys gone, the marker; the dry run CLI passes; booted
 *      twice → no change.
 *  (c) a second legacy shape (the owner's /admin/setup only, with the Offers v2 markers, a store name that derives a
 *      protected handle, home only in settings.home, APP_TIMEZONE set): handle re-check, JS home path, timezone,
 *      no pixel migration; booted twice → no change.
 *  (d) interrupted then resumed, each compared with the clean run's end state: 0004 cut after N statements on the
 *      legacy fixture (two N) and on an empty database; the conversion aborted after every unit of work in turn
 *      (in one process, each run stopping at the first unit no earlier run stopped at), and once by a process that
 *      crashed between two pixel writes, resumed by the next boot.
 *  (e) the tenant tables of schema.ts equal the §D.2 / §D.3 rows of the document (ENGC-31; TABLE_LEVELS).
 *  (f) 10 parallel accepts of one invite → pending T2 (acceptInvite is T2's; reported, not counted).
 *  (g) first_published_at backfill is checked in (b); the publish → unpublish → republish half is pending T3.
 *  (h) the system seam over the converted database: forEachStore round robin, budget, a throwing store, states,
 *      `pending_sheets` ordering, a `where` whose table does not exist yet.
 *
 * Test values only (a random APP_SECRET per run, example.test addresses); nothing secret is printed. Exit code 1 when
 * a check fails.
 */
import Module from "node:module";
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import mysql from "mysql2/promise";

// the modules under test are marked `import "server-only"`; outside Next that import throws
{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = require.resolve("mysql2/promise"); // any resolvable module: server-only exports nothing used
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    return req === "server-only" ? stub : orig.call(this, req, ...rest);
  };
}

const ROOT = resolve(__dirname, "..", "..");
const DB_RE = /^cod_test_t1_[a-z0-9_]{1,40}$/;
const STORE1 = "00000000000000000000000001";
const RESULT = "@@result ";
const verbose = process.argv.includes("--verbose");
const env = process.env as Record<string, string | undefined>;

/* ------------------------------------------------------------------ */
/* The legacy fixture (0003 row shapes, as today's code writes them)   */
/* ------------------------------------------------------------------ */

const id26 = (tag: string, n: number) => `01JTEST${tag}${String(n).padStart(17, "0")}`;
const U_OWNER = id26("MB", 1);
const U_EDITOR = id26("MB", 2);
const U_AGENT = id26("MB", 3);
const U_AGENT_OFF = id26("MB", 4);
const P1 = id26("PG", 1);
const P2 = id26("PG", 2);
const P3 = id26("PG", 3);
const V1A = id26("VR", 1);
const V1B = id26("VR", 2);
const V1S = id26("VR", 3);
const V2S = id26("VR", 4);
const V3A = id26("VR", 5);
const E1 = id26("EX", 1);
const LOGO = "abababababababababababababababab";
const MISSING_ASSET = "510d3fcf85d14964f90772e18eb4b536"; // used by the argan doc, deliberately not seeded
const META_STORE = "333333333333333";
const META_P1 = "111111111111111";
const META_P3 = "222222222222222";
const TIKTOK_P3 = "CTESTPIXEL0000000001";
const FIXTURE_NOW = "2026-09-01T10:00:00.000Z";
const at = (day: number, hour = 10) => new Date(Date.UTC(2026, 8, day, hour, 0, 0));

/** The legacy store-level values exactly as setSetting stored them (the old registry's parse). */
const LEGACY = {
  store: {
    storeName: "Nour Beauté",
    legalName: "Nour Beauté SARL",
    logo: { id: LOGO, alt: "Nour Beauté" },
    phone: "+212600000001",
    whatsapp: "+212600000001",
    email: "contact@example.test",
    city: "Casablanca",
    country: "MA",
  },
  defaults: { market: "MA", locale: "fr", currency: "MAD", phoneCountry: "MA", shippingFee: 0, deliveryText: "Livraison gratuite 24–48h" },
  sheets: {
    enabled: true,
    url: "https://docs.google.com/spreadsheets/d/1TESTSHEET0000000000000000000000/edit",
    spreadsheetId: "1TESTSHEET0000000000000000000000",
    sheetId: 0,
    sheetTitle: "Commandes",
    connectedAt: "2026-09-01T09:00:00.000Z",
  },
  pixels: { metaPixelId: [META_STORE] },
  tracking_secrets: { metaCapiToken: "EAATESTTOKEN0000000001", metaTestEventCode: "TEST12345" },
  turnstile: { siteKey: "0x4AAAAAAATESTSITEKEY", secretKey: "0x4AAAAAAATESTSECRETKEY0" },
  ai: { enabled: false, tier: "full", bgRemoval: false },
  home: { pageId: P1 },
};

type Row = Record<string, unknown>;
interface Fixture {
  tables: Record<string, Row[]>;
  settings: { key: string; value: unknown; secret: boolean; at: Date }[];
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

/** The full legacy install (b). `encrypt` is today's v1 settings envelope. */
async function fullFixture(encrypt: (plain: string, purpose: string) => string): Promise<Fixture> {
  const { getFixture } = await import("@/lib/page/fixtures");
  const { collectAssetIds } = await import("@/landing/context");
  const { SETTINGS } = await import("@/lib/settings/schemas");
  const docOf = (name: "argan" | "massage" | "parfum", tracking: Row) => ({ ...getFixture(name, { now: FIXTURE_NOW }).doc, tracking });
  const d1 = docOf("argan", { metaPixelId: [META_P1] });
  const d2 = docOf("massage", {});
  const d3 = docOf("parfum", { metaPixelId: [META_P3], tiktokPixelId: [TIKTOK_P3] });
  const assetIds = [...new Set([...collectAssetIds(d1), ...collectAssetIds(d2), ...collectAssetIds(d3)])].filter((a) => a !== MISSING_ASSET);
  const user = (id: string, n: number, role: string, disabled = 0) => ({
    id, email: `user${n}@example.test`, name: `Test user ${n}`, password_hash: `$scrypt$test$${n}`, role,
    totp_secret_enc: role === "owner" ? encrypt("JBSWY3DPEHPK3PXP", `totp:${id}`) : null, totp_enabled: role === "owner" ? 1 : 0,
    recovery_codes: null, failed_logins: 0, locked_until: null, disabled, created_at: at(1, 8 + n), last_login_at: at(20),
  });
  const page = (id: string, slug: string, name: string, status: string, doc: unknown, live: string | null, isHome: number, day: number) => ({
    id, slug, name, status, locale: "ar", public_key: `pk_test${id.slice(-4)}`, draft: JSON.stringify(doc), published_version_id: live,
    is_home: isHome, created_by: U_OWNER, created_at: at(day), updated_at: at(day + 5),
  });
  const version = (id: string, pageId: string, kind: string, doc: unknown, day: number) => ({
    id, page_id: pageId, kind, label: null, doc: JSON.stringify(doc), html: kind === "publish" ? "<!doctype html><p>live</p>" : null,
    thank_you_html: null, csp: null, thank_you_csp: null, etag: kind === "publish" ? sha(id).slice(0, 16) : null, thumbnail_asset_id: null,
    starred: 0, checksum: sha(JSON.stringify(doc)), runtime_v: 2, created_by: U_OWNER, created_at: at(day),
  });
  const ids = [...assetIds, LOGO];
  const tables: Record<string, Row[]> = {
    users: [user(U_OWNER, 1, "owner"), user(U_EDITOR, 2, "editor"), user(U_AGENT, 3, "agent"), user(U_AGENT_OFF, 4, "agent", 1)],
    sessions: [{ id: sha("session-owner"), user_id: U_OWNER, mfa_passed: 1, created_at: at(20), expires_at: new Date(Date.UTC(2099, 0, 1)), last_seen_at: at(20), ip: null, ua: "test" }],
    assets: ids.map((id, i) => ({
      id, kind: "image", mime: "image/webp", width: 1440, height: 2160, bytes: 1000 + i, alpha: 0, dominant: "#cccccc", palette: null,
      variants: JSON.stringify([{ key: `${id}-960.webp`, w: 960, h: 1440, fmt: "webp", bytes: 500 + i }]), original_name: `photo-${i}.jpg`,
      source_asset_id: null, tags: null, focus: null, focus_version: null, created_by: U_OWNER, created_at: at(2),
    })),
    media_files: ids.flatMap((id, i) => [
      { key: `${id}.webp`, asset_id: id, mime: "image/webp", bytes: 1000 + i, chunks: 1, sha256: sha(`${id}.webp`), created_at: at(2) },
      { key: `${id}-960.webp`, asset_id: id, mime: "image/webp", bytes: 500 + i, chunks: 1, sha256: sha(`${id}-960.webp`), created_at: at(2) },
    ]),
    media_chunks: ids.map((id) => ({ key: `${id}.webp`, idx: 0, data: Buffer.from(`webp:${id}`) })),
    pages: [
      page(P1, "argan-serum", "Sérum argan", "published", d1, V1B, 1, 2),
      page(P2, "massage-draft", "Pistolet de massage", "draft", d2, null, 0, 3),
      page(P3, "parfum", "Eau de parfum", "published", d3, V3A, 0, 4),
    ],
    page_versions: [version(V1A, P1, "publish", d1, 2), version(V1B, P1, "publish", d1, 5), version(V1S, P1, "save", d1, 6), version(V2S, P2, "save", d2, 3), version(V3A, P3, "publish", d3, 10)],
    exports: [{ id: E1, page_id: P3, version_id: V3A, mode: "php", public_key: "pk_testexport0001", allowed_origins: JSON.stringify(["https://shop.example.test"]), file_name: "parfum.zip", bytes: 12345, created_by: U_OWNER, created_at: at(11), revoked_at: null }],
    orders: [
      {
        id: "CMD-TEST01", page_id: P1, version_id: V1B, export_id: null, source: "live", status: "new", name: "Client Test", phone: "+212600000002", phone_raw: "0600000002",
        city: "Rabat", address: "Rue 1", note: null, email: null, product_name: "Sérum argan", items: JSON.stringify([{ itemId: "main", qty: 1, unit: 199, total: 199 }]), qty: 1,
        subtotal: 199, shipping: 0, total: 199, currency: "MAD", locale: "ar", utm: null, ref: null, ip_hash: sha("ip-1"), ua: "test", event_id: "ev-1",
        idem: "00000000-0000-4000-8000-000000000001", risk_score: 0, flags: null, upsell_token_hash: null, sheet_status: "pending", sheet_attempts: 0, sheet_error: null,
        created_at: at(12), updated_at: at(12),
      },
      {
        id: "CMD-TEST02", page_id: P3, version_id: V3A, export_id: E1, source: "php", status: "confirmed", name: "Client Deux", phone: "+212600000003", phone_raw: null,
        city: "Fès", address: null, note: null, email: null, product_name: "Eau de parfum", items: JSON.stringify([{ itemId: "main", qty: 2, unit: 150, total: 300 }]), qty: 2,
        subtotal: 300, shipping: 20, total: 320, currency: "MAD", locale: "ar", utm: null, ref: null, ip_hash: null, ua: null, event_id: null,
        idem: "00000000-0000-4000-8000-000000000002", risk_score: 10, flags: null, upsell_token_hash: null, sheet_status: "synced", sheet_attempts: 1, sheet_error: null,
        created_at: at(13), updated_at: at(13),
      },
    ],
    leads: [{ id: id26("QD", 1), page_id: P1, idem: "00000000-0000-4000-8000-000000000011", phone: "+212600000004", name: null, city: null, bundle_id: null, selection: null, utm: null, converted_order_id: null, created_at: at(14) }],
    blocklist: [{ id: id26("BK", 1), kind: "phone", value: "+212600000009", reason: "test", created_by: U_OWNER, created_at: at(15) }],
    stats_daily: [{ page_id: P1, day: "2026-09-12", views: 10, uniques: 8, form_starts: 3, orders: 1, revenue: 199 }],
    stats_visitors: [{ page_id: P1, day: "2026-09-12", vid_hash: sha("visitor").slice(0, 32) }],
    audit_log: [
      { action: "auth.setup.owner_created", user_id: U_OWNER, target: U_OWNER, meta: null, ip: null, created_at: at(1, 9) },
      { action: "auth.login.success", user_id: U_OWNER, target: null, meta: null, ip: null, created_at: at(20) },
      { action: "settings.updated", user_id: U_OWNER, target: "store", meta: JSON.stringify({ fields: ["storeName"] }), ip: null, created_at: at(1, 12) },
      { action: "page.published", user_id: U_OWNER, target: P1, meta: null, ip: null, created_at: at(5) },
    ],
  };
  const settings = (["store", "defaults", "sheets", "pixels", "tracking_secrets", "turnstile", "ai", "home"] as const).map((key, i) => ({
    key,
    value: SETTINGS[key].schema.parse(LEGACY[key]) as unknown,
    secret: SETTINGS[key].secret,
    at: at(1, 12 + i),
  }));
  return { tables, settings };
}

/** The second legacy shape (c): the owner's /admin/setup, the Offers v2 boot markers, one page home in settings.home only. */
async function setupFixture(): Promise<Fixture> {
  const { getFixture } = await import("@/lib/page/fixtures");
  const doc = getFixture("massage", { now: FIXTURE_NOW }).doc;
  return {
    tables: {
      users: [{ id: U_OWNER, email: "owner@example.test", name: "Test owner", password_hash: "$scrypt$test$1", role: "owner", totp_secret_enc: null, totp_enabled: 0, recovery_codes: null, failed_logins: 0, locked_until: null, disabled: 0, created_at: at(1), last_login_at: at(1) }],
      pages: [{ id: P2, slug: "massage", name: "Massage", status: "draft", locale: "fr", public_key: "pk_testsetup0001", draft: JSON.stringify(doc), published_version_id: null, is_home: 0, created_by: U_OWNER, created_at: at(2), updated_at: at(2) }],
      audit_log: [{ action: "auth.setup.owner_created", user_id: U_OWNER, target: U_OWNER, meta: null, ip: null, created_at: at(1) }],
    },
    settings: [
      { key: "doc_schema", value: 2, secret: false, at: at(1) },
      { key: "pixel_library", value: { v: 1, pixels: [] }, secret: false, at: at(1) },
      { key: "store", value: { storeName: "Meta Deals", country: "MA", socials: {} }, secret: false, at: at(1) },
      { key: "home", value: { pageId: P2 }, secret: false, at: at(2) },
    ],
  };
}

async function insertRows(conn: mysql.Connection, table: string, rows: Row[]): Promise<void> {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]!);
  await conn.query(`INSERT INTO \`${table}\` (${cols.map((c) => `\`${c}\``).join(", ")}) VALUES ?`, [rows.map((r) => cols.map((c) => r[c]))]);
}

async function seed(dbName: string, fixture: Fixture, encrypt: (plain: string, purpose: string) => string): Promise<void> {
  const conn = await connect(dbName);
  try {
    for (const [table, rows] of Object.entries(fixture.tables)) await insertRows(conn, table, rows);
    for (const s of fixture.settings) {
      const stored = s.secret ? encrypt(JSON.stringify(s.value), `settings:${s.key}`) : s.value;
      await conn.query("INSERT INTO settings (`key`, value, encrypted, updated_at) VALUES (?, ?, ?, ?)", [s.key, JSON.stringify(stored), s.secret ? 1 : 0, s.at]);
    }
  } finally {
    await conn.end();
  }
}

/* ------------------------------------------------------------------ */
/* Child tasks (one process = one boot)                                */
/* ------------------------------------------------------------------ */

class Abort extends Error {}

async function childMain(task: string): Promise<unknown> {
  const { runMigrations } = await import("@/lib/db/migrate");
  const { systemCtx, systemScope } = await import("@/lib/jobs/scope");
  const scope = () => systemScope(systemCtx("qa.migrate"), STORE1);
  const readConn = () => mysql.createConnection({ uri: env.DATABASE_URL!, charset: "utf8mb4_unicode_ci", timezone: "Z" });

  if (task === "boot") {
    const migrate = await runMigrations();
    const { runBootChecks, runBootTasks } = await import("@/lib/db/boot-tasks");
    const boot = await runBootTasks();
    if (boot.ran) await runBootChecks(); // the [upgrade-check] / [tenancy-check] log lines, as instrumentation does
    const { runTenancyCheck, runUpgradeCheck, upgradeCheckOk } = await import("@/lib/db/upgrade-check");
    const conn = await readConn();
    try {
      const tenancy = await runTenancyCheck(conn, { requireEnvelopes: true });
      const offersOk = upgradeCheckOk(await runUpgradeCheck(conn));
      return { migrate, boot, tenancy, offersOk };
    } finally {
      await conn.end();
    }
  }

  if (task === "migrate-only") {
    const migrate = await runMigrations();
    const { getStoreSetting } = await import("@/lib/settings");
    const turnstile = await getStoreSetting(scope(), "turnstile");
    const secrets = await getStoreSetting(scope(), "tracking_secrets");
    const store = await getStoreSetting(scope(), "store");
    const { runTenancyCheck } = await import("@/lib/db/upgrade-check");
    const conn = await readConn();
    try {
      const tenancy = await runTenancyCheck(conn);
      return {
        migrate,
        turnstileReadable: turnstile.siteKey === LEGACY.turnstile.siteKey && turnstile.secretKey === LEGACY.turnstile.secretKey,
        secretsReadable: secrets.metaCapiToken === LEGACY.tracking_secrets.metaCapiToken,
        storeReadable: store.legalName === LEGACY.store.legalName,
        tenancy,
      };
    } finally {
      await conn.end();
    }
  }

  if (task === "convert-abort") {
    // --labels a,b: one run per label, aborted at that unit (a crash at a chosen point).
    // --progressive: every run aborts at the first unit it has not been aborted at before, so each gap between two
    // consecutive writes is hit once whatever order the code runs them in; it stops after the abort at "delete", the
    // last unit before the marker, and leaves the completing run to the next boot (a fresh process).
    await runMigrations();
    const { convertLegacyStore } = await import("@/lib/tenancy/convert.server");
    const once = async (stopAt: (unit: string) => boolean) => {
      const seen: string[] = [];
      try {
        await convertLegacyStore({
          checkpoint: (unit) => {
            seen.push(unit);
            if (stopAt(unit)) throw new Abort(unit);
          },
        });
        return { label: null as string | null, aborted: false, seen };
      } catch (err) {
        if (!(err instanceof Abort)) throw err;
        return { label: err.message, aborted: true, seen };
      }
    };
    const hit: { label: string | null; aborted: boolean; seen: string[] }[] = [];
    if (process.argv.includes("--progressive")) {
      const done = new Set<string>();
      for (let i = 0; i < 80; i++) {
        const r = await once((unit) => !done.has(unit));
        hit.push(r);
        if (!r.aborted || r.label === "delete") break;
        done.add(r.label!);
      }
    } else {
      for (const label of (argOf("labels") ?? "").split(",").filter(Boolean)) hit.push(await once((unit) => unit === label));
    }
    return { hit };
  }

  if (task === "read") {
    const { getStoreSettings, getPlatformSetting } = await import("@/lib/settings");
    const v = await getStoreSettings(scope(), ["turnstile", "tracking_secrets", "store", "defaults", "store_ai", "brand", "pixel_library", "sheets"]);
    // ENGC-30: store #1 was created by S1 moments ago, so only the one free rename lets it rename now; the next is too soon
    const { getStoreById } = await import("@/lib/tenancy/public");
    const { mintScope } = await import("@/lib/tenancy/seam");
    const { HandleError, renameHandle } = await import("@/lib/tenancy/handles");
    const ctxFor = async () => {
      const store = (await getStoreById(STORE1))!;
      return {
        user: { id: U_OWNER },
        store,
        membership: { role: "owner", status: "active" },
        scope: mintScope("member", STORE1),
        actor: { kind: "user", userId: U_OWNER, impersonatorId: null, ip: null },
        impersonation: null,
        stepUpUntil: null,
        can: () => true,
      } as unknown as Parameters<typeof renameHandle>[0];
    };
    const before = await getPlatformSetting("tenancy_v1", { fresh: true });
    let first = "ok";
    try {
      await renameHandle(await ctxFor(), "nour-beaute");
    } catch (err) {
      first = err instanceof HandleError ? err.code : String(err);
    }
    let second = "ok";
    try {
      await renameHandle(await ctxFor(), "nour-shop");
    } catch (err) {
      second = err instanceof HandleError ? err.code : String(err);
    }
    const after = await getPlatformSetting("tenancy_v1", { fresh: true });
    return {
      turnstile: v.turnstile.siteKey === LEGACY.turnstile.siteKey && v.turnstile.secretKey === LEGACY.turnstile.secretKey,
      secrets: v.tracking_secrets.metaCapiToken === LEGACY.tracking_secrets.metaCapiToken && Object.keys(v.tracking_secrets.metaTokens).length === 3,
      store: v.store.legalName === LEGACY.store.legalName && v.store.phone === LEGACY.store.phone,
      defaults: v.defaults.phoneCountry === "MA" && v.defaults.shippingFee === 0 && v.defaults.deliveryText === LEGACY.defaults.deliveryText,
      storeAi: v.store_ai.mode === "auto" && v.store_ai.localEnabled === false && v.store_ai.localTierCeiling === "full" && v.store_ai.bgRemoval === false,
      brand: v.brand.logo.primary === LOGO,
      library: v.pixel_library.pixels.map((p) => `${p.platform}:${p.id}`),
      sheets: v.sheets.enabled === true,
      grantBefore: before?.freeRename ?? null,
      first,
      second,
      grantAfter: after?.freeRename ?? null,
    };
  }

  if (task === "jobs") {
    const { forEachStore, resetMemoryCursors } = await import("@/lib/jobs/scope");
    const ctx = systemCtx("qa.jobs");
    const run = async (job: string, states: string[], opts: { budgetMs?: number; where?: "pending_sheets" | "pending_outbox"; sleepMs?: number; throwFor?: string } = {}) => {
      const seen: string[] = [];
      const res = await forEachStore(ctx, { job, states: states as never, budgetMs: opts.budgetMs ?? 20_000, where: opts.where }, async (s, store) => {
        if (s.storeId !== store.id || s.kind !== "system") throw new Error("scope mismatch");
        seen.push(store.id);
        if (opts.sleepMs) await new Promise((r) => setTimeout(r, opts.sleepMs));
        if (opts.throwFor === store.id) throw new Error("boom");
      });
      return { seen, ...res };
    };
    resetMemoryCursors();
    const all = await run("qa.all", ["active"]);
    const again = await run("qa.all", ["active"]);
    const thrown = await run("qa.throw", ["active"], { throwFor: argOf("throw-for") ?? "" });
    const budget1 = await run("qa.budget", ["active"], { budgetMs: 300, sleepMs: 200 });
    const budget2 = await run("qa.budget", ["active"], { budgetMs: 300, sleepMs: 200 });
    const other = await run("qa.states", ["suspended", "pending"]);
    const sheets = await run("qa.sheets", ["active"], { where: "pending_sheets" });
    const outbox = await run("qa.outbox", ["active"], { where: "pending_outbox" });
    let tickRefused = false;
    try {
      await forEachStore(ctx, { job: "tick", states: ["active"], budgetMs: 10 }, async () => undefined);
    } catch {
      tickRefused = true;
    }
    let userRefused = false;
    try {
      systemScope({ job: "x", actor: { kind: "user", userId: null, impersonatorId: null, ip: null } }, STORE1);
    } catch {
      userRefused = true;
    }
    return { all, again, thrown, budget1, budget2, other, sheets, outbox, tickRefused, userRefused };
  }

  throw new Error(`unknown child task "${task}"`);
}

function argOf(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/* ------------------------------------------------------------------ */
/* Parent: databases, children, snapshots                              */
/* ------------------------------------------------------------------ */

let pass = 0;
const failures: string[] = [];
const pending: string[] = [];
function check(label: string, ok: boolean, info?: unknown): void {
  if (ok) pass++;
  else failures.push(`${label}${info === undefined ? "" : `\n      ${JSON.stringify(info).slice(0, 600)}`}`);
  if (verbose || !ok) console.log(`${ok ? "  ✓" : "  ✗"} ${label}`);
}
const same = (label: string, got: unknown, want: unknown) => check(label, JSON.stringify(got) === JSON.stringify(want), { got, want });

const created = new Set<string>();
const rootConn = () => mysql.createConnection({ host: "127.0.0.1", port: 3306, user: "root", charset: "utf8mb4_unicode_ci", timezone: "Z" });
const urlOf = (dbName: string) => `mysql://root@127.0.0.1:3306/${dbName}`;
const connect = (dbName: string) => mysql.createConnection({ uri: urlOf(dbName), charset: "utf8mb4_unicode_ci", timezone: "Z", supportBigNumbers: true });

async function createDb(name: string): Promise<void> {
  if (!DB_RE.test(name)) throw new Error(`refusing database name ${name}`);
  const conn = await rootConn();
  try {
    await conn.query(`DROP DATABASE IF EXISTS \`${name}\``);
    await conn.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    created.add(name);
  } finally {
    await conn.end();
  }
}

async function dropAll(): Promise<string[]> {
  const conn = await rootConn();
  try {
    for (const name of created) if (DB_RE.test(name)) await conn.query(`DROP DATABASE IF EXISTS \`${name}\``);
    const [rows] = (await conn.query("SHOW DATABASES LIKE 'cod\\_test\\_t1\\_%'")) as unknown as [Row[]];
    return rows.map((r) => String(Object.values(r)[0]));
  } finally {
    await conn.end();
  }
}

/** One child boot; its log is printed only on failure (or with --verbose). */
function child<T = Record<string, unknown>>(task: string, dbName: string, extraEnv: Record<string, string> = {}, args: string[] = []): Promise<T> {
  return new Promise((resolvePromise, reject) => {
    const proc = spawn(process.execPath, ["--import", "tsx", __filename, "--child", task, ...args], {
      cwd: ROOT,
      env: { ...process.env, DATABASE_URL: urlOf(dbName), ...extraEnv },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    proc.stdout.on("data", (d: Buffer) => (out += d.toString("utf8")));
    proc.stderr.on("data", (d: Buffer) => (out += d.toString("utf8")));
    const timer = setTimeout(() => proc.kill(), 240_000);
    proc.on("close", (code) => {
      clearTimeout(timer);
      const line = out.split(/\r?\n/).find((l) => l.startsWith(RESULT));
      if (verbose) console.log(out.split(/\r?\n/).filter((l) => l && !l.startsWith(RESULT)).map((l) => `      | ${l}`).join("\n"));
      if (code === 0 && line) resolvePromise(JSON.parse(line.slice(RESULT.length)) as T);
      else reject(new Error(`child ${task} on ${dbName} exited ${code}:\n${out.split(/\r?\n/).slice(-40).join("\n")}`));
    });
  });
}

/** A CLI run of scripts/qa/upgrade-dry-run.ts (exit code and output). */
function dryRunCli(dbName: string): Promise<{ code: number | null; out: string }> {
  return new Promise((resolvePromise) => {
    const proc = spawn(process.execPath, ["--import", "tsx", join(ROOT, "scripts", "qa", "upgrade-dry-run.ts"), "--db", urlOf(dbName), "--require-envelopes"], { cwd: ROOT, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    proc.stdout.on("data", (d: Buffer) => (out += d.toString("utf8")));
    proc.stderr.on("data", (d: Buffer) => (out += d.toString("utf8")));
    proc.on("close", (code) => resolvePromise({ code, out }));
  });
}

const ISO_RE = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z/g;
/** columns that are random by design: compared only within one database */
const RANDOM_COLUMNS: Record<string, string[]> = { stores: ["brand_seed"], protected_brands: ["id"] };

interface Snapshot {
  tables: Record<string, string[]>;
  audit: string[];
}

/**
 * Every table's rows as sorted JSON lines. `normalize`: instants at or after `since` (this run) become "<run>",
 * envelopes are replaced by their plaintext (random IVs), random columns are dropped; for comparing two databases.
 * Raw: everything as stored; for comparing one database before and after a second boot.
 */
async function snapshot(dbName: string, normalize: boolean, since: number): Promise<Snapshot> {
  const { decrypt, open } = await import("@/lib/security/crypto");
  const unseal = (table: string, row: Row): string => {
    const env = JSON.parse(String(row.value)) as string;
    const purpose = `settings:${String(row.key)}`;
    if (env.startsWith("v1.")) return decrypt(env, purpose);
    return table === "store_settings" ? open(env, { store: String(row.store_id) }, purpose) : open(env, "platform", purpose);
  };
  const norm = (s: string) => (normalize ? s.replace(ISO_RE, (m) => (Date.parse(m) >= since ? "<run>" : m)) : s);
  const conn = await connect(dbName);
  try {
    const [tables] = (await conn.query("SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY 1")) as unknown as [Row[]];
    const out: Snapshot = { tables: {}, audit: [] };
    for (const t of tables.map((r) => String(Object.values(r)[0]))) {
      const [rows] = (await conn.query(`SELECT * FROM \`${t}\``)) as unknown as [Row[]];
      const lines = rows.map((row) => {
        const o: Row = {};
        for (const k of Object.keys(row).sort()) {
          if (normalize && RANDOM_COLUMNS[t]?.includes(k)) continue;
          if (t === "audit_log" && (k === "id" || k === "created_at")) continue;
          const v = row[k];
          if (v instanceof Date) o[k] = normalize && v.getTime() >= since ? "<run>" : v.toISOString();
          else if (Buffer.isBuffer(v)) o[k] = `sha256:${sha(v.toString("base64"))}`;
          else if (normalize && k === "value" && (t === "store_settings" || t === "settings") && Number(row.encrypted)) o[k] = `plain:${norm(unseal(t, row))}`;
          else if (typeof v === "string") o[k] = norm(v);
          else o[k] = v;
        }
        return JSON.stringify(o);
      });
      if (t === "audit_log") out.audit = lines.sort();
      else out.tables[t] = lines.sort();
    }
    return out;
  } finally {
    await conn.end();
  }
}

function diffSnapshots(a: Snapshot, b: Snapshot): string[] {
  const diffs: string[] = [];
  const names = new Set([...Object.keys(a.tables), ...Object.keys(b.tables)]);
  for (const t of names) {
    const x = a.tables[t] ?? [];
    const y = b.tables[t] ?? [];
    if (JSON.stringify(x) === JSON.stringify(y)) continue;
    const onlyA = x.filter((l) => !y.includes(l)).slice(0, 2);
    const onlyB = y.filter((l) => !x.includes(l)).slice(0, 2);
    diffs.push(`${t}: ${x.length} vs ${y.length} rows; only first ${JSON.stringify(onlyA).slice(0, 400)}; only second ${JSON.stringify(onlyB).slice(0, 400)}`);
  }
  return diffs;
}

async function query(dbName: string, q: string, params: unknown[] = []): Promise<Row[]> {
  const conn = await connect(dbName);
  try {
    const [rows] = (await conn.query(q, params)) as unknown as [Row[]];
    return rows;
  } finally {
    await conn.end();
  }
}

/** drizzle/ with only 0000-0003 in its journal: the schema of today's single-tenant install. */
function legacyMigrationsFolder(): string {
  const dir = mkdtempSync(join(tmpdir(), "sg-t1-mig-"));
  mkdirSync(join(dir, "meta"));
  const journal = JSON.parse(readFileSync(join(ROOT, "drizzle", "meta", "_journal.json"), "utf8")) as { entries: { idx: number; tag: string }[] };
  journal.entries = journal.entries.filter((e) => e.idx <= 3);
  for (const e of journal.entries) copyFileSync(join(ROOT, "drizzle", `${e.tag}.sql`), join(dir, `${e.tag}.sql`));
  writeFileSync(join(dir, "meta", "_journal.json"), JSON.stringify(journal, null, 2));
  return dir;
}

/** The first `n` statements of 0004 on one connection, then the connection dies (a crash mid-migration). */
async function partial0004(dbName: string, n: number): Promise<number> {
  const { readMigrationFiles } = await import("drizzle-orm/migrator");
  const files = readMigrationFiles({ migrationsFolder: join(ROOT, "drizzle") });
  const statements = files[4]!.sql.filter((s) => s.trim());
  const conn = await connect(dbName);
  try {
    for (const s of statements.slice(0, n)) await conn.query(s);
  } finally {
    conn.destroy();
  }
  return statements.length;
}

async function legacyDb(name: string, fixture: Fixture, encrypt: (plain: string, purpose: string) => string, folder: string): Promise<void> {
  const { runMigrations } = await import("@/lib/db/migrate");
  await createDb(name);
  const res = await runMigrations({ migrationsFolder: folder, databaseUrl: urlOf(name) });
  check(`${name}: 0000-0003 applied (${res.applied})`, res.applied === 4);
  await seed(name, fixture, encrypt);
}

interface BootResult {
  migrate: { status: string; applied: number; total: number };
  boot: { ran: boolean; steps: { name: string; ok: boolean; detail: string | null }[] };
  tenancy: { mode: string; problems: string[]; info: string[] };
  offersOk: boolean;
}

function bootOk(label: string, r: BootResult, applied: number): void {
  check(`${label}: migrations ${applied ? `applied ${applied}` : "up to date"}`, r.migrate.applied === applied && r.migrate.total === 5, r.migrate);
  // §H.4 step 5 in order; "legal templates" joined with CCR r1.0-t1-3 item 1 (a no-op while LEGAL_SEED_VERSION = 0)
  const names = ["published checksums", "store #1 conversion", "protected brands", "legal templates", "flags"];
  check(`${label}: every boot task ran and succeeded`, r.boot.ran && r.boot.steps.map((s) => s.name).join("|") === names.join("|") && r.boot.steps.every((s) => s.ok), r.boot.steps);
  check(`${label}: tenancy gate 0 problems`, r.tenancy.mode === "tenancy" && r.tenancy.problems.length === 0, r.tenancy.problems);
  check(`${label}: offers upgrade gate passes`, r.offersOk);
}

/* ------------------------------------------------------------------ */
/* The checks                                                          */
/* ------------------------------------------------------------------ */

async function schemaMatchesSnapshot(dbName: string): Promise<void> {
  const snap = JSON.parse(readFileSync(join(ROOT, "drizzle", "meta", "0004_snapshot.json"), "utf8")) as { tables: Record<string, { columns: Record<string, { name: string; type: string; notNull: boolean }> }> };
  const live = await query(dbName, "SELECT table_name AS t, column_name AS c, column_type AS ty, is_nullable AS n FROM information_schema.columns WHERE table_schema = DATABASE()");
  const norm = (t: string) => t.toLowerCase().replace(/^boolean$/, "tinyint").replace(/^(tinyint|smallint|mediumint|int|bigint)\(\d+\)/, "$1");
  const liveCols = new Map<string, string>();
  for (const r of live) if (r.t !== "__drizzle_migrations") liveCols.set(`${String(r.t)}.${String(r.c)}`, `${norm(String(r.ty))} ${r.n === "YES" ? "null" : "not null"}`);
  const snapCols = new Map<string, string>();
  for (const [t, def] of Object.entries(snap.tables)) for (const c of Object.values(def.columns)) snapCols.set(`${t}.${c.name}`, `${norm(c.type)} ${c.notNull ? "not null" : "null"}`);
  const missing = [...snapCols.keys()].filter((k) => !liveCols.has(k));
  const extra = [...liveCols.keys()].filter((k) => !snapCols.has(k));
  const typed = [...snapCols].filter(([k, v]) => liveCols.has(k) && liveCols.get(k) !== v).map(([k, v]) => `${k}: snapshot ${v}, live ${liveCols.get(k)}`);
  check(`(a) live columns = 0004_snapshot.json (${snapCols.size} columns)`, !missing.length && !extra.length && !typed.length, { missing, extra, typed: typed.slice(0, 10) });

  const { is } = await import("drizzle-orm");
  const { MySqlTable, getTableConfig } = await import("drizzle-orm/mysql-core");
  const schema = await import("@/lib/db/schema");
  const fromSchema = new Set<string>();
  for (const value of Object.values(schema)) if (is(value, MySqlTable)) for (const c of getTableConfig(value).columns) fromSchema.add(`${getTableConfig(value).name}.${c.name}`);
  const notInSchema = [...snapCols.keys()].filter((k) => !fromSchema.has(k));
  const notInSnap = [...fromSchema].filter((k) => !snapCols.has(k));
  check("(a) schema.ts columns = 0004_snapshot.json", !notInSchema.length && !notInSnap.length, { notInSchema, notInSnap });
}

/** (e) the §D.3 rows (0004) and the §D.2 tenant tables of the document against TABLE_LEVELS and schema.ts. */
async function tenantSetMatchesDocument(): Promise<void> {
  const { TABLE_LEVELS, tenantSetProblems } = await import("@/lib/db/upgrade-check");
  same("(e) schema.ts tenant set = TABLE_LEVELS", tenantSetProblems(), []);
  const doc = readFileSync(join(ROOT, "docs", "STORE-SAAS.md"), "utf8");
  const section = (from: string, to: string) => doc.slice(doc.indexOf(from), doc.indexOf(to, doc.indexOf(from)));
  const levelOf = (cell: string) => {
    const c = cell.replace(/\*\*/g, "").trim();
    if (c.startsWith("P* (root)")) return "root";
    if (c.startsWith("P (opt. store)")) return "P-opt";
    if (c.startsWith("P*")) return "P*";
    if (c.startsWith("T")) return "T";
    if (c.startsWith("P")) return "P";
    return `? ${c}`;
  };
  const docLevels: Record<string, string> = {};
  for (const line of section("### D.3 Table registry", "### D.4").split("\n")) {
    const cells = line.split("|").map((c) => c.trim());
    if (cells.length < 6 || !/\b0004\b/.test(cells[1] ?? "")) continue;
    for (const m of (cells[2] ?? "").matchAll(/`([a-z_]+)`/g)) docLevels[m[1]!] = levelOf(cells[3] ?? "");
  }
  for (const line of section("### D.2 Changes to existing tables", "### D.3").split("\n")) {
    const cells = line.split("|").map((c) => c.trim());
    if (cells.length < 4 || cells[2] !== "0004" || !/\+ `store_id/.test(cells[3] ?? "")) continue;
    const table = /`([a-z_]+)`/.exec(cells[1] ?? "")?.[1];
    if (table) docLevels[table] = /store_id varchar\(26\) NULL/.test(cells[3] ?? "") ? "P-opt" : "T";
  }
  // the document's level where it differs from the schema (empty since CCR r1.0-t1-3 item 2 fixed §D.3)
  const DRIFT: Record<string, string> = {};
  const mismatches: string[] = [];
  for (const [table, level] of Object.entries(docLevels)) {
    const code = TABLE_LEVELS[table];
    if (!code) mismatches.push(`${table}: in the document (${level}), not in TABLE_LEVELS`);
    else if (code !== level && DRIFT[table] !== level) mismatches.push(`${table}: document ${level}, code ${code}`);
  }
  const zeroThree = new Set(["users", "sessions", "settings", "rate_limits", "media_chunks", "stats_visitors"]);
  for (const table of Object.keys(TABLE_LEVELS)) if (!docLevels[table] && !zeroThree.has(table)) mismatches.push(`${table}: in TABLE_LEVELS, not a 0004 row of §D.2 / §D.3`);
  check(`(e) TABLE_LEVELS = the §D.2 / §D.3 rows (${Object.keys(docLevels).length} tables, drift recorded: ${Object.keys(DRIFT).join(", ") || "none"})`, !mismatches.length, mismatches);
}

async function legacyAssertions(dbName: string, fixture: Fixture): Promise<void> {
  const L = "(b)";
  // every store_id is store #1
  for (const t of ["pages", "page_versions", "assets", "media_files", "orders", "leads", "blocklist", "exports", "stats_daily"]) {
    const [r] = await query(dbName, `SELECT COUNT(*) AS n, SUM(store_id = ?) AS s1 FROM \`${t}\``, [STORE1]);
    check(`${L} ${t}: ${Number(r!.n)} row(s), all store #1`, Number(r!.n) === (fixture.tables[t]?.length ?? 0) && Number(r!.s1) === Number(r!.n), r);
  }
  const audit = await query(dbName, "SELECT action, store_id FROM audit_log WHERE created_at < '2026-10-01' ORDER BY id");
  check(`${L} legacy audit rows: auth.* platform-level, the rest store #1`, audit.length === 4 && audit.every((a) => (String(a.action).startsWith("auth.") ? a.store_id === null : a.store_id === STORE1)), audit);
  const [store] = await query(dbName, "SELECT handle, name, mode, status, plan_id, market, currency, timezone, default_locale, home_page_id FROM stores WHERE id = ?", [STORE1]);
  same(`${L} store #1 row`, store, { handle: "nour-beaut", name: "Nour Beauté", mode: "landing", status: "active", plan_id: "internal", market: "MA", currency: "MAD", timezone: "Africa/Casablanca", default_locale: "fr", home_page_id: P1 });
  same(
    `${L} memberships from users.role (disabled → suspended)`,
    await query(dbName, "SELECT user_id, role, status FROM store_members WHERE store_id = ? ORDER BY user_id", [STORE1]),
    [
      { user_id: U_OWNER, role: "owner", status: "active" },
      { user_id: U_EDITOR, role: "editor", status: "active" },
      { user_id: U_AGENT, role: "agent", status: "active" },
      { user_id: U_AGENT_OFF, role: "agent", status: "suspended" },
    ],
  );
  same(`${L} the legacy owner is super_admin`, await query(dbName, "SELECT id FROM users WHERE platform_role = 'super_admin'"), [{ id: U_OWNER }]);
  const fp = await query(dbName, "SELECT id, first_published_at AS f FROM pages ORDER BY id");
  same(`${L} (g) first_published_at = the oldest publish version; never published = NULL`, fp.map((r) => [r.id, r.f instanceof Date ? r.f.toISOString() : r.f]), [
    [P1, at(2).toISOString()],
    [P2, null],
    [P3, at(10).toISOString()],
  ]);
  const ss = await query(dbName, "SELECT `key`, encrypted, purpose_v, value FROM store_settings WHERE store_id = ? ORDER BY `key`", [STORE1]);
  same(
    `${L} store settings of store #1 (all purpose_v 2, secrets sealed)`,
    ss.map((r) => [r.key, Number(r.encrypted), Number(r.purpose_v)]),
    [["brand", 0, 2], ["defaults", 0, 2], ["pixel_health", 0, 2], ["pixel_library", 0, 2], ["sheets", 0, 2], ["store", 0, 2], ["store_ai", 0, 2], ["tracking_secrets", 1, 2], ["turnstile", 1, 2]],
  );
  const val = (k: string) => JSON.parse(String(ss.find((r) => r.key === k)?.value ?? "null")) as Row;
  check(`${L} store: storeName and logo moved out`, !("storeName" in val("store")) && !("logo" in val("store")) && val("store").legalName === LEGACY.store.legalName, val("store"));
  same(`${L} defaults: market / currency / locale moved to stores`, Object.keys(val("defaults")).sort(), ["deliveryText", "phoneCountry", "shippingFee"]);
  same(`${L} brand.logo.primary = the legacy logo`, val("brand"), { v: 1, logo: { primary: LOGO } });
  same(`${L} store_ai from settings.ai (AI R16)`, val("store_ai"), { mode: "auto", localEnabled: false, tier: "full", bgRemoval: false });
  const lib = val("pixel_library") as { pixels: { platform: string; id: string; label: string; tests: unknown[] }[] };
  same(`${L} pixel library: the store pixel first, then by use`, lib.pixels.map((p) => [p.platform, p.id, p.label]), [
    ["meta", META_STORE, "Pixel principal"],
    ["meta", META_P1, "Sérum argan · ••••1111"],
    ["meta", META_P3, "Eau de parfum · ••••2222"],
    ["tiktok", TIKTOK_P3, "Eau de parfum · ••••0001"],
  ]);
  same(`${L} pixel health: the copied tokens unverified`, Object.entries(val("pixel_health")).map(([k, v]) => [k, (v as Row).state]).sort(), [
    [`meta:${META_P1}`, "unverified"],
    [`meta:${META_P3}`, "unverified"],
    [`meta:${META_STORE}`, "unverified"],
  ]);
  same(
    `${L} legacy settings rows gone, platform markers kept`,
    (await query(dbName, "SELECT `key` FROM settings ORDER BY `key`")).map((r) => r.key),
    ["doc_schema", "tenancy_v1"],
  );
  const [marker] = await query(dbName, "SELECT value FROM settings WHERE `key` = 'tenancy_v1'");
  const m = JSON.parse(String(marker?.value ?? "null")) as Row | null;
  check(`${L} marker tenancy_v1 { v: 1, store1: true, freeRename: true }`, m?.v === 1 && m.store1 === true && m.freeRename === true && typeof m.at === "string", m);
  const refs = await query(dbName, "SELECT owner_kind, owner_id, asset_id, live FROM asset_refs WHERE store_id = ? ORDER BY owner_kind, owner_id, asset_id", [STORE1]);
  const byOwner = (kind: string, owner: string) => refs.filter((r) => r.owner_kind === kind && r.owner_id === owner);
  check(`${L} asset_refs: drafts (not live) and live versions, owned assets only (${refs.length})`, refs.length === 11 && byOwner("page", P1).length === 2 && byOwner("page_version", V1B).length === 2 && byOwner("page", P2).length === 2 && byOwner("page", P3).length === 2 && byOwner("page_version", V3A).length === 2 && byOwner("brand", "brand").length === 1 && !refs.some((r) => r.asset_id === MISSING_ASSET) && byOwner("page", P1).every((r) => Number(r.live) === 0) && byOwner("page_version", V1B).every((r) => Number(r.live) === 1), refs);
  const mediaBytes = (fixture.tables.media_files ?? []).reduce((s, r) => s + Number(r.bytes), 0);
  same(
    `${L} gauges recomputed`,
    (await query(dbName, "SELECT metric, value FROM store_usage WHERE store_id = ? AND period = 'total' ORDER BY metric", [STORE1])).map((r) => [r.metric, Number(r.value)]),
    [["agents", 2], ["media_bytes", mediaBytes], ["members", 4], ["pages", 3]],
  );
  const converted = await query(dbName, "SELECT action, actor_kind FROM audit_log WHERE store_id = ? AND action IN ('store.created', 'pixels.library_migrated') ORDER BY id", [STORE1]);
  same(`${L} conversion audited (system actor)`, converted, [
    { action: "pixels.library_migrated", actor_kind: "system" },
    { action: "store.created", actor_kind: "system" },
  ]);
  const [{ n: brands }] = (await query(dbName, "SELECT COUNT(*) AS n FROM protected_brands")) as [{ n: number }];
  const { PROTECTED_BRANDS } = await import("@/lib/platform/data/protected-brands");
  check(`${L} protected brands seeded (${PROTECTED_BRANDS.length})`, Number(brands) === PROTECTED_BRANDS.length);
}

async function main(): Promise<void> {
  const since = Date.now() - 1_000;
  env.APP_SECRET = randomBytes(36).toString("base64url"); // a test secret for this run only (never printed)
  delete env.APP_TIMEZONE;
  delete env.SG_TEST_CONTEXT;
  delete env.DATABASE_URL; // the parent only uses explicit connections
  const { encrypt } = await import("@/lib/security/crypto");
  const folder = legacyMigrationsFolder();
  const { runMigrations } = await import("@/lib/db/migrate");
  const { runTenancyCheck, tenancyCheckOk } = await import("@/lib/db/upgrade-check");
  const full = await fullFixture(encrypt);

  try {
    console.log("(e) tenant set");
    await tenantSetMatchesDocument();

    console.log("(a) empty database");
    await createDb("cod_test_t1_empty");
    const a1 = await child<BootResult>("boot", "cod_test_t1_empty");
    bootOk("(a) boot 1", a1, 5);
    await schemaMatchesSnapshot("cod_test_t1_empty");
    const [aMarker] = await query("cod_test_t1_empty", "SELECT value FROM settings WHERE `key` = 'tenancy_v1'");
    const am = JSON.parse(String(aMarker?.value ?? "null")) as Row | null;
    check("(a) empty install: marker { store1: false, freeRename: false }, no store", am?.store1 === false && am.freeRename === false && (await query("cod_test_t1_empty", "SELECT id FROM stores")).length === 0, am);
    same("(a) seeds: 3 plans, 7 kill switches, doc_schema 2", [
      (await query("cod_test_t1_empty", "SELECT id FROM plans ORDER BY id")).map((r) => r.id),
      (await query("cod_test_t1_empty", "SELECT COUNT(*) AS n FROM flags WHERE kind = 'kill'")).map((r) => Number(r.n)),
      (await query("cod_test_t1_empty", "SELECT value FROM settings WHERE `key` = 'doc_schema'")).map((r) => String(r.value)),
    ], [["beta", "internal", "pro"], [7], ["2"]]);
    const aSnap = await snapshot("cod_test_t1_empty", false, since);
    const a2 = await child<BootResult>("boot", "cod_test_t1_empty");
    bootOk("(a) boot 2", a2, 0);
    const aSnap2 = await snapshot("cod_test_t1_empty", false, since);
    same("(c) empty: the second boot changes nothing", diffSnapshots(aSnap, aSnap2), []);
    same("(c) empty: the second boot writes no audit row", aSnap2.audit.length, aSnap.audit.length);
    const aRef = await snapshot("cod_test_t1_empty", true, since);

    console.log("(d) empty database, 0004 interrupted");
    await createDb("cod_test_t1_empty_int");
    check("(d) empty: 0000-0003 applied", (await runMigrations({ migrationsFolder: folder, databaseUrl: urlOf("cod_test_t1_empty_int") })).applied === 4);
    const total = await partial0004("cod_test_t1_empty_int", 150);
    const ai = await child<BootResult>("boot", "cod_test_t1_empty_int");
    bootOk("(d) empty: resumed boot", ai, 1);
    same(`(d) empty: 0004 cut after 150 of ${total} statements, resumed = the clean run`, diffSnapshots(aRef, await snapshot("cod_test_t1_empty_int", true, since)), []);

    console.log("(b) legacy database");
    await legacyDb("cod_test_t1_legacy", full, encrypt, folder);
    {
      const conn = await connect("cod_test_t1_legacy");
      try {
        const pre = await runTenancyCheck(conn, { requireEnvelopes: true });
        check("(b) pre-tenancy dry run: 0 problems", pre.mode === "pre-tenancy" && tenancyCheckOk(pre), pre);
        check('(b) pre-tenancy dry run: handle "nour-beaut", envelopes open', pre.info.some((i) => i.includes('"nour-beaut"')) && pre.info.some((i) => /2 legacy envelope\(s\) open/.test(i)), pre.info);
      } finally {
        await conn.end();
      }
    }
    const preCli = await dryRunCli("cod_test_t1_legacy");
    check("(b) dry run CLI on the legacy database (pre-tenancy): exit 0", preCli.code === 0, preCli.out.slice(-600));
    const mo = await child<{ migrate: { applied: number }; turnstileReadable: boolean; secretsReadable: boolean; storeReadable: boolean; tenancy: { problems: string[] } }>("migrate-only", "cod_test_t1_legacy");
    check("(b) 0004 applied on the legacy database", mo.migrate.applied === 1, mo.migrate);
    check("(b) ENGC-19: store #1's turnstile readable BEFORE the conversion", mo.turnstileReadable);
    check("(b) ENGC-19: store #1's tracking secrets and store setting readable before the conversion", mo.secretsReadable && mo.storeReadable);
    check("(b) the tenancy gate flags the unconverted database", mo.tenancy.problems.some((p) => p.includes("tenancy_v1 marker is missing")), mo.tenancy.problems);
    const b1 = await child<BootResult>("boot", "cod_test_t1_legacy");
    bootOk("(b) boot 1", b1, 0);
    check("(b) boot 1 converted store #1", b1.boot.steps.some((s) => s.name === "store #1 conversion" && /converted/.test(s.detail ?? "")), b1.boot.steps);
    await legacyAssertions("cod_test_t1_legacy", full);
    const postCli = await dryRunCli("cod_test_t1_legacy");
    check("(b) dry run CLI on the converted database: exit 0", postCli.code === 0 && /✓ upgrade dry run passed/.test(postCli.out), postCli.out.slice(-600));
    const bSnap = await snapshot("cod_test_t1_legacy", false, since);
    const b2 = await child<BootResult>("boot", "cod_test_t1_legacy");
    bootOk("(b) boot 2", b2, 0);
    const bSnap2 = await snapshot("cod_test_t1_legacy", false, since);
    same("(c) legacy: the second boot changes nothing", diffSnapshots(bSnap, bSnap2), []);
    same("(c) legacy: the second boot writes no audit row", bSnap2.audit.length, bSnap.audit.length);
    const bRef = await snapshot("cod_test_t1_legacy", true, since);

    const read = await child<Record<string, unknown>>("read", "cod_test_t1_legacy");
    check("(b) settings readable under v2 through getStoreSettings", read.turnstile === true && read.secrets === true && read.store === true && read.defaults === true && read.storeAi === true && read.brand === true && read.sheets === true, read);
    same("(b) pixel library through getStoreSettings", read.library, [`meta:${META_STORE}`, `meta:${META_P1}`, `meta:${META_P3}`, `tiktok:${TIKTOK_P3}`]);
    same("(b) ENGC-30: the free rename works once, then the 30-day rule", [read.grantBefore, read.first, read.second, read.grantAfter], [true, "ok", "too_soon", false]);
    same(
      "(b) the old handle redirects (store_handle_history)",
      (await query("cod_test_t1_legacy", "SELECT handle, store_id, reason FROM store_handle_history")).map((r) => [r.handle, r.store_id, r.reason]),
      [["nour-beaut", STORE1, "renamed"]],
    );

    console.log("(h) system seam");
    {
      const conn = await connect("cod_test_t1_legacy");
      try {
        const sid = (n: number) => id26("ST", n);
        for (const [n, status] of [[1, "active"], [2, "active"], [3, "suspended"], [4, "pending"]] as const) {
          await conn.query("INSERT INTO stores (id, handle, name, status, plan_id, brand_seed) VALUES (?, ?, ?, ?, 'beta', ?)", [sid(n), `qa-store-${n}`, `QA store ${n}`, status, "0123456789abcdef"]);
        }
        await conn.query("INSERT INTO store_settings (store_id, `key`, value, encrypted, purpose_v) VALUES (?, 'sheets', ?, 0, 2)", [sid(2), JSON.stringify({ enabled: true, spreadsheetId: "1TESTSHEET1111111111111111111111" })]);
        const order = full.tables.orders![0]!;
        await conn.query("INSERT INTO orders SET ?", [{ ...order, id: "CMD-TESTQA", store_id: sid(2), page_id: id26("PG", 9), version_id: null, idem: "00000000-0000-4000-8000-0000000000aa", created_at: at(3) }]);
      } finally {
        await conn.end();
      }
      const j = await child<Record<string, { seen: string[]; visited: number; done: boolean }> & { tickRefused: boolean; userRefused: boolean }>("jobs", "cod_test_t1_legacy", {}, ["--throw-for", id26("ST", 1)]);
      const active = [STORE1, id26("ST", 1), id26("ST", 2)];
      same("(h) forEachStore: every active store once, in id order, done", [j.all!.seen, j.all!.done], [active, true]);
      same("(h) forEachStore: the next run starts after the cursor and wraps around", [j.again!.seen, j.again!.done], [active, true]);
      same("(h) forEachStore: a throwing store is logged and skipped, the others still run", [j.thrown!.seen, j.thrown!.done], [active, true]);
      check("(h) forEachStore: the budget stops it, done false", j.budget1!.done === false && j.budget1!.seen.length < 3, j.budget1);
      check("(h) forEachStore: the next run resumes after the cursor", j.budget2!.seen[0] === active[j.budget1!.seen.length], j.budget2);
      same("(h) forEachStore: other states", j.other!.seen, [id26("ST", 3), id26("ST", 4)]);
      same("(h) pending_sheets: Sheets on and an order to push, the oldest pending order first", j.sheets!.seen, [id26("ST", 2), STORE1]);
      same("(h) pending_outbox before 0005: nothing to visit, done", [j.outbox!.visited, j.outbox!.done], [0, true]);
      check('(h) the job name "tick" and a non-system actor are refused', j.tickRefused && j.userRefused);
    }

    console.log("(d) legacy database, 0004 interrupted");
    for (const n of [40, 260]) {
      const name = `cod_test_t1_int_${n}`;
      await legacyDb(name, full, encrypt, folder);
      const totalStatements = await partial0004(name, n);
      const r = await child<BootResult>("boot", name);
      bootOk(`(d) 0004 cut after ${n}: resumed boot`, r, 1);
      same(`(d) 0004 cut after ${n} of ${totalStatements} statements, resumed = the clean run`, diffSnapshots(bRef, await snapshot(name, true, since)), []);
    }

    console.log("(d) legacy database, conversion interrupted");
    {
      const name = "cod_test_t1_conv_steps";
      await legacyDb(name, full, encrypt, folder);
      const steps = await child<{ hit: { label: string | null; aborted: boolean; seen: string[] }[] }>("convert-abort", name, {}, ["--progressive"]);
      const aborted = steps.hit.filter((h) => h.aborted).map((h) => h.label!);
      const units = ["s4", "reseal:defaults", "reseal:sheets", "reseal:store", "reseal:tracking_secrets", "reseal:turnstile", "logo", "stores", "strip", "handle", "store_ai", "home", "pixels:health", "pixels:secrets", "pixels", `refs:${P1}`, `refs:${P2}`, `refs:${P3}`, "gauges", "delete"];
      check(`(d) the conversion aborted after each of its units in turn (${aborted.length} runs)`, steps.hit.every((h) => h.aborted) && units.every((u) => aborted.includes(u)) && aborted.at(-1) === "delete", { aborted, missing: units.filter((u) => !aborted.includes(u)) });
      const r = await child<BootResult>("boot", name);
      bootOk("(d) conversion resumed by the next boot", r, 0);
      same("(d) interrupted after every unit, then resumed by a new boot = the clean run", diffSnapshots(bRef, await snapshot(name, true, since)), []);
    }
    {
      const name = "cod_test_t1_conv_crash";
      await legacyDb(name, full, encrypt, folder);
      const crash = await child<{ hit: { aborted: boolean }[] }>("convert-abort", name, {}, ["--labels", "pixels:health"]);
      check("(d) a boot crashed in the middle of the conversion", crash.hit[0]?.aborted === true);
      const r = await child<BootResult>("boot", name);
      bootOk("(d) the next boot resumes it", r, 0);
      same("(d) crashed then resumed by a new process = the clean run", diffSnapshots(bRef, await snapshot(name, true, since)), []);
    }

    console.log("(c) the owner's setup only");
    {
      const name = "cod_test_t1_setup";
      const setup = await setupFixture();
      await legacyDb(name, setup, encrypt, folder);
      const tz = { APP_TIMEZONE: "Europe/Paris" };
      const c1 = await child<BootResult>("boot", name, tz, []);
      bootOk("(c) setup: boot 1", c1, 1);
      const conv = c1.boot.steps.find((s) => s.name === "store #1 conversion")?.detail ?? "";
      check('(c) setup: the derived protected handle "meta-deals" is replaced, no pixel migration (the library exists)', /handle "meta-deals" replaced by "store-1"/.test(conv) && !/pixel library/.test(conv), conv);
      same(
        "(c) setup: store #1 (name, handle, timezone from APP_TIMEZONE, home from settings.home)",
        await query(name, "SELECT name, handle, timezone, default_locale, home_page_id FROM stores"),
        [{ name: "Meta Deals", handle: "store-1", timezone: "Europe/Paris", default_locale: "ar", home_page_id: P2 }],
      );
      same("(c) setup: owner membership and super_admin", await query(name, "SELECT m.role, m.status, u.platform_role FROM store_members m JOIN users u ON u.id = m.user_id"), [{ role: "owner", status: "active", platform_role: "super_admin" }]);
      same("(c) setup: the library was copied by S4, not rebuilt", (await query(name, "SELECT value FROM store_settings WHERE `key` = 'pixel_library'")).map((r) => JSON.parse(String(r.value))), [{ v: 1, pixels: [] }]);
      same("(c) setup: settings left", (await query(name, "SELECT `key` FROM settings ORDER BY `key`")).map((r) => r.key), ["doc_schema", "tenancy_v1"]);
      const s1 = await snapshot(name, false, since);
      const c2 = await child<BootResult>("boot", name, tz, []);
      bootOk("(c) setup: boot 2", c2, 0);
      const s2 = await snapshot(name, false, since);
      same("(c) setup: the second boot changes nothing", diffSnapshots(s1, s2), []);
      same("(c) setup: the second boot writes no audit row", s2.audit.length, s1.audit.length);
    }

    pending.push("(f) 10 parallel accepts of one invite → one membership: acceptInvite is T2's (a stub until T2 merges)");
    pending.push("(g) publish → unpublish → republish keeps first_published_at: publishPage(scope, …) is T3's (a stub until T3 merges)");
  } finally {
    rmSync(folder, { recursive: true, force: true });
    if (!process.argv.includes("--keep")) {
      const left = await dropAll();
      check("throwaway databases dropped", left.length === 0, left);
    }
  }
}

if (process.argv.includes("--child")) {
  const task = argOf("child") ?? "";
  childMain(task)
    .then((result) => {
      process.stdout.write(`${RESULT}${JSON.stringify(result)}\n`, () => process.exit(0));
    })
    .catch((err) => {
      console.error(`child ${task} failed:`, err instanceof Error ? err.stack : err);
      process.exit(1);
    });
} else {
  main()
    .catch((err) => {
      failures.push(`aborted: ${err instanceof Error ? err.message : String(err)}`);
    })
    .finally(() => {
      for (const p of pending) console.log(`  … pending ${p}`);
      if (failures.length) {
        console.error(`\n✗ test:migrate: ${failures.length} failed, ${pass} passed`);
        for (const f of failures) console.error(`  ✗ ${f}`);
        process.exit(1);
      }
      console.log(`✓ test:migrate: all ${pass} checks passed (${pending.length} pending other tracks)`);
      process.exit(0);
    });
}
