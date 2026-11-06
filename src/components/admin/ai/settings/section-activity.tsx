"use client";
/**
 * Settings → AI, the last three blocks (P7 AI; ai.md AI-§K.1 6, 7, AI-§E.6; D56): Privacy (the disclosure and the
 * subprocessor line), Recent AI activity (the last 20 runs as metadata: kind, where, status, credits, time; never a
 * text) and the staff-only detached-job probe card (platform staff in their own session, never under "View as store",
 * never rendered for a seller).
 */
import { ActivityIcon, BookTextIcon, CloudIcon, CpuIcon, ShieldCheckIcon, TimerIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SettingsSection } from "@/components/admin/settings/form-kit";
import type { ActivityRow, AiSettingsView } from "@/lib/ai/settings/view";
import { useT } from "@/lib/i18n/admin/client";
import { appHref } from "@/lib/urls";
import { cn } from "@/lib/utils";
import { runProbeAction } from "@/app/app/[store]/settings/ai/actions";
import { newKey, SaveError, useFormat, type SavedState } from "./controls";

export function PrivacySection() {
  const t = useT();
  return (
    <SettingsSection id="ai-privacy" title={t("ai.settings.privacy.title")}>
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-lg bg-foreground/[0.04] text-muted-foreground ring-1 ring-foreground/[0.06]">
          <ShieldCheckIcon className="size-4" />
        </span>
        <div className="grid min-w-0 gap-1.5">
          <p className="text-[0.875rem] leading-relaxed text-pretty">{t("ai.settings.privacy")}</p>
          <p className="text-[0.8125rem] text-muted-foreground">{t("ai.settings.privacy.sub")}</p>
        </div>
      </div>
    </SettingsSection>
  );
}

const PROVIDER = { server: { icon: CloudIcon, key: "ai.chip.cloud" }, local: { icon: CpuIcon, key: "ai.chip.local" }, library: { icon: BookTextIcon, key: "ai.chip.library" } } as const;

function StatusDot({ status }: { status: ActivityRow["status"] }) {
  return <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", status === "ok" ? "bg-[var(--success)]" : status === "running" ? "animate-pulse bg-foreground/60 motion-reduce:animate-none" : "bg-foreground/30")} />;
}

export function ActivitySection({ view }: { view: AiSettingsView }) {
  const t = useT();
  const f = useFormat();
  const rows = view.activity;
  return (
    <SettingsSection id="ai-activity" title={t("ai.settings.activity.title")} description={t("ai.settings.activity.lede")}>
      {rows.length === 0 ? (
        <div className="grid gap-4">
          <div aria-hidden="true" className="grid gap-px overflow-hidden rounded-xl opacity-60 ring-1 ring-foreground/[0.05] [mask-image:linear-gradient(to_bottom,black,transparent)]">
            {[0.4, 0.55, 0.32].map((w, i) => (
              <div key={i} className="flex items-center gap-3 bg-foreground/[0.02] px-3.5 py-3">
                <span className="size-1.5 rounded-full bg-foreground/15" />
                <span className="h-2.5 rounded-full bg-foreground/[0.07]" style={{ width: `${w * 100}%` }} />
                <span className="ms-auto h-2.5 w-10 rounded-full bg-foreground/[0.07]" />
              </div>
            ))}
          </div>
          <div className="grid gap-1">
            <p className="text-[0.875rem] font-medium text-pretty">{t("ai.settings.activity.empty")}</p>
            <p className="text-[0.8125rem] text-muted-foreground">{t("ai.settings.activity.empty_teach")}</p>
          </div>
          <Button asChild variant="outline" className="h-11 justify-self-start px-4 sm:h-9">
            <Link href={appHref(view.handle, "/generate")}>{t("ai.settings.activity.create")}</Link>
          </Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl ring-1 ring-foreground/[0.06]">
          <div aria-hidden="true" className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.2fr)_5rem_4.5rem_6rem] gap-3 bg-foreground/[0.03] px-3.5 py-2 text-[0.6875rem] font-medium tracking-[0.02em] text-muted-foreground md:grid">
            <span>{t("ai.settings.activity.kind")}</span>
            <span>{t("ai.settings.activity.where")}</span>
            <span>{t("ai.settings.activity.when")}</span>
            <span className="text-end">
              {t("ai.settings.activity.credits")}
            </span>
            <span className="text-end">
              {t("ai.settings.activity.time")}
            </span>
            <span />
          </div>
          <ul className="grid gap-px">
            {rows.map((r) => {
              const P = PROVIDER[r.provider];
              return (
                <li key={r.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 bg-foreground/[0.015] px-3.5 py-2.5 text-[0.8125rem] md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.2fr)_5rem_4.5rem_6rem]">
                  <span className="flex min-w-0 items-center gap-2 font-medium">
                    <StatusDot status={r.status} />
                    <span className="truncate">{t(`ai.settings.group.${r.group}`)}</span>
                  </span>
                  <span className="inline-flex min-w-0 items-center gap-1.5 text-muted-foreground max-md:order-3">
                    <P.icon aria-hidden="true" className="size-3.5 shrink-0" />
                    <span className="truncate">{t(P.key)}</span>
                  </span>
                  <span className="truncate text-muted-foreground max-md:order-2 max-md:text-end">{f.when(r.at)}</span>
                  <span className="text-end text-muted-foreground tabular-nums max-md:order-4">{r.credits > 0 ? t("ai.settings.credits.n", { n: f.int(r.credits) }) : t("ai.settings.activity.free")}</span>
                  <span className="hidden text-end text-muted-foreground tabular-nums md:block">{r.ms === null ? "" : f.ms(r.ms)}</span>
                  <span className="hidden truncate text-end text-[0.75rem] text-muted-foreground md:block">{t(`ai.settings.activity.status.${r.status}`)}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </SettingsSection>
  );
}

/** D56: the probe job for qa:detached-job-probe. Rendered only when the page says the viewer is staff in their own session. */
export function ProbeCard() {
  const t = useT();
  const [state, setState] = useState<SavedState>({ pending: false, error: null, retry: null });
  const [jobId, setJobId] = useState<string | null>(null);
  const run = (key = newKey()) => {
    setState({ pending: true, error: null, retry: null });
    void runProbeAction({ key })
      .then((r) => {
        if (r.ok) {
          setJobId(r.data.jobId);
          setState({ pending: false, error: null, retry: null });
        } else setState({ pending: false, error: r.message ? t(r.message) : t("ai.settings.error"), retry: () => run(key) });
      })
      .catch(() => setState({ pending: false, error: t("ai.settings.error"), retry: () => run(key) }));
  };
  return (
    <SettingsSection
      id="ai-probe"
      className="border border-dashed border-foreground/15 bg-transparent shadow-none"
      title={
        <span className="flex items-center gap-2">
          <TimerIcon aria-hidden="true" className="size-4 text-muted-foreground" />
          {t("ai.settings.probe.title")}
          <span className="rounded-full bg-foreground/[0.06] px-2 py-px text-[0.6875rem] font-medium text-muted-foreground">{t("ai.settings.probe.staff")}</span>
        </span>
      }
      description={t("ai.settings.probe.body")}
    >
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" className="h-11 px-4 sm:h-9" disabled={state.pending} onClick={() => run()}>
          <ActivityIcon aria-hidden="true" className="size-4" />
          {t("ai.settings.probe.run")}
        </Button>
        {jobId && (
          <p role="status" className="font-mono text-[0.8125rem] text-muted-foreground">
            {t("ai.settings.probe.started", { id: jobId })}
          </p>
        )}
        <SaveError state={state} />
      </div>
    </SettingsSection>
  );
}
