"use client";
/**
 * JobChip (P2 SHELL; platform.md PLA-§22.12, §22.8 `job_queued`, PD63; docs/STORE-SAAS.md §H.12, D56): the topbar's
 * background-job indicator fed by `pulse.jobs`. While jobs run: "Working in the background" with a quiet, static ring
 * (the count for assistive tech). When a job finishes: "Ready · Open" per job for 60 s, then it dismisses itself
 * (`onDismiss`), and opening it dismisses it too. Nothing renders without jobs.
 *
 * Props frozen at PLA-§22.12 (src/lib/contracts/r1-p0b-platform.ts). P0b placed the file in common/ (the brief's
 * shell/job-chip.tsx path is P0b's to decide); the shell's topbar mounts it.
 */
import { CircleCheckIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, type ReactElement } from "react";
import { useT } from "@/lib/i18n/admin/client";
import { cn } from "@/lib/utils";
import { FOCUS_RING, TOUCH } from "./ui-classes";

export interface JobChipProps {
  running: number;
  done: { id: string; label: string; href: string }[];
  onDismiss(id: string): void;
}

/** How long a finished job's "Ready · Open" stays (PLA-§22.8). */
export const JOB_READY_MS = 60_000;

const CHIP = "inline-flex h-8 items-center gap-2 rounded-full px-3 text-xs font-medium ring-1 ring-inset";

export function JobChip(p: JobChipProps): ReactElement | null {
  const t = useT();
  // one 60 s timer per finished job, started when it first appears
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const dismiss = useRef(p.onDismiss);
  dismiss.current = p.onDismiss;
  const ids = p.done.map((j) => j.id).join("|");
  useEffect(() => {
    const live = new Set(ids ? ids.split("|") : []);
    for (const id of live) {
      if (!timers.current.has(id)) timers.current.set(id, setTimeout(() => dismiss.current(id), JOB_READY_MS));
    }
    for (const [id, timer] of timers.current) {
      if (!live.has(id)) {
        clearTimeout(timer);
        timers.current.delete(id);
      }
    }
  }, [ids]);
  useEffect(() => {
    const map = timers.current;
    return () => {
      for (const timer of map.values()) clearTimeout(timer);
      map.clear();
    };
  }, []);

  if (p.running <= 0 && !p.done.length) return null;
  return (
    <div role="status" aria-live="polite" className="flex flex-wrap items-center gap-1.5">
      {p.running > 0 && (
        <span className={cn(CHIP, "bg-card text-muted-foreground ring-border")}>
          <svg aria-hidden="true" viewBox="0 0 16 16" className="size-3.5 text-brand">
            <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2" />
            <path d="M8 2a6 6 0 0 1 6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span>{t("shell.jobs.working")}</span>
          <span className="sr-only">. {t("shell.jobs.running", { count: p.running })}</span>
        </span>
      )}
      {p.done.map((job) => (
        <span key={job.id} className={cn(CHIP, "gap-1 bg-success-soft pe-1 text-success-ink ring-success/20")}>
          <CircleCheckIcon aria-hidden="true" className="size-3.5" />
          <span className="max-w-40 truncate">
            {t("shell.jobs.ready")} · {job.label}
          </span>
          <Link href={job.href} onClick={() => p.onDismiss(job.id)} className={cn("rounded-full px-2 py-0.5 font-semibold underline-offset-4 hover:underline", FOCUS_RING, TOUCH, "max-md:inline-flex max-md:items-center")}>
            {t("shell.jobs.open")}
          </Link>
          <button
            type="button"
            aria-label={t("shell.jobs.dismiss")}
            onClick={() => p.onDismiss(job.id)}
            className={cn("grid size-6 place-items-center rounded-full opacity-70 hover:opacity-100", FOCUS_RING, TOUCH)}
          >
            <XIcon aria-hidden="true" className="size-3" />
          </button>
        </span>
      ))}
    </div>
  );
}
