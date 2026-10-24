import type { Metadata } from "next";
import { StoreForm } from "@/components/admin/settings/store-form";
import { assetToJson, getAsset } from "@/lib/media";
import { getStoreSettings } from "@/lib/settings";
import { requireStoreMember } from "@/lib/tenancy/seam";
import { saveStoreAction } from "../actions";

export const metadata: Metadata = { title: "Store & legal" };

type Params = Promise<{ store: string }>;

/** Settings → Store & legal: the store's name (its row), logo (its brand key) and contacts and legal facts (its `store` key). */
export default async function StoreSettingsPage({ params }: { params: Params }) {
  const ctx = await requireStoreMember({ handle: (await params).store, permission: "settings.read" });
  const { store, brand } = await getStoreSettings(ctx.scope, ["store", "brand"]);
  // the logo is a file of this store's library (another store's id reads as missing)
  const logo = brand.logo.primary ? await getAsset(ctx.scope, brand.logo.primary) : null;
  return (
    <StoreForm
      initial={{
        storeName: ctx.store.name,
        legalName: store.legalName ?? "",
        logo: logo ? { id: logo.id, alt: ctx.store.name } : undefined,
        phone: store.phone ?? "",
        whatsapp: store.whatsapp ?? "",
        email: store.email ?? "",
        address: store.address ?? "",
        city: store.city ?? "",
        country: store.country,
        ice: store.ice ?? "",
        rc: store.rc ?? "",
        socials: {
          facebook: store.socials.facebook ?? "",
          instagram: store.socials.instagram ?? "",
          tiktok: store.socials.tiktok ?? "",
          youtube: store.socials.youtube ?? "",
          snapchat: store.socials.snapchat ?? "",
        },
      }}
      logoUrl={logo ? assetToJson(logo).thumbUrl : null}
      canWrite={ctx.can("settings.write")}
      save={saveStoreAction}
    />
  );
}
