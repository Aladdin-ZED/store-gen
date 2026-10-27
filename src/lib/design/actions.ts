"use server";
/**
 * Design server actions (P6 DESIGN; design.md DES-§9.8; docs/STORE-SAAS.md §K.2 P0 design stubs, CRIT2-6, §E.2).
 * `checkHeadlinesAction` is the `storeAction` wrapper of `checkHeadlineNovelty` that the wizard and P7's
 * `useNoveltyGuard({ check: checkHeadlinesAction })` call before a generated headline or lead is shown: ≤ 60 lines,
 * `pages.write`, `design:headlines` 60 / 10 min per store. Frozen at P0 (src/lib/contracts/r1-p0.ts); the body
 * answers whatever `checkHeadlineNovelty` answers (its P0 stub: `ok` / no band per line).
 */
import { z } from "zod";
import { storeAction } from "@/lib/tenancy/seam";
import type { ActionResult } from "@/lib/tenancy/types";
import { checkHeadlineNovelty, type HeadlineVerdict } from "./headlines.server";

const HeadlinesInput = z.object({
  niche: z.string().trim().min(1).max(64),
  texts: z.array(z.string().max(400)).max(60),
});

export async function checkHeadlinesAction(niche: string, texts: readonly string[]): Promise<ActionResult<HeadlineVerdict[]>> {
  return storeAction(
    "pages.write",
    async (ctx) => {
      const input = HeadlinesInput.parse({ niche, texts });
      return checkHeadlineNovelty(ctx.scope, input.niche, input.texts);
    },
    { rate: { name: "design:headlines", limit: 60, windowSec: 600, per: "store" } },
  );
}
