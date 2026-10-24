import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getCspNonce, getSignedInUser, LOGIN_PATH } from "@/lib/auth";
import { storeHomePath } from "@/lib/auth/landing";
import { authTranslator } from "@/lib/auth/i18n";
import { viewerLocale } from "@/lib/auth/locale";
import { killSwitchTripped, platformTurnstileKeys } from "@/lib/auth/platform-config";
import { inviteLanding, type InvitePreview } from "@/lib/tenancy/invites";
import { AuthHeading } from "../../_components/auth-heading";
import { Monogram } from "../../_components/kit";
import { switchAccountAction } from "./actions";
import { AcceptForm } from "./accept-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: authTranslator(await viewerLocale(null))("team.invite.meta") };
}

/**
 * §B.5: one page, six states (the two form states read "paused" while `signups_enabled` is off, §H.8). The bound
 * e-mail is never shown in full and never sent to the browser; an unknown, used, revoked or expired link all read the
 * same.
 */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const viewer = await getSignedInUser();
  const locale = await viewerLocale(viewer);
  const t = authTranslator(locale);
  const landing = await inviteLanding(token, viewer);

  if (landing.state === "invalid") {
    return (
      <>
        <AuthHeading title={t("team.invite.invalid_title")}>{t("team.invite.invalid")}</AuthHeading>
        <Button asChild size="lg" variant="outline" className="h-10 w-full">
          <Link href={LOGIN_PATH}>{t("auth.signup.sign_in")}</Link>
        </Button>
      </>
    );
  }

  const { preview } = landing;
  const heading = <InviteCard preview={preview} roleLabel={t(`team.role.${preview.role}`)} roleLine={t(`team.role.${preview.role}.line`)} />;

  if (landing.state === "already_member") {
    return (
      <>
        <AuthHeading title={t("team.invite.already_title", { store: preview.storeName })}>{t("team.invite.already_lead")}</AuthHeading>
        {heading}
        <Button asChild size="lg" variant="brand" className="mt-6 h-10 w-full">
          <Link href={storeHomePath({ handle: landing.storeHandle, role: preview.role })}>{t("team.invite.open_store")}</Link>
        </Button>
      </>
    );
  }

  if (landing.state === "wrong_account") {
    return (
      <>
        <AuthHeading title={t("team.invite.wrong_title")}>
          {t("team.invite.wrong_lead")}{" "}
          <bdi dir="ltr" className="font-medium text-foreground">
            {preview.emailMasked}
          </bdi>
        </AuthHeading>
        {heading}
        <form action={switchAccountAction} className="mt-6">
          <input type="hidden" name="token" value={token} />
          <Button type="submit" size="lg" variant="outline" className="h-10 w-full">
            {t("team.invite.switch_account")}
          </Button>
        </form>
      </>
    );
  }

  if (landing.state === "sign_in") {
    return (
      <>
        <AuthHeading title={t("team.invite.title", { store: preview.storeName })}>
          {t("team.invite.sign_in_lead")}{" "}
          <bdi dir="ltr" className="font-medium text-foreground">
            {preview.emailMasked}
          </bdi>
        </AuthHeading>
        {heading}
        <Button asChild size="lg" variant="brand" className="mt-6 h-10 w-full">
          <Link href={`${LOGIN_PATH}?next=${encodeURIComponent(`/invite/${token}`)}`}>{t("team.invite.sign_in")}</Link>
        </Button>
      </>
    );
  }

  const [widget, nonce, closed] = await Promise.all([platformTurnstileKeys(), getCspNonce(), killSwitchTripped("signups_enabled")]);
  if (closed) {
    // §H.8: the signups_enabled kill switch closes the accept form too
    return (
      <>
        <AuthHeading title={t("team.invite.closed_title")}>{t("team.invite.closed")}</AuthHeading>
        {heading}
      </>
    );
  }
  return (
    <>
      <AuthHeading title={t("team.invite.title", { store: preview.storeName })}>
        {t(landing.state === "accept" ? "team.invite.accept_lead" : "team.invite.sign_up_lead")}
      </AuthHeading>
      {heading}
      <AcceptForm token={token} mode={landing.state === "accept" ? "accept" : "sign_up"} emailMasked={preview.emailMasked} locale={locale} siteKey={widget?.siteKey ?? null} nonce={nonce} />
    </>
  );
}

function InviteCard({ preview, roleLabel, roleLine }: { preview: InvitePreview; roleLabel: string; roleLine: string }) {
  return (
    <div className="flex items-center gap-3.5 rounded-[12px] border border-[color-mix(in_oklab,var(--foreground)_9%,transparent)] bg-card p-4">
      <Monogram name={preview.storeName} seed={preview.storeName} size="lg" />
      <div className="grid min-w-0 gap-0.5">
        <p className="truncate text-sm font-semibold">{preview.storeName}</p>
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{roleLabel}</span> · {roleLine}
        </p>
      </div>
    </div>
  );
}
