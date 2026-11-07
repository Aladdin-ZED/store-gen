/**
 * The store blueprint shape (storefront.md STO-§11.5, ai.md AI-11; isomorphic, pure). Produced by S7 AI DATA's
 * `store.blueprint` job (deep pass) or by S1's instant candidates, consumed by S1's `applyStoreBlueprint` and by S2's
 * `compileBlueprint`. Track S1 STOREFRONT owns this file in R2; the contract step (C2-C) froze the type and its zod
 * here, in one isomorphic file S1 and S7 both import (S7's client hook `useStoreBlueprintJob` validates a job result
 * with it in the browser). A change goes through a CCR (docs/saas/ccr/README.md) and src/lib/contracts/r2-stubs.ts.
 *
 * Every value comes from a closed vocabulary: the storyline from `HOME_STORYLINES`, the gene hints from design's
 * `GENE_VOCAB` (shape checked here; values by design's `validateHints`, invalid ones dropped and listed), section types
 * and variants from the store section registry (checked by S1's `checkHomeDoc`), collections from the owner's own
 * products only (`assertOwned`), page drafts from the `policies` facts only. No price, no number the owner did not give.
 */
import { z } from "zod";
import type { GeneHints } from "@/lib/design/hints";
import { Locale } from "@/lib/page/schema";
import { HOME_STORYLINES } from "@/storefront/home/grammar";

const text = (max: number) => z.string().max(max);
const perLocale = (max: number) => z.record(Locale, text(max));
const sectionData = z.record(z.string(), z.unknown());

/** The blueprint (contract caps: ≤ 20 collections of ≤ 500 products, ≤ 16 home slots, ≤ 8 draft pages). */
export const StoreBlueprintSchema = z.object({
  storyline: z.enum(HOME_STORYLINES),
  /** brand and page gene weights (DES-§4.6), applied by S2's `sampleBrand` and S1's `expandHome`; never a raw genome */
  hints: z.custom<GeneHints>((v) => typeof v === "object" && v !== null && !Array.isArray(v)),
  collections: z
    .array(
      z.object({
        name: perLocale(80),
        description: perLocale(400).optional(),
        /** the owner's own products only (assertOwned at apply) */
        productIds: z.array(z.string().length(26)).max(500),
      }),
    )
    .max(20),
  home: z.object({
    slots: z.array(z.object({ type: text(40), variant: text(40), data: sectionData, bind: text(40).optional() })).max(16),
  }),
  /** about, FAQ and policy drafts from the `policies` facts only; never published by the apply */
  pages: z
    .array(
      z.object({
        title: perLocale(120),
        slug: z.string().regex(/^[a-z0-9-]{1,60}$/),
        sections: z.array(z.object({ type: text(40), variant: text(40), data: sectionData })).max(16),
        needsReview: z.literal(true),
      }),
    )
    .max(8)
    .optional(),
  /** written into page_versions.generation_source / critic_picks on publish */
  provenance: z.object({
    source: z.enum(["director", "deep", "instant"]),
    runIds: z.array(z.string().max(40)).max(12),
    promptVersions: z.record(z.string(), z.string().max(40)),
  }),
});

export type StoreBlueprint = z.infer<typeof StoreBlueprintSchema>;
