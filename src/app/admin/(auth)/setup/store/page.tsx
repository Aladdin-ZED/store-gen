import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { assertAdminAccess, requireUser } from "@/lib/auth";
import { authTranslator } from "@/lib/auth/i18n";
import { listMemberships } from "@/lib/auth/landing";
import { viewerLocale } from "@/lib/auth/locale";
import { ACCOUNT_TWO_FACTOR_PATH } from "@/lib/auth/paths";
import { AuthHeading } from "@/app/(public)/_components/auth-heading";
import { SetupStoreForm } from "./setup-store-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: authTranslator(await viewerLocale(null))("console.setup.store_meta") };
}

/** §B.11 step three: only the super_admin, with TOTP on, who owns no store yet; anyone else gets the plain 404. */
export default async function SetupStorePage() {
  await assertAdminAccess();
  const user = await requireUser();
  if (user.platformRole !== "super_admin") notFound();
  if (!user.totpEnabled) redirect(`${ACCOUNT_TWO_FACTOR_PATH}?from=setup`);
  if ((await listMemberships(user.id)).length > 0) redirect("/app");
  const t = authTranslator(await viewerLocale(user));
  return (
    <>
      <AuthHeading eyebrow={t("console.setup.eyebrow")} title={t("console.setup.store_title")}>
        {t("console.setup.store_lead")}
      </AuthHeading>
      <SetupStoreForm />
    </>
  );
}
