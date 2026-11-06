"use client";
/**
 * DirectorReview, the builder's "Director review" (P7 AI; ai.md AI-§K.3 "Director review", AI-§A.8.8, AI-19 R2,
 * QUAL-9; mounted by P6 in the Design check panel; props in ./README.md). The R2 shell: it renders nothing unless
 * `enabled` (the R2 flag; `critique.doc` is not live in R1), so the builder is unchanged in R1.
 *
 * When enabled: a "Director review" button; then ≤ 3 suggested fixes as rows with their evidence ("hero: 3 lines at
 * 390 px"), each with Apply (through the builder store, undoable) and Apply all. A fix that does not raise Q shows
 * "No gain" and stays applicable (the one acceptance rule of AI-§A.8.2 stage 5: a fix that would add a hard item, raise
 * the slop score or move a band off `ok` is never offered, so it never reaches this list).
 */
import { Button } from "@/components/ui/button";
import { Hairline } from "@/components/admin/ai/hairline";
import { useT } from "@/lib/i18n/admin/client";
import { cn } from "@/lib/utils";

export interface DirectorReviewFix {
  id: string;
  /** what the fix does, in the owner's words (the mount's label of the op) */
  label: string;
  /** the critic's evidence, e.g. "hero: 3 lines at 390 px" */
  evidence: string;
  /** Q did not move: shown as "No gain", still applicable */
  noGain: boolean;
}

export interface DirectorReviewProps {
  /** the R2 flag (critique.doc live); false renders nothing */
  enabled: boolean;
  running: boolean;
  fixes: readonly DirectorReviewFix[] | null;
  onReview(): void;
  onApply(id: string): void;
  onApplyAll(): void;
  className?: string;
}

export function DirectorReview({ enabled, running, fixes, onReview, onApply, onApplyAll, className }: DirectorReviewProps) {
  const t = useT();
  if (!enabled) return null;
  return (
    <section className={cn("grid gap-2.5", className)}>
      <div className="flex items-center justify-between gap-2">
        <Button variant="outline" className="h-9 rounded-full px-3.5" onClick={onReview} disabled={running} aria-busy={running}>
          {t("ai.review.button")}
        </Button>
        {fixes && fixes.length > 1 ? (
          <Button variant="ghost" className="h-9 px-3" onClick={onApplyAll}>
            {t("ai.review.apply_all")}
          </Button>
        ) : null}
      </div>
      {running ? <Hairline label={t("ai.review.button")} /> : null}
      {fixes?.length ? (
        <ul className="grid gap-1.5">
          {fixes.slice(0, 3).map((f) => (
            <li key={f.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5 ring-1 ring-foreground/[0.08]">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[0.8125rem] font-medium">{f.label}</p>
                <p className="truncate text-[0.75rem] text-muted-foreground">{f.evidence}</p>
              </div>
              {f.noGain ? <span className="shrink-0 text-[0.75rem] text-muted-foreground">{t("ai.review.no_gain")}</span> : null}
              <Button variant="ghost" size="sm" className="h-8 shrink-0 px-2.5" onClick={() => onApply(f.id)}>
                {t("ai.review.apply")}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
