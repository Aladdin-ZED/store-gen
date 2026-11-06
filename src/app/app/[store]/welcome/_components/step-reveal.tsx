"use client";
/**
 * The welcome reveal (P2 SHELL; platform.md PLA-§22.2 `reveal` row, P0b review F-8 and F-14; design.md DES-§14.3;
 * UX-01, UX-20): P6's `RevealFolds` mounted with exactly its frozen props. P2 owns the step around it: `analysing`
 * with `directions: null` while P6's `buildRevealDirections` runs (through `./directions-adapter.ts`, the one swap
 * point), `revealed` with its three, `error` with Retry when it rejected; "Use this design" calls
 * `useDirectionAction`; `reportRevealAction` runs on the first painted frame of a revealed round; "Show 3 more" asks
 * for the next round of the same store's seed. `dnaSlot` / `actionSlot` stay empty until P7 merges (P7-11).
 *
 * No model runs on this path (core D59): the generator is pure browser code and nothing here imports the local AI.
 */
import { ArrowLeftIcon, Loader2Icon, RefreshCwIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { RevealFolds, type RevealDirections } from "@/components/generate/reveal/RevealFolds";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/admin/client";
import { cn } from "@/lib/utils";
import { FOCUS_RING } from "@/components/admin/common/ui-classes";
import { loadRevealDirections, type RevealContext, type RevealDraft } from "./directions-adapter";
import { roundSeed } from "./flow-logic";

type Round = { status: "analysing"; directions: null } | { status: "revealed"; directions: RevealDirections } | { status: "error"; directions: null };
const ANALYSING: Round = { status: "analysing", directions: null };

export interface RevealStepProps {
  draft: RevealDraft;
  /** the context without the seed: the step derives each round's seed from the store's */
  context: () => Promise<Omit<RevealContext, "seedBase">>;
  /** the store's reveal seed (`revealSeed(brandSeed)`, computed on the server) */
  seedBase: number;
  /** "Use this design": resolves true when the page was made (the flow moves on), false to stay */
  onUse(directionId: string, directions: RevealDirections): Promise<boolean>;
  /** the reveal painted (once per mount; the server keeps the first) */
  onPainted(paintedAt: string): void;
  onBack: (() => void) | null;
  /** bumped by the flow to build the round again (the server answered that the price changed) */
  rebuild: number;
}

export function RevealStep({ draft, context, seedBase, onUse, onPainted, onBack, rebuild }: RevealStepProps) {
  const t = useT();
  const [round, setRound] = useState(0);
  const [attempt, setAttempt] = useState(0);
  // the last finished build, with what it was built from: anything else on screen is the next build's skeleton
  const [result, setResult] = useState<{ key: string; draft: RevealDraft; context: RevealStepProps["context"]; round: Round } | null>(null);
  const runKey = `${seedBase}:${round}:${attempt}:${rebuild}`;
  const [using, setUsing] = useState(false);
  const painted = useRef(false);
  const usingRef = useRef(false);

  useEffect(() => {
    let live = true;
    const done = (r: Round) => live && setResult({ key: runKey, draft, context, round: r });
    context()
      .then((c) => loadRevealDirections(draft, { ...c, seedBase: roundSeed(seedBase, round) }))
      .then(
        (directions) => done({ status: "revealed", directions }),
        () => done({ status: "error", directions: null }),
      );
    return () => {
      live = false;
    };
  }, [draft, context, seedBase, round, runKey]);
  // a new round starts from the skeleton of the final layout (DES-§14.3), never from the last round's folds
  const state: Round = result && result.key === runKey && result.draft === draft && result.context === context ? result.round : ANALYSING;

  // the first painted frame of a revealed round: two frames after the commit (the browser has painted the folds)
  useEffect(() => {
    if (state.status !== "revealed" || painted.current) return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        if (painted.current) return;
        painted.current = true;
        onPainted(new Date().toISOString());
      });
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [state.status, onPainted]);

  const choose = useCallback(
    (id: string) => {
      if (state.status !== "revealed" || usingRef.current) return;
      usingRef.current = true;
      setUsing(true);
      void onUse(id, state.directions).finally(() => {
        usingRef.current = false;
        setUsing(false);
      });
    },
    [state, onUse],
  );

  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  const folds =
    state.status === "revealed" ? (
      <RevealFolds state="revealed" directions={state.directions} onUse={choose} onRetry={retry} />
    ) : state.status === "error" ? (
      <RevealFolds state="error" directions={null} onUse={choose} onRetry={retry} />
    ) : (
      <RevealFolds state="analysing" directions={null} onUse={choose} onRetry={retry} />
    );

  return (
    <div className="grid gap-6">
      <div className={cn("transition-opacity duration-200", using && "pointer-events-none opacity-60")} aria-busy={using || state.status === "analysing"}>
        {folds}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {onBack ? (
          <Button type="button" variant="ghost" className={cn("h-11 rounded-full px-4 text-muted-foreground hover:text-foreground", FOCUS_RING)} onClick={onBack} disabled={using}>
            <ArrowLeftIcon className="rtl:-scale-x-100" aria-hidden="true" />
            {t("onboarding.reveal.edit")}
          </Button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-3">
          <p className="text-[0.85rem] text-muted-foreground" aria-live="polite">
            {using && (
              <span className="inline-flex items-center gap-1.5">
                <Loader2Icon className="size-3.5 animate-spin" aria-hidden="true" />
                {t("onboarding.reveal.creating")}
              </span>
            )}
          </p>
          <Button type="button" variant="outline" className={cn("h-11 rounded-full px-5", FOCUS_RING)} onClick={() => setRound((r) => r + 1)} disabled={using || state.status === "analysing"}>
            <RefreshCwIcon aria-hidden="true" />
            {t("onboarding.reveal.more")}
          </Button>
        </div>
      </div>
    </div>
  );
}
