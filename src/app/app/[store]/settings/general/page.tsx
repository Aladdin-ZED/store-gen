import type { Metadata } from "next";
import { screenLocale, screenLocalesFor } from "@/components/admin/shell/store-nav";
import { storeRowFacts } from "@/lib/admin-data/dashboard";
import { viewerLocale } from "@/lib/auth/locale";
import { t } from "@/lib/i18n/admin";
import { assetToJson, getAsset } from "@/lib/media";
import { getStoreSettings } from "@/lib/settings";
import { requireStoreMember } from "@/lib/tenancy/seam";
import { appHref } from "@/lib/urls";
import { saveStoreAction } from "../actions";
import { memberCtx } from "../../member-ctx";
import { modeSwitchPlanAction, saveGeneralAction, setStoreModeAction } from "./actions";
import { ContactForm } from "./_components/contact-form";
import { GeneralForm } from "./_components/general-form";
import { ModePanel } from "./_components/mode-panel";

type Props = { params: Promise<{ store: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { user } = await memberCtx((await params).store);
  return {
    title: t("shell.general.title", undefined, screenLocale(await viewerLocale(user), screenLocalesFor("/settings/general"))),
  };
}

/**
 * Settings → General (P2 SHELL; platform.md PLA-§22.10.1, §22.1.5, TN-09, PD70, PD72; D73), `settings.read`:
 *
 * - the store: name, legal name, category, default language and time zone (confirm sheet), the store id (Copy) and
 *   creation date → `saveGeneralAction` (brand-checked first; an exact match saves nothing and explains);
 * - the store type: the three `ModeCards` and the "hide, never delete" switch sheet with P3's plan (`store.mode`);
 * - contact and legal details, logo and social profiles (the `store` key and the brand logo) → T4's `saveStoreAction`,
 *   sent with the stored name and legal name so both keep their brand-checked writer above;
 * - no opening hours here: "Calling hours are set in Call center" (D73, OPS-11).
 */
export default async function GeneralSettingsPage({ params }: Props) {
  const ctx = await requireStoreMember({
    handle: (await params).store,
    permission: "settings.read",
  });
  const [{ store, brand }, facts] = await Promise.all([getStoreSettings(ctx.scope, ["store", "brand"]), storeRowFacts(ctx.scope)]);
  // the logo is a file of this store's library (another store's id reads as missing)
  const logo = brand.logo.primary ? await getAsset(ctx.scope, brand.logo.primary) : null;
  const canWrite = ctx.can("settings.write");
  const locale = ctx.store.defaultLocale === "ar" || ctx.store.defaultLocale === "fr" || ctx.store.defaultLocale === "en" ? ctx.store.defaultLocale : "fr";

  return (
    <>
      <GeneralForm
        initial={{
          name: ctx.store.name,
          legalName: store.legalName ?? "",
          category: facts.category,
          defaultLocale: locale,
          timezone: ctx.store.timezone,
        }}
        storeId={ctx.store.id}
        createdAt={facts.createdAt.toISOString()}
        canWrite={canWrite}
        save={saveGeneralAction}
      />
      <ModePanel mode={ctx.store.mode} category={facts.category} canChange={ctx.can("store.mode")} plan={modeSwitchPlanAction} setMode={setStoreModeAction} />
      <ContactForm
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
        canWrite={canWrite}
        canLogo={ctx.can("brand.write")}
        hoursHref={ctx.can("callcenter.configure") ? appHref(ctx.store.handle, "/team/callcenter") : null}
        save={saveStoreAction}
      />
    </>
  );
}
