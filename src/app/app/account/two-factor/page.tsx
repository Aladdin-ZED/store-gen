import type { Metadata } from "next";
import { getTwoFactorStatus, SECURITY_SETTINGS_PATH } from "@/lib/auth";
import { authTranslator } from "@/lib/auth/i18n";
import { viewerLocale } from "@/lib/auth/locale";
import { requireUserCtx } from "@/lib/auth/user-action";
import { Notice, PageTitle } from "@/app/(public)/_components/kit";
import { TwoFactorManager } from "./two-factor-manager";

export async function generateMetadata(): Promise<Metadata> {
  return { title: authTranslator(await viewerLocale(null))("account.2fa.meta") };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * §B.7: optional for tenants, mandatory for staff. `?for=console` (a staff member the console turned away) and
 * `?for=store` (a store that requires it for its members, D12) explain why the page opened; `?from=setup` is step two
 * of the first run (§B.11) and continues to its store step.
 */
export default async function TwoFactorPage({ searchParams }: { searchParams: SearchParams }) {
  const { user } = await requireUserCtx();
  const params = await searchParams;
  const [status, locale] = await Promise.all([getTwoFactorStatus(user.id), viewerLocale(user)]);
  const t = authTranslator(locale);
  const fromSettings = params.from === "settings";
  const fromSetup = params.from === "setup";
  const reason = params.for === "console" ? "console" : params.for === "store" ? "store" : null;
  const continueHref = fromSettings ? SECURITY_SETTINGS_PATH : fromSetup ? "/admin/setup/store" : reason === "console" ? "/admin" : "/app";

  // whitelisted notices only (never echo query text)
  let notice: string | null = null;
  if (params.notice === "disabled" && !status.enabled) notice = t("account.2fa.notice_off");
  if (params.notice === "recovery-used" && status.enabled) notice = t("account.2fa.notice_recovery", { count: status.recoveryCodesRemaining });

  return (
    <>
      <PageTitle title={t("account.2fa.title")} lead={t(status.enabled ? "account.2fa.lead_on" : "account.2fa.lead_off")} />
      {reason && !status.enabled && <Notice tone={reason === "console" ? "console" : "brand"}>{t(reason === "console" ? "account.2fa.for_console" : "account.2fa.for_store")}</Notice>}
      {notice && <Notice>{notice}</Notice>}
      <TwoFactorManager enabled={status.enabled} remaining={status.recoveryCodesRemaining} continueHref={continueHref} fromSetup={fromSetup} fromSettings={fromSettings} staff={user.platformRole !== "none"} />
    </>
  );
}
