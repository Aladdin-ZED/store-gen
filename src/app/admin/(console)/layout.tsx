import type { ReactNode } from "react";
import { ConsoleShell } from "@/components/console/shell/console-shell";
import { CONSOLE_LOCALE } from "@/components/console/locale";
import { consoleNavFor } from "@/components/console/nav";
import { AdminProviders } from "@/components/admin/shell/providers";
import { getCspNonce } from "@/lib/auth";
import { PLATFORM_TIMEZONE } from "@/lib/auth/config";
import { brandName } from "@/lib/auth/platform-config";
import { CURRENT_RELEASE, PLATFORM_PERMISSIONS, type PlatformPermission } from "@/lib/auth/permissions";
import { storeRootDomain, subdomainMode } from "@/lib/edge/env";
import { dirOf } from "@/lib/i18n/admin";
import { AdminI18nProvider } from "@/lib/i18n/admin/client";
import { optional } from "@/lib/platform/panel";
import { consolePulse } from "@/lib/platform/pulse";
import { requirePlatform } from "@/lib/platform/seam";

/*
 * Every console page (platform.md PLA-§4.1, §4.2; core §I.2): `requirePlatform` resolves the staff member (signed out →
 * sign-in, no TOTP → enrolment, anything else → the neutral 404 of src/lib/auth/unknown-page.ts), then <ConsoleShell>
 * gets what the browser needs, computed here once: the navigation filtered by permission and release, the permissions
 * held, the first pulse (so the badges and the bell are right on the first paint), the address mode, the step-up end
 * and the footer facts. The console renders in its catalog's language (src/components/console/locale.ts). A layout
 * guards nothing below it: every page re-checks its own permission and every action goes through `platformAction`
 * (lint L9). The (auth) group (sign-in, two-factor, setup) is outside this layout.
 */
export default async function ConsoleLayout({ children }: { children: ReactNode }) {
  const ctx = await requirePlatform({ throwOnFail: false });
  const locale = CONSOLE_LOCALE;
  const [nonce, brand, pulse] = await Promise.all([getCspNonce(), brandName(), optional("layout.pulse", () => consolePulse(ctx))]);
  const grants = (Object.keys(PLATFORM_PERMISSIONS) as PlatformPermission[]).filter((p) => ctx.can(p));
  const root = storeRootDomain();
  return (
    <AdminProviders nonce={nonce}>
      <AdminI18nProvider locale={locale}>
        <ConsoleShell
          nav={consoleNavFor(ctx, CURRENT_RELEASE)}
          grants={grants}
          pulse={pulse}
          timeZone={PLATFORM_TIMEZONE}
          lang={locale}
          dir={dirOf(locale)}
          footer={{ brand, build: pulse?.build ?? "dev", node: process.version.replace(/^v/, "") }}
          topbar={{
            address: subdomainMode() && root ? { mode: "subdomains", root } : { mode: "path" },
            stepUpUntil: ctx.stepUpFresh && ctx.stepUpUntil ? ctx.stepUpUntil.toISOString() : null,
            user: { name: ctx.user.name, email: ctx.user.email, role: ctx.role },
          }}
        >
          {children}
        </ConsoleShell>
      </AdminI18nProvider>
    </AdminProviders>
  );
}
