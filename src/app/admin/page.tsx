import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark } from "@/components/admin/shell/brand-mark";
import { Button } from "@/components/ui/button";
import { endImpersonationAction, logout } from "@/lib/auth/actions";
import { authTranslator } from "@/lib/auth/i18n";
import { viewerLocale } from "@/lib/auth/locale";
import { brandName } from "@/lib/auth/platform-config";
import { getCspNonce } from "@/lib/auth";
import { dirOf } from "@/lib/i18n/admin";
import { AdminI18nProvider } from "@/lib/i18n/admin/client";
import { activeImpersonation } from "@/lib/platform/impersonation";
import { requirePlatform } from "@/lib/platform/seam";
import { AdminProviders } from "@/components/admin/shell/providers";
import { Fact, Notice, PageTitle, Pill, Section } from "@/app/(public)/_components/kit";
import { When } from "@/app/(public)/_components/when";
import { ViewAsForm } from "./(auth)/_components/view-as-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: authTranslator(await viewerLocale(null))("console.home.meta") };
}

/**
 * `/admin` in R1.0 (docs/STORE-SAAS.md §I.2): the console's minimal home behind `requirePlatform` (gate, session,
 * platform role, TOTP): who is signed in, the step-up freshness, the session's own "view as store" with End, and the
 * start sheet of PLA-§10.1 by handle. P1 replaces it with the overview (`(console)/page.tsx`) and deletes this file
 * (PLA Q.12). The teal console accent (hue 205) marks the surface; violet (295) is the view-as ribbon's.
 */
/** Whole minutes left in a view-as (at least 1 while it is open). */
function minutesLeft(until: Date): number {
  return Math.max(1, Math.ceil((until.getTime() - Date.now()) / 60_000));
}

export default async function ConsoleHomePage() {
  const ctx = await requirePlatform({ permission: "console.read" });
  const [locale, brand, viewing, nonce] = await Promise.all([viewerLocale(ctx.user), brandName(), activeImpersonation(ctx), getCspNonce()]);
  const t = authTranslator(locale);
  return (
    <AdminProviders nonce={nonce}>
      <AdminI18nProvider locale={locale}>
        <div lang={locale} dir={dirOf(locale)} data-surface="console" className="flex min-h-dvh flex-1 flex-col bg-background">
          <header className="border-b border-[color-mix(in_oklab,var(--foreground)_8%,transparent)]">
            <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
              <div className="flex items-center gap-2.5">
                <BrandMark className="size-7" />
                <span className="text-[0.95rem] font-semibold tracking-[-0.02em]">{brand}</span>
                <span className="rounded-[6px] bg-[oklch(0.6_0.1_205/0.14)] px-1.5 py-0.5 text-[0.7rem] font-semibold text-[oklch(0.42_0.08_205)] dark:text-[oklch(0.8_0.08_205)]">
                  {t("console.badge")}
                </span>
              </div>
              <form action={logout}>
                <Button type="submit" variant="ghost" size="sm">
                  {t("app.bar.sign_out")}
                </Button>
              </form>
            </div>
          </header>
          <main className="mx-auto grid w-full max-w-5xl content-start gap-6 px-4 py-10 sm:px-6">
            <PageTitle
              title={t("console.home.title", { name: ctx.user.name || ctx.user.email })}
              lead={t("console.home.lead")}
              aside={
                <div className="flex gap-2">
                  <Button asChild variant="outline">
                    <Link href="/app">{t("console.home.stores")}</Link>
                  </Button>
                  <Button asChild variant="ghost">
                    <Link href="/app/account">{t("console.home.account")}</Link>
                  </Button>
                </div>
              }
            />

            {viewing && (
              <Notice tone="violet">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span>{t("console.impersonation.active", { store: viewing.storeName, minutes: minutesLeft(viewing.expiresAt) })}</span>
                  <span className="flex gap-2">
                    {viewing.handle && (
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/app/${viewing.handle}`}>{t("console.impersonation.open")}</Link>
                      </Button>
                    )}
                    <form action={endImpersonationAction}>
                      <Button type="submit" size="sm" variant="destructive">
                        {t("console.impersonation.end")}
                      </Button>
                    </form>
                  </span>
                </div>
              </Notice>
            )}

            <Section title={t("console.home.identity")}>
              <dl className="grid gap-3">
                <Fact label={t("auth.field.email")}>
                  <bdi dir="ltr">{ctx.user.email}</bdi>
                </Fact>
                <Fact label={t("console.home.role")}>
                  <Pill tone="info">{t(`console.role.${ctx.role}`)}</Pill>
                </Fact>
                <Fact label={t("console.home.step_up")}>
                  {ctx.stepUpFresh && ctx.stepUpUntil ? (
                    <Pill tone="success">
                      {t("console.home.verified")} <When iso={ctx.stepUpUntil.toISOString()} />
                    </Pill>
                  ) : (
                    <span className="font-normal text-muted-foreground">{t("console.home.not_verified")}</span>
                  )}
                </Fact>
              </dl>
            </Section>

            {ctx.can("stores.impersonate") && (
              <Section title={t("console.impersonation.title")} description={t("console.impersonation.lead")}>
                <ViewAsForm ticketRequired={ctx.role === "support"} />
              </Section>
            )}
          </main>
        </div>
      </AdminI18nProvider>
    </AdminProviders>
  );
}
