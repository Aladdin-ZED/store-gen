import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { authTranslator } from "@/lib/auth/i18n";
import { listMemberships } from "@/lib/auth/landing";
import { viewerLocale } from "@/lib/auth/locale";
import { requireUserCtx } from "@/lib/auth/user-action";
import { Notice, PageTitle, Section } from "@/app/(public)/_components/kit";
import { DeleteAccountForm } from "./delete-account-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: authTranslator(await viewerLocale(null))("account.danger.meta") };
}

/**
 * `/app/account/danger` (PLA Q4.7, PD81, §F.9): the full flow only for an account that owns no store and holds no
 * staff role; otherwise what stands in the way, with the way out. `deleteUserAccount` refuses the same cases again.
 */
export default async function AccountDangerPage() {
  const { user } = await requireUserCtx();
  const [locale, memberships] = await Promise.all([viewerLocale(user), listMemberships(user.id)]);
  const t = authTranslator(locale);
  const owned = memberships.filter((m) => m.role === "owner");

  return (
    <>
      <PageTitle title={t("account.danger.title")} lead={t("account.danger.lead")} />
      {user.platformRole !== "none" ? (
        <Notice tone="console">{t("account.danger.staff")}</Notice>
      ) : owned.length > 0 ? (
        <Section tone="danger" title={t("account.danger.owner_title")} description={t("account.danger.owner_lead")}>
          <ul className="grid gap-2">
            {owned.map((m) => (
              <li key={m.storeId} className="flex flex-wrap items-center justify-between gap-3 rounded-[8px] border px-3.5 py-2.5">
                <span className="text-sm font-medium">{m.name}</span>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/app/${m.handle}/settings/danger`}>{t("account.danger.close_first")}</Link>
                </Button>
              </li>
            ))}
          </ul>
        </Section>
      ) : (
        <Section tone="danger" title={t("account.danger.delete_title")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid content-start gap-1.5">
              <p className="text-sm font-medium">{t("account.danger.removed")}</p>
              <p className="text-sm text-muted-foreground">{t("account.danger.removed_lead")}</p>
            </div>
            <div className="grid content-start gap-1.5">
              <p className="text-sm font-medium">{t("account.danger.kept")}</p>
              <p className="text-sm text-muted-foreground">{t("account.danger.kept_lead")}</p>
            </div>
          </div>
          <DeleteAccountForm word={t("account.danger.word")} totp={user.totpEnabled} />
        </Section>
      )}
    </>
  );
}
