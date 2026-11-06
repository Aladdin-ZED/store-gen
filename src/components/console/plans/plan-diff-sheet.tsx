"use client";
/**
 * The plan editor's review sheet (platform.md PLA-§9.2, PD58): old → new per changed key, then the impact preview read
 * for exactly this patch (`previewPlanChangeAction`): the stores on the plan, one sentence per lowered limit with up to
 * 20 example handles by usage (what they keep), the features that stop, and the unaffected count. Confirm saves the
 * same patch with the sheet's opId (`savePlanAction`); a refusal names the row it is about.
 *
 *   <PlanDiffSheet plan={editor.plan} rows={editor.rows} draft={{ media_bytes: 524288000 }} onClose={…} onSaved={…} />
 */
import { ArrowRightIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { previewPlanChangeAction, savePlanAction } from "@/app/admin/(console)/plans/actions";
import { useT } from "@/lib/i18n/admin/client";
import { formatAmount, impactSentences, type PlanEditorRow, type PlanImpact, type PlanValue } from "@/lib/platform/plan-rules";
import type { PlanListRow } from "@/lib/platform/plans";
import type { LimitKey } from "@/lib/tenancy/entitlement-keys";
import { cn } from "@/lib/utils";
import { useGuarded } from "../guarded";
import { button, ConsoleDialog } from "../queue/decision-dialogs";
import { diffLines } from "./diff-text";

export function PlanDiffSheet({ plan, rows, draft, onClose, onSaved }: { plan: PlanListRow; rows: PlanEditorRow[]; draft: Record<string, PlanValue>; onClose(): void; onSaved(): void }) {
  const t = useT();
  const router = useRouter();
  const g = useGuarded("console.plans.save_failed");
  const lines = useMemo(() => diffLines(rows, draft), [rows, draft]);
  const patch = useMemo(() => Object.fromEntries(lines.map((l) => [l.key, draft[l.key]!])), [lines, draft]);
  const [impact, setImpact] = useState<PlanImpact | null>(null);
  const [previewProblem, setPreviewProblem] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    previewPlanChangeAction({ planId: plan.id, patch })
      .then((r) => {
        if (!live) return;
        if (r.ok) setImpact(r.data);
        else setPreviewProblem(r.message ? t(r.message) : t("console.plans.preview_failed"));
      })
      .catch(() => live && setPreviewProblem(t("console.plans.preview_failed")));
    return () => {
      live = false;
    };
  }, [plan.id, patch, t]);

  const sentences = impact ? impactSentences(impact) : [];
  const save = () =>
    g.run(
      (opId) => savePlanAction({ planId: plan.id, patch, opId }),
      (d) => {
        toast.success(t("console.plans.saved", { name: plan.name, count: d.stores }));
        onSaved();
        onClose();
        router.refresh();
      },
    );

  return (
    <>
      <ConsoleDialog
        open
        onOpenChange={(o) => !o && onClose()}
        title={t("console.plans.review_title", { name: plan.name })}
        description={impact ? t("console.plans.review_lead", { count: impact.stores }) : t("console.plans.review_reading")}
        footer={
          <>
            <DialogPrimitive.Close className={cn(button.base, button.ghost)}>{t("console.dialog.cancel")}</DialogPrimitive.Close>
            <button type="button" disabled={!impact || g.busy || lines.length === 0} onClick={() => void save()} className={cn(button.base, button.primary)}>
              {t("console.plans.confirm")}
            </button>
          </>
        }
      >
        <section aria-label={t("console.plans.diff")} className="grid gap-1.5">
          <h3 className="text-[11.5px] font-medium text-muted-foreground">{t("console.plans.diff")}</h3>
          <ul className="divide-y divide-[var(--c-hairline)] overflow-hidden rounded-[var(--r-control)] shadow-[inset_0_0_0_1px_var(--c-hairline)]">
            {lines.map((l) => (
              <li key={l.key} className="grid gap-0.5 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-3">
                <span className="truncate text-[12.5px] font-medium">{l.label}</span>
                <span className="num flex items-center gap-1.5 text-[12.5px]">
                  <span className="text-muted-foreground line-through decoration-[color-mix(in_oklch,var(--foreground)_30%,transparent)]">{l.from}</span>
                  <ArrowRightIcon aria-label={t("console.plans.to")} className="size-3 shrink-0 text-muted-foreground rtl:-scale-x-100" />
                  <span className="font-medium">{l.to}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-label={t("console.plans.impact")} aria-busy={!impact && !previewProblem} className="grid gap-2">
          <h3 className="text-[11.5px] font-medium text-muted-foreground">{t("console.plans.impact")}</h3>
          {previewProblem ? (
            <p role="alert" className="text-[12.5px] text-[var(--c-danger-ink)]">
              {previewProblem}
            </p>
          ) : !impact ? (
            <div className="grid gap-2" aria-hidden="true">
              <span className="h-3.5 w-4/5 animate-pulse rounded bg-[var(--c-skeleton)]" />
              <span className="h-3.5 w-3/5 animate-pulse rounded bg-[var(--c-skeleton)]" />
            </div>
          ) : (
            <>
              {sentences.length === 0 ? (
                <p className="text-[12.5px]">{t("console.plans.impact_none", { count: impact.stores })}</p>
              ) : (
                <ul className="grid gap-2.5">
                  {impact.lowered.map((l, i) => (
                    <li key={l.key} className="grid gap-1.5 text-[12.5px] leading-[1.5]">
                      <p>{sentences[i]}</p>
                      {l.examples.length > 0 && (
                        <ul aria-label={t("console.plans.examples")} className="flex flex-wrap gap-1">
                          {l.examples.map((e) => (
                            <li key={e.handle} className="inline-flex h-6 items-center gap-1.5 rounded-full bg-secondary px-2 text-[11.5px]">
                              <bdi dir="ltr" className="font-mono">
                                @{e.handle}
                              </bdi>
                              <span className="num text-muted-foreground">{formatAmount(l.key as LimitKey, e.used)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                  {impact.featuresOff.map((f, i) => (
                    <li key={f.key} className="grid gap-1.5 text-[12.5px] leading-[1.5]">
                      <p>{sentences[impact.lowered.length + i]}</p>
                      {f.examples.length > 0 && (
                        <ul aria-label={t("console.plans.examples")} className="flex flex-wrap gap-1">
                          {f.examples.map((e) => (
                            <li key={e.handle} className="inline-flex h-6 items-center rounded-full bg-secondary px-2 font-mono text-[11.5px]">
                              <bdi dir="ltr">@{e.handle}</bdi>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <p className="num text-[12px] text-muted-foreground">{t("console.plans.unaffected", { count: impact.unaffected, total: impact.stores })}</p>
            </>
          )}
        </section>
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
