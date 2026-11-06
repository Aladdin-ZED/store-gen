/**
 * `test:design-db` (P6 DESIGN; design.md DES-§25.2, DES-§22, DES-§9.8, DES-§2.2): the design track's checks against
 * a real MariaDB. Step 7 starts it with the headline rows:
 *
 *  - syncShingles: one (niche, owner tag) set of ≤ 256 rows from the store's live pages, no store id anywhere, the
 *    product name masked, idempotent; an unpublished page leaves the sketch at the next sync;
 *  - containment: B's live headline is `close` for A when A writes the same skeleton over another product name, a
 *    distinct line is `ok`;
 *  - the share band: over 10 other owners a band, over 9 `null`;
 *  - the answer shape: `{ verdict, band }` per line, never an owner tag, a count or a number;
 *  - the rate limit: the action's `design:headlines` bucket refuses call 61;
 *  - purge: `purgeHeadlineShingles` leaves 0 rows for the store's owner tag.
 *
 * Step 9 adds the DG-05 rows (the novelty service and the genome repository, DES-§25.2):
 *  - a seeded pool of 3 stores: the platform, niche and own bands and the clone flag; a store's own rows never count;
 *    a newcomer's row never counts against the incumbent's page (first come keeps its design, QUAL-19);
 *  - τ_niche at n = 10 / 50 / 150 stores: 0.40 / 0.3625 / 0.30;
 *  - the answer shape is identical whatever the pool, with no store id, number or vector; `design:novelty` refuses
 *    call 61 (publish is never limited); the kill switch answers ok;
 *  - nicheShares: 9 stores → empty, 10 % steps over 10 stores, the hourly watermark, the differencing test (10 stores,
 *    one publish, 20 polls across the refresh: ≥ 2 values per gene stay consistent with the observations);
 *  - the exhaustion test: deterministic over two runs, a clearing variant when one exists, "exhausted" in a saturated
 *    niche;
 *  - the repository: the publish flip (previous live row reserved 30 days, first_published_at from the page), release,
 *    the 600-row cap (oldest non-live first), the generation record ≤ 600 B, own reads scoped to the store.
 *
 *   npm run test:design-db [-- --db cod_test_p6_design] [--keep]
 *
 * Creates a throwaway database on the local MariaDB (root, no password, 127.0.0.1:3306; the name must be cod_test_*),
 * migrates it, seeds it and drops it at the end (unless --keep). A fresh APP_SECRET; nothing is read from .env files.
 */
import Module from "node:module";
import { randomBytes } from "node:crypto";

// the modules under test are marked `import "server-only"`; outside Next that import throws
{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = require.resolve("drizzle-orm");
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    return req === "server-only" ? stub : orig.call(this, req, ...rest);
  };
}

const flag = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const dbName = flag("db") ?? "cod_test_p6_design";
const KEEP = process.argv.includes("--keep");
if (!/^cod_test_[a-z0-9_]{1,48}$/.test(dbName)) {
  console.error(`✗ refusing to run on database "${dbName}": use a throwaway cod_test_* name`);
  process.exit(1);
}
const DB_SERVER = "mysql://root@127.0.0.1:3306";
{
  const env = process.env as Record<string, string | undefined>;
  for (const k of ["PUBLIC_URL", "STORE_ROOT_DOMAIN", "EDGE_KEY", "ADMIN_HOST", "LEGACY_PLATFORM_HOSTS"]) delete env[k];
  env.DATABASE_URL = `${DB_SERVER}/${dbName}`;
  env.APP_SECRET = randomBytes(32).toString("hex");
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

let pass = 0;
const failures: string[] = [];
const ok = (label: string, cond: boolean, info?: unknown) => {
  if (cond) pass++;
  else failures.push(`${label}${info === undefined ? "" : `\n    ${JSON.stringify(info).slice(0, 400)}`}`);
};

const load = <T>(id: string): T => Module.createRequire(__filename)(id) as T;
const STORE_A = "00000000000000000000000001";
const STORE_B = "00000000000000000000000002";

async function main() {
  await rootQuery(`DROP DATABASE IF EXISTS \`${dbName}\``);
  await rootQuery(`CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  const { runMigrations } = load<typeof import("@/lib/db/migrate")>("@/lib/db/migrate");
  await runMigrations();
  const { db } = load<typeof import("@/lib/db/client")>("@/lib/db/client");
  const { sql, eq } = load<typeof import("drizzle-orm")>("drizzle-orm");
  const { headlineShingles, pages, pageVersions, stores } = load<typeof import("@/lib/db/schema")>("@/lib/db/schema");
  const { newId, newPublicKey } = load<typeof import("@/lib/db/ids")>("@/lib/db/ids");
  const { getFixture } = load<typeof import("@/lib/page/fixtures")>("@/lib/page/fixtures");
  const { systemCtx, systemScope } = load<typeof import("@/lib/jobs/scope")>("@/lib/jobs/scope");
  const { rateLimit, storeBucket } = load<typeof import("@/lib/security/rate-limit")>("@/lib/security/rate-limit");
  const H = load<typeof import("@/lib/design/headlines.server")>("@/lib/design/headlines.server");

  for (const t of ["headline_shingles", "page_versions", "pages", "rate_limits"]) await db.execute(sql.raw(`DELETE FROM \`${t}\``));
  await db.execute(sql.raw("DELETE FROM `stores`"));
  for (const [id, handle] of [
    [STORE_A, "store-a"],
    [STORE_B, "store-b"],
  ] as const)
    await db.insert(stores).values({ id, handle, name: handle, status: "active", brandSeed: "0123456789abcdef", category: "skincare" });

  const ctx = systemCtx("qa.design_db");
  const A = systemScope(ctx, STORE_A);
  const B = systemScope(ctx, STORE_B);
  const NICHE = "MA:skincare";
  const base = getFixture("massage").doc;

  /** Publish a doc for a store with its hero title and lead replaced. */
  const publish = async (storeId: string, name: string, title: string, lead: string) => {
    const doc = structuredClone(base);
    doc.product = { ...doc.product, name };
    const hero = doc.sections.find((s) => s.type === "hero")!;
    hero.data = { ...hero.data, title, subtitle: lead };
    const pageId = newId();
    const versionId = newId();
    await db.insert(pages).values({ storeId, id: pageId, slug: `p-${pageId.slice(-8).toLowerCase()}`, name, status: "published", locale: doc.locale, publicKey: newPublicKey(), draft: doc as never, publishedVersionId: versionId });
    await db.insert(pageVersions).values({ storeId, id: versionId, pageId, kind: "publish", label: null, doc: doc as never, checksum: "0".repeat(64) });
    return pageId;
  };

  // --- syncShingles ---
  const titleB = "Huile d'argan, pressée à froid. Vous payez à la réception.";
  const leadB = "Huile d'argan : flacon de 50 ml, 100 % pure. Vous payez à la réception.";
  const pageB = await publish(STORE_B, "Huile d'argan", titleB, leadB);
  const nB = await H.syncShingles(B, NICHE);
  const rowsB = await db.select().from(headlineShingles).where(eq(headlineShingles.ownerTag, H.ownerTagFor(STORE_B)));
  ok("sync writes ≤ 256 rows of one (niche, owner)", nB > 0 && nB <= 256 && rowsB.length === nB && rowsB.every((r) => r.nicheKey === NICHE && /^[0-9a-f]{16}$/.test(r.hash)), { nB, rows: rowsB.length });
  ok("the table has no store id and the tag is not the id", !Object.keys(rowsB[0] ?? {}).some((k) => /store/i.test(k)) && rowsB.every((r) => r.ownerTag !== STORE_B && !r.ownerTag.includes(STORE_B.slice(-6))));
  ok("titles and leads keep their kind", rowsB.some((r) => r.kind === "title") && rowsB.some((r) => r.kind === "lead"));
  const again = await H.syncShingles(B, NICHE);
  const rowsB2 = await db.select().from(headlineShingles).where(eq(headlineShingles.ownerTag, H.ownerTagFor(STORE_B)));
  ok("sync is idempotent (one DELETE, one insert)", again === nB && rowsB2.length === nB && rowsB2.map((r) => r.hash).sort().join() === rowsB.map((r) => r.hash).sort().join());
  ok("another niche is not touched", (await H.syncShingles(B, "MA:kitchen")) === 0 && (await db.select().from(headlineShingles)).every((r) => r.nicheKey === NICHE));
  // a sketch bigger than 256 keeps the bottom 256
  for (let i = 0; i < 12; i++) await publish(STORE_B, "Huile d'argan", `Titre numéro ${i} avec des mots différents pour la page ${i} et encore plus de mots ${i}`, `Une description longue ${i} qui parle du flacon, du tissu, du parfum et de la livraison ${i} partout`);
  const big = await H.syncShingles(B, NICHE);
  ok("the bottom 256 of a larger union", big === 256, { big });

  // --- containment ---
  const close = await H.checkHeadlineNovelty(A, NICHE, ["{product}, pressée à froid. Vous payez à la réception.", "Bougie au bois de cèdre, coulée à la main."]);
  ok("the same skeleton over another name is close, a distinct line ok", close[0]?.verdict === "close" && close[1]?.verdict === "ok", close);
  ok("one verdict per line, never more", close.length === 2);
  const own = await H.checkHeadlineNovelty(B, NICHE, [titleB]);
  ok("a store's own rows never count", own[0]?.verdict === "ok", own);

  // --- the share band: 10 owners → a band, 9 → null ---
  await db.delete(headlineShingles);
  const line = "Pressée à froid, flacon de 50 ml, origine Agadir.";
  const { shingles } = load<typeof import("@/lib/design/text/shingles")>("@/lib/design/text/shingles");
  const hashes = shingles(line, "fr").map((s) => H.shingleHash(NICHE, s));
  const seedOwners = async (n: number, holding: number) => {
    await db.delete(headlineShingles);
    for (let i = 0; i < n; i++) {
      const tag = H.ownerTagFor(`fake-owner-${i}`);
      const rows = i < holding ? hashes.map((hash) => ({ nicheKey: NICHE, hash, ownerTag: tag, kind: "title" as const })) : [{ nicheKey: NICHE, hash: H.shingleHash(NICHE, `other ${i}`), ownerTag: tag, kind: "title" as const }];
      await db.insert(headlineShingles).values(rows);
    }
  };
  await seedOwners(10, 3);
  const ten = await H.checkHeadlineNovelty(A, NICHE, [line]);
  ok("10 owners: a band (3 of 10 hold it → high)", ten[0]?.band === "high" && ten[0]?.verdict === "close", ten);
  await seedOwners(10, 1);
  ok("10 owners, 1 holds it → low", (await H.checkHeadlineNovelty(A, NICHE, [line]))[0]?.band === "low");
  await seedOwners(10, 2);
  ok("10 owners, 2 hold it → mid", (await H.checkHeadlineNovelty(A, NICHE, [line]))[0]?.band === "mid");
  await seedOwners(9, 9);
  const nine = await H.checkHeadlineNovelty(A, NICHE, [line]);
  ok("9 owners: no band", nine[0]?.band === null && nine[0]?.verdict === "close", nine);

  // --- the answer shape: never a number, an owner or a count ---
  const answers = [...ten, ...nine, ...close, ...own];
  ok("answers carry exactly { verdict, band }", answers.every((a) => Object.keys(a).sort().join() === "band,verdict"));
  ok("no digit, no owner tag in any answer", !/\d/.test(JSON.stringify(answers)) && !JSON.stringify(answers).includes(H.ownerTagFor("fake-owner-0")));
  ok("a bad niche answers ok / null without a query", (await H.checkHeadlineNovelty(A, "skincare' OR 1=1", [line]))[0]?.band === null);

  // --- the rate limit: the action's bucket refuses call 61 ---
  let refusedAt = 0;
  for (let i = 1; i <= 61; i++) {
    const r = await rateLimit(storeBucket(A, H.HEADLINE_RATE.name), H.HEADLINE_RATE.limit, H.HEADLINE_RATE.windowSec);
    if (!r.ok && !refusedAt) refusedAt = i;
  }
  ok("design:headlines refuses call 61", refusedAt === 61, { refusedAt });
  ok("B's bucket is its own", (await rateLimit(storeBucket(B, H.HEADLINE_RATE.name), H.HEADLINE_RATE.limit, H.HEADLINE_RATE.windowSec)).ok);

  // --- unpublish and purge ---
  await db.delete(headlineShingles);
  await H.syncShingles(B, NICHE);
  await db.update(pages).set({ status: "draft" }).where(eq(pages.storeId, STORE_B));
  ok("an unpublished store's sketch empties at the next sync", (await H.syncShingles(B, NICHE)) === 0);
  await db.update(pages).set({ status: "published" }).where(eq(pages.id, pageB));
  await H.syncShingles(B, NICHE);
  await H.purgeHeadlineShingles(B);
  ok("purge leaves 0 rows for the owner tag", (await db.select().from(headlineShingles).where(eq(headlineShingles.ownerTag, H.ownerTagFor(STORE_B)))).length === 0);

  await noveltyChecks();

  console.log(`design-db: ${pass} passed, ${failures.length} failed`);
  for (const f of failures) console.log(`  ✗ ${f}`);
}

/* ------------------------------------------------------------------ */
/* step 9: the novelty service and the genome repository (DG-05)       */
/* ------------------------------------------------------------------ */

async function noveltyChecks() {
  const { db } = load<typeof import("@/lib/db/client")>("@/lib/db/client");
  const { sql, eq, and } = load<typeof import("drizzle-orm")>("drizzle-orm");
  const { designGenomes, pages, pageVersions, stores, rateLimits, settings } = load<typeof import("@/lib/db/schema")>("@/lib/db/schema");
  const { newId, newPublicKey } = load<typeof import("@/lib/db/ids")>("@/lib/db/ids");
  const { systemCtx, systemScope } = load<typeof import("@/lib/jobs/scope")>("@/lib/jobs/scope");
  const Nv = load<typeof import("@/lib/design/novelty.server")>("@/lib/design/novelty.server");
  const G = load<typeof import("@/lib/design/genomes.server")>("@/lib/design/genomes.server");
  const Pl = load<typeof import("@/lib/design/pool")>("@/lib/design/pool");
  const D = load<typeof import("@/lib/design/distance")>("@/lib/design/distance");
  const { randomView } = load<typeof import("@/lib/design/selftest-genome")>("@/lib/design/selftest-genome");
  const { mulberry32 } = load<typeof import("@/lib/theme/rng")>("@/lib/theme/rng");
  const { directionsOf } = load<typeof import("@/lib/design/fixtures/prepublish")>("@/lib/design/fixtures/prepublish");
  const { genomeOf } = load<typeof import("@/lib/design/derive")>("@/lib/design/derive");
  const { textFieldsOf } = load<typeof import("@/lib/render/origin")>("@/lib/render/origin");
  const { generationRecordFor } = load<typeof import("@/lib/render/prepublish")>("@/lib/render/prepublish");
  const { invalidatePlatformSettings } = load<typeof import("@/lib/settings")>("@/lib/settings");
  type View = import("@/lib/design/distance").DistanceView;

  for (const t of ["design_genomes", "page_versions", "pages", "rate_limits", "headline_shingles"]) await db.execute(sql.raw(`DELETE FROM \`${t}\``));
  await db.execute(sql.raw("DELETE FROM `stores`"));
  const ids = Array.from({ length: 160 }, (_, i) => String(i + 1).padStart(26, "0"));
  for (let i = 0; i < ids.length; i += 40)
    await db.insert(stores).values(ids.slice(i, i + 40).map((id, k) => ({ id, handle: `nv-${i + k}`, name: `nv ${i + k}`, status: "active" as const, brandSeed: "0123456789abcdef", category: "skincare" })));
  const ctx = systemCtx("qa.design_db");
  const scopeOf = (i: number) => systemScope(ctx, ids[i]!);
  const [A, B, C] = [scopeOf(0), scopeOf(1), scopeOf(2)];
  const rng = mulberry32(905);
  const stored = (v: View) => D.unpackView(D.packView(v));
  const CHEAP = ["base", "ladder", "mask", "depth", "button", "emphasis", "glyph", "motion", "density", "align"] as const;
  const shift = (v: View, n: number): View => {
    const out = { ...v, cat: { ...v.cat } };
    for (let i = 0; i < n; i++) out.cat[CHEAP[i]!] += 1;
    return stored(out);
  };
  let rowSeq = 0;
  const putRow = async (storeId: string, niche: string, view: View, o: { fpa?: Date | null; pool?: boolean; live?: boolean; source?: "published" | "generated" | "chosen"; devices?: number; pageId?: string } = {}) => {
    const now = new Date(Date.now() + rowSeq++);
    await db.insert(designGenomes).values({
      id: newId(),
      storeId,
      pageId: o.pageId ?? newId(),
      versionId: null,
      kind: "page",
      source: o.source ?? "published",
      niche,
      bucket: Pl.bucketKey(niche, view),
      genomeV: 1,
      vec: D.packView(view, o.devices),
      genome: { v: 1, s: 1, b: {}, p: {}, x: [] },
      seed: 1,
      priorsV: "p1",
      firstPublishedAt: o.fpa === undefined ? new Date(now.getTime() - 86_400_000) : o.fpa,
      live: o.live ?? true,
      pool: o.pool ?? true,
      createdAt: now,
      updatedAt: now,
    });
  };
  const fresh = () => Nv.resetNoveltyPool();
  const NICHE = "MA:skincare";

  // --- a seeded pool of 3 stores: bands and the clone flag ---
  const vB = stored(randomView(rng));
  let vC = stored(randomView(rng));
  for (let k = 0; vC && D.genomeDistance(vB, vC) < 0.5 && k < 50; k++) vC = stored(randomView(rng));
  await putRow(ids[1]!, NICHE, vB);
  await putRow(ids[2]!, NICHE, vC);
  await putRow(ids[1]!, NICHE, shift(vB, 3), { pool: false, live: false, source: "generated" });
  fresh();
  let farView = stored(randomView(rng));
  for (let k = 0; (D.genomeDistance(farView, vB) < 0.5 || D.genomeDistance(farView, vC) < 0.5) && k < 200; k++) farView = stored(randomView(rng));
  const verdicts = await Nv.checkNovelty(A, { niche: NICHE, candidates: [{ key: "same", view: vB }, { key: "tau", view: shift(vB, 10) }, { key: "far", view: farView }] }, "wizard");
  const byKey = Object.fromEntries(verdicts.map((v) => [v.key, v]));
  ok("identical to B's live page: too_close on both bands and a clone", byKey.same?.platform === "too_close" && byKey.same?.niche === "too_close" && byKey.same?.clone === true, byKey.same);
  ok("ten 1-weight genes from B (d = 0.25): platform close, niche too_close (τ 0.40 at n = 3), no clone", byKey.tau?.platform === "close" && byKey.tau?.niche === "too_close" && byKey.tau?.clone === false, byKey.tau);
  ok("a distant candidate: ok, ok, no clone", byKey.far?.platform === "ok" && byKey.far?.niche === "ok" && !byKey.far?.clone, byKey.far);
  ok("no own pages: own = first", verdicts.every((v) => v.own === "first"));
  const other = await Nv.checkNovelty(A, { niche: "MA:kitchen", candidates: [{ key: "same", view: vB }] }, "wizard");
  ok("another niche: platform too_close, niche ok, no clone (the bucket is the niche's)", other[0]?.platform === "too_close" && other[0]?.niche === "ok" && other[0]?.clone === false, other);
  const own = await Nv.checkNovelty(B, { niche: NICHE, candidates: [{ key: "mine", view: vB }] }, "wizard");
  ok("a store's own pool rows never count against it (its generated row is not in the pool)", own[0]?.platform === "ok" && own[0]?.niche === "ok" && !own[0]?.clone, own);

  // own pages: hard on the same product's last 5 published pages, only close across products
  const docA = directionsOf("argan", "fr", 3)[0]!.doc;
  const pageOf = async (storeId: string, name: string, fpa: Date | null) => {
    const doc = structuredClone(docA);
    doc.product = { ...doc.product, name };
    const pageId = newId();
    const versionId = newId();
    await db.insert(pages).values({ storeId, id: pageId, slug: `p-${pageId.slice(-8).toLowerCase()}`, name, status: "published", locale: doc.locale, publicKey: newPublicKey(), draft: doc as never, publishedVersionId: versionId, firstPublishedAt: fpa });
    await db.insert(pageVersions).values({ storeId, id: versionId, pageId, kind: "publish", label: null, doc: doc as never, checksum: "0".repeat(64) });
    return { pageId, versionId, doc };
  };
  const g0 = genomeOf(docA);
  const vA = stored(D.distanceView(g0, { theme: docA.theme }, docA.locale));
  const p1 = await pageOf(ids[0]!, "Huile d'argan", new Date(Date.now() - 5 * 86_400_000));
  await G.recordPublished(A, { pageId: p1.pageId, versionId: p1.versionId, niche: "MA:general", genome: g0, view: vA, tells: ["ghost"] });
  const p2 = await pageOf(ids[0]!, "Huile d'argan", null);
  const p3 = await pageOf(ids[0]!, "Savon noir", null);
  const sameProduct = await Nv.checkNovelty(A, { niche: "MA:general", pageId: p2.pageId, candidates: [{ key: "copy", view: vA }] }, "wizard");
  const otherProduct = await Nv.checkNovelty(A, { niche: "MA:general", pageId: p3.pageId, candidates: [{ key: "copy", view: vA }] }, "wizard");
  ok("N2: a near-copy of the same product's published page is own too_close", sameProduct[0]?.own === "too_close", sameProduct);
  ok("N2 by product: a near-copy for another product is only close (the pages_close note)", otherProduct[0]?.own === "close", otherProduct);
  ok("a page is never compared with its own rows", (await Nv.checkNovelty(A, { niche: "MA:general", pageId: p1.pageId, candidates: [{ key: "self", view: vA }] }, "wizard"))[0]?.own === "first");
  const ownRows = await G.ownRecent(A);
  ok("own reads are scoped: A sees only its page, tagged with its product", ownRows.length === 1 && ownRows[0]?.pageId === p1.pageId && ownRows[0]?.product === "n:huile d argan", ownRows.map((r) => [r.pageId, r.product]));
  ok("B's own reads never see A's rows", (await G.ownRecent(B)).every((r) => ![p1.pageId, p2.pageId, p3.pageId].includes(r.pageId)));

  // first come keeps its design (QUAL-19): B's later page never counts against A's older live page
  const pB = await pageOf(ids[1]!, "Huile", new Date());
  await putRow(ids[1]!, "MA:general", vA, { fpa: new Date(), pageId: pB.pageId });
  fresh();
  const incumbent = await Nv.checkNovelty(A, { niche: "MA:general", pageId: p1.pageId, candidates: [{ key: "mine", view: vA }] }, "publish");
  const newcomer = await Nv.checkNovelty(B, { niche: "MA:general", pageId: pB.pageId, candidates: [{ key: "copy", view: vA }] }, "publish");
  ok("A (first published earlier) republishes its design: not refused", incumbent[0]?.platform === "ok" && !incumbent[0]?.clone, incumbent);
  ok("B (the newcomer) is too_close and a clone", newcomer[0]?.platform === "too_close" && newcomer[0]?.clone === true, newcomer);

  // --- the answer shape: identical whatever the pool, no store id, no number, no vector ---
  const emptyish = await Nv.checkNovelty(C, { niche: "MA:empty", candidates: [{ key: "alpha", view: farView }] }, "wizard");
  const all = [...verdicts, ...other, ...own, ...sameProduct, ...emptyish];
  ok("the answer has exactly { key, platform, niche, own, clone }", all.every((v) => Object.keys(v).sort().join() === "clone,key,niche,own,platform"));
  const json = all.map((v) => JSON.stringify(v)).join(" ");
  ok("no store id, no number, no vector in any answer", ids.slice(0, 3).every((id) => !json.includes(id)) && !/\d/.test(json) && !json.includes("["), json);

  // --- the rate limit: design:novelty refuses call 61, publish is never limited ---
  await db.delete(rateLimits);
  let refusedAt = 0;
  for (let i = 1; i <= 61 && !refusedAt; i++) {
    try {
      await Nv.checkNovelty(C, { niche: NICHE, candidates: [{ key: "k", view: vC }] }, "studio");
    } catch (e) {
      if ((e as { code?: string }).code === "rate_limited") refusedAt = i;
      else throw e;
    }
  }
  ok("design:novelty refuses call 61", refusedAt === 61, { refusedAt });
  ok("publish is never rate limited", (await Nv.checkNovelty(C, { niche: NICHE, candidates: [{ key: "k", view: vC }] }, "publish")).length === 1);
  ok("≤ 16 candidates per call", (await Nv.checkNovelty(C, { niche: NICHE, candidates: Array.from({ length: 20 }, (_, i) => ({ key: `c${i}`, view: vC })) }, "publish")).length === 16);
  await db.delete(rateLimits);

  // the kill switch: platform_design.novelty = off → every band ok
  await db.execute(sql.raw("DELETE FROM `settings` WHERE `key` = 'platform_design'"));
  await db.insert(settings).values({ key: "platform_design", value: { novelty: "off" } as never, encrypted: false });
  invalidatePlatformSettings("platform_design");
  const off = await Nv.checkNovelty(C, { niche: NICHE, candidates: [{ key: "same", view: vB }] }, "publish");
  ok("novelty off: every band ok, no clone", off[0]?.platform === "ok" && off[0]?.niche === "ok" && !off[0]?.clone && (await Nv.noveltyMode(C)) === "off", off);
  await db.execute(sql.raw("DELETE FROM `settings` WHERE `key` = 'platform_design'"));
  invalidatePlatformSettings("platform_design");
  ok("novelty back on", (await Nv.noveltyMode(C)) === "on");

  // --- τ_niche(n) at n = 10, 50, 150 (the exact n of distinct stores) ---
  const T = "MA:kids";
  for (let i = 3; i < 13; i++) await putRow(ids[i]!, T, stored(randomView(rng)));
  fresh();
  const t10 = await Nv.nicheThreshold(T);
  for (let i = 13; i < 53; i++) await putRow(ids[i]!, T, stored(randomView(rng)));
  Nv.expireNoveltyPool();
  const t50 = await Nv.nicheThreshold(T);
  for (let i = 53; i < 153; i++) await putRow(ids[i]!, T, stored(randomView(rng)));
  Nv.expireNoveltyPool();
  const t150 = await Nv.nicheThreshold(T);
  ok("τ_niche at n = 10 / 50 / 150 is 0.40 / 0.3625 / 0.30 (incremental refresh)", Math.abs(t10 - 0.4) < 1e-9 && Math.abs(t50 - 0.3625) < 1e-9 && Math.abs(t150 - 0.3) < 1e-9, [t10, t50, t150]);
  fresh();
  ok("the full reload agrees", Math.abs((await Nv.nicheThreshold(T)) - 0.3) < 1e-9);
  await db.update(designGenomes).set({ pool: false, live: false, updatedAt: new Date(Date.now() + 5_000) }).where(eq(designGenomes.niche, T));
  Nv.expireNoveltyPool();
  ok("rows that left the pool are evicted by the incremental read", Math.abs((await Nv.nicheThreshold(T)) - 0.4) < 1e-9);

  // --- nicheShares: k-anonymity, 10 % steps, the hourly watermark, the differencing test ---
  const S = "MA:fragrance";
  const shareRow = (k: number): View => {
    const v = stored(randomView(mulberry32(1000 + k)));
    return { ...v, cat: { ...v.cat, grammar: k % 4, strategy: (k * 3) % 5, motion: k % 3, displayFamily: k % 6 } };
  };
  for (let i = 3; i < 12; i++) await putRow(ids[i]!, S, shareRow(i), { devices: i % 2 ? 1 : 0 });
  fresh();
  const nine = await Nv.loadNicheShares(S);
  ok("9 stores: empty shares", nine.n === 0 && !Object.keys(nine.grammar).length && !nine.seq4.length, nine);
  await putRow(ids[12]!, S, shareRow(12));
  fresh();
  const ten = await Nv.loadNicheShares(S);
  const steps = (m: Record<string, number>) => Object.values(m).every((x) => x > 0 && x <= 1 && Math.abs(x * 10 - Math.round(x * 10)) < 1e-9);
  ok("10 stores: n 10, every share a 10 % step", ten.n === 10 && [ten.grammar, ten.strategy, ten.motion, ten.displayFamily, ten.ghost].every(steps) && Object.keys(ten.grammar).length > 0, ten);
  ok("the shares carry no store id and no count", !ids.some((id) => JSON.stringify(ten).includes(id)) && Object.keys(ten).sort().join() === "arDisplay,arDisplayClass,displayFamily,ghost,grammar,heroArrangement,heroFamily,motion,n,seq4,strategy,tells");
  ok("the hourly watermark", Nv.nicheSharesWatermark(S) === new Date().toISOString().slice(0, 13));
  // a newcomer publishes within the hour: every poll of this hour keeps the answer
  await putRow(ids[13]!, S, shareRow(13), { devices: 1 });
  Nv.expireNoveltyPool();
  ok("within the hour the shares do not move", JSON.stringify(await Nv.loadNicheShares(S)) === JSON.stringify(ten));
  // the differencing test: 10 polls before the refresh (10 stores), 10 after it (11 stores)
  const now = Date.now();
  const hourBefore = new Date(now - 3_600_000).toISOString().slice(0, 13);
  const hourAfter = new Date(now).toISOString().slice(0, 13);
  await db.update(designGenomes).set({ pool: false, updatedAt: new Date(Date.now() + 6_000) }).where(eq(designGenomes.storeId, ids[13]!));
  Nv.expireNoveltyPool();
  await Nv.loadNicheShares(S);
  const before = Array.from({ length: 10 }, () => Nv.nicheSharesForHour(S, hourBefore));
  await db.update(designGenomes).set({ pool: true, updatedAt: new Date(Date.now() + 7_000) }).where(eq(designGenomes.storeId, ids[13]!));
  Nv.expireNoveltyPool();
  await Nv.loadNicheShares(S);
  const after = Array.from({ length: 10 }, () => Nv.nicheSharesForHour(S, hourAfter));
  ok("polls within one hour are identical", before.every((x) => JSON.stringify(x) === JSON.stringify(before[0])) && after.every((x) => JSON.stringify(x) === JSON.stringify(after[0])));
  ok("the refresh sees the newcomer", before[0]!.n === 10 && after[0]!.n === 10 && JSON.stringify(before[0]) !== JSON.stringify(after[0]));
  const reach = (share: number, stores: number, c: number) => [-1, 0, 1].some((e) => Math.round(Math.min(1, Math.max(0, (c + e) / stores)) * 10) / 10 === share);
  let weakest = Infinity;
  for (const field of ["grammar", "strategy", "motion", "displayFamily", "arDisplay", "heroFamily"] as const) {
    const b = before[0]![field];
    const a = after[0]![field];
    const values = [...new Set([...Object.keys(b), ...Object.keys(a)])];
    let consistent = 0;
    for (const v of values) {
      // per value u, the counts c ∈ [0, 10] of the 10 earlier stores that explain both polls if the newcomer has v
      const options = values.map((u) => Array.from({ length: 11 }, (_, c) => c).filter((c) => reach(b[u] ?? 0, 10, c) && reach(a[u] ?? 0, 11, c + (u === v ? 1 : 0))));
      let sums = new Set([0]);
      for (const opts of options) sums = new Set([...sums].flatMap((s0) => opts.map((c) => s0 + c)).filter((s0) => s0 <= 10));
      if (options.every((o) => o.length) && sums.size) consistent++;
    }
    weakest = Math.min(weakest, consistent);
  }
  ok("differencing: ≥ 2 candidate values per gene stay consistent with the observations", weakest >= 2, { weakest });

  // --- the exhaustion test (DES-§7.9 step 4) ---
  const E = "MA:home";
  const pE = await pageOf(ids[0]!, "Lampe", new Date(Date.now() - 3 * 86_400_000));
  const vE = stored(D.distanceView(genomeOf(pE.doc), { theme: pE.doc.theme }, pE.doc.locale));
  // another store 13 cheap units away: niche too_close (τ 0.40), platform ok; a variant moves past it
  const away: View = stored({ ...shift(vE, 10), num: { ...vE.num, rd: vE.num.rd > 0.5 ? 0 : 1, space: vE.num.space > 0.5 ? 0 : 1, area: vE.num.area > 0.5 ? 0 : 1 } });
  await putRow(ids[20]!, E, away, { fpa: new Date(Date.now() - 10 * 86_400_000) });
  fresh();
  const first = await Nv.exhaustionTest(A, { pageId: pE.pageId, doc: pE.doc }, E);
  const second = await Nv.exhaustionTest(A, { pageId: pE.pageId, doc: pE.doc }, E);
  const label = (r: typeof first) => (r === "exhausted" ? r : `${r.gene}:${r.to}`);
  ok("the exhaustion test is deterministic over two runs", label(first) === label(second), [label(first), label(second)]);
  ok("a clearing variant when one exists", first !== "exhausted", { d: D.genomeDistance(vE, away), first: label(first) });
  // saturated: another store at the page's own design; every variant stays within τ_niche of it
  await putRow(ids[21]!, E, vE, { fpa: new Date(Date.now() - 10 * 86_400_000) });
  fresh();
  const saturated = await Nv.exhaustionTest(A, { pageId: pE.pageId, doc: pE.doc }, E);
  ok("a saturated niche: exhausted, deterministically", saturated === "exhausted" && (await Nv.exhaustionTest(A, { pageId: pE.pageId, doc: pE.doc }, E)) === "exhausted", label(saturated));

  // --- the repository ---
  const rows = await db.select().from(designGenomes).where(and(eq(designGenomes.storeId, ids[0]!), eq(designGenomes.pageId, p1.pageId)));
  const [pageRow] = await db.select({ f: pages.firstPublishedAt }).from(pages).where(eq(pages.id, p1.pageId));
  ok("the published row: live, in the pool, first_published_at from the page, the tell devices", rows.length === 1 && rows[0]!.live && rows[0]!.pool && rows[0]!.firstPublishedAt?.getTime() === pageRow?.f?.getTime() && Pl.tellsOfMask(D.devicesOfVec(rows[0]!.vec)).join() === "ghost", rows[0]);
  await G.recordPublished(A, { pageId: p1.pageId, versionId: p1.versionId, niche: "MA:general", genome: g0, view: vA });
  const flipped = await db.select().from(designGenomes).where(and(eq(designGenomes.storeId, ids[0]!), eq(designGenomes.pageId, p1.pageId)));
  const prev = flipped.find((r) => r.id === rows[0]!.id)!;
  ok("a republish: the previous live row is reserved 30 days and stays in the pool", flipped.filter((r) => r.live).length === 1 && !prev.live && prev.pool && !!prev.reservedUntil && Math.abs(prev.reservedUntil.getTime() - Date.now() - 30 * 86_400_000) < 120_000);
  ok("B's release never touches A's page", (await G.releasePage(B, p1.pageId)) === 0);
  await G.releasePage(A, p1.pageId);
  ok("unpublish: no live row left, still in the pool", (await db.select().from(designGenomes).where(and(eq(designGenomes.pageId, p1.pageId), eq(designGenomes.live, true)))).length === 0);
  const gen = G.generationRecord(pE.doc, new Map([...textFieldsOf(pE.doc).keys()].map((k) => [k, "engine" as const])));
  ok("the generation record ≤ 600 B, hash16 entries, titles first", JSON.stringify(gen).length <= 600 && Object.values(gen).every((r) => /^[0-9a-f]{16}$/.test(r.h) && r.o === "engine") && Object.keys(gen).some((k) => /\.(title|headline)$/.test(k)), gen);
  await G.recordChosen(A, { pageId: pE.pageId, niche: E, genome: genomeOf(pE.doc), view: vE, gen });
  ok("the core reads the chosen row's record", JSON.stringify(await generationRecordFor(A, pE.pageId)) === JSON.stringify(gen));
  await G.recordGenerated(A, Array.from({ length: 6 }, () => ({ pageId: null, niche: E, genome: g0, view: shift(vA, 2) })));
  const count0 = (await db.select({ id: designGenomes.id }).from(designGenomes).where(eq(designGenomes.storeId, ids[0]!))).length;
  const removed = await G.enforceCap(A, count0 - 4);
  const left = await db.select().from(designGenomes).where(eq(designGenomes.storeId, ids[0]!));
  ok("the cap deletes the oldest non-live rows, generated first", removed === 4 && left.length === count0 - 4 && left.filter((r) => r.source === "generated").length === 2, { removed, left: left.map((r) => r.source) });
  await G.enforceCap(A, 0);
  ok("a live or reserved row is never capped", (await db.select().from(designGenomes).where(eq(designGenomes.storeId, ids[0]!))).every((r) => r.live || (r.reservedUntil && r.reservedUntil.getTime() > Date.now())));
  await G.purgeGenomes(C);
  ok("purge: 0 rows left for the store, the others untouched", (await db.select().from(designGenomes).where(eq(designGenomes.storeId, ids[2]!))).length === 0 && (await db.select().from(designGenomes).where(eq(designGenomes.storeId, ids[1]!))).length > 0);
}

main()
  .catch((e) => {
    failures.push(`threw ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
    console.log(`  ✗ ${failures.at(-1)}`);
  })
  .finally(async () => {
    try {
      const { pool } = load<typeof import("@/lib/db/client")>("@/lib/db/client");
      await pool().end();
    } catch {
      // the pool was never opened
    }
    if (!KEEP) await rootQuery(`DROP DATABASE IF EXISTS \`${dbName}\``).catch(() => undefined);
    process.exit(failures.length ? 1 : 0);
  });
