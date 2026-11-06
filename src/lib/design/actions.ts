"use server";
/**
 * Design server actions (P6 DESIGN; design.md DES-§9.8; docs/STORE-SAAS.md §K.2 P0 design stubs, CRIT2-6, §E.2).
 * `checkHeadlinesAction` is the `storeAction` wrapper of `checkHeadlineNovelty` that the wizard and P7's
 * `useNoveltyGuard({ check: checkHeadlinesAction })` call before a generated headline or lead is shown: ≤ 60 lines,
 * `pages.write`, `design:headlines` 60 / 10 min per store (`storeBucket(scope, "design:headlines")`, refused at call
 * 61). Frozen at P0 (src/lib/contracts/r1-p0.ts); the answer is `{ verdict, band }` per line, never a number.
 *
 * `nicheSharesAction` (step 9, DES-§7.4, DS49): the niche's coarse shares for the sampler (H33, the 4-gram rule, S26
 * pairs) through the same `design:novelty` bucket as the novelty check: value → share maps rounded to 10 % over
 * ≥ 10 stores, refreshed hourly, never a store id or a count.
 *
 * Step 12 (the builder, DES-§15.1, DES-§15.4): `designContextAction` (pages.read; the generation record, the
 * provenance, the brand), `pageNoveltyAction` (pages.write; the page and ≤ 6 variants, one charge of the `design:novelty` bucket) and
 * `setBrandLockAction` (brand.write; `design:brand-lock` 30 / 10 min per store).
 */
import { z } from "zod";
import { ProductCategory } from "@/lib/page/schema";
import { storeAction } from "@/lib/tenancy/seam";
import type { ActionResult } from "@/lib/tenancy/types";
import { checkHeadlineNovelty, HEADLINE_LINES_MAX, HEADLINE_RATE, type HeadlineVerdict } from "./headlines.server";
import { loadNicheShares, NOVELTY_RATE, type NicheShares, type NoveltyVerdict } from "./novelty.server";
import { settingsActor } from "@/lib/admin-data/store-audit";
import { LOCK_GENES, type BrandLite } from "./brand-apply";
import { designContextOf, pageNovelty, writeBrandLock, type DesignContext } from "./builder.server";

const HeadlinesInput = z.object({
  niche: z.string().trim().min(1).max(64),
  texts: z.array(z.string().max(400)).max(HEADLINE_LINES_MAX),
});

export async function checkHeadlinesAction(niche: string, texts: readonly string[]): Promise<ActionResult<HeadlineVerdict[]>> {
  return storeAction(
    "pages.write",
    async (ctx) => {
      const input = HeadlinesInput.parse({ niche, texts });
      return checkHeadlineNovelty(ctx.scope, input.niche, input.texts);
    },
    { rate: { ...HEADLINE_RATE } },
  );
}

const NicheKey = z.string().trim().regex(/^[A-Z]{2,8}:[a-z][a-z0-9-]{0,39}$/);

export async function nicheSharesAction(niche: string): Promise<ActionResult<NicheShares>> {
  return storeAction("pages.write", async () => loadNicheShares(NicheKey.parse(niche)), { rate: { ...NOVELTY_RATE } });
}

/* ------------------------------------------------------------------ */
/* the builder (step 12, DES-§15.1, DES-§15.4)                         */
/* ------------------------------------------------------------------ */

const PageId = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/);

/** The Design check panel's and the DNA card's context: generation record, provenance, brand, brand.write. */
export async function designContextAction(pageId: string): Promise<ActionResult<DesignContext>> {
  return storeAction("pages.read", async (ctx) => designContextOf(ctx.scope, PageId.parse(pageId), ctx.can("brand.write")));
}

const NoveltyPageInput = z.object({
  pageId: PageId,
  market: z.string().regex(/^[A-Z]{2,8}$/).nullable(),
  product: z.object({ category: ProductCategory.nullable(), name: z.string().max(200).nullable(), tagline: z.string().max(400).nullable() }),
  candidates: z.array(z.object({ key: z.string().trim().min(1).max(64), vec: z.array(z.number().int().min(-32768).max(32767)).min(8).max(512) })).min(1).max(7),
});

/** The panel's novelty bands for the page and its Differentiate variants (one call, the `design:novelty` bucket: 60 / 10 min per store, refused at 61). */
export async function pageNoveltyAction(input: z.input<typeof NoveltyPageInput>): Promise<ActionResult<NoveltyVerdict[]>> {
  return storeAction("pages.write", async (ctx) => pageNovelty(ctx.scope, NoveltyPageInput.parse(input)));
}

const BrandLockInput = z.object({ gene: z.enum(LOCK_GENES), on: z.boolean(), value: z.string().max(48).nullable() });

/** The DNA card's "Lock for my brand" (brand.write; the core audits the setting write). */
export async function setBrandLockAction(input: z.input<typeof BrandLockInput>): Promise<ActionResult<BrandLite>> {
  return storeAction(
    "brand.write",
    async (ctx) => {
      const { gene, on, value } = BrandLockInput.parse(input);
      return writeBrandLock(ctx.scope, settingsActor(ctx.actor), gene, on, value);
    },
    { rate: { name: "design:brand-lock", limit: 30, windowSec: 600, per: "store" } },
  );
}
