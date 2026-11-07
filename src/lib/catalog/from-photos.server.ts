import "server-only";
/**
 * Catalog from photos (storefront.md STO-§4.7, SF-12; R2, S1 with S7's tasks and S2's brand step). Track S1 STOREFRONT
 * owns this file in R2 and writes the grouping, the proposals and the review flow (`proposeProductsFromPhotos`,
 * `createProductsFromProposals`). The contract step (C2-C) froze the shapes S7 AI DATA mirrors and the job entry S7's
 * stage plan calls (core §K.4; S1 / S7 shared needs):
 *   - `ProductProposal` / `FromPhotosInput`: S7's proposal-text zod (`src/lib/ai/catalog/proposal-text.ts`) mirrors the
 *     text part; no `price` key exists in a proposal, ever (STO-§4.7 type test);
 *   - `CatalogFromPhotosJobInput`: the `ai_jobs` input of kind `catalog_from_photos` (> 6 photos, pattern B, core
 *     §H.12): `{ assetIds, groups, hints, locales }` (the `AiJobKind` widening is S7's, with its stage plan);
 *   - `runCatalogFromPhotosJob(scope, input, heartbeat)`: the job body S7's stage plan (`src/lib/ai/jobs/stages.ts`)
 *     runs; it calls `heartbeat()` at least every 10 s.
 * Stub until S1 merges: the job entry throws `NotBuiltYet("S1", "runCatalogFromPhotosJob")`. Nothing in R1 enqueues a
 * `catalog_from_photos` job.
 */
import { notBuiltYet } from "@/lib/contracts/not-built";
import type { AssetRef, Locale, ProductCategory } from "@/lib/page/schema";
import type { Hex } from "@/lib/theme/color";
import type { WriteScope } from "@/lib/tenancy/types";

export interface FromPhotosInput {
  /** 1-40, this store's assets (assertOwned) */
  assetIds: string[];
  hints?: { category?: ProductCategory; locale?: Locale };
  group?: "auto" | "one-per-photo";
}

/**
 * One option group proposed from VISIBLE photo differences (colour swatches detected in the photos; sizes never
 * guessed; no price, ever). `swatch` is the detected colour; `assetId` the photo showing that value.
 */
export interface OptionGroupProposal {
  name: string;
  values: { label: string; swatch?: Hex | null; assetId?: string | null }[];
}

export interface ProductProposal {
  /** local id of the proposal */
  key: string;
  /** crops from group photos through AssetRef.box (OFFERS §B.4) */
  photos: { assetId: string; box?: AssetRef["box"]; role: "main" | "detail" | "group" }[];
  /** drafts from the Worker (`product.describe`), library fallback (AI-02 pattern) */
  name: Record<Locale, string>;
  description: Record<Locale, string>;
  /** variants detected from photo differences; NO prices */
  items: { id: string; name: string; groups: OptionGroupProposal[] }[];
  /** AI-04 honesty rule: always unticked */
  suggestedFacts: { text: string; from: "photo" | "name"; ticked: false }[];
  category: ProductCategory;
  confidence: "high" | "medium" | "low";
}

/** The `ai_jobs.input` of kind `catalog_from_photos` (S1 enqueues it through P7 / S7's `enqueueAiJob`). */
export interface CatalogFromPhotosJobInput {
  /** 1-40, assertOwned at enqueue and again in the job */
  assetIds: string[];
  /** S1's grouping: one group per future proposal */
  groups: { key: string; photos: ProductProposal["photos"] }[];
  hints?: FromPhotosInput["hints"];
  /** the store's enabled locales: names and descriptions are drafted for each */
  locales: Locale[];
}

/**
 * The `catalog_from_photos` job body: per group, analyze (≤ 2 images ≤ 1,024 px) then `product.describe` for every
 * locale, guard every text, and answer the proposals (no write: the owner reviews them and types every price).
 * S1 (stub: NotBuiltYet).
 */
export async function runCatalogFromPhotosJob(scope: WriteScope, input: CatalogFromPhotosJobInput, heartbeat: () => Promise<void>): Promise<{ proposals: ProductProposal[] }> {
  void scope;
  void input;
  void heartbeat;
  return notBuiltYet("S1", "runCatalogFromPhotosJob");
}
