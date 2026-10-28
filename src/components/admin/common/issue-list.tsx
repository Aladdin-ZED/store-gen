"use client";
/**
 * IssueRow and IssueList (P2 SHELL; platform.md PLA-§22.12, §22.16, §10.2, PD66, PD67; docs/STORE-SAAS.md §I.7): the
 * Store Health issues. A row shows the severity as a text label with an icon, the issue's sentence with its evidence
 * numbers in <bdi>, the fix as one button (`disabled` with its lock reason, e.g. under impersonation) and "Snooze 7
 * days" as a quiet secondary action; the console's staff view adds who snoozed it. The list shows at most `max`
 * issues and the empty message `emptyKey`; `children` replaces the default row.
 *
 * A client component: `children` is a render function, so the list is mounted from client code (the health panels).
 * Props frozen at PLA-§22.12 (src/lib/contracts/r1-p0b-platform.ts); P1 builds against them before P2 merges.
 * P0b stub: the track replaces the body, never the signature. The stub row renders the sentence (`issue.text` in
 * `locale`), the evidence value and sample size in <bdi>, and the fix button labelled by its message; the list leaves
 * out the snoozed issues, keeps the first `max` and renders each row in the viewer's admin locale. The severity label,
 * the snooze control, the staff view and the "n snoozed" line are P2's.
 */
import type { ReactElement, ReactNode } from "react";
import type { StoreRole } from "@/lib/auth/permissions";
import type { HealthFix, HealthIssue } from "@/lib/health/types";
import { translator } from "@/lib/i18n/admin";
import { useAdminLocale, useT } from "@/lib/i18n/admin/client";
import type { MessageKey } from "@/lib/tenancy/types";
import type { LockReason } from "./locked-control";

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

export function IssueRow(p: IssueRowProps): ReactElement | null {
  const fix = p.issue.fix;
  const t = translator(p.locale);
  return (
    <div data-issue={p.issue.id} data-group={p.issue.group} data-severity={p.issue.severity}>
      <p>{t(p.issue.text)}</p>
      <p>
        <bdi>{p.issue.evidence.value}</bdi> <bdi>{p.issue.evidence.n}</bdi>
      </p>
      <button type="button" disabled={p.disabled != null || !p.onFix} onClick={() => p.onFix?.(fix)}>
        {t(fix.label)}
      </button>
    </div>
  );
}

export function IssueList(p: IssueListProps): ReactElement | null {
  const t = useT();
  const locale = useAdminLocale();
  const shown = p.issues.filter((issue) => !Object.hasOwn(p.snoozed, issue.id)).slice(0, p.max);
  if (!shown.length) return <p>{t(p.emptyKey)}</p>;
  return (
    <ul>
      {shown.map((issue) => (
        <li key={issue.id}>{p.children ? p.children(issue) : <IssueRow issue={issue} locale={locale} />}</li>
      ))}
    </ul>
  );
}
