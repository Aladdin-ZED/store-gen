"use client";
/**
 * The language a part of the dashboard renders in (docs/STORE-SAAS.md §I.5, D36; PLA-§22 intro, §22.18 row 7).
 *
 * - `LocaleRoot` sets one locale on its subtree: the catalog (`AdminI18nProvider`), `lang` and `dir` on a
 *   `display: contents` wrapper (CSS direction, the `[lang="ar"]` type rules and the `rtl:` variants follow it), and
 *   Radix's direction context, so menus, popovers and sliders that portal out of the wrapper still lay out in the
 *   reading direction.
 * - `ScreenLocale` is a screen's opt-in: the viewer's locale (from the nearest provider: the store layout sets
 *   `users.locale`) when the screen supports it, else English, left to right. The store frame wraps every screen in
 *   it with the route's list from `screenLocalesFor()` (./store-nav.ts); another track opts its screen in by wrapping
 *   the screen's root itself (a nested wrapper overrides).
 *
 *   <ScreenLocale supported={["en", "fr", "ar"]}>…</ScreenLocale>
 */
import { Direction } from "radix-ui";
import type { ReactNode } from "react";
import { dirOf, type AdminLocale } from "@/lib/i18n/admin";
import { AdminI18nProvider, useAdminLocale } from "@/lib/i18n/admin/client";
import { screenLocale } from "../shell/store-nav";

export function LocaleRoot({ locale, children }: { locale: AdminLocale; children: ReactNode }) {
  const dir = dirOf(locale);
  return (
    <AdminI18nProvider locale={locale}>
      <Direction.Provider dir={dir}>
        <div lang={locale} dir={dir} className="contents">
          {children}
        </div>
      </Direction.Provider>
    </AdminI18nProvider>
  );
}

export function ScreenLocale({ supported, children }: { supported: readonly AdminLocale[]; children: ReactNode }) {
  const viewer = useAdminLocale();
  return <LocaleRoot locale={screenLocale(viewer, supported)}>{children}</LocaleRoot>;
}
