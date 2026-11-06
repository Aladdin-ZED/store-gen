import type { Metadata } from "next";
import { screenLocale, screenLocalesFor } from "@/components/admin/shell/store-nav";
import { viewerLocale } from "@/lib/auth/locale";
import { ACCOUNT_TWO_FACTOR_PATH } from "@/lib/auth/paths";
import { t } from "@/lib/i18n/admin";
import { listMembersByScope } from "@/lib/tenancy/invites";
import { requireStoreMember } from "@/lib/tenancy/seam";
import { memberCtx } from "../../member-ctx";
import { setRequireMember2faAction } from "./actions";
import { Require2fa } from "./_components/require-2fa";

type Props = { params: Promise<{ store: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { user } = await memberCtx((await params).store);
  return {
    title: t("shell.security.title", undefined, screenLocale(await viewerLocale(user), screenLocalesFor("/settings/security"))),
  };
}

/**
 * Settings → Security (P2 SHELL; platform.md PLA-§22.10.3, TN-13; docs/STORE-SAAS.md §B.7, D12), `settings.read`:
 * "Require two-step codes for every member", which only an owner with TOTP may change (`security.write` and the
 * viewer's own enrolment; otherwise the switch is disabled with its reason), the active members still without
 * two-step verification, and a confirm sheet before it turns on. R3 adds support grants here (PL-15).
 */
export default async function SecuritySettingsPage({ params }: Props) {
  const ctx = await requireStoreMember({
    handle: (await params).store,
    permission: "settings.read",
  });
  const members = await listMembersByScope(ctx.scope);
  const without = members
    .filter((m) => m.status === "active" && !m.totpEnabled)
    .map((m) => ({
      userId: m.userId,
      name: m.name || m.email,
      role: m.role,
      self: m.userId === ctx.user.id,
    }));
  const reason = !ctx.can("security.write") ? "role" : !ctx.user.totpEnabled ? "own_first" : null;
  return <Require2fa on={ctx.store.requireMember2fa} reason={reason} without={without} enrolHref={ACCOUNT_TWO_FACTOR_PATH} save={setRequireMember2faAction} />;
}
