"use server";
/**
 * Generator → page. "Use this direction" creates a draft page of the store from the chosen direction and stores
 * all three directions as "generation" versions, so the alternatives stay one click away in History.
 *
 * The documents come from the browser (the generator is pure and runs client-side): each one is
 * validated and repaired with validateDoc, size-capped, and must only reference assets of the store's own
 * library (docs/STORE-SAAS.md §E.3 rule 5). Pixels belong to pages (docs/OFFERS.md §A): the docs carry the wizard's
 * "Ad tracking for this page" answer (the page's pixels, or `tracking.none`) and the page is created with exactly
 * that — the save never adds store pixels. The v1 flag `pixels: "chosen"` is accepted and ignored (one release).
 * The insert itself is the store repository's (`createPageFromDirections`, GEN-01: store id from the scope only).
 */
import { z } from "zod";
import { fail } from "@/lib/admin-data/action";
import { countStoreAssets } from "@/lib/admin-data/assets";
import { createPageFromDirections, slugify } from "@/lib/admin-data/pages";
import { revalidateStore } from "@/lib/admin-data/shell";
import { Archetype, type PageDoc } from "@/lib/page/schema";
import { validateDoc } from "@/lib/page/validate";
import { storeAction } from "@/lib/tenancy/seam";
import type { ActionResult } from "@/lib/tenancy/types";
import { collectAssetIds } from "@/landing/context";

/** A generated document is ~30–60 KB of JSON; anything far beyond that is not from the generator. */
const MAX_DOC_CHARS = 400_000;

const Input = z
  .object({
    name: z.string().trim().min(1, { error: "Give the product a name." }).max(120),
    chosen: z.number().int().min(0).max(2),
    directions: z
      .array(z.object({ archetype: Archetype, label: z.string().trim().min(1).max(40), doc: z.unknown() }))
      .min(1)
      .max(3),
    /** @deprecated v1 flag ("the docs carry the wizard's pixel choices"): accepted and ignored, one release */
    pixels: z.literal("chosen").optional(),
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
    const { name, chosen, directions } = Input.parse(input);

    // each doc keeps the tracking the wizard answered (pixels or "No pixel"): nothing is added here
    const docs: { label: string; doc: PageDoc }[] = [];
    for (const d of directions) {
      if (JSON.stringify(d.doc ?? null).length > MAX_DOC_CHARS) fail("This direction is too large to save.");
      const { doc, issues } = validateDoc(d.doc);
      if (!doc) return fail(`This direction can't be saved: ${issues.find((i) => i.level === "error")?.message ?? "invalid page"}.`);
      if (doc.theme.archetype !== d.archetype) fail("The directions changed while saving — generate again.");
      docs.push({ label: d.label, doc });
    }

    // photos are uploaded before generating: a missing asset was deleted meanwhile (another store's id reads as missing)
    const ids = [...new Set(docs.flatMap((d) => collectAssetIds(d.doc)))];
    if (ids.length && (await countStoreAssets(scope, ids)) < ids.length) fail("Some photos are no longer in the media library — add them again.");

    const page = docs[chosen]!;
    const created = await createPageFromDirections(scope, { name, slugBase: slugBase(name, page.doc.product.category), chosen, directions: docs }, actor);
    revalidateStore(store.handle, "/pages", "/history", "");
    return created;
  });
}
