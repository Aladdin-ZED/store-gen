"use client";
/**
 * JobProgress (P7 AI; ai.md AI-§K.3 "Deep pass", AI-§A.8.8, AI-§K.5 deep rows, core D56; the R2 shell: S2 mounts it
 * on the brand screen and S1 on the store blueprint screen; the component harness renders every state now).
 *
 * A progress row for a detached AI job, fed by `useAiJob(id, ctx)` (src/lib/ai/router/client.ts): the stage
 * ("Working: reviewing"), the elapsed time, a 2 px hairline (the stage plan's share when the job reports it) and
 * Cancel. Queued says so; a job degraded to a batch says "Ready in a few minutes" (or hours); `failed` says "The deep
 * pass stopped. Your instant result is kept."; `done` renders nothing (the mount applies the result with an Undo
 * toast); `cancelled` renders nothing. The page the result applies to stays editable the whole time.
 */
import { XIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { AiJobPoll } from "@/lib/ai/router/client";
import type { MessageKey } from "@/lib/i18n/admin";
import { useT } from "@/lib/i18n/admin/client";
import { cn } from "@/lib/utils";
import { Hairline } from "./hairline";

const STAGE: Record<string, MessageKey> = {
  plan: "ai.job.stage.plan",
  brief: "ai.job.stage.plan",
  critique: "ai.job.stage.critique",
  blueprint: "ai.job.stage.blueprint",
  logo: "ai.job.stage.logo",
  report: "ai.job.stage.report",
};

/** "blueprint:2" → its base's label key. */
export function jobStageKey(stage: string | null): MessageKey {
  const base = (stage ?? "").split(":")[0] ?? "";
  return STAGE[base] ?? "ai.job.stage.other";
}

const pad = (n: number) => String(n).padStart(2, "0");
/** m:ss, or h:mm:ss past an hour (Latin digits, isolated left to right by the caller) */
export function elapsedText(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1_000));
  const h = Math.floor(s / 3_600);
  const m = Math.floor((s % 3_600) / 60);
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

export interface JobProgressProps {
  job: AiJobPoll | null;
  /** "job" or "batch" (`policy.cloud.deepTransport`); a batch says "ready in a few minutes / hours" */
  transport?: "job" | "batch";
  /** the batch's horizon: minutes (default) or hours (a job handed to the cron's one-item batches) */
  horizon?: "minutes" | "hours";
  onCancel(): void;
  className?: string;
}

export function JobProgress({ job, transport = "job", horizon = "minutes", onCancel, className }: JobProgressProps) {
  const t = useT();
  const startedAt = job?.createdAt ? Date.parse(job.createdAt) : null;
  const [now, setNow] = useState<number | null>(null);
  const live = !!job && (job.status === "queued" || job.status === "running");
  useEffect(() => {
    if (!live) return;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 1_000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [live]);

  if (!job || job.status === "done" || job.status === "cancelled") return null;
  if (job.status === "failed") {
    return (
      <div role="status" className={cn("adm-surface-flat px-4 py-3 text-[0.8125rem] text-pretty text-muted-foreground", className)}>
        {t("ai.job.failed")}
      </div>
    );
  }
  const batch = transport === "batch" || job.driver === "batch";
  const label = job.status === "queued" ? t("ai.job.queued") : batch ? t(horizon === "hours" ? "ai.job.batch_hours" : "ai.job.batch") : t("ai.job.running", { stage: t(jobStageKey(job.stage)) });
  const share = job.progress && job.progress.total > 0 ? job.progress.done / job.progress.total : null;
  const elapsed = startedAt !== null && now !== null && Number.isFinite(startedAt) ? elapsedText(now - startedAt) : null;
  return (
    <div role="status" aria-live="polite" className={cn("adm-surface-flat grid gap-2.5 px-4 py-3", className)}>
      <div className="flex items-center gap-3">
        <p className="min-w-0 flex-1 truncate text-[0.875rem] font-medium">{label}</p>
        {elapsed ? (
          <span className="shrink-0 text-[0.75rem] text-muted-foreground tabular-nums">
            {t("ai.job.elapsed", { time: "⁨" + elapsed + "⁩" })}
          </span>
        ) : null}
        <Button variant="ghost" size="sm" className="h-8 shrink-0 gap-1 px-2 text-muted-foreground" onClick={onCancel}>
          <XIcon aria-hidden="true" className="size-3.5" />
          {t("ai.job.cancel")}
        </Button>
      </div>
      <Hairline value={share} label={label} />
    </div>
  );
}
