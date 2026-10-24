"use client";
/**
 * `useT()` for client components (docs/STORE-SAAS.md §I.5): the locale comes from the nearest `AdminI18nProvider`
 * (the shell sets it from `users.locale`, P2), English without one. Maintainer-owned with ./index.ts.
 */
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { translator, type AdminLocale, type MessageKey, type MessageVars } from "./index";

const LocaleContext = createContext<AdminLocale>("en");

export function AdminI18nProvider({ locale, children }: { locale: AdminLocale; children: ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useAdminLocale(): AdminLocale {
  return useContext(LocaleContext);
}

export function useT(): (key: MessageKey, vars?: MessageVars) => string {
  const locale = useContext(LocaleContext);
  return useMemo(() => translator(locale), [locale]);
}
