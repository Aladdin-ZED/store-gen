import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { authTranslator } from "@/lib/auth/i18n";
import { switcherData } from "@/lib/auth/landing";
import { viewerLocale } from "@/lib/auth/locale";
import { requireUserCtx } from "@/lib/auth/user-action";
import { Monogram, PageTitle, Pill, Section } from "@/app/(public)/_components/kit";
import { storeStatusTone } from "../_components/store-status";

export async function generateMetadata(): Promise<Metadata> {
  return { title: authTranslator(await viewerLocale(null))("account.stores.meta") };
}

/** PLA-§22.5 "My stores": every membership with its role and state; leaving happens on the store's team page. */
export default async function AccountStoresPage() {
  const { user } = await requireUserCtx();
  const [locale, data] = await Promise.all([viewerLocale(user), switcherData(user)]);
  const t = authTranslator(locale);
  return (
    <>
      <PageTitle
        title={t("account.stores.title")}
        lead={t("account.stores.lead")}
        aside={
          <Button asChild variant="outline">
            <Link href="/app/new">{t("app.picker.create")}</Link>
          </Button>
        }
      />
      <Section title={t("account.stores.section", { count: data.stores.length })}>
        {data.stores.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("account.stores.none")}</p>
        ) : (
          <ul className="divide-y divide-[color-mix(in_oklab,var(--foreground)_8%,transparent)]">
            {data.stores.map((s) => (
              <li key={s.storeId} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="flex min-w-0 items-center gap-3">
                  <Monogram name={s.name} seed={s.storeId} />
                  <div className="grid min-w-0 gap-0.5">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      <span className="truncate">{s.name}</span>
                      <Pill tone={storeStatusTone(s.storeStatus)}>{t(`app.status.${s.storeStatus}`)}</Pill>
                      {s.status === "suspended" && <Pill tone="warn">{t("app.member.suspended")}</Pill>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      <bdi dir="ltr">@{s.handle}</bdi> · {t(`team.role.${s.role}`)}
                    </p>
                  </div>
                </div>
                {s.usable && (
                  <div className="flex items-center gap-1">
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/app/${s.handle}/team#leave`}>{t("account.stores.leave")}</Link>
                    </Button>
                    <Button asChild variant="outline" size="sm">
                      <Link href={s.href}>{t("app.picker.open")}</Link>
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
