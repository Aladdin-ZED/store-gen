import "server-only";
/**
 * The store #1 conversion, JS half (docs/STORE-SAAS.md §D.8): 0004 turned a single-tenant install into store
 * `0…01` in SQL (S1-S4: the store row, `store_id` everywhere, memberships, the legacy owner as super_admin, the
 * store-level settings rows copied in their v1 envelopes with `purpose_v = 0`); this task does what SQL can't.
 * Run by the boot tasks under withBootLock, after the migrations (§H.4); never concurrently with itself.
 *
 *   const r = await convertLegacyStore();   // { status: "converted" | "empty" | "already", … }
 *
 *  0. marker `tenancy_v1` present → "already". No store #1 (an empty install) → the marker { store1: false } → "empty".
 *  1. catch up S4: a store-level key the old build wrote after 0004 copied the row (a deploy overlapping a restart)
 *     is copied again while its row is untouched (`purpose_v = 0`).
 *  2. every `purpose_v = 0` row: encrypted → opened as v1 (`settings:<key>`), sealed v2 for `store:0…01` and
 *     compare-and-set on the old value; plain → just marked `purpose_v = 2`. An envelope that does not open (another
 *     APP_SECRET) stops the run before anything is deleted (ConversionError); the next boot tries again.
 *  3. store facts: `store.logo` → `brand.logo.primary` (DES-R16, only an asset of the store); `stores.currency` /
 *     `market` / `default_locale` from the legacy `defaults`, `stores.timezone` from APP_TIMEZONE (SET-08), the name
 *     only when S1 had to fall back to "Store 1"; then those fields leave the `store` and `defaults` values. The
 *     derived handle is checked again with the live reserved and protected lists (S1 ran before the boot seeded
 *     `protected_brands`): a handle with a problem becomes "store-1". `settings.ai` → `store_ai` (AI R16: today's
 *     "local AI off" survives), `settings.home.pageId` → `stores.home_page_id` when still NULL, and the pixel library
 *     migration (OFFERS §A.6, the port of src/lib/pixels/migrate.server.ts for this store only, PIX-07) when the
 *     store has no library yet.
 *  4. `asset_refs` of every page draft (owner `page`, not live) and published version (owner `page_version`, live)
 *     with the editor's extractor (collectAssetIds, §G.5), plus the brand logo; then the `store_usage` gauges.
 *  5. the moved keys are deleted from `settings`; the marker { store1: true, freeRename: true } is written LAST
 *     (ENGC-30: the one free rename renameHandle consumes).
 *
 * Every step is idempotent (INSERT IGNORE, compare-and-set, "only while still NULL / still legacy"), so a run
 * interrupted anywhere starts over at the next boot and ends in the same state (test:migrate interrupts it after
 * each unit of work through `opts.checkpoint`). Until step 2 has run, getStoreSetting reads `purpose_v = 0` rows with
 * openLegacy, so store #1's Turnstile and CAPI secrets work from the first request (ENGC-19).
 */
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { collectAssetIds } from "@/landing/context";
import { audit } from "@/lib/audit";
import { pool } from "@/lib/db/client";
import { LEGACY_STORE_ID, handleIsFree, loadHandleLists } from "@/lib/db/store-handles";
import { recomputeStoreGauges } from "@/lib/db/usage";
import { systemCtx, systemScope } from "@/lib/jobs/scope";
import { errorSummary } from "@/lib/orders/log";
import { Locale, Market, Tracking } from "@/lib/page/schema";
import { validateDoc } from "@/lib/page/validate";
import { SERVER_PLATFORMS, type PixelPlatform } from "@/lib/pixels/ids";
import { pixelKey } from "@/lib/pixels/library";
import { collectPixels, migrationLabel } from "@/lib/pixels/migrate";
import { openLegacy, seal } from "@/lib/security/crypto";
import { getPlatformSetting, getStoreSetting, invalidateSettings, setPlatformSetting, updateStoreSetting, type PlatformActor, type SettingsActor } from "@/lib/settings";
import { BrandSetting } from "@/lib/settings/keys/brand";
import type { PixelHealthEntry } from "@/lib/settings/keys/pixel_health";
import type { PixelLibraryEntry } from "@/lib/settings/keys/pixel_library";
import { StoreAi } from "@/lib/settings/keys/store_ai";
import { AiSettings } from "@/lib/settings/schemas";
import { invalidateStore } from "./cache";
import { handleProblem } from "./handles";
import type { WriteScope } from "./types";

const STORE1 = LEGACY_STORE_ID;
/** the store-level keys S4 copies (§D.8 step 9) */
const S4_KEYS = ["store", "defaults", "sheets", "pixel_library", "pixel_health", "tracking_secrets", "turnstile"] as const;
/** every legacy key the conversion moves out of `settings` (step 5) */
export const MOVED_KEYS = [...S4_KEYS, "ai", "home", "pixels"] as const;
/** the legacy fields step 3 moves out of the `store` and `defaults` values */
const STORE_MOVED = ["storeName", "logo"] as const;
const DEFAULTS_MOVED = ["market", "currency", "locale"] as const;
/** S1's defaults for store #1 (drizzle/0004_tenancy.sql) */
const S1_NAME = "Store 1";
const S1_TIMEZONE = "Africa/Casablanca";
const FALLBACK_HANDLE = "store-1";
const SYSTEM = { id: "system", kind: "system" } as const satisfies SettingsActor & PlatformActor;
const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const ASSET_ID_RE = /^[a-f0-9]{16,64}$/;

export interface ConvertOptions {
  /**
   * Called after each unit of work with its label (test:migrate). A throw from it interrupts the run where it stands,
   * like a crash: nothing is rolled back, and the next run must end in the same state.
   */
  checkpoint?: (unit: string) => void | Promise<void>;
}

export interface ConvertResult {
  status: "converted" | "empty" | "already";
  /** v1 envelopes re-sealed for store #1 (step 2) */
  resealed: number;
  /** plain legacy rows marked v2 (step 2) */
  plain: number;
  /** what step 3 moved, e.g. "logo", "stores.currency", "store_ai", "home" */
  moved: string[];
  /** the derived handle replaced by "store-1" (step 3), or null */
  handle: { from: string; to: string } | null;
  pixels: { ran: boolean; entries: number; tokensCopied: number; testCodesDeactivated: number };
  /** asset_refs rows written (step 4) */
  assetRefs: number;
  /** the recomputed gauges (step 4) */
  gauges: Record<string, number>;
  /** legacy `settings` rows deleted (step 5) */
  deleted: number;
  ms: number;
}

/** The conversion stopped on purpose (nothing was deleted); the message names the key, never a value. */
export class ConversionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConversionError";
  }
}

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

function parseJson(raw: unknown): unknown {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "string") return Buffer.isBuffer(raw) ? parseJson(raw.toString("utf8")) : raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** A raw `store_settings` row of store #1: its exact text (for compare-and-set) and the parsed object. */
async function storeRow(key: string): Promise<{ text: string; value: Json } | null> {
  // tenancy: store #1's rows, keyed by the constant id (the conversion runs before any request scope exists)
  const [rows] = await pool().query<RowDataPacket[]>("SELECT value, encrypted FROM store_settings WHERE store_id = ? AND `key` = ?", [STORE1, key]);
  const row = rows[0];
  if (!row || row.encrypted) return null;
  const value = parseJson(row.value);
  return isObj(value) ? { text: String(row.value), value } : null;
}

/** Replace a row's value only if it is still `text` (another writer wins). */
async function casStoreRow(key: string, text: string, next: Json): Promise<boolean> {
  const [res] = await pool().query<ResultSetHeader>("UPDATE store_settings SET value = ? WHERE store_id = ? AND `key` = ? AND value = ?", [JSON.stringify(next), STORE1, key, text]);
  return res.affectedRows === 1;
}

/** INSERT IGNORE of a plain store #1 row (a row already there, from an earlier run or the owner, wins). */
async function insertStoreRow(key: string, value: Json): Promise<boolean> {
  const [res] = await pool().query<ResultSetHeader>(
    "INSERT IGNORE INTO store_settings (store_id, `key`, value, encrypted, purpose_v, updated_at) VALUES (?, ?, ?, 0, 2, UTC_TIMESTAMP(3))",
    [STORE1, key, JSON.stringify(value)],
  );
  return res.affectedRows === 1;
}

/** A legacy `settings` row (platform table) parsed, or null. */
async function legacySetting(key: string): Promise<unknown> {
  // tenancy: platform the legacy single-tenant rows the conversion moves (§D.8)
  const [rows] = await pool().query<RowDataPacket[]>("SELECT value, encrypted FROM settings WHERE `key` = ?", [key]);
  const row = rows[0];
  return row && !row.encrypted ? parseJson(row.value) : null;
}

/** APP_TIMEZONE when it is a zone this runtime knows (SET-08), else null. */
function appTimezone(): string | null {
  const tz = process.env.APP_TIMEZONE?.trim();
  if (!tz || tz.length > 40) return null;
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return tz;
  } catch {
    return null;
  }
}

const omit = (o: Json, keys: readonly string[]): Json => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)));
const assetIdOf = (ref: unknown): string | null => (isObj(ref) && typeof ref.id === "string" && ASSET_ID_RE.test(ref.id) ? ref.id : null);

/* ------------------------------------------------------------------ */
/* Steps                                                               */
/* ------------------------------------------------------------------ */

/** Step 1: copy again what S4 copies, and refresh a still-legacy row the old build changed afterwards. */
async function catchUpS4(): Promise<void> {
  // tenancy: platform settings → store #1 (the S4 statement of drizzle/0004_tenancy.sql, rerun)
  await pool().query(
    "INSERT IGNORE INTO store_settings (store_id, `key`, value, encrypted, purpose_v, updated_at) SELECT ?, `key`, value, encrypted, 0, updated_at FROM settings WHERE `key` IN (?)",
    [STORE1, S4_KEYS],
  );
  await pool().query(
    `UPDATE store_settings ss JOIN settings s ON s.\`key\` = ss.\`key\`
        SET ss.value = s.value, ss.encrypted = s.encrypted, ss.updated_at = s.updated_at
      WHERE ss.store_id = ? AND ss.purpose_v = 0 AND s.\`key\` IN (?) AND s.updated_at > ss.updated_at`,
    [STORE1, S4_KEYS],
  );
}

/** Step 2: legacy rows → envelope v2 bound to store #1 (SET-02). */
async function reseal(r: ConvertResult, checkpoint: (unit: string) => Promise<void>): Promise<void> {
  const [rows] = await pool().query<RowDataPacket[]>("SELECT `key`, value, encrypted FROM store_settings WHERE store_id = ? AND purpose_v = 0 ORDER BY `key`", [STORE1]);
  for (const row of rows) {
    const key = String(row.key);
    if (row.encrypted) {
      const text = String(row.value);
      const envelope = parseJson(text);
      let plain: string;
      try {
        if (typeof envelope !== "string") throw new Error("not an envelope");
        plain = openLegacy(envelope, `settings:${key}`);
      } catch {
        throw new ConversionError(`the legacy "${key}" setting does not open with this APP_SECRET; nothing was deleted, the next boot tries again`);
      }
      const sealed = JSON.stringify(seal(plain, { store: STORE1 }, `settings:${key}`));
      const [res] = await pool().query<ResultSetHeader>(
        "UPDATE store_settings SET value = ?, purpose_v = 2 WHERE store_id = ? AND `key` = ? AND purpose_v = 0 AND value = ?",
        [sealed, STORE1, key, text],
      );
      if (res.affectedRows === 1) r.resealed++;
    } else {
      const [res] = await pool().query<ResultSetHeader>("UPDATE store_settings SET purpose_v = 2 WHERE store_id = ? AND `key` = ? AND purpose_v = 0", [STORE1, key]);
      if (res.affectedRows === 1) r.plain++;
    }
    invalidateStore(STORE1);
    await checkpoint(`reseal:${key}`);
  }
}

/** Step 3a: the logo, the `stores` columns and the handle; then the moved fields leave `store` / `defaults`. */
async function storeFacts(r: ConvertResult, checkpoint: (unit: string) => Promise<void>): Promise<void> {
  const store = await storeRow("store");
  const defaults = await storeRow("defaults");

  const logoId = assetIdOf(store?.value.logo);
  if (logoId) {
    const [owned] = await pool().query<RowDataPacket[]>("SELECT 1 FROM assets WHERE store_id = ? AND id = ? LIMIT 1", [STORE1, logoId]);
    const brand = { v: 1, logo: { primary: logoId } };
    if (!owned.length) console.warn("[convert] the legacy logo is not an asset of store #1; brand.logo stays empty");
    else if (BrandSetting.safeParse(brand).success && (await insertStoreRow("brand", brand))) r.moved.push("logo");
  }
  await checkpoint("logo");

  // stores columns: read the legacy fields before they leave the values below (a rerun finds them gone and skips)
  const [[cur]] = await pool().query<RowDataPacket[]>("SELECT name, timezone FROM stores WHERE id = ?", [STORE1]);
  const set: Record<string, string> = {};
  const name = typeof store?.value.storeName === "string" ? store.value.storeName.trim().slice(0, 120) : "";
  if (name && cur?.name === S1_NAME) set.name = name;
  const tz = appTimezone();
  if (tz && cur?.timezone === S1_TIMEZONE && tz !== S1_TIMEZONE) set.timezone = tz;
  const d = defaults?.value;
  if (d) {
    if (typeof d.currency === "string" && /^[A-Z]{3}$/.test(d.currency)) set.currency = d.currency;
    if (Market.safeParse(d.market).success) set.market = d.market as string;
    if (Locale.safeParse(d.locale).success) set.default_locale = d.locale as string;
  }
  const cols = Object.keys(set);
  if (cols.length) {
    await pool().query(`UPDATE stores SET ${cols.map((c) => `\`${c}\` = ?`).join(", ")} WHERE id = ?`, [...cols.map((c) => set[c]), STORE1]);
    r.moved.push(...cols.map((c) => `stores.${c}`));
  }
  await checkpoint("stores");

  if (defaults && DEFAULTS_MOVED.some((f) => f in defaults.value)) await casStoreRow("defaults", defaults.text, omit(defaults.value, DEFAULTS_MOVED));
  if (store && STORE_MOVED.some((f) => f in store.value)) await casStoreRow("store", store.text, omit(store.value, STORE_MOVED));
  invalidateStore(STORE1);
  await checkpoint("strip");

  // the handle S1 derived, against the lists S1 could not see (the protected brands are seeded at boot)
  const [[row]] = await pool().query<RowDataPacket[]>("SELECT handle FROM stores WHERE id = ?", [STORE1]);
  const handle = typeof row?.handle === "string" ? row.handle : null;
  if (handle && handle !== FALLBACK_HANDLE && handleProblem(handle, {}, await loadHandleLists({ fresh: true })) !== null) {
    if (await handleIsFree(FALLBACK_HANDLE, STORE1)) {
      const [res] = await pool().query<ResultSetHeader>("UPDATE stores SET handle = ?, address_version = address_version + 1 WHERE id = ? AND handle = ?", [FALLBACK_HANDLE, STORE1, handle]);
      if (res.affectedRows === 1) r.handle = { from: handle, to: FALLBACK_HANDLE };
    } else console.error(`[convert] store #1's handle has a problem and "${FALLBACK_HANDLE}" is taken; the owner renames it with the free rename`);
    invalidateStore(STORE1);
  }
  await checkpoint("handle");
}

/** Step 3b/3c: `settings.ai` → `store_ai`, `settings.home` → `stores.home_page_id`. */
async function aiAndHome(r: ConvertResult, checkpoint: (unit: string) => Promise<void>): Promise<void> {
  const ai = await legacySetting("ai");
  if (ai !== null) {
    const legacy = AiSettings.safeParse(ai);
    if (legacy.success) {
      const value = { mode: "auto", localEnabled: legacy.data.enabled, tier: legacy.data.tier, bgRemoval: legacy.data.bgRemoval };
      if (StoreAi.safeParse(value).success && (await insertStoreRow("store_ai", value))) r.moved.push("store_ai");
    } else console.warn("[convert] the legacy ai setting is invalid; store_ai keeps its defaults");
  }
  await checkpoint("store_ai");

  const home = await legacySetting("home");
  const pageId = isObj(home) && typeof home.pageId === "string" && ULID_RE.test(home.pageId) ? home.pageId : null;
  if (pageId) {
    const [res] = await pool().query<ResultSetHeader>(
      "UPDATE stores SET home_page_id = ? WHERE id = ? AND home_page_id IS NULL AND EXISTS (SELECT 1 FROM pages WHERE id = ? AND store_id = ?)",
      [pageId, STORE1, pageId, STORE1],
    );
    if (res.affectedRows === 1) r.moved.push("home");
    invalidateStore(STORE1);
  }
  await checkpoint("home");
}

const TOKEN_KEY = { meta: "metaTokens", tiktok: "tiktokTokens" } as const;
const CODE_KEY = { meta: "metaTestCodes", tiktok: "tiktokTestCodes" } as const;
const LEGACY_TOKEN = { meta: "metaCapiToken", tiktok: "tiktokToken" } as const;
const LEGACY_CODE = { meta: "metaTestEventCode", tiktok: "tiktokTestEventCode" } as const;

type TrackingSecrets = Awaited<ReturnType<typeof getStoreSetting<"tracking_secrets">>>;
type SecretMapKey = (typeof TOKEN_KEY)[PixelPlatformServer] | (typeof CODE_KEY)[PixelPlatformServer];
type PixelPlatformServer = keyof typeof TOKEN_KEY;

/**
 * The legacy token and test code copied to every library id of their platform without its own (pure): the patch of
 * the per-id maps, the counts, and the ids that received a token (their pixel health starts unverified).
 */
function copyLegacySecrets(
  secrets: TrackingSecrets,
  entries: readonly PixelLibraryEntry[],
): { patch: Partial<Record<SecretMapKey, Record<string, string>>>; tokensCopied: number; testCodesDeactivated: number; copied: { platform: PixelPlatform; id: string }[] } {
  const patch: Partial<Record<SecretMapKey, Record<string, string>>> = {};
  let tokensCopied = 0;
  let testCodesDeactivated = 0;
  const copied: { platform: PixelPlatform; id: string }[] = [];
  for (const platform of SERVER_PLATFORMS) {
    const tokens = { ...(secrets[TOKEN_KEY[platform]] ?? {}) } as Record<string, string>;
    const codes = { ...(secrets[CODE_KEY[platform]] ?? {}) } as Record<string, string>;
    const legacyToken = secrets[LEGACY_TOKEN[platform]];
    const legacyCode = secrets[LEGACY_CODE[platform]];
    for (const e of entries) {
      if (e.platform !== platform) continue;
      if (!tokens[e.id] && legacyToken) {
        tokens[e.id] = legacyToken;
        tokensCopied++;
        copied.push({ platform, id: e.id });
      }
      if (!codes[e.id] && legacyCode) {
        codes[e.id] = legacyCode;
        testCodesDeactivated++;
      } else if (codes[e.id]) testCodesDeactivated++;
    }
    patch[TOKEN_KEY[platform]] = tokens;
    patch[CODE_KEY[platform]] = codes;
  }
  return { patch, tokensCopied, testCodesDeactivated, copied };
}

/**
 * Step 3d: the pixel library migration (docs/OFFERS.md §A.6) for store #1 only, the same rules as
 * src/lib/pixels/migrate.server.ts over this store's rows: ids from the legacy `pixels` key first, then every draft,
 * publish version and non-revoked export; legacy tokens copied to the ids without their own, legacy test codes kept
 * with no window; pixel_health, tracking_secrets, then pixel_library LAST (its row is this step's marker).
 */
async function migratePixels(scope: WriteScope, r: ConvertResult, checkpoint: (unit: string) => Promise<void>): Promise<void> {
  const [lib] = await pool().query<RowDataPacket[]>("SELECT 1 FROM store_settings WHERE store_id = ? AND `key` = 'pixel_library'", [STORE1]);
  if (lib.length) return;

  const tracking = (col: string) => `JSON_EXTRACT(${col}, '$.tracking')`;
  const [[drafts], [versions], [exps]] = await Promise.all([
    pool().query<RowDataPacket[]>(`SELECT p.name, ${tracking("p.draft")} AS tracking FROM pages p WHERE p.store_id = ? ORDER BY p.id`, [STORE1]),
    pool().query<RowDataPacket[]>(
      `SELECT p.name, ${tracking("v.doc")} AS tracking FROM page_versions v JOIN pages p ON p.id = v.page_id AND p.store_id = v.store_id
        WHERE v.store_id = ? AND v.kind = 'publish' ORDER BY v.id`,
      [STORE1],
    ),
    pool().query<RowDataPacket[]>(
      `SELECT p.name, ${tracking("v.doc")} AS tracking FROM exports e
         JOIN page_versions v ON v.id = e.version_id AND v.store_id = e.store_id
         JOIN pages p ON p.id = e.page_id AND p.store_id = e.store_id
        WHERE e.store_id = ? AND e.revoked_at IS NULL ORDER BY e.id`,
      [STORE1],
    ),
  ]);
  const storePixels = Tracking.safeParse(await legacySetting("pixels"));
  const secrets = await getStoreSetting(scope, "tracking_secrets", { fresh: true });
  const sources = [...drafts, ...versions, ...exps].map((row) => {
    const t = parseJson(row.tracking);
    return { pageName: String(row.name), tracking: isObj(t) ? t : null };
  });
  const collected = collectPixels(storePixels.success ? (storePixels.data as Json) : {}, sources);

  const at = new Date().toISOString();
  const storeSeen: Record<PixelPlatform, number> = { meta: 0, tiktok: 0, snap: 0, ga4: 0 };
  const entries: PixelLibraryEntry[] = collected.map((p) => ({
    platform: p.platform,
    id: p.id,
    label: migrationLabel(p, p.store ? storeSeen[p.platform]++ : 0),
    addedAt: at,
    tests: [],
  }));

  const planned = copyLegacySecrets(secrets, entries);

  // health before the secrets: a rerun after the secrets were written finds no token left to copy, so it would
  // never write the health of the ids an interrupted run copied tokens to. Both writes merge under the row lock
  // (updateStoreSetting): the process serves requests meanwhile, and an order's pixel health or an owner's CAPI token
  // written since the read above must survive
  if (planned.copied.length) {
    const added: Record<string, PixelHealthEntry> = {};
    for (const c of planned.copied) added[pixelKey(c.platform, c.id)] = { at, state: "unverified", testMode: false };
    await updateStoreSetting(scope, "pixel_health", added, SYSTEM);
    await checkpoint("pixels:health");
  }
  let tokensCopied = planned.tokensCopied;
  let testCodesDeactivated = planned.testCodesDeactivated;
  if (tokensCopied || testCodesDeactivated) {
    await updateStoreSetting(
      scope,
      "tracking_secrets",
      (current) => {
        // the same copy on the value under the lock: only the maps' missing ids are filled, every other field and id kept
        const locked = copyLegacySecrets(current, entries);
        tokensCopied = locked.tokensCopied;
        testCodesDeactivated = locked.testCodesDeactivated;
        return locked.patch;
      },
      SYSTEM,
    );
    await checkpoint("pixels:secrets");
  }
  // the marker of this step; a pixel the owner added since the check above is kept after the migrated ones
  await updateStoreSetting(
    scope,
    "pixel_library",
    (current) => ({ v: 1 as const, pixels: [...entries, ...current.pixels.filter((p) => !entries.some((e) => e.platform === p.platform && e.id === p.id))] }),
    SYSTEM,
  );
  await audit("pixels.library_migrated", { meta: { entries: entries.length, tokensCopied, testCodesDeactivated }, scope: { storeId: STORE1, actorKind: "system" } });
  r.pixels = { ran: true, entries: entries.length, tokensCopied, testCodesDeactivated };
}

/** The asset ids of a stored document that are assets of store #1 (the editor's extractor). */
function docAssetIds(raw: unknown, owned: ReadonlySet<string>): string[] {
  const { doc } = validateDoc(parseJson(raw));
  return doc ? collectAssetIds(doc).filter((id) => owned.has(id)) : [];
}

/**
 * One owner's `asset_refs` rows replaced in one transaction (§G.5's statement pair). `idsOf` reads the owner's
 * document on the transaction's connection (a page draft or the brand row with FOR UPDATE), so an editor save that
 * lands while the conversion runs is either seen or waits: the refs never go back to an older draft.
 */
async function replaceRefs(ownerKind: "page" | "page_version" | "brand", ownerId: string, idsOf: (conn: PoolConnection) => Promise<readonly string[]>, live: boolean): Promise<number> {
  const conn = await pool().getConnection();
  try {
    await conn.beginTransaction();
    const ids = await idsOf(conn);
    await conn.query("DELETE FROM asset_refs WHERE store_id = ? AND owner_kind = ? AND owner_id = ?", [STORE1, ownerKind, ownerId]);
    if (ids.length) {
      await conn.query("INSERT IGNORE INTO asset_refs (store_id, asset_id, owner_kind, owner_id, live, updated_at) VALUES ?", [
        ids.map((id) => [STORE1, id, ownerKind, ownerId, live, new Date()]),
      ]);
    }
    await conn.commit();
    return ids.length;
  } catch (err) {
    await conn.rollback().catch(() => undefined);
    throw err;
  } finally {
    conn.release();
  }
}

/** Step 4: asset_refs, then the gauges. */
async function refsAndGauges(scope: WriteScope, r: ConvertResult, checkpoint: (unit: string) => Promise<void>): Promise<void> {
  const [assetRows] = await pool().query<RowDataPacket[]>("SELECT id FROM assets WHERE store_id = ?", [STORE1]);
  const owned = new Set(assetRows.map((a) => String(a.id)));
  const [pageRows] = await pool().query<RowDataPacket[]>("SELECT id FROM pages WHERE store_id = ? ORDER BY id", [STORE1]);
  for (const page of pageRows) {
    const pageId = String(page.id);
    const live: { versionId: string | null } = { versionId: null };
    r.assetRefs += await replaceRefs(
      "page",
      pageId,
      async (conn) => {
        const [[row]] = await conn.query<RowDataPacket[]>("SELECT draft, published_version_id FROM pages WHERE store_id = ? AND id = ? FOR UPDATE", [STORE1, pageId]);
        live.versionId = row?.published_version_id ? String(row.published_version_id) : null;
        return row ? docAssetIds(row.draft, owned) : [];
      },
      false,
    );
    if (live.versionId) {
      // a publish version never changes: a plain read
      const [[version]] = await pool().query<RowDataPacket[]>("SELECT id, doc FROM page_versions WHERE store_id = ? AND id = ?", [STORE1, live.versionId]);
      if (version) r.assetRefs += await replaceRefs("page_version", String(version.id), async () => docAssetIds(version.doc, owned), true);
    }
    await checkpoint(`refs:${pageId}`);
  }
  const brandLogo = async (conn: PoolConnection): Promise<string[]> => {
    const [[row]] = await conn.query<RowDataPacket[]>("SELECT value, encrypted FROM store_settings WHERE store_id = ? AND `key` = 'brand' FOR UPDATE", [STORE1]);
    const value = row && !row.encrypted ? parseJson(row.value) : null;
    const logo = isObj(value) && isObj(value.logo) && typeof value.logo.primary === "string" ? value.logo.primary : null;
    return logo && owned.has(logo) ? [logo] : [];
  };
  const brand = await storeRow("brand");
  const logo = isObj(brand?.value.logo) && typeof brand.value.logo.primary === "string" ? brand.value.logo.primary : null;
  if (logo && owned.has(logo)) r.assetRefs += await replaceRefs("brand", "brand", brandLogo, true);

  const gauges = await recomputeStoreGauges(scope);
  for (const [k, v] of Object.entries(gauges)) r.gauges[k] = v.after;
  await checkpoint("gauges");
}

/* ------------------------------------------------------------------ */
/* The task                                                            */
/* ------------------------------------------------------------------ */

/** The store #1 conversion (§D.8). Call under withBootLock; throws ConversionError when it stopped on purpose. */
export async function convertLegacyStore(opts: ConvertOptions = {}): Promise<ConvertResult> {
  const started = Date.now();
  const checkpoint = async (unit: string) => {
    if (opts.checkpoint) await opts.checkpoint(unit);
  };
  const r: ConvertResult = {
    status: "already",
    resealed: 0,
    plain: 0,
    moved: [],
    handle: null,
    pixels: { ran: false, entries: 0, tokensCopied: 0, testCodesDeactivated: 0 },
    assetRefs: 0,
    gauges: {},
    deleted: 0,
    ms: 0,
  };
  const done = () => ({ ...r, ms: Date.now() - started });

  if (await getPlatformSetting("tenancy_v1", { fresh: true })) return done();
  // tenancy: platform the store #1 row (P* root)
  const [store1] = await pool().query<RowDataPacket[]>("SELECT id FROM stores WHERE id = ?", [STORE1]);
  if (!store1.length) {
    await setPlatformSetting("tenancy_v1", { v: 1, at: new Date().toISOString(), store1: false, freeRename: false }, SYSTEM);
    r.status = "empty";
    return done();
  }

  const scope = systemScope(systemCtx("tenancy.convert"), STORE1);
  try {
    await catchUpS4();
    await checkpoint("s4");
    await reseal(r, checkpoint);
    await storeFacts(r, checkpoint);
    await aiAndHome(r, checkpoint);
    await migratePixels(scope, r, checkpoint);
    await checkpoint("pixels");
    await refsAndGauges(scope, r, checkpoint);

    // step 5: the moved keys leave `settings`, the marker last
    // tenancy: platform the legacy single-tenant rows (§D.8 step 5)
    const [del] = await pool().query<ResultSetHeader>("DELETE FROM settings WHERE `key` IN (?)", [MOVED_KEYS]);
    r.deleted = del.affectedRows;
    invalidateSettings();
    await checkpoint("delete");
    await setPlatformSetting("tenancy_v1", { v: 1, at: new Date().toISOString(), store1: true, freeRename: true }, SYSTEM);
  } catch (err) {
    if (!(err instanceof ConversionError) && !opts.checkpoint) console.error("[convert] store #1 conversion interrupted:", errorSummary(err));
    throw err;
  } finally {
    invalidateStore(STORE1);
  }
  r.status = "converted";
  const result = done();
  await audit("store.created", {
    target: STORE1,
    meta: { source: "tenancy_v1", resealed: r.resealed, moved: r.moved, handleReplaced: !!r.handle, pixels: r.pixels.entries, assetRefs: r.assetRefs },
    scope: { storeId: STORE1, actorKind: "system" },
  });
  return result;
}
