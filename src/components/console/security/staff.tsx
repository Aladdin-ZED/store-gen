"use client";
/**
 * `/admin/security/staff` (platform.md PLA-§14.1, §14.3, SE-01, PD7, PD13; `staff.manage` ↑): the security facts (the
 * allowlist's address source and the matched address, the red ADMIN_HOST line), the staff table with its states
 * (Active · Invited · Waiting for 2FA), Invite staff (the link shown once with Copy and WhatsApp), Change role
 * (super_admin goes through a platform request), Remove, Revoke invite and "Sign out all staff except me". The last
 * super_admin refusal comes back from the server as its sentence.
 */
import { LogOutIcon, MoreHorizontalIcon, UserPlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { DropdownMenu as DropdownPrimitive } from "radix-ui";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { inviteStaffAction, removeStaffAction, revokeStaffInviteAction, setStaffRoleAction, signOutAllStaffAction } from "@/app/admin/(console)/security/actions";
import { useT } from "@/lib/i18n/admin/client";
import type { SecurityFacts } from "@/lib/platform/security-facts";
import type { StaffList, StaffRow } from "@/lib/platform/staff";
import { cn } from "@/lib/utils";
import { Ago, Until } from "../ago";
import { useGuarded } from "../guarded";
import { ConsoleDialog, NoteField } from "../queue/decision-dialogs";
import { Banner, button, card, EmptyLine, Field, inputCls, SettingsCard, ShownOnce, StatusText, td, th, type Tone } from "../kit";

const ROLES = ["super_admin", "admin", "support", "analyst"] as const;
const INVITABLE = ["admin", "support", "analyst"] as const;
const STATE_TONE: Record<string, Tone> = { active: "ok", waiting_2fa: "warn", invited: "info", valid: "info", expired: "neutral", revoked: "neutral", used: "ok" };

export function SecurityFactsCard({ facts }: { facts: SecurityFacts }) {
  const t = useT();
  const g = useGuarded();
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  return (
    <SettingsCard
      title={t("console.security.facts")}
      lead={t("console.security.facts_lead")}
      aside={
        <button type="button" onClick={() => setConfirm(true)} className={cn(button.base, button.secondary)}>
          <LogOutIcon aria-hidden="true" className="size-3.5" />
          {t("console.security.sign_out_all")}
        </button>
      }
    >
      {facts.adminHostMissing && <Banner tone="danger">{t("console.security.admin_host_missing")}</Banner>}
      <dl className="grid gap-x-6 gap-y-3 text-[12.5px] sm:grid-cols-2 lg:grid-cols-3">
        <Fact label={t("console.security.gate")}>
          <StatusText tone="ok">{t("console.security.gate_on")}</StatusText>
        </Fact>
        <Fact label={t("console.security.allowlist")}>
          {facts.allowlist.configured ? <StatusText tone="ok">{t("console.security.allowlist_on", { count: facts.allowlist.count })}</StatusText> : <StatusText tone="neutral">{t("console.security.allowlist_off")}</StatusText>}
        </Fact>
        <Fact label={t("console.security.admin_host")}>
          {facts.adminHost ? (
            <bdi dir="ltr" className="font-mono">
              {facts.adminHost}
            </bdi>
          ) : (
            <StatusText tone={facts.adminHostMissing ? "danger" : "neutral"}>{t("console.security.not_set")}</StatusText>
          )}
        </Fact>
        <Fact label={t("console.security.totp")}>
          <StatusText tone={facts.staff.withTotp >= facts.staff.total ? "ok" : "warn"}>{t("console.security.totp_value", { with: facts.staff.withTotp, total: facts.staff.total })}</StatusText>
        </Fact>
        <Fact label={t("console.security.sessions")}>
          <span className="num">{facts.sessions24h}</span>
        </Fact>
      </dl>
      <p className="rounded-[var(--r-control)] bg-muted/40 px-3 py-2 text-[12.5px]">
        {t(`console.security.address_source.${facts.allowlist.source}`)}{" "}
        {facts.allowlist.matched ? (
          <>
            {t("console.security.matched")}{" "}
            <bdi dir="ltr" className="font-mono font-medium">
              {facts.allowlist.matched}
            </bdi>
            {facts.allowlist.configured && <> · {facts.allowlist.admitted ? t("console.security.admitted") : t("console.security.not_admitted")}</>}
          </>
        ) : (
          t("console.security.no_address")
        )}
      </p>
      {confirm && (
        <ConsoleDialog
          open
          onOpenChange={(o) => !o && setConfirm(false)}
          title={t("console.security.sign_out_all")}
          description={t("console.security.sign_out_all_lead")}
          footer={
            <>
              {g.problem && <p className="me-auto text-[12px] text-[var(--c-danger-ink)]">{g.problem}</p>}
              <button type="button" onClick={() => setConfirm(false)} className={cn(button.base, button.secondary)}>
                {t("console.form.cancel")}
              </button>
              <button type="button" disabled={g.busy} onClick={() => void g.run((opId) => signOutAllStaffAction({ opId }), (d) => (toast.success(t("console.security.signed_out", { staff: d.staff, sessions: d.sessions })), setConfirm(false), router.refresh()))} className={cn(button.base, button.dangerSolid)}>
                {t("console.security.sign_out_all_go")}
              </button>
              {g.sheet}
            </>
          }
        >
          <p className="text-[12.5px] text-muted-foreground">{t("console.step_up_note")}</p>
        </ConsoleDialog>
      )}
    </SettingsCard>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid min-w-0 gap-0.5">
      <dt className="text-[11.5px] text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate">{children}</dd>
    </div>
  );
}

export function StaffTable({ list, me }: { list: StaffList; me: string }) {
  const t = useT();
  const router = useRouter();
  const g = useGuarded();
  const [inviting, setInviting] = useState(false);
  const [act, setAct] = useState<{ kind: "role" | "remove"; row: StaffRow } | null>(null);
  return (
    <div className="grid gap-4">
      <section aria-label={t("console.staff.title")} className={card}>
        <div className="flex flex-wrap items-center gap-2 px-4 pt-4 pb-3 md:px-5">
          <div className="grid min-w-0 flex-1 gap-0.5">
            <h2 className="text-[14px] font-semibold tracking-[-0.006em]">{t("console.staff.people", { count: list.staff.length })}</h2>
            <p className="text-[12.5px] text-muted-foreground">{t("console.staff.invariant", { count: list.superAdmins })}</p>
          </div>
          <button type="button" onClick={() => setInviting(true)} className={cn(button.base, button.primary)}>
            <UserPlusIcon aria-hidden="true" className="size-3.5" />
            {t("console.staff.invite")}
          </button>
        </div>
        <div className="overflow-x-auto border-t border-[var(--c-hairline)]">
          <table className="w-full min-w-[820px]">
            <thead>
              <tr className="border-b border-[var(--c-hairline)]">
                <th className={th}>{t("console.staff.name")}</th>
                <th className={th}>{t("console.staff.role")}</th>
                <th className={th}>{t("console.staff.twofa")}</th>
                <th className={th}>{t("console.staff.last_sign_in")}</th>
                <th className={th}>{t("console.staff.added")}</th>
                <th className={th}>{t("console.staff.state")}</th>
                <th className={th}>
                  <span className="sr-only">{t("console.codes.actions")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {list.staff.map((r) => (
                <tr key={r.userId} className="border-b border-[var(--c-hairline)] last:border-0">
                  <td className={td}>
                    <span className="grid min-w-0 gap-0.5">
                      <span className="truncate font-medium">
                        {r.name}
                        {r.userId === me && <span className="ms-1.5 text-[11.5px] font-normal text-muted-foreground">{t("console.staff.you")}</span>}
                      </span>
                      <bdi dir="ltr" className="truncate text-[11.5px] text-muted-foreground">
                        {r.email}
                      </bdi>
                    </span>
                  </td>
                  <td className={td}>{t(`console.role.${r.role}`)}</td>
                  <td className={td}>{r.twoFactor ? <StatusText tone="ok">{t("console.staff.twofa_on")}</StatusText> : <StatusText tone="warn">{t("console.staff.twofa_off")}</StatusText>}</td>
                  <td className={cn(td, "text-muted-foreground")}>{r.lastSignInAt ? <Ago iso={r.lastSignInAt} /> : t("console.staff.never")}</td>
                  <td className={cn(td, "text-muted-foreground")}>
                    {r.addedBy?.name ?? t("console.staff.setup")} · <Ago iso={r.addedAt} />
                  </td>
                  <td className={td}>
                    <StatusText tone={r.disabled ? "danger" : STATE_TONE[r.state]!}>{r.disabled ? t("console.staff.disabled") : t(`console.staff.state.${r.state}`)}</StatusText>
                  </td>
                  <td className={cn(td, "w-px text-end")}>
                    {r.userId !== me && (
                      <DropdownPrimitive.Root>
                        <DropdownPrimitive.Trigger aria-label={t("console.staff.actions_for", { name: r.name })} className={cn(button.base, button.ghost, "h-8 px-2")}>
                          <MoreHorizontalIcon aria-hidden="true" className="size-4" />
                        </DropdownPrimitive.Trigger>
                        <DropdownPrimitive.Portal>
                          <DropdownPrimitive.Content align="end" sideOffset={4} className="z-50 min-w-44 rounded-[var(--r-control)] bg-popover p-1 text-[13px] shadow-[0_12px_32px_-12px_oklch(0.2_0.01_230/0.3)] ring-1 ring-[var(--c-hairline)]">
                            <DropdownPrimitive.Item onSelect={() => setAct({ kind: "role", row: r })} className="flex h-9 cursor-pointer items-center rounded-[6px] px-2.5 outline-none data-[highlighted]:bg-accent max-md:h-11">
                              {t("console.staff.change_role")}
                            </DropdownPrimitive.Item>
                            <DropdownPrimitive.Item onSelect={() => setAct({ kind: "remove", row: r })} className="flex h-9 cursor-pointer items-center rounded-[6px] px-2.5 text-[var(--c-danger-ink)] outline-none data-[highlighted]:bg-[var(--c-danger-soft)] max-md:h-11">
                              {t("console.staff.remove")}
                            </DropdownPrimitive.Item>
                          </DropdownPrimitive.Content>
                        </DropdownPrimitive.Portal>
                      </DropdownPrimitive.Root>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section aria-label={t("console.staff.invites")} className={card}>
        <div className="grid gap-0.5 px-4 pt-4 pb-3 md:px-5">
          <h2 className="text-[14px] font-semibold tracking-[-0.006em]">{t("console.staff.invites_title", { count: list.pendingInvites })}</h2>
          <p className="text-[12.5px] text-muted-foreground">{t("console.staff.invites_lead")}</p>
        </div>
        {g.problem && <p className="px-5 pb-2 text-[12px] text-[var(--c-danger-ink)]">{g.problem}</p>}
        {list.invites.length === 0 ? (
          <EmptyLine>{t("console.staff.invites_empty")}</EmptyLine>
        ) : (
          <div className="overflow-x-auto border-t border-[var(--c-hairline)]">
            <table className="w-full min-w-[680px]">
              <thead>
                <tr className="border-b border-[var(--c-hairline)]">
                  <th className={th}>{t("console.staff.email")}</th>
                  <th className={th}>{t("console.staff.role")}</th>
                  <th className={th}>{t("console.staff.invited_by")}</th>
                  <th className={th}>{t("console.staff.expires")}</th>
                  <th className={th}>{t("console.staff.state")}</th>
                  <th className={th}>
                    <span className="sr-only">{t("console.codes.actions")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.invites.map((i) => (
                  <tr key={i.id} className="border-b border-[var(--c-hairline)] last:border-0">
                    <td className={td}>
                      <bdi dir="ltr" className="font-mono text-[12px]">
                        {i.email}
                      </bdi>
                    </td>
                    <td className={td}>{t(`console.role.${i.role}`)}</td>
                    <td className={cn(td, "text-muted-foreground")}>{i.invitedBy?.name ?? "—"}</td>
                    <td className={cn(td, "text-muted-foreground")}>{i.state === "valid" ? <Until iso={i.expiresAt} /> : i.expiresAt.slice(0, 10)}</td>
                    <td className={td}>
                      <StatusText tone={STATE_TONE[i.state] ?? "neutral"}>{t(`console.staff.invite_state.${i.state}`)}</StatusText>
                    </td>
                    <td className={cn(td, "w-px text-end")}>
                      {i.state === "valid" && (
                        <button type="button" disabled={g.busy} onClick={() => void g.run((opId) => revokeStaffInviteAction({ inviteId: i.id, opId }), () => (g.reset(), toast.success(t("console.staff.invite_revoked")), router.refresh()))} className={cn(button.base, button.ghost, "h-8")}>
                          {t("console.codes.revoke")}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {g.sheet}
      </section>
      {inviting && <InviteDialog onClose={() => setInviting(false)} />}
      {act && <ActDialog kind={act.kind} row={act.row} onClose={() => setAct(null)} />}
    </div>
  );
}

function InviteDialog({ onClose }: { onClose(): void }) {
  const t = useT();
  const router = useRouter();
  const g = useGuarded();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<(typeof INVITABLE)[number]>("support");
  const [note, setNote] = useState("");
  const [made, setMade] = useState<{ url: string; expiresAt: string } | null>(null);
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
  if (made) {
    return (
      <ConsoleDialog
        open
        onOpenChange={(o) => !o && (onClose(), router.refresh())}
        title={t("console.staff.invite_ready")}
        description={t("console.staff.invite_once")}
        footer={
          <button type="button" onClick={() => (onClose(), router.refresh())} className={cn(button.base, button.primary)}>
            {t("console.form.done")}
          </button>
        }
      >
        <ShownOnce value={made.url} shareText={t("console.staff.share_text", { role: t(`console.role.${role}`), url: made.url })} copyLabel={t("console.staff.copy_link")} />
        <Until iso={made.expiresAt} template="console.staff.link_expires" className="text-[12px] text-muted-foreground" />
      </ConsoleDialog>
    );
  }
  return (
    <ConsoleDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t("console.staff.invite")}
      description={t("console.staff.invite_lead")}
      footer={
        <>
          {g.problem && <p className="me-auto text-[12px] text-[var(--c-danger-ink)]">{g.problem}</p>}
          <button type="button" onClick={onClose} className={cn(button.base, button.secondary)}>
            {t("console.form.cancel")}
          </button>
          <button type="button" disabled={!ok || g.busy} onClick={() => void g.run((opId) => inviteStaffAction({ email: email.trim(), role, note: note.trim() || null, opId }), (d) => setMade({ url: d.url, expiresAt: d.expiresAt }))} className={cn(button.base, button.primary)}>
            {t("console.staff.create_link")}
          </button>
          {g.sheet}
        </>
      }
    >
      <Field label={t("console.staff.email")} hint={t("console.staff.email_hint")}>
        {(id, d) => <input id={id} aria-describedby={d} type="email" dir="ltr" autoFocus autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />}
      </Field>
      <fieldset className="grid gap-2">
        <legend className="mb-1.5 text-[12.5px] font-medium">{t("console.staff.role")}</legend>
        {INVITABLE.map((r) => (
          <label key={r} className="flex min-h-11 cursor-pointer items-start gap-2.5 rounded-[var(--r-control)] px-3 py-2 shadow-[inset_0_0_0_1px_var(--border)] has-[:checked]:shadow-[inset_0_0_0_1.5px_var(--brand)]">
            <input type="radio" name="role" checked={role === r} onChange={() => setRole(r)} className="mt-0.5 size-4 accent-[var(--brand)]" />
            <span className="grid gap-0.5">
              <span className="text-[13px] font-medium">{t(`console.role.${r}`)}</span>
              <span className="text-[12px] text-muted-foreground">{t(`console.staff.role_line.${r}`)}</span>
            </span>
          </label>
        ))}
        <p className="text-[12px] text-muted-foreground">{t("console.staff.super_admin_note")}</p>
      </fieldset>
      <NoteField label={t("console.staff.note")} value={note} onChange={setNote} max={200} rows={2} />
    </ConsoleDialog>
  );
}

function ActDialog({ kind, row, onClose }: { kind: "role" | "remove"; row: StaffRow; onClose(): void }) {
  const t = useT();
  const router = useRouter();
  const g = useGuarded();
  const [role, setRole] = useState<(typeof ROLES)[number]>(row.role);
  const [reason, setReason] = useState("");
  const ok = reason.trim().length >= 3 && (kind === "remove" || role !== row.role);
  const go = () =>
    kind === "remove"
      ? g.run((opId) => removeStaffAction({ userId: row.userId, reason: reason.trim(), opId }), () => (toast.success(t("console.staff.removed", { name: row.name })), onClose(), router.refresh()))
      : g.run(
          (opId) => setStaffRoleAction({ userId: row.userId, role, reason: reason.trim(), opId }),
          (d) => {
            toast.success("requested" in d ? t(d.requested.mode === "four_eyes" ? "console.staff.promotion_four_eyes" : "console.staff.promotion_delayed") : t("console.staff.role_changed", { name: row.name }));
            onClose();
            router.refresh();
          },
        );
  return (
    <ConsoleDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t(kind === "remove" ? "console.staff.remove_title" : "console.staff.role_title", { name: row.name })}
      description={t(kind === "remove" ? "console.staff.remove_lead" : "console.staff.role_lead")}
      footer={
        <>
          {g.problem && <p className="me-auto text-[12px] text-[var(--c-danger-ink)]">{g.problem}</p>}
          <button type="button" onClick={onClose} className={cn(button.base, button.secondary)}>
            {t("console.form.cancel")}
          </button>
          <button type="button" disabled={!ok || g.busy} onClick={() => void go()} className={cn(button.base, kind === "remove" ? button.dangerSolid : button.primary)}>
            {t(kind === "remove" ? "console.staff.remove" : role === "super_admin" ? "console.staff.request_promotion" : "console.staff.change_role")}
          </button>
          {g.sheet}
        </>
      }
    >
      {kind === "role" && (
        <Field label={t("console.staff.role")}>
          {(id) => (
            <select id={id} value={role} onChange={(e) => setRole(e.target.value as (typeof ROLES)[number])} className={inputCls}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {t(`console.role.${r}`)}
                </option>
              ))}
            </select>
          )}
        </Field>
      )}
      {kind === "role" && role === "super_admin" && <Banner tone="info">{t("console.staff.promotion_note")}</Banner>}
      <NoteField label={t("console.staff.reason")} required value={reason} onChange={setReason} max={300} rows={2} autoFocus={kind === "remove"} />
      <p className="text-[12px] text-muted-foreground">{t("console.staff.sessions_end")}</p>
    </ConsoleDialog>
  );
}
