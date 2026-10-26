/**
 * The builder's store facts, slug history and merchant facts against a real MariaDB (docs/STORE-SAAS.md §K.1 T4:
 * LAN Q15, LAN Q22, ENGP-8; LP-20, LP-21, LP-02 inputs). Two stores, A and B; every check asks "does B ever see,
 * move or redirect A's pages". It creates its own throwaway database and drops it at the end:
 *
 *   npx tsx src/lib/editor/selftest-tenancy.ts      (MariaDB root@127.0.0.1:3306, no password;
 *                                                    EDITOR_TEST_DB_URL overrides the server URL)
 *
 *  - slug history: a published page's move keeps its old slug for 12 months; a never-published page keeps none;
 *    moving back drops the row; another page taking the old slug drops it; a failed republish (revertSlug) drops it;
 *    B's scope never reads, writes or deletes A's rows, and B's identical slug is its own row
 *  - merchant facts: one audit row per numeral in the page's store, `source: "wizard"`; `factsFor` in B is empty
 *  - check context: the live countdown and stock with the stock's age from the publish history, `origin` from the
 *    generation version, attested numerals, the store's policies and calling window; in B nothing of A's page
 *
 * The store settings are T1's typed stubs until T1 merges: the context is fed the registry defaults directly.
 */
import Module from "node:module";
import { randomBytes } from "node:crypto";

// the modules under test are marked `import "server-only"`; outside Next that import throws
const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
{
  const orig = M._resolveFilename;
  const stub = require.resolve("drizzle-orm");
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    return req === "server-only" ? stub : (orig as (...a: unknown[]) => string).call(this, req, ...rest);
  };
}
const load = <T>(id: string): T => Module.createRequire(__filename)(id) as T;

let pass = 0;
const failures: string[] = [];
const ok = (label: string, cond: boolean, info?: unknown) => {
  if (cond) pass++;
  else failures.push(`${label}${info === undefined ? "" : `\n    ${JSON.stringify(info)}`}`);
};

const SERVER = (process.env.EDITOR_TEST_DB_URL ?? "mysql://root@127.0.0.1:3306").replace(/\/+$/, "");
const DB_NAME = `cod_test_t4_editor_${randomBytes(3).toString("hex")}`;
const STORE_A = "00000000000000000000000001";
const STORE_B = "00000000000000000000000002";

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
    closeDb = async () => void (await pool().end().catch(() => undefined));
    await run(db, pool);
  } finally {
    await closeDb?.();
    await admin.query(`DROP DATABASE IF EXISTS \`${DB_NAME}\``);
    const [left] = (await admin.query("SHOW DATABASES LIKE 'cod_test_t4_editor_%'")) as unknown as [unknown[]];
    ok("cleanup: no cod_test_t4_editor_* database left", left.length === 0, left);
    await admin.end();
  }
}

async function run(db: typeof import("@/lib/db/client").db, pool: typeof import("@/lib/db/client").pool) {
  const { pages, pageVersions, stores } = load<typeof import("@/lib/db/schema")>("@/lib/db/schema");
  const { eq } = load<typeof import("drizzle-orm")>("drizzle-orm");
  const { systemCtx, systemScope } = load<typeof import("@/lib/jobs/scope")>("@/lib/jobs/scope");
  const { createPageFromDirections, createPageFromDoc } = load<typeof import("@/lib/admin-data/pages")>("@/lib/admin-data/pages");
  const editor = load<typeof import("./pages.server")>("./pages.server");
  const { recordSlugMove, releaseOldSlug } = load<typeof import("./slug-history")>("./slug-history");
  const { recordFacts, factsFor } = load<typeof import("./facts.server")>("./facts.server");
  const { loadCheckContext } = load<typeof import("./check-context.server")>("./check-context.server");
  const { storeSettingSchema } = load<typeof import("@/lib/settings/store-registry")>("@/lib/settings/store-registry");
  const { getFixture } = load<typeof import("@/lib/page/fixtures")>("@/lib/page/fixtures");
  const { newId } = load<typeof import("@/lib/db/ids")>("@/lib/db/ids");

  for (const [id, handle] of [
    [STORE_A, "store-a"],
    [STORE_B, "store-b"],
  ] as const) {
    await db.insert(stores).values({ id, handle, name: handle, status: "active", brandSeed: "0123456789abcdef" });
  }
  const ctx = systemCtx("qa.editor");
  const A = systemScope(ctx, STORE_A);
  const B = systemScope(ctx, STORE_B);
  const actor = ctx.actor;
  const rows = async (q: string, params: unknown[] = []) => ((await pool().query(q, params)) as unknown as [Record<string, unknown>[]])[0];
  const history = (storeId: string) => rows("SELECT slug, page_id, until, hits FROM page_slug_history WHERE store_id = ? ORDER BY slug", [storeId]);
  const doc = getFixture("argan").doc;
  const markPublished = (id: string) => db.update(pages).set({ status: "published", firstPublishedAt: new Date() }).where(eq(pages.id, id));

  /* ---------------- slug history (LP-20, LAN Q22) ---------------- */
  const a1 = await createPageFromDoc(A, { name: "Argan", doc, versionLabel: "qa" }, actor);
  const a2 = await createPageFromDoc(A, { name: "Draft", doc, versionLabel: "qa" }, actor);
  const b1 = await createPageFromDoc(B, { name: "Argan", doc, versionLabel: "qa" }, actor);
  ok("setup: both stores have the same slug", a1.slug === "argan" && b1.slug === "argan", [a1.slug, b1.slug]);
  await markPublished(a1.id);
  await markPublished(b1.id);

  const moved = await editor.updateMeta(A, a1.id, { slug: "argan-oil" });
  const hA = await history(STORE_A);
  ok("move: a published page keeps its old slug", moved.historyKept && hA.length === 1 && hA[0]!.slug === "argan" && hA[0]!.page_id === a1.id, hA);
  const months = (new Date(hA[0]!.until as string | Date).getTime() - Date.now()) / (30.4 * 86_400_000);
  ok("move: kept 12 months", months > 11.5 && months < 12.5, months);
  ok("move: B's history untouched", (await history(STORE_B)).length === 0);

  const draftMove = await editor.updateMeta(A, a2.id, { slug: "brouillon" });
  ok("move: a never-published page keeps no old slug", !draftMove.historyKept && (await history(STORE_A)).every((r) => r.slug !== "draft"));

  ok("scope: B cannot record a move of A's page", !(await recordSlugMove(B, a1.id, "x-slug")) && (await history(STORE_B)).length === 0);
  await releaseOldSlug(B, "argan");
  ok("scope: B's release never deletes A's row", (await history(STORE_A)).some((r) => r.slug === "argan"));

  const bMoved = await editor.updateMeta(B, b1.id, { slug: "huile" });
  const hB = await history(STORE_B);
  ok("scope: B's identical old slug is B's own row", bMoved.historyKept && hB.length === 1 && hB[0]!.page_id === b1.id);
  ok("scope: A's row still points at A's page", (await history(STORE_A)).find((r) => r.slug === "argan")?.page_id === a1.id);

  await editor.updateMeta(A, a1.id, { slug: "argan" });
  const back = await history(STORE_A);
  ok("move back: the page's current slug is no old address", back.every((r) => r.slug !== "argan") && back.some((r) => r.slug === "argan-oil" && r.page_id === a1.id), back);

  await editor.updateMeta(A, a2.id, { slug: "argan-oil" });
  ok("reuse: another page taking the old slug drops the row", (await history(STORE_A)).every((r) => r.slug !== "argan-oil"));

  await editor.updateMeta(A, a1.id, { slug: "argan-bio" });
  ok("revert: the move recorded the old slug", (await history(STORE_A)).some((r) => r.slug === "argan"));
  await editor.revertSlug(A, a1.id, "argan");
  ok("revert: a failed republish puts the page back and drops the row", (await history(STORE_A)).every((r) => r.slug !== "argan"));

  /* ---------------- merchant facts (ENGP-8) ---------------- */
  const g = await createPageFromDirections(
    A,
    { name: "Argan gen", slugBase: "argan-gen", chosen: 0, directions: [{ label: "One", doc }, { label: "Two", doc }] },
    actor,
  );
  const n = await recordFacts(A, g.id, ["3 couleurs, 50 ml", "Fait main", " "], actor);
  ok("facts: one row per numeral, one for a fact without a number", n === 3, n);
  const facts = await factsFor(A, g.id);
  ok("facts: read back in the store, source wizard", facts.length === 3 && facts.every((f) => f.source === "wizard" && f.path === null), facts);
  ok("facts: values normalised", JSON.stringify(facts.map((f) => f.value).sort()) === JSON.stringify(["3", "50", null].sort()), facts.map((f) => f.value));
  ok("facts: B reads none of A's page", (await factsFor(B, g.id)).length === 0);
  const auditRows = await rows("SELECT store_id, actor_kind FROM audit_log WHERE action = 'page.fact_attested'");
  ok("facts: audit rows carry A's store and the actor's kind", auditRows.length === 3 && auditRows.every((r) => r.store_id === STORE_A && r.actor_kind === "system"), auditRows);

  /* ---------------- check context (LAN Q15) ---------------- */
  const defaults = <K extends "store" | "policies" | "checkout" | "landing" | "ops">(key: K) => storeSettingSchema(key).parse({});
  const settings = {
    store: { ...defaults("store"), confirmation: { callerPhone: "+212600000000", withinHours: 24 } },
    policies: { ...defaults("policies"), reviewedAt: "2026-10-01T09:00:00.000Z", returns: { accepted: true, windowDays: 7, whoPays: "customer" as const } },
    checkout: { ...defaults("checkout"), zonesEnabled: true, calendar: { ...defaults("checkout").calendar, confirmationLeadDays: 1 } },
    landing: defaults("landing"),
    ops: defaults("ops"),
  };
  // three publishes: stock 9 (30 days ago), then 5 twice (20 and 2 days ago, the live one), countdown on the live one
  const day = 86_400_000;
  const now = Date.now();
  const publishes = [
    { at: now - 30 * day, stock: 9 },
    { at: now - 20 * day, stock: 5 },
    { at: now - 2 * day, stock: 5 },
  ];
  let liveId = "";
  for (const p of publishes) {
    const v = { ...doc, offers: { ...doc.offers, urgency: { stockLeft: p.stock, countdownEnd: new Date(now + 5 * day).toISOString() } } };
    liveId = newId();
    await db.insert(pageVersions).values({ id: liveId, storeId: STORE_A, pageId: g.id, kind: "publish", label: null, doc: v, checksum: liveId, createdBy: null, createdAt: new Date(p.at) });
  }
  await db.update(pages).set({ status: "published", publishedVersionId: liveId, firstPublishedAt: new Date(publishes[0]!.at) }).where(eq(pages.id, g.id));
  const draft = JSON.parse(JSON.stringify(doc)) as typeof doc;
  const titled = draft.sections.find((s) => typeof (s.data as Record<string, unknown>).title === "string");
  if (titled) (titled.data as Record<string, unknown>).title = "Notre huile, pressée chez nous";
  const market = { market: "MA", timezone: "Africa/Casablanca" };

  const c = await loadCheckContext(A, market, { id: g.id, publishedVersionId: liveId }, draft, settings);
  ok("context: the live countdown and stock", !!c.published?.countdownEnd && c.published?.stockLeft === 5, c.published);
  const age = c.published?.stockChangedAt ? (now - Date.parse(c.published.stockChangedAt)) / day : -1;
  ok("context: the stock has been 5 since the publish of 20 days ago", Math.round(age) === 20, age);
  ok("context: origin from the generation version", !!titled && c.origin[`${titled.id}.title`] === "owner" && Object.values(c.origin).includes("generated"));
  ok("context: attested numerals", ["3", "50"].every((v) => c.attestedFacts.includes(v)) && c.facts.byClass.fact?.includes("3") === true, c.attestedFacts);
  ok("context: policies, returns and the call promise", c.policiesReviewed && c.facts.byClass.return_days?.includes("7") === true && c.facts.byClass.within_hours?.includes("24") === true);
  ok("context: confirmation and calling window (default hours, never saved)", c.confirmation.callerPhone && !c.confirmation.callingWindow && !c.confirmation.callingWindowSaved, c.confirmation);
  ok("context: zones on, none yet, Morocco has a city list", c.zones.enabled && c.zones.count === 0 && c.zones.hasMarketList);
  ok("context: lead days and address mode", c.leadDays === 1 && c.addressMode === "required");
  ok("context: plain JSON (it crosses the server boundary)", JSON.stringify(JSON.parse(JSON.stringify(c))) === JSON.stringify(c));

  const leak = await loadCheckContext(B, market, { id: g.id, publishedVersionId: liveId }, draft, settings);
  ok("scope: B's context of A's page has no live values", !leak.published?.countdownEnd && leak.published?.stockLeft === undefined, leak.published);
  ok("scope: B's context has no origin or facts of A's page", Object.keys(leak.origin).length === 0 && leak.attestedFacts.length === 0);
}

main()
  .catch((err) => {
    failures.push(`crashed: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
  })
  .finally(() => {
    console.log(`editor tenancy selftest: ${pass} passed, ${failures.length} failed`);
    for (const f of failures) console.log(`  FAIL ${f}`);
    process.exit(failures.length ? 1 : 0);
  });
