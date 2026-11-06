"use server";
/**
 * The policies editor's write (P3 LANDING; landing.md LAN-§3.3, §8.5, §23.1; docs/STORE-SAAS.md D76, §I.8): the whole
 * `policies` key, `return storeAction("settings.write", …)` with the browser's op id. Every free-text field of every
 * locale (`extras[].text`, `returns.condition`, `warranty.text`) runs P1's live brand check first: an exact protected
 * term refuses the whole save for a member (`brand_protected`, audit `store.brand_term.refused` naming the field,
 * never the term), a near one saves (P1 writes the console flag). A save sets `reviewedAt`, is audited
 * `store.policies.updated` and queues the live pages for a `store_info` re-render (their thank-you steps change); the
 * legal pages read the facts at serve time, so they change at once.
 */
import { revalidateStore } from "@/lib/admin-data/shell";
import { settingsActor } from "@/lib/admin-data/store-audit";
import { auditFrom } from "@/lib/audit";
import { onceForStore } from "@/lib/landing/op-once.server";
import { rerenderLive } from "@/lib/landing/rerender.server";
import { checkBrandTerms } from "@/lib/platform/brand-check";
import { setStoreSetting } from "@/lib/settings";
import { PoliciesSetting, type StorePolicyFacts } from "@/lib/settings/keys/policies";
import { storeAction } from "@/lib/tenancy/seam";
import type { ActionResult } from "@/lib/tenancy/types";

export type PoliciesInput = Omit<StorePolicyFacts, "v" | "reviewedAt">;
export type SavePoliciesResult = { status: "saved"; facts: StorePolicyFacts } | { status: "brand_protected"; field: string };

const LOCALES = ["ar", "fr", "en"] as const;

/** Every free-text field of the setting as [path, text] ("extras.0.text.fr"). */
function freeTexts(p: StorePolicyFacts): [string, string][] {
  const out: [string, string][] = [];
  const add = (path: string, loc: Partial<Record<(typeof LOCALES)[number], string>> | undefined) => {
    for (const l of LOCALES) {
      const v = loc?.[l]?.trim();
      if (v) out.push([`${path}.${l}`, v]);
    }
  };
  add("returns.condition", p.returns.condition);
  add("warranty.text", p.warranty.text);
  p.extras.forEach((e, i) => add(`extras.${i}.text`, e.text));
  return out;
}

export async function savePoliciesAction(opId: string, input: PoliciesInput): Promise<ActionResult<SavePoliciesResult>> {
  return storeAction("settings.write", (ctx) =>
    onceForStore(ctx.scope, opId, async (): Promise<SavePoliciesResult> => {
      const parsed = PoliciesSetting.parse({ ...input, v: 1, reviewedAt: null });
      const staff = ctx.user.platformRole !== "none";
      for (const [field, text] of freeTexts(parsed)) {
        if ((await checkBrandTerms("policy_text", text)) !== "exact" || staff) continue;
        await auditFrom(ctx, "store.brand_term.refused", { meta: { field: `policies.${field}` } });
        return { status: "brand_protected", field };
      }
      const facts = await setStoreSetting(ctx.scope, "policies", { ...parsed, reviewedAt: new Date().toISOString() }, settingsActor(ctx.actor));
      await auditFrom(ctx, "store.policies.updated", { meta: { extras: facts.extras.length } });
      await rerenderLive(ctx.scope, "policies");
      revalidateStore(ctx.store.handle, "/settings/policies");
      return { status: "saved", facts };
    }),
  );
}
