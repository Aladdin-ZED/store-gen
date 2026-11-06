"use client";
/**
 * FieldRewrite, the rewrite menu (P7 AI; ai.md AI-05, AI-§K.3 "Rewrite menu", AI-§L `ai.rewrite.*`; mounted by P6
 * around the builder's and the wizard's text fields; props in ./README.md).
 *
 * Wrap a text field: while focus is inside, a small "Rewrite" button shows above its end edge (Alt+R opens the menu
 * from the field). The menu (a popover anchored to the field; a bottom sheet on a phone) lists the intents as chips,
 * then shows three options as stacked cards, each with a word-level diff against the current text: Use this, Try again
 * (a new nonce, same intent), Other angles, Esc. The chosen text goes to `onAccept` once, so the mount applies it as
 * one undo step, and a toast says "Rewritten" with Undo. Options are `copy.field`'s guarded variants (the field's real
 * maximum, the page's numbers only); none left → "No honest rewrite found. Try another angle." 44 px targets on touch.
 */
import { WandIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import type { CopyLocale } from "@/lib/ai/prompts";
import type { AiOutcome } from "@/lib/ai/provider/types";
import { rewriteInputOf, rewriteIntentsFor, wordDiff, type RewriteChoice, type RewriteField } from "@/lib/ai/router/rewrite";
import type { FieldRewriteInput, FieldRewriteOut } from "@/lib/ai/schema/tasks/copy-field";
import type { MessageKey } from "@/lib/i18n/admin";
import { useT } from "@/lib/i18n/admin/client";
import { cn } from "@/lib/utils";

/** a skeleton appears after this wait and, once shown, stays at least SKELETON_MIN_MS (core §I.8 rule 1) */
const SKELETON_AFTER_MS = 150;
const SKELETON_MIN_MS = 300;

export interface FieldRewriteProps {
  field: RewriteField;
  /** the store's copy locales (the Translate chips) */
  locales: readonly CopyLocale[];
  /** `copy.field` down the ladder: `useAiTask("copy.field", ctx).run` or `runAiOnce` */
  run(input: FieldRewriteInput, opts: { nonce?: string; signal: AbortSignal }): Promise<AiOutcome<FieldRewriteOut>>;
  /** the chosen text replaces the field: one undo step in the mount's store */
  onAccept(text: string, choice: RewriteChoice): void;
  /** the toast's Undo (omit to show the toast without it) */
  onUndo?(): void;
  disabled?: boolean;
  /** opens the menu at mount (the component harness) */
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}

type Phase =
  | { k: "intents" }
  | { k: "loading"; choice: RewriteChoice }
  | { k: "options"; choice: RewriteChoice; variants: string[] }
  | { k: "none"; choice: RewriteChoice }
  | { k: "failed"; choice: RewriteChoice };

export function intentLabel(t: (k: MessageKey, v?: Record<string, string | number>) => string, c: RewriteChoice): string {
  return c.intent === "translate" && c.targetLocale ? t("ai.rewrite.intent.translate", { locale: t(`ai.rewrite.locale.${c.targetLocale}`) }) : t(`ai.rewrite.intent.${c.intent}`);
}

const isAltR = (e: KeyboardEvent) => e.altKey && !e.ctrlKey && !e.metaKey && (e.code === "KeyR" || e.key.toLowerCase() === "r");

export function FieldRewrite({ field, locales, run, onAccept, onUndo, disabled, defaultOpen = false, children, className }: FieldRewriteProps) {
  const t = useT();
  const mobile = useIsMobile();
  const [open, setOpen] = useState(defaultOpen);
  const [focused, setFocused] = useState(false);
  const [phase, setPhase] = useState<Phase>({ k: "intents" });
  const [skeleton, setSkeleton] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const ctrl = useRef<AbortController | null>(null);
  useEffect(() => () => ctrl.current?.abort(), []);

  const ask = useCallback(
    async (choice: RewriteChoice, again: boolean) => {
      ctrl.current?.abort();
      const own = new AbortController();
      ctrl.current = own;
      setPhase({ k: "loading", choice });
      setSkeleton(false);
      const shownAt = { at: 0 };
      const timer = setTimeout(() => {
        shownAt.at = Date.now();
        setSkeleton(true);
      }, SKELETON_AFTER_MS);
      const out = await run(rewriteInputOf(field, choice), { signal: own.signal, ...(again ? { nonce: `rw${Date.now().toString(36)}` } : {}) }).catch(() => null);
      clearTimeout(timer);
      if (own.signal.aborted || ctrl.current !== own) return;
      if (shownAt.at) {
        const wait = SKELETON_MIN_MS - (Date.now() - shownAt.at);
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        if (own.signal.aborted) return;
      }
      ctrl.current = null;
      if (!out || !out.ok) return setPhase(out && out.code === "cancelled" ? { k: "intents" } : { k: "failed", choice });
      const variants = out.value.variants.filter((v) => v.trim() && v.trim() !== field.text.trim()).slice(0, 3);
      setPhase(variants.length ? { k: "options", choice, variants } : { k: "none", choice });
    },
    [run, field],
  );

  const close = useCallback(() => {
    ctrl.current?.abort();
    ctrl.current = null;
    setOpen(false);
    setPhase({ k: "intents" });
  }, []);

  const accept = (text: string, choice: RewriteChoice) => {
    onAccept(text, choice);
    close();
    toast(t("ai.rewrite.done"), onUndo ? { action: { label: t("ai.rewrite.undo_action"), onClick: onUndo } } : undefined);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!disabled && isAltR(e)) {
      e.preventDefault();
      setOpen(true);
    }
  };

  const back = () => {
    ctrl.current?.abort();
    ctrl.current = null;
    setPhase({ k: "intents" });
  };
  const panel = <RewritePanel phase={phase} field={field} locales={locales} skeleton={skeleton} onPick={(c) => void ask(c, false)} onAgain={(c) => void ask(c, true)} onBack={back} onAccept={accept} />;

  return (
    <div
      ref={wrap}
      className={cn("relative", className)}
      onKeyDown={onKeyDown}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(e) => {
        if (!wrap.current?.contains(e.relatedTarget as Node | null)) setFocused(false);
      }}
    >
      {mobile ? (
        <>
          {children}
          <Sheet open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
            <SheetContent side="bottom" className="max-h-[85dvh] gap-0 overflow-y-auto rounded-t-2xl p-0">
              <SheetTitle className="px-4 pt-4 text-[0.9375rem]">{t("ai.rewrite.title")}</SheetTitle>
              <SheetDescription className="sr-only">{t("ai.rewrite.title")}</SheetDescription>
              <div className="p-4 pt-3">{panel}</div>
            </SheetContent>
          </Sheet>
        </>
      ) : (
        <Popover open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
          <PopoverAnchor asChild>
            <div>{children}</div>
          </PopoverAnchor>
          <PopoverContent align="end" sideOffset={6} className="w-[min(26rem,calc(100vw-2rem))] gap-0 p-0" onOpenAutoFocus={(e) => e.preventDefault()}>
            <div className="flex items-center justify-between gap-3 border-b border-foreground/[0.06] px-3.5 py-2.5">
              <p className="text-[0.8125rem] font-medium">{t("ai.rewrite.title")}</p>
              <kbd className="rounded border border-foreground/10 px-1.5 py-px font-sans text-[0.6875rem] text-muted-foreground">
                <bdi dir="ltr">Esc</bdi>
              </kbd>
            </div>
            <div className="p-3.5">{panel}</div>
          </PopoverContent>
        </Popover>
      )}
      {(focused || open) && !disabled ? (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-keyshortcuts="Alt+R"
          title={`${t("ai.rewrite.button")} (Alt+R)`}
          className="absolute end-0 bottom-full mb-1 inline-flex h-7 items-center gap-1 rounded-full bg-background px-2.5 text-[0.75rem] font-medium text-foreground/80 shadow-xs ring-1 ring-foreground/10 transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:h-11 pointer-coarse:px-3.5"
        >
          <WandIcon aria-hidden="true" className="size-3.5 text-muted-foreground" />
          {t("ai.rewrite.button")}
        </button>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The panel                                                           */
/* ------------------------------------------------------------------ */

/** The menu's body for one phase (exported for the component harness, which renders every phase still). */
export type RewritePhase = Phase;
export function RewritePanel(p: {
  phase: Phase;
  field: RewriteField;
  locales: readonly CopyLocale[];
  skeleton: boolean;
  onPick(c: RewriteChoice): void;
  onAgain(c: RewriteChoice): void;
  onBack(): void;
  onAccept(text: string, c: RewriteChoice): void;
}) {
  const t = useT();
  const { phase } = p;
  if (phase.k === "intents") {
    return (
      <ul className="flex flex-wrap gap-1.5" aria-label={t("ai.rewrite.title")}>
        {rewriteIntentsFor(p.field.locale, p.locales).map((c) => (
          <li key={`${c.intent}:${c.targetLocale ?? ""}`}>
            <button
              type="button"
              onClick={() => p.onPick(c)}
              className="inline-flex h-8 items-center rounded-full bg-foreground/[0.04] px-3 text-[0.8125rem] text-foreground/85 ring-1 ring-foreground/[0.08] transition-colors outline-none ring-inset hover:bg-foreground/[0.07] hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:h-11 pointer-coarse:px-4"
            >
              {intentLabel(t, c)}
            </button>
          </li>
        ))}
      </ul>
    );
  }
  const head = (
    <div className="mb-2.5 flex items-center justify-between gap-2">
      <span className="inline-flex h-7 items-center rounded-full bg-brand-soft px-2.5 text-[0.75rem] font-medium ring-1 ring-brand/20 ring-inset">{intentLabel(t, phase.choice)}</span>
      <button type="button" onClick={p.onBack} className="rounded text-[0.75rem] text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:min-h-11">
        {t("ai.rewrite.back")}
      </button>
    </div>
  );
  if (phase.k === "loading") {
    return (
      <div aria-busy="true">
        {head}
        <p className="sr-only" role="status">
          {t("ai.rewrite.writing")}
        </p>
        <ul className={cn("grid gap-2 transition-opacity duration-150", p.skeleton ? "opacity-100" : "opacity-0")} aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <li key={i} className="grid gap-2 rounded-xl p-3 ring-1 ring-foreground/[0.07]">
              <span className="h-3 w-16 rounded bg-muted" />
              <span className="h-3.5 w-11/12 rounded bg-muted" />
              <span className="h-3.5 w-2/3 rounded bg-muted" />
            </li>
          ))}
        </ul>
      </div>
    );
  }
  if (phase.k === "none" || phase.k === "failed") {
    return (
      <div>
        {head}
        <p role="status" className="rounded-xl bg-foreground/[0.03] px-3 py-3 text-[0.8125rem] text-pretty text-muted-foreground">
          {t(phase.k === "none" ? "ai.rewrite.none" : "ai.rewrite.failed")}
        </p>
        {phase.k === "failed" ? (
          <div className="mt-2.5 flex justify-end">
            <Button variant="ghost" className="h-9 pointer-coarse:h-11" onClick={() => p.onAgain(phase.choice)}>
              {t("ai.rewrite.again")}
            </Button>
          </div>
        ) : null}
      </div>
    );
  }
  return (
    <div>
      {head}
      <ol className="grid gap-2">
        {phase.variants.map((v, i) => (
          <li key={`${i}:${v}`} className="grid gap-2 rounded-xl bg-background p-3 ring-1 ring-foreground/[0.09]">
            <p className="text-[0.6875rem] font-medium tracking-wide text-muted-foreground uppercase">{t("ai.rewrite.option", { n: i + 1 })}</p>
            <p dir="auto" lang={p.field.locale} className="text-[0.875rem] leading-relaxed text-pretty">
              {wordDiff(p.field.text, v).map((part, k) =>
                part.k === "same" ? (
                  <span key={k}>{part.text} </span>
                ) : part.k === "add" ? (
                  <ins key={k} className="rounded-[3px] bg-brand-soft px-0.5 text-foreground no-underline">
                    {part.text}{" "}
                  </ins>
                ) : (
                  <del key={k} className="text-muted-foreground/70 decoration-foreground/30">
                    {part.text}{" "}
                  </del>
                ),
              )}
            </p>
            <div className="flex justify-end">
              <Button variant="outline" size="sm" className="h-8 rounded-full px-3 pointer-coarse:h-11" onClick={() => p.onAccept(v, phase.choice)}>
                {t("ai.rewrite.use")}
              </Button>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-2.5 flex justify-end">
        <Button variant="ghost" className="h-9 pointer-coarse:h-11" onClick={() => p.onAgain(phase.choice)}>
          {t("ai.rewrite.again")}
        </Button>
      </div>
    </div>
  );
}
