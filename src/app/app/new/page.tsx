import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { authTranslator } from "@/lib/auth/i18n";
import { viewerLocale } from "@/lib/auth/locale";
import { brandName, platformSetting } from "@/lib/auth/platform-config";
import { PageTitle } from "@/app/(public)/_components/kit";
import { storeUrl } from "@/lib/urls";
import { AppBar } from "../account/_components/app-bar";
import { NewStoreForm } from "./new-store-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: authTranslator(await viewerLocale(null))("app.new.meta") };
}

/**
 * `/app/new` (UX-01's first screen; PLA-§22.2, §22.1.5): the store's name and handle with the address it gets, the
 * market, and the store type (`ModeCards`: sales pages in R1, the full-store types "Coming soon" with "Tell me when it's
 * ready", PD30). The handle check refuses protected brands and the score holds an exact brand name for review; the
 * new store then opens on its welcome flow (PLA-§22.2).
 */
export default async function NewStorePage() {
  const user = await requireUser();
  const [locale, brand, setting] = await Promise.all([viewerLocale(user), brandName(), platformSetting()]);
  const t = authTranslator(locale);
  return (
    <>
      <AppBar user={user} brand={brand} locale={locale} />
      <main className="mx-auto grid w-full max-w-xl flex-1 content-start gap-8 px-4 py-10 sm:px-6 md:py-16">
        <PageTitle title={t("app.new.title")} lead={t("app.new.lead")} />
        {/* the address a new store gets (path or subdomain mode), previewed as the handle is typed */}
        <NewStoreForm markets={setting.signup.allowedMarkets} addressTemplate={storeUrl({ id: "new", handle: "__HANDLE__", primaryDomain: null }, "/")} />
      </main>
    </>
  );
}
