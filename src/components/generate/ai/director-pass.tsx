"use client";
/**
 * The Director pass in the reveal (P7 AI; ai.md AI-19a, AI-§K.3 "Director pass", AI-§K.5 Director rows, AI-§A.8.2,
 * AI-§A.8.8; core §K.2 P0 design list: RevealFolds' `actionSlot` and `dnaSlot`; mounted by P6 under the three
 * directions and by P2's welcome step; the mount contract is ./README.md).
 *
 *   const pass = useDirectorPass(adapter, { handle, policy, device, session, revealed });
 *   <DirectorPassProvider value={pass}>
 *     <RevealFolds … actionSlot={<DirectorPassControl />} dnaSlot={(id) => <DirectorWhy directionId={id} />}
 *                  onUse={(id) => { const picks = pass.onUse(id); … }} />
 *   </DirectorPassProvider>
 *
 * `useDirectorPass` runs the pass (src/lib/ai/director/pass.ts `runDirectorPass`) against the routes, with the
 * wizard's `DirectorEngineAdapter` for design's engine, and keeps its state in `passReducer`. In `ask` mode (the
 * platform default) nothing runs until the owner presses the button; in `auto` it starts once the instant set is on
 * screen. The instant set stays usable the whole time: "Use this" on an instant direction cancels the pass
 * (`pass_superseded`), and every stage can be dismissed. When the pass completes (within 150 s) the wizard replaces
 * the three directions in place (`adapter.present`); Undo puts the instant set back (`adapter.restoreInstant`).
 *
 * `<DirectorPassControl>` sits in the reveal's bottom action row, beside "Use this design", never over a fold: the
 * button with the cost (`ask`), the stage line on a 2 px hairline with the cost (`auto` and once started), the
 * "Refined by the Director" chip with Undo, or one quiet line when the pass cannot run (needs Cloud AI, credits,
 * passes used up today, the month's Director share, busy). `<DirectorWhy directionId>` renders, in each DNA card or
 * bottom sheet, the chip and the direction's "why this design" line in the viewer's language (the primary locale's
 * line when the translation did not come back). No spinner, sparkle, gradient or glow; never a modal.
 */
import { CheckIcon, RotateCcwIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { Hairline } from "@/components/admin/ai/hairline";
import { Button } from "@/components/ui/button";
import type { CriticPicks } from "@/lib/db/schema";
import {
  PASS_CAP_MS,
  PASS_IDLE,
  STAGE_LINE,
  directorSlot,
  newPassId,
  passReducer,
  runDirectorPass,
  stageStep,
  type DirectorEngineAdapter,
  type DirectorPassDeps,
  type DirectorSet,
  type DirectorSlotBlock,
  type DirectorSlotView,
  type DirectorStage,
  type PassState,
} from "@/lib/ai/director/pass";
import type { AiPolicy, DeviceInfo } from "@/lib/ai/policy";
import { browserDirectorDeps } from "@/lib/ai/router/director-client";
import type { MessageKey } from "@/lib/i18n/admin";
import { useAdminLocale, useT } from "@/lib/i18n/admin/client";
import type { Locale } from "@/lib/page/schema";
import { cn } from "@/lib/utils";

export type { DirectorEngineAdapter, DirectorSet } from "@/lib/ai/director/pass";

/* ------------------------------------------------------------------ */
/* The hook                                                            */
/* ------------------------------------------------------------------ */

export interface UseDirectorPassOpts {
  handle: string;
  policy: AiPolicy | null;
  device: DeviceInfo;
  /** the wizard session (stable over the passes of one generation; `[A-Za-z0-9_-]{8,64}`) */
  session: string;
  /** the instant set is on screen (RevealFolds `revealed`): `auto` starts from here */
  revealed: boolean;
  /** Settings → AI, the link of the blocked line (default `/app/<handle>/settings/ai`) */
  settingsHref?: string | null;
  /** the stage calls (the component harness's scripted stages); default: the browser routes */
  deps?: (passId: string, onStage: (s: DirectorStage) => void) => DirectorPassDeps;
}

export interface DirectorPassApi {
  slot: DirectorSlotView;
  state: PassState;
  /** the refined set once done (kept after Undo, so Redo can put it back) */
  set: DirectorSet | null;
  settingsHref: string | null;
  start(): void;
  dismiss(): void;
  undo(): void;
  redo(): void;
  /** a new instant set (the owner regenerated): any pass is cancelled and the control starts over */
  reset(): void;
  /**
   * The owner chose `directionId` ("Use this design"): call it first in your `onUse`. A refined direction answers its
   * `critic_picks` row for the generation version; an instant one cancels a running pass (`pass_superseded`) and
   * answers null.
   */
  onUse(directionId: string): CriticPicks | null;
  /** the direction's "why this design" line in `locale` (the primary locale's when untranslated), while the refined set shows */
  whyFor(directionId: string, locale: Locale): string | null;
}

export function useDirectorPass(adapter: DirectorEngineAdapter, opts: UseDirectorPassOpts): DirectorPassApi {
  const [state, dispatch] = useReducer(passReducer, PASS_IDLE);
  const [set, setSet] = useState<DirectorSet | null>(null);
  const slot = useMemo(() => directorSlot(opts.policy), [opts.policy]);
  const adapterRef = useRef(adapter);
  const optsRef = useRef(opts);
  const run = useRef<{ ctrl: AbortController; startedAt: number } | null>(null);
  const autoTried = useRef(false);
  useEffect(() => {
    adapterRef.current = adapter;
    optsRef.current = opts;
  });
  useEffect(() => () => run.current?.ctrl.abort(), []);

  const start = useCallback(() => {
    const o = optsRef.current;
    if (directorSlot(o.policy).k !== "ready" || run.current) return;
    const passId = newPassId();
    const ctrl = new AbortController();
    const startedAt = Date.now();
    run.current = { ctrl, startedAt };
    dispatch({ t: "start", passId, at: startedAt });
    const onStage = (stage: DirectorStage) => {
      if (!ctrl.signal.aborted) dispatch({ t: "stage", passId, stage });
    };
    const deps = o.deps ? o.deps(passId, onStage) : browserDirectorDeps({ handle: o.handle, policy: o.policy!, device: o.device, session: o.session, passId }, onStage);
    void runDirectorPass(passId, adapterRef.current, deps, ctrl.signal).then((r) => {
      if (run.current?.ctrl !== ctrl) return;
      run.current = null;
      if (ctrl.signal.aborted) return;
      if (!r.ok) return dispatch({ t: "fail", passId, reason: r.reason });
      const at = Date.now();
      // AI-19 (3): later than the cap, the result is ignored and the instant set stays
      if (at - startedAt <= PASS_CAP_MS) {
        setSet(r.set);
        adapterRef.current.present(r.set);
      }
      dispatch({ t: "done", passId, at });
    });
  }, []);

  const cancelRun = useCallback(() => {
    run.current?.ctrl.abort("dismissed");
    run.current = null;
  }, []);

  const dismiss = useCallback(() => {
    cancelRun();
    dispatch({ t: "dismiss" });
  }, [cancelRun]);
  const undo = useCallback(() => {
    adapterRef.current.restoreInstant();
    dispatch({ t: "undo" });
  }, []);
  const redo = useCallback(() => {
    if (!set) return;
    adapterRef.current.present(set);
    dispatch({ t: "redo" });
  }, [set]);
  const reset = useCallback(() => {
    cancelRun();
    autoTried.current = false;
    setSet(null);
    dispatch({ t: "reset" });
  }, [cancelRun]);
  const onUse = useCallback(
    (directionId: string): CriticPicks | null => {
      if (set && state.k === "done" && state.showing === "director") return set.criticPicks(directionId);
      cancelRun();
      dispatch({ t: "use_instant" });
      return null;
    },
    [set, state, cancelRun],
  );
  const whyFor = useCallback(
    (directionId: string, locale: Locale): string | null => {
      if (!set || state.k !== "done" || state.showing !== "director") return null;
      const pick = set.picks.find((p) => p.id === directionId);
      return pick ? (pick.why[locale] ?? pick.why[set.primary] ?? null) : null;
    },
    [set, state],
  );

  // auto: one pass once the instant set is on screen (never before, never twice for one set)
  const autoReady = slot.k === "ready" && slot.mode === "auto" && opts.revealed && state.k === "idle";
  useEffect(() => {
    if (!autoReady || autoTried.current) return;
    autoTried.current = true;
    const timer = setTimeout(start, 0);
    return () => clearTimeout(timer);
  }, [autoReady, start]);

  const settingsHref = opts.settingsHref === undefined ? `/app/${opts.handle}/settings/ai` : opts.settingsHref;
  return useMemo(
    () => ({ slot, state, set, settingsHref, start, dismiss, undo, redo, reset, onUse, whyFor }),
    [slot, state, set, settingsHref, start, dismiss, undo, redo, reset, onUse, whyFor],
  );
}

/* ------------------------------------------------------------------ */
/* The provider                                                        */
/* ------------------------------------------------------------------ */

const PassContext = createContext<DirectorPassApi | null>(null);

/** Shares one pass between the control (action row) and the why lines (DNA slots). */
export function DirectorPassProvider({ value, children }: { value: DirectorPassApi; children: ReactNode }) {
  return <PassContext.Provider value={value}>{children}</PassContext.Provider>;
}

function usePass(explicit?: DirectorPassApi | null): DirectorPassApi | null {
  const fromContext = useContext(PassContext);
  return explicit ?? fromContext;
}

/* ------------------------------------------------------------------ */
/* <DirectorPassControl>                                               */
/* ------------------------------------------------------------------ */

const BLOCK_TEXT: Record<DirectorSlotBlock, MessageKey> = {
  needs_cloud: "ai.director.needs_cloud",
  credits: "ai.director.paused_credits",
  pending: "ai.block.quota_platform_pending",
  passes_day: "ai.block.passes_day",
  quota_director: "ai.block.quota_director",
  busy: "ai.director.busy",
};
const BLOCK_LINK: ReadonlySet<DirectorSlotBlock> = new Set(["needs_cloud", "credits", "quota_director"]);

const STAGE_TEXT: Record<DirectorStage, MessageKey> = {
  read: "ai.director.stage.read",
  brief: "ai.director.stage.brief",
  critique: "ai.director.stage.critique",
  critique_job: "ai.director.stage.critique_job",
  repair: "ai.director.stage.repair",
  verify: "ai.director.stage.verify",
  done: "ai.director.stage.done",
};

function DismissButton({ onClick, label }: { onClick(): void; label: string }) {
  return (
    <Button variant="ghost" size="icon" aria-label={label} title={label} className="size-9 shrink-0 rounded-full text-muted-foreground pointer-coarse:size-11" onClick={onClick}>
      <XIcon aria-hidden="true" className="size-4" />
    </Button>
  );
}

function QuietLine({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("inline-flex min-h-11 max-w-full flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.8125rem] text-pretty text-muted-foreground", className)}>{children}</p>;
}

export function DirectorPassControl({ pass: explicit, className }: { pass?: DirectorPassApi | null; className?: string }) {
  const t = useT();
  const pass = usePass(explicit);
  if (!pass) return null;
  const { slot, state } = pass;
  if (slot.k === "hidden" && state.k !== "done") return null;

  if (state.k === "done") {
    if (state.quiet) return null;
    return (
      <div className={cn("flex min-h-11 max-w-full flex-wrap items-center gap-x-2 gap-y-1", className)}>
        {state.showing === "director" ? (
          <>
            <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-brand-soft ps-2 pe-2.5 text-[0.8125rem] font-medium text-foreground ring-1 ring-brand/25 ring-inset">
              <CheckIcon aria-hidden="true" className="size-3.5 text-brand" strokeWidth={2.5} />
              {t("ai.director.refined")}
            </span>
            <Button variant="ghost" className="h-9 gap-1.5 rounded-full px-3 pointer-coarse:h-11" onClick={pass.undo}>
              <RotateCcwIcon aria-hidden="true" className="size-3.5" />
              {t("ai.director.undo")}
            </Button>
          </>
        ) : (
          <Button variant="ghost" className="h-9 rounded-full px-3 pointer-coarse:h-11" onClick={pass.redo}>
            {t("ai.director.redo")}
          </Button>
        )}
        <DismissButton label={t("ai.director.dismiss")} onClick={pass.dismiss} />
        <span className="sr-only" aria-live="polite">
          {state.showing === "director" ? t("ai.director.refined") : t("ai.director.undo")}
        </span>
      </div>
    );
  }
  if (state.k === "superseded" || state.k === "dismissed") return null;

  if (slot.k === "blocked") {
    return (
      <QuietLine className={className}>
        <span>{t(BLOCK_TEXT[slot.block])}</span>
        {BLOCK_LINK.has(slot.block) && pass.settingsHref ? (
          <Link href={pass.settingsHref} className="font-medium text-foreground underline decoration-foreground/25 underline-offset-4 hover:decoration-foreground/60">
            {t("ai.director.credits_link")}
          </Link>
        ) : null}
      </QuietLine>
    );
  }
  if (slot.k !== "ready") return null;

  if (state.k === "failed") {
    return (
      <div className={cn("flex min-h-11 max-w-full items-center gap-2", className)}>
        <p role="status" className="min-w-0 text-[0.8125rem] text-pretty text-muted-foreground">
          {t(state.reason === "credits" ? "ai.director.paused_credits" : "ai.director.busy")}
        </p>
        <DismissButton label={t("ai.director.dismiss")} onClick={pass.dismiss} />
      </div>
    );
  }

  if (state.k === "running") {
    const step = stageStep(state.stage);
    return (
      <div className={cn("flex w-full max-w-md min-w-0 items-center gap-2 sm:w-auto sm:min-w-80", className)}>
        <div className="grid min-w-0 flex-1 gap-1.5">
          <div className="flex min-w-0 items-baseline justify-between gap-3">
            <p className="min-w-0 truncate text-[0.875rem] font-medium" aria-live="polite">
              {t(STAGE_TEXT[state.stage])}
            </p>
            <p className="shrink-0 text-[0.75rem] text-muted-foreground tabular-nums">{t("ai.director.cost", { credits: slot.credits })}</p>
          </div>
          <Hairline value={(step + 0.5) / STAGE_LINE.length} label={t(STAGE_TEXT[state.stage])} />
        </div>
        <DismissButton label={t("ai.director.dismiss")} onClick={pass.dismiss} />
      </div>
    );
  }

  // idle
  if (slot.mode === "auto") {
    return <QuietLine className={className}>{t("ai.director.cost", { credits: slot.credits })}</QuietLine>;
  }
  return (
    <div className={cn("flex min-h-11 max-w-full items-center gap-1", className)}>
      <Button variant="outline" className="h-10 max-w-full min-w-0 rounded-full px-4 pointer-coarse:h-11" onClick={pass.start}>
        <span className="truncate">{t("ai.director.ask", { credits: slot.credits })}</span>
      </Button>
      <DismissButton label={t("ai.director.dismiss")} onClick={pass.dismiss} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* <DirectorWhy directionId>                                           */
/* ------------------------------------------------------------------ */

export function DirectorWhy({ directionId, pass: explicit, className }: { directionId: string; pass?: DirectorPassApi | null; className?: string }) {
  const t = useT();
  const locale = useAdminLocale();
  const pass = usePass(explicit);
  const why = pass?.whyFor(directionId, locale) ?? null;
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!why || !el || typeof el.animate !== "function" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const a = el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
    return () => a.cancel();
  }, [why]);
  if (!why) return null;
  return (
    <div ref={box} className={cn("grid gap-1", className)}>
      <span className="inline-flex items-center gap-1 text-[0.75rem] font-medium text-foreground/70">
        <CheckIcon aria-hidden="true" className="size-3 text-brand" strokeWidth={2.5} />
        {t("ai.director.refined")}
      </span>
      <p className="text-[0.8125rem] leading-snug text-pretty text-foreground/85">
        <span className="sr-only">{t("ai.director.why")}: </span>
        {why}
      </p>
    </div>
  );
}
