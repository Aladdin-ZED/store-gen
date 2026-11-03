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

  console.log(`design-db: ${pass} passed, ${failures.length} failed`);
  for (const f of failures) console.log(`  ✗ ${f}`);
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
