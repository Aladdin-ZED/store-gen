"use client";
/**
 * The streamed reveal (P7 AI; ai.md AI-02, AI-§K.3 "Streamed reveal", AI-§K.5 "Guard rejected some fields", AI-§A.8.8;
 * mounted by P6 in the wizard and the builder, by P2 in onboarding; props in ./README.md).
 *
 *   <CopyReveal text origin>   one text field. The library draft paints first; when an AI text replaces it, the new
 *       text cross-fades in over --dur-2 (180 ms) with the tenant accent at 8 % behind it, fading over 600 ms.
 *       `prefers-reduced-motion`: an instant swap, no tint. An owner's or the engine's text never animates.
 *   <LinesWritten done total>  the step footer's "3 of 21 lines written" (never per field; never 100 % early: the
 *       mount counts a line when its final, guarded value arrived).
 *   <KeptNote fields>          "Kept 3 lines from the built-in copy (honesty check)" with a details popover listing
 *       the field names the guard sent back to the library.
 *   <NoveltyNote n>            "Rewrote 2 headlines that sounded like other shops" (AI-02 (9), the novelty guard).
 */
import { InfoIcon } from "lucide-react";
import { useLayoutEffect, useRef, type ElementType, type ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { CopyOrigin } from "@/lib/ai/provider/types";
import { useT } from "@/lib/i18n/admin/client";
import { cn } from "@/lib/utils";

/** --dur-2 of core §I.6 and the tint's fade (AI-§K.3) */
export const REVEAL_MS = 180;
export const TINT_MS = 600;

const AI_ORIGINS: ReadonlySet<string> = new Set<CopyOrigin>(["cloud", "local"]);

export interface CopyRevealProps {
  text: string;
  /** who wrote `text`: only an AI text (cloud, local) animates in */
  origin?: CopyOrigin | "owner" | null;
  as?: ElementType;
  className?: string;
  /** the field path, for the KeptNote and the harness (data-field) */
  field?: string;
}

export function CopyReveal({ text, origin = null, as: Tag = "span", className, field }: CopyRevealProps) {
  const el = useRef<HTMLElement>(null);
  const shown = useRef<string | null>(null);
  useLayoutEffect(() => {
    const node = el.current;
    const before = shown.current;
    shown.current = text;
    if (!node || before === null || before === text || !origin || !AI_ORIGINS.has(origin)) return;
    if (typeof node.animate !== "function" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const fade = node.animate([{ opacity: 0 }, { opacity: 1 }], { duration: REVEAL_MS, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
    const tint = node.animate(
      [{ backgroundColor: "color-mix(in oklab, var(--brand) 8%, transparent)" }, { backgroundColor: "color-mix(in oklab, var(--brand) 0%, transparent)" }],
      { duration: TINT_MS, easing: "ease-out" },
    );
    return () => {
      fade.cancel();
      tint.cancel();
    };
  }, [text, origin]);
  return (
    <Tag ref={el} data-origin={origin ?? undefined} data-field={field} className={cn("rounded-[4px] [box-decoration-break:clone]", className)}>
      {text}
    </Tag>
  );
}

/** The step footer's count of AI lines written so far. */
export function LinesWritten({ done, total, className }: { done: number; total: number; className?: string }) {
  const t = useT();
  if (total <= 0) return null;
  return (
    <p role="status" aria-live="polite" className={cn("text-[0.8125rem] text-muted-foreground tabular-nums", className)}>
      {t("ai.progress.lines", { done: Math.min(done, total), total })}
    </p>
  );
}

function FooterNote({ children, details, className }: { children: ReactNode; details?: ReactNode; className?: string }) {
  return (
    <p className={cn("inline-flex max-w-full items-center gap-1.5 text-[0.8125rem] text-muted-foreground", className)}>
      <span className="min-w-0 text-pretty">{children}</span>
      {details}
    </p>
  );
}

/** The guard kept these fields from the library (AI-§K.5). `labels` names a path for the owner ("Headline"). */
export function KeptNote({ fields, labels, className }: { fields: readonly string[]; labels?: Readonly<Record<string, string>>; className?: string }) {
  const t = useT();
  if (!fields.length) return null;
  return (
    <FooterNote
      className={className}
      details={
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={t("ai.note.kept_fields")}
              className="inline-grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none pointer-coarse:size-11"
            >
              <InfoIcon aria-hidden="true" className="size-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 gap-1.5 p-3">
            <p className="text-[0.75rem] font-medium text-muted-foreground">{t("ai.note.kept_fields")}</p>
            <ul className="grid gap-1 text-[0.8125rem]">
              {fields.map((f) => (
                <li key={f} className="truncate">
                  {labels?.[f] ?? <bdi dir="ltr">{f}</bdi>}
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
      }
    >
      {t("ai.note.kept", { n: fields.length })}
    </FooterNote>
  );
}

/** Headlines the novelty guard re-asked or replaced before the owner saw them (AI-02 (9)). */
export function NoveltyNote({ n, className }: { n: number; className?: string }) {
  const t = useT();
  if (n <= 0) return null;
  return <FooterNote className={className}>{t("ai.note.novelty", { n })}</FooterNote>;
}
