"use client";
/**
 * The approval queue's decision dialogs (platform.md PLA-§3.5 "Decisions", §3.7, §4.5 "Dangerous actions"):
 *   - ApproveNoteDialog: approving a `hold` / `reject_candidate` row needs a note (≤ 500);
 *   - AskDialog: a question to the seller (≤ 500) with the `console.ask.*` templates;
 *   - RejectDialog: a RejectReason, a note (required for Other), and "Block this account" (users.manage; the action
 *     answers `step_up`, the StepUpSheet collects the code and the split view re-sends the same opId);
 *   - SnoozeDialog: 1 h, 4 h, tomorrow 09:00 platform time, 3 days (keys 1-4);
 *   - ResolveDialog: a store request granted (the plan or limit asked, or the restore) or declined with a note.
 * Every dialog validates on the client, then hands its values to the split view, which decides optimistically. The
 * split view mounts a dialog per opening, so each one starts empty (no reset effect).
 * Labels sit above their fields; nothing here is a placeholder-as-label (PLA-§4.7 rule 8).
 */
import { XIcon } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useT } from "@/lib/i18n/admin/client";
import type { GrantSpec, RejectReason, SnoozeChoice } from "@/lib/platform/queue-rules";
import type { ReviewRequest } from "@/lib/platform/types";
import { cn } from "@/lib/utils";
import styles from "../shell/console.module.css";

export const NOTE_LIMIT = 500;
export const REJECT_LIST: readonly RejectReason[] = ["brand_impersonation", "prohibited_goods", "suspected_scam", "fake_identity", "duplicate_account", "incomplete", "market_not_served", "other"];
export const ASK_TEMPLATES = ["what_you_sell", "social", "brand", "contact", "duplicate"] as const;
export const SNOOZE_LIST: readonly SnoozeChoice[] = ["1h", "4h", "tomorrow", "3d"];

export const button = {
  base: "inline-flex h-[var(--ctl)] shrink-0 items-center justify-center gap-1.5 rounded-[var(--r-control)] px-3 text-[13px] font-medium whitespace-nowrap outline-none transition-[background-color,box-shadow,color] duration-[var(--dur-1)] focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 max-md:h-11",
  primary: "bg-[var(--brand)] text-[var(--brand-foreground)] hover:bg-[color-mix(in_oklch,var(--brand)_88%,black)]",
  secondary: "bg-card text-foreground shadow-[inset_0_0_0_1px_var(--border)] hover:bg-accent",
  danger: "bg-card text-[var(--c-danger-ink)] shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--c-danger-ink)_35%,transparent)] hover:bg-[var(--c-danger-soft)]",
  dangerSolid: "bg-[oklch(0.55_0.19_17)] text-white hover:bg-[oklch(0.5_0.19_17)]",
  ghost: "text-muted-foreground hover:bg-accent hover:text-foreground",
} as const;

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return <kbd className={cn("ms-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[4px] px-1 font-mono text-[10.5px] leading-none opacity-70 shadow-[inset_0_0_0_1px_currentColor] max-md:hidden", className)}>{children}</kbd>;
}

/** The console's dialog frame: a centred sheet on desktop, a bottom sheet on phones. */
export function ConsoleDialog({ open, onOpenChange, title, description, children, footer }: { open: boolean; onOpenChange(open: boolean): void; title: string; description?: ReactNode; children: ReactNode; footer: ReactNode }) {
  const t = useT();
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[oklch(0.2_0.01_230/0.32)]" />
        <DialogPrimitive.Content
          aria-describedby={description ? undefined : undefined}
          className={cn(
            styles.palette,
            "fixed inset-x-0 bottom-0 z-50 mx-auto grid max-h-[90dvh] w-full grid-rows-[auto_1fr_auto] overflow-hidden rounded-t-[var(--r-sheet)] bg-popover text-[13px] text-popover-foreground outline-none ring-1 ring-[var(--c-hairline)] md:top-[12vh] md:bottom-auto md:w-[min(520px,92vw)] md:rounded-[var(--r-sheet)] md:shadow-[0_24px_64px_-24px_oklch(0.2_0.01_230/0.35)]",
          )}
        >
          <div className="flex items-start gap-3 px-5 pt-4 pb-3">
            <div className="grid min-w-0 flex-1 gap-1">
              <DialogPrimitive.Title className="text-[15px] font-semibold tracking-[-0.006em]">{title}</DialogPrimitive.Title>
              {description ? <DialogPrimitive.Description className="text-[12.5px] text-muted-foreground">{description}</DialogPrimitive.Description> : <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>}
            </div>
            <DialogPrimitive.Close aria-label={t("console.dialog.close")} className="-me-1.5 inline-grid size-8 shrink-0 place-items-center rounded-[var(--r-control)] text-muted-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-[var(--ring)] max-md:size-11">
              <XIcon aria-hidden="true" className="size-4" />
            </DialogPrimitive.Close>
          </div>
          <div className="grid min-h-0 content-start gap-4 overflow-y-auto px-5 pb-4">{children}</div>
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--c-hairline)] bg-[color-mix(in_oklch,var(--muted)_50%,transparent)] px-5 py-3 max-md:pb-[max(12px,env(safe-area-inset-bottom))]">{footer}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** A labelled text area with its character count and an inline problem line. */
export function NoteField({ label, hint, value, onChange, max = NOTE_LIMIT, required, problem, rows = 3, autoFocus }: { label: string; hint?: string; value: string; onChange(v: string): void; max?: number; required?: boolean; problem?: string | null; rows?: number; autoFocus?: boolean }) {
  const id = useId();
  const t = useT();
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);
  const over = value.length > max;
  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-[12.5px] font-medium">
          {label}
          {!required && <span className="ms-1.5 font-normal text-muted-foreground">{t("console.form.optional")}</span>}
        </label>
        <span className={cn("num text-[11px] text-muted-foreground", over && "font-medium text-[var(--c-danger-ink)]")}>
          {value.length} / {max}
        </span>
      </div>
      <textarea
        ref={ref}
        id={id}
        rows={rows}
        value={value}
        aria-invalid={!!problem || over || undefined}
        aria-describedby={hint || problem ? `${id}-d` : undefined}
        onChange={(e) => onChange(e.target.value)}
        className="w-full resize-y rounded-[var(--r-control)] bg-background px-3 py-2 text-[13px] leading-[1.5] shadow-[inset_0_0_0_1px_var(--input)] outline-none transition-shadow duration-[var(--dur-1)] focus-visible:shadow-[inset_0_0_0_1px_var(--ring),0_0_0_3px_color-mix(in_oklch,var(--ring)_22%,transparent)] aria-[invalid=true]:shadow-[inset_0_0_0_1px_var(--c-danger-ink)]"
      />
      {(problem || hint) && (
        <p id={`${id}-d`} className={cn("text-[12px]", problem ? "text-[var(--c-danger-ink)]" : "text-muted-foreground")}>
          {problem ?? hint}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function ApproveNoteDialog({ open, onOpenChange, store, band, onSubmit }: { open: boolean; onOpenChange(o: boolean): void; store: string; band: string; onSubmit(note: string): void }) {
  const t = useT();
  const [note, setNote] = useState("");
  const [tried, setTried] = useState(false);
  const problem = tried && !note.trim() ? t("console.queue.note_required") : null;
  const submit = () => {
    setTried(true);
    if (!note.trim() || note.length > NOTE_LIMIT) return;
    onSubmit(note.trim());
  };
  return (
    <ConsoleDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("console.queue.approve_title", { store })}
      description={t("console.queue.approve_note_lead", { band: t(`console.band.${band}`) })}
      footer={
        <>
          <DialogPrimitive.Close className={cn(button.base, button.ghost)}>{t("console.dialog.cancel")}</DialogPrimitive.Close>
          <button type="button" className={cn(button.base, button.primary)} onClick={submit}>
            {t("console.queue.approve")}
          </button>
        </>
      }
    >
      <NoteField label={t("console.queue.note")} hint={t("console.queue.note_hint")} value={note} onChange={setNote} required problem={problem} autoFocus />
    </ConsoleDialog>
  );
}

export function AskDialog({ open, onOpenChange, store, onSubmit }: { open: boolean; onOpenChange(o: boolean): void; store: string; onSubmit(question: string): void }) {
  const t = useT();
  const [text, setText] = useState("");
  const [tried, setTried] = useState(false);
  const problem = tried && !text.trim() ? t("console.ask.required") : null;
  const submit = () => {
    setTried(true);
    if (!text.trim() || text.length > NOTE_LIMIT) return;
    onSubmit(text.trim());
  };
  return (
    <ConsoleDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("console.ask.title", { store })}
      description={t("console.ask.lead")}
      footer={
        <>
          <DialogPrimitive.Close className={cn(button.base, button.ghost)}>{t("console.dialog.cancel")}</DialogPrimitive.Close>
          <button type="button" className={cn(button.base, button.primary)} onClick={submit}>
            {t("console.ask.send")}
          </button>
        </>
      }
    >
      <div className="grid gap-1.5">
        <span className="text-[12.5px] font-medium">{t("console.ask.templates")}</span>
        <div className="flex flex-wrap gap-1.5">
          {ASK_TEMPLATES.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setText(t(`console.ask.${k}`))}
              className="inline-flex h-7 items-center rounded-full px-2.5 text-[12px] shadow-[inset_0_0_0_1px_var(--border)] outline-none transition-colors duration-[var(--dur-1)] hover:bg-accent focus-visible:ring-2 focus-visible:ring-[var(--ring)] max-md:h-10"
            >
              {t(`console.ask.label.${k}`)}
            </button>
          ))}
        </div>
      </div>
      <NoteField label={t("console.ask.question")} hint={t("console.ask.hint")} value={text} onChange={setText} required problem={problem} rows={5} autoFocus />
    </ConsoleDialog>
  );
}

export function RejectDialog({
  open,
  onOpenChange,
  store,
  canBlock,
  appeal,
  onSubmit,
}: {
  open: boolean;
  onOpenChange(o: boolean): void;
  store: string;
  canBlock: boolean;
  appeal: boolean;
  onSubmit(v: { reason: RejectReason; note: string; block: boolean }): void;
}) {
  const t = useT();
  const name = useId();
  const [reason, setReason] = useState<RejectReason | null>(null);
  const [note, setNote] = useState("");
  const [block, setBlock] = useState(false);
  const [tried, setTried] = useState(false);
  const noteNeeded = reason === "other";
  const submit = () => {
    setTried(true);
    if (!reason || (noteNeeded && !note.trim()) || note.length > NOTE_LIMIT) return;
    onSubmit({ reason, note: note.trim(), block: canBlock && block });
  };
  return (
    <ConsoleDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t(appeal ? "console.reject.title_appeal" : "console.reject.title", { store })}
      description={t("console.reject.lead")}
      footer={
        <>
          <DialogPrimitive.Close className={cn(button.base, button.ghost)}>{t("console.dialog.cancel")}</DialogPrimitive.Close>
          <button type="button" className={cn(button.base, button.dangerSolid)} onClick={submit}>
            {block && canBlock ? t("console.reject.submit_block") : t("console.reject.submit")}
          </button>
        </>
      }
    >
      <fieldset className="grid gap-1.5">
        <legend className="mb-1.5 text-[12.5px] font-medium">{t("console.reject.reason")}</legend>
        <div className="grid gap-1 sm:grid-cols-2">
          {REJECT_LIST.map((r) => (
            <label
              key={r}
              className={cn(
                "flex min-h-9 cursor-pointer items-center gap-2.5 rounded-[var(--r-control)] px-2.5 text-[13px] shadow-[inset_0_0_0_1px_var(--border)] transition-[background-color,box-shadow] duration-[var(--dur-1)] hover:bg-accent has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--ring)] max-md:min-h-11",
                reason === r && "bg-[var(--c-danger-soft)] shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--c-danger-ink)_40%,transparent)]",
              )}
            >
              <input type="radio" name={name} value={r} checked={reason === r} onChange={() => setReason(r)} className="size-3.5 accent-[oklch(0.55_0.19_17)]" />
              {t(`console.reject.${r}`)}
            </label>
          ))}
        </div>
        {tried && !reason && <p className="text-[12px] text-[var(--c-danger-ink)]">{t("console.reject.reason_required")}</p>}
      </fieldset>
      <NoteField label={t("console.queue.note")} hint={t("console.reject.note_hint")} value={note} onChange={setNote} required={noteNeeded} problem={tried && noteNeeded && !note.trim() ? t("console.lifecycle.note_required") : null} />
      {canBlock && (
        <label className="flex cursor-pointer items-start gap-2.5 rounded-[var(--r-control)] p-2.5 shadow-[inset_0_0_0_1px_var(--border)] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--ring)]">
          <input type="checkbox" checked={block} onChange={(e) => setBlock(e.target.checked)} className="mt-0.5 size-3.5 accent-[oklch(0.55_0.19_17)]" />
          <span className="grid gap-0.5">
            <span className="text-[13px] font-medium">{t("console.reject.block")}</span>
            <span className="text-[12px] text-muted-foreground">{t("console.reject.block_hint")}</span>
          </span>
        </label>
      )}
    </ConsoleDialog>
  );
}

/** The four snooze presets (S on the active row, or the bar's Snooze): 1 to 4 pick one while the dialog is open. */
export function SnoozeDialog({ open, onOpenChange, store, onPick }: { open: boolean; onOpenChange(o: boolean): void; store: string; onPick(c: SnoozeChoice): void }) {
  const t = useT();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const i = ["1", "2", "3", "4"].indexOf(e.key);
      if (i >= 0 && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        onPick(SNOOZE_LIST[i]!);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onPick]);
  return (
    <ConsoleDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("console.queue.snooze_title", { store })}
      description={t("console.queue.snooze_lead")}
      footer={<DialogPrimitive.Close className={cn(button.base, button.ghost)}>{t("console.dialog.cancel")}</DialogPrimitive.Close>}
    >
      <div className="grid gap-1.5 sm:grid-cols-2">
        {SNOOZE_LIST.map((c, i) => (
          <button
            key={c}
            type="button"
            onClick={() => onPick(c)}
            className="flex min-h-10 items-center justify-between gap-3 rounded-[var(--r-control)] px-3 text-start text-[13px] shadow-[inset_0_0_0_1px_var(--border)] outline-none transition-colors duration-[var(--dur-1)] hover:bg-accent focus-visible:ring-2 focus-visible:ring-[var(--ring)] max-md:min-h-11"
          >
            {t(`console.queue.snooze.${c}`)}
            <Kbd className="ms-0">{i + 1}</Kbd>
          </button>
        ))}
      </div>
    </ConsoleDialog>
  );
}

/** What a store request asks, in one line (the dialog and the detail pane). */
export function useRequestSummary(): (req: ReviewRequest | null) => string {
  const t = useT();
  return (req) => {
    if (!req) return "";
    switch (req.kind) {
      case "plan_change":
        return t("console.request.summary.plan_change", { plan: req.planId });
      case "limit_raise":
        return req.asked !== null
          ? t("console.request.summary.limit_raise", { key: t(`console.entitlement.${req.key}`), used: req.used, limit: req.limit ?? "∞", asked: req.asked })
          : t("console.request.summary.limit_raise_open", { key: t(`console.entitlement.${req.key}`), used: req.used, limit: req.limit ?? "∞" });
      case "mode_change":
        return t("console.request.summary.mode_change", { mode: t(`console.mode.${req.mode}`) });
      case "go_live":
        return t("console.request.summary.go_live");
      case "domain":
        return t("console.request.summary.domain", { host: req.host });
      default:
        return "";
    }
  };
}

export function ResolveDialog({
  open,
  onOpenChange,
  store,
  kind,
  request,
  outcome,
  onSubmit,
}: {
  open: boolean;
  onOpenChange(o: boolean): void;
  store: string;
  kind: string;
  request: ReviewRequest | null;
  outcome: "grant" | "decline";
  onSubmit(v: { outcome: "grant" | "decline"; note: string; grant?: GrantSpec }): void;
}) {
  const t = useT();
  const summary = useRequestSummary();
  const [note, setNote] = useState("");
  const [value, setValue] = useState(() => (request?.kind === "limit_raise" && request.asked !== null ? String(request.asked) : ""));
  const [tried, setTried] = useState(false);
  const needsNote = outcome === "decline";
  const limit = request?.kind === "limit_raise" ? request : null;
  const parsed = value.trim() === "" ? null : Number(value);
  const valueBad = outcome === "grant" && !!limit && (parsed === null || !Number.isInteger(parsed) || parsed < 0);
  const submit = () => {
    setTried(true);
    if ((needsNote && !note.trim()) || note.length > NOTE_LIMIT || valueBad) return;
    const grant: GrantSpec | undefined = outcome === "grant" && limit && parsed !== null ? { kind: "override", key: limit.key, value: parsed } : undefined;
    onSubmit({ outcome, note: note.trim(), ...(grant ? { grant } : {}) });
  };
  const grantLine = outcome === "grant" ? t(`console.request.grant.${kind}`) : null;
  return (
    <ConsoleDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t(outcome === "grant" ? "console.request.grant_title" : "console.request.decline_title", { store })}
      description={summary(request)}
      footer={
        <>
          <DialogPrimitive.Close className={cn(button.base, button.ghost)}>{t("console.dialog.cancel")}</DialogPrimitive.Close>
          <button type="button" className={cn(button.base, outcome === "grant" ? button.primary : button.dangerSolid)} onClick={submit}>
            {t(outcome === "grant" ? "console.request.grant" : "console.request.decline")}
          </button>
        </>
      }
    >
      {grantLine && <p className="rounded-[var(--r-control)] bg-[var(--c-info-soft)] px-3 py-2 text-[12.5px] text-[var(--c-info-ink)]">{grantLine}</p>}
      {request && "message" in request && request.message && (
        <div className="grid gap-1">
          <span className="text-[12px] font-medium text-muted-foreground">{t("console.request.message")}</span>
          <p className="rounded-[var(--r-control)] bg-muted px-3 py-2 text-[13px] whitespace-pre-wrap">{request.message}</p>
        </div>
      )}
      {outcome === "grant" && limit && (
        <div className="grid gap-1.5">
          <label htmlFor="grant-value" className="text-[12.5px] font-medium">
            {t("console.request.new_limit", { key: t(`console.entitlement.${limit.key}`) })}
          </label>
          <input
            id="grant-value"
            inputMode="numeric"
            value={value}
            onChange={(e) => setValue(e.target.value.replace(/[^\d]/g, ""))}
            aria-invalid={(tried && valueBad) || undefined}
            className="num h-[var(--ctl)] w-40 rounded-[var(--r-control)] bg-background px-3 text-[13px] shadow-[inset_0_0_0_1px_var(--input)] outline-none focus-visible:shadow-[inset_0_0_0_1px_var(--ring),0_0_0_3px_color-mix(in_oklch,var(--ring)_22%,transparent)] max-md:h-11"
          />
          {tried && valueBad && <p className="text-[12px] text-[var(--c-danger-ink)]">{t("console.entitlement.value_type")}</p>}
        </div>
      )}
      <NoteField
        label={t("console.queue.note")}
        hint={t(needsNote ? "console.request.decline_hint" : "console.request.grant_hint")}
        value={note}
        onChange={setNote}
        required={needsNote}
        problem={tried && needsNote && !note.trim() ? t("console.queue.decline_note_required") : null}
        autoFocus={needsNote}
      />
    </ConsoleDialog>
  );
}
