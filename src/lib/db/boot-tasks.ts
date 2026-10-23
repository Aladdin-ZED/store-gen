import "server-only";
/**
 * One-time boot tasks of Offers v2 (docs/OFFERS.md §I.1, §I.3), run from src/instrumentation.ts:
 *
 *  - syncPublishedChecksums(): under withBootLock, marker setting `doc_schema` = 2. Each page's
 *    published version gets checksum = checksumOf(validateDoc(doc).doc): the version rows keep their
 *    v1 JSON forever, but drafts are now compared in their v2 form, so live pages must not show
 *    "unpublished changes" after the upgrade. Only the checksum column changes; idempotent.
 *  - bootUpgradeCheck(): the read-only dry run (./upgrade-check.ts) once, non-blocking, `[upgrade-check]`.
 */
import { createHash } from "node:crypto";
import { eq, isNotNull } from "drizzle-orm";
import mysql from "mysql2/promise";
import { db } from "@/lib/db/client";
import { pages, pageVersions, settings } from "@/lib/db/schema";
import { validateDoc } from "@/lib/page/validate";
import { runUpgradeCheck, upgradeCheckOk, upgradeCheckSummary } from "./upgrade-check";
import { databaseUrl as normalizeDatabaseUrl } from "@/lib/db/url";

/** The document schema the stored checksums are computed on. */
export const DOC_SCHEMA = 2;
const MARKER = "doc_schema";

const checksumOf = (doc: unknown) => createHash("sha256").update(JSON.stringify(doc), "utf8").digest("hex");

export async function syncPublishedChecksums(): Promise<{ skipped: boolean; pages: number; updated: number }> {
  const [marker] = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, MARKER)).limit(1);
  if (typeof marker?.value === "number" && marker.value >= DOC_SCHEMA) return { skipped: true, pages: 0, updated: 0 };

  const live = await db.select({ id: pages.id, versionId: pages.publishedVersionId }).from(pages).where(isNotNull(pages.publishedVersionId));
  let updated = 0;
  for (const p of live) {
    const [v] = await db.select({ doc: pageVersions.doc, checksum: pageVersions.checksum }).from(pageVersions).where(eq(pageVersions.id, p.versionId!)).limit(1);
    if (!v) continue;
    const { doc } = validateDoc(v.doc);
    if (!doc) continue;
    const checksum = checksumOf(doc);
    if (checksum === v.checksum) continue;
    await db.update(pageVersions).set({ checksum }).where(eq(pageVersions.id, p.versionId!));
    updated++;
  }
  // the marker is written last: an interrupted run starts over on the next boot
  await db
    .insert(settings)
    .values({ key: MARKER, value: DOC_SCHEMA, encrypted: false, updatedAt: new Date() })
    .onDuplicateKeyUpdate({ set: { value: DOC_SCHEMA, updatedAt: new Date() } });
  return { skipped: false, pages: live.length, updated };
}

/** The upgrade dry run over the live database: read-only, logs only (never blocks or fails the boot). */
export async function bootUpgradeCheck(databaseUrl: string | undefined = normalizeDatabaseUrl()): Promise<void> {
  if (!databaseUrl) return;
  const conn = await mysql.createConnection({ uri: databaseUrl, charset: "utf8mb4_unicode_ci", timezone: "Z", connectTimeout: 10_000 });
  try {
    const started = Date.now();
    const report = await runUpgradeCheck(conn);
    const ok = upgradeCheckOk(report);
    const lines = upgradeCheckSummary(report);
    const log = ok ? console.info : console.error;
    log(`[upgrade-check] ${ok ? "OK" : "PROBLEMS FOUND"} in ${Date.now() - started} ms`);
    for (const line of lines) log(`[upgrade-check] ${line}`);
  } finally {
    await conn.end().catch(() => undefined);
  }
}
