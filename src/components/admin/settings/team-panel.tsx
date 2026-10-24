"use client";
/**
 * Two team surfaces, one per generation:
 *
 *   StoreTeamPanel  `/app/<h>/team` (docs/STORE-SAAS.md §B.5; PLA-§22.4): members and invites of one store, the role
 *                   rules of the permission matrix, invite links shown once; ar / fr / en
 *   TeamPanel       today's /admin Settings → Team (single-tenant accounts with temporary passwords, English) until
 *                   the R1.0 integration deletes that page
 */
import {
  BadgeCheckIcon,
  CheckIcon,
  CrownIcon,
  HeadsetIcon,
  KeyRoundIcon,
  Loader2Icon,
  LogOutIcon,
  MessageCircleIcon,
  MoreHorizontalIcon,
  PaletteIcon,
  PauseIcon,
  PlayIcon,
  PowerIcon,
  ShieldAlertIcon,
  UserMinusIcon,
  UserPlusIcon,
  XIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuthT } from "@/lib/auth/i18n/client";
import { ACTIVE_STORE_ROLES, ROLE_LABELS, type Role, type StoreRole } from "@/lib/auth/permissions";
import type { ActionResult as SeamResult } from "@/lib/tenancy/types";
import { TextField } from "@/app/(public)/_components/form-ui";
import { Monogram, Pill, Section, type PillTone } from "@/app/(public)/_components/kit";
import { useRunAction } from "@/app/(public)/_components/run-action";
import { DateText, When } from "@/app/(public)/_components/when";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "../common/confirm-dialog";
import { CopyButton } from "../common/copy-button";
import { StatusChip } from "../common/status-chip";
import { RelativeTime } from "../common/time";
import { runAction, type ActionResult } from "../lib/action-result";
import { initials } from "../lib/format";
import { Field, SettingsSection, TextInput } from "./form-kit";
import { useStepUp } from "./security-panel";

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: Role;
  totpEnabled: boolean;
  disabled: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface TeamActions {
  invite: (input: { name: string; email: string; role: string }) => Promise<ActionResult<{ email: string; password: string }>>;
  setRole: (userId: string, role: string) => Promise<ActionResult<null>>;
  setDisabled: (userId: string, disabled: boolean) => Promise<ActionResult<null>>;
  resetPassword: (userId: string) => Promise<ActionResult<{ password: string }>>;
}

const ROLE_INFO: Record<Role, { icon: typeof CrownIcon; text: string; tone: "brand" | "violet" | "teal" }> = {
  owner: { icon: CrownIcon, text: "Everything, including team, settings and security.", tone: "brand" },
  editor: { icon: PaletteIcon, text: "Generates, edits, publishes and exports pages. Sees orders and settings.", tone: "violet" },
  agent: { icon: HeadsetIcon, text: "Works the order queue only: confirms, updates statuses, blocks fakes.", tone: "teal" },
};
const ROLES = Object.keys(ROLE_INFO) as Role[];

export function TeamPanel({ members, currentUserId, actions }: { members: TeamMember[]; currentUserId: string; actions: TeamActions }) {
  const router = useRouter();
  const [inviting, setInviting] = useState(false);
  const [credentials, setCredentials] = useState<{ title: string; email: string; password: string } | null>(null);
  const [confirm, setConfirm] = useState<{ kind: "reset" | "disable" | "enable"; member: TeamMember } | null>(null);
  // the dialog keeps showing the last request while it animates out (confirm is already null)
  const [shown, setShown] = useState(confirm);
  if (confirm && confirm !== shown) setShown(confirm);
  const [busy, setBusy] = useState<string | null>(null);
  const active = members.filter((m) => !m.disabled).length;

  const changeRole = async (m: TeamMember, role: Role) => {
    if (role === m.role) return;
    setBusy(m.id);
    try {
      const ok = await runAction(actions.setRole(m.id, role), { success: `${m.name} is now ${ROLE_LABELS[role].toLowerCase()} — they were signed out to apply it` });
      if (ok !== undefined) router.refresh();
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <SettingsSection
        title="Members"
        description={`${active} active member${active === 1 ? "" : "s"}. New members get a temporary password you hand over yourself — nothing is emailed.`}
        aside={
          <Button variant="brand" className="rounded-full px-4" onClick={() => setInviting(true)}>
            <UserPlusIcon />
            Add member
          </Button>
        }
        style={{ ["--i" as string]: 1 }}
      >
        <ul className="grid gap-2">
          <AnimatePresence initial={false}>
            {members.map((m) => {
              const self = m.id === currentUserId;
              const info = ROLE_INFO[m.role];
              return (
                <motion.li
                  key={m.id}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    "grid gap-3 rounded-2xl p-3.5 ring-1 ring-inset sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center",
                    m.disabled ? "bg-foreground/[0.02] ring-foreground/[0.05]" : "ring-foreground/[0.08]",
                  )}
                >
                  <div className={cn("flex min-w-0 items-center gap-3", m.disabled && "opacity-55")}>
                    <span
                      aria-hidden="true"
                      className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(140deg,color-mix(in_oklab,var(--brand)_22%,var(--card)),color-mix(in_oklab,var(--chart-3)_22%,var(--card)))] text-sm font-semibold text-foreground/80 ring-1 ring-foreground/10"
                    >
                      {initials(m.name)}
                    </span>
                    <div className="grid min-w-0 gap-0.5">
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium">
                        <span className="truncate">{m.name}</span>
                        {self && <span className="text-xs font-normal text-muted-foreground">(you)</span>}
                        {m.disabled && <StatusChip tone="neutral">Disabled</StatusChip>}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {m.email} · {m.lastLoginAt ? <>last seen <RelativeTime iso={m.lastLoginAt} /></> : "never signed in"}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    {m.totpEnabled ? (
                      <StatusChip tone="emerald" title="Two-step verification is on">
                        2FA
                      </StatusChip>
                    ) : (
                      <StatusChip tone="warn" title="Two-step verification is off">
                        No 2FA
                      </StatusChip>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild disabled={self || m.disabled || busy === m.id}>
                        <button
                          type="button"
                          className="inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium ring-1 ring-foreground/10 transition-colors ring-inset hover:bg-foreground/[0.04] disabled:cursor-default disabled:hover:bg-transparent"
                          aria-label={`Role of ${m.name}: ${ROLE_LABELS[m.role]}`}
                        >
                          {busy === m.id ? <Loader2Icon className="size-3.5 animate-spin" /> : <info.icon className="size-3.5" />}
                          {ROLE_LABELS[m.role]}
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-72 rounded-xl">
                        <DropdownMenuLabel>Role</DropdownMenuLabel>
                        <DropdownMenuRadioGroup value={m.role} onValueChange={(r) => void changeRole(m, r as Role)}>
                          {ROLES.map((r) => (
                            <DropdownMenuRadioItem key={r} value={r} className="items-start py-2">
                              <span className="grid gap-0.5">
                                <span className="font-medium">{ROLE_LABELS[r]}</span>
                                <span className="text-xs text-muted-foreground">{ROLE_INFO[r].text}</span>
                              </span>
                            </DropdownMenuRadioItem>
                          ))}
                        </DropdownMenuRadioGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    {!self && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" className="rounded-full" aria-label={`More actions for ${m.name}`}>
                            <MoreHorizontalIcon />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56 rounded-xl">
                          {!m.disabled && (
                            <DropdownMenuItem onSelect={() => setConfirm({ kind: "reset", member: m })}>
                              <KeyRoundIcon />
                              Reset password
                            </DropdownMenuItem>
                          )}
                          {!m.disabled && <DropdownMenuSeparator />}
                          {m.disabled ? (
                            <DropdownMenuItem onSelect={() => setConfirm({ kind: "enable", member: m })}>
                              <PowerIcon />
                              Enable account
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem variant="destructive" onSelect={() => setConfirm({ kind: "disable", member: m })}>
                              <PowerIcon />
                              Disable account
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
        {members.length === 1 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3.5 ring-1 ring-brand/15 ring-inset">
            <p className="text-sm text-pretty">
              <span className="font-medium">It&apos;s just you for now.</span>{" "}
              <span className="text-muted-foreground">Add your call-center agents so they confirm orders without seeing your pages or settings.</span>
            </p>
            <Button variant="outline" size="sm" className="rounded-full" onClick={() => setInviting(true)}>
              <HeadsetIcon />
              Add an agent
            </Button>
          </div>
        )}
      </SettingsSection>

      <SettingsSection title="What each role can do" style={{ ["--i" as string]: 2 }}>
        <ul className="grid gap-3 md:grid-cols-3">
          {ROLES.map((r) => {
            const info = ROLE_INFO[r];
            return (
              <li key={r} className="grid content-start gap-2 rounded-2xl p-4 ring-1 ring-foreground/[0.07] ring-inset">
                <StatusChip tone={info.tone} dot={false} className="justify-self-start">
                  <info.icon className="size-3.5" />
                  {ROLE_LABELS[r]}
                </StatusChip>
                <p className="text-sm leading-relaxed text-pretty text-muted-foreground">{info.text}</p>
              </li>
            );
          })}
        </ul>
      </SettingsSection>

      <InviteDialog
        open={inviting}
        onOpenChange={setInviting}
        invite={actions.invite}
        onCreated={(c) => {
          setInviting(false);
          setCredentials({ title: "Member added", ...c });
          router.refresh();
        }}
      />

      <CredentialsDialog credentials={credentials} onClose={() => setCredentials(null)} />

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        destructive={shown?.kind === "disable"}
        icon={shown?.kind === "reset" ? <KeyRoundIcon /> : shown?.kind === "disable" ? <ShieldAlertIcon /> : <BadgeCheckIcon />}
        title={
          shown?.kind === "reset"
            ? `Reset ${shown.member.name}'s password?`
            : shown?.kind === "disable"
              ? `Disable ${shown?.member.name}?`
              : `Enable ${shown?.member.name}?`
        }
        description={
          shown?.kind === "reset"
            ? "Their current password stops working and they are signed out everywhere. You'll get a new temporary password to hand over."
            : shown?.kind === "disable"
              ? "They are signed out at once and can't sign in again until you enable the account. Their past work and audit trail stay."
              : "They can sign in again with their existing password."
        }
        confirmLabel={shown?.kind === "reset" ? "Reset password" : shown?.kind === "disable" ? "Disable account" : "Enable account"}
        pendingLabel="Working…"
        onConfirm={async () => {
          if (!shown) return;
          const m = shown.member;
          if (shown.kind === "reset") {
            const res = await runAction(actions.resetPassword(m.id));
            if (!res) return false;
            setCredentials({ title: "New temporary password", email: m.email, password: res.password });
          } else {
            const res = await runAction(actions.setDisabled(m.id, shown.kind === "disable"), {
              success: shown.kind === "disable" ? `${m.name} can no longer sign in` : `${m.name} can sign in again`,
            });
            if (res === undefined) return false;
          }
          router.refresh();
        }}
      />
    </>
  );
}

function InviteDialog({
  open,
  onOpenChange,
  invite,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invite: TeamActions["invite"];
  onCreated: (c: { email: string; password: string }) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("agent");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await runAction(invite({ name, email, role }));
      if (res) {
        setName("");
        setEmail("");
        setRole("agent");
        onCreated(res);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="gap-5 rounded-2xl p-6 sm:max-w-lg">
        <DialogHeader className="gap-1.5">
          <DialogTitle className="text-[1.05rem] font-semibold tracking-[-0.01em]">Add a team member</DialogTitle>
          <DialogDescription>We create the account with a temporary password. You share it with them — and the private admin link.</DialogDescription>
        </DialogHeader>
        <form id="invite-form" onSubmit={submit} className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name">
              {(fp) => <TextInput {...fp} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required autoComplete="off" placeholder="Salma" />}
            </Field>
            <Field label="Email">
              {(fp) => <TextInput {...fp} type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={191} required autoComplete="off" placeholder="salma@store.ma" />}
            </Field>
          </div>
          <fieldset className="grid gap-2">
            <legend className="mb-1.5 text-sm font-medium">Role</legend>
            <div role="radiogroup" aria-label="Role" className="grid gap-2">
              {ROLES.map((r) => {
                const info = ROLE_INFO[r];
                const selected = role === r;
                return (
                  <button
                    key={r}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setRole(r)}
                    className={cn(
                      "flex items-center gap-3 rounded-xl p-3 text-start ring-1 transition-[box-shadow,background-color] duration-200 ring-inset outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      selected ? "bg-brand/[0.06] ring-brand/45" : "ring-foreground/10 hover:ring-foreground/20",
                    )}
                  >
                    <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", selected ? "bg-brand text-brand-foreground" : "bg-foreground/[0.06]")}>
                      <info.icon className="size-4" />
                    </span>
                    <span className="grid flex-1 gap-0.5">
                      <span className="text-sm font-medium">{ROLE_LABELS[r]}</span>
                      <span className="text-xs text-muted-foreground">{info.text}</span>
                    </span>
                    <span className={cn("flex size-5 items-center justify-center rounded-full transition-all", selected ? "scale-100 bg-brand text-brand-foreground" : "scale-75 opacity-0")}>
                      <CheckIcon className="size-3" strokeWidth={3} />
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>
        </form>
        <DialogFooter>
          <Button variant="ghost" className="rounded-full" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="invite-form" className="rounded-full px-4" disabled={saving || !name.trim() || !email.trim()}>
            {saving ? <Loader2Icon className="animate-spin" /> : <UserPlusIcon />}
            Create account
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** One-time display of a temporary password (never retrievable later). */
function CredentialsDialog({ credentials, onClose }: { credentials: { title: string; email: string; password: string } | null; onClose: () => void }) {
  return (
    <Dialog open={credentials !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="gap-5 rounded-2xl p-6 sm:max-w-md" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader className="gap-1.5">
          <DialogTitle className="text-[1.05rem] font-semibold tracking-[-0.01em]">{credentials?.title}</DialogTitle>
          <DialogDescription>Shown once. Send it privately; they should change it in Settings → Security after signing in.</DialogDescription>
        </DialogHeader>
        {credentials && (
          <dl className="grid gap-2 rounded-2xl bg-foreground/[0.03] p-4 ring-1 ring-foreground/[0.07] ring-inset">
            <div className="flex items-center justify-between gap-3">
              <div className="grid min-w-0">
                <dt className="text-xs text-muted-foreground">Email</dt>
                <dd className="truncate text-sm font-medium">{credentials.email}</dd>
              </div>
              <CopyButton value={credentials.email} label="Copy email" />
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-foreground/[0.07] pt-2">
              <div className="grid min-w-0">
                <dt className="text-xs text-muted-foreground">Temporary password</dt>
                <dd className="font-mono text-[0.95rem] font-semibold tracking-wide select-all">{credentials.password}</dd>
              </div>
              <CopyButton value={credentials.password} label="Copy password" toastMessage="Password copied" />
            </div>
          </dl>
        )}
        <DialogFooter>
          <CopyButton
            value={credentials ? `Email: ${credentials.email}\nTemporary password: ${credentials.password}` : ""}
            label="Copy both"
            size="default"
            variant="outline"
            className="rounded-full"
          />
          <Button className="rounded-full px-4" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* /app/<h>/team (docs/STORE-SAAS.md §B.5; PLA-§22.4)                   */
/* ------------------------------------------------------------------ */

export interface TeamMemberRow {
  userId: string;
  name: string;
  email: string;
  role: StoreRole;
  status: "active" | "suspended";
  totpEnabled: boolean;
  joinedAt: string;
  lastActiveAt: string | null;
  self: boolean;
  /** the viewer may change this member's role, suspend or remove them (canManageMember) */
  manageable: boolean;
  /** the store's only active owner: no destructive item */
  lastOwner: boolean;
  /** the roles the viewer may give this member */
  assignable: StoreRole[];
}

export interface TeamInviteRow {
  id: string;
  emailMasked: string;
  role: StoreRole;
  invitedBy: string;
  expiresAt: string;
  state: "pending" | "accepted" | "revoked" | "expired";
  revocable: boolean;
}

export interface StoreTeamActions {
  createInvite: (input: { email: string; role: StoreRole; note?: string }) => Promise<SeamResult<{ inviteId: string; url: string; expiresAt: string }>>;
  revokeInvite: (input: { inviteId: string }) => Promise<SeamResult<null>>;
  changeRole: (input: { userId: string; role: StoreRole }) => Promise<SeamResult<{ role: string }>>;
  setStatus: (input: { userId: string; status: "active" | "suspended" }) => Promise<SeamResult<{ status: "active" | "suspended" }>>;
  remove: (input: { userId: string }) => Promise<SeamResult<null>>;
  leave: () => Promise<SeamResult<null>>;
}

const INVITE_TONE: Record<TeamInviteRow["state"], PillTone> = { pending: "info", accepted: "success", revoked: "neutral", expired: "neutral" };
/** rows enter with a 6 px rise + fade, staggered 20 ms over at most 12 rows, on the §I.6 ease-out (never a spring) */
const rowEnter = (i: number) => ({
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.18, ease: [0.2, 0.8, 0.2, 1] as const, delay: Math.min(i, 12) * 0.02 },
});
const hairline = "divide-y divide-[color-mix(in_oklab,var(--foreground)_8%,transparent)]";

/**
 * Members and invites of one store. The page computes what the viewer may do per row; the actions re-check it all.
 * An invite's link is shown once, in the result sheet (copy, WhatsApp, QR); it is never retrievable afterwards.
 */
export function StoreTeamPanel({
  storeName,
  viewer,
  members,
  invites,
  invitable,
  canInvite,
  readOnly,
  actions,
}: {
  storeName: string;
  viewer: { role: StoreRole; totp: boolean };
  members: TeamMemberRow[];
  invites: TeamInviteRow[];
  invitable: StoreRole[];
  canInvite: boolean;
  /** "view as store": controls stay visible, the server refuses them */
  readOnly: boolean;
  actions: StoreTeamActions;
}) {
  const t = useAuthT();
  const run = useRunAction();
  const router = useRouter();
  const stepUp = useStepUp(viewer.totp);
  const [inviting, setInviting] = useState(false);
  const [created, setCreated] = useState<{ url: string; expiresAt: string; emailMasked: string } | null>(null);
  const [removing, setRemoving] = useState<TeamMemberRow | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const pending = invites.filter((i) => i.state === "pending").length;
  const me = members.find((m) => m.self);

  const changeRole = async (m: TeamMemberRow, role: StoreRole) => {
    if (role === m.role) return;
    setBusy(m.userId);
    try {
      await stepUp.guard(
        () => run(actions.changeRole({ userId: m.userId, role }), { quiet: ["step_up"], success: "team.member.role_saved" }),
        (res) => {
          if (res.ok) router.refresh();
        },
      );
    } finally {
      setBusy(null);
    }
  };

  const setStatus = async (m: TeamMemberRow, status: "active" | "suspended") => {
    setBusy(m.userId);
    try {
      const res = await run(actions.setStatus({ userId: m.userId, status }), { success: status === "suspended" ? "team.member.suspended_done" : "team.member.reactivated_done" });
      if (res.ok) router.refresh();
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Tabs defaultValue="members" className="gap-5">
        <TabsList variant="line" className="h-9">
          <TabsTrigger value="members">{t("team.tab.members", { count: members.length })}</TabsTrigger>
          <TabsTrigger value="invites">{t("team.tab.invites", { count: pending })}</TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="grid gap-5">
          <Section
            title={t("team.members.title")}
            description={t("team.members.lead")}
            aside={
              canInvite ? (
                <Button variant="brand" onClick={() => setInviting(true)}>
                  <UserPlusIcon aria-hidden="true" />
                  {t("team.invite.button")}
                </Button>
              ) : undefined
            }
          >
            <ul className={hairline}>
              {members.map((m, i) => (
                <motion.li key={m.userId} {...rowEnter(i)} className="grid gap-3 py-3.5 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                  <div className={cn("flex min-w-0 items-center gap-3", m.status === "suspended" && "opacity-60")}>
                    <Monogram name={m.name || m.email} seed={m.userId} />
                    <div className="grid min-w-0 gap-0.5">
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium">
                        <span className="truncate">{m.name || m.email}</span>
                        {m.self && <Pill tone="brand">{t("team.member.you")}</Pill>}
                        {m.status === "suspended" && <Pill tone="warn">{t("app.member.suspended")}</Pill>}
                        <Pill tone={m.totpEnabled ? "success" : "neutral"} title={t(m.totpEnabled ? "team.member.2fa_on" : "team.member.2fa_off")}>
                          {t(m.totpEnabled ? "team.member.2fa" : "team.member.no_2fa")}
                        </Pill>
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        <bdi dir="ltr">{m.email}</bdi> ·{" "}
                        {m.lastActiveAt ? (
                          <>
                            {t("team.member.active")} <When iso={m.lastActiveAt} />
                          </>
                        ) : (
                          t("team.member.never")
                        )}{" "}
                        · {t("team.member.joined")} <DateText iso={m.joinedAt} />
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 sm:justify-end">
                    {m.manageable && m.assignable.length > 0 ? (
                      <Select value={m.role} onValueChange={(r) => void changeRole(m, r as StoreRole)} disabled={busy === m.userId}>
                        <SelectTrigger size="sm" className="min-w-32" aria-label={t("team.member.role_of", { name: m.name || m.email })}>
                          {busy === m.userId ? <Loader2Icon aria-hidden="true" className="animate-spin" /> : null}
                          {/* the trigger shows the role name only, not the item's explainer line */}
                          <SelectValue>{t(`team.role.${m.role}`)}</SelectValue>
                        </SelectTrigger>
                        <SelectContent align="end" className="w-72">
                          {[...new Set([m.role, ...m.assignable])].map((r) => (
                            <SelectItem key={r} value={r} className="py-2">
                              <span className="grid gap-0.5">
                                <span className="font-medium">{t(`team.role.${r}`)}</span>
                                <span className="text-xs whitespace-normal text-muted-foreground">{t(`team.role.${r}.line`)}</span>
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="px-2 text-sm text-muted-foreground">{t(`team.role.${m.role}`)}</span>
                    )}
                    {m.manageable && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label={t("team.member.more", { name: m.name || m.email })} disabled={busy === m.userId}>
                            <MoreHorizontalIcon aria-hidden="true" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                          {m.lastOwner ? (
                            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{t("team.leave.last_owner")}</DropdownMenuLabel>
                          ) : (
                            <>
                              {m.status === "active" ? (
                                <DropdownMenuItem onSelect={() => void setStatus(m, "suspended")}>
                                  <PauseIcon aria-hidden="true" />
                                  {t("team.member.suspend")}
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem onSelect={() => void setStatus(m, "active")}>
                                  <PlayIcon aria-hidden="true" />
                                  {t("team.member.reactivate")}
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem variant="destructive" onSelect={() => setRemoving(m)}>
                                <UserMinusIcon aria-hidden="true" />
                                {t("team.member.remove")}
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </motion.li>
              ))}
            </ul>
          </Section>

          <RolesExplainer roles={invitable.length ? invitable : [...new Set(members.map((m) => m.role))]} />

          {me && (
            <Section id="leave" tone="danger" title={t("team.leave.title")} description={t(me.lastOwner ? "team.leave.last_owner" : "team.leave.lead", { store: storeName })}>
              <Button variant="destructive" className="justify-self-start" disabled={me.lastOwner} onClick={() => setLeaving(true)}>
                <LogOutIcon aria-hidden="true" className="rtl:rotate-180" />
                {t("team.leave.button")}
              </Button>
            </Section>
          )}
        </TabsContent>

        <TabsContent value="invites">
          <Section title={t("team.invites.title")} description={t("team.invites.lead")}>
            {invites.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("team.invites.none")}</p>
            ) : (
              <ul className={hairline}>
                {invites.map((inv, i) => (
                  <motion.li key={inv.id} {...rowEnter(i)} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="grid min-w-0 gap-0.5">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        <bdi dir="ltr">{inv.emailMasked}</bdi>
                        <Pill tone={INVITE_TONE[inv.state]}>{t(`team.invite.state.${inv.state}`)}</Pill>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t(`team.role.${inv.role}`)}
                        {inv.invitedBy && ` · ${t("team.invites.by", { name: inv.invitedBy })}`}
                        {inv.state === "pending" && (
                          <>
                            {" · "}
                            {t("team.invites.expires")} <When iso={inv.expiresAt} />
                          </>
                        )}
                      </p>
                    </div>
                    {inv.revocable && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy === inv.id}
                        onClick={async () => {
                          setBusy(inv.id);
                          try {
                            const res = await run(actions.revokeInvite({ inviteId: inv.id }), { success: "team.invite.revoked" });
                            if (res.ok) router.refresh();
                          } finally {
                            setBusy(null);
                          }
                        }}
                      >
                        {busy === inv.id ? <Loader2Icon aria-hidden="true" className="animate-spin" /> : <XIcon aria-hidden="true" />}
                        {t("team.invite.revoke")}
                      </Button>
                    )}
                  </motion.li>
                ))}
              </ul>
            )}
          </Section>
        </TabsContent>
      </Tabs>

      <StoreInviteDialog
        open={inviting}
        onOpenChange={setInviting}
        roles={invitable}
        readOnly={readOnly}
        create={actions.createInvite}
        guard={stepUp.guard}
        onCreated={(c) => {
          setInviting(false);
          setCreated(c);
          router.refresh();
        }}
      />
      <InviteLinkSheet created={created} storeName={storeName} onClose={() => setCreated(null)} />
      <RemoveMemberDialog
        member={removing}
        onClose={() => setRemoving(null)}
        remove={async (m) => {
          const res = await run(actions.remove({ userId: m.userId }), { success: "team.member.removed" });
          if (res.ok) router.refresh();
          return res.ok;
        }}
      />
      <ConfirmDialog
        open={leaving}
        onOpenChange={setLeaving}
        destructive
        icon={<LogOutIcon />}
        title={t("team.leave.confirm_title", { store: storeName })}
        description={t("team.leave.confirm_lead")}
        confirmLabel={t("team.leave.button")}
        pendingLabel={t("team.leave.leaving")}
        onConfirm={async () => {
          const res = await run(actions.leave());
          if (!res.ok) return false;
          router.push("/app");
        }}
      />
      {stepUp.sheet}
    </>
  );
}

/** PLA-§22.4.4: one line per role, only the roles of this release (TN-12). */
function RolesExplainer({ roles }: { roles: StoreRole[] }) {
  const t = useAuthT();
  const shown = ACTIVE_STORE_ROLES.filter((r) => roles.includes(r));
  if (shown.length === 0) return null;
  return (
    <Section title={t("team.roles.title")}>
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {shown.map((r) => (
          <div key={r} className="grid gap-0.5">
            <dt className="text-sm font-medium">{t(`team.role.${r}`)}</dt>
            <dd className="text-sm text-muted-foreground">{t(`team.role.${r}.line`)}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}

function StoreInviteDialog({
  open,
  onOpenChange,
  roles,
  readOnly,
  create,
  guard,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roles: StoreRole[];
  readOnly: boolean;
  create: StoreTeamActions["createInvite"];
  /** the panel's step-up guard: an admin/owner invite answers `step_up` (§B.7) and is sent again after the proof */
  guard: ReturnType<typeof useStepUp>["guard"];
  onCreated: (c: { url: string; expiresAt: string; emailMasked: string }) => void;
}) {
  const t = useAuthT();
  const run = useRunAction();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<StoreRole | null>(null);
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const chosen = role ?? (roles.includes("agent") ? "agent" : (roles[0] ?? null));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chosen) return;
    setSaving(true);
    try {
      const input = { email, role: chosen, note: note || undefined };
      await guard(() => run(create(input), { quiet: ["invalid", "step_up"] }), (res) => {
        if (res.ok) {
          const typed = email.trim();
          const at = typed.lastIndexOf("@");
          onCreated({ url: res.data.url, expiresAt: res.data.expiresAt, emailMasked: at > 0 ? `${typed.slice(0, 1)}•••${typed.slice(at)}` : typed });
          setEmail("");
          setNote("");
          setRole(null);
          setErrors({});
        } else if (res.error === "invalid") {
          const fields = (res.items ?? []).flatMap((i) => (i.field ? [[i.field, i.title] as const] : []));
          setErrors(fields.length ? Object.fromEntries(fields) : { email: res.message ?? "error.invalid" });
        }
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="gap-5 rounded-[16px] p-6 sm:max-w-lg">
        <DialogHeader className="gap-1.5">
          <DialogTitle className="text-[1.05rem] font-semibold tracking-[-0.01em]">{t("team.invite.title_dialog")}</DialogTitle>
          <DialogDescription>{t("team.invite.dialog_lead")}</DialogDescription>
        </DialogHeader>
        <form id="store-invite-form" onSubmit={submit} noValidate className="grid gap-4">
          <TextField
            label={t("auth.field.email")}
            name="email"
            type="email"
            inputMode="email"
            dir="ltr"
            autoComplete="off"
            maxLength={191}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={errors.email ? t(errors.email) : undefined}
          />
          <fieldset className="grid gap-2">
            <legend className="mb-1.5 text-sm font-medium">{t("team.invite.role")}</legend>
            <div role="radiogroup" className="grid gap-1.5">
              {roles.map((r) => (
                <button
                  key={r}
                  type="button"
                  role="radio"
                  aria-checked={chosen === r}
                  onClick={() => setRole(r)}
                  className={cn(
                    "flex items-center gap-3 rounded-[8px] border px-3 py-2.5 text-start transition-colors duration-150 outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                    chosen === r ? "border-brand/50 bg-brand/[0.05]" : "border-[color-mix(in_oklab,var(--foreground)_9%,transparent)] hover:border-[color-mix(in_oklab,var(--foreground)_18%,transparent)]",
                  )}
                >
                  <span className="grid flex-1 gap-0.5">
                    <span className="text-sm font-medium">{t(`team.role.${r}`)}</span>
                    <span className="text-xs text-muted-foreground">{t(`team.role.${r}.line`)}</span>
                  </span>
                  <CheckIcon aria-hidden="true" className={cn("size-4 text-brand transition-opacity duration-150", chosen === r ? "opacity-100" : "opacity-0")} />
                </button>
              ))}
              {roles.length === 0 && <p className="text-sm text-muted-foreground">{t(readOnly ? "error.impersonation_read_only" : "team.invite.no_roles")}</p>}
            </div>
            {errors.role && <p className="text-xs font-medium text-destructive">{t(errors.role)}</p>}
          </fieldset>
          <TextField label={t("team.invite.note")} name="note" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} hint={t("team.invite.note_hint")} />
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            {t("account.cancel")}
          </Button>
          <Button type="submit" form="store-invite-form" variant="brand" disabled={saving || !email.trim() || !chosen}>
            {saving ? <Loader2Icon aria-hidden="true" className="animate-spin" /> : <UserPlusIcon aria-hidden="true" />}
            {t("team.invite.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The link, shown once: copy, WhatsApp, a QR code, the expiry and the e-mail binding (PLA-§22.4, PD47). */
function InviteLinkSheet({ created, storeName, onClose }: { created: { url: string; expiresAt: string; emailMasked: string } | null; storeName: string; onClose: () => void }) {
  const t = useAuthT();
  const [qr, setQr] = useState<{ url: string; data: string } | null>(null);
  useEffect(() => {
    if (!created) return;
    let live = true;
    void import("qrcode")
      .then((m) => m.default.toDataURL(created.url, { margin: 1, width: 320, errorCorrectionLevel: "M" }))
      .then((data) => {
        if (live) setQr({ url: created.url, data });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [created]);
  const wa = created ? `https://wa.me/?text=${encodeURIComponent(t("team.invite.wa_text", { store: storeName, url: created.url }))}` : "#";

  return (
    <Dialog open={created !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="gap-5 rounded-[16px] p-6 sm:max-w-md" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader className="gap-1.5">
          <DialogTitle className="text-[1.05rem] font-semibold tracking-[-0.01em]">{t("team.invite.link_title")}</DialogTitle>
          <DialogDescription>{t("team.invite.link_lead")}</DialogDescription>
        </DialogHeader>
        {created && (
          <div className="grid gap-4">
            <div className="flex items-center gap-2 rounded-[8px] border bg-background p-2 ps-3">
              <code dir="ltr" className="min-w-0 flex-1 truncate font-mono text-[0.8rem] select-all">
                {created.url}
              </code>
              <CopyButton value={created.url} label={t("account.copy")} toastMessage={t("account.copied")} />
            </div>
            <div className="flex items-center gap-4">
              {qr && qr.url === created.url ? (
                // eslint-disable-next-line @next/next/no-img-element -- data: URL QR code, nothing to optimise
                <img src={qr.data} alt={t("team.invite.qr_alt")} width={128} height={128} className="size-32 shrink-0 rounded-[8px] border bg-white p-1" />
              ) : (
                <span aria-hidden="true" className="size-32 shrink-0 rounded-[8px] border bg-muted" />
              )}
              <div className="grid gap-2 text-sm">
                <p className="text-muted-foreground">
                  {t("team.invite.expires_on")} <DateText iso={created.expiresAt} className="font-medium text-foreground" />
                </p>
                <p className="text-muted-foreground">
                  {t("team.invite.bound")}{" "}
                  <bdi dir="ltr" className="font-medium text-foreground">
                    {created.emailMasked}
                  </bdi>
                </p>
              </div>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button asChild variant="outline">
            <a href={wa} target="_blank" rel="noopener noreferrer">
              <MessageCircleIcon aria-hidden="true" />
              {t("team.invite.whatsapp")}
            </a>
          </Button>
          <Button variant="brand" onClick={onClose}>
            {t("account.done")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Removal asks for the member's name, typed (PLA-§22.4): the one irreversible team action. */
function RemoveMemberDialog({ member, onClose, remove }: { member: TeamMemberRow | null; onClose: () => void; remove: (m: TeamMemberRow) => Promise<boolean> }) {
  const t = useAuthT();
  const [typed, setTyped] = useState("");
  const [shown, setShown] = useState(member);
  if (member && member !== shown) {
    setShown(member);
    setTyped("");
  }
  const expected = (shown?.name || shown?.email || "").trim();
  return (
    <ConfirmDialog
      open={member !== null}
      onOpenChange={(open) => !open && onClose()}
      destructive
      icon={<UserMinusIcon />}
      title={t("team.member.remove_title", { name: expected })}
      description={t("team.member.remove_lead")}
      confirmLabel={t("team.member.remove")}
      pendingLabel={t("team.member.removing")}
      onConfirm={async () => {
        if (!shown || typed.trim().toLowerCase() !== expected.toLowerCase()) return false;
        return (await remove(shown)) ? undefined : false;
      }}
    >
      <TextField label={t("team.member.type_name", { name: expected })} name="confirm-name" autoComplete="off" spellCheck={false} value={typed} onChange={(e) => setTyped(e.target.value)} />
    </ConfirmDialog>
  );
}
