import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getCspNonce, getSignedInUser, LOGIN_PATH } from "@/lib/auth";
import { viewerLocale } from "@/lib/auth/locale";
import { brandName, platformTurnstileKeys } from "@/lib/auth/platform-config";
import { translator } from "@/lib/i18n/admin";
import { getStaffInviteState } from "@/lib/platform/staff";
import { AuthHeading } from "../../../_components/auth-heading";
import { StaffAcceptForm } from "./accept-form";

/*
 * `/invite/staff/<token>` (platform.md PLA-§14.1, §Q.4; PD13; core §B.5 rev 3, SEC-20/24): the staff invitation, on the
 * platform host in the public sign-in frame (the (public) layout: noindex, `Referrer-Policy: same-origin` so the form's
 * Server Action keeps its Origin; the proxy answers `private, no-store` for this area). One page, every state:
 * signed in with the bound e-mail → join as <role>; no account → name + password with the e-mail locked; wrong
 * account → "This invitation is for s•••@gmail.com"; an account exists → sign in first; already staff; expired,
 * revoked, used or unknown. The bound e-mail is never shown in full. After joining: the two-step setup
 * (`/app/account/two-factor?for=console`), since the console stays closed until TOTP is on (§B.7).
 */
export async function generateMetadata(): Promise<Metadata> {
  return { title: translator(await viewerLocale(null))("console.staff_invite.meta"), robots: { index: false, follow: false, nocache: true }, referrer: "same-origin" };
}

const TOKEN_RE = /^[A-Za-z0-9_-]{32,64}$/;

export default async function StaffInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const viewer = await getSignedInUser();
  const locale = await viewerLocale(viewer);
  const t = translator(locale);
  const [brand, view] = await Promise.all([brandName(), TOKEN_RE.test(token) ? getStaffInviteState(token, viewer ? { id: viewer.id, email: viewer.email } : null) : Promise.resolve({ state: "invalid" as const })]);
  const signIn = `${LOGIN_PATH}?next=${encodeURIComponent(`/invite/staff/${token}`)}`;

  if (view.state === "invalid") {
    return (
      <>
        <AuthHeading title={t("console.staff_invite.invalid_title")}>{t("console.staff.invite_invalid")}</AuthHeading>
        <Button asChild size="lg" variant="outline" className="h-11 w-full">
          <Link href={LOGIN_PATH}>{t("console.staff_invite.go_sign_in")}</Link>
        </Button>
      </>
    );
  }

  const role = t(`console.role.${view.role}`);
  const card = (
    <div className="mt-6 flex items-center gap-3.5 rounded-[12px] border border-[color-mix(in_oklab,var(--foreground)_9%,transparent)] bg-card p-4">
      <span aria-hidden="true" className="inline-grid size-10 shrink-0 place-items-center rounded-[10px] bg-[var(--brand)] text-sm font-semibold text-[var(--brand-foreground)]">
        {brand.slice(0, 1).toUpperCase()}
      </span>
      <div className="grid min-w-0 gap-0.5">
        <p className="truncate text-sm font-semibold">{t("console.staff_invite.team", { brand })}</p>
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{role}</span> · {t(`console.staff_invite.role_line.${view.role}`)}
        </p>
      </div>
    </div>
  );

  if (view.state !== "valid") {
    return (
      <>
        <AuthHeading title={t(`console.staff_invite.${view.state}_title`)}>{t(`console.staff_invite.${view.state}`)}</AuthHeading>
        {card}
      </>
    );
  }

  if (view.way === "already_staff") {
    return (
      <>
        <AuthHeading title={t("console.staff_invite.already_title")}>{t("console.staff_invite.already")}</AuthHeading>
        {card}
        <Button asChild size="lg" variant="brand" className="mt-6 h-11 w-full">
          <Link href="/admin">{t("console.staff_invite.open_console")}</Link>
        </Button>
      </>
    );
  }

  if (view.way === "wrong_account") {
    return (
      <>
        <AuthHeading title={t("console.staff_invite.wrong_title")}>
          {t("console.staff_invite.wrong_lead")}{" "}
          <bdi dir="ltr" className="font-medium text-foreground">
            {view.emailMasked}
          </bdi>
        </AuthHeading>
        {card}
        <p className="mt-4 text-sm text-muted-foreground">{t("console.staff_invite.wrong_next")}</p>
      </>
    );
  }

  if (view.way === "sign_in") {
    return (
      <>
        <AuthHeading title={t("console.staff_invite.title", { role, brand })}>
          {t("console.staff_invite.sign_in_lead")}{" "}
          <bdi dir="ltr" className="font-medium text-foreground">
            {view.emailMasked}
          </bdi>
        </AuthHeading>
        {card}
        <Button asChild size="lg" variant="brand" className="mt-6 h-11 w-full">
          <Link href={signIn}>{t("console.staff_invite.sign_in")}</Link>
        </Button>
      </>
    );
  }

  const [widget, nonce] = await Promise.all([platformTurnstileKeys(), getCspNonce()]);
  return (
    <>
      <AuthHeading title={t("console.staff_invite.title", { role, brand })}>{t(view.way === "accept" ? "console.staff_invite.accept_lead" : "console.staff_invite.sign_up_lead")}</AuthHeading>
      {card}
      <StaffAcceptForm token={token} mode={view.way === "accept" ? "accept" : "sign_up"} emailMasked={view.emailMasked} role={role} locale={locale} siteKey={widget?.siteKey ?? null} nonce={nonce} />
    </>
  );
}
