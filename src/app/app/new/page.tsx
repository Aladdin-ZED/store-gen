import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { authTranslator } from "@/lib/auth/i18n";
import { viewerLocale } from "@/lib/auth/locale";
import { brandName, platformSetting } from "@/lib/auth/platform-config";
import { PageTitle } from "@/app/(public)/_components/kit";
import { AppBar } from "../account/_components/app-bar";
import { NewStoreForm } from "./new-store-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: authTranslator(await viewerLocale(null))("app.new.meta") };
}

/**
 * `/app/new` (UX-01's first screen, functional in R1.0): the store's name, handle and market. Mode is landing in R1;
 * the reveal flow of the onboarding (PLA-§22.2) follows on the store's own pages.
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
        <NewStoreForm markets={setting.signup.allowedMarkets} />
      </main>
    </>
  );
}
