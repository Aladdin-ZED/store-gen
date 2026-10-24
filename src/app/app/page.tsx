import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { buckets, peekBucket } from "@/lib/auth/attempts";
import { authTranslator } from "@/lib/auth/i18n";
import { landingPathFor, switcherData } from "@/lib/auth/landing";
import { viewerLocale } from "@/lib/auth/locale";
import { brandName } from "@/lib/auth/platform-config";
import { PageTitle } from "@/app/(public)/_components/kit";
import { AppBar } from "./account/_components/app-bar";
import { StorePicker } from "./account/_components/store-picker";

export async function generateMetadata(): Promise<Metadata> {
  return { title: authTranslator(await viewerLocale(null))("app.picker.meta") };
}

/** Today's `p:store:create:<userId>` allowance (3 a day, §B.1): the "Create a store" card hides at the limit. */
const STORES_PER_DAY = 3;

/**
 * `/app` (docs/STORE-SAAS.md §B.4, PLA-§22.3): with two or more stores that open, the picker; otherwise where
 * `landingPathFor` says (no store → /app/new, or the console for staff; one store → its dashboard, agents their
 * queue). The last store this session opened comes first.
 */
export default async function AppHomePage() {
  const user = await requireUser();
  const data = await switcherData(user);
  const usable = data.stores.filter((s) => s.usable);
  if (usable.length < 2) redirect(landingPathFor(data.stores, null, user.platformRole));

  const [locale, brand, created] = await Promise.all([viewerLocale(user), brandName(), peekBucket(buckets.storeCreate(user.id))]);
  const t = authTranslator(locale);
  const stores = [...data.stores].sort((a, b) => Number(b.storeId === user.lastStoreId) - Number(a.storeId === user.lastStoreId) || Number(b.usable) - Number(a.usable));
  return (
    <>
      <AppBar user={user} brand={brand} locale={locale} />
      <main className="mx-auto grid w-full max-w-6xl flex-1 content-start gap-8 px-4 py-10 sm:px-6 md:py-14">
        <PageTitle title={t("app.picker.title")} lead={t("app.picker.lead", { count: usable.length })} />
        <StorePicker stores={stores} canCreate={created < STORES_PER_DAY} console={data.console} />
      </main>
    </>
  );
}
