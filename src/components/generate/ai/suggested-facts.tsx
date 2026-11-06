"use client";
/**
 * SuggestedFacts (P7 AI; ai.md AI-04, AI-§K.3 "Suggested facts", AI-§D.2 rule 7; mounted by P2 in onboarding and P6
 * in the wizard's Details step, under the facts list; props in ./README.md).
 *
 * Unticked chips under "From your photos: tick what is true". Ticking a chip adds its text to the facts the copy
 * tasks read (`factsForCopy`, src/lib/ai/router/suggested-facts.ts), where the owner can still edit it; nothing reaches
 * copy before the tick, so a figure read from a photo is never written without the owner's word. Ticked chips past
 * the six facts say so. The state is the mount's `factsReducer`: this component only renders it and dispatches.
 */
import { CheckIcon, PlusIcon, XIcon } from "lucide-react";
import type { Dispatch } from "react";
import { overflowTicked, type FactsAction, type FactsState } from "@/lib/ai/router/suggested-facts";
import { useT } from "@/lib/i18n/admin/client";
import { cn } from "@/lib/utils";

export interface SuggestedFactsProps {
  state: FactsState;
  dispatch: Dispatch<FactsAction>;
  className?: string;
}

export function SuggestedFacts({ state, dispatch, className }: SuggestedFactsProps) {
  const t = useT();
  if (!state.suggestions.length) return null;
  const overflow = new Set(overflowTicked(state).map((s) => s.id));
  return (
    <section aria-labelledby="ai-facts-title" className={cn("grid gap-2.5", className)}>
      <h3 id="ai-facts-title" className="text-[0.8125rem] font-medium text-muted-foreground">
        {t("ai.facts.suggested")}
      </h3>
      <ul className="flex flex-wrap gap-2">
        {state.suggestions.map((s) => (
          <li key={s.id} className="inline-flex max-w-full">
            <span
              className={cn(
                "group inline-flex max-w-full items-stretch rounded-full text-[0.8125rem] ring-1 transition-colors duration-150 ring-inset",
                s.ticked ? "bg-brand-soft text-foreground ring-brand/30" : "bg-background text-foreground/85 ring-foreground/[0.12] hover:ring-foreground/25",
                overflow.has(s.id) && "opacity-60",
              )}
            >
              <button
                type="button"
                role="checkbox"
                aria-checked={s.ticked}
                onClick={() => dispatch({ type: "toggle", id: s.id })}
                className="inline-flex min-h-8 min-w-0 items-center gap-1.5 rounded-full ps-2.5 pe-2 text-start outline-none focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:min-h-11"
              >
                <span aria-hidden="true" className={cn("grid size-4 shrink-0 place-items-center rounded-full transition-colors", s.ticked ? "bg-brand text-brand-foreground" : "text-muted-foreground")}>
                  {s.ticked ? <CheckIcon className="size-3" strokeWidth={3} /> : <PlusIcon className="size-3.5" />}
                </span>
                <span className="min-w-0 truncate">{s.text}</span>
              </button>
              {!s.ticked ? (
                <button
                  type="button"
                  aria-label={t("ai.facts.dismiss")}
                  onClick={() => dispatch({ type: "dismiss", id: s.id })}
                  className="inline-grid w-7 shrink-0 place-items-center rounded-full text-muted-foreground/70 outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:w-10"
                >
                  <XIcon aria-hidden="true" className="size-3" />
                </button>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      {overflow.size ? <p className="text-[0.75rem] text-muted-foreground">{t("ai.facts.overflow")}</p> : null}
    </section>
  );
}
