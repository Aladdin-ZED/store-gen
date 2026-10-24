import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCspNonce, getPendingMfa, getSignedInUser, landingPathFor, listMemberships, safeAppPath, SIGNUP_PATH } from "@/lib/auth";
import { authTranslator } from "@/lib/auth/i18n";
import { viewerLocale } from "@/lib/auth/locale";
import { signInVerifyUrl } from "@/lib/auth/paths";
import { effectiveSignupMode, killSwitchTripped, platformTurnstileKeys } from "@/lib/auth/platform-config";
import { AuthHeading } from "../_components/auth-heading";
import { Notice } from "../_components/kit";
import { LoginForm } from "./login-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: authTranslator(await viewerLocale(null))("auth.login.meta") };
}

/** Whitelisted notices (never echo query text into the page). */
const NOTICES = {
  "signed-out": "auth.login.notice.signed_out",
  "mfa-locked": "auth.login.notice.mfa_locked",
  "mfa-expired": "auth.login.notice.mfa_expired",
  "password-reset": "auth.login.notice.password_reset",
  deleted: "auth.account.deleted",
} as const;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : null);

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const next = safeAppPath(str(params.next));

  const user = await getSignedInUser();
  if (user) redirect(next ?? landingPathFor(await listMemberships(user.id), user.lastStoreId, user.platformRole));
  if (await getPendingMfa()) redirect(signInVerifyUrl(next));

  const locale = await viewerLocale(null);
  const t = authTranslator(locale);
  const noticeKey = params.deleted === "1" ? "deleted" : (str(params.notice) ?? "");
  const notice = Object.hasOwn(NOTICES, noticeKey) ? NOTICES[noticeKey as keyof typeof NOTICES] : null;
  const fromInvite = next?.startsWith("/invite/") ?? false;
  const [widget, nonce, mode, killed] = await Promise.all([platformTurnstileKeys(), getCspNonce(), effectiveSignupMode(), killSwitchTripped("signups_enabled")]);
  const signupOpen = !killed && mode.mode !== "closed";

  return (
    <>
      <AuthHeading title={t("auth.login.title")}>{t(fromInvite ? "auth.login.lead_invite" : "auth.login.lead")}</AuthHeading>
      {notice && <Notice className="mb-5">{t(notice)}</Notice>}
      <LoginForm next={next} siteKey={widget?.siteKey ?? null} nonce={nonce} />
      {signupOpen && !fromInvite && (
        <p className="mt-8 text-center text-sm text-muted-foreground">
          {t("auth.login.new_here")}{" "}
          <Link href={SIGNUP_PATH} className="font-medium text-foreground underline underline-offset-4">
            {t("auth.login.create_store")}
          </Link>
        </p>
      )}
    </>
  );
}
