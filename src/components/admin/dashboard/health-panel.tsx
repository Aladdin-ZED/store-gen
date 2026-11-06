"use client";
/**
 * The dashboard's Store Health block (P2 SHELL; platform.md PLA-§22.16, PD66, PD67, PD78; docs/STORE-SAAS.md §I.7), the
 * `#health` anchor that `health.issue_new` links to:
 *
 * - the ring at 96 px with "Checked at hh:mm" (neutral past the snapshot's `staleAfterMin`) and **Recompute now**,
 *   which shows "Recomputing" once the store is marked dirty, never a waiting spinner;
 * - `HealthGroups` (a pending store sees setup and trust only; the others say "After approval" through a
 *   `LockedControl`);
 * - five `IssueRow`s: a link fix opens its screen, a command fix runs the registered command (PD66); a fix the viewer
 *   may not run is hidden, and disabled under impersonation (the row's own lock); Snooze for owner and admin; "n
 *   snoozed" opens the list with Unsnooze;
 * - the quiet `health.all_good_short`, and once per viewer the typographic celebration at ≥ 90 with no severity-3
 *   issue (localStorage marker);
 * - before the first run, `health.computing` and the local setup pass (the `issues` the server built from the store's
 *   facts); `showScoreToTenantsBelowN` hides the number, never the issues; suspended and closed stores read the last
 *   snapshot without fixes; a failed snapshot read shows the ring's error state alone.
 */
import { LockIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { recomputeHealthAction, snoozeHealthIssueAction, unsnoozeHealthIssueAction } from "@/app/app/[store]/health-actions";
import { HEALTH_CAPS, type HealthGroup, type HealthIssue } from "@/lib/health/types";
import { useAdminLocale, useT } from "@/lib/i18n/admin/client";
import type { StoreStatus } from "@/lib/tenancy/types";
import { cn } from "@/lib/utils";
import { EmptyState } from "../common/empty-state";
import { HealthGroups } from "../common/health-groups";
import { HealthRing, HealthStaleAfter } from "../common/health-ring";
import { IssueList, IssueRow } from "../common/issue-list";
import { LockedControl } from "../common/locked-control";
import { FOCUS_RING, TOUCH } from "../common/ui-classes";
import { useViewerFlags } from "../common/viewer-flags";
import { commandsFor } from "../shell/commands";
import { useStore } from "../shell/store-context";
import { useActionError } from "../shell/use-action-error";
import { celebrates, PENDING_GROUPS, unwireIssue, type WireIssue } from "./compose";

export interface HealthPanelProps {
  /** "ok": the snapshot was read (null = not computed yet); "error": `getStoreHealth` failed (only the ring says so) */
  state: "ok" | "error";
  snapshot: { score: number; attention: 0 | 1 | 2 | 3; computedAt: string; dirty: boolean; staleAfterMin: number; components: Record<HealthGroup, number> } | null;
  issues: WireIssue[];
  snoozed: Record<string, string>;
  /** `platform.health.showScoreToTenantsBelowN` still hides the number: the orders the store needs */
  hideScoreBelow: number | null;
  status: StoreStatus;
}

const READ_ONLY: readonly StoreStatus[] = ["suspended", "closed"];
const celebratedKey = (storeId: string, viewerId: string) => `sg:health-celebrated:${storeId}:${viewerId}`;

export function HealthPanel(p: HealthPanelProps) {
  const t = useT();
  const locale = useAdminLocale();
  const store = useStore();
  const router = useRouter();
  const actions = useActionError();
  const { impersonating } = useViewerFlags();
  const [dirty, setDirty] = useState(p.snapshot?.dirty ?? false);
  const [celebrate, setCelebrate] = useState(false);
  const readOnly = READ_ONLY.includes(p.status);
  const pending = p.status === "pending";
  const issues = useMemo(() => p.issues.map(unwireIssue), [p.issues]);
  const score = p.snapshot && p.hideScoreBelow === null ? p.snapshot.score : null;
  const canSnooze = store.can("health.snooze") && !readOnly;
  const commands = useMemo(
    () => commandsFor({ store: { id: store.id, handle: store.handle, name: store.name, mode: store.mode, status: store.status }, can: store.can }),
    [store],
  );

  // the celebration, once per viewer: a score of 90 or more with no severity-3 issue (PLA-§22.16 item 4)
  const open = issues.filter((i) => !p.snoozed[i.id]);
  const worthy = celebrates(score, open);
  useEffect(() => {
    if (!worthy) return;
    let seen = true;
    try {
      const key = celebratedKey(store.id, store.viewerId);
      seen = window.localStorage.getItem(key) === "1";
      if (!seen) window.localStorage.setItem(key, "1");
    } catch {
      // storage blocked: no celebration rather than one on every visit
    }
    const timer = setTimeout(() => setCelebrate(!seen), 0);
    return () => clearTimeout(timer);
  }, [worthy, store.id, store.viewerId]);

  const onFix = (issue: HealthIssue) => {
    if (readOnly) return undefined;
    const fix = issue.fix;
    if (fix.kind === "link") return () => router.push(fix.href(store.handle));
    const command = commands.find((c) => c.id === fix.actionId);
    if (!command) return undefined; // hidden without the permission (the row disables it under impersonation)
    return () => void Promise.resolve(command.run({ store: { id: store.id, handle: store.handle, name: store.name, mode: store.mode, status: store.status }, can: store.can, navigate: (href) => router.push(href) })).catch(() => undefined);
  };

  const snooze = (issueId: string, undo: boolean) => async () => {
    const res = await actions.run(() => (undo ? unsnoozeHealthIssueAction({ issueId }) : snoozeHealthIssueAction({ issueId })));
    if (!res.ok) throw new Error(res.error);
    router.refresh();
  };

  const recompute =
    p.state === "ok" && p.snapshot && !readOnly && !impersonating
      ? async () => {
          const res = await actions.run(() => recomputeHealthAction());
          if (res.ok) setDirty(true);
        }
      : undefined;

  const caps: Record<HealthGroup, number> = pending ? (Object.fromEntries(PENDING_GROUPS.map((g) => [g, HEALTH_CAPS[g]])) as Record<HealthGroup, number>) : HEALTH_CAPS;
  const lockedGroups = (Object.keys(HEALTH_CAPS) as HealthGroup[]).filter((g) => !PENDING_GROUPS.includes(g));

  return (
    <div id="health" className="grid scroll-mt-24 content-start gap-5 rounded-[var(--r-card)] bg-card p-5 text-card-foreground ring-1 ring-border ring-inset">
      {/* the ring, or its own error state (the rest of the dashboard is unaffected) */}
      {p.state === "error" ? (
        <div role="alert" className="flex items-center gap-4">
          <span aria-hidden="true" className="size-14 shrink-0 rounded-full border-4 border-dashed border-muted" />
          <div className="grid gap-1">
            <p className="text-[13px] font-medium text-foreground">{t("health.title")}</p>
            <p className="text-xs leading-relaxed text-pretty text-muted-foreground">{t("health.error")}</p>
          </div>
        </div>
      ) : p.snapshot && p.hideScoreBelow !== null ? (
        <div className="flex items-center gap-4">
          <HealthRing score={null} attention={p.snapshot.attention} size={56} computedAt={p.snapshot.computedAt} surface="tenant" />
          <div className="grid gap-1">
            <p className="text-[13px] font-medium text-foreground">{t("health.title")}</p>
            <p className="text-xs leading-relaxed text-pretty text-muted-foreground">{t("health.score_later", { count: p.hideScoreBelow })}</p>
          </div>
        </div>
      ) : (
        <HealthStaleAfter minutes={p.snapshot?.staleAfterMin ?? 0}>
          <HealthRing score={score} attention={p.snapshot?.attention ?? 0} size={96} computedAt={p.snapshot?.computedAt ?? null} dirty={dirty} surface="tenant" onRecompute={recompute} />
        </HealthStaleAfter>
      )}

      {readOnly && <p className="text-xs leading-relaxed text-pretty text-muted-foreground">{t("health.read_only")}</p>}

      {celebrate && score !== null && <EmptyState compact variant="celebration" title={t("health.celebrate")} celebration={{ number: score, label: t("health.celebrate") }} />}

      {p.snapshot && (
        <div className="grid gap-3 border-t border-border pt-4">
          <HealthGroups components={p.snapshot.components} caps={caps} />
          {pending && (
            <LockedControl reason={{ kind: "pending" }}>
              <button
                type="button"
                className={cn("flex w-full items-center justify-between gap-3 rounded-[var(--r-control)] py-1 text-start text-xs text-muted-foreground", FOCUS_RING, TOUCH)}
              >
                <span className="min-w-0 truncate">{lockedGroups.map((g) => t(`health.group.${g}`)).join(" · ")}</span>
                <span className="inline-flex shrink-0 items-center gap-1 font-medium">
                  <LockIcon aria-hidden="true" className="size-3" />
                  {t("health.after_approval")}
                </span>
              </button>
            </LockedControl>
          )}
        </div>
      )}

      <div className="border-t border-border pt-1">
        <IssueList issues={issues} max={5} snoozed={p.snoozed} emptyKey="health.all_good_short">
          {(issue) => {
            const isSnoozed = !!p.snoozed[issue.id];
            const fix = onFix(issue);
            return (
              <div>
                <IssueRow issue={issue} locale={locale} onFix={fix ? () => fix() : undefined} onSnooze={canSnooze && !isSnoozed && !impersonating ? snooze(issue.id, false) : undefined} />
                {isSnoozed && canSnooze && !impersonating && (
                  <Button type="button" variant="ghost" size="sm" className={cn("-mt-2 mb-2 text-muted-foreground", FOCUS_RING, TOUCH)} onClick={() => void snooze(issue.id, true)().catch(() => undefined)}>
                    {t("health.unsnooze")}
                  </Button>
                )}
              </div>
            );
          }}
        </IssueList>
      </div>
    </div>
  );
}
