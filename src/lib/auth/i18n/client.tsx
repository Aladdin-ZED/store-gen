"use client";
/**
 * `useAuthT()` for the identity surfaces' client components: the locale of the nearest `AdminI18nProvider` (the
 * public and dashboard layouts set it), English without one. See ./index.ts.
 */
import { useMemo } from "react";
import { useAdminLocale } from "@/lib/i18n/admin/client";
import { authTranslator } from "./index";

export function useAuthT(): ReturnType<typeof authTranslator> {
  const locale = useAdminLocale();
  return useMemo(() => authTranslator(locale), [locale]);
}
