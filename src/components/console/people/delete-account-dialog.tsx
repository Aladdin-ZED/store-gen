"use client";
/**
 * Delete account (platform.md PLA-§11.2, PD81, core §F.9 SEC-20): the person's e-mail typed in full, a reason, then the
 * step-up. Refused while the person owns a store that is not purged (the dialog lists those stores with links to their
 * profiles and the "close and schedule deletion first" line) and for a staff account ("remove the platform role
 * first"). The page passes the blocking stores it read; a refusal that arrives with the answer (a race) shows the same.
 *
 *   <DeleteAccountDialog user={{ id, name, email }} blocking={[]} onClose={…} />
 */
import { ArrowUpRightIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useId, useState } from "react";
import { toast } from "sonner";
import { deleteUserAction } from "@/app/admin/(console)/users/actions";
import { useT } from "@/lib/i18n/admin/client";
import { cn } from "@/lib/utils";
import { useGuarded } from "../guarded";
import { PrefetchLink } from "../prefetch-link";
import { button, ConsoleDialog, NoteField } from "../queue/decision-dialogs";
import type { BlockingStore } from "./user-actions";
import { consoleUrl } from "@/lib/platform/console-url";

export function DeleteAccountDialog({ user, blocking: initial, onClose }: { user: { id: string; name: string; email: string }; blocking: BlockingStore[]; onClose(): void }) {
  const t = useT();
  const router = useRouter();
  const g = useGuarded("console.users.failed");
  const typedId = useId();
  const [blocking, setBlocking] = useState(initial);
  const [staff, setStaff] = useState(false);
  const [typed, setTyped] = useState("");
  const [reason, setReason] = useState("");
  const [tried, setTried] = useState(false);
  const refused = blocking.length > 0 || staff;
  const matches = typed.trim().toLowerCase() === user.email.trim().toLowerCase();

  const submit = async () => {
    setTried(true);
    if (refused || !matches || reason.trim().length < 2 || reason.length > 200) return;
    await g.run(
      (opId) => deleteUserAction({ userId: user.id, reason: reason.trim(), typedEmail: typed.trim(), opId }),
      (d) => {
        if (d.deleted) {
          toast.success(t("console.users.delete.done"));
          onClose();
          router.push(consoleUrl("/users"));
          router.refresh();
        } else if (d.refusal === "owns_store") setBlocking(d.stores);
        else setStaff(true);
      },
    );
  };

  return (
    <>
      <ConsoleDialog
        open
        onOpenChange={(o) => !o && onClose()}
        title={t("console.users.delete.title", { name: user.name || user.email })}
        description={t("console.users.delete.lead")}
        footer={
          <>
            <DialogPrimitive.Close className={cn(button.base, button.ghost)}>{t("console.dialog.cancel")}</DialogPrimitive.Close>
            <button type="button" disabled={refused || !matches || g.busy} onClick={() => void submit()} className={cn(button.base, button.dangerSolid)}>
              {t("console.users.delete.confirm")}
            </button>
          </>
        }
      >
        {blocking.length > 0 && (
          <div className="grid gap-2 rounded-[var(--r-control)] bg-[var(--c-warn-soft)] px-3.5 py-3">
            <p className="text-[13px] font-medium">{t("console.users.delete.owns_store", { count: blocking.length })}</p>
            <ul className="grid gap-1">
              {blocking.map((s) => (
                <li key={s.id} className="flex min-w-0 items-center gap-2 text-[12.5px]">
                  <PrefetchLink href={consoleUrl(`/stores/${s.id}`)} className="inline-flex min-w-0 items-center gap-1 rounded-[4px] font-medium text-[var(--c-brand-ink)] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--ring)] max-md:min-h-11">
                    <span className="truncate">{s.name}</span>
                    <ArrowUpRightIcon aria-hidden="true" className="size-3 shrink-0 rtl:-scale-x-100" />
                  </PrefetchLink>
                  {s.handle && (
                    <bdi dir="ltr" className="truncate font-mono text-[11.5px] text-muted-foreground">
                      @{s.handle}
                    </bdi>
                  )}
                  <span className="ms-auto shrink-0 text-[11.5px] text-muted-foreground">{t(`console.status.${s.status}`)}</span>
                </li>
              ))}
            </ul>
            <p className="text-[12px] text-muted-foreground">{t("console.users.delete.close_first")}</p>
          </div>
        )}
        {staff && <p className="rounded-[var(--r-control)] bg-[var(--c-warn-soft)] px-3.5 py-3 text-[13px]">{t("console.users.delete.is_staff")}</p>}
        <ul className="grid list-disc gap-1 ps-5 text-[12.5px] text-muted-foreground">
          <li>{t("console.users.delete.effect.anonymised")}</li>
          <li>{t("console.users.delete.effect.signed_out")}</li>
          <li>{t("console.users.delete.effect.kept")}</li>
        </ul>
        <div className="grid gap-1.5">
          <label htmlFor={typedId} className="text-[12.5px] font-medium">
            {t("console.users.delete.type")}{" "}
            <bdi dir="ltr" className="font-mono">
              {user.email}
            </bdi>
          </label>
          <input
            id={typedId}
            dir="ltr"
            type="email"
            autoComplete="off"
            spellCheck={false}
            disabled={refused}
            value={typed}
            aria-invalid={(tried && !matches) || undefined}
            onChange={(e) => setTyped(e.target.value)}
            className="h-[var(--ctl)] w-full rounded-[var(--r-control)] bg-background px-3 font-mono text-[13px] shadow-[inset_0_0_0_1px_var(--input)] outline-none focus-visible:shadow-[inset_0_0_0_1px_var(--ring),0_0_0_3px_color-mix(in_oklch,var(--ring)_22%,transparent)] disabled:opacity-50 aria-[invalid=true]:shadow-[inset_0_0_0_1px_var(--c-danger-ink)] max-md:h-11"
          />
          {tried && !matches && <p className="text-[12px] text-[var(--c-danger-ink)]">{t("console.users.delete.typed_mismatch")}</p>}
        </div>
        <NoteField label={t("console.users.reason")} value={reason} onChange={setReason} max={200} required rows={2} problem={tried && reason.trim().length < 2 ? t("console.users.reason_required") : null} />
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
