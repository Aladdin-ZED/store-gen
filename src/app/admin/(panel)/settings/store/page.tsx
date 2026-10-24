import type { Metadata } from "next";
import { StoreForm } from "@/components/admin/settings/store-form";
import { legacyStoreCtx } from "@/lib/admin-data/legacy-store";
import { can, requireUser } from "@/lib/auth";
import { AuthError } from "@/lib/auth/errors";
import { assetToJson, getAsset } from "@/lib/media";
import { SeamError } from "@/lib/tenancy/seam";
import { getSetting } from "@/lib/settings";
import { saveStoreAction } from "../actions";

export const metadata: Metadata = { title: "Store & legal" };

export default async function StoreSettingsPage() {
  const user = await requireUser({ permission: "settings.read" });
  const store = await getSetting("store", { fresh: true });
  const logo = store.logo ? await storeAsset(store.logo.id) : null;
  return (
    <StoreForm
      initial={{
        storeName: store.storeName,
        legalName: store.legalName ?? "",
        logo: store.logo,
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
      canWrite={can(user.role, "settings.write")}
      save={saveStoreAction}
    />
  );
}

/** The logo's row in store #1's library (the legacy panel's store); none when the viewer isn't one of its members. */
async function storeAsset(id: string) {
  try {
    const ctx = await legacyStoreCtx({ throwOnFail: true });
    return await getAsset(ctx.scope, id);
  } catch (err) {
    if (err instanceof AuthError || err instanceof SeamError) return null;
    throw err;
  }
}
