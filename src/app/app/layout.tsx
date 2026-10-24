import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AdminProviders } from "@/components/admin/shell/providers";
import { getCspNonce, requireUser } from "@/lib/auth";
import { viewerLocale } from "@/lib/auth/locale";
import { brandName } from "@/lib/auth/platform-config";
import { dirOf } from "@/lib/i18n/admin";
import { AdminI18nProvider } from "@/lib/i18n/admin/client";

/*
 * Root of the tenant dashboard (docs/STORE-SAAS.md §I.1): the session only (`requireUser`, no store, no gate). The
 * store layout below (`[store]/layout.tsx`) resolves the membership and renders the shell; a layout never replaces
 * the per-page and per-action checks (AUTH-31). It sets the viewer's language (`users.locale`) and the tenant
 * surface; `/app/manifest.webmanifest` is a route handler and stays outside it.
 */
export async function generateMetadata(): Promise<Metadata> {
  const brand = await brandName();
  return {
    title: { template: `%s · ${brand}`, default: brand },
    robots: { index: false, follow: false, nocache: true },
    referrer: "same-origin",
  };
}

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const [locale, nonce] = await Promise.all([viewerLocale(user), getCspNonce()]);
  return (
    <AdminProviders nonce={nonce}>
      <AdminI18nProvider locale={locale}>
        <div lang={locale} dir={dirOf(locale)} data-surface="tenant" className="flex min-h-dvh flex-1 flex-col bg-background">
          {children}
        </div>
      </AdminI18nProvider>
    </AdminProviders>
  );
}
