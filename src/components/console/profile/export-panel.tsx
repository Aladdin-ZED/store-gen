"use client";
/**
 * Export from the profile (platform.md PLA-§7.14, PL-09, PD27; core §F.9): super_admin only.
 *   - ExportDialog (⋯ → Export data): a reason (legal request · owner's request · abuse · support · other + note) →
 *     `requestPlatformExportAction` (`stores.close` ↑; the step-up sheet re-sends the same opId) → P8's export job;
 *     the store's owners are notified (`store.export_by_platform`).
 *   - ExportPanel: the store's export jobs with their state (pending / running with the part count / ready / failed)
 *     and, while ready, the signed staff download links (24 h, `?e=&t=`, each download audited).
 *
 *   <ExportDialog open storeId={id} store="Souk Nour" onOpenChange={…} />
 *   <ExportPanel jobs={jobs} />
 */
import { DownloadIcon, PackageIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useId, useState } from "react";
import { toast } from "sonner";
import { requestPlatformExportAction } from "@/app/admin/(console)/stores/[id]/actions";
import { StepUpSheet } from "@/components/admin/common/step-up-sheet";
import { useT } from "@/lib/i18n/admin/client";
import type { PlatformExportJob } from "@/lib/platform/exports";
import { cn } from "@/lib/utils";
import { Ago } from "../ago";
import { bytesText } from "../format";
import { newOpId } from "../op";
import { button, ConsoleDialog, NoteField } from "../queue/decision-dialogs";

/** src/lib/platform/exports.ts EXPORT_REASONS (the selftest keeps them equal) */
export const EXPORT_REASON_LIST = ["legal_request", "owner_request", "abuse", "support", "other"] as const;
type ExportReason = (typeof EXPORT_REASON_LIST)[number];
const NOTE_MAX = 500;

export function ExportDialog({ open, onOpenChange, storeId, store }: { open: boolean; onOpenChange(o: boolean): void; storeId: string; store: string }) {
  const t = useT();
  const router = useRouter();
  const name = useId();
  const [opId] = useState(newOpId);
  const [reason, setReason] = useState<ExportReason | null>(null);
  const [note, setNote] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stepUp, setStepUp] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const noteNeeded = reason === "other";

  const send = async () => {
    if (!reason) return;
    setBusy(true);
    setProblem(null);
    const r = await requestPlatformExportAction({ storeId, reason, note: note.trim() || undefined, opId }).catch(() => ({ ok: false as const, error: "server", message: undefined }));
    setBusy(false);
    if (r.ok) {
      toast.success(t("console.export.requested", { store }));
      onOpenChange(false);
      router.refresh();
      return;
    }
    if (r.error === "step_up") {
      setStepUp(true);
      return;
    }
    setProblem(r.message ? t(r.message) : t(r.error === "unavailable" ? "console.action.unavailable" : "console.export.failed"));
  };

  const submit = () => {
    setTried(true);
    if (!reason || (noteNeeded && !note.trim()) || note.length > NOTE_MAX) return;
    void send();
  };

  return (
    <>
      <ConsoleDialog
        open={open}
        onOpenChange={onOpenChange}
        title={t("console.export.title", { store })}
        description={t("console.export.lead")}
        footer={
          <>
            <DialogPrimitive.Close className={cn(button.base, button.ghost)}>{t("console.dialog.cancel")}</DialogPrimitive.Close>
            <button type="button" disabled={busy} onClick={submit} className={cn(button.base, button.primary)}>
              {busy ? t("console.export.requesting") : t("console.export.submit")}
            </button>
          </>
        }
      >
        <fieldset className="grid gap-1.5">
          <legend className="mb-1.5 text-[12.5px] font-medium">{t("console.export.reason")}</legend>
          <div className="grid gap-1 sm:grid-cols-2">
            {EXPORT_REASON_LIST.map((r) => (
              <label
                key={r}
                className={cn(
                  "flex min-h-9 cursor-pointer items-center gap-2.5 rounded-[var(--r-control)] px-2.5 text-[13px] shadow-[inset_0_0_0_1px_var(--border)] transition-[background-color,box-shadow] duration-[var(--dur-1)] hover:bg-accent has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--ring)] max-md:min-h-11",
                  reason === r && "bg-[color-mix(in_oklch,var(--brand)_8%,transparent)] shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--brand)_45%,transparent)]",
                )}
              >
                <input type="radio" name={name} value={r} checked={reason === r} onChange={() => setReason(r)} className="size-3.5 accent-[var(--brand)]" />
                {t(`console.export.reason.${r}`)}
              </label>
            ))}
          </div>
          {tried && !reason && <p className="text-[12px] text-[var(--c-danger-ink)]">{t("console.export.invalid")}</p>}
        </fieldset>
        <NoteField label={t("console.export.note")} value={note} onChange={setNote} max={NOTE_MAX} required={noteNeeded} problem={tried && noteNeeded && !note.trim() ? t("console.export.note_required") : null} rows={2} />
        <p className="text-[12.5px] text-muted-foreground">{t("console.export.owners_told")}</p>
        {problem && (
          <p role="alert" className="text-[12.5px] text-[var(--c-danger-ink)]">
            {problem}
          </p>
        )}
      </ConsoleDialog>
      <StepUpSheet
        open={stepUp}
        surface="console"
        method="totp"
        onClose={() => setStepUp(false)}
        onVerified={() => {
          setStepUp(false);
          void send();
        }}
      />
    </>
  );
}

const STATE_TINT: Record<string, string> = {
  pending: "bg-secondary text-muted-foreground",
  running: "bg-[color-mix(in_oklch,var(--brand)_10%,transparent)] text-[var(--c-brand-ink)]",
  ready: "bg-[var(--c-success-soft)] text-[oklch(0.42_0.1_160)] dark:text-[oklch(0.82_0.1_160)]",
  failed: "bg-[var(--c-danger-soft)] text-[var(--c-danger-ink)]",
  expired: "bg-secondary text-muted-foreground",
};

/** The store's platform export jobs (newest first), with the signed links of a ready one. */
export function ExportPanel({ jobs }: { jobs: PlatformExportJob[] }) {
  const t = useT();
  if (!jobs.length) return null;
  return (
    <section aria-label={t("console.export.panel")} className="grid gap-0 rounded-[var(--r-card)] bg-card shadow-[inset_0_0_0_1px_var(--c-hairline)]">
      <div className="flex min-h-11 items-center gap-2 border-b border-[var(--c-hairline)] px-4">
        <PackageIcon aria-hidden="true" className="size-4 text-muted-foreground" />
        <h2 className="text-[13px] font-semibold tracking-[-0.006em]">{t("console.export.panel")}</h2>
      </div>
      <ul className="grid">
        {jobs.slice(0, 5).map((j) => (
          <li key={j.id} className="grid gap-2 border-b border-[var(--c-hairline)] px-4 py-3 last:border-b-0 sm:flex sm:items-center sm:gap-3">
            <span className={cn("inline-flex h-6 w-fit shrink-0 items-center rounded-[var(--r-chip)] px-2 text-[11.5px] font-medium", STATE_TINT[j.state] ?? STATE_TINT.pending)}>{t(`console.export.state.${j.state}`)}</span>
            <span className="min-w-0 flex-1 text-[12.5px] text-muted-foreground">
              {j.requestedAs === "platform" ? t("console.export.by_platform") : t("console.export.by_store")} · <Ago iso={j.createdAt} />
              {j.state === "running" && j.parts.length > 0 && <> · {t("console.export.parts", { count: j.parts.length })}</>}
              {j.state === "failed" && j.error && <> · {j.error}</>}
            </span>
            {j.links.length > 0 && (
              <span className="flex flex-wrap gap-1.5">
                {j.links.map((l) => (
                  <a key={l.name} href={l.href} className={cn(button.base, button.secondary, "h-7 px-2 text-[12px]")} download>
                    <DownloadIcon aria-hidden="true" className="size-3.5" />
                    <bdi dir="ltr" className="font-mono text-[11.5px]">
                      {l.name}
                    </bdi>
                    <span className="num text-muted-foreground">{bytesText(l.bytes)}</span>
                  </a>
                ))}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
