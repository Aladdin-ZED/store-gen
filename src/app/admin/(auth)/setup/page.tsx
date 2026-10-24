import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { assertAdminAccess } from "@/lib/auth";
import { setupOpen } from "@/lib/auth/bootstrap";
import { authTranslator } from "@/lib/auth/i18n";
import { viewerLocale } from "@/lib/auth/locale";
import { AuthHeading } from "@/app/(public)/_components/auth-heading";
import { SetupForm } from "./setup-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: authTranslator(await viewerLocale(null))("console.setup.meta") };
}

/** §B.11 first run, behind the gate and SETUP_TOKEN, only while no super_admin exists; afterwards a plain 404. */
export default async function SetupPage() {
  await assertAdminAccess();
  if (!(await setupOpen())) notFound();
  const t = authTranslator(await viewerLocale(null));
  return (
    <>
      <AuthHeading eyebrow={t("console.setup.eyebrow")} title={t("console.setup.title")}>
        {t("console.setup.lead")}
      </AuthHeading>
      <SetupForm />
    </>
  );
}
