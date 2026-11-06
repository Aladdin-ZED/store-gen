"use client";
/**
 * The kill-switch sheet (platform.md PLA-§12.1, PD29, PD43): what stops and what keeps working, the tenant banner the
 * change shows (or removes) in ar / fr / en tabs (P2's exact `shell.kill.<key>` texts), the affected stores count, a
 * reason (required, ≤ 200), the typed phrase where marked (`read-only`, `stop sign-ups`), then the step-up. Opened only
 * from the card's button: never from ⌘K, a chord or a bulk path. `platform_read_only` can always be switched off.
 *
 *   <KillSheet preview={p} name="Platform read-only" onClose={…} />
 */
import { useRouter } from "next/navigation";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useId, useState } from "react";
import { toast } from "sonner";
import { setKillSwitchAction } from "@/app/admin/(console)/flags/actions";
import { useT } from "@/lib/i18n/admin/client";
import type { AdminLocale } from "@/lib/i18n/admin";
import type { KillSwitchPreview } from "@/lib/platform/flags";
import { cn } from "@/lib/utils";
import { useGuarded } from "../guarded";
import { button, ConsoleDialog, NoteField } from "../queue/decision-dialogs";

const LOCALES: readonly AdminLocale[] = ["ar", "fr", "en"];
export const KILL_REASON_LIMIT = 200;

export function KillSheet({ preview, name, onClose }: { preview: KillSwitchPreview; name: string; onClose(): void }) {
  const t = useT();
  const router = useRouter();
  const g = useGuarded("console.kill.failed");
  const typedId = useId();
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const [tab, setTab] = useState<AdminLocale>("ar");
  const [tried, setTried] = useState(false);
  const typedOk = !preview.typed || typed.trim().toLowerCase() === preview.typed;
  const reasonOk = reason.trim().length >= 1 && reason.length <= KILL_REASON_LIMIT;
  const mode = preview.tripping ? "trip" : "restore";

  const submit = async () => {
    setTried(true);
    if (!typedOk || !reasonOk) return;
    await g.run(
      (opId) => setKillSwitchAction({ key: preview.key, value: preview.to, reason: reason.trim(), typed: preview.typed ? typed.trim() : undefined, opId }),
      () => {
        toast.success(t(`console.kill.sheet.done_${mode}`, { name }));
        onClose();
        router.refresh();
      },
    );
  };

  return (
    <>
      <ConsoleDialog
        open
        onOpenChange={(o) => !o && onClose()}
        title={t(`console.kill.sheet.title_${mode}`, { name })}
        description={t(`console.kill.sheet.lead_${mode}`)}
        footer={
          <>
            <DialogPrimitive.Close className={cn(button.base, button.ghost)}>{t("console.dialog.cancel")}</DialogPrimitive.Close>
            <button type="button" disabled={g.busy || (tried && (!typedOk || !reasonOk))} onClick={() => void submit()} className={cn(button.base, preview.tripping ? button.dangerSolid : button.primary)}>
              {t(`console.kill.sheet.confirm_${mode}`)}
            </button>
          </>
        }
      >
        {preview.tripping && (
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid content-start gap-1 rounded-[var(--r-control)] bg-[var(--c-danger-soft)] px-3 py-2.5">
              <span className="text-[11.5px] font-medium text-[var(--c-danger-ink)]">{t("console.kill.sheet.stops")}</span>
              <p className="text-[12.5px] leading-[1.5]">{t(preview.stops)}</p>
            </div>
            <div className="grid content-start gap-1 rounded-[var(--r-control)] bg-[var(--c-success-soft)] px-3 py-2.5">
              <span className="text-[11.5px] font-medium">{t("console.kill.sheet.keeps")}</span>
              <p className="text-[12.5px] leading-[1.5]">{t(preview.keeps)}</p>
            </div>
          </div>
        )}

        <p className="text-[12.5px]">
          {preview.affectedStores === null ? (
            t("console.kill.sheet.affected_none")
          ) : (
            <>
              <span className="num font-semibold">{preview.affectedStores.toLocaleString("en-US")}</span> {t(`console.kill.sheet.affected_${mode}`, { count: preview.affectedStores })}
            </>
          )}
        </p>

        <section aria-label={t("console.kill.sheet.banner")} className="grid gap-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11.5px] font-medium text-muted-foreground">{t(`console.kill.sheet.banner_${mode}`)}</span>
            <div role="tablist" aria-label={t("console.kill.sheet.banner")} className="inline-flex rounded-[var(--r-control)] bg-secondary p-0.5">
              {LOCALES.map((l) => (
                <button
                  key={l}
                  type="button"
                  role="tab"
                  aria-selected={tab === l}
                  onClick={() => setTab(l)}
                  className={cn("h-6 rounded-[calc(var(--r-control)-2px)] px-2.5 font-mono text-[11px] uppercase outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] max-md:h-9", tab === l ? "bg-card font-semibold shadow-sm" : "text-muted-foreground")}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
          <p role="tabpanel" dir={tab === "ar" ? "rtl" : "ltr"} lang={tab} className={cn("rounded-[var(--r-control)] px-3 py-2.5 text-[13px] leading-[1.55]", preview.tripping ? "bg-[var(--c-warn-soft)]" : "bg-secondary text-muted-foreground line-through")}>
            {preview.banner[tab]}
          </p>
          {preview.bannerFallback && <p className="text-[11.5px] text-muted-foreground">{t("console.kill.sheet.banner_fallback")}</p>}
        </section>

        <NoteField label={t("console.kill.sheet.reason")} value={reason} onChange={setReason} max={KILL_REASON_LIMIT} required rows={2} autoFocus problem={tried && !reasonOk ? t("console.kill.reason_required") : null} />

        {preview.typed && (
          <div className="grid gap-1.5">
            <label htmlFor={typedId} className="text-[12.5px] font-medium">
              {t("console.kill.sheet.type")} <span className="rounded-[4px] bg-secondary px-1.5 py-0.5 font-mono text-[12px]">{preview.typed}</span>
            </label>
            <input
              id={typedId}
              dir="ltr"
              autoComplete="off"
              spellCheck={false}
              value={typed}
              aria-invalid={(tried && !typedOk) || undefined}
              onChange={(e) => setTyped(e.target.value)}
              className="h-[var(--ctl)] w-full rounded-[var(--r-control)] bg-background px-3 font-mono text-[13px] shadow-[inset_0_0_0_1px_var(--input)] outline-none focus-visible:shadow-[inset_0_0_0_1px_var(--ring),0_0_0_3px_color-mix(in_oklch,var(--ring)_22%,transparent)] aria-[invalid=true]:shadow-[inset_0_0_0_1px_var(--c-danger-ink)] max-md:h-11"
            />
            {tried && !typedOk && <p className="text-[12px] text-[var(--c-danger-ink)]">{t("console.kill.typed_mismatch")}</p>}
          </div>
        )}
        <p className="text-[12px] text-muted-foreground">{t("console.kill.sheet.step_up")}</p>
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
