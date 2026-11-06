/**
 * Two-store attack cases of the design track (P6 DESIGN, design.md).
 * Extension file (docs/STORE-SAAS.md §F.1, §J.2, §K.3; DES-R13), created at P0 and loaded by
 * scripts/qa/tenancy-check.ts (`test:tenancy`), which lists an empty `cases` as not applicable until the track merges.
 * `actions` holds the attack cases of the track's server actions (they join the harness's `ACTION_CASES`): P0 put
 * `checkHeadlinesAction` here, the frozen stub of src/lib/design/actions.ts (DES-§9.8), so the coverage rule holds
 * from P0 on; step 9 adds `nicheSharesAction` and the genome-row / novelty-verdict case; step 10 the publish listener,
 * health read, ⌘K search and purge case.
 */
import type { TenancyCase, TrackActionCase } from "../tenancy-check";
import type { WriteScope } from "@/lib/tenancy/types";

export const cases: TenancyCase[] = [
  {
    // DES-§2.2, §22 (step 7): headline_shingles has no store id; a store's sync writes only its own owner tag from its
    // own live pages; the cross-store check answers { verdict, band } and never an owner tag, a count or a number
    name: "design: headline shingles are written by owner tag only, and the check never names another store",
    async run({ check, scope }) {
      const H = await import("@/lib/design/headlines.server");
      const { db } = await import("@/lib/db/client");
      const { headlineShingles } = await import("@/lib/db/schema");
      const { eq } = await import("drizzle-orm");
      const A = scope("A", "system") as WriteScope;
      const B = scope("B", "system") as WriteScope;
      const niche = "MA:general";
      const tagA = H.ownerTagFor(A.storeId);
      const tagB = H.ownerTagFor(B.storeId);
      await db.insert(headlineShingles).values([{ nicheKey: niche, hash: H.shingleHash(niche, "§p pressee a"), ownerTag: tagA, kind: "title" }]).catch(() => undefined);
      const before = (await db.select().from(headlineShingles).where(eq(headlineShingles.ownerTag, tagA))).length;
      await H.syncShingles(B, niche);
      const after = (await db.select().from(headlineShingles).where(eq(headlineShingles.ownerTag, tagA))).length;
      check("B's sync never touches A's rows", before === after && before > 0, { before, after });
      const rows = await db.select().from(headlineShingles).where(eq(headlineShingles.nicheKey, niche));
      check("every row is A's or B's tag, never a store id", rows.every((r) => (r.ownerTag === tagA || r.ownerTag === tagB) && r.ownerTag !== A.storeId && r.ownerTag !== B.storeId));
      const verdicts = await H.checkHeadlineNovelty(B, niche, ["{product}, pressée à froid.", HEADLINES[1]!]);
      const json = JSON.stringify(verdicts);
      check("B's check answers { verdict, band } only", verdicts.every((v) => Object.keys(v).sort().join() === "band,verdict") && !json.includes(tagA) && !/\d/.test(json), verdicts);
      await H.purgeHeadlineShingles(B);
      check("B's purge leaves A's rows", (await db.select().from(headlineShingles).where(eq(headlineShingles.ownerTag, tagA))).length === before);
      await db.delete(headlineShingles).where(eq(headlineShingles.ownerTag, tagA));
    },
  },
  {
    // DES-§2.1, §7.4, §7.5, §22 (step 9): genome rows are written and read through the scope; B can neither flip, read
    // nor purge A's rows; the novelty answer about A's live design names no store, no number and no vector
    name: "design: genome rows stay in their store, and the novelty verdict never names another store",
    async run({ check, scope, fx }) {
      const G = await import("@/lib/design/genomes.server");
      const N = await import("@/lib/design/novelty.server");
      const { genomeOf } = await import("@/lib/design/derive");
      const { distanceView } = await import("@/lib/design/distance");
      const { getFixture } = await import("@/lib/page/fixtures");
      const { db } = await import("@/lib/db/client");
      const { designGenomes } = await import("@/lib/db/schema");
      const { eq } = await import("drizzle-orm");
      const A = scope("A", "system") as WriteScope;
      const B = scope("B", "system") as WriteScope;
      const doc = getFixture("argan").doc;
      const genome = genomeOf(doc);
      const view = distanceView(genome, { theme: doc.theme }, doc.locale);
      const niche = "MA:skincare";
      const rowA = await G.recordPublished(A, { pageId: fx.A.page.live, versionId: fx.A.version.live, niche, genome, view });
      check("B's release of A's live page changes nothing", (await G.releasePage(B, fx.A.page.live)) === 0);
      check("B's recent pages never include A's", (await G.ownRecent(B)).every((r) => r.pageId !== fx.A.page.live));
      check("B reads no generation record of A's page", (await G.pageGenomes(B, fx.A.page.live)).length === 0);
      check("B learns nothing of A's page facts", (await G.pageFacts(B, fx.A.page.live)) === null);
      N.resetNoveltyPool();
      const verdicts = await N.checkNovelty(B, { niche, candidates: [{ key: "copy", view }] }, "publish");
      const json = JSON.stringify(verdicts[0] ?? {});
      check("B's copy of A's live design is refused as a clone", verdicts[0]?.platform === "too_close" && verdicts[0]?.clone === true, verdicts);
      check("the verdict carries bands only: no store id, no row id, no number", !json.includes(fx.A.id) && !json.includes(rowA) && !/\d/.test(json), json);
      const shares = await N.loadNicheShares(niche);
      check("the niche shares of a 2-store niche are empty (k ≥ 10) and name no store", shares.n === 0 && !JSON.stringify(shares).includes(fx.A.id));
      await G.purgeGenomes(B);
      const left = await db.select({ id: designGenomes.id }).from(designGenomes).where(eq(designGenomes.storeId, fx.A.id));
      check("B's purge leaves A's genome rows", left.some((r) => r.id === rowA));
      await G.purgeGenomes(A);
      N.resetNoveltyPool();
    },
  },
  {
    // DES-§8.8, §8.11, §15.5, §22 (step 10): the publish listener writes A's row in A only; B's health read, B's ⌘K
    // design search and B's publish check never reach A's rows; the check's answer carries bands and gate ids only
    // (no store id, no owner tag, no customer data); no tenant genome is reachable through the designer seeds; the
    // purge leaves 0 rows for the store and its owner tag
    name: "design: publish listener, health read, search and purge stay in their store",
    async run({ check, scope, fx, leaks }) {
      const P = await import("@/lib/render/prepublish/design");
      const G = await import("@/lib/design/genomes.server");
      const H = await import("@/lib/design/headlines.server");
      const N = await import("@/lib/design/novelty.server");
      const { designHealth } = await import("@/lib/design/health.server");
      const { searchDesign } = await import("@/lib/admin-data/search/design");
      const { DESIGNER_SEEDS } = await import("@/lib/design/seeds");
      const { buildTheme } = await import("@/lib/theme");
      const { getFixture } = await import("@/lib/page/fixtures");
      const { db } = await import("@/lib/db/client");
      const { designGenomes, headlineShingles } = await import("@/lib/db/schema");
      const { eq } = await import("drizzle-orm");
      const A = scope("A", "system") as WriteScope;
      const B = scope("B", "system") as WriteScope;
      const doc = getFixture("argan").doc;
      const ctxOf = (s: WriteScope, pageId: string) => ({
        scope: s,
        store: { id: s.storeId } as never,
        pageId,
        doc,
        prev: null,
        theme: buildTheme(doc.theme, doc.locale),
        assets: new Map(),
        actor: { kind: "system", userId: null, impersonatorId: null, ip: null } as never,
        now: new Date(),
        mode: "block" as const,
      });
      N.resetNoveltyPool();
      await P.designListener({ ...ctxOf(A, fx.A.page.live), versionId: fx.A.version.live, event: "published" });
      const rowsA = await db.select({ id: designGenomes.id, storeId: designGenomes.storeId }).from(designGenomes).where(eq(designGenomes.pageId, fx.A.page.live));
      check("A's publish writes one live row, in A", rowsA.length >= 1 && rowsA.every((r) => r.storeId === fx.A.id), rowsA);
      const healthB = await designHealth(B);
      check("B's health read never lists A's pages", healthB.pages.every((p) => p.pageId !== fx.A.page.live) && !JSON.stringify(healthB).includes(fx.A.page.live));
      const healthA = await designHealth(A);
      check("A's health read: ids, q, slop, hasLook only", healthA.pages.every((p) => Object.keys(p).sort().join() === "genomeId,hasLook,pageId,q,slop") && leaks(healthA, { only: ["customer", "secret"] }).length === 0, healthA);
      const hitsB = await searchDesign(B, "argan", { userId: fx.B.members.owner, role: "owner" });
      check("B's design search never finds A's page", hitsB.every((h) => h.id !== fx.A.page.live && !h.href.includes(fx.A.handle)), hitsB);
      N.resetNoveltyPool();
      const res = await P.designCheck(ctxOf(B, fx.B.page.live) as never);
      const json = JSON.stringify(res.result);
      const items = res.result.ok ? (res.result.notes ?? []) : res.result.items;
      check("B's check answers design items only (gate ids, message keys, bands)", items.every((i) => i.id.startsWith("design:") && i.title.startsWith("design.")), items.slice(0, 3));
      check("the check's answer names no store, page, row or owner tag of A", !json.includes(fx.A.id) && !json.includes(fx.A.page.live) && rowsA.every((r) => !json.includes(r.id)) && !json.includes(H.ownerTagFor(fx.A.id)) && leaks(res.result).length === 0);
      const seeds = JSON.stringify(DESIGNER_SEEDS);
      check("no tenant genome is reachable through the designer seeds", !seeds.includes(fx.A.id) && rowsA.every((r) => !seeds.includes(r.id)));
      await G.purgeGenomes(B);
      await H.purgeHeadlineShingles(B);
      check("B's purge leaves A's rows", (await db.select({ id: designGenomes.id }).from(designGenomes).where(eq(designGenomes.storeId, fx.A.id))).length >= 1);
      await G.purgeGenomes(A);
      await H.purgeHeadlineShingles(A);
      check("A's purge: 0 genome rows for A, 0 shingles for A's owner tag", (await db.select({ id: designGenomes.id }).from(designGenomes).where(eq(designGenomes.storeId, fx.A.id))).length === 0 && (await db.select().from(headlineShingles).where(eq(headlineShingles.ownerTag, H.ownerTagFor(fx.A.id)))).length === 0);
      N.resetNoveltyPool();
    },
  },
];

const HEADLINES = ["Huile d'argan pure, pressée à froid", "زيت الأركان الأصلي"];

/** A fixture direction's packed view and genome (the wizard's step 4 / step 9 payloads). */
async function wizardDirection() {
  const { directionsOf } = await import("@/lib/design/fixtures/prepublish");
  const { distanceView, packView } = await import("@/lib/design/distance");
  const d = directionsOf("argan", "fr", 3)[0]!;
  return { genome: d.genome!, vec: packView(distanceView(d.genome!, { theme: d.doc.theme }, d.doc.locale)) };
}
const wizardCandidates = async () => [{ key: "0:0:x", vec: (await wizardDirection()).vec }];
const wizardRows = async () => [await wizardDirection()];

export const actions: TrackActionCase[] = [
  // reads the platform shingles only (no record of A to name): the role matrix and the effects count
  {
    file: "src/lib/design/actions.ts",
    name: "checkHeadlinesAction",
    area: "generate",
    path: "/generate",
    permission: ["pages.write"],
    write: false,
    victim: () => ["argan", HEADLINES],
    own: () => ["argan", HEADLINES],
  },
  // step 11: the wizard's novelty batch (bands of the attacker's own candidates; A has no record to name)
  {
    file: "src/app/app/[store]/generate/actions.ts",
    name: "checkNoveltyAction",
    area: "generate",
    path: "/generate",
    permission: ["pages.write"],
    write: false,
    victim: async () => [{ niche: "MA:skincare", candidates: await wizardCandidates() }],
    own: async () => [{ niche: "MA:skincare", candidates: await wizardCandidates() }],
  },
  // step 11: the generated rows of a wizard run (written for the caller's store only; nothing of A is named)
  {
    file: "src/app/app/[store]/generate/actions.ts",
    name: "recordCandidatesAction",
    area: "generate",
    path: "/generate",
    permission: ["pages.write"],
    write: true,
    victim: async () => [{ niche: "MA:skincare", rows: await wizardRows() }],
    own: async () => [{ niche: "MA:skincare", rows: await wizardRows() }],
  },
  // step 11: the reveal's photo rows: A's asset ids answer like missing ones
  {
    file: "src/app/app/[store]/generate/actions.ts",
    name: "revealAssetsAction",
    area: "generate",
    path: "/generate",
    permission: ["pages.write"],
    write: false,
    victim: (fx) => [[fx.A.asset.photo, fx.A.asset.cutout]],
    own: (fx) => [[fx.B.asset.photo]],
  },
  // step 9: the niche shares (platform pool, value → share bands over ≥ 10 stores; no record of A to name)
  {
    file: "src/lib/design/actions.ts",
    name: "nicheSharesAction",
    area: "generate",
    path: "/generate",
    permission: ["pages.write"],
    write: false,
    victim: () => ["MA:skincare"],
    own: () => ["MA:skincare"],
  },
];
