import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AdminProviders } from "@/components/admin/shell/providers";
import { getCspNonce, getSignedInUser } from "@/lib/auth";
import { viewerLocale } from "@/lib/auth/locale";
import { brandName } from "@/lib/auth/platform-config";
import { AdminI18nProvider } from "@/lib/i18n/admin/client";
import { AuthShell } from "./_components/auth-shell";

/*
 * The public sign-in surfaces of the platform host (docs/STORE-SAAS.md §B.1): /login, /signup, /invite/<token>,
 * /reset/<token>. Every page is dynamic (it reads the session and the language), noindex, and keeps the page's real
 * Origin on its form posts (`Referrer-Policy: same-origin`, ENGC-16; the proxy sends the header, this is the
 * document's own copy).
 */
export async function generateMetadata(): Promise<Metadata> {
  const brand = await brandName();
  return {
    title: { template: `%s · ${brand}`, default: brand },
    robots: { index: false, follow: false, nocache: true },
    referrer: "same-origin",
  };
}

export default async function PublicLayout({ children }: { children: ReactNode }) {
  const [user, nonce, brand] = await Promise.all([getSignedInUser(), getCspNonce(), brandName()]);
  const locale = await viewerLocale(user);
  return (
    <AdminProviders nonce={nonce}>
      <AdminI18nProvider locale={locale}>
        <AuthShell locale={locale} brand={brand}>
          {children}
        </AuthShell>
      </AdminI18nProvider>
    </AdminProviders>
  );
}
