import "server-only";
/**
 * The policies write (P3 LANDING; landing.md LAN-§3.3, §8.5; docs/STORE-SAAS.md D76; extracted from
 * `savePoliciesAction` at the R2 contract step C2-E for S7's AI-10 policy translations, AI-§D.3): every free-text field
 * of every locale (`extras[].text`, `returns.condition`, `warranty.text`) runs P1's live brand check first (an exact
 * protected term refuses the whole save for a member, `brand_protected`, audit `store.brand_term.refused` naming the
 * field, never the term); the save is audited `store.policies.updated`, bumps `catalog_version` (the settings writer,
 * STO-R19), queues the live pages for a `policies` re-render and revalidates the screen. `reviewed: true` (the owner's
 * own save) stamps `reviewedAt` now; `reviewed: false` (an applied AI draft the owner has not reviewed) writes it null,
 * so an unreviewed translation is never shown as reviewed. The action keeps its `storeAction` / `onceForStore` wrapper
 * and delegates here with `reviewed: true`.
 */
import { revalidateStore } from "@/lib/admin-data/shell";
import { settingsActor } from "@/lib/admin-data/store-audit";
import { auditFrom } from "@/lib/audit";
import { rerenderLive } from "@/lib/landing/rerender.server";
import { checkBrandTerms } from "@/lib/platform/brand-check";
import { setStoreSetting } from "@/lib/settings";
import { PoliciesSetting, type StorePolicyFacts } from "@/lib/settings/keys/policies";
import type { WriteCtx } from "@/lib/tenancy/types";

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

/** The whole `policies` key, through the brand check, the audit, the re-render and the revalidation (see the header). */
export async function savePolicies(ctx: WriteCtx, input: PoliciesInput, opts: { reviewed: boolean }): Promise<SavePoliciesResult> {
  const parsed = PoliciesSetting.parse({ ...input, v: 1, reviewedAt: null });
  const staff = ctx.user.platformRole !== "none";
  for (const [field, text] of freeTexts(parsed)) {
    if ((await checkBrandTerms("policy_text", text)) !== "exact" || staff) continue;
    await auditFrom(ctx, "store.brand_term.refused", { meta: { field: `policies.${field}` } });
    return { status: "brand_protected", field };
  }
  const facts = await setStoreSetting(ctx.scope, "policies", { ...parsed, reviewedAt: opts.reviewed ? new Date().toISOString() : null }, settingsActor(ctx.actor));
  await auditFrom(ctx, "store.policies.updated", { meta: { extras: facts.extras.length } });
  await rerenderLive(ctx.scope, "policies");
  revalidateStore(ctx.store.handle, "/settings/policies");
  return { status: "saved", facts };
}
