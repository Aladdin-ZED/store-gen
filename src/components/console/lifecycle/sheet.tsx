"use client";
/**
 * The lifecycle sheet (platform.md PLA-§8.0-§8.2, PL-08; PD43, PD44, PD54): every lifecycle action of the store
 * profile goes through it, in three steps, and nothing is written before the last:
 *   1. Preview: `lifecyclePreviewAction` (read-only) says what the store will read, in its own locale (title, body,
 *      banner), what its visitors meet, the consequences with numbers and the edge's requirements; the preview is read
 *      again when the reason, the suspension notice or the restore target changes.
 *   2. Arm: reason, note (required for Other), the typed handle where marked, then the step-up BEFORE arming; the
 *      primary button counts `armSeconds` down with Cancel in the same spot, Esc cancels, and the write is sent once,
 *      at 0, only while the sheet is open and focused (./arm.ts).
 *   3. Cooldown: a change inside the cooldown asks for the handle even where the edge does not, with the reason line.
 * A stale `from` answers `status_changed`: the sheet says so and reads the preview again. "Show this note to the
 * store" is off by default. The sheet is opened from the StatusPill menu or the ⋯ menu only, never from a chord, ⌘K
 * or a bulk bar. Mounted once per opening (the caller keys it), so every opening starts empty with a fresh `opId`.
 *
 *   <LifecycleSheet key={n} open item={{ action: "restrict", to: "restricted", … }} store={{ id, name, handle }} armSeconds={5} stepUpUntil={iso} onOpenChange={…} />
 */
import { AlertTriangleIcon, ClockIcon, LockKeyholeIcon, ShieldCheckIcon, XIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useCallback, useEffect, useId, useReducer, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  cancelDeletionAction,
  closeStoreAction,
  lifecyclePreviewAction,
  reopenStoreAction,
  requestPurgeAction,
  restoreStoreAction,
  restrictStoreAction,
  scheduleDeletionAction,
  suspendStoreAction,
} from "@/app/admin/(console)/stores/[id]/actions";
import { StepUpSheet } from "@/components/admin/common/step-up-sheet";
import { useT } from "@/lib/i18n/admin/client";
import type { LifecyclePreview } from "@/lib/platform/lifecycle-preview";
import type { LifecycleMenuItem } from "@/lib/platform/profile/menu";
import type { ActionResult, StoreStatus } from "@/lib/tenancy/types";
import { cn } from "@/lib/utils";
import { durationText } from "../format";
import { newOpId } from "../op";
import { button, NoteField } from "../queue/decision-dialogs";
import { ARM_IDLE, armBlockers, armReducer, type ArmBlocker } from "./arm";
import styles from "../shell/console.module.css";

const LOCALE_DIR: Record<string, "rtl" | "ltr"> = { ar: "rtl", fr: "ltr", en: "ltr" };
/** queue-rules.ts NOTE_MAX: a lifecycle note is at most 500 characters */
const NOTE_LIMIT = 500;

type PreviewState = { state: "loading" } | { state: "ok"; data: LifecyclePreview } | { state: "error"; message: string | null };
type StoreRef = { id: string; name: string; handle: string | null };

export function LifecycleSheet({
  open,
  onOpenChange,
  item,
  store,
  armSeconds,
  stepUpUntil,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  item: LifecycleMenuItem;
  store: StoreRef;
  armSeconds: number;
  /** step_up_at + 5 min (ISO), null when the session never stepped up */
  stepUpUntil: string | null;
}) {
  const t = useT();
  const router = useRouter();
  const ids = useId();
  const [opId] = useState(newOpId);
  const [preview, setPreview] = useState<PreviewState>({ state: "loading" });
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [suspendNotice, setSuspendNotice] = useState(false);
  const [restoreTo, setRestoreTo] = useState<"active" | "restricted">("active");
  const [purgeMode, setPurgeMode] = useState<"four_eyes" | "delayed">("four_eyes");
  const [typed, setTyped] = useState("");
  const [word, setWord] = useState("");
  const [tried, setTried] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [stepUp, setStepUp] = useState<null | "arm" | "resend">(null);
  const [verifiedAt, setVerifiedAt] = useState<number | null>(null);
  const [arm, dispatch] = useReducer(armReducer, ARM_IDLE);
  const [reload, setReload] = useState(0);
  const sent = useRef(0);

  const to: StoreStatus = item.action === "restore" ? restoreTo : item.to;

  /* 1. the preview, read again when what the store would read changes */
  useEffect(() => {
    let live = true;
    lifecyclePreviewAction({ storeId: store.id, to, ...(reason ? { reason } : {}), ...(item.action === "suspend" ? { suspendNotice } : {}) }).then(
      (r) => {
        if (!live) return;
        if (r.ok) setPreview({ state: "ok", data: r.data });
        else setPreview({ state: "error", message: r.message ? t(r.message) : null });
      },
      () => live && setPreview({ state: "error", message: null }),
    );
    return () => {
      live = false;
    };
  }, [store.id, to, reason, suspendNotice, item.action, reload, t]);

  const p = preview.state === "ok" ? preview.data : null;
  const requires = p?.requires ?? null;
  const typedHandle = !!requires && (requires.typedHandle || !!p?.cooldown.typedHandleRequired);
  const blockers: ArmBlocker[] = p ? armBlockers({ handle: store.handle, typedHandle, typedWord: requires?.typedWord ?? null }, { reason, note, typed, word }) : ["reason"];

  /* 2. the write, sent once per completed countdown */
  const send = useCallback(async () => {
    if (!p) return;
    const base = { storeId: store.id, reason: reason ?? "", note: note.trim() || undefined, showNote, typedHandle: typed.trim() || undefined, expectedFrom: p.from, opId };
    let r: ActionResult<unknown> = { ok: false, error: "server" };
    try {
      switch (item.action) {
        case "restrict":
          r = await restrictStoreAction(base);
          break;
        case "suspend":
          r = await suspendStoreAction({ ...base, suspendNotice });
          break;
        case "restore":
          r = await restoreStoreAction({ ...base, to: restoreTo });
          break;
        case "close":
          r = await closeStoreAction(base);
          break;
        case "reopen":
          r = await reopenStoreAction(base);
          break;
        case "schedule_deletion":
          r = await scheduleDeletionAction(base);
          break;
        case "cancel_deletion":
          r = await cancelDeletionAction(base);
          break;
        case "purge":
          r = await requestPurgeAction({ storeId: store.id, mode: purgeMode, reason: reason ?? "", note: note.trim() || undefined, typedHandle: typed.trim(), typedWord: word.trim(), opId });
          break;
      }
    } catch {
      r = { ok: false, error: "server" };
    }
    if (r.ok) {
      dispatch({ type: "settled", ok: true });
      toast.success(item.action === "purge" ? t("console.lifecycle.done_purge", { store: store.name }) : t("console.lifecycle.done", { store: store.name, status: t(`console.status.${to}`) }));
      onOpenChange(false);
      router.refresh();
      return;
    }
    dispatch({ type: "settled", ok: false });
    if (r.error === "step_up") {
      setStepUp("resend");
      return;
    }
    if (r.error === "status_changed") {
      setProblem(t("console.lifecycle.status_changed"));
      setReload((n) => n + 1);
      return;
    }
    if (r.error === "cooldown_handle_required") setReload((n) => n + 1);
    setProblem(r.message ? t(r.message) : t(`console.lifecycle.error.${r.error === "forbidden" || r.error === "rate_limited" || r.error === "conflict" ? r.error : "server"}`));
  }, [p, store.id, store.name, reason, note, showNote, typed, word, opId, item.action, suspendNotice, restoreTo, purgeMode, to, t, onOpenChange, router]);

  useEffect(() => {
    if (arm.fired > sent.current) {
      sent.current = arm.fired;
      void send();
    }
  }, [arm.fired, send]);

  /* the countdown: one tick a second while armed */
  useEffect(() => {
    if (arm.phase !== "armed") return;
    const id = setInterval(() => dispatch({ type: "tick", open: true, focused: document.hasFocus() && document.visibilityState === "visible" }), 1000);
    return () => clearInterval(id);
  }, [arm.phase]);

  const lostFocus = arm.phase === "cancelled" && arm.cancelledBy === "unfocused" ? t("console.lifecycle.cancelled_unfocused") : null;

  const primary = () => {
    if (arm.phase === "armed") {
      dispatch({ type: "cancel", by: "user" });
      return;
    }
    setTried(true);
    setProblem(null);
    if (!p?.allowed || blockers.length) return;
    const now = Date.now();
    const stepUpFresh = (verifiedAt !== null && now - verifiedAt < 4 * 60_000) || (stepUpUntil !== null && Date.parse(stepUpUntil) - now > (armSeconds + 20) * 1000);
    if (requires?.stepUp && !stepUpFresh) {
      setStepUp("arm");
      return;
    }
    dispatch({ type: "arm", seconds: armSeconds });
  };

  const close = (o: boolean) => {
    if (!o && arm.phase === "armed") dispatch({ type: "cancel", by: "closed" });
    onOpenChange(o);
  };

  const reasons = requires?.reasons ?? [];
  const actionLabel = t(`console.lifecycle.submit.${item.action}`);
  const busy = arm.phase === "sending";

  return (
    <>
      <DialogPrimitive.Root open={open} onOpenChange={close}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[oklch(0.2_0.01_230/0.32)]" />
          <DialogPrimitive.Content
            onEscapeKeyDown={(e) => {
              if (arm.phase === "armed") {
                e.preventDefault();
                dispatch({ type: "cancel", by: "escape" });
              }
            }}
            onInteractOutside={(e) => {
              if (arm.phase === "armed" || busy) e.preventDefault();
            }}
            className={cn(
              styles.palette,
              "fixed inset-x-0 bottom-0 z-50 grid max-h-[94dvh] w-full grid-rows-[auto_1fr_auto] overflow-hidden rounded-t-[var(--r-sheet)] bg-popover text-[13px] text-popover-foreground outline-none ring-1 ring-[var(--c-hairline)] md:inset-y-3 md:end-3 md:start-auto md:bottom-3 md:max-h-none md:w-[min(560px,94vw)] md:rounded-[var(--r-sheet)] md:shadow-[0_24px_64px_-24px_oklch(0.2_0.01_230/0.35)]",
            )}
          >
            <div className="flex items-start gap-3 border-b border-[var(--c-hairline)] px-5 pt-4 pb-3">
              <div className="grid min-w-0 flex-1 gap-1">
                <DialogPrimitive.Title className="text-[15px] font-semibold tracking-[-0.006em]">{t(`console.lifecycle.title.${item.action}`, { store: store.name })}</DialogPrimitive.Title>
                <DialogPrimitive.Description className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-muted-foreground">
                  <span>{t(`console.status.${p?.from ?? "active"}`)}</span>
                  <span aria-hidden="true" className="rtl:-scale-x-100">→</span>
                  <span className="font-medium text-foreground">{item.action === "purge" ? t("console.lifecycle.purge_target") : t(`console.status.${to}`)}</span>
                </DialogPrimitive.Description>
              </div>
              <DialogPrimitive.Close aria-label={t("console.dialog.close")} className="-me-1.5 inline-grid size-8 shrink-0 place-items-center rounded-[var(--r-control)] text-muted-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-[var(--ring)] max-md:size-11">
                <XIcon aria-hidden="true" className="size-4" />
              </DialogPrimitive.Close>
            </div>

            <div className="grid min-h-0 content-start gap-5 overflow-y-auto px-5 py-4">
              {preview.state === "loading" && <SheetSkeleton />}
              {preview.state === "error" && (
                <div role="alert" className="grid justify-items-start gap-2">
                  <p className="text-[13px] font-medium">{preview.message ?? t("console.lifecycle.preview_error")}</p>
                  <button type="button" className={cn(button.base, button.secondary)} onClick={() => (setPreview({ state: "loading" }), setReload((n) => n + 1))}>
                    {t("console.panel.retry")}
                  </button>
                </div>
              )}
              {p && (
                <>
                  {!p.allowed && p.blockedKey && (
                    <p role="status" className="flex items-start gap-2 rounded-[var(--r-control)] bg-[var(--c-warn-soft)] px-3 py-2.5 text-[13px]">
                      <LockKeyholeIcon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                      {t(p.blockedKey)}
                    </p>
                  )}
                  {p.cooldown.typedHandleRequired && (
                    <p className="flex items-start gap-2 rounded-[var(--r-control)] bg-[var(--c-warn-soft)] px-3 py-2.5 text-[13px]">
                      <ClockIcon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                      {t("console.lifecycle.cooldown", {
                        ago: p.cooldown.minutesAgo !== null ? t("console.time.ago", { d: durationText(p.cooldown.minutesAgo * 60_000) ?? "1 min" }) : t("console.time.now"),
                        name: p.cooldown.lastChangeBy ?? t("console.lifecycle.someone"),
                        to: t(`console.status.${p.from}`),
                      })}
                    </p>
                  )}
                  <StoreSees p={p} />
                  <Affects p={p} />
                </>
              )}

              {p && p.allowed && (
                <form
                  className="grid gap-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    primary();
                  }}
                >
                  {item.action === "restore" && p.from === "suspended" && (
                    <Choice
                      legend={t("console.lifecycle.restore_to")}
                      name={`${ids}-to`}
                      value={restoreTo}
                      onChange={(v) => setRestoreTo(v as "active" | "restricted")}
                      options={(["active", "restricted"] as const).map((s) => ({ value: s, label: t(`console.status.${s}`) }))}
                      disabled={arm.phase === "armed"}
                    />
                  )}
                  <Choice
                    legend={t("console.lifecycle.reason")}
                    name={`${ids}-reason`}
                    value={reason}
                    onChange={setReason}
                    options={reasons.map((r) => ({ value: r, label: t(`console.reason.${r}`) }))}
                    problem={tried && blockers.includes("reason") ? t("console.lifecycle.reason_invalid") : null}
                    disabled={arm.phase === "armed"}
                  />
                  <NoteField
                    label={t("console.lifecycle.note")}
                    hint={t("console.lifecycle.note_hint")}
                    value={note}
                    onChange={setNote}
                    max={NOTE_LIMIT}
                    required={reason === "other"}
                    problem={tried && blockers.includes("note") ? t("console.lifecycle.note_required") : null}
                    rows={2}
                  />
                  {item.action !== "purge" && (
                    <Toggle checked={showNote} onChange={setShowNote} label={t("console.lifecycle.show_note")} hint={t("console.lifecycle.show_note_hint")} disabled={arm.phase === "armed"} />
                  )}
                  {item.action === "suspend" && (
                    <Toggle checked={suspendNotice} onChange={setSuspendNotice} label={t("console.lifecycle.suspend_notice")} hint={t("console.lifecycle.suspend_notice_hint")} disabled={arm.phase === "armed"} />
                  )}
                  {item.action === "purge" && (
                    <Choice
                      legend={t("console.lifecycle.purge_mode")}
                      name={`${ids}-mode`}
                      value={purgeMode}
                      onChange={(v) => setPurgeMode(v as "four_eyes" | "delayed")}
                      options={(["four_eyes", "delayed"] as const).map((m) => ({ value: m, label: t(`console.lifecycle.purge_mode.${m}`) }))}
                      disabled={arm.phase === "armed"}
                      wide
                    />
                  )}
                  {typedHandle && (
                    <TypedField
                      id={`${ids}-typed`}
                      label={t("console.lifecycle.typed", { handle: store.handle ?? "" })}
                      value={typed}
                      onChange={setTyped}
                      problem={tried && blockers.includes("handle") ? t(p.cooldown.typedHandleRequired && !requires?.typedHandle ? "console.lifecycle.cooldown_handle_required" : "console.lifecycle.typed_mismatch") : null}
                      disabled={arm.phase === "armed"}
                    />
                  )}
                  {requires?.typedWord && (
                    <TypedField
                      id={`${ids}-word`}
                      label={t("console.lifecycle.typed_word", { word: requires.typedWord })}
                      value={word}
                      onChange={setWord}
                      problem={tried && blockers.includes("word") ? t("console.lifecycle.typed_mismatch") : null}
                      disabled={arm.phase === "armed"}
                    />
                  )}
                  <Requirements p={p} armSeconds={armSeconds} />
                  <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
                </form>
              )}
              {(problem ?? lostFocus) && (
                <p role="alert" className="flex items-start gap-2 text-[12.5px] text-[var(--c-danger-ink)]">
                  <AlertTriangleIcon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                  {problem ?? lostFocus}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--c-hairline)] bg-[color-mix(in_oklch,var(--muted)_50%,transparent)] px-5 py-3 max-md:pb-[max(12px,env(safe-area-inset-bottom))]">
              {arm.phase !== "armed" && (
                <DialogPrimitive.Close className={cn(button.base, button.ghost)} disabled={busy}>
                  {t("console.dialog.cancel")}
                </DialogPrimitive.Close>
              )}
              <button
                type="button"
                onClick={primary}
                disabled={busy || !p || !p.allowed}
                aria-live="polite"
                className={cn(button.base, "min-w-[180px]", arm.phase === "armed" ? button.danger : item.danger ? button.dangerSolid : button.primary)}
              >
                {busy ? t("console.lifecycle.sending") : arm.phase === "armed" ? t("console.lifecycle.arm", { action: actionLabel, seconds: arm.remaining }) : actionLabel}
              </button>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
      <StepUpSheet
        open={stepUp !== null}
        surface="console"
        method="totp"
        onClose={() => setStepUp(null)}
        onVerified={() => {
          const then = stepUp;
          setStepUp(null);
          setVerifiedAt(Date.now());
          if (then === "arm") dispatch({ type: "arm", seconds: armSeconds });
          else if (then === "resend") void send();
        }}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */

function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="grid gap-2">
      <div className="flex items-center gap-2">
        <h3 className="min-w-0 flex-1 text-[11.5px] font-semibold tracking-[0.01em] text-muted-foreground uppercase">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** What the store will read, in its own locale and direction, exactly as rendered after the change. */
function StoreSees({ p }: { p: LifecyclePreview }) {
  const t = useT();
  const s = p.storeSees;
  const dir = LOCALE_DIR[s.locale] ?? "ltr";
  return (
    <Section title={t("console.lifecycle.store_sees", { locale: t(`console.lifecycle.locale.${s.locale}`) })}>
      <div lang={s.locale} dir={dir} className="grid gap-2 rounded-[var(--r-control)] bg-[color-mix(in_oklch,var(--muted)_55%,transparent)] p-3 shadow-[inset_0_0_0_1px_var(--c-hairline)]">
        {s.title ? <p className="text-[13px] font-semibold">{s.title}</p> : <p className="text-[12.5px] text-muted-foreground">{t("console.lifecycle.no_notification")}</p>}
        {s.body && <p className="text-[13px] leading-[1.5]">{s.body}</p>}
        {s.banner && <p className="rounded-[calc(var(--r-control)-2px)] bg-[var(--c-warn-soft)] px-2.5 py-1.5 text-[12.5px] leading-[1.45]">{s.banner}</p>}
      </div>
      <ul className="grid gap-1 text-[12.5px] text-muted-foreground">
        <li>{t(`console.lifecycle.pages.${s.publicPages}`)}</li>
        <li>{t(`console.lifecycle.orders.${s.publicOrders}`)}</li>
        {s.fallback && <li>{t("console.lifecycle.fallback")}</li>}
      </ul>
    </Section>
  );
}

/** The consequences, as numbers; an unavailable number is said plainly, never shown as 0. */
function Affects({ p }: { p: LifecyclePreview }) {
  const t = useT();
  const a = p.affects;
  const lines: string[] = [];
  const pagesGo = p.storeSees.publicPages === "neutral_404" || p.storeSees.publicPages === "neutral_503";
  if (a.livePages !== null && a.livePages > 0) lines.push(t(pagesGo ? "console.lifecycle.affects.pages_off" : "console.lifecycle.affects.pages_live", { count: a.livePages }));
  if (a.openOrders !== null && a.openOrders > 0) lines.push(t("console.lifecycle.affects.open_orders", { count: a.openOrders }));
  if (a.dueCallbacks !== null && a.dueCallbacks > 0) lines.push(t("console.lifecycle.affects.callbacks", { count: a.dueCallbacks }));
  if (a.agentsWithLease !== null && a.agentsWithLease > 0) lines.push(t(p.willWrite.leasesReleased ? "console.lifecycle.affects.leases_released" : "console.lifecycle.affects.leases", { count: a.agentsWithLease }));
  if (a.agentsOnline !== null && a.agentsOnline > 0) lines.push(t("console.lifecycle.affects.agents_online", { count: a.agentsOnline }));
  if (a.integrationsPaused && a.integrationsPaused.length) lines.push(t("console.lifecycle.affects.paused", { list: a.integrationsPaused.map((k) => t(`console.lifecycle.integration.${k}`)).join(", ") }));
  if (a.renderJobsPending !== null && a.renderJobsPending > 0) lines.push(t("console.lifecycle.affects.renders", { count: a.renderJobsPending }));
  if (p.willWrite.reviewWithdrawn) lines.push(t("console.lifecycle.affects.review_withdrawn"));
  if (p.willWrite.templatesEnsured) lines.push(t("console.lifecycle.affects.templates"));
  if (a.reopenUntil) lines.push(t("console.lifecycle.affects.reopen_until", { date: shortDay(a.reopenUntil) }));
  if (a.purgeAfter) lines.push(t("console.lifecycle.affects.purge_after", { date: shortDay(a.purgeAfter) }));
  if (p.willWrite.notification) lines.push(t("console.lifecycle.affects.notified"));
  return (
    <Section title={t("console.lifecycle.affects")}>
      {lines.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">{t("console.lifecycle.affects.none")}</p>
      ) : (
        <ul className="grid gap-1.5">
          {lines.map((l) => (
            <li key={l} className="flex items-start gap-2 text-[13px] leading-[1.45]">
              <span aria-hidden="true" className="mt-[7px] size-1.5 shrink-0 rounded-full bg-[color-mix(in_oklch,var(--foreground)_40%,transparent)]" />
              {l}
            </li>
          ))}
        </ul>
      )}
      {a.unavailable.length > 0 && <p className="text-[12px] text-muted-foreground">{t("console.lifecycle.affects.unavailable")}</p>}
    </Section>
  );
}

function Requirements({ p, armSeconds }: { p: LifecyclePreview; armSeconds: number }) {
  const t = useT();
  const r = p.requires;
  if (!r) return null;
  const chips: { key: string; icon?: ReactNode }[] = [{ key: t("console.lifecycle.req.reason") }];
  if (r.typedHandle || p.cooldown.typedHandleRequired) chips.push({ key: t("console.lifecycle.req.handle") });
  if (r.typedWord) chips.push({ key: t("console.lifecycle.req.word", { word: r.typedWord }) });
  if (r.stepUp) chips.push({ key: t("console.lifecycle.req.step_up"), icon: <ShieldCheckIcon aria-hidden="true" className="size-3" /> });
  chips.push({ key: t("console.lifecycle.req.arm", { seconds: armSeconds }), icon: <ClockIcon aria-hidden="true" className="size-3" /> });
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label={t("console.lifecycle.requires")}>
      {chips.map((c) => (
        <span key={c.key} className="inline-flex h-6 items-center gap-1 rounded-[var(--r-chip)] bg-secondary px-2 text-[11.5px] text-muted-foreground">
          {c.icon}
          {c.key}
        </span>
      ))}
    </div>
  );
}

function Choice({
  legend,
  name,
  value,
  onChange,
  options,
  problem,
  disabled,
  wide,
}: {
  legend: string;
  name: string;
  value: string | null;
  onChange(v: string): void;
  options: { value: string; label: string }[];
  problem?: string | null;
  disabled?: boolean;
  wide?: boolean;
}) {
  return (
    <fieldset className="grid gap-1.5" disabled={disabled}>
      <legend className="mb-1.5 text-[12.5px] font-medium">{legend}</legend>
      <div className={cn("grid gap-1", !wide && "sm:grid-cols-2")}>
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              "flex min-h-9 cursor-pointer items-center gap-2.5 rounded-[var(--r-control)] px-2.5 text-[13px] shadow-[inset_0_0_0_1px_var(--border)] transition-[background-color,box-shadow] duration-[var(--dur-1)] hover:bg-accent has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--ring)] has-[:disabled]:cursor-default has-[:disabled]:opacity-60 max-md:min-h-11",
              value === o.value && "bg-[color-mix(in_oklch,var(--brand)_8%,transparent)] shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--brand)_45%,transparent)]",
            )}
          >
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="size-3.5 accent-[var(--brand)]" />
            {o.label}
          </label>
        ))}
      </div>
      {problem && <p className="text-[12px] text-[var(--c-danger-ink)]">{problem}</p>}
    </fieldset>
  );
}

function Toggle({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange(v: boolean): void; label: string; hint: string; disabled?: boolean }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 rounded-[var(--r-control)] p-2.5 shadow-[inset_0_0_0_1px_var(--border)] has-[:disabled]:opacity-60 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--ring)]">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-3.5 accent-[var(--brand)]" />
      <span className="grid gap-0.5">
        <span className="text-[13px] font-medium">{label}</span>
        <span className="text-[12px] text-muted-foreground">{hint}</span>
      </span>
    </label>
  );
}

function TypedField({ id, label, value, onChange, problem, disabled }: { id: string; label: string; value: string; onChange(v: string): void; problem: string | null; disabled?: boolean }) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-[12.5px] font-medium">
        {label}
      </label>
      <input
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        dir="ltr"
        aria-invalid={!!problem || undefined}
        className="h-[var(--ctl)] w-full rounded-[var(--r-control)] bg-background px-3 font-mono text-[13px] shadow-[inset_0_0_0_1px_var(--input)] outline-none transition-shadow duration-[var(--dur-1)] focus-visible:shadow-[inset_0_0_0_1px_var(--ring),0_0_0_3px_color-mix(in_oklch,var(--ring)_22%,transparent)] disabled:opacity-60 aria-[invalid=true]:shadow-[inset_0_0_0_1px_var(--c-danger-ink)] max-md:h-11"
      />
      {problem && <p className="text-[12px] text-[var(--c-danger-ink)]">{problem}</p>}
    </div>
  );
}

function SheetSkeleton() {
  return (
    <div aria-busy="true" className={cn(styles.skeleton, "grid gap-3")}>
      <div className={cn(styles.bone, "h-3 w-1/3")} />
      <div className={cn(styles.bone, "h-20 w-full")} />
      <div className={cn(styles.bone, "h-3 w-1/4")} />
      {[70, 54, 62].map((w) => (
        <div key={w} className={cn(styles.bone, "h-3")} style={{ width: `${w}%` }} />
      ))}
    </div>
  );
}

const shortDay = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Casablanca" }).format(d);
};
