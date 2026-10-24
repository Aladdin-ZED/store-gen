import type { ReactNode } from "react";
import { AdminProviders } from "@/components/admin/shell/providers";
import { getCspNonce, getSignedInUser } from "@/lib/auth";
import { viewerLocale } from "@/lib/auth/locale";
import { brandName } from "@/lib/auth/platform-config";
import { AdminI18nProvider } from "@/lib/i18n/admin/client";
import { AuthShell } from "@/app/(public)/_components/auth-shell";

/*
 * The console's own auth screens behind ADMIN_GATE (§B.11 first run, the role refusal page, and the redirects of
 * today's console sign-in URLs): the same split layout as the platform's sign-in pages.
 */
export default async function ConsoleAuthLayout({ children }: { children: ReactNode }) {
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
