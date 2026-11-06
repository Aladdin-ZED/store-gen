/**
 * Overview strip 5, Team (platform.md PLA-§7.3 row 5): active members by role, pending invites, the 2FA coverage
 * ("3 of 4 with 2FA"), the store's "Require 2FA for members" and the agents online now (P4's; "unavailable" until
 * P4 merges). End: the Team tab.
 */
import { loadStrip } from "@/lib/platform/profile/overview-strips";
import type { PlatformCtx } from "@/lib/tenancy/types";
import { profileHref } from "../tabs";
import { StripFrame, StripLine } from "./frame";
import { StripChip, StripNotOk, tr } from "./shared";

const ROLE_ORDER = ["owner", "admin", "manager", "editor", "agent", "logistics", "accountant", "viewer"];

export async function TeamStrip({ ctx, storeId }: { ctx: PlatformCtx; storeId: string }) {
  const title = tr("console.strip.team");
  const end = { href: profileHref(storeId, "team"), label: tr("console.strip.team.end") };
  const p = await loadStrip(ctx, storeId, "team");
  if (p.state !== "ok") return <StripNotOk strip="team" title={title} p={p} end={end} />;
  const d = p.data;
  const roles = Object.entries(d.byRole)
    .filter(([, n]) => n > 0)
    .sort(([a], [b]) => ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b));
  const total = roles.reduce((n, [, c]) => n + c, 0);
  return (
    <StripFrame strip="team" title={title} at={p.at} end={end} summary={tr("console.strip.team.summary", { count: total })}>
      <dl className="grid">
        <StripLine label={tr("console.strip.team.members")}>
          <span className="text-[12.5px]">{roles.length ? roles.map(([r, n]) => tr("console.strip.team.role_count", { role: tr(`team.role.${r}`), count: n })).join(" · ") : tr("console.strip.team.no_members")}</span>
        </StripLine>
        <StripLine label={tr("console.strip.team.invites")}>{d.pendingInvites}</StripLine>
        <StripLine label={tr("console.strip.team.two_factor")}>
          <span className={d.twoFactor.on < d.twoFactor.of ? "text-foreground" : undefined}>{tr("console.strip.team.two_factor_value", { on: d.twoFactor.on, of: d.twoFactor.of })}</span>
        </StripLine>
        <StripLine label={tr("console.strip.team.require")}>{d.requireMember2fa ? <StripChip tone="success">{tr("console.strip.on")}</StripChip> : <StripChip>{tr("console.strip.off")}</StripChip>}</StripLine>
        <StripLine label={tr("console.strip.team.online")}>{d.agentsOnline === null ? <span className="text-muted-foreground">{tr("console.strip.na")}</span> : d.agentsOnline}</StripLine>
      </dl>
    </StripFrame>
  );
}
