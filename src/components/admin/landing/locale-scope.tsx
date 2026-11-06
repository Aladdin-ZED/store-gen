/**
 * The viewer's language around a landing screen (P3 LANDING; core §I.5, D36; LAN-§24.1: the inbox is ar / fr / en).
 * The store shell still renders in English until P2's shell reads `users.locale`; this scope gives the screen the
 * member's own language and direction now, and is a no-op once the shell's provider carries the same locale.
 */
import type { ReactNode } from "react";
import { dirOf, type AdminLocale } from "@/lib/i18n/admin";
import { AdminI18nProvider } from "@/lib/i18n/admin/client";

export function LocaleScope({ locale, children }: { locale: AdminLocale; children: ReactNode }) {
  return (
    <AdminI18nProvider locale={locale}>
      <div lang={locale} dir={dirOf(locale)} className="contents">
        {children}
      </div>
    </AdminI18nProvider>
  );
}
