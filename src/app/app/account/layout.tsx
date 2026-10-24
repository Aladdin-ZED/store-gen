import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth";
import { authTranslator } from "@/lib/auth/i18n";
import { viewerLocale } from "@/lib/auth/locale";
import { brandName } from "@/lib/auth/platform-config";
import { AccountNav } from "./_components/account-nav";
import { AppBar } from "./_components/app-bar";

/*
 * `/app/account/**` (docs/STORE-SAAS.md §B.1, §I.1; PLA-§22.5): the signed-in user's own account, no store. A staff
 * member viewing a store sees their own account here (§B.8). Every page and action re-checks the session itself.
 */
export default async function AccountLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const [locale, brand] = await Promise.all([viewerLocale(user), brandName()]);
  const t = authTranslator(locale);
  return (
    <>
      <AppBar user={user} brand={brand} locale={locale} />
      <div className="mx-auto grid w-full max-w-6xl flex-1 gap-8 px-4 py-8 sm:px-6 md:grid-cols-[13rem_minmax(0,1fr)] md:py-12">
        <aside className="grid content-start gap-4">
          <div className="hidden gap-0.5 md:grid">
            <p className="text-[0.8rem] text-muted-foreground">{t("account.title")}</p>
            <p className="truncate text-sm font-medium">{user.email}</p>
          </div>
          <AccountNav />
        </aside>
        <main className="grid min-w-0 content-start gap-6">{children}</main>
      </div>
    </>
  );
}
