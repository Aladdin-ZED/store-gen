import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getCspNonce, LOGIN_PATH } from "@/lib/auth";
import { authTranslator } from "@/lib/auth/i18n";
import { viewerLocale } from "@/lib/auth/locale";
import { platformTurnstileKeys } from "@/lib/auth/platform-config";
import { previewPasswordReset } from "@/lib/auth/reset";
import { AuthHeading } from "../../_components/auth-heading";
import { ResetForm } from "./reset-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: authTranslator(await viewerLocale(null))("auth.reset.meta") };
}

/** §B.9: the form while the link works, one neutral answer otherwise (never names the account). */
export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const locale = await viewerLocale(null);
  const t = authTranslator(locale);
  const { valid } = await previewPasswordReset(token);
  if (!valid) {
    return (
      <>
        <AuthHeading title={t("auth.reset.invalid_title")}>{t("auth.reset.invalid")}</AuthHeading>
        <Button asChild size="lg" variant="outline" className="h-10 w-full">
          <Link href={LOGIN_PATH}>{t("auth.signup.sign_in")}</Link>
        </Button>
      </>
    );
  }
  const [widget, nonce] = await Promise.all([platformTurnstileKeys(), getCspNonce()]);
  return (
    <>
      <AuthHeading title={t("auth.reset.title")}>{t("auth.reset.lead")}</AuthHeading>
      <ResetForm token={token} locale={locale} siteKey={widget?.siteKey ?? null} nonce={nonce} />
    </>
  );
}
