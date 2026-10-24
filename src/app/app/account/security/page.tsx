import type { Metadata } from "next";
import { AccountSecurityPanel } from "@/components/admin/settings/security-panel";
import { describeUserAgent } from "@/lib/admin-data/security";
import { getTwoFactorStatus, TWO_FACTOR_OFF_NOTICE } from "@/lib/auth";
import { authTranslator } from "@/lib/auth/i18n";
import { viewerLocale } from "@/lib/auth/locale";
import { listUserSessions } from "@/lib/auth/session";
import { requireUserCtx } from "@/lib/auth/user-action";
import { PageTitle } from "@/app/(public)/_components/kit";
import { changePasswordAction, revokeSessionAction, signOutOthersAction } from "../actions";

export async function generateMetadata(): Promise<Metadata> {
  return { title: authTranslator(await viewerLocale(null))("account.security.meta") };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** §B.9 `/app/account/security`: password change, the two-step status, devices and "sign out other sessions". */
export default async function AccountSecurityPage({ searchParams }: { searchParams: SearchParams }) {
  const { user } = await requireUserCtx();
  const { notice } = await searchParams;
  const [locale, twoFactor, sessions] = await Promise.all([viewerLocale(user), getTwoFactorStatus(user.id), listUserSessions(user.id, user.sessionId)]);
  const t = authTranslator(locale);
  const devices = sessions
    .map((s) => ({ id: s.id, device: describeUserAgent(s.ua), createdAt: s.createdAt.toISOString(), lastSeenAt: s.lastSeenAt.toISOString(), current: s.current, impersonating: s.impersonating }))
    .sort((a, b) => Number(b.current) - Number(a.current));
  return (
    <>
      <PageTitle title={t("account.security.title")} lead={t("account.security.lead")} />
      <AccountSecurityPanel
        email={user.email}
        twoFactor={twoFactor}
        devices={devices}
        // whitelisted: never echo query text
        notice={notice === TWO_FACTOR_OFF_NOTICE && !twoFactor.enabled ? "account.security.two_factor_turned_off" : null}
        actions={{ changePassword: changePasswordAction, revokeSession: revokeSessionAction, signOutOthers: signOutOthersAction }}
      />
    </>
  );
}
