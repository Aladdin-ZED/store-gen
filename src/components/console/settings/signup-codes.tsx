"use client";
/**
 * Sign-up → Invite codes and Waitlist (platform.md PLA-§3.3, §13.2; core §B.6; `signups.decide`): the codes table with
 * its state chips and the New code dialog (the code shown once with Copy and WhatsApp share, only its hash is kept),
 * Revoke; the waitlist with its source chip ("Daily cap" rows first to invite), multi-select Invite selected (≤ 100,
 * one single-use code per row, a result list with Copy / WhatsApp each; staff send it, the console sends nothing) and
 * Drop.
 */
import { PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { createInviteCodeAction, dropWaitlistAction, inviteWaitlistAction, revokeInviteCodeAction } from "@/app/admin/(console)/settings/actions";
import { CopyButton } from "@/components/admin/common/copy-button";
import { useT } from "@/lib/i18n/admin/client";
import type { InviteCodeRow, WaitlistInvite, WaitlistRow } from "@/lib/platform/signup-admin";
import { cn } from "@/lib/utils";
import { Ago } from "../ago";
import { useGuarded } from "../guarded";
import { PrefetchLink } from "../prefetch-link";
import { ConsoleDialog } from "../queue/decision-dialogs";
import { Banner, button, card, EmptyLine, Field, inputCls, ShownOnce, SwitchRow, td, th, type Tone, StatusText } from "../kit";
import { consoleUrl } from "@/lib/platform/console-url";

const STATE_TONE: Record<InviteCodeRow["state"], Tone> = { active: "ok", used_up: "neutral", expired: "neutral", revoked: "danger" };

export function InviteCodes({ rows, next, canDecide }: { rows: InviteCodeRow[]; next: string | null; canDecide: boolean }) {
  const t = useT();
  const router = useRouter();
  const g = useGuarded();
  const [creating, setCreating] = useState(false);
  return (
    <section aria-label={t("console.invite.title")} className={card}>
      <div className="flex flex-wrap items-center gap-3 px-4 pt-4 pb-3 md:px-5">
        <div className="grid min-w-0 flex-1 gap-0.5">
          <h2 className="text-[14px] font-semibold tracking-[-0.006em]">{t("console.invite.title")}</h2>
          <p className="text-[12.5px] text-muted-foreground">{t("console.codes.lead")}</p>
        </div>
        {canDecide && (
          <button type="button" onClick={() => setCreating(true)} className={cn(button.base, button.primary)}>
            <PlusIcon aria-hidden="true" className="size-3.5" />
            {t("console.codes.new")}
          </button>
        )}
      </div>
      {g.problem && <p className="px-5 pb-2 text-[12px] text-[var(--c-danger-ink)]">{g.problem}</p>}
      {rows.length === 0 ? (
        <EmptyLine>{t("console.codes.empty")}</EmptyLine>
      ) : (
        <div className="overflow-x-auto border-t border-[var(--c-hairline)]">
          <table className="w-full min-w-[720px]">
            <thead>
              <tr className="border-b border-[var(--c-hairline)]">
                <th className={th}>{t("console.invite.label")}</th>
                <th className={cn(th, "text-end")}>{t("console.codes.uses")}</th>
                <th className={th}>{t("console.invite.expires_on")}</th>
                <th className={th}>{t("console.codes.auto")}</th>
                <th className={th}>{t("console.codes.created_by")}</th>
                <th className={th}>{t("console.codes.state")}</th>
                <th className={th}>
                  <span className="sr-only">{t("console.codes.actions")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-[var(--c-hairline)] last:border-0">
                  <td className={cn(td, "max-w-[240px] truncate font-medium")}>{r.label ?? "—"}</td>
                  <td className={cn(td, "num text-end")}>
                    {r.uses} / {r.usesMax}
                  </td>
                  <td className={cn(td, "text-muted-foreground")}>{r.expiresAt ? <Ago iso={r.expiresAt} /> : t("console.invite.expiry_never")}</td>
                  <td className={td}>{r.autoApprove ? <StatusText tone="warn">{t("console.codes.auto_on")}</StatusText> : <span className="text-muted-foreground">{t("console.codes.auto_off")}</span>}</td>
                  <td className={cn(td, "text-muted-foreground")}>
                    {r.createdBy.name ?? "—"} · <Ago iso={r.createdAt} />
                  </td>
                  <td className={td}>
                    <StatusText tone={STATE_TONE[r.state]}>{t(`console.codes.state.${r.state}`)}</StatusText>
                  </td>
                  <td className={cn(td, "w-px text-end")}>
                    {canDecide && r.state === "active" && (
                      <button type="button" disabled={g.busy} onClick={() => void g.run(() => revokeInviteCodeAction({ id: r.id }), () => (toast.success(t("console.codes.revoked")), router.refresh()))} className={cn(button.base, button.ghost, "h-8")}>
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
      {next && (
        <div className="border-t border-[var(--c-hairline)] px-4 py-2.5 md:px-5">
          <PrefetchLink href={consoleUrl(`/settings/signup?tab=codes&cursor=${encodeURIComponent(next)}`)} className="text-[12.5px] font-medium text-[var(--c-brand-ink)] hover:underline">
            {t("console.pager.older")}
          </PrefetchLink>
        </div>
      )}
      {creating && <NewCodeDialog onClose={() => setCreating(false)} />}
      {g.sheet}
    </section>
  );
}

function NewCodeDialog({ onClose }: { onClose(): void }) {
  const t = useT();
  const router = useRouter();
  const g = useGuarded();
  const [label, setLabel] = useState("");
  const [uses, setUses] = useState("1");
  const [expiry, setExpiry] = useState<"7" | "30" | "90" | "never">("30");
  const [auto, setAuto] = useState(false);
  const [made, setMade] = useState<{ code: string; expiresAt: string | null } | null>(null);
  const n = /^\d+$/.test(uses) ? Number(uses) : NaN;
  const ok = label.trim().length >= 2 && n >= 1 && n <= 500;
  if (made) {
    return (
      <ConsoleDialog
        open
        onOpenChange={(o) => !o && (onClose(), router.refresh())}
        title={t("console.codes.ready")}
        description={t("console.invite.created")}
        footer={
          <button type="button" onClick={() => (onClose(), router.refresh())} className={cn(button.base, button.primary)}>
            {t("console.form.done")}
          </button>
        }
      >
        <ShownOnce value={made.code} shareText={t("console.invite.share_text", { code: made.code })} copyLabel={t("console.invite.copy")} />
        <p className="text-[12px] text-muted-foreground">{made.expiresAt ? t("console.codes.expires_at", { date: made.expiresAt.slice(0, 10) }) : t("console.invite.never_expires")}</p>
      </ConsoleDialog>
    );
  }
  return (
    <ConsoleDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t("console.codes.new")}
      description={t("console.codes.new_lead")}
      footer={
        <>
          {g.problem && <p className="me-auto text-[12px] text-[var(--c-danger-ink)]">{g.problem}</p>}
          <button type="button" onClick={onClose} className={cn(button.base, button.secondary)}>
            {t("console.form.cancel")}
          </button>
          <button
            type="button"
            disabled={!ok || g.busy}
            onClick={() => void g.run((opId) => createInviteCodeAction({ label: label.trim(), usesMax: n, expiresInDays: expiry === "never" ? null : (Number(expiry) as 7 | 30 | 90), autoApprove: auto, opId }), (d) => setMade({ code: d.code, expiresAt: d.expiresAt }))}
            className={cn(button.base, button.primary)}
          >
            {t("console.invite.create")}
          </button>
          {g.sheet}
        </>
      }
    >
      <Field label={t("console.invite.label")} hint={t("console.codes.label_hint")}>
        {(id, d) => <input id={id} aria-describedby={d} autoFocus value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} className={inputCls} />}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("console.invite.uses")} hint={t("console.invite.uses_hint")}>
          {(id, d) => <input id={id} aria-describedby={d} inputMode="numeric" value={uses} onChange={(e) => setUses(e.target.value)} className={cn(inputCls, "num")} />}
        </Field>
        <Field label={t("console.invite.expiry")}>
          {(id) => (
            <select id={id} value={expiry} onChange={(e) => setExpiry(e.target.value as typeof expiry)} className={inputCls}>
              {(["7", "30", "90"] as const).map((d) => (
                <option key={d} value={d}>
                  {t("console.invite.expiry_days", { count: Number(d) })}
                </option>
              ))}
              <option value="never">{t("console.invite.expiry_never")}</option>
            </select>
          )}
        </Field>
      </div>
      <SwitchRow label={t("console.codes.auto")} hint={t("console.codes.auto_hint")} checked={auto} onChange={setAuto} />
      {auto && <Banner tone="warn">{t("console.codes.auto_note")}</Banner>}
    </ConsoleDialog>
  );
}

export function Waitlist({ rows, next, canDecide, status }: { rows: WaitlistRow[]; next: string | null; canDecide: boolean; status: string }) {
  const t = useT();
  const router = useRouter();
  const g = useGuarded();
  const [picked, setPicked] = useState<string[]>([]);
  const [result, setResult] = useState<{ invited: WaitlistInvite[]; skipped: string[] } | null>(null);
  const selectable = rows.filter((r) => r.status === "waiting").map((r) => r.id);
  const all = selectable.length > 0 && selectable.every((id) => picked.includes(id));
  const toggle = (id: string) => setPicked(picked.includes(id) ? picked.filter((x) => x !== id) : picked.length >= 100 ? picked : [...picked, id]);
  return (
    <section aria-label={t("console.waitlist.title")} className={card}>
      <div className="flex flex-wrap items-center gap-3 px-4 pt-4 pb-3 md:px-5">
        <div className="grid min-w-0 flex-1 gap-0.5">
          <h2 className="text-[14px] font-semibold tracking-[-0.006em]">{t("console.waitlist.title")}</h2>
          <p className="text-[12.5px] text-muted-foreground">{t("console.waitlist.lead")}</p>
        </div>
        <nav aria-label={t("console.waitlist.filter")} className="flex flex-wrap gap-1">
          {["waiting", "cap", "invited", "dropped", "all"].map((s) => (
            <PrefetchLink
              key={s}
              href={consoleUrl(`/settings/signup?tab=waitlist&status=${s}`)}
              aria-current={status === s ? "page" : undefined}
              className={cn("inline-flex h-8 items-center rounded-[var(--r-chip)] px-2.5 text-[12px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] max-md:h-11", status === s ? "bg-[color-mix(in_oklch,var(--brand)_10%,var(--card))] font-medium shadow-[inset_0_0_0_1px_var(--brand)]" : "text-muted-foreground shadow-[inset_0_0_0_1px_var(--border)] hover:bg-accent")}
            >
              {t(`console.waitlist.status.${s}`)}
            </PrefetchLink>
          ))}
        </nav>
      </div>
      {canDecide && picked.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--c-hairline)] bg-[color-mix(in_oklch,var(--brand)_6%,var(--card))] px-4 py-2 md:px-5">
          <span className="me-auto text-[12.5px] font-medium">{t("console.waitlist.selected", { count: picked.length })}</span>
          {g.problem && <span className="text-[12px] text-[var(--c-danger-ink)]">{g.problem}</span>}
          <button type="button" disabled={g.busy} onClick={() => void g.run((opId) => dropWaitlistAction({ ids: picked, opId }), () => (g.reset(), setPicked([]), toast.success(t("console.waitlist.dropped")), router.refresh()))} className={cn(button.base, button.secondary)}>
            {t("console.waitlist.drop")}
          </button>
          <button type="button" disabled={g.busy} onClick={() => void g.run((opId) => inviteWaitlistAction({ ids: picked, opId }), (d) => (g.reset(), setPicked([]), setResult(d)))} className={cn(button.base, button.primary)}>
            {t("console.waitlist.invite", { count: picked.length })}
          </button>
        </div>
      )}
      {rows.length === 0 ? (
        <EmptyLine>{t("console.waitlist.empty")}</EmptyLine>
      ) : (
        <div className="overflow-x-auto border-t border-[var(--c-hairline)]">
          <table className="w-full min-w-[760px]">
            <thead>
              <tr className="border-b border-[var(--c-hairline)]">
                <th className={cn(th, "w-10")}>{canDecide && selectable.length > 0 && <input type="checkbox" aria-label={t("console.waitlist.select_all")} checked={all} onChange={() => setPicked(all ? [] : selectable.slice(0, 100))} className="size-4 accent-[var(--brand)]" />}</th>
                <th className={th}>{t("console.waitlist.email")}</th>
                <th className={th}>{t("console.waitlist.phone_country")}</th>
                <th className={th}>{t("console.waitlist.market")}</th>
                <th className={th}>{t("console.waitlist.interest")}</th>
                <th className={th}>{t("console.waitlist.source")}</th>
                <th className={th}>{t("console.waitlist.since")}</th>
                <th className={th}>{t("console.waitlist.status")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={cn("border-b border-[var(--c-hairline)] last:border-0", picked.includes(r.id) && "bg-[color-mix(in_oklch,var(--brand)_5%,transparent)]")}>
                  <td className={td}>{canDecide && r.status === "waiting" && <input type="checkbox" aria-label={t("console.waitlist.select_row", { email: r.email })} checked={picked.includes(r.id)} onChange={() => toggle(r.id)} className="size-4 accent-[var(--brand)]" />}</td>
                  <td className={td}>
                    <bdi dir="ltr" className="font-mono text-[12px]">
                      {r.email}
                    </bdi>
                  </td>
                  <td className={cn(td, "font-mono text-muted-foreground")}>{r.phoneCountry ?? "—"}</td>
                  <td className={cn(td, "font-mono")}>{r.market ?? "—"}</td>
                  <td className={td}>{r.modeInterest ? t(`console.waitlist.interest.${r.modeInterest}`) : "—"}</td>
                  <td className={td}>
                    {r.source?.kind === "daily_cap" ? (
                      <span title={t("console.waitlist.cap_title", { day: r.source.day })} className="rounded-[var(--r-chip)] bg-[var(--c-warn-soft)] px-1.5 py-0.5 text-[11.5px] font-medium">
                        {t("console.waitlist.daily_cap")}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">{r.source?.label ?? "—"}</span>
                    )}
                  </td>
                  <td className={cn(td, "text-muted-foreground")}>
                    <Ago iso={r.createdAt} />
                  </td>
                  <td className={td}>{t(`console.waitlist.status.${r.status}`)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {next && (
        <div className="border-t border-[var(--c-hairline)] px-4 py-2.5 md:px-5">
          <PrefetchLink href={consoleUrl(`/settings/signup?tab=waitlist&status=${status}&cursor=${encodeURIComponent(next)}`)} className="text-[12.5px] font-medium text-[var(--c-brand-ink)] hover:underline">
            {t("console.pager.older")}
          </PrefetchLink>
        </div>
      )}
      {result && (
        <ConsoleDialog
          open
          onOpenChange={(o) => !o && (setResult(null), router.refresh())}
          title={t("console.waitlist.invited_title", { count: result.invited.length })}
          description={t("console.waitlist.invited_lead")}
          footer={
            <button type="button" onClick={() => (setResult(null), router.refresh())} className={cn(button.base, button.primary)}>
              {t("console.form.done")}
            </button>
          }
        >
          <ul className="grid gap-2">
            {result.invited.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center gap-2 rounded-[var(--r-control)] px-3 py-2 shadow-[inset_0_0_0_1px_var(--c-hairline)]">
                <bdi dir="ltr" className="min-w-0 flex-1 truncate text-[12.5px]">
                  {x.email}
                </bdi>
                <bdi dir="ltr" className="font-mono text-[12px]">
                  {x.code}
                </bdi>
                <CopyButton value={x.code} label={t("console.invite.copy")} toastMessage={t("console.form.copied")} />
                <a href={`https://wa.me/?text=${encodeURIComponent(t("console.invite.share_text", { code: x.code }))}`} target="_blank" rel="noopener noreferrer" className={cn(button.base, button.secondary, "h-8")}>
                  {t("console.form.whatsapp")}
                </a>
              </li>
            ))}
          </ul>
          {result.skipped.length > 0 && <p className="text-[12px] text-muted-foreground">{t("console.waitlist.skipped", { count: result.skipped.length })}</p>}
        </ConsoleDialog>
      )}
      {g.sheet}
    </section>
  );
}
