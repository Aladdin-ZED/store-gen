import "server-only";
/**
 * The store's own row fields that Settings edits (docs/STORE-SAAS.md §D.2, §D.10 SET-08): `stores.name` (authoritative,
 * every write runs the live brand check, D76) and the market, currency and default locale that moved out of the
 * legacy `defaults` key. Writes take a `WriteScope` and touch only the scope's row; the store caches forget it
 * (`invalidateStore`) and the change is audited in the store.
 */
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { stores } from "@/lib/db/schema";
import { checkBrandTerms } from "@/lib/platform/brand-check";
import { invalidateStoreRender } from "@/lib/render/cache.server";
import { invalidateStore } from "@/lib/tenancy/cache";
import type { StoreRow, WriteScope } from "@/lib/tenancy/types";
import { ActionError } from "./action";
import { auditIn, type Actor } from "./store-audit";

export interface StoreProfilePatch {
  name?: string;
  market?: string;
  currency?: string;
  defaultLocale?: string;
}

const NAME_MAX = 120;

/**
 * Applies the fields of `patch` that differ from `current` (the scope's own row, the seam's ctx.store). Throws
 * ActionError for a refused name (never says which protected term matched). Returns the changed field names.
 */
export async function updateStoreProfile(scope: WriteScope, current: StoreRow, patch: StoreProfilePatch, actor: Actor): Promise<string[]> {
  if (current.id !== scope.storeId) throw new Error("updateStoreProfile: the row is not the scope's store");
  const set: Partial<Record<keyof StoreProfilePatch, string>> = {};
  if (patch.name !== undefined) {
    const name = patch.name.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
    if (!name) throw new ActionError("Enter the store name.");
    if (name.length > NAME_MAX) throw new ActionError(`Keep the store name under ${NAME_MAX} characters.`);
    if (name !== current.name) {
      if ((await checkBrandTerms("store_name", name)) === "exact") throw new ActionError("This name can't be used for a store. Choose another one.");
      set.name = name;
    }
  }
  if (patch.market !== undefined && patch.market !== current.market) set.market = patch.market;
  if (patch.currency !== undefined && patch.currency !== current.currency) set.currency = patch.currency;
  if (patch.defaultLocale !== undefined && patch.defaultLocale !== current.defaultLocale) set.defaultLocale = patch.defaultLocale;
  const fields = Object.keys(set);
  if (!fields.length) return [];

  await db.update(stores).set(set).where(eq(stores.id, scope.storeId));
  invalidateStore(scope.storeId);
  // footers, legal pages and the order form read the store's identity and currency at request time
  invalidateStoreRender(scope.storeId);
  await auditIn(scope, actor, "store.profile_updated", { target: scope.storeId, meta: { fields } });
  return fields;
}
