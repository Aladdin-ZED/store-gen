import type { Metadata } from "next";
import { StoreTeamPanel, type TeamInviteRow, type TeamMemberRow } from "@/components/admin/settings/team-panel";
import { ACTIVE_STORE_ROLES, ROLE_RANK, canManageMember, invitableRoles } from "@/lib/auth/permissions";
import { authTranslator } from "@/lib/auth/i18n";
import { viewerLocale } from "@/lib/auth/locale";
import { listInvites, listMembersByScope } from "@/lib/tenancy/invites";
import { requireStoreMember } from "@/lib/tenancy/seam";
import { PageTitle } from "@/app/(public)/_components/kit";
import { changeMemberRoleAction, createInviteAction, leaveStoreAction, removeMemberAction, revokeInviteAction, setMemberStatusAction } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  return { title: authTranslator(await viewerLocale(null))("team.meta") };
}

/**
 * `/app/<h>/team` (§I.1, PLA-§22.4; `members.read`): members and invites. The role rules are computed here once per
 * row (`canManageMember`, the rank rule on the new role, `invitableRoles`) so the page only offers what the server
 * will accept; every action re-checks them. Under "view as store" the controls stay visible and refuse read-only.
 */
export default async function TeamPage({ params }: { params: Promise<{ store: string }> }) {
  const { store: handle } = await params;
  const ctx = await requireStoreMember({ handle, permission: "members.read" });
  const [members, invites, locale] = await Promise.all([listMembersByScope(ctx.scope), listInvites(ctx), viewerLocale(ctx.user)]);
  const t = authTranslator(locale);
  const role = ctx.membership.role;
  const impersonating = ctx.scope.kind === "impersonation";
  const canManage = ctx.can("members.manage") || impersonating;
  const activeOwners = members.filter((m) => m.role === "owner" && m.status === "active").length;

  const rows: TeamMemberRow[] = members.map((m) => {
    const self = m.userId === ctx.user.id;
    const manageable = !self && canManage && (impersonating || canManageMember(role, m.role));
    return {
      userId: m.userId,
      name: m.name,
      email: m.email,
      role: m.role,
      status: m.status,
      totpEnabled: m.totpEnabled,
      joinedAt: m.joinedAt.toISOString(),
      lastActiveAt: m.lastActiveAt?.toISOString() ?? null,
      self,
      manageable,
      lastOwner: m.role === "owner" && m.status === "active" && activeOwners <= 1,
      // only an owner grants owner; anyone else roles ranked below their own
      assignable: manageable ? ACTIVE_STORE_ROLES.filter((r) => role === "owner" || impersonating || ROLE_RANK[r] < ROLE_RANK[role]) : [],
    };
  });
  const inviteRows: TeamInviteRow[] = invites.map((i) => ({
    id: i.id,
    emailMasked: i.emailMasked,
    role: i.role,
    invitedBy: i.invitedBy.name,
    expiresAt: i.expiresAt.toISOString(),
    state: i.state,
    revocable: i.state === "pending" && (impersonating || (ctx.can("members.invite") && invitableRoles(role).includes(i.role))),
  }));
  const canInvite = ctx.can("members.invite") || impersonating;

  return (
    <main className="mx-auto grid w-full max-w-5xl content-start gap-6 px-4 py-8 sm:px-6 md:py-10">
      <PageTitle title={t("team.title")} lead={t("team.lead", { store: ctx.store.name })} />
      <StoreTeamPanel
        storeName={ctx.store.name}
        viewer={{ role, totp: ctx.user.totpEnabled }}
        members={rows}
        invites={inviteRows}
        invitable={impersonating ? [] : canInvite ? [...invitableRoles(role)] : []}
        canInvite={canInvite}
        readOnly={impersonating}
        actions={{
          createInvite: createInviteAction,
          revokeInvite: revokeInviteAction,
          changeRole: changeMemberRoleAction,
          setStatus: setMemberStatusAction,
          remove: removeMemberAction,
          leave: leaveStoreAction,
        }}
      />
    </main>
  );
}
