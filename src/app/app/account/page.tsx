import type { Metadata } from "next";
import { authTranslator } from "@/lib/auth/i18n";
import { viewerLocale } from "@/lib/auth/locale";
import { getOwnProfile } from "@/lib/auth/profile";
import { requireUserCtx } from "@/lib/auth/user-action";
import { PageTitle } from "@/app/(public)/_components/kit";
import { ProfileForm } from "./profile-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: authTranslator(await viewerLocale(null))("account.profile.meta") };
}

/** PLA-§22.5 Profile: name, e-mail (read-only in R1), phone, interface language. */
export default async function AccountProfilePage() {
  const ctx = await requireUserCtx();
  const [profile, locale] = await Promise.all([getOwnProfile(ctx), viewerLocale(ctx.user)]);
  const t = authTranslator(locale);
  return (
    <>
      <PageTitle title={t("account.profile.title")} lead={t("account.profile.lead")} />
      <ProfileForm profile={{ ...profile, locale: profile.locale ?? locale }} />
    </>
  );
}
