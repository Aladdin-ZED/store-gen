"use client";
/**
 * "View as store", the start sheet (platform.md PLA-§10.1, PL-10; PD45, PD56, PD69): the store's name and handle; a
 * reason (Onboarding help · Ticket · Abuse review · Bug reproduction · Other); a note (required for Other, ≤ 300); a
 * ticket reference (required for the support role, ≤ 60); 15 / 30 / 60 minutes (default 30); the exact notification
 * the store's owners will read, in the store's default locale and time zone; and the line that customer details stay
 * masked during the view. "Start read-only view" → `startImpersonationAction` → the tenant dashboard.
 *
 * Refusals (PD45): a member of the store is sent to their stores; a store scheduled for deletion or purged cannot be
 * viewed (the button is disabled with the reason). Opened from the header's View as store, the `V` key, the queue's
 * `V` and ⌘K "Start view as…" (`?sheet=view-as`); mounted once per opening, so every opening starts empty.
 *
 *   <StartViewSheet open store={{ id, name, handle, status }} notice={notice} ticketRequired={role === "support"} onOpenChange={…} />
 */
import { ArrowUpRightIcon, EyeOffIcon } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useEffect, useId, useState } from "react";
import { startImpersonationAction } from "@/app/admin/(console)/stores/[id]/actions";
import { useT } from "@/lib/i18n/admin/client";
import { fillNoticeWindow } from "@/lib/platform/profile/notice";
import type { ImpersonationReason, StoreStatus } from "@/lib/tenancy/types";
import { cn } from "@/lib/utils";
import { PrefetchLink } from "../prefetch-link";
import { button, ConsoleDialog, NoteField } from "../queue/decision-dialogs";

export const VIEW_REASONS: readonly ImpersonationReason[] = ["onboarding", "ticket", "abuse_review", "bug", "other"];
export const VIEW_MINUTES = [15, 30, 60] as const;
const NOTE_MAX = 300;
const TICKET_MAX = 60;
const CLOSED_TO_VIEW: ReadonlySet<StoreStatus> = new Set(["scheduled_deletion", "purged"]);

export interface ViewAsNotice {
  locale: "ar" | "fr" | "en";
  timeZone: string;
  byReason: Record<ImpersonationReason, { title: string; body: string | null }>;
}

export function StartViewSheet({
  open,
  onOpenChange,
  store,
  notice,
  ticketRequired,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  store: { id: string; name: string; handle: string | null; status: StoreStatus };
  notice: ViewAsNotice;
  ticketRequired: boolean;
}) {
  const t = useT();
  const name = useId();
  const ticketId = useId();
  const [reason, setReason] = useState<ImpersonationReason | null>(null);
  const [note, setNote] = useState("");
  const [ticket, setTicket] = useState("");
  const [minutes, setMinutes] = useState<15 | 30 | 60>(30);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<{ text: string; member?: boolean } | null>(null);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const closed = CLOSED_TO_VIEW.has(store.status);
  const noteNeeded = reason === "other";
  const problems = {
    reason: !reason,
    note: (noteNeeded && !note.trim()) || note.length > NOTE_MAX,
    ticket: (ticketRequired && !ticket.trim()) || ticket.length > TICKET_MAX,
  };
  const shown = notice.byReason[reason ?? "onboarding"];
  const dir = notice.locale === "ar" ? "rtl" : "ltr";

  const submit = async () => {
    setTried(true);
    setRefusal(null);
    if (closed || problems.reason || problems.note || problems.ticket || !reason) return;
    setBusy(true);
    try {
      const r = await startImpersonationAction({ storeId: store.id, reason, note: note.trim() || undefined, ticketRef: ticket.trim() || undefined, minutes });
      if (r.ok) {
        window.location.assign(r.data.url);
        return;
      }
      if (r.error === "impersonation_member") setRefusal({ text: t("console.impersonation.member"), member: true });
      else if (r.error === "impersonation_state") setRefusal({ text: t("console.impersonation.state") });
      else setRefusal({ text: r.message ? t(r.message) : t(r.error === "rate_limited" ? "console.impersonation.rate_limited" : "console.impersonation.failed") });
    } catch {
      setRefusal({ text: t("console.impersonation.failed") });
    }
    setBusy(false);
  };

  return (
    <ConsoleDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("console.impersonation.start_title", { store: store.name })}
      description={
        <span className="inline-flex flex-wrap items-center gap-x-1.5">
          {store.handle && (
            <bdi dir="ltr" className="font-mono text-[12px]">
              @{store.handle}
            </bdi>
          )}
          <span>{t("console.impersonation.start_lead")}</span>
        </span>
      }
      footer={
        <>
          <DialogPrimitive.Close className={cn(button.base, button.ghost)}>{t("console.dialog.cancel")}</DialogPrimitive.Close>
          <button type="button" disabled={busy || closed} onClick={submit} className={cn(button.base, button.primary)}>
            {busy ? t("console.impersonation.starting") : t("console.impersonation.start")}
          </button>
        </>
      }
    >
      {closed && <p className="rounded-[var(--r-control)] bg-[var(--c-warn-soft)] px-3 py-2.5 text-[13px]">{t("console.impersonation.state")}</p>}
      <fieldset className="grid gap-1.5" disabled={closed}>
        <legend className="mb-1.5 text-[12.5px] font-medium">{t("console.impersonation.reason")}</legend>
        <div className="grid gap-1 sm:grid-cols-2">
          {VIEW_REASONS.map((r) => (
            <label
              key={r}
              className={cn(
                "flex min-h-9 cursor-pointer items-center gap-2.5 rounded-[var(--r-control)] px-2.5 text-[13px] shadow-[inset_0_0_0_1px_var(--border)] transition-[background-color,box-shadow] duration-[var(--dur-1)] hover:bg-accent has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--ring)] max-md:min-h-11",
                reason === r && "bg-[color-mix(in_oklch,var(--brand)_8%,transparent)] shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--brand)_45%,transparent)]",
              )}
            >
              <input type="radio" name={name} value={r} checked={reason === r} onChange={() => setReason(r)} className="size-3.5 accent-[var(--brand)]" />
              {t(`console.impersonation.reason.${r}`)}
            </label>
          ))}
        </div>
        {tried && problems.reason && <p className="text-[12px] text-[var(--c-danger-ink)]">{t("console.impersonation.reason_required")}</p>}
      </fieldset>

      <NoteField
        label={t("console.impersonation.note")}
        hint={t("console.impersonation.note_hint")}
        value={note}
        onChange={setNote}
        max={NOTE_MAX}
        required={noteNeeded}
        problem={tried && noteNeeded && !note.trim() ? t("console.impersonation.note_required") : null}
        rows={2}
      />

      <div className="grid gap-1.5">
        <label htmlFor={ticketId} className="text-[12.5px] font-medium">
          {t("console.impersonation.ticket")}
          {!ticketRequired && <span className="ms-1.5 font-normal text-muted-foreground">{t("console.form.optional")}</span>}
        </label>
        <input
          id={ticketId}
          value={ticket}
          maxLength={TICKET_MAX * 2}
          onChange={(e) => setTicket(e.target.value)}
          aria-invalid={(tried && problems.ticket) || undefined}
          aria-describedby={`${ticketId}-d`}
          className="h-[var(--ctl)] w-full rounded-[var(--r-control)] bg-background px-3 text-[13px] shadow-[inset_0_0_0_1px_var(--input)] outline-none transition-shadow duration-[var(--dur-1)] focus-visible:shadow-[inset_0_0_0_1px_var(--ring),0_0_0_3px_color-mix(in_oklch,var(--ring)_22%,transparent)] aria-[invalid=true]:shadow-[inset_0_0_0_1px_var(--c-danger-ink)] max-md:h-11"
        />
        <p id={`${ticketId}-d`} className={cn("text-[12px]", tried && problems.ticket ? "text-[var(--c-danger-ink)]" : "text-muted-foreground")}>
          {tried && problems.ticket && ticketRequired && !ticket.trim() ? t("console.impersonation.ticket_required") : t(ticketRequired ? "console.impersonation.ticket_hint_required" : "console.impersonation.ticket_hint")}
        </p>
      </div>

      <fieldset className="grid gap-1.5">
        <legend className="mb-1.5 text-[12.5px] font-medium">{t("console.impersonation.duration")}</legend>
        <div role="radiogroup" className="inline-flex w-full rounded-[var(--r-control)] bg-secondary p-0.5 sm:w-auto">
          {VIEW_MINUTES.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={minutes === m}
              onClick={() => setMinutes(m)}
              className={cn(
                "num h-8 flex-1 rounded-[calc(var(--r-control)-2px)] px-4 text-[12.5px] font-medium text-muted-foreground outline-none transition-colors duration-[var(--dur-1)] focus-visible:ring-2 focus-visible:ring-[var(--ring)] sm:flex-none max-md:h-10",
                minutes === m && "bg-card text-foreground shadow-[0_1px_2px_oklch(0.2_0.01_230/0.12),inset_0_0_0_1px_var(--c-hairline)]",
              )}
            >
              {t("console.impersonation.minutes", { count: m })}
            </button>
          ))}
        </div>
      </fieldset>

      <section className="grid gap-2">
        <h3 className="text-[11.5px] font-semibold tracking-[0.01em] text-muted-foreground uppercase">{t("console.impersonation.store_reads", { locale: t(`console.lifecycle.locale.${notice.locale}`) })}</h3>
        <div lang={notice.locale} dir={dir} className="grid gap-1 rounded-[var(--r-control)] bg-[color-mix(in_oklch,var(--muted)_55%,transparent)] p-3 shadow-[inset_0_0_0_1px_var(--c-hairline)]">
          <p className="text-[13px] font-semibold">{shown.title}</p>
          {shown.body && <p className="text-[13px] leading-[1.5]" suppressHydrationWarning>{fillNoticeWindow(shown.body, now, minutes, notice.locale, notice.timeZone)}</p>}
        </div>
        <p className="flex items-start gap-2 text-[12.5px] leading-[1.45] text-muted-foreground">
          <EyeOffIcon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          {t("console.impersonation.masked")}
        </p>
      </section>

      {refusal && (
        <div role="alert" className="grid gap-1.5 rounded-[var(--r-control)] bg-[var(--c-danger-soft)] px-3 py-2.5 text-[13px]">
          <p>{refusal.text}</p>
          {refusal.member && (
            <PrefetchLink href="/app" className="inline-flex items-center gap-1 text-[12.5px] font-medium text-[var(--c-brand-ink)] hover:underline">
              {t("console.impersonation.your_stores")}
              <ArrowUpRightIcon aria-hidden="true" className="size-3.5 rtl:-scale-x-100" />
            </PrefetchLink>
          )}
        </div>
      )}
    </ConsoleDialog>
  );
}
