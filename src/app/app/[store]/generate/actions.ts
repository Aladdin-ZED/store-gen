"use server";
/**
 * Generator → page (P6 DESIGN; design.md DES-§14.2 steps 4, 9 and 10, DES-§7.4, DES-§9.8; core §I.1, §E.3).
 *
 * - `checkNoveltyAction`: one batched verdict per wizard run (DS26): ≤ 16 candidates' packed distance views → bands at
 *   τ_niche(n), never a distance; the `design:novelty` bucket (60 / 10 min per store) inside `checkNovelty`.
 * - `recordCandidatesAction`: the three directions shown, as `generated` rows (never live, never in the pool), written
 *   in `after()` so the reveal never waits on it.
 * - `revealAssetsAction`: the preview rows of the store's own photos a reveal's folds show (another store's id
 *   answers like a missing one), so the onboarding folds render the real photos.
 * - `createFromDirectionsAction`: "Use this direction" creates a draft page of the store from the chosen direction and
 *   stores all three directions as "generation" versions, so the alternatives stay one click away in History. The
 *   documents come from the browser (the generator is pure and runs client-side): each one is validated and repaired
 *   with validateDoc, size-capped, and must only reference assets of the store's own library (docs/STORE-SAAS.md §E.3
 *   rule 5). Pixels belong to pages (docs/OFFERS.md §A): the docs carry the wizard's "Ad tracking for this page"
 *   answer and the page is created with exactly that. The insert is the store repository's (`createPageFromDirections`,
 *   GEN-01: store id from the scope only). The merchant's facts become the page's attested facts (`recordFacts`,
 *   ENGP-8). Then the `chosen` genome row: `genomeOf(doc)` on the server (a lying client only fools its own preview),
 *   the client's copy-gene tags kept against GENE_VOCAB, `report.gen` (≤ 600 B) from the lines the client names as
 *   composed or written by the model; q / slop / the gate summary are recomputed on the server by the save hook.
 */
import { after } from "next/server";
import { z } from "zod";
import { fail } from "@/lib/admin-data/action";
import { countStoreAssets, previewAssetsFor } from "@/lib/admin-data/assets";
import { createPageFromDirections, slugify } from "@/lib/admin-data/pages";
import { revalidateStore } from "@/lib/admin-data/shell";
import { applyCopyGenes, originsOf, validCopyGenes } from "@/lib/design/copy-genes";
import { genomeOf } from "@/lib/design/derive";
import { distanceView, unpackView } from "@/lib/design/distance";
import { DesignGenomeSchema } from "@/lib/design/genome";
import { generationRecord, recordChosen, recordGenerated } from "@/lib/design/genomes.server";
import { docNiche } from "@/lib/design/headlines.server";
import { checkNovelty, NOVELTY_CANDIDATES_MAX, type NoveltyVerdict } from "@/lib/design/novelty.server";
import { recordDraftDesign } from "@/lib/design/save.server";
import { recordFacts } from "@/lib/editor/facts.server";
import { Archetype, type PageDoc } from "@/lib/page/schema";
import { validateDoc } from "@/lib/page/validate";
import { storeAction } from "@/lib/tenancy/seam";
import type { ActionResult } from "@/lib/tenancy/types";
import { collectAssetIds } from "@/landing/context";

/** A generated document is ~30–60 KB of JSON; anything far beyond that is not from the generator. */
const MAX_DOC_CHARS = 400_000;
/** The Details step takes at most 5 facts (MAX_FACTS); a little slack for an older open tab. */
const MAX_WIZARD_FACTS = 6;

const Niche = z.string().trim().regex(/^[A-Z]{2,8}:[a-z][a-z0-9-]{0,39}$/);
/** a packed v2 distance view (`packView`): integers only, decoded by `unpackView` (which refuses anything else) */
const Vec = z.array(z.number().int().min(-32768).max(32767)).min(8).max(512);
const Band = z.enum(["ok", "close", "too_close"]);

const NoveltyInput = z.object({
  niche: Niche,
  candidates: z.array(z.object({ key: z.string().trim().min(1).max(64), vec: Vec })).min(1).max(NOVELTY_CANDIDATES_MAX),
});

/** DES-§14.2 step 4: the bands of ≤ 16 candidates (platform, niche at τ_niche(n), own pages, the clone flag). */
export async function checkNoveltyAction(input: z.input<typeof NoveltyInput>): Promise<ActionResult<NoveltyVerdict[]>> {
  return storeAction("pages.write", async ({ scope }) => {
    const { niche, candidates } = NoveltyInput.parse(input);
    const views = candidates.map((c) => {
      try {
        return { key: c.key, view: unpackView(c.vec) };
      } catch {
        return fail("This design could not be checked.");
      }
    });
    return checkNovelty(scope, { niche, candidates: views }, "wizard");
  });
}

const CandidateRow = z.object({
  genome: z.unknown(),
  vec: Vec,
  q: z.number().int().min(0).max(100).nullable().default(null),
  slop: z.number().int().min(0).max(127).nullable().default(null),
  novelty: z.object({ platform: Band, niche: Band, own: z.union([Band, z.literal("first")]), clone: z.boolean() }).nullable().default(null),
});
const CandidatesInput = z.object({ niche: Niche, rows: z.array(CandidateRow).min(1).max(3) });

/** DES-§14.2 step 9: the directions shown as `generated` rows, after the response (the reveal never waits). */
export async function recordCandidatesAction(input: z.input<typeof CandidatesInput>): Promise<ActionResult<{ queued: number }>> {
  return storeAction("pages.write", async ({ scope }) => {
    const { niche, rows } = CandidatesInput.parse(input);
    const valid = rows.flatMap((r) => {
      const genome = DesignGenomeSchema.safeParse(r.genome);
      if (!genome.success) return [];
      try {
        return [{ niche, genome: genome.data, view: unpackView(r.vec), q: r.q, slop: r.slop, novelty: r.novelty ? { v: 1 as const, platform: r.novelty.platform, niche: r.novelty.niche, own: r.novelty.own, at: new Date().toISOString() } : null }];
      } catch {
        return [];
      }
    });
    if (valid.length) {
      const write = async () => {
        try {
          await recordGenerated(scope, valid);
        } catch (err) {
          console.warn("[generate] the generated rows were not recorded", err instanceof Error ? err.message : err);
        }
      };
      try {
        after(write);
      } catch {
        // outside a request scope (a script replaying the action): written now
        await write();
      }
    }
    return { queued: valid.length };
  });
}

const AssetIds = z.array(z.string().regex(/^[a-f0-9]{16,64}$/)).max(64);

/** The reveal's photos (DES-§14.3): preview rows of this store's assets by id; unknown ids are left out. */
export async function revealAssetsAction(ids: readonly string[]): Promise<ActionResult<Awaited<ReturnType<typeof previewAssetsFor>>>> {
  return storeAction("pages.write", async ({ scope }) => {
    const list = AssetIds.parse(ids);
    return previewAssetsFor(scope, [], list.map((id) => ({ id, alt: "" })));
  });
}

const CopyGenes = z.object({ angle: z.string().max(32).optional(), titles: z.record(z.string().max(32), z.string().max(32)).optional() });

const Input = z
  .object({
    name: z.string().trim().min(1, { error: "Give the product a name." }).max(120),
    chosen: z.number().int().min(0).max(2),
    directions: z
      .array(z.object({ archetype: Archetype, label: z.string().trim().min(1).max(40), doc: z.unknown() }))
      .min(1)
      .max(3),
    /** the merchant's facts as typed in Details ("3 couleurs"): recorded as the page's attested facts (ENGP-8) */
    facts: z.array(z.string().trim().max(200)).max(MAX_WIZARD_FACTS).default([]),
    /** @deprecated v1 flag ("the docs carry the wizard's pixel choices"): accepted and ignored, one release */
    pixels: z.literal("chosen").optional(),
    /** the chosen direction's design record (DES-§14.2 step 10); absent = an older tab, the row is derived from the doc */
    design: z
      .object({
        copyGenes: CopyGenes.optional(),
        /** the lines the engine composed / the on-device model wrote, as shown (the origins of `report.gen`) */
        engine: z.array(z.string().max(400)).max(40).default([]),
        ai: z.array(z.string().max(400)).max(60).default([]),
        niche: Niche.optional(),
      })
      .optional(),
  })
  .refine((i) => i.chosen < i.directions.length, { error: "Pick one of the directions." });

export type CreateFromDirectionsInput = z.input<typeof Input>;

/**
 * Base for the page address: the product name when it has Latin letters, else the category
 * ("skincare", "organic-food") — an Arabic-only name would otherwise give "page-7".
 */
const slugBase = (name: string, category: string) => (slugify(name) !== "page" ? name : category);

export async function createFromDirectionsAction(input: CreateFromDirectionsInput): Promise<ActionResult<{ id: string; slug: string }>> {
  return storeAction("pages.write", async ({ scope, actor, store }) => {
    const { name, chosen, directions, facts, design } = Input.parse(input);

    // each doc keeps the tracking the wizard answered (pixels or "No pixel"): nothing is added here
    const docs: { label: string; doc: PageDoc }[] = [];
    for (const d of directions) {
      if (JSON.stringify(d.doc ?? null).length > MAX_DOC_CHARS) fail("This direction is too large to save.");
      const { doc, issues } = validateDoc(d.doc);
      if (!doc) return fail(`This direction can't be saved: ${issues.find((i) => i.level === "error")?.message ?? "invalid page"}.`);
      if (doc.theme.archetype !== d.archetype) fail("The directions changed while saving. Generate them again.");
      docs.push({ label: d.label, doc });
    }

    // photos are uploaded before generating: a missing asset was deleted meanwhile (another store's id reads as missing)
    const ids = [...new Set(docs.flatMap((d) => collectAssetIds(d.doc)))];
    if (ids.length && (await countStoreAssets(scope, ids)) < ids.length) fail("Some photos are no longer in the media library. Add them again.");

    const page = docs[chosen]!;
    const created = await createPageFromDirections(scope, { name, slugBase: slugBase(name, page.doc.product.category), chosen, directions: docs }, actor);
    // the gate judges the facts the seller gave (§M.1 rule 2): "3 couleurs" typed here is never a refusal later
    await recordFacts(scope, created.id, facts, actor);

    // the chosen genome row: the server's reading of the doc, the client's copy genes only where the vocabulary has them
    try {
      const doc = page.doc;
      const genome = applyCopyGenes(genomeOf(doc), validCopyGenes(design?.copyGenes));
      const view = distanceView(genome, { theme: doc.theme }, doc.locale);
      const origins = originsOf(doc, { engine: design?.engine, ai: design?.ai, owner: facts });
      const niche = design?.niche ?? docNiche(doc, { market: store.market, category: null });
      await recordChosen(scope, { pageId: created.id, niche, genome, view, gen: generationRecord(doc, origins) });
      // q, slop and the gate summary from the server's gates (the save hook keeps `report.gen`)
      await recordDraftDesign(scope, created.id, doc);
    } catch (err) {
      // the page exists: a design row that fails to write never undoes it (the publish check derives one)
      console.warn("[generate] the chosen design row was not recorded", err instanceof Error ? err.message : err);
    }
    revalidateStore(store.handle, "/pages", "/history", "");
    return created;
  });
}
