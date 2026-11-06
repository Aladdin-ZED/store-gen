"use server";
/**
 * Actions of Settings → Anti-spam (operations.md OPE-§M.3 P5 row, §24; core §E.2, §D.10). The platform's Turnstile
 * widget on the apex hostname covers every store subdomain; a store override (`turnstile`, needed for custom domains
 * in R3) is optional.
 *
 *   saveTurnstileOverrideAction(input)   settings.write + integrations.manage (s)   both keys or none; the secret is
 *                                        write-only: a blank or masked secret keeps the stored one, and the answer
 *                                        says only whether one is set (it is never echoed, not even masked)
 *
 * Replaces the R1.0 `saveTurnstileAction` of ../actions.ts, deleted at the P5 merge (P0b, CCR P5-10).
 */
import { z } from "zod";
import { fail } from "@/lib/admin-data/action";
import { revalidateStore } from "@/lib/admin-data/shell";
import { settingsActor } from "@/lib/admin-data/store-audit";
import { invalidateStoreRender } from "@/lib/render/cache.server";
import { getStoreSetting, isMaskedSecret, setStoreSetting } from "@/lib/settings";
import { TurnstileSetting } from "@/lib/settings/keys/turnstile";
import { storeAction } from "@/lib/tenancy/seam";
import type { ActionResult } from "@/lib/tenancy/types";

const Input = z.object({
  siteKey: z.string().max(200).optional(),
  /** "" or a mask (the form never holds the stored secret) = keep the stored one */
  secretKey: z.string().max(300).optional(),
  /** true: remove the override (the platform's widget protects the forms again) */
  clear: z.boolean().optional(),
});

export interface TurnstileOverrideView {
  siteKey: string | null;
  secretSet: boolean;
}

/** Save or clear the store's own Turnstile keys. */
export async function saveTurnstileOverrideAction(input: z.input<typeof Input>): Promise<ActionResult<TurnstileOverrideView>> {
  return storeAction(["settings.write", "integrations.manage"], async (ctx) => {
    const v = Input.parse(input ?? {});
    const current = await getStoreSetting(ctx.scope, "turnstile", { fresh: true });
    let next: { siteKey?: string; secretKey?: string };
    if (v.clear) next = { siteKey: undefined, secretKey: undefined };
    else {
      const typedSecret = v.secretKey === undefined || isMaskedSecret(v.secretKey) ? "" : v.secretKey.trim();
      const parsed = TurnstileSetting.parse({ siteKey: v.siteKey?.trim() || undefined, secretKey: typedSecret || undefined });
      next = { siteKey: parsed.siteKey, secretKey: parsed.secretKey ?? current.secretKey };
      // both keys or none: they work together
      if (!!next.siteKey !== !!next.secretKey) fail("int.err.turnstile_both_keys");
    }
    // a whole value (a cleared key is "", stored as missing): the secret comes from the form or the stored row, never back
    const saved = await setStoreSetting(ctx.scope, "turnstile", { siteKey: next.siteKey ?? "", secretKey: next.secretKey ?? "" }, settingsActor(ctx.actor));
    invalidateStoreRender(ctx.store.id);
    revalidateStore(ctx.store.handle, "/settings/anti-spam");
    return { siteKey: saved.siteKey ?? null, secretSet: !!saved.secretKey };
  });
}
