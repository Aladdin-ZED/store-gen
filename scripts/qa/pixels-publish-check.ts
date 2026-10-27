/**
 * Pixels, Sheets and exports per store against a real MariaDB (docs/OFFERS.md §A.3, §A.4, §A.6; docs/STORE-SAAS.md
 * §E.3, PIX-*, SHT-*, EXP-*). Two stores, A (store #1) and B; every check asks "does B ever see, use or change A's
 * data". Exit code 1 on failure.
 *
 *   npm run test:pixels-publish [-- --db cod_test_pixels_publish] [--keep]   (tsx; NOT with
 *     --conditions=react-server: next/navigation then loads React without createContext)
 *
 * Creates a throwaway database on XAMPP's MariaDB (root, no password, 127.0.0.1:3306; the name must be cod_test_*),
 * migrates it, seeds it and drops it at the end (unless --keep). A fresh APP_SECRET and a P-mode platform; nothing is
 * read from the .env files.
 *  - store A's library and tokens are seeded as the store #1 conversion leaves them (the migration itself is
 *    test:migrate's, on the converted legacy database: CCR r1.0-t1-3 item 3)
 *  - library rule: the member's role in THIS store decides (an editor is refused an unknown id, the owner's joins the
 *    library, another store's owner is refused); B's library never changes
 *  - tokens per (store, pixel): A's token is never B's, even for the same pixel id; usage counts and test windows
 *    only see the store's own pages; health and its throttle are per store
 *  - Sheets: config, pending proof (only the code's hash stored), sync health, pull and push touch only the store
 *  - exports: another store's page, version and export answer "not found"; the PHP key is the store's own
 *  - publish (the scoped publish): the store's library rule by default, and the scoped pixels-only update
 *
 * The local store-settings adapter below only answers when T1's API says "not implemented: T1" (never since the T1
 * merge): the checks run against T1's real, sealed store settings.
 */
import Module from "node:module";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { and, desc, eq, sql } from "drizzle-orm";

// the modules under test are marked `import "server-only"`; outside Next that import throws
{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = require.resolve("drizzle-orm"); // any resolvable module: server-only exports nothing used
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    return req === "server-only" ? stub : orig.call(this, req, ...rest);
  };
}

/* ---------------- store-settings adapter while T1's API is a stub ---------------- */
const SETTINGS_INDEX = path.join(process.cwd(), "src", "lib", "settings", "index.ts");
let adapterUsed = false;
{
  type Fn = (...args: unknown[]) => Promise<unknown>;
  const M = Module as unknown as { _load: (req: string, parent: unknown, isMain: boolean) => unknown; _resolveFilename: (req: string, parent: unknown, isMain: boolean) => string };
  const origLoad = M._load;
  let proxied: unknown = null;
  const adapter = {
    async get(scope: { storeId: string }, key: string): Promise<unknown> {
      const { db } = await import("@/lib/db/client");
      const { storeSettings } = await import("@/lib/db/schema");
      const { STORE_SETTINGS, storeSettingSchema } = await import("@/lib/settings/store-registry");
      const [row] = await db.select().from(storeSettings).where(and(eq(storeSettings.storeId, scope.storeId), eq(storeSettings.key, key))).limit(1);
      const schema = storeSettingSchema(key as never);
      const parsed = row ? schema.safeParse(row.value) : null;
      return parsed?.success ? parsed.data : schema.parse(STORE_SETTINGS[key as keyof typeof STORE_SETTINGS].defaults());
    },
    async set(scope: { storeId: string }, key: string, input: unknown): Promise<unknown> {
      const { db } = await import("@/lib/db/client");
      const { storeSettings } = await import("@/lib/db/schema");
      const { storeSettingSchema } = await import("@/lib/settings/store-registry");
      const value = storeSettingSchema(key as never).parse(input);
      await db
        .insert(storeSettings)
        .values({ storeId: scope.storeId, key, value, encrypted: false })
        .onDuplicateKeyUpdate({ set: { value, encrypted: false } });
      return structuredClone(value);
    },
  };
  const wrap = (real: Record<string, Fn>) => {
    const notYet = (e: unknown) => e instanceof Error && e.message.startsWith("not implemented: T1");
    const withFallback =
      (name: string, impl: Fn): Fn =>
      async (...args) => {
        try {
          return await real[name]!(...args);
        } catch (e) {
          if (!notYet(e)) throw e;
          adapterUsed = true;
          return impl(...args);
        }
      };
    const overrides: Record<string, Fn> = {
      getStoreSetting: withFallback("getStoreSetting", (scope, key) => adapter.get(scope as { storeId: string }, key as string)),
      getStoreSettings: withFallback("getStoreSettings", async (scope, keys) => {
        const out: Record<string, unknown> = {};
        for (const k of keys as string[]) out[k] = await adapter.get(scope as { storeId: string }, k);
        return out;
      }),
      setStoreSetting: withFallback("setStoreSetting", (scope, key, input) => adapter.set(scope as { storeId: string }, key as string, input)),
      updateStoreSetting: withFallback("updateStoreSetting", async (scope, key, patch) => {
        const current = (await adapter.get(scope as { storeId: string }, key as string)) as Record<string, unknown>;
        return adapter.set(scope as { storeId: string }, key as string, { ...current, ...(patch as Record<string, unknown>) });
      }),
    };
    return new Proxy(real, { get: (t, p) => (typeof p === "string" && p in overrides ? overrides[p] : Reflect.get(t, p)) });
  };
  M._load = function (req: string, parent: unknown, isMain: boolean) {
    const exp = origLoad.call(this, req, parent, isMain);
    if (req === "server-only" || !(req.includes("settings") || req === "." || req === "./index")) return exp;
    let file = "";
    try {
      file = M._resolveFilename(req, parent, isMain);
    } catch {
      return exp;
    }
    if (path.resolve(file) !== SETTINGS_INDEX) return exp;
    return (proxied ??= wrap(exp as Record<string, Fn>));
  };
}

const flag = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const dbName = flag("db") ?? "cod_test_pixels_publish";
const KEEP = process.argv.includes("--keep");
if (!/^cod_test_[a-z0-9_]{1,48}$/.test(dbName)) {
  console.error(`✗ refusing to run on database "${dbName}": use a throwaway cod_test_* name`);
  process.exit(1);
}
const DB_SERVER = "mysql://root@127.0.0.1:3306";
{
  // this process's platform: a fresh secret, P mode, never the owner's environment
  const env = process.env as Record<string, string | undefined>;
  for (const k of ["PUBLIC_URL", "STORE_ROOT_DOMAIN", "EDGE_KEY", "ADMIN_HOST", "LEGACY_PLATFORM_HOSTS", "TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY", "GOOGLE_SA_JSON_B64"]) delete env[k];
  env.DATABASE_URL = `${DB_SERVER}/${dbName}`;
  env.APP_SECRET = randomBytes(32).toString("hex");
  env.PLATFORM_URL = "http://localhost:3451";
}

/** Create (or empty) the throwaway database; drop it at the end. */
async function rootQuery(q: string): Promise<void> {
  const mysql = (await import("mysql2/promise")).default;
  const conn = await mysql.createConnection({ uri: DB_SERVER, charset: "utf8mb4_unicode_ci" });
  try {
    await conn.query(q);
  } finally {
    await conn.end();
  }
}

let pass = 0;
const failures: string[] = [];
const ok = (label: string, cond: boolean, info?: unknown) => {
  if (cond) pass++;
  else failures.push(`${label}${info === undefined ? "" : `\n    ${JSON.stringify(info)}`}`);
};
const eq2 = (label: string, got: unknown, want: unknown) => ok(label, JSON.stringify(got) === JSON.stringify(want), { got, want });
async function code(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return "ok";
  } catch (e) {
    return (e as { code?: string }).code ?? (e instanceof Error ? e.message : String(e));
  }
}

const META_A = "111111111111111";
const META_B = "222222222222222";
const META_X = "999999999999999";
const META_Y = "888888888888888";
const TT_1 = "CTESTPIXEL0000000001";
const SNAP = "1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d";
const GA4 = "G-TEST1234";
const STORE_A = "00000000000000000000000001"; // store #1: the legacy panel's store
const STORE_B = "00000000000000000000000002";
const SHEET_A = "1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const SHEET_B = "1BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";

/**
 * The modules under test go through CommonJS `require` (not `import()`), so the settings adapter above sees every
 * load of src/lib/settings/index.ts, the first one included.
 */
const load = <T>(id: string): T => Module.createRequire(__filename)(id) as T;

async function main() {
  await rootQuery(`DROP DATABASE IF EXISTS \`${dbName}\``);
  await rootQuery(`CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  const { runMigrations } = load<typeof import("@/lib/db/migrate")>("@/lib/db/migrate");
  await runMigrations();
  const { db } = load<typeof import("@/lib/db/client")>("@/lib/db/client");
  const { auditLog, exportsTable, orders, pages, pageVersions, settings, storeMembers, stores, storeSettings, users } = load<typeof import("@/lib/db/schema")>("@/lib/db/schema");
  const { newId, newPublicKey } = load<typeof import("@/lib/db/ids")>("@/lib/db/ids");
  const { getFixture } = load<typeof import("@/lib/page/fixtures")>("@/lib/page/fixtures");
  const { validateDoc } = load<typeof import("@/lib/page/validate")>("@/lib/page/validate");
  const { invalidateSettings, getStoreSetting, setStoreSetting } = load<typeof import("@/lib/settings")>("@/lib/settings");
  const lib = load<typeof import("@/lib/pixels/library.server")>("@/lib/pixels/library.server");
  const { pixelUsage, pixelUsageOf, invalidatePixelUsage, usageCount, livePagePixels } = load<typeof import("@/lib/pixels/usage.server")>("@/lib/pixels/usage.server");
  const { getPixelHealth, recordPixelHealth } = load<typeof import("@/lib/pixels/health.server")>("@/lib/pixels/health.server");
  const { duplicatePage } = load<typeof import("@/lib/admin-data/pages")>("@/lib/admin-data/pages");
  const { systemCtx, systemScope } = load<typeof import("@/lib/jobs/scope")>("@/lib/jobs/scope");
  const { trackingRefs } = load<typeof import("@/lib/pixels/library")>("@/lib/pixels/library");
  const sheets = load<typeof import("@/lib/sheets")>("@/lib/sheets");
  const exp = load<typeof import("@/lib/export/server")>("@/lib/export/server");
  const { storeExportKey, NO_EXPORT_KEY } = load<typeof import("@/lib/export/service-account")>("@/lib/export/service-account");
  const { publishPage, publishTrackingOnly } = load<typeof import("@/lib/render/publish.server")>("@/lib/render/publish.server");

  // empty the test tables (throwaway database only; children before their store)
  for (const t of ["audit_log", "exports", "orders", "page_versions", "pages", "store_settings", "store_members", "rate_limits", "settings"]) {
    await db.execute(sql.raw(`DELETE FROM \`${t}\``));
  }
  await db.execute(sql.raw("DELETE FROM `stores`"));
  await db.execute(sql.raw("DELETE FROM `users`"));
  invalidateSettings();
  invalidatePixelUsage(STORE_A);
  invalidatePixelUsage(STORE_B);

  const ctx = systemCtx("qa.pixels_publish");
  const A = systemScope(ctx, STORE_A);
  const B = systemScope(ctx, STORE_B);
  for (const [id, handle] of [
    [STORE_A, "store-a"],
    [STORE_B, "store-b"],
  ] as const) {
    await db.insert(stores).values({ id, handle, name: handle === "store-a" ? "Store A" : "Store B", status: "active", brandSeed: "0123456789abcdef" });
  }
  const person = (email: string) => ({ id: newId(), email, name: email.split("@")[0]!, passwordHash: "x" });
  const ownerA = person("owner-a@px.test");
  const editorA = person("editor-a@px.test");
  const ownerB = person("owner-b@px.test");
  for (const u of [ownerA, editorA, ownerB]) await db.insert(users).values(u);
  await db.insert(storeMembers).values([
    { storeId: STORE_A, userId: ownerA.id, role: "owner" },
    { storeId: STORE_A, userId: editorA.id, role: "editor" },
    { storeId: STORE_B, userId: ownerB.id, role: "owner" },
  ]);
  const actor = (u: { id: string }) => ({ kind: "user" as const, userId: u.id, impersonatorId: null, ip: null });

  const fx = getFixture("massage");
  const base = validateDoc(fx.doc).doc!;
  const docWith = (tracking: Record<string, unknown>, patch: Record<string, unknown> = {}) => validateDoc({ ...base, ...patch, tracking }).doc!;
  const insertPage = async (storeId: string, name: string, slug: string, draft: unknown, status: "draft" | "published" | "archived" = "draft") => {
    const id = newId();
    await db.insert(pages).values({ storeId, id, slug, name, status, locale: "fr", publicKey: newPublicKey(), draft: draft as never, updatedAt: new Date(Date.now() - 60_000) });
    return id;
  };
  const insertVersion = async (storeId: string, pageId: string, doc: unknown, kind: "publish" | "save" = "publish") => {
    const id = newId();
    await db.insert(pageVersions).values({ storeId, id, pageId, kind, label: null, doc: doc as never, checksum: "0".repeat(64), createdBy: ownerA.id, createdAt: new Date(Date.now() - 30_000) });
    return id;
  };
  const publishAt = async (storeId: string, pageId: string, doc: unknown) => {
    const v = await insertVersion(storeId, pageId, doc);
    await db.update(pages).set({ publishedVersionId: v, status: "published" }).where(eq(pages.id, pageId));
    return v;
  };

  /* ---------------- store A's library and tokens (as the store #1 conversion leaves them) ---------------- */
  const pA = await insertPage(STORE_A, "Argan", "argan", docWith({ metaPixelId: [META_A] }), "published");
  const vA = await publishAt(STORE_A, pA, docWith({ metaPixelId: [META_A], snapPixelId: [SNAP] }));
  await insertPage(STORE_A, "Old page", "old", { ...docWith({}), tracking: { tiktokPixelId: [TT_1] } }, "archived");
  const pExp = await insertPage(STORE_A, "Exported", "exported", docWith({}));
  const vExp = await insertVersion(STORE_A, pExp, docWith({ ga4Id: [GA4] }), "save");
  const expA = newId();
  await db.insert(exportsTable).values({ storeId: STORE_A, id: expA, pageId: pExp, versionId: vExp, mode: "connected", publicKey: newPublicKey(), allowedOrigins: [] });
  // store B: its own page firing A's pixel id and one of its own
  const pBx = await insertPage(STORE_B, "Store B page", "argan", docWith({ metaPixelId: [META_A, META_Y] }), "published");
  const vBx = await publishAt(STORE_B, pBx, docWith({ metaPixelId: [META_A, META_Y] }));
  const at = new Date().toISOString();
  const entry = (platform: "meta" | "tiktok" | "snap" | "ga4", id: string, label: string) => ({ platform, id, label, addedAt: at, tests: [] });
  await setStoreSetting(
    A,
    "pixel_library",
    {
      v: 1,
      pixels: [
        entry("meta", META_B, "Pixel principal"),
        entry("meta", META_A, "Argan · ••••1111"),
        entry("tiktok", TT_1, "Old page · ••••0001"),
        entry("snap", SNAP, "Argan · ••••5c6d"),
        entry("ga4", GA4, "Exported · ••••1234"),
      ],
    },
    { id: "qa" },
  );
  await setStoreSetting(
    A,
    "tracking_secrets",
    {
      metaTokens: { [META_A]: "legacyMetaToken123", [META_B]: "ownTokenBBBB2222" },
      metaTestCodes: { [META_A]: "TEST111", [META_B]: "TEST111" },
      tiktokTokens: { [TT_1]: "legacyTikTok99" },
    },
    { id: "qa" },
  );
  const libA = await lib.getLibrary(A);
  eq2("seed: store A's library as converted", libA.pixels.map((p) => `${p.platform}:${p.id}`), [`meta:${META_B}`, `meta:${META_A}`, `tiktok:${TT_1}`, `snap:${SNAP}`, `ga4:${GA4}`]);
  eq2("seed: store B has no library, no token", [(await lib.getLibrary(B)).pixels.length, Object.keys((await getStoreSetting(B, "tracking_secrets")).metaTokens).length], [0, 0]);

  /* ---------------- library rule (membership role of THIS store) ---------------- */
  const rule = (scope: typeof A, who: { id: string }, tracking: Record<string, unknown>) => code(() => lib.enforceLibraryRule(scope, tracking, actor(who)));
  eq2("library rule: an editor is refused an unknown id", await rule(A, editorA, { metaPixelId: [META_X] }), "pixel_not_in_library");
  eq2("library rule: another store's owner is refused in store A", await rule(A, ownerB, { metaPixelId: [META_X] }), "pixel_not_in_library");
  eq2("library rule: a system actor is refused", await code(() => lib.enforceLibraryRule(A, { metaPixelId: [META_X] }, { kind: "system", userId: null, impersonatorId: null, ip: null })), "pixel_not_in_library");
  eq2("library rule: the owner's unknown id joins store A's library", await rule(A, ownerA, { metaPixelId: [META_X] }), "ok");
  const libA2 = await lib.getLibrary(A);
  ok("library rule: label \"\" in A", libA2.pixels.some((p) => p.id === META_X && p.label === ""), libA2.pixels);
  ok("library rule: B's library unchanged", (await lib.getLibrary(B)).pixels.length === 0);
  eq2("library rule: an editor publishes ids the library knows", await rule(A, editorA, { metaPixelId: [META_X] }), "ok");

  /* ---------------- tokens per (store, pixel) ---------------- */
  await lib.savePixelEntry(B, { platform: "meta", id: META_A, label: "B's own", token: "tokenOfStoreB_9999" }, actor(ownerB));
  const sB = await getStoreSetting(B, "tracking_secrets", { fresh: true });
  const sA = await getStoreSetting(A, "tracking_secrets", { fresh: true });
  ok("tokens: the same pixel id keeps one token per store", sB.metaTokens[META_A] === "tokenOfStoreB_9999" && sA.metaTokens[META_A] === "legacyMetaToken123", { a: sA.metaTokens[META_A]?.length, b: sB.metaTokens[META_A]?.length });
  const viewB = await lib.pixelLibraryView(B, { canCreate: true, canSeeTokens: false });
  ok("library view: B sees only its own pixel, no token mask without integrations.manage", viewB.pixels.length === 1 && viewB.pixels[0]!.id === META_A && !viewB.pixels[0]!.tokenMask, viewB.pixels);
  const viewA = await lib.pixelLibraryView(A, { canCreate: true, canSeeTokens: true });
  ok("library view: A's mask is A's token", viewA.pixels.find((p) => p.id === META_A)?.tokenMask?.endsWith("n123") === true, viewA.pixels.find((p) => p.id === META_A)?.tokenMask);
  ok("library view: the label of B's entry never reaches A", viewA.pixels.find((p) => p.id === META_A)?.label !== "B's own");

  /* ---------------- usage, live pages, delete, test windows ---------------- */
  invalidatePixelUsage(STORE_A);
  invalidatePixelUsage(STORE_B);
  const usageA = await pixelUsage(A, { fresh: true });
  eq2("usage: META_A in A's drafts + live only (B's page not counted)", usageCount(usageA.get(`meta:${META_A}`)), { pages: 1, live: 1, exports: 0, drafts: 1 });
  eq2("usage: GA4 only via A's export", usageCount(usageA.get(`ga4:${GA4}`)), { pages: 0, live: 0, exports: 1, drafts: 0 });
  eq2("usage of one pixel: A's pages only", (await pixelUsageOf(A, "meta", META_A)).map((u) => u.pageId), [pA]);
  eq2("usage of one pixel: B's pages only", (await pixelUsageOf(B, "meta", META_A)).map((u) => u.pageId), [pBx]);
  ok("live pixels: A's map has no B page", !(pBx in (await livePagePixels(A))) && pA in (await livePagePixels(A)));
  eq2("delete refused while A's export uses it", await code(() => lib.removePixelEntry(A, { platform: "ga4", id: GA4 }, actor(ownerA))), "pixel_in_use");
  eq2("test window needs a saved test code", await code(() => lib.startPixelTest(A, { pageId: pA, platform: "tiktok", id: TT_1, minutes: 30 }, actor(ownerA))), "no_test_code");
  eq2("test window: another store's live page is not live for A", await code(() => lib.startPixelTest(A, { pageId: pBx, platform: "meta", id: META_A, minutes: 30 }, actor(ownerA))), "not_live");
  ok("live tracking: B's page through A is null", (await lib.liveTracking(A, pBx)) === null && (await lib.liveTracking(B, pBx))?.versionId === vBx);
  const w = await lib.startPixelTest(A, { pageId: pA, platform: "meta", id: META_A, minutes: 60 }, actor(ownerA));
  const libA3 = await lib.getLibrary(A);
  ok("test window stored for A's page only", libA3.pixels.find((p) => p.id === META_A)?.tests.length === 1 && libA3.pixels.find((p) => p.id === META_A)?.tests[0]?.pageId === pA && Date.parse(w.until) - Date.now() > 59 * 60_000);
  ok("test window: B's entry for the same id has none", (await lib.getLibrary(B)).pixels.find((p) => p.id === META_A)?.tests.length === 0);
  const testAudit = await db.select().from(auditLog).where(eq(auditLog.action, "pixels.test_started")).orderBy(desc(auditLog.id));
  ok("test window audited in A", testAudit[0]?.storeId === STORE_A, testAudit[0]);

  /* ---------------- health per store, throttle per store ---------------- */
  const now = Date.now();
  await recordPixelHealth(A, [{ platform: "meta", id: META_Y, state: "ok", testMode: false }], { throttle: true, now });
  await recordPixelHealth(B, [{ platform: "meta", id: META_Y, state: "refused", code: "token", testMode: false }], { throttle: true, now });
  const hA = await getPixelHealth(A);
  const hB = await getPixelHealth(B);
  ok("health: one entry per store for the same pixel (B's write not throttled by A's)", hA[`meta:${META_Y}`]?.state === "ok" && hB[`meta:${META_Y}`]?.state === "refused", { a: hA[`meta:${META_Y}`], b: hB[`meta:${META_Y}`] });
  await recordPixelHealth(A, [{ platform: "meta", id: META_Y, state: "ok", testMode: false }], { throttle: true, now: now + 1000 });
  ok("health: A's unchanged state within 10 min is throttled", (await getPixelHealth(A))[`meta:${META_Y}`]?.at === hA[`meta:${META_Y}`]?.at);

  /* ---------------- duplicate keeps the store ---------------- */
  const dup = await duplicatePage(A, pA, actor(ownerA));
  const [dupRow] = await db.select().from(pages).where(eq(pages.id, dup!.id));
  ok("duplicate: same ids, copiedFrom = source page, in A", dupRow?.storeId === STORE_A && JSON.stringify(dupRow.draft.tracking) === JSON.stringify({ metaPixelId: [META_A], copiedFrom: "Argan" }), dupRow?.draft.tracking);
  ok("duplicate: B can't duplicate A's page", (await duplicatePage(B, pA, actor(ownerB))) === null);

  /* ---------------- Sheets per store ---------------- */
  await setStoreSetting(A, "sheets", { enabled: true, spreadsheetId: SHEET_A, sheetId: 7, sheetTitle: "Commandes", connectedAt: new Date().toISOString() }, { id: "qa" });
  ok("sheets: A's config is A's, B has none", (await sheets.getSheetsConfig(A))?.spreadsheetId === SHEET_A && (await sheets.getSheetsConfig(B)) === null);
  const start = await sheets.startSheetConnect(B, `https://docs.google.com/spreadsheets/d/${SHEET_B}/edit#gid=3`, actor(ownerB), { currency: "MAD" });
  ok("sheets proof: a new spreadsheet asks for a code (no Google call before the proof)", start.kind === "proof" && /^SG-[0-9A-HJKMNP-TV-Z]{10}$/.test(start.kind === "proof" ? start.code : ""), start);
  const proofB = await sheets.pendingProof(B);
  ok("sheets proof: only the code's hash is stored, for B's spreadsheet and tab", !!proofB && proofB.spreadsheetId === SHEET_B && proofB.sheetId === 3 && start.kind === "proof" && proofB.codeHash === sheets.proofHash(start.code) && !JSON.stringify(proofB).includes(start.code), proofB);
  ok("sheets proof: A has no pending proof and keeps its sheet", (await sheets.pendingProof(A)) === null && (await sheets.getSheetsConfig(A))?.spreadsheetId === SHEET_A);
  eq2("sheets proof: verify without a pending proof → no_proof", await code(() => sheets.verifySheetConnect(A, actor(ownerA), { currency: "MAD" })), "no_proof");
  const mkOrder = async (storeId: string, pageId: string, status: "pending" | "synced" | "failed", isTest = false) => {
    const id = `QA-${newId().slice(-8)}`;
    await db.insert(orders).values({
      storeId,
      id,
      pageId,
      versionId: storeId === STORE_A ? vA : vBx,
      status: "new",
      name: "Client",
      phone: "+212600000000",
      city: "Rabat",
      address: "1 rue",
      productName: "Huile d'argan",
      items: { v: 1 } as never,
      qty: 1,
      subtotal: 100,
      shipping: 0,
      total: 100,
      currency: "MAD",
      idem: crypto.randomUUID(),
      sheetStatus: status,
      isTest,
    } as never);
    return id;
  };
  let ordersOk = true;
  try {
    await mkOrder(STORE_A, pA, "pending");
    await mkOrder(STORE_A, pA, "failed");
    await mkOrder(STORE_B, pBx, "pending");
    await mkOrder(STORE_B, pBx, "synced");
  } catch (e) {
    ordersOk = false;
    failures.push(`could not insert test orders: ${e instanceof Error ? e.message.slice(0, 200) : String(e)}`);
  }
  if (ordersOk) {
    eq2("sheets health: A counts A's orders only", await sheets.syncHealth(A), { pending: 1, synced: 0, failed: 1, disabled: 0 });
    eq2("sheets health: B counts B's orders only", await sheets.syncHealth(B), { pending: 1, synced: 1, failed: 0, disabled: 0 });
  }
  const pullB = await sheets.pullStatuses(B);
  ok("sheets pull: B has no connected sheet (nothing read, nothing changed)", pullB.status === "not_configured" && pullB.updated === 0, pullB);

  /* ---------------- exports per store ---------------- */
  const phpReq = (versionId: string) => ({ versionId, mode: "php" as const, allowedOrigins: [], options: { hostConfigs: true, embedServiceAccount: false } });
  eq2("export: B can't read A's page", await code(() => exp.getExportContext(B, pA, { canEmbedKey: true })), "not_found");
  eq2("export: B can't estimate A's version", await code(() => exp.estimateExport(B, phpReq(vA) as never)), "not_found");
  eq2("export: B can't build from A's version", await code(() => exp.buildExport(B, phpReq(vA) as never, actor(ownerB), { canEmbedKey: true })), "not_found");
  eq2("export: B can't revoke A's export", await code(() => exp.revokeExport(B, expA, actor(ownerB))), "not_found");
  const ctxA = await exp.getExportContext(A, pExp, { canEmbedKey: true });
  ok("export context: A's versions and exports, A's sheet", ctxA.exports.map((e) => e.id).join() === expA && ctxA.versions.some((v) => v.id === vExp) && ctxA.defaults.sheetConnected, { exports: ctxA.exports.length, sheet: ctxA.defaults.sheetConnected });
  ok("export context: no key embeddable while A has none", !ctxA.defaults.canEmbedServiceAccount && ctxA.defaults.embedKeyBlocker === NO_EXPORT_KEY);
  ok("export context: B's page shows B's (absent) sheet", !(await exp.getExportContext(B, pBx, { canEmbedKey: false })).defaults.sheetConnected);
  eq2("export: embedding without a store key → unavailable", await code(() => exp.buildExport(A, { ...phpReq(vExp), options: { hostConfigs: true, embedServiceAccount: true } } as never, actor(ownerA), { canEmbedKey: true })), "unavailable");
  eq2("export: embedding without integrations.manage → forbidden", await code(() => exp.buildExport(A, { ...phpReq(vExp), options: { hostConfigs: true, embedServiceAccount: true } } as never, actor(editorA), { canEmbedKey: false })), "forbidden");
  const keyPem = `-----BEGIN PRIVATE KEY-----\n${"A".repeat(120)}\n-----END PRIVATE KEY-----\n`;
  await setStoreSetting(A, "export_key", { clientEmail: "exports@store-a.iam.gserviceaccount.com", privateKey: keyPem, privateKeyId: "key-a-1", setAt: new Date().toISOString() }, { id: "qa" });
  ok("export key: A's key is A's; B still has none", (await storeExportKey(A)).key?.email === "exports@store-a.iam.gserviceaccount.com" && (await storeExportKey(B)).key === null);
  const revoked = await exp.revokeExport(A, expA, actor(ownerA));
  ok("export: A revokes its own export (audited in A)", !!revoked.revokedAt);
  const revAudit = await db.select().from(auditLog).where(and(eq(auditLog.action, "export.revoked"), eq(auditLog.target, expA)));
  ok("export: revoke audited once, in A", revAudit.length === 1 && revAudit[0]!.storeId === STORE_A, revAudit);

  /* ---------------- publish (the scoped publish and the pixels-only update) ---------------- */
  const pB = await insertPage(STORE_A, "Duo", "duo-px", docWith({ metaPixelId: [META_Y] }));
  eq2("publish: an editor is refused an unknown id (the store's rule runs by default)", await code(() => publishPage(A, pB, { actor: actor(editorA) })), "pixel_not_in_library");
  eq2("publish: B can't publish A's page", await code(() => publishPage(B, pB, { actor: actor(ownerB) })), "not_found");
  const pub = await publishPage(A, pB, { actor: actor(ownerA) });
  ok("publish: owner publishes and the id joins A's library", !!pub.versionId && (await lib.getLibrary(A)).pixels.some((p) => p.id === META_Y));
  ok("publish: B's library unchanged", !(await lib.getLibrary(B)).pixels.some((p) => p.id === META_Y));
  const changed = await db.select().from(auditLog).where(and(eq(auditLog.action, "page.pixels_changed"), eq(auditLog.target, pB))).orderBy(desc(auditLog.id));
  ok("publish: audit page.pixels_changed in A, masked", changed[0]?.storeId === STORE_A && !JSON.stringify(changed).includes(META_Y), changed[0]);
  const META_Z = "777777777777777";
  eq2("pixels only: B can't update A's live page", await code(() => publishTrackingOnly(B, pB, { metaPixelId: [META_X] }, pub.versionId, { actor: actor(ownerB) })), "not_found");
  eq2("pixels only: an editor is refused an unknown id", await code(() => publishTrackingOnly(A, pB, { metaPixelId: [META_Z] }, pub.versionId, { actor: actor(editorA) })), "pixel_not_in_library");
  eq2("pixels only: a stale base version is refused", await code(() => publishTrackingOnly(A, pB, { metaPixelId: [META_X] }, vA, { actor: actor(editorA) })), "live_changed");
  const only = await publishTrackingOnly(A, pB, { metaPixelId: [META_X] }, pub.versionId, { actor: actor(editorA) });
  const [liveRow] = await db.select({ v: pages.publishedVersionId, draft: pages.draft }).from(pages).where(eq(pages.id, pB));
  ok("pixels only: an editor swaps to a known id; the live version and the draft follow", liveRow?.v === only.versionId && only.draftUpdated && JSON.stringify(liveRow.draft.tracking) === JSON.stringify({ metaPixelId: [META_X] }), { only, tracking: liveRow?.draft.tracking });
  const onlyAudit = await db.select().from(auditLog).where(and(eq(auditLog.action, "page.published"), eq(auditLog.target, pB))).orderBy(desc(auditLog.id));
  ok("pixels only: audited in A by the editor", onlyAudit[0]?.storeId === STORE_A && onlyAudit[0]?.userId === editorA.id && (onlyAudit[0]?.meta as { pixelsOnly?: boolean } | null)?.pixelsOnly === true, onlyAudit[0]);
  void trackingRefs;
  void storeSettings;
  void settings;
  void vExp;

  if (adapterUsed) failures.push("store settings went through the local adapter: T1's API answered \"not implemented\"");
  for (const f of failures) console.log(`✗ ${f}`);
  console.log(failures.length ? `✗ ${failures.length} failure(s), ${pass} passed` : `✓ per-store pixels / sheets / exports / publish check passed (${pass} assertions)`);
  return failures.length ? 1 : 0;
}

async function cleanup(): Promise<void> {
  try {
    const { pool } = load<typeof import("@/lib/db/client")>("@/lib/db/client");
    await pool().end();
  } catch {
    // the pool was never opened
  }
  if (KEEP) console.log(`… kept ${dbName}`);
  else await rootQuery(`DROP DATABASE IF EXISTS \`${dbName}\``).catch((e: unknown) => console.error(`✗ could not drop ${dbName}:`, e instanceof Error ? e.message : e));
}

main()
  .then(async (code) => {
    await cleanup();
    process.exit(code);
  })
  .catch(async (e) => {
    console.error(e);
    await cleanup();
    process.exit(1);
  });
