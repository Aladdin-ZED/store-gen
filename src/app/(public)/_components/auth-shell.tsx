import { LockKeyholeIcon } from "lucide-react";
import type { ReactNode } from "react";
import { authTranslator } from "@/lib/auth/i18n";
import { dirOf, type AdminLocale } from "@/lib/i18n/admin";
import { BrandPanel, Wordmark } from "./art-panel";
import { LanguageMenu } from "./language-menu";

/*
 * The layout of every sign-in screen (/login, /signup, /invite, /reset and the console's /admin/setup; platform.md
 * PLA-§22.1): from 1024 px a 440 px form column on the start side and the quiet brand panel filling the rest (the grid
 * follows `dir`, so Arabic puts the form on the right); below, one column with the wordmark on top. The language
 * switcher sits at the column's top end. `lang` / `dir` are set on the shell itself (the root layout is shared with
 * the dashboard).
 */
export function AuthShell({ locale, brand, children }: { locale: AdminLocale; brand: string; children: ReactNode }) {
  const t = authTranslator(locale);
  return (
    <div lang={locale} dir={dirOf(locale)} className="grid min-h-dvh flex-1 lg:grid-cols-[minmax(0,34rem)_minmax(0,1fr)]">
      <div className="flex min-h-dvh min-w-0 flex-col bg-background">
        <header className="flex h-14 items-center justify-between gap-4 px-4 sm:h-16 sm:px-10 lg:h-20 lg:px-12">
          <Wordmark brand={brand} className="lg:invisible" />
          <LanguageMenu locale={locale} label={t("auth.shell.language")} />
        </header>
        <main className="flex flex-1 justify-center px-4 pt-3 pb-8 sm:items-center sm:px-10 sm:py-10 lg:px-12">
          <div className="w-full max-w-[27.5rem]">{children}</div>
        </main>
        <footer className="flex items-center justify-center gap-1.5 px-4 pb-6 text-xs text-muted-foreground sm:px-10">
          <LockKeyholeIcon aria-hidden="true" className="size-3.5 shrink-0" />
          <span>{t("auth.shell.protected")}</span>
        </footer>
      </div>
      <BrandPanel
        brand={brand}
        rtl={dirOf(locale) === "rtl"}
        headline={t("auth.shell.headline")}
        values={[t("auth.shell.value.1"), t("auth.shell.value.2"), t("auth.shell.value.3")]}
        className="hidden lg:flex"
      />
    </div>
  );
}
