import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCspNonce, getSignedInUser, LOGIN_PATH, NEW_STORE_PATH } from "@/lib/auth";
import { authTranslator } from "@/lib/auth/i18n";
import { viewerLocale } from "@/lib/auth/locale";
import { effectiveSignupMode, killSwitchTripped, platformSetting } from "@/lib/auth/platform-config";
import { AuthHeading } from "../_components/auth-heading";
import { SignupForm } from "./signup-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: authTranslator(await viewerLocale(null))("auth.signup.meta") };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * §B.2: the form follows the effective mode (D9). `closed` (or the `signups_enabled` kill switch) shows no form;
 * `waitlist` asks for an e-mail, a phone and what the seller sells; `invite`, `approval` and `open` create the account
 * and the first store. The human check renders whenever the platform widget exists (a gate in approval / open, a
 * score in invite mode). A signed-in visitor creates another store from the dashboard instead.
 */
export default async function SignupPage({ searchParams }: { searchParams: SearchParams }) {
  if (await getSignedInUser()) redirect(NEW_STORE_PATH);
  const params = await searchParams;
  const locale = await viewerLocale(null);
  const t = authTranslator(locale);
  const [mode, killed, setting, nonce] = await Promise.all([effectiveSignupMode(), killSwitchTripped("signups_enabled"), platformSetting(), getCspNonce()]);

  if (killed || mode.mode === "closed") {
    return (
      <>
        <AuthHeading title={t("auth.signup.closed_title")}>{t("auth.signup.closed_lead")}</AuthHeading>
        <p className="text-center text-sm text-muted-foreground">
          {t("auth.signup.have_account")}{" "}
          <Link href={LOGIN_PATH} className="font-medium text-foreground underline underline-offset-4">
            {t("auth.signup.sign_in")}
          </Link>
        </p>
      </>
    );
  }

  const code = typeof params.code === "string" ? params.code.slice(0, 32) : "";
  return (
    <div data-wide>
      <AuthHeading title={t(mode.mode === "waitlist" ? "auth.signup.waitlist_title" : "auth.signup.title")}>
        {t(mode.mode === "waitlist" ? "auth.signup.waitlist_lead" : mode.mode === "invite" ? "auth.signup.lead_invite" : "auth.signup.lead")}
      </AuthHeading>
      <SignupForm
        mode={mode.mode}
        locale={locale}
        markets={setting.signup.allowedMarkets}
        siteKey={mode.turnstile?.siteKey ?? null}
        nonce={nonce}
        inviteCode={code}
        legalRequired={setting.legal.requireAcceptance}
      />
      <p className="mt-8 text-center text-sm text-muted-foreground">
        {t("auth.signup.have_account")}{" "}
        <Link href={LOGIN_PATH} className="font-medium text-foreground underline underline-offset-4">
          {t("auth.signup.sign_in")}
        </Link>
      </p>
    </div>
  );
}
