"use server";
/**
 * Settings → General (P2 SHELL; platform.md PLA-§22.10.1, §22.1.5, §M.1, PD30, PD70, PD72; docs/STORE-SAAS.md §A.2,
 * D76). Every body is `return storeAction(…)` (lint L9); the store is the signed request path's (D2).
 *
 *   saveGeneralAction       settings.write   the store's name, default language, category and time zone (the core's store-row writer), the
 *                                            legal name (`store` key); brand-checked first (store_name, legal_name):
 *                                            an exact match writes nothing, audits store.brand_term.refused { field }
 *                                            and answers brand_protected; a near match saves (P1's health rule flags
 *                                            it for staff); then the store is marked for a health recompute
 *   modeSwitchPlanAction    store.mode       (read) P3's landingModeSwitchPlan: what a switch would hide and show
 *   setStoreModeAction      store.mode       R1 sells `landing` only (PD30): `store` and `both` answer feature_off
 *                                            with the release reason; from R2 the core's mode writer
 *
 * The category and the time zone go through the core's store-row writer (CCR r1-p2-4 §1, applied at the P2 merge). The
 * mode goes through the core's mode writer `updateStoreMode` (CCR r1-p2-4 §2, R2 contract step C2-B2: it needs the
 * category for store / both, runs `ensureTemplateSet` and audits `store.mode_changed`), reached only while
 * `releaseOn("R2")`.
 */
import { revalidateStore } from "@/lib/admin-data/shell";
import { settingsActor } from "@/lib/admin-data/store-audit";
import { updateStoreMode, updateStoreProfile } from "@/lib/admin-data/store-profile";
import { releaseOn } from "@/lib/auth/permissions";
import { AuthRefusal } from "@/lib/auth/errors";
import { landingModeSwitchPlan } from "@/lib/landing/mode-plan";
import { markHealthDirty } from "@/lib/platform/health-snapshot";
import { getStoreSetting, updateStoreSetting } from "@/lib/settings";
import { storeAction } from "@/lib/tenancy/seam";
import type { StoreMode } from "@/lib/tenancy/mode";
import type { ActionResult } from "@/lib/tenancy/types";
import { brandGuard, crossTrack } from "@/components/admin/shell/action-guards";
import { GeneralInput, parseInput, StoreModeInput } from "@/components/admin/shell/action-inputs";

export async function saveGeneralAction(input: unknown): Promise<ActionResult<{ fields: string[] }>> {
  return storeAction("settings.write", async (ctx) => {
    const v = parseInput(GeneralInput, input);
    // the legal name: left out = untouched, blank = cleared (the `store` key drops an empty value)
    const contacts = await getStoreSetting(ctx.scope, "store");
    const legalName = v.legalName !== undefined && v.legalName !== (contacts.legalName ?? null) ? v.legalName : undefined;

    // PD70: every brand field before any write (the name is checked again by the core's writer). `whatsapp_name` has
    // no field in R1: the `store` key holds the number only (CCR r1-p2-4 §1)
    const { near } = await brandGuard(ctx, [
      ["store_name", v.name !== undefined && v.name !== ctx.store.name ? v.name : null],
      ["legal_name", legalName ?? null],
    ]);
    const fields = await updateStoreProfile(ctx.scope, ctx.store, { name: v.name, defaultLocale: v.defaultLocale, category: v.category, timezone: v.timezone }, ctx.actor);
    if (legalName !== undefined) {
      await updateStoreSetting(ctx.scope, "store", { legalName: legalName ?? "" }, settingsActor(ctx.actor));
      fields.push("legalName");
    }
    // the ring's setup group and, on a near match, P1's brand rule read the new values on the next computation
    await markHealthDirty(ctx.store.id);
    revalidateStore(ctx.store.handle, { path: "/settings", type: "layout" }, "");
    return { fields: near ? [...fields, "brand_near"] : fields };
  });
}

export async function modeSwitchPlanAction(): Promise<ActionResult<{ livePages: number; views7d: number; suggestInStoreMode: boolean }>> {
  return storeAction("store.mode", (ctx) => crossTrack(() => landingModeSwitchPlan(ctx.scope)));
}

export async function setStoreModeAction(input: unknown): Promise<ActionResult<{ mode: StoreMode }>> {
  return storeAction("store.mode", async (ctx) => {
    const v = parseInput(StoreModeInput, input);
    if (v.mode === ctx.store.mode) return { mode: v.mode };
    if (!releaseOn("R2")) {
      // PD30: full stores ship in R2; the mode cards show the release reason (limit sheet, feature variant)
      if (v.mode !== "landing") throw new AuthRefusal("feature_off", "shell.limit.reason.release");
      // a seeded store / both shop back to landing: the core's mode writer (CCR r1-p2-4 §2)
      throw new AuthRefusal("unavailable", "error.unavailable");
    }
    // R2 (core §A.2; R2 contract step C2-B2): switching to `store` with live sales pages keeps them answering
    // (`landing.inStoreMode`) unless the owner unticked it; the core's writer needs the category for store / both
    // (`category_required`, ENGP-25) and runs ensureTemplateSet
    if (v.mode === "store") {
      const plan = await crossTrack(() => landingModeSwitchPlan(ctx.scope));
      await updateStoreSetting(ctx.scope, "landing", { inStoreMode: v.keepSalesPages && plan.livePages > 0 }, settingsActor(ctx.actor));
    }
    await updateStoreMode(ctx.scope, ctx.store, v.mode, ctx.actor);
    await markHealthDirty(ctx.store.id);
    revalidateStore(ctx.store.handle, { path: "/settings", type: "layout" }, "");
    return { mode: v.mode };
  });
}
