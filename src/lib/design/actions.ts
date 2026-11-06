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
 */
import { z } from "zod";
import { storeAction } from "@/lib/tenancy/seam";
import type { ActionResult } from "@/lib/tenancy/types";
import { checkHeadlineNovelty, HEADLINE_LINES_MAX, HEADLINE_RATE, type HeadlineVerdict } from "./headlines.server";
import { loadNicheShares, NOVELTY_RATE, type NicheShares } from "./novelty.server";

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
