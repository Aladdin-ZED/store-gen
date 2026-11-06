"use client";
/**
 * Settings → Danger zone on screen (P2 SHELL; platform.md PLA-§22.11, PD80; docs/STORE-SAAS.md §B.7, §F.9).
 *
 * - Export: what the ZIP holds, Request export (`requestStoreExportAction`), the newest job's progress and parts (each a
 *   24 h link that the download route re-checks with a fresh step-up), the past exports.
 * - Close: the consequences, the typed handle (`TypedConfirmDialog`), then `closeOwnStoreAction`. Reopen while closed,
 *   until the 30-day date.
 * - Leave: a confirm sheet, then the store picker. The last owner's button is disabled with the reason.
 * - Transfer: disabled, "Coming later".
 *
 * Both step-up actions run through `useActionError().run`: a `step_up` answer opens the sheet (TOTP, else the password)
 * and the very same call (the same operation id) runs once more after the proof, so a double submit is `already_done`.
 */
import { ArchiveIcon, DownloadIcon, LogOutIcon, PowerIcon, RotateCcwIcon, UsersIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/admin/common/confirm-dialog";
import { formatDay, formatUsage } from "@/components/admin/common/primitive-logic";
import { BusyButton, SettingsCard } from "@/components/admin/common/settings-kit";
import { TypedConfirmDialog } from "@/components/admin/common/typed-confirm-dialog";
import { useActionError } from "@/components/admin/shell/use-action-error";
import type { ExportJobSummary } from "@/lib/exports-store";
import { useAdminLocale, useT } from "@/lib/i18n/admin/client";
import type { ActionResult, StoreStatus } from "@/lib/tenancy/types";
import { cn } from "@/lib/utils";

/** A fresh operation id per attempt: the step-up re-run sends the same one (the server spends it once). */
const newOpId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`);
const RUNNING: ReadonlySet<string> = new Set(["pending", "running"]);

export function DangerZone({
  handle,
  storeName,
  status,
  canExport,
  canClose,
  jobs,
  partBase,
  reopenUntil,
  lastOwner,
  support,
  actions: act,
}: {
  handle: string;
  storeName: string;
  status: StoreStatus;
  canExport: boolean;
  canClose: boolean;
  jobs: ExportJobSummary[] | null;
  /** the download route's base ("/api/app/<h>/exports", P8's route); a part's own signed `href` wins */
  partBase: string;
  reopenUntil: string | null;
  lastOwner: boolean;
  support: boolean;
  actions: {
    exportData(input: { opId?: string }): Promise<ActionResult<{ jobId: string }>>;
    close(input: { confirm: string; opId?: string }): Promise<ActionResult<null>>;
    reopen(): Promise<ActionResult<{ status: StoreStatus }>>;
    leave(): Promise<ActionResult<{ href: string }>>;
  };
}) {
  const t = useT();
  const locale = useAdminLocale();
  const router = useRouter();
  const errors = useActionError();
  const [busy, setBusy] = useState<"export" | "reopen" | null>(null);
  const [closing, setClosing] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const closed = status === "closed";
  const newest = jobs?.[0] ?? null;
  const past = jobs?.slice(1) ?? [];
  // the render's clock, fixed at mount (a pure render; the page refreshes after every action)
  const [now] = useState(() => Date.now());
  const canReopen = closed && canClose && reopenUntil !== null && new Date(reopenUntil).getTime() > now;

  const requestExport = async () => {
    setBusy("export");
    const opId = newOpId();
    try {
      const res = await errors.run(() => act.exportData({ opId }));
      if (res.ok) {
        toast.success(t("shell.danger.export_started"));
        router.refresh();
      }
    } finally {
      setBusy(null);
    }
  };

  const reopen = async () => {
    setBusy("reopen");
    try {
      const res = await errors.run(() => act.reopen());
      if (res.ok) {
        toast.success(t("shell.danger.reopened"));
        router.refresh();
      }
    } finally {
      setBusy(null);
    }
  };

  // P2 merge (CCR r1-p2-7 §1): P8's summary carries a fresh signed link per part (GET /api/app/<h>/exports/<jobId>/<n>?t=…);
  // no link while the job is not ready
  const partLink = (job: ExportJobSummary, part: { n?: number; name: string; bytes: number; href?: string | null }) => (
    <li key={part.name} className="flex min-h-11 items-center gap-3 py-1.5">
      <ArchiveIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      <bdi dir="ltr" className="min-w-0 flex-1 truncate font-mono text-[13px]">
        {part.name}
      </bdi>
      <span className="text-xs text-muted-foreground tabular-nums">{formatUsage(part.bytes, "bytes", locale)}</span>
      {part.href !== null ? (
        <Button asChild variant="ghost" size="sm" className="max-md:h-11">
          <a href={part.href ?? `${partBase}/${job.id}/${part.n ?? encodeURIComponent(part.name)}`} download>
            <DownloadIcon aria-hidden="true" />
            {t("shell.danger.download")}
          </a>
        </Button>
      ) : null}
    </li>
  );

  return (
    <>
      {canExport && (
        <SettingsCard
          title={t("shell.danger.export_title")}
          description={t("shell.danger.export_lead")}
          actions={
            jobs !== null && !(newest && RUNNING.has(newest.state)) ? (
              <BusyButton variant="outline" busy={busy === "export"} onClick={() => void requestExport()} disabled={support}>
                <DownloadIcon aria-hidden="true" />
                {t("shell.danger.export_request")}
              </BusyButton>
            ) : undefined
          }
        >
          <ul className="grid gap-1 text-[13px] text-muted-foreground">
            {(["pages", "orders", "customers", "media", "audit"] as const).map((k) => (
              <li key={k} className="flex items-center gap-2">
                <span aria-hidden="true" className="size-1 rounded-full bg-muted-foreground/60" />
                {t(`shell.danger.export_has.${k}`)}
              </li>
            ))}
          </ul>
          {jobs === null ? (
            <p className="rounded-[var(--r-control)] bg-muted/50 px-3.5 py-2.5 text-[13px] text-muted-foreground">{t("shell.danger.export_unavailable")}</p>
          ) : newest ? (
            <div className="grid gap-2 rounded-[var(--r-control)] bg-muted/40 px-4 py-3">
              <p className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
                <span className="font-medium">{t(`shell.danger.export_state.${newest.state}`)}</span>
                <span className="text-muted-foreground tabular-nums">{formatDay(newest.createdAt, locale)}</span>
              </p>
              {RUNNING.has(newest.state) && (
                <div role="progressbar" aria-label={t("shell.danger.export_progress")} className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full w-1/3 animate-pulse rounded-full bg-foreground/50 motion-reduce:animate-none" />
                </div>
              )}
              {newest.state === "ready" && newest.parts.length > 0 && (
                <>
                  <ul className="grid divide-y divide-[color-mix(in_oklch,var(--foreground)_9%,transparent)]">{newest.parts.map((p) => partLink(newest, p))}</ul>
                  <p className="text-xs text-muted-foreground">
                    {t("shell.danger.export_links")}
                    {newest.expiresAt && ` ${t("shell.danger.export_until", { date: formatDay(newest.expiresAt, locale) })}`}
                  </p>
                </>
              )}
              {newest.state === "failed" && <p className="text-[13px] text-destructive-ink">{t("shell.danger.export_failed")}</p>}
            </div>
          ) : (
            <p className="text-[13px] text-muted-foreground">{t("shell.danger.export_none")}</p>
          )}
          {past.length > 0 && (
            <div className="grid gap-1.5">
              <p className="text-[13px] font-medium">{t("shell.danger.export_past")}</p>
              <ul className="grid divide-y divide-[color-mix(in_oklch,var(--foreground)_9%,transparent)]">
                {past.map((j) => (
                  <li key={j.id} className="flex min-h-10 items-center justify-between gap-3 py-1.5 text-[13px]">
                    <span className="tabular-nums">{formatDay(j.createdAt, locale)}</span>
                    <span className="text-muted-foreground">{t(`shell.danger.export_state.${j.state}`)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </SettingsCard>
      )}

      {canClose && (
        <SettingsCard
          tone="danger"
          title={t(closed ? "shell.danger.closed_title" : "shell.danger.close_title")}
          description={
            closed
              ? reopenUntil
                ? t("shell.danger.reopen_until", {
                    date: formatDay(reopenUntil, locale),
                  })
                : t("shell.danger.closed_lead")
              : t("shell.danger.close_lead")
          }
          actions={
            closed ? (
              canReopen ? (
                <BusyButton variant="outline" busy={busy === "reopen"} onClick={() => void reopen()} disabled={support}>
                  <RotateCcwIcon aria-hidden="true" />
                  {t("shell.danger.reopen")}
                </BusyButton>
              ) : undefined
            ) : (
              <Button variant="destructive" onClick={() => setClosing(true)} disabled={support} className="max-md:h-11">
                <PowerIcon aria-hidden="true" />
                {t("shell.danger.close_submit")}
              </Button>
            )
          }
        >
          {!closed && (
            <ul className="grid gap-1 text-[13px] text-muted-foreground">
              {(["pages", "orders", "reopen", "deletion"] as const).map((k) => (
                <li key={k} className="flex items-center gap-2">
                  <span aria-hidden="true" className="size-1 rounded-full bg-destructive/60" />
                  {t(`shell.danger.close_means.${k}`)}
                </li>
              ))}
            </ul>
          )}
        </SettingsCard>
      )}

      <SettingsCard
        id="leave"
        title={t("shell.danger.leave_title")}
        description={lastOwner ? t("team.leave.last_owner") : t("shell.danger.leave_lead", { store: storeName })}
        actions={
          <Button variant="outline" onClick={() => setLeaving(true)} disabled={lastOwner || support} className="max-md:h-11">
            <LogOutIcon aria-hidden="true" className="rtl:-scale-x-100" />
            {t("shell.danger.leave_submit")}
          </Button>
        }
      />

      <SettingsCard
        title={t("shell.danger.transfer_title")}
        description={t("shell.danger.transfer_lead")}
        actions={
          <Button variant="outline" disabled className={cn("max-md:h-11")}>
            <UsersIcon aria-hidden="true" />
            {t("shell.danger.transfer_later")}
          </Button>
        }
      />

      <TypedConfirmDialog
        open={closing}
        tone="danger"
        title={t("shell.danger.close_confirm", { store: storeName })}
        body={t("shell.danger.close_lead")}
        expected={handle}
        confirmLabel={t("shell.danger.close_submit")}
        onClose={() => setClosing(false)}
        onConfirm={async () => {
          const opId = newOpId();
          const res = await errors.run(() => act.close({ confirm: handle, opId }), { toastInvalid: true });
          if (res.ok) {
            setClosing(false);
            toast.success(t("shell.danger.closed_done"));
            router.refresh();
          }
        }}
      />
      <ConfirmDialog
        open={leaving}
        onOpenChange={setLeaving}
        destructive
        icon={<LogOutIcon />}
        title={t("team.leave.confirm_title", { store: storeName })}
        description={t("team.leave.confirm_lead")}
        confirmLabel={t("shell.danger.leave_submit")}
        onConfirm={async () => {
          const res = await errors.run(() => act.leave());
          if (!res.ok) return false;
          router.push(res.data.href);
        }}
      />
    </>
  );
}
