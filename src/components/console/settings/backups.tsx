"use client";
/**
 * `/admin/settings/backups` (platform.md PLA-§17, OS-10; core §H.6): the runs (P8's `backup_runs`), the retention
 * (`platform_backup`, ↑), Download with a reason (↑ first, then the browser follows the archive URL whose guard checks
 * the step-up again and records the reason), the reminder line and the restore procedure's place.
 */
import { DownloadIcon } from "lucide-react";
import { useState } from "react";
import { prepareBackupDownloadAction, saveBackupRetentionAction } from "@/app/admin/(console)/settings/actions";
import { useT } from "@/lib/i18n/admin/client";
import type { BackupsView } from "@/lib/platform/backups";
import { cn } from "@/lib/utils";
import { Ago } from "../ago";
import { bytesText, durationText } from "../format";
import { useGuarded } from "../guarded";
import { PanelError, PanelUnavailable } from "../panel";
import { ConsoleDialog } from "../queue/decision-dialogs";
import { Banner, button, card, EmptyLine, Field, inputCls, SaveBar, SettingsCard, StatusText, td, th, useSave } from "../kit";

const REASONS = ["offsite_copy", "restore_test", "incident", "other"] as const;
type Run = Extract<BackupsView["runs"], { state: "ok" }>["data"][number];

export function Backups({ view, canManage }: { view: BackupsView; canManage: boolean }) {
  const t = useT();
  const [pick, setPick] = useState<Run | null>(null);
  const runs = view.runs;
  return (
    <div className="grid gap-4">
      {view.remind && <Banner tone="warn">{view.daysSinceDownload === null ? t("console.backups.remind_never") : t("console.backups.remind", { days: view.daysSinceDownload })}</Banner>}
      <section aria-label={t("console.backups.runs")} className={card}>
        <div className="flex flex-wrap items-center gap-2 px-4 pt-4 pb-3 md:px-5">
          <div className="grid min-w-0 flex-1 gap-0.5">
            <h2 className="text-[14px] font-semibold tracking-[-0.006em]">{t("console.backups.runs")}</h2>
            <p className="text-[12.5px] text-muted-foreground">{view.lastDownloadAt ? t("console.backups.last_download", { date: view.lastDownloadAt.slice(0, 10) }) : t("console.backups.never_downloaded")}</p>
          </div>
        </div>
        {runs.state !== "ok" ? (
          <div className="border-t border-[var(--c-hairline)] p-4">{runs.state === "error" ? <PanelError reference={runs.ref} compact /> : <PanelUnavailable text={t("console.backups.unavailable")} />}</div>
        ) : runs.data.length === 0 ? (
          <EmptyLine>{t("console.backups.empty")}</EmptyLine>
        ) : (
          <div className="overflow-x-auto border-t border-[var(--c-hairline)]">
            <table className="w-full min-w-[760px]">
              <thead>
                <tr className="border-b border-[var(--c-hairline)]">
                  <th className={th}>{t("console.backups.day")}</th>
                  <th className={th}>{t("console.backups.kind")}</th>
                  <th className={th}>{t("console.backups.state")}</th>
                  <th className={cn(th, "text-end")}>{t("console.backups.size")}</th>
                  <th className={cn(th, "text-end")}>{t("console.backups.tables")}</th>
                  <th className={cn(th, "text-end")}>{t("console.backups.duration")}</th>
                  <th className={th}>{t("console.backups.error")}</th>
                  <th className={th}>
                    <span className="sr-only">{t("console.backups.download")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {runs.data.map((r) => (
                  <tr key={r.id} className="border-b border-[var(--c-hairline)] last:border-0">
                    <td className={cn(td, "num font-medium")}>{r.day}</td>
                    <td className={td}>{t(`console.backups.kind.${r.kind}`)}</td>
                    <td className={td}>
                      <StatusText tone={r.state === "done" ? "ok" : r.state === "failed" ? "danger" : "info"}>{t(`console.backups.state.${r.state}`)}</StatusText>
                    </td>
                    <td className={cn(td, "num text-end")}>{r.bytes === null ? "—" : bytesText(r.bytes)}</td>
                    <td className={cn(td, "num text-end")}>{r.tables.length || "—"}</td>
                    <td className={cn(td, "num text-end text-muted-foreground")}>{r.doneAt ? (durationText(Date.parse(r.doneAt) - Date.parse(r.startedAt)) ?? "—") : <Ago iso={r.startedAt} />}</td>
                    <td className={cn(td, "max-w-[200px] truncate font-mono text-[11.5px] text-[var(--c-danger-ink)]")} title={r.error ?? undefined}>
                      {r.error ?? ""}
                    </td>
                    <td className={cn(td, "w-px text-end")}>
                      {canManage && r.state === "done" && (
                        <button type="button" onClick={() => setPick(r)} className={cn(button.base, button.secondary, "h-8")}>
                          <DownloadIcon aria-hidden="true" className="size-3.5" />
                          {t("console.backups.download")}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <Retention daily={view.retention.daily} weekly={view.retention.weekly} canManage={canManage} />
        <SettingsCard title={t("console.backups.restore")} lead={t("console.backups.restore_lead")}>
          <p className="text-[12.5px] text-muted-foreground">{t("console.backups.restore_where")}</p>
        </SettingsCard>
      </div>
      {pick && <DownloadDialog run={pick} onClose={() => setPick(null)} />}
    </div>
  );
}

function Retention({ daily, weekly, canManage }: { daily: number; weekly: number; canManage: boolean }) {
  const t = useT();
  const save = useSave();
  const [v, setV] = useState({ daily: String(daily), weekly: String(weekly) });
  const d = Number(v.daily);
  const w = Number(v.weekly);
  const ok = Number.isInteger(d) && d >= 3 && d <= 30 && Number.isInteger(w) && w >= 1 && w <= 12;
  return (
    <SettingsCard
      title={t("console.backups.retention")}
      lead={t("console.backups.retention_lead")}
      footer={canManage ? <SaveBar save={save} dirty={d !== daily || w !== weekly} disabled={!ok} onSave={() => save.save((opId) => saveBackupRetentionAction({ daily: d, weekly: w, opId }), t("console.settings.saved"))} onReset={() => setV({ daily: String(daily), weekly: String(weekly) })} /> : undefined}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("console.backups.daily")} hint={t("console.backups.daily_hint")}>
          {(id, dd) => <input id={id} aria-describedby={dd} disabled={!canManage} inputMode="numeric" value={v.daily} onChange={(e) => setV({ ...v, daily: e.target.value })} className={cn(inputCls, "num max-w-28")} />}
        </Field>
        <Field label={t("console.backups.weekly")} hint={t("console.backups.weekly_hint")}>
          {(id, dd) => <input id={id} aria-describedby={dd} disabled={!canManage} inputMode="numeric" value={v.weekly} onChange={(e) => setV({ ...v, weekly: e.target.value })} className={cn(inputCls, "num max-w-28")} />}
        </Field>
      </div>
      {!ok && <p className="text-[12px] text-[var(--c-danger-ink)]">{t("console.backups.retention_invalid")}</p>}
    </SettingsCard>
  );
}

function DownloadDialog({ run, onClose }: { run: Run; onClose(): void }) {
  const t = useT();
  const g = useGuarded();
  const [reason, setReason] = useState<(typeof REASONS)[number] | "">("");
  return (
    <ConsoleDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t("console.backups.download_title", { day: run.day })}
      description={t("console.backups.download_lead")}
      footer={
        <>
          {g.problem && <p className="me-auto text-[12px] text-[var(--c-danger-ink)]">{g.problem}</p>}
          <button type="button" onClick={onClose} className={cn(button.base, button.secondary)}>
            {t("console.form.cancel")}
          </button>
          <button
            type="button"
            disabled={!reason || g.busy}
            onClick={() =>
              void g.run(
                () => prepareBackupDownloadAction({ day: run.day, reason }),
                (d) => {
                  window.location.assign(d.url);
                  onClose();
                },
              )
            }
            className={cn(button.base, button.primary)}
          >
            <DownloadIcon aria-hidden="true" className="size-3.5" />
            {t("console.backups.download")}
          </button>
          {g.sheet}
        </>
      }
    >
      <fieldset className="grid gap-2">
        <legend className="mb-1.5 text-[12.5px] font-medium">{t("console.backups.reason")}</legend>
        {REASONS.map((r) => (
          <label key={r} className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-[var(--r-control)] px-3 text-[13px] shadow-[inset_0_0_0_1px_var(--border)] has-[:checked]:shadow-[inset_0_0_0_1.5px_var(--brand)] max-md:min-h-11">
            <input type="radio" name="reason" value={r} checked={reason === r} onChange={() => setReason(r)} className="size-4 accent-[var(--brand)]" />
            {t(`console.backups.reason.${r}`)}
          </label>
        ))}
      </fieldset>
      <p className="text-[12px] text-muted-foreground">{t("console.backups.download_note")}</p>
    </ConsoleDialog>
  );
}
