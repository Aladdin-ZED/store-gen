import "server-only";
/**
 * The store's identity as its documents show it (docs/STORE-SAAS.md §D.10, D76, DES-R16; LND-22): `stores.name`, the
 * store setting `store` (contacts, legal facts, socials) and the brand logo (`brand.logo.primary`). One reader for
 * the dashboard's thumbnails, the builder, previews and exports, so every screen renders a page with its own store's
 * footer and legal facts, never the platform's or another store's. Sanitized again by storeContext() when rendering.
 */
import type { StoreInfo } from "@/landing/context";
import { getStoreSettings } from "@/lib/settings";
import { getStoreById } from "@/lib/tenancy/public";
import type { StoreRow, StoreScope } from "@/lib/tenancy/types";

/** The identity of `store`, the scope's own row (the seam's `ctx.store`). */
export async function storeInfoOf(scope: StoreScope, store: Pick<StoreRow, "id" | "name">): Promise<StoreInfo> {
  if (store.id !== scope.storeId) throw new Error("storeInfoOf: the row is not the scope's store");
  const { store: s, brand } = await getStoreSettings(scope, ["store", "brand"]);
  const socials = Object.fromEntries(Object.entries(s.socials ?? {}).filter((e): e is [string, string] => typeof e[1] === "string" && !!e[1]));
  return {
    name: store.name,
    country: s.country,
    ...(s.legalName ? { legalName: s.legalName } : {}),
    ...(s.phone ? { phone: s.phone } : {}),
    ...(s.whatsapp ? { whatsapp: s.whatsapp } : {}),
    ...(s.email ? { email: s.email } : {}),
    ...(s.address ? { address: s.address } : {}),
    ...(s.city ? { city: s.city } : {}),
    ...(s.ice ? { ice: s.ice } : {}),
    ...(s.rc ? { rc: s.rc } : {}),
    ...(brand.logo.primary ? { logo: { id: brand.logo.primary, alt: store.name } } : {}),
    ...(Object.keys(socials).length ? { socials } : {}),
  };
}

/** The identity of the scope's store, read by id (jobs, exports); null when the store no longer exists. */
export async function storeInfoFor(scope: StoreScope): Promise<StoreInfo | null> {
  const row = await getStoreById(scope.storeId);
  return row ? storeInfoOf(scope, row) : null;
}
