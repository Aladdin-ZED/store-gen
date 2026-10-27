"use client";
/**
 * The team surface of a store:
 *
 *   StoreTeamPanel  `/app/<h>/team` (docs/STORE-SAAS.md §B.5; PLA-§22.4): members and invites of one store, the role
 *                   rules of the permission matrix, invite links shown once; ar / fr / en
 */
import {
  CheckIcon,
  Loader2Icon,
  LogOutIcon,
  MessageCircleIcon,
  MoreHorizontalIcon,
  PauseIcon,
  PlayIcon,
  UserMinusIcon,
  UserPlusIcon,
  XIcon,
} from "lucide-react";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuthT } from "@/lib/auth/i18n/client";
import { ACTIVE_STORE_ROLES, type StoreRole } from "@/lib/auth/permissions";
import type { ActionResult as SeamResult } from "@/lib/tenancy/types";
import { TextField } from "@/app/(public)/_components/form-ui";
import { Monogram, Pill, Section, type PillTone } from "@/app/(public)/_components/kit";
import { useRunAction } from "@/app/(public)/_components/run-action";
import { DateText, When } from "@/app/(public)/_components/when";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "../common/confirm-dialog";
import { CopyButton } from "../common/copy-button";
import { useStepUp } from "./security-panel";

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
