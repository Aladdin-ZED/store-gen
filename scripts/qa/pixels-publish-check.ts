/**
 * Per-page pixels against a real MariaDB (docs/OFFERS.md §A.3, §A.4, §A.6). Exit code 1 on failure.
 *
 *   DATABASE_URL=mysql://root@127.0.0.1:3531/cod_px APP_SECRET=<random 64 hex> \
 *     node --import tsx scripts/qa/pixels-publish-check.ts   (npm run test:pixels-publish; NOT with
 *     --conditions=react-server: next/navigation then loads React without createContext)
 *
 * Refuses to run unless the database name starts with "cod_px" or "cod_test" (it empties tables).
 *  - migration: raw scan of drafts (archived too), publish versions and non-revoked exports; store
 *    ids first; legacy token copied to ids without their own, legacy test codes copied with no
 *    window, legacy fields kept, health "unverified"; pages untouched; idempotent; boot lock
 *  - library rule: an editor can't publish an id the library doesn't know; an owner's joins it
 *  - audit "page.pixels_changed" (masked ids, mode publish / pixels_only)
 *  - publishTrackingOnly: only tracking differs from the previous live doc, "Pixels only" version,
 *    live_changed on a stale base, the draft's tracking follows (compare-and-swap), other draft
 *    edits kept
 *  - restoreVersion keeps the current tracking (opt-in restores it); duplicate sets copiedFrom
 *  - usage counts, Delete refused while used, test windows need a saved code and a live pixel
 */
import Module from "node:module";
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

const url = process.env.DATABASE_URL ?? "";
const dbName = /\/([^/?]+)(\?|$)/.exec(url)?.[1] ?? "";
if (!/^cod_(px|test)/.test(dbName)) {
  console.error(`✗ refusing to run on database "${dbName || "(none)"}" — use a throwaway cod_px* database`);
  process.exit(1);
}

let pass = 0;
const failures: string[] = [];
const ok = (label: string, cond: boolean, info?: unknown) => {
  if (cond) pass++;
  else failures.push(`${label}${info === undefined ? "" : `\n    ${JSON.stringify(info)}`}`);
};
const eq2 = (label: string, got: unknown, want: unknown) => ok(label, JSON.stringify(got) === JSON.stringify(want), { got, want });

const META_A = "111111111111111";
const META_B = "222222222222222";
const META_X = "999999999999999";
const TT_1 = "CTESTPIXEL0000000001";
const SNAP = "1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d";
const GA4 = "G-TEST1234";

async function main() {
  const { runMigrations } = await import("@/lib/db/migrate");
  await runMigrations();
  const { db } = await import("@/lib/db/client");
  const { auditLog, exportsTable, pages, pageVersions, settings, users } = await import("@/lib/db/schema");
  const { newId, newPublicKey } = await import("@/lib/db/ids");
  const { getFixture } = await import("@/lib/page/fixtures");
  const { validateDoc } = await import("@/lib/page/validate");
  const { invalidateSettings, getSetting, setSetting } = await import("@/lib/settings");
  const { withBootLock } = await import("@/lib/db/boot-lock");
  const { migratePixelLibrary } = await import("@/lib/pixels/migrate.server");
  const { PublishError, publishPage, publishTrackingOnly } = await import("@/lib/render/publish.server");
  const { removePixelEntry, startPixelTest, PixelError, getLibrary } = await import("@/lib/pixels/library.server");
  const { pixelUsage, invalidatePixelUsage, usageCount } = await import("@/lib/pixels/usage.server");
  const { restoreVersion, duplicateAsPage } = await import("@/lib/editor/pages.server");
  const { duplicatePage } = await import("@/lib/admin-data/pages");
  const { trackingRefs } = await import("@/lib/pixels/library");

  // empty test tables (throwaway database only)
  for (const t of ["audit_log", "exports", "page_versions", "pages", "settings", "users"]) await db.execute(sql.raw(`DELETE FROM \`${t}\``));
  invalidateSettings();
  invalidatePixelUsage();

  const owner = { id: newId(), email: "owner@px.test", name: "Owner", role: "owner" as const };
  const editor = { id: newId(), email: "editor@px.test", name: "Editor", role: "editor" as const };
  for (const u of [owner, editor]) await db.insert(users).values({ ...u, passwordHash: "x" });
  const session = (u: typeof owner | typeof editor) => ({ ...u, totpEnabled: false, sessionId: "s", platformRole: "none" as const, locale: null, lastStoreId: null });

  const fx = getFixture("massage");
  const base = validateDoc(fx.doc).doc!;
  const docWith = (tracking: Record<string, unknown>, patch: Record<string, unknown> = {}) => validateDoc({ ...base, ...patch, tracking }).doc!;
  const insertPage = async (name: string, slug: string, draft: unknown, status: "draft" | "published" | "archived" = "draft") => {
    const id = newId();
    await db.insert(pages).values({ id, slug, name, status, locale: "fr", publicKey: newPublicKey(), draft: draft as never, updatedAt: new Date(Date.now() - 60_000) });
    return id;
  };
  const insertVersion = async (pageId: string, doc: unknown, kind: "publish" | "save" = "publish") => {
    const id = newId();
    await db.insert(pageVersions).values({ id, pageId, kind, label: null, doc: doc as never, checksum: "0".repeat(64), createdBy: owner.id, createdAt: new Date(Date.now() - 30_000) });
    return id;
  };

  /* ---------------- migration ---------------- */
  await setSetting("pixels", { metaPixelId: [META_B] });
  await setSetting("tracking_secrets", { metaCapiToken: "legacyMetaToken123", metaTestEventCode: "TEST111", tiktokToken: "legacyTikTok99", metaTokens: { [META_B]: "ownTokenBBBB2222" } });
  const pA = await insertPage("Argan", "argan", docWith({ metaPixelId: [META_A] }), "published");
  const vA = await insertVersion(pA, docWith({ metaPixelId: [META_A], snapPixelId: [SNAP] }));
  await db.update(pages).set({ publishedVersionId: vA }).where(eq(pages.id, pA));
  const pArchived = await insertPage("Old page", "old", { ...docWith({}), tracking: { tiktokPixelId: [TT_1] } }, "archived");
  const pExp = await insertPage("Exported", "exported", docWith({}));
  const vExp = await insertVersion(pExp, docWith({ ga4Id: [GA4] }), "save");
  await db.insert(exportsTable).values({ id: newId(), pageId: pExp, versionId: vExp, mode: "connected", publicKey: newPublicKey(), allowedOrigins: [] });
  const draftsBefore = await db.select({ id: pages.id, draft: pages.draft, updatedAt: pages.updatedAt }).from(pages);

  const held = await Promise.all([withBootLock(() => migratePixelLibrary()), withBootLock(() => migratePixelLibrary(), { timeoutSec: 0 })]);
  ok("boot lock: one process runs, the other skips", held.filter((r) => r.ran).length >= 1, held);
  invalidateSettings();
  const lib = await getLibrary();
  eq2("migration: store id first, then by usage (drafts incl. archived, publish versions, exports)", lib.pixels.map((p) => `${p.platform}:${p.id}`), [`meta:${META_B}`, `meta:${META_A}`, `tiktok:${TT_1}`, `snap:${SNAP}`, `ga4:${GA4}`]);
  ok("migration: every id collected (no cap)", [META_A, META_B, SNAP, TT_1, GA4].every((id) => lib.pixels.some((p) => p.id === id)), lib.pixels);
  eq2("migration: store label", lib.pixels[0]!.label, "Pixel principal");
  ok("migration: other labels name the first page", lib.pixels.find((p) => p.id === META_A)?.label === "Argan · ••••1111" && lib.pixels.find((p) => p.id === TT_1)?.label === "Old page · ••••0001", lib.pixels);
  const secrets = await getSetting("tracking_secrets", { fresh: true });
  eq2("migration: legacy token copied to ids without their own", [secrets.metaTokens[META_A], secrets.metaTokens[META_B], secrets.tiktokTokens[TT_1]], ["legacyMetaToken123", "ownTokenBBBB2222", "legacyTikTok99"]);
  eq2("migration: legacy test codes copied per id, legacy fields kept", [secrets.metaTestCodes[META_A], secrets.metaTestCodes[META_B], secrets.metaCapiToken, secrets.metaTestEventCode], ["TEST111", "TEST111", "legacyMetaToken123", "TEST111"]);
  ok("migration: no test window active (production events stop being test-coded)", lib.pixels.every((p) => p.tests.length === 0));
  const health = await getSetting("pixel_health", { fresh: true });
  ok("migration: copied tokens are unverified", health[`meta:${META_A}`]?.state === "unverified" && health[`tiktok:${TT_1}`]?.state === "unverified" && !health[`meta:${META_B}`], health);
  const draftsAfter = await db.select({ id: pages.id, draft: pages.draft, updatedAt: pages.updatedAt }).from(pages);
  ok("migration: pages untouched", JSON.stringify(draftsAfter) === JSON.stringify(draftsBefore));
  const again = await migratePixelLibrary();
  ok("migration: idempotent (marker = library row)", !again.ran);
  const migAudit = await db.select().from(auditLog).where(eq(auditLog.action, "pixels.library_migrated"));
  ok("migration: audited once", migAudit.length === 1, migAudit);
  void pArchived;

  /* ---------------- library rule + audit ---------------- */
  const pB = await insertPage("Duo", "duo-px", docWith({ metaPixelId: [META_X] }));
  let refused = "";
  try {
    await publishPage(pB, editor.id);
  } catch (e) {
    refused = e instanceof PublishError ? e.code : String(e);
  }
  eq2("library rule: editor refused for an unknown id", refused, "pixel_not_in_library");
  const pub = await publishPage(pB, owner.id);
  ok("library rule: owner publishes", !!pub.versionId);
  invalidateSettings();
  const lib2 = await getLibrary();
  ok("library rule: owner's unknown id joins the library with label \"\"", lib2.pixels.some((p) => p.id === META_X && p.label === ""), lib2.pixels);
  const changed = await db.select().from(auditLog).where(and(eq(auditLog.action, "page.pixels_changed"), eq(auditLog.target, pB))).orderBy(desc(auditLog.id));
  eq2("audit page.pixels_changed (masked, mode publish)", changed[0]?.meta, { added: ["meta:••••9999"], removed: [], mode: "publish" });
  ok("audit never holds a full id", !JSON.stringify(changed).includes(META_X));
  const editorOk = await publishPage(pB, editor.id).then(() => true, () => false);
  ok("library rule: editor publishes ids the library knows", editorOk);

  /* ---------------- pixels-only live update ---------------- */
  const [rowB] = await db.select().from(pages).where(eq(pages.id, pB));
  const liveBefore = (await db.select().from(pageVersions).where(eq(pageVersions.id, rowB!.publishedVersionId!)))[0]!;
  // the draft gets other edits + other pixels; only the pixels go live
  const draftEdit = docWith({ metaPixelId: [META_A, META_B] }, { product: { ...base.product, name: "Nom en cours d'édition" } });
  await db.update(pages).set({ draft: draftEdit, updatedAt: new Date() }).where(eq(pages.id, pB));
  let stale = "";
  try {
    await publishTrackingOnly(pB, owner.id, { metaPixelId: [META_A] }, newId());
  } catch (e) {
    stale = e instanceof PublishError ? e.code : String(e);
  }
  eq2("pixels-only: stale base → live_changed", stale, "live_changed");
  const t0 = (await db.select({ updatedAt: pages.updatedAt }).from(pages).where(eq(pages.id, pB)))[0]!.updatedAt.getTime();
  const res = await publishTrackingOnly(pB, owner.id, { metaPixelId: [META_A, META_B] }, liveBefore.id);
  const [rowB2] = await db.select().from(pages).where(eq(pages.id, pB));
  const liveAfter = (await db.select().from(pageVersions).where(eq(pageVersions.id, rowB2!.publishedVersionId!)))[0]!;
  eq2("pixels-only: version row labelled", [liveAfter.kind, liveAfter.label, rowB2!.publishedVersionId === res.versionId], ["publish", "Pixels only", true]);
  const strip = (d: unknown) => JSON.stringify({ ...(validateDoc(d).doc as object), tracking: null });
  ok("pixels-only: only tracking differs from the previous live doc", strip(liveAfter.doc) === strip(liveBefore.doc));
  eq2("pixels-only: new live ids", trackingRefs(liveAfter.doc.tracking as Record<string, unknown>).map((r) => r.id), [META_A, META_B]);
  ok("pixels-only: the live doc keeps its product name (draft edits stay unpublished)", liveAfter.doc.product.name === liveBefore.doc.product.name);
  ok("pixels-only: draft already matched → its stamp is untouched", !res.draftUpdated && rowB2!.updatedAt.getTime() === t0, res);
  const audits2 = await db.select().from(auditLog).where(and(eq(auditLog.action, "page.pixels_changed"), eq(auditLog.target, pB))).orderBy(desc(auditLog.id));
  eq2("audit pixels_only", audits2[0]?.meta, { added: ["meta:••••1111", "meta:••••2222"], removed: ["meta:••••9999"], mode: "pixels_only" });
  // a draft with other pixels follows the live update; its other edits are kept
  const res2 = await publishTrackingOnly(pB, owner.id, { metaPixelId: [META_A] }, res.versionId);
  const [rowB3] = await db.select().from(pages).where(eq(pages.id, pB));
  ok("pixels-only: draft tracking patched (CAS), other edits kept", res2.draftUpdated && JSON.stringify(rowB3!.draft.tracking) === JSON.stringify({ metaPixelId: [META_A] }) && rowB3!.draft.product.name === "Nom en cours d'édition", { res2, t: rowB3!.draft.tracking });
  let notLive = "";
  try {
    await publishTrackingOnly(pExp, owner.id, {}, newId());
  } catch (e) {
    notLive = e instanceof PublishError ? e.code : String(e);
  }
  eq2("pixels-only: page not live → not_live", notLive, "not_live");

  /* ---------------- restore keeps tracking; duplicate sets copiedFrom ---------------- */
  const pR = await insertPage("Restore me", "restore-me", docWith({ tiktokPixelId: [TT_1] }));
  const vOld = await insertVersion(pR, docWith({ metaPixelId: [META_A] }, { product: { ...base.product, name: "Ancienne version" } }), "save");
  const stampR = (await db.select({ u: pages.updatedAt }).from(pages).where(eq(pages.id, pR)))[0]!.u.getTime();
  const r1 = await restoreVersion(session(owner), { pageId: pR, versionId: vOld, baseUpdatedAt: stampR });
  ok("restore: content restored, current pixels kept", r1.doc.product.name === "Ancienne version" && JSON.stringify(r1.doc.tracking) === JSON.stringify({ tiktokPixelId: [TT_1] }), r1.doc.tracking);
  const r2 = await restoreVersion(session(owner), { pageId: pR, versionId: vOld, baseUpdatedAt: r1.updatedAt, pixels: true });
  ok("restore: opt-in restores its pixels", JSON.stringify(r2.doc.tracking) === JSON.stringify({ metaPixelId: [META_A] }), r2.doc.tracking);
  const dup = await duplicatePage(pA, { id: owner.id, ip: null });
  const [dupRow] = await db.select().from(pages).where(eq(pages.id, dup!.id));
  ok("duplicate: same ids, copiedFrom = source page", JSON.stringify(dupRow!.draft.tracking) === JSON.stringify({ metaPixelId: [META_A], copiedFrom: "Argan" }), dupRow!.draft.tracking);
  const dup2 = await duplicateAsPage(session(owner), { pageId: pR });
  const [dup2Row] = await db.select().from(pages).where(eq(pages.id, dup2.id));
  eq2("builder duplicate: copiedFrom too", dup2Row!.draft.tracking.copiedFrom, "Restore me");
  const pNone = await insertPage("Organic", "organic", docWith({ none: true }));
  const dup3 = await duplicatePage(pNone, { id: owner.id, ip: null });
  const [dup3Row] = await db.select().from(pages).where(eq(pages.id, dup3!.id));
  eq2("duplicate without ids: answer kept, no copiedFrom", dup3Row!.draft.tracking, { none: true });

  /* ---------------- usage, delete, test windows ---------------- */
  invalidatePixelUsage();
  const usage = await pixelUsage({ fresh: true });
  eq2("usage: META_A on drafts + live", usageCount(usage.get(`meta:${META_A}`)), { pages: 5, live: 2, exports: 0, drafts: 5 });
  eq2("usage: GA4 only via an export", usageCount(usage.get(`ga4:${GA4}`)), { pages: 0, live: 0, exports: 1, drafts: 0 });
  let inUse = "";
  try {
    await removePixelEntry({ platform: "ga4", id: GA4 }, { id: owner.id });
  } catch (e) {
    inUse = e instanceof PixelError ? e.code : String(e);
  }
  eq2("delete refused while an export uses it", inUse, "pixel_in_use");
  let noCode = "";
  try {
    await startPixelTest({ pageId: pB, platform: "tiktok", id: TT_1, minutes: 30 }, { id: owner.id });
  } catch (e) {
    noCode = e instanceof PixelError ? e.code : String(e);
  }
  eq2("test window needs a saved test code", noCode, "no_test_code");
  let notOnLive = "";
  try {
    await startPixelTest({ pageId: pR, platform: "meta", id: META_A, minutes: 30 }, { id: owner.id });
  } catch (e) {
    notOnLive = e instanceof PixelError ? e.code : String(e);
  }
  eq2("test window needs the pixel on the live page", notOnLive, "not_live");
  const w = await startPixelTest({ pageId: pB, platform: "meta", id: META_A, minutes: 60 }, { id: owner.id });
  invalidateSettings();
  const lib3 = await getLibrary();
  ok("test window stored for this page only", lib3.pixels.find((p) => p.id === META_A)?.tests.length === 1 && lib3.pixels.find((p) => p.id === META_A)?.tests[0]?.pageId === pB && Date.parse(w.until) - Date.now() > 59 * 60_000);

  await db.select().from(settings).limit(1);
  for (const f of failures) console.log(`✗ ${f}`);
  console.log(failures.length ? `✗ ${failures.length} failure(s), ${pass} passed` : `✓ pixels publish check passed (${pass} assertions)`);
  process.exit(failures.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
