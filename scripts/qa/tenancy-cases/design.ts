/**
 * Two-store attack cases of the design track (P6 DESIGN, design.md).
 * Extension file (docs/STORE-SAAS.md §F.1, §J.2, §K.3; DES-R13), created at P0 and loaded by
 * scripts/qa/tenancy-check.ts (`test:tenancy`), which lists an empty `cases` as not applicable until the track merges.
 * `actions` holds the attack cases of the track's server actions (they join the harness's `ACTION_CASES`): P0 put
 * `checkHeadlinesAction` here, the frozen stub of src/lib/design/actions.ts (DES-§9.8), so the coverage rule holds
 * from P0 on.
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
];

const HEADLINES = ["Huile d'argan pure, pressée à froid", "زيت الأركان الأصلي"];

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
];
