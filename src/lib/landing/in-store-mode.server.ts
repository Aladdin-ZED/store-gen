import "server-only";
/**
 * The landing fallback of a `store`-mode shop (P3 LANDING; landing.md LAN-§4 "Fallback only", core §A.2): onboarding in
 * `store` mode creates no landing page, but when any path still creates one there (Pages → New, a duplicate, an
 * import), the creating action sets `landing.inStoreMode = true` with it, so a saved draft is never hidden behind a
 * 404. Audited `store.landing_settings.updated` with the creating action's reason. `landing` and `both` modes show
 * landing pages anyway: nothing is written there.
 */
import { auditIn, settingsActor } from "@/lib/admin-data/store-audit";
import { getStoreSetting, updateStoreSetting } from "@/lib/settings";
import type { StoreMode } from "@/lib/tenancy/mode";
import type { WriteCtx, WriteScope } from "@/lib/tenancy/types";

export type InStoreModeReason = "page_created" | "page_duplicated" | "onboarding";

/** Does a page created in this mode need the fallback? Pure. */
export const needsInStoreMode = (mode: StoreMode, inStoreMode: boolean): boolean => mode === "store" && !inStoreMode;

/**
 * Turns `landing.inStoreMode` on for a `store`-mode shop that creates a landing page; true when it wrote (the
 * confirmation then says "Your first page is a sales page; your store home is being built").
 */
export async function ensureLandingInStoreMode(ctx: Pick<WriteCtx, "store" | "actor"> & { scope: WriteScope }, reason: InStoreModeReason): Promise<boolean> {
  if (ctx.store.mode !== "store") return false;
  const current = await getStoreSetting(ctx.scope, "landing", { fresh: true });
  if (current.inStoreMode) return false;
  await updateStoreSetting(ctx.scope, "landing", { inStoreMode: true }, settingsActor(ctx.actor));
  await auditIn(ctx.scope, ctx.actor, "store.landing_settings.updated", { target: "landing", meta: { inStoreMode: true, reason } });
  return true;
}
