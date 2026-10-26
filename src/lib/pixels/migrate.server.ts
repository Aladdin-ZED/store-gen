import "server-only";
/**
 * One-time pixel library migration (docs/OFFERS.md §A.6) — idempotent. Marker: the store's
 * `pixel_library` row in `store_settings`, written LAST, so a crash midway simply runs again.
 *
 * Store #1 only (docs/STORE-SAAS.md §D.8 step 3, PIX-07): the R1.0 conversion task runs it once for the
 * legacy store, reading the legacy platform-level `pixels` key; a new store starts with an empty library
 * and never runs it.
 *
 *  1. ids from raw JSON (`$.tracking` + pixelIdList, no PageDoc parse): the legacy `pixels` setting
 *     first, then every page draft of the store (archived included), every publish version and every
 *     non-revoked export's version; ordered by usage count. No cap.
 *  2. labels: legacy store ids "Pixel principal", "Pixel 2"…; others "{first page name} · ••••4321".
 *  3. secrets: each Meta/TikTok id without its own token gets the legacy single token; legacy test
 *     codes are copied into the per-id maps with NO active window (production events stop being
 *     test-coded); legacy fields are kept (rollback). Health of every copied token = unverified.
 *  4. tracking_secrets, pixel_health, then pixel_library; audit "pixels.library_migrated" in the store.
 * Pages are not modified.
 */
import { and, eq, isNull, sql } from "drizzle-orm";
import { auditIn } from "@/lib/admin-data/store-audit";
import { LEGACY_STORE_ID } from "@/lib/admin-data/legacy-store";
import { db } from "@/lib/db/client";
import { exportsTable, pages, pageVersions, storeSettings } from "@/lib/db/schema";
import { systemCtx, systemScope } from "@/lib/jobs/scope";
import { getSetting, getStoreSetting, setStoreSetting, type SettingsActor } from "@/lib/settings";
import type { PixelHealth, PixelLibraryEntry } from "@/lib/settings/schemas";
import { getStoreById } from "@/lib/tenancy/public";
import { inStore, whereStore } from "@/lib/tenancy/sql";
import type { Actor, StoreScope, WriteScope } from "@/lib/tenancy/types";
import { getPixelHealth } from "./health.server";
import { SERVER_PLATFORMS, type PixelPlatform } from "./ids";
import { pixelKey, type PixelLibrary } from "./library";
import { collectPixels, migrationLabel } from "./migrate";

export { collectPixels, migrationLabel };

const TOKEN_KEY = { meta: "metaTokens", tiktok: "tiktokTokens" } as const;
const CODE_KEY = { meta: "metaTestCodes", tiktok: "tiktokTestCodes" } as const;
const LEGACY_TOKEN = { meta: "metaCapiToken", tiktok: "tiktokToken" } as const;
const LEGACY_CODE = { meta: "metaTestEventCode", tiktok: "tiktokTestEventCode" } as const;

const SYSTEM: SettingsActor = { id: "system", ip: null };
const SYSTEM_ACTOR: Actor = { kind: "system", userId: null, impersonatorId: null, ip: null };

export interface MigrationResult {
  ran: boolean;
  entries: number;
  tokensCopied: number;
  testCodesDeactivated: number;
}

const NOT_RUN: MigrationResult = { ran: false, entries: 0, tokensCopied: 0, testCodesDeactivated: 0 };

function parse(raw: unknown): Record<string, unknown> | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "object") return raw as Record<string, unknown>;
  try {
    const v = JSON.parse(String(raw)) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** True once the store's library exists (the marker). */
export async function libraryMigrated(scope: StoreScope): Promise<boolean> {
  const rows = await db
    .select({ key: storeSettings.key })
    .from(storeSettings)
    .where(and(inStore(storeSettings, scope), eq(storeSettings.key, "pixel_library")))
    .limit(1);
  return rows.length > 0;
}

/**
 * Build the store's library from its pages and the legacy store pixels (`legacyPixels`: the value of the
 * legacy platform `pixels` key, which the conversion task passes before it deletes the key; read from the
 * legacy settings row when omitted). Never touches pages; does nothing once the store has a library.
 */
export async function migratePixelLibrary(scope: WriteScope, opts?: { legacyPixels?: unknown }): Promise<MigrationResult>;
/** @deprecated today's boot call (store #1); the R1.0 conversion task calls the scoped form instead (T1, CCR r1.0-t4-4) */
export async function migratePixelLibrary(): Promise<MigrationResult>;
export async function migratePixelLibrary(scopeArg?: WriteScope, opts: { legacyPixels?: unknown } = {}): Promise<MigrationResult> {
  let scope = scopeArg;
  if (!scope) {
    // the legacy boot task: store #1 only, and only once the 0004 conversion made it (an empty install has none)
    if (!(await getStoreById(LEGACY_STORE_ID))) return NOT_RUN;
    scope = systemScope(systemCtx("pixels.library_migrate"), LEGACY_STORE_ID);
  }
  if (await libraryMigrated(scope)) return NOT_RUN;

  const tracking = (col: typeof pages.draft | typeof pageVersions.doc) => sql<string | null>`JSON_EXTRACT(${col}, '$.tracking')`;
  const [drafts, versions, exps, legacyPixels, secrets] = await Promise.all([
    db.select({ name: pages.name, tracking: tracking(pages.draft) }).from(pages).where(inStore(pages, scope)),
    db
      .select({ name: pages.name, tracking: tracking(pageVersions.doc) })
      .from(pageVersions)
      .innerJoin(pages, and(eq(pages.id, pageVersions.pageId), inStore(pages, scope)))
      .where(whereStore(pageVersions, scope, eq(pageVersions.kind, "publish"))),
    db
      .select({ name: pages.name, tracking: tracking(pageVersions.doc) })
      .from(exportsTable)
      .innerJoin(pageVersions, and(eq(pageVersions.id, exportsTable.versionId), inStore(pageVersions, scope)))
      .innerJoin(pages, and(eq(pages.id, exportsTable.pageId), inStore(pages, scope)))
      .where(whereStore(exportsTable, scope, isNull(exportsTable.revokedAt))),
    "legacyPixels" in opts ? Promise.resolve(opts.legacyPixels) : getSetting("pixels", { fresh: true }),
    getStoreSetting(scope, "tracking_secrets", { fresh: true }),
  ]);
  const sources = [...drafts, ...versions, ...exps].map((r) => ({ pageName: r.name, tracking: parse(r.tracking) }));
  const collected = collectPixels((parse(legacyPixels) ?? {}) as Record<string, unknown>, sources);

  const at = new Date().toISOString();
  const storeSeen: Record<PixelPlatform, number> = { meta: 0, tiktok: 0, snap: 0, ga4: 0 };
  const entries: PixelLibraryEntry[] = collected.map((p) => ({
    platform: p.platform,
    id: p.id,
    label: migrationLabel(p, p.store ? storeSeen[p.platform]++ : 0),
    addedAt: at,
    tests: [],
  }));

  // secrets: legacy single token → every id without its own; legacy test code → per-id code, no window
  const next = { ...secrets };
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
    next[TOKEN_KEY[platform]] = tokens;
    next[CODE_KEY[platform]] = codes;
  }

  if (tokensCopied || testCodesDeactivated) await setStoreSetting(scope, "tracking_secrets", next, SYSTEM);
  if (copied.length) {
    const health: PixelHealth = { ...(await getPixelHealth(scope)) };
    for (const c of copied) health[pixelKey(c.platform, c.id)] = { at, state: "unverified", testMode: false };
    await setStoreSetting(scope, "pixel_health", health, SYSTEM);
  }
  const library: PixelLibrary = { v: 1, pixels: entries };
  await setStoreSetting(scope, "pixel_library", library, SYSTEM);
  await auditIn(scope, SYSTEM_ACTOR, "pixels.library_migrated", { meta: { entries: entries.length, tokensCopied, testCodesDeactivated } });
  return { ran: true, entries: entries.length, tokensCopied, testCodesDeactivated };
}
