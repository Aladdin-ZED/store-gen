"use server";
/**
 * Actions of Connect → Pixels, the **Server events** card (operations.md OPE-§M.3 P5 rows, §20.2, §20.3, §20.7; core
 * §E.2, §B.7, §F.5). The pixel library's own actions stay in src/lib/pixels/actions.ts.
 *
 *   saveConversionsAction(input)   integrations.manage · pixels_capi · fresh step-up   the Purchase trigger, custom
 *                                  events, manual orders, ≤ 200 per-page overrides (the store's own pages); the live
 *                                  pages whose trigger changed are re-rendered (`applyConversionsChange`)
 *   sendTestEventAction(input?)    integrations.manage · pixels_capi   the same test event as the library's button;
 *                                  without a pixel (⌘K) the store's first pixel with a token and a test code
 */
import { revalidateStore } from "@/lib/admin-data/shell";
import { settingsActor } from "@/lib/admin-data/store-audit";
import type { TestEventResult } from "@/lib/orders/conversions-core";
import { applyConversionsChange, ownConversionPages } from "@/lib/orders/conversions";
import { runPixelTest, type SendTestInput } from "@/lib/pixels/test-event.server";
import { getStoreSetting, setStoreSetting } from "@/lib/settings";
import { ConversionsSetting } from "@/lib/settings/keys/conversions";
import { requireStepUp, SeamError, storeAction } from "@/lib/tenancy/seam";
import type { ActionResult } from "@/lib/tenancy/types";

export interface SaveConversionsResult {
  trigger: ConversionsSetting["purchaseTrigger"];
  overrides: number;
  /** live pages re-rendered because their effective trigger changed */
  pages: number;
}

/** Saves the store's `conversions` setting (OPE-§20.2) and applies the change (renders, health, audit). */
export async function saveConversionsAction(input: unknown): Promise<ActionResult<SaveConversionsResult>> {
  return storeAction(
    "integrations.manage",
    async (ctx) => {
      // the trigger decides what ad platforms learn from: a step-up-gated write, named on the audit row (§F.5 rev 4)
      const stepUp = requireStepUp(ctx);
      const next = ConversionsSetting.parse(input);
      const ids = Object.keys(next.pageOverrides);
      const own = await ownConversionPages(ctx.scope, ids);
      // another store's page id answers what a missing one answers (core §E.3)
      if (ids.some((id) => !own.has(id))) throw new SeamError("not_found");
      const before = await getStoreSetting(ctx.scope, "conversions", { fresh: true });
      await setStoreSetting(ctx.scope, "conversions", next, settingsActor(ctx.actor));
      const r = await applyConversionsChange(ctx.scope, before, next, ctx.actor, { stepUp });
      revalidateStore(ctx.store.handle, "/integrations/pixels", "/integrations");
      return { trigger: next.purchaseTrigger, overrides: ids.length, pages: r.pages.length };
    },
    { feature: "pixels_capi" },
  );
}

/** "Send test event" of the Server-events card and of ⌘K (OPE-§20.7, §27.7). */
export async function sendTestEventAction(input?: SendTestInput | null): Promise<ActionResult<TestEventResult>> {
  return storeAction("integrations.manage", (ctx) => runPixelTest(ctx, input ?? null), { feature: "pixels_capi" });
}
