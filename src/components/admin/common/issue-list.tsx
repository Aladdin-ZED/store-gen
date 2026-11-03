"use client";
/**
 * IssueRow and IssueList (P2 SHELL; platform.md PLA-§22.12, §22.16, §10.2, PD66, PD67; docs/STORE-SAAS.md §I.7): the
 * Store Health issues.
 *
 * - **IssueRow**: the severity as a text label with its icon (Fix now / Should fix / Suggestion), the issue's sentence
 *   with its evidence numbers and the sample size in `<bdi>`, the fix as one button (absent without `onFix`, i.e.
 *   without the permission; wrapped in a `LockedControl` when `disabled` gives a reason or the viewer is impersonating),
 *   "Snooze 7 days" as a quiet secondary action, and for the console's staff view who snoozed it and until when.
 * - **IssueList**: the unsnoozed issues sorted by points (then severity), at most `max` (5), or the empty sentence
 *   `emptyKey`; "n snoozed" opens the snoozed list in place. `children` replaces the default row (the dashboard passes
 *   rows wired to its actions); the default row is read-only.
 *
 * A client component: `children` is a render function, so the list is mounted from client code. Props frozen at
 * PLA-§22.12 (src/lib/contracts/r1-p0b-platform.ts).
 */
import { CircleCheckIcon, LightbulbIcon, Loader2Icon, OctagonAlertIcon, TriangleAlertIcon, type LucideIcon } from "lucide-react";
import { useId, useState, type ReactElement, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { StoreRole } from "@/lib/auth/permissions";
import type { HealthFix, HealthIssue } from "@/lib/health/types";
import { translator } from "@/lib/i18n/admin";
import { useAdminLocale, useT } from "@/lib/i18n/admin/client";
import type { MessageKey } from "@/lib/tenancy/types";
import { cn } from "@/lib/utils";
import { evidenceVars } from "./honest";
import { LockedControl, type LockReason } from "./locked-control";
import { formatDay, issueBuckets } from "./primitive-logic";
import { FOCUS_RING, TOUCH } from "./ui-classes";
import { useViewerFlags } from "./viewer-flags";

export interface IssueRowProps {
  issue: HealthIssue;
  locale: "ar" | "fr" | "en";
  onFix?(fix: HealthFix): void;
  onSnooze?(): Promise<void>;
  disabled?: LockReason | null;
  staffView?: { snoozedBy: StoreRole | null };
}

export interface IssueListProps {
  issues: HealthIssue[];
  max: 5;
  snoozed: Record<string, string>;
  emptyKey: MessageKey;
  children?: (issue: HealthIssue) => ReactNode;
}

const SEVERITY: Record<1 | 2 | 3, { Icon: LucideIcon; cls: string }> = {
  3: { Icon: OctagonAlertIcon, cls: "bg-destructive-soft text-destructive-ink" },
  2: { Icon: TriangleAlertIcon, cls: "bg-warn-soft text-warn-ink" },
  1: { Icon: LightbulbIcon, cls: "bg-info-soft text-info-ink" },
};

/** "28d" → 28 (the evidence window as days), else null (a window the sentence cannot name). */
function windowDays(window: string): number | null {
  const m = /^(\d{1,3})d$/.exec(window.trim());
  return m ? Number(m[1]) : null;
}

export function IssueRow(p: IssueRowProps): ReactElement | null {
  const t = translator(p.locale);
  const { impersonating } = useViewerFlags();
  const [snoozing, setSnoozing] = useState(false);
  const [snoozed, setSnoozed] = useState(false);
  const sev = SEVERITY[p.issue.severity] ?? SEVERITY[1];
  const vars = evidenceVars(p.issue.evidence);
  const days = windowDays(p.issue.evidence.window);
  const lock: LockReason | null = impersonating ? { kind: "impersonation" } : (p.disabled ?? null);
  const fixLabel = t(p.issue.fix.label);
  const fixButton = (
    <Button type="button" variant="outline" size="lg" className={cn(FOCUS_RING, TOUCH)} onClick={lock ? undefined : () => p.onFix?.(p.issue.fix)}>
      {fixLabel}
    </Button>
  );
  return (
    <div data-issue={p.issue.id} data-group={p.issue.group} data-severity={p.issue.severity} className="flex flex-col gap-3 py-3.5 sm:flex-row sm:items-start">
      <div className="grid min-w-0 flex-1 gap-1.5">
        <span className={cn("inline-flex h-5 w-fit items-center gap-1 rounded-[var(--r-chip)] px-1.5 text-[11px] font-medium", sev.cls)}>
          <sev.Icon aria-hidden="true" className="size-3" strokeWidth={2.25} />
          {t(`health.severity.${p.issue.severity}`)}
        </span>
        <p className="text-sm leading-relaxed text-pretty text-foreground">{t(p.issue.text, vars)}</p>
        <p className="flex flex-wrap gap-x-2 text-xs text-muted-foreground tabular-nums">
          <bdi>{t("health.evidence.n", { n: p.issue.evidence.n })}</bdi>
          {days !== null && <bdi>{t("health.evidence.window", { days })}</bdi>}
        </p>
        {p.staffView && (p.staffView.snoozedBy || p.issue.snoozedUntil) && (
          <p className="text-xs text-muted-foreground">
            {p.staffView.snoozedBy && t("health.snoozed_by", { role: t(`team.role.${p.staffView.snoozedBy}`) })}
            {p.staffView.snoozedBy && p.issue.snoozedUntil && " · "}
            {p.issue.snoozedUntil && t("health.snoozed_until", { date: formatDay(p.issue.snoozedUntil, p.locale) })}
          </p>
        )}
      </div>
      {(p.onFix || p.onSnooze) && (
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {p.onSnooze && !lock && (
            <Button
              type="button"
              variant="ghost"
              size="lg"
              disabled={snoozing || snoozed}
              aria-busy={snoozing || undefined}
              className={cn("text-muted-foreground", FOCUS_RING, TOUCH)}
              onClick={async () => {
                setSnoozing(true);
                try {
                  await p.onSnooze?.();
                  setSnoozed(true);
                } finally {
                  setSnoozing(false);
                }
              }}
            >
              {snoozing && <Loader2Icon aria-hidden="true" className="animate-spin motion-reduce:animate-none" />}
              {snoozed ? t("health.snoozed") : t("health.snooze")}
            </Button>
          )}
          {p.onFix && (lock ? <LockedControl reason={lock}>{fixButton}</LockedControl> : fixButton)}
        </div>
      )}
    </div>
  );
}

export function IssueList(p: IssueListProps): ReactElement | null {
  const t = useT();
  const locale = useAdminLocale();
  const listId = useId();
  const [showSnoozed, setShowSnoozed] = useState(false);
  const b = issueBuckets(p.issues, p.snoozed, p.max);
  const row = (issue: HealthIssue) => (p.children ? p.children(issue) : <IssueRow issue={issue} locale={locale} />);
  return (
    <div className="grid gap-1">
      {b.shown.length === 0 ? (
        <p className="flex items-start gap-2 py-3 text-sm text-muted-foreground">
          <CircleCheckIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
          {t(p.emptyKey)}
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {b.shown.map((issue, i) => (
            <li key={issue.id} className="adm-rise" style={{ ["--i" as string]: i }}>
              {row(issue)}
            </li>
          ))}
        </ul>
      )}
      {b.snoozed.length > 0 && (
        <div className="grid gap-1 border-t border-border pt-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-expanded={showSnoozed}
            aria-controls={listId}
            className={cn("w-fit text-muted-foreground", FOCUS_RING, TOUCH)}
            onClick={() => setShowSnoozed((v) => !v)}
          >
            {showSnoozed ? t("health.hide_snoozed") : t("health.snoozed_count", { count: b.snoozed.length })}
          </Button>
          {showSnoozed && (
            <ul id={listId} aria-label={t("health.snoozed_title")} className="divide-y divide-border opacity-80">
              {b.snoozed.map(({ issue, until }) => (
                <li key={issue.id}>
                  {row(issue)}
                  <p className="-mt-2 pb-3 text-xs text-muted-foreground">{t("health.snoozed_until", { date: formatDay(until, locale) })}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
