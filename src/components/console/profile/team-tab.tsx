"use client";
/**
 * The store profile's Team tab (platform.md PLA-§7.6; PD34, PD35): members (name, e-mail as PD35 allows, role, status,
 * 2FA, last active, joined, invited by), each linking to the person's console page where the account actions live
 * (ban, 2FA reset, reset link, sign out); the pending invites (masked e-mail, role, inviter, expiry, state); the
 * store's "Require 2FA for members" and the members without 2FA. Read-only.
 *
 *   <TeamTab team={await getStoreTeam(ctx, id)} />
 */
import { ShieldCheckIcon, ShieldOffIcon } from "lucide-react";
import { useT } from "@/lib/i18n/admin/client";
import type { StoreTeam } from "@/lib/platform/profile/team";
import { cn } from "@/lib/utils";
import { Ago, Until } from "../ago";
import { QuietEmpty } from "../panel";
import { PrefetchLink } from "../prefetch-link";

export function TeamTab({ team }: { team: StoreTeam }) {
  const t = useT();
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <section className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-[var(--r-card)] bg-card px-4 py-3 text-[13px] shadow-[inset_0_0_0_1px_var(--c-hairline)]">
        <span className="inline-flex items-center gap-2">
          {team.requireMember2fa ? <ShieldCheckIcon aria-hidden="true" className="size-4 text-[oklch(0.55_0.12_160)]" /> : <ShieldOffIcon aria-hidden="true" className="size-4 text-muted-foreground" />}
          {team.requireMember2fa ? t("console.team_tab.require_on") : t("console.team_tab.require_off")}
        </span>
        <span className="num text-muted-foreground">{t("console.strip.team.two_factor_value", { on: team.twoFactor.on, of: team.twoFactor.of })}</span>
        {team.twoFactor.without > 0 && <span className="num text-foreground">{t("console.team_tab.without", { count: team.twoFactor.without })}</span>}
        <span className="num text-muted-foreground">{team.agentsOnline === null ? t("console.team_tab.agents_na") : t("console.team_tab.agents_online", { count: team.agentsOnline })}</span>
      </section>

      <section aria-label={t("console.team_tab.members")} className="min-w-0 overflow-hidden rounded-[var(--r-card)] bg-card shadow-[inset_0_0_0_1px_var(--c-hairline)]">
        <div className="flex min-h-11 items-center border-b border-[var(--c-hairline)] px-4">
          <h2 className="text-[13px] font-semibold">{t("console.team_tab.members_count", { count: team.members.length })}</h2>
        </div>
        {team.members.length === 0 ? (
          <QuietEmpty text={t("console.team_tab.no_members")} />
        ) : (
          <ul>
            {team.members.map((m) => (
              <li key={m.userId} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 border-b border-[var(--c-hairline)] px-4 py-2.5 last:border-b-0 md:grid-cols-[minmax(0,1.4fr)_120px_100px_minmax(0,1fr)_auto] md:items-center">
                <span className="grid min-w-0 gap-0.5">
                  <PrefetchLink href={`/admin/users/${m.userId}`} className="truncate text-[13px] font-medium outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--ring)]">
                    {m.name}
                  </PrefetchLink>
                  <bdi dir="ltr" className="truncate text-[12px] text-muted-foreground">
                    {m.email}
                  </bdi>
                </span>
                <span className="text-[12.5px] max-md:text-end">
                  {t(`team.role.${m.role}`)}
                  {m.status === "suspended" && <span className="ms-1.5 text-[11.5px] text-[var(--c-danger-ink)]">{t("console.team_tab.suspended")}</span>}
                </span>
                <span className={cn("inline-flex items-center gap-1 text-[12px]", m.twoFactor ? "text-[oklch(0.45_0.1_160)] dark:text-[oklch(0.8_0.1_160)]" : "text-muted-foreground")}>
                  {m.twoFactor ? <ShieldCheckIcon aria-hidden="true" className="size-3.5" /> : <ShieldOffIcon aria-hidden="true" className="size-3.5" />}
                  {m.twoFactor ? t("console.team_tab.tfa_on") : t("console.team_tab.tfa_off")}
                </span>
                <span className="min-w-0 truncate text-[12px] text-muted-foreground max-md:col-span-2">
                  {m.lastActiveAt ? <Ago iso={m.lastActiveAt} template="console.team_tab.active" /> : t("console.team_tab.never_active")} · <Ago iso={m.joinedAt} template="console.team_tab.joined" />
                  {m.invitedBy?.name && <> · {t("console.team_tab.invited_by", { name: m.invitedBy.name })}</>}
                </span>
                <PrefetchLink href={`/admin/users/${m.userId}`} className="text-[12px] font-medium text-[var(--c-brand-ink)] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--ring)] max-md:hidden">
                  {t("console.team_tab.open")}
                </PrefetchLink>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label={t("console.team_tab.invites")} className="min-w-0 overflow-hidden rounded-[var(--r-card)] bg-card shadow-[inset_0_0_0_1px_var(--c-hairline)]">
        <div className="flex min-h-11 items-center border-b border-[var(--c-hairline)] px-4">
          <h2 className="text-[13px] font-semibold">{t("console.team_tab.invites_count", { count: team.invites.length })}</h2>
        </div>
        {team.invites.length === 0 ? (
          <QuietEmpty text={t("console.team_tab.no_invites")} />
        ) : (
          <ul>
            {team.invites.map((i) => (
              <li key={i.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-0.5 border-b border-[var(--c-hairline)] px-4 py-2.5 text-[12.5px] last:border-b-0 md:grid-cols-[minmax(0,1.4fr)_120px_minmax(0,1fr)_auto] md:items-center">
                <bdi dir="ltr" className="truncate">
                  {i.email}
                </bdi>
                <span className="max-md:text-end">{t(`team.role.${i.role}`)}</span>
                <span className="truncate text-muted-foreground max-md:col-span-2">{t("console.team_tab.invited_by", { name: i.inviter })}</span>
                <span className="text-muted-foreground max-md:col-span-2">{i.state === "pending" ? <Until iso={i.expiresAt} template="console.team_tab.expires" /> : t(`console.team_tab.invite_state.${i.state}`)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
