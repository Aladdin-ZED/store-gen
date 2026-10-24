import { LockKeyholeIcon } from "lucide-react";
import type { ReactNode } from "react";
import { authTranslator } from "@/lib/auth/i18n";
import { dirOf, type AdminLocale } from "@/lib/i18n/admin";
import { ArtPanel, daySeed } from "./art-panel";
import { LanguageMenu } from "./language-menu";

/*
 * The split layout of every sign-in screen (/login, /signup, /invite, /reset and the console's /admin/setup): the
 * stage art on large screens, a slim art band on small ones, and a calm centred form column with the language menu.
 * `lang` / `dir` are set on the shell itself (the root layout is shared with the dashboard).
 */
export function AuthShell({ locale, brand, children }: { locale: AdminLocale; brand: string; children: ReactNode }) {
  const t = authTranslator(locale);
  const seed = daySeed();
  const rtl = dirOf(locale) === "rtl";
  return (
    <div lang={locale} dir={dirOf(locale)} className="grid min-h-dvh flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <ArtPanel
        variant="full"
        idPrefix="art-full"
        seed={seed}
        brand={brand}
        rtl={rtl}
        headline={t("auth.shell.headline")}
        footnote={[t("auth.shell.footnote_a"), t("auth.shell.footnote_b")]}
        className="hidden lg:flex"
      />
      <div className="flex min-h-dvh flex-col bg-background">
        <ArtPanel variant="band" idPrefix="art-band" seed={seed} brand={brand} rtl={rtl} className="lg:hidden" />
        <div className="flex justify-end px-6 pt-5 sm:px-10">
          <LanguageMenu locale={locale} label={t("auth.shell.language")} />
        </div>
        <main className="flex flex-1 items-center justify-center px-6 py-10 sm:px-10">
          {/* the signup form widens itself (data-wide on its own wrapper); every other form keeps the narrow column */}
          <div className="w-full max-w-[22.5rem] has-[[data-wide]]:max-w-[34rem]">{children}</div>
        </main>
        <footer className="flex items-center justify-center gap-1.5 px-6 pb-6 text-xs text-muted-foreground sm:px-10">
          <LockKeyholeIcon aria-hidden="true" className="size-3.5" />
          <span>{t("auth.shell.protected")}</span>
        </footer>
      </div>
    </div>
  );
}
