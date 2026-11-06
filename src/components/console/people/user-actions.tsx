"use client";
/**
 * The account actions of the user profile (platform.md PLA-§11.2, PD34, PD81, SEC-20): Ban (with "Also suspend stores
 * where this person is the only owner"), Unban, Reset 2FA, Create reset link (shown once, with Copy and "Send on
 * WhatsApp" when the phone is known), Sign out everywhere and Delete account. Every action is `users.manage` ↑ with a
 * reason (unban: a note) through StepUpSheet, resent with the same opId; the page renders this only when the read model
 * says the staff member may act (`canManage`: not oneself, not a staff account, not deleted).
 *
 *   <UserActions user={{ id, name, email, banned: false }} blocking={[…]} />
 */
import { BanIcon, KeyRoundIcon, LinkIcon, LogOutIcon, ShieldOffIcon, Trash2Icon, UndoIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useId, useState } from "react";
import { toast } from "sonner";
import { banUserAction, createResetLinkAction, resetUser2faAction, signOutUserAction, unbanUserAction } from "@/app/admin/(console)/users/actions";
import { CopyButton } from "@/components/admin/common/copy-button";
import { useT } from "@/lib/i18n/admin/client";
import type { StoreStatus } from "@/lib/tenancy/types";
import { cn } from "@/lib/utils";
import { Until } from "../ago";
import { useGuarded } from "../guarded";
import { button, ConsoleDialog, NoteField } from "../queue/decision-dialogs";
import { DeleteAccountDialog } from "./delete-account-dialog";

type Kind = "ban" | "unban" | "reset_2fa" | "reset_link" | "sign_out";
export type BlockingStore = { id: string; handle: string | null; name: string; status: StoreStatus };

export const REASON_MAX = 200;

export function UserActions({ user, blocking, canLifecycle }: { user: { id: string; name: string; email: string; banned: boolean }; blocking: BlockingStore[]; canLifecycle: boolean }) {
  const t = useT();
  const [open, setOpen] = useState<{ kind: Kind; n: number } | null>(null);
  const [deleting, setDeleting] = useState(0);
  const item = (kind: Kind) => () => setOpen((o) => ({ kind, n: (o?.n ?? 0) + 1 }));

  return (
    <>
      <div role="group" aria-label={t("console.users.actions")} className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={item("sign_out")} className={cn(button.base, button.secondary)}>
          <LogOutIcon aria-hidden="true" className="size-3.5 rtl:-scale-x-100" />
          {t("console.users.sign_out.button")}
        </button>
        <button type="button" onClick={item("reset_2fa")} className={cn(button.base, button.secondary)}>
          <ShieldOffIcon aria-hidden="true" className="size-3.5" />
          {t("console.users.reset_2fa.button")}
        </button>
        <button type="button" onClick={item("reset_link")} className={cn(button.base, button.secondary)}>
          <KeyRoundIcon aria-hidden="true" className="size-3.5" />
          {t("console.users.reset_link.button")}
        </button>
        {user.banned ? (
          <button type="button" onClick={item("unban")} className={cn(button.base, button.secondary)}>
            <UndoIcon aria-hidden="true" className="size-3.5" />
            {t("console.users.unban.button")}
          </button>
        ) : (
          <button type="button" onClick={item("ban")} className={cn(button.base, button.danger)}>
            <BanIcon aria-hidden="true" className="size-3.5" />
            {t("console.users.ban.button")}
          </button>
        )}
        <button type="button" onClick={() => setDeleting((n) => n + 1)} className={cn(button.base, button.danger)}>
          <Trash2Icon aria-hidden="true" className="size-3.5" />
          {t("console.users.delete.button")}
        </button>
      </div>
      {open && <ActionDialog key={open.n} kind={open.kind} user={user} canLifecycle={canLifecycle} onClose={() => setOpen(null)} />}
      {deleting > 0 && <DeleteAccountDialog key={deleting} user={user} blocking={blocking} onClose={() => setDeleting(0)} />}
    </>
  );
}

function ActionDialog({ kind, user, canLifecycle, onClose }: { kind: Kind; user: { id: string; name: string; email: string }; canLifecycle: boolean; onClose(): void }) {
  const t = useT();
  const router = useRouter();
  const g = useGuarded("console.users.failed");
  const check = useId();
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [suspend, setSuspend] = useState(false);
  const [tried, setTried] = useState(false);
  const [link, setLink] = useState<{ url: string; expiresAt: string; waTo: string | null } | null>(null);
  const needsReason = kind !== "unban";
  const reasonProblem = tried && needsReason && reason.trim().length < 2 ? t("console.users.reason_required") : null;
  const name = user.name || user.email;

  const finish = (text: string) => {
    toast.success(text);
    onClose();
    router.refresh();
  };

  const submit = async () => {
    setTried(true);
    if ((needsReason && (reason.trim().length < 2 || reason.length > REASON_MAX)) || note.length > 500) return;
    const base = { userId: user.id };
    switch (kind) {
      case "ban":
        await g.run((opId) => banUserAction({ ...base, reason: reason.trim(), note: note.trim() || undefined, suspendStores: suspend, opId }), (d) =>
          finish(d.suspended.length ? t("console.users.ban.done_suspended", { name, count: d.suspended.length }) : t("console.users.ban.done", { name })),
        );
        return;
      case "unban":
        await g.run((opId) => unbanUserAction({ ...base, note: note.trim() || undefined, opId }), () => finish(t("console.users.unban.done", { name })));
        return;
      case "reset_2fa":
        await g.run((opId) => resetUser2faAction({ ...base, reason: reason.trim(), opId }), () => finish(t("console.users.reset_2fa.done", { name })));
        return;
      case "sign_out":
        await g.run((opId) => signOutUserAction({ ...base, reason: reason.trim(), opId }), (d) => finish(t("console.users.sign_out.done", { name, count: d.sessions })));
        return;
      case "reset_link":
        await g.run((opId) => createResetLinkAction({ ...base, reason: reason.trim(), opId }), (d) => setLink(d));
        return;
    }
  };

  if (link) {
    const wa = link.waTo ? `https://wa.me/${link.waTo.replace(/\D/g, "")}?text=${encodeURIComponent(t("console.reset.wa_text", { url: link.url }))}` : null;
    return (
      <ConsoleDialog
        open
        onOpenChange={(o) => !o && onClose()}
        title={t("console.users.reset_link.ready")}
        description={t("console.users.reset_link.once")}
        footer={
          <DialogPrimitive.Close className={cn(button.base, button.primary)} onClick={() => router.refresh()}>
            {t("console.users.reset_link.done")}
          </DialogPrimitive.Close>
        }
      >
        <div className="grid gap-2">
          <div className="flex min-w-0 items-center gap-2 rounded-[var(--r-control)] bg-background px-3 py-2 shadow-[inset_0_0_0_1px_var(--input)]">
            <LinkIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
            <bdi dir="ltr" className="min-w-0 flex-1 truncate font-mono text-[12px] select-all">
              {link.url}
            </bdi>
            <CopyButton value={link.url} label={t("console.users.reset_link.copy")} toastMessage={t("console.users.reset_link.copied")} />
          </div>
          <Until iso={link.expiresAt} template="console.users.reset_link.expires" className="text-[12px] text-muted-foreground" />
          {wa ? (
            <a href={wa} target="_blank" rel="noopener noreferrer" className={cn(button.base, button.secondary, "justify-self-start")}>
              {t("console.users.reset_link.whatsapp")}
            </a>
          ) : (
            <p className="text-[12px] text-muted-foreground">{t("console.users.reset_link.no_phone")}</p>
          )}
        </div>
      </ConsoleDialog>
    );
  }

  return (
    <>
      <ConsoleDialog
        open
        onOpenChange={(o) => !o && onClose()}
        title={t(`console.users.${kind}.title`, { name })}
        description={t(`console.users.${kind}.lead`)}
        footer={
          <>
            <DialogPrimitive.Close className={cn(button.base, button.ghost)}>{t("console.dialog.cancel")}</DialogPrimitive.Close>
            <button type="button" disabled={g.busy} onClick={() => void submit()} className={cn(button.base, kind === "ban" ? button.dangerSolid : button.primary)}>
              {t(`console.users.${kind}.confirm`)}
            </button>
          </>
        }
      >
        {needsReason && <NoteField label={t("console.users.reason")} hint={t("console.users.reason_hint")} value={reason} onChange={setReason} max={REASON_MAX} required problem={reasonProblem} rows={2} autoFocus />}
        {(kind === "ban" || kind === "unban") && <NoteField label={t("console.users.note")} value={note} onChange={setNote} max={500} rows={2} autoFocus={kind === "unban"} />}
        {kind === "ban" && (
          <div className="grid gap-1">
            <label htmlFor={check} className={cn("flex items-start gap-2.5 text-[13px]", !canLifecycle && "opacity-60")}>
              <input id={check} type="checkbox" checked={suspend} disabled={!canLifecycle} onChange={(e) => setSuspend(e.target.checked)} className="mt-0.5 size-4 accent-[var(--brand)]" />
              <span>{t("console.users.ban.suspend")}</span>
            </label>
            {!canLifecycle && <p className="ps-6.5 text-[12px] text-muted-foreground">{t("console.users.ban.suspend_needs")}</p>}
          </div>
        )}
        {kind === "ban" && <p className="text-[12px] text-muted-foreground">{t("console.users.ban.effect")}</p>}
        {g.problem && (
          <p role="alert" className="text-[12.5px] text-[var(--c-danger-ink)]">
            {g.problem}
          </p>
        )}
      </ConsoleDialog>
      {g.sheet}
    </>
  );
}
