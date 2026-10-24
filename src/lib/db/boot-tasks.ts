import "server-only";
/**
 * One-time and idempotent boot tasks (docs/STORE-SAAS.md §H.4, §D.8; docs/OFFERS.md §I.1, §I.3), run from
 * src/instrumentation.ts after the migrations:
 *
 *   const r = await runBootTasks();     // step 5: under withBootLock, in one process; { ran, steps }
 *   if (r.ran) await runBootChecks();   // step 6: the read-only [upgrade-check] and [tenancy-check] lines
 *
 * Step 5, in order, each task isolated (one failing never skips the next) and logged:
 *  - syncPublishedChecksums(): marker platform setting `doc_schema` = 2. Each store's published landing versions
 *    get checksum = checksumOf(validateDoc(doc).doc): the version rows keep their v1 JSON forever, but drafts are
 *    compared in their v2 form, so live pages must not show "unpublished changes" after the upgrade. Store by
 *    store through its system scope; only the checksum column changes. Store docs (kind ≠ landing) are validated as
 *    StorePageDoc from R2 (STO-R3), so they are skipped here.
 *  - convertLegacyStore() (src/lib/tenancy/convert.server.ts): the store #1 conversion, marker `tenancy_v1`; the
 *    pixel library migration runs only inside it (PIX-07).
 *  - seedProtectedBrands(): the brand deny list of src/lib/platform/data/protected-brands.ts, INSERT IGNORE (a term
 *    staff disabled stays disabled, nothing is deleted), marker-free.
 *  - seedFlags(): the release / ops / experiment flags declared in src/lib/flags/registry.ts, INSERT IGNORE (console
 *    edits are never overwritten), undeclared ones marked `archived`, never deleted; the kill switches are 0004's.
 *  - not yet: the legal templates (P1's src/lib/platform/data/legal, CCR r1.0-t1-3) and syncPromptVersions (P7,
 *    R1 product) join this list with their files.
 * Step 6 never writes: bootUpgradeCheck() (Offers v2 dry run) and bootTenancyCheck() (./upgrade-check.ts).
 */
import { createHash } from "node:crypto";
import { and, asc, eq, inArray, isNotNull, ne, notInArray } from "drizzle-orm";
import mysql from "mysql2/promise";
import { db } from "@/lib/db/client";
import { flags, pages, pageVersions, protectedBrands, stores } from "@/lib/db/schema";
import { FLAG_DEFS } from "@/lib/flags/registry";
import { systemCtx, systemScope } from "@/lib/jobs/scope";
import { errorSummary } from "@/lib/orders/log";
import { validateDoc } from "@/lib/page/validate";
import { PROTECTED_BRANDS } from "@/lib/platform/data/protected-brands";
import { getPlatformSetting, setPlatformSetting, type PlatformActor } from "@/lib/settings";
import { byId, whereStore } from "@/lib/tenancy/sql";
import { withBootLock } from "./boot-lock";
import { newId } from "./ids";
import { runTenancyCheck, runUpgradeCheck, tenancyCheckOk, tenancyCheckSummary, upgradeCheckOk, upgradeCheckSummary } from "./upgrade-check";
import { databaseUrl as normalizeDatabaseUrl } from "./url";

/** The document schema the stored checksums are computed on. */
export const DOC_SCHEMA = 2;
const SYSTEM: PlatformActor = { id: "system", kind: "system" };

const checksumOf = (doc: unknown) => createHash("sha256").update(JSON.stringify(doc), "utf8").digest("hex");

export async function syncPublishedChecksums(): Promise<{ skipped: boolean; stores: number; pages: number; updated: number }> {
  if ((await getPlatformSetting("doc_schema", { fresh: true })) >= DOC_SCHEMA) return { skipped: true, stores: 0, pages: 0, updated: 0 };

  const ctx = systemCtx("boot.checksums");
  // tenancy: platform boot task over every store (§H.4); each store's rows are read through its system scope
  const all = await db.select({ id: stores.id }).from(stores).orderBy(asc(stores.id));
  let total = 0;
  let updated = 0;
  for (const store of all) {
    const scope = systemScope(ctx, store.id);
    const live = await db
      .select({ versionId: pages.publishedVersionId })
      .from(pages)
      .where(whereStore(pages, scope, isNotNull(pages.publishedVersionId), eq(pages.kind, "landing")));
    total += live.length;
    for (const p of live) {
      const [v] = await db.select({ doc: pageVersions.doc, checksum: pageVersions.checksum }).from(pageVersions).where(byId(pageVersions, scope, p.versionId!)).limit(1);
      if (!v) continue;
      const { doc } = validateDoc(v.doc);
      if (!doc) continue;
      const checksum = checksumOf(doc);
      if (checksum === v.checksum) continue;
      await db.update(pageVersions).set({ checksum }).where(byId(pageVersions, scope, p.versionId!));
      updated++;
    }
  }
  // the marker is written last: an interrupted run starts over on the next boot
  await setPlatformSetting("doc_schema", DOC_SCHEMA, SYSTEM);
  return { skipped: false, stores: all.length, pages: total, updated };
}

/** The seeded brand deny list (§C.7, D76), INSERT IGNORE on the term. Returns the rows added. */
export async function seedProtectedBrands(): Promise<number> {
  if (!PROTECTED_BRANDS.length) return 0;
  // tenancy: platform protected_brands is a P table (§D.3)
  const [res] = await db
    .insert(protectedBrands)
    .ignore()
    .values(PROTECTED_BRANDS.map((b) => ({ id: newId(), term: b.term, kind: b.kind, match: b.match, active: true, note: b.note ?? null })));
  const { loadHandleLists } = await import("./store-handles");
  await loadHandleLists({ fresh: true });
  return res.affectedRows;
}

/** The declared release / ops / experiment flags (§D.4, PLA-§12.2): inserted once, undeclared ones archived. */
export async function seedFlags(): Promise<{ inserted: number; archived: number; restored: number }> {
  const keys = FLAG_DEFS.map((f) => f.key);
  let inserted = 0;
  // tenancy: platform flags is a P table (§D.3)
  if (FLAG_DEFS.length) {
    const [res] = await db
      .insert(flags)
      .ignore()
      .values(FLAG_DEFS.map((f) => ({ key: f.key, kind: f.kind, type: f.type, description: f.description, defaultValue: f.default, ownerTrack: f.ownerTrack, archived: false })));
    inserted = res.affectedRows;
  }
  const [restored] = keys.length ? await db.update(flags).set({ archived: false }).where(and(inArray(flags.key, keys), eq(flags.archived, true))) : [{ affectedRows: 0 }];
  const [archived] = await db
    .update(flags)
    .set({ archived: true })
    .where(and(ne(flags.kind, "kill"), eq(flags.archived, false), keys.length ? notInArray(flags.key, keys) : undefined));
  if (inserted || restored.affectedRows || archived.affectedRows) {
    const { invalidateFlags } = await import("@/lib/tenancy/entitlements");
    invalidateFlags();
  }
  return { inserted, archived: archived.affectedRows, restored: restored.affectedRows };
}

/* ------------------------------------------------------------------ */
/* The boot sequence (§H.4 steps 5 and 6)                              */
/* ------------------------------------------------------------------ */

export interface BootStep {
  name: string;
  ok: boolean;
  ms: number;
  /** the logged line (counts only) or the error summary */
  detail: string | null;
}

/**
 * Step 5 of §H.4 in the process that gets the boot lock (`{ ran: false }` in the others, which skip it). Each task
 * is isolated and logged; never throws.
 */
export async function runBootTasks(opts: { lockTimeoutSec?: number } = {}): Promise<{ ran: boolean; steps: BootStep[] }> {
  try {
    const res = await withBootLock(async () => {
      const steps: BootStep[] = [];
      const step = async (name: string, fn: () => Promise<string | null>) => {
        const started = Date.now();
        try {
          const detail = await fn();
          steps.push({ name, ok: true, ms: Date.now() - started, detail });
          if (detail) console.info(`[boot] ${detail}`);
        } catch (err) {
          const { ConversionError } = await import("@/lib/tenancy/convert.server");
          const detail = err instanceof ConversionError ? err.message : errorSummary(err);
          steps.push({ name, ok: false, ms: Date.now() - started, detail });
          console.error(`[boot] ${name} failed:`, detail);
        }
      };
      await step("published checksums", async () => {
        const r = await syncPublishedChecksums();
        return r.skipped ? null : `published checksums in the v2 document form: ${r.updated} of ${r.pages} updated (${r.stores} store(s)).`;
      });
      await step("store #1 conversion", async () => {
        const { convertLegacyStore } = await import("@/lib/tenancy/convert.server");
        const r = await convertLegacyStore();
        if (r.status === "already") return null;
        if (r.status === "empty") return "tenancy: empty install, no store #1 to convert (marker written).";
        const px = r.pixels.ran ? `, pixel library ${r.pixels.entries} pixel(s) / ${r.pixels.tokensCopied} token(s) copied` : "";
        const handle = r.handle ? `, handle "${r.handle.from}" replaced by "${r.handle.to}"` : "";
        return `tenancy: store #1 converted in ${r.ms} ms: ${r.resealed} envelope(s) re-sealed, moved ${r.moved.join(", ") || "nothing"}${handle}${px}, ${r.assetRefs} asset ref(s), ${r.deleted} legacy row(s) removed.`;
      });
      await step("protected brands", async () => {
        const n = await seedProtectedBrands();
        return n ? `protected brands: ${n} term(s) added.` : null;
      });
      await step("flags", async () => {
        const r = await seedFlags();
        return r.inserted || r.archived || r.restored ? `flags: ${r.inserted} added, ${r.archived} archived, ${r.restored} restored.` : null;
      });
      return steps;
    }, { timeoutSec: opts.lockTimeoutSec });
    return res.ran ? { ran: true, steps: res.value } : { ran: false, steps: [] };
  } catch (err) {
    console.error("[boot] one-time tasks failed:", errorSummary(err));
    return { ran: false, steps: [] };
  }
}

/** Step 6 of §H.4: the read-only checks, logged, never blocking or failing the boot. */
export async function runBootChecks(): Promise<void> {
  await bootUpgradeCheck().catch((err) => console.error("[upgrade-check] failed:", errorSummary(err)));
  await bootTenancyCheck().catch((err) => console.error("[tenancy-check] failed:", errorSummary(err)));
}

async function withReadConnection<T>(databaseUrl: string, fn: (conn: mysql.Connection) => Promise<T>): Promise<T> {
  const conn = await mysql.createConnection({ uri: databaseUrl, charset: "utf8mb4_unicode_ci", timezone: "Z", connectTimeout: 10_000 });
  try {
    return await fn(conn);
  } finally {
    await conn.end().catch(() => undefined);
  }
}

/** The upgrade dry run over the live database: read-only, logs only (never blocks or fails the boot). */
export async function bootUpgradeCheck(databaseUrl: string | undefined = normalizeDatabaseUrl()): Promise<void> {
  if (!databaseUrl) return;
  await withReadConnection(databaseUrl, async (conn) => {
    const started = Date.now();
    const report = await runUpgradeCheck(conn);
    const ok = upgradeCheckOk(report);
    const log = ok ? console.info : console.error;
    log(`[upgrade-check] ${ok ? "OK" : "PROBLEMS FOUND"} in ${Date.now() - started} ms`);
    for (const line of upgradeCheckSummary(report)) log(`[upgrade-check] ${line}`);
  });
}

/** The tenancy dry run over the live database (§D.8): read-only, logs only. */
export async function bootTenancyCheck(databaseUrl: string | undefined = normalizeDatabaseUrl()): Promise<void> {
  if (!databaseUrl) return;
  await withReadConnection(databaseUrl, async (conn) => {
    const started = Date.now();
    const report = await runTenancyCheck(conn);
    const ok = tenancyCheckOk(report);
    const log = ok ? console.info : console.error;
    log(`[tenancy-check] ${ok ? "OK" : "PROBLEMS FOUND"} in ${Date.now() - started} ms`);
    for (const line of tenancyCheckSummary(report)) log(`[tenancy-check] ${line}`);
  });
}
