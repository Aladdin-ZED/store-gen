"use client";
/**
 * The onboarding reveal: three directions as three real page folds (P6 DESIGN; design.md DES-§14.3, UX-01, UX-20,
 * DS58; docs/STORE-SAAS.md §K.2 P0 design stubs, CRIT2-6). P2's `/app/<h>/welcome` step mounts it and owns the step,
 * its timing and its acceptance; P7 fills the two slots (`<DirectorWhy directionId>` in each DNA card and the bottom
 * sheet, its `<DirectorPassControl>` in the bottom action row beside "Use this design", never over a fold).
 *
 * - Phone (< 1024): the folds edge to edge in a snap carousel (92 vw slides, 8 px gap, the next fold peeking at the
 *   inline end), labelled dots under it; a bottom sheet (96 px collapsed with the four chips; expanded: the why line,
 *   the novelty words and the Director slot; Esc closes it) and the sticky 52 px "Use this design" above its handle.
 *   Arrow keys move the carousel (mirrored in Arabic).
 * - Desktop: the three 390 px folds side by side at 100 % on the neutral stage (440 px columns, gap 24); hover or
 *   focus expands one in place to a scrollable 560 × 820 preview while the others shrink to 300 px (240 ms); the DNA
 *   card under each fold; one primary "Use this design", under the active card, with the action slot beside it.
 * - States: analysing (the final layout as a skeleton after 150 ms, kept ≥ 300 ms, with the real step named),
 *   revealed, error (one sentence and "Try again"). Motion: the folds rise 12 px over 420 ms (quint-out, 80 ms
 *   stagger), the cards fade in last (180 ms); reduced motion is a 180 ms crossfade. No bezel, glow or parallax.
 *
 * The props are frozen at P0 (src/lib/contracts/r1-p0.ts) because P2 and P7 merge before P6. `directions` is null
 * while analysing and on error (P0b review F-8); a direction's `card` is null when no GenomeCard exists (the fold,
 * its label and "Use this design" render, the DNA chips do not). The progress step and the novelty state come from
 * ./status.ts, written by `buildRevealDirections`. The why line and the chips are read in the admin's language from
 * the direction's own document once the generator kit is loaded (it is, by then: the directions were built with it).
 */
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { motion, MotionConfig, useReducedMotion } from "motion/react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { revealAssetsAction } from "@/app/app/[store]/generate/actions";
import { LandingThumbnail, type PreviewAssets } from "@/components/preview";
import { Button } from "@/components/ui/button";
import type { GenomeCard } from "@/lib/design/digest";
import { useAdminLocale, useT } from "@/lib/i18n/admin/client";
import type { MessageKey } from "@/lib/i18n/admin";
import type { PageDoc } from "@/lib/page/schema";
import { cn } from "@/lib/utils";
import { useRevealStatus } from "./status";

/** `card` null: no DNA card for this direction (P6's engine not merged, or its digest failed); never an invented one */
export type RevealDirection = { id: string; doc: PageDoc; card: GenomeCard | null; label: string };
export type RevealDirections = readonly [RevealDirection, RevealDirection, RevealDirection];

export type RevealFoldsProps = {
  /** P7's <DirectorWhy directionId>, inside each DNA card / bottom sheet */
  dnaSlot?: (directionId: string) => ReactNode;
  /** P7's <DirectorPassControl>, the bottom action row beside "Use this design" */
  actionSlot?: ReactNode;
  onUse(directionId: string): void;
  onRetry?(): void;
} & (
  | { state: "revealed"; directions: RevealDirections }
  /** null until buildRevealDirections resolves */
  | { state: "analysing"; directions: RevealDirections | null }
  /** null when it rejected */
  | { state: "error"; directions: RevealDirections | null }
);

/**
 * The folds' photo rows. Read from the store through `revealAssetsAction` (the docs carry asset refs only); a story
 * fixture provides its own rows with `RevealAssets` (the frozen props have no assets field).
 */
const NO_ASSETS: PreviewAssets = {};
export const RevealAssets = createContext<PreviewAssets | null>(null);

/** Every asset id the three documents reference. */
function assetIds(directions: RevealDirections): string[] {
  const ids = new Set<string>();
  const visit = (v: unknown, depth: number) => {
    if (depth > 14 || v === null || typeof v !== "object") return;
    if (Array.isArray(v)) {
      for (const x of v) visit(x, depth + 1);
      return;
    }
    const o = v as Record<string, unknown>;
    if (typeof o.id === "string" && /^[a-f0-9]{16,64}$/.test(o.id)) ids.add(o.id);
    for (const x of Object.values(o)) visit(x, depth + 1);
  };
  for (const d of directions) visit(d.doc, 0);
  return [...ids].slice(0, 64);
}

function useRevealAssets(directions: RevealDirections | null): PreviewAssets {
  const provided = useContext(RevealAssets);
  const [rows, setRows] = useState<PreviewAssets>(NO_ASSETS);
  const key = directions ? assetIds(directions).join(",") : "";
  useEffect(() => {
    if (provided || !key) return;
    let alive = true;
    revealAssetsAction(key.split(",")).then(
      (r) => alive && r.ok && setRows(r.data),
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [provided, key]);
  return provided ?? rows;
}
const PENDING = ["pending-1", "pending-2", "pending-3"] as const;
/** quint-out (DES-§16.6) */
const QUINT: [number, number, number, number] = [0.22, 1, 0.36, 1];
/** the fold at 390 × 844 (the only server viewport) and the expanded preview */
const FOLD = { w: 390, h: 844, col: 440, shrunk: 300, open: { w: 560, h: 820 } } as const;
/** the expanded preview scrolls through the first six screens */
const LONG = "390 / 5064";

type Explained = { chips: { key: MessageKey; vars?: Record<string, string> }[]; why: { key: MessageKey; vars: Record<string, string> } };

/** The why line and the chips in the admin's language, from the generator kit (already loaded by the build). */
function useExplained(directions: RevealDirections | null, locale: string): Record<string, Explained> {
  const [out, setOut] = useState<Record<string, Explained>>({});
  useEffect(() => {
    if (!directions) return;
    let alive = true;
    void import("../kit").then(
      (kit) => {
        if (!alive) return;
        const next: Record<string, Explained> = {};
        for (const d of directions) {
          if (!d.card) continue;
          try {
            const { chips, why } = kit.explainGenome(kit.genomeOf(d.doc), { locale: locale === "fr" || locale === "ar" ? locale : "en", accent: d.doc.theme.palette.accent });
            next[d.id] = { chips: chips.slice(0, 4), why };
          } catch {
            // the card's own chip texts stay
          }
        }
        setOut(next);
      },
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [directions, locale]);
  return out;
}

/** analysing → nothing for 150 ms, then the skeleton, kept ≥ 300 ms once shown (DES-§14.3 states). */
function useSkeleton(analysing: boolean): "wait" | "skeleton" | "ready" {
  const [phase, setPhase] = useState<"wait" | "skeleton" | "ready">(analysing ? "wait" : "ready");
  /** when the skeleton appeared in this analysing run (0 = not shown) */
  const shownAt = useRef(0);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (analysing) {
      shownAt.current = 0;
      timer = setTimeout(() => {
        shownAt.current = Date.now();
        setPhase("skeleton");
      }, 150);
    } else {
      const left = shownAt.current ? 300 - (Date.now() - shownAt.current) : 0;
      timer = setTimeout(() => setPhase("ready"), Math.max(0, left));
    }
    return () => clearTimeout(timer);
  }, [analysing]);
  return analysing ? (phase === "ready" ? "wait" : phase) : phase === "wait" ? "ready" : phase;
}

const BAND_ORDER = ["platform", "niche", "own"] as const;

/** The three novelty words (bands only, DS7): `too_close` is never shown (such a candidate is replaced). */
function noveltyKeys(card: GenomeCard): MessageKey[] {
  const out: MessageKey[] = [];
  for (const kind of BAND_ORDER) {
    const band = card.distance[kind];
    if (band === "too_close") continue;
    out.push(`design.novelty.${kind}.${band}` as MessageKey);
  }
  return out;
}

function Chips({ card, explained, className }: { card: GenomeCard; explained?: Explained; className?: string }) {
  const t = useT();
  const texts = explained ? explained.chips.map((c) => t(c.key, c.vars)) : card.explanation.slice(0, 4);
  return (
    <ul className={cn("flex flex-wrap gap-1.5", className)}>
      {texts.map((text, i) => (
        <li key={`${i}-${text}`} className="max-w-full truncate rounded-full bg-foreground/[0.06] px-2.5 py-1 text-[0.72rem] font-medium text-foreground/80">
          {text}
        </li>
      ))}
    </ul>
  );
}

function Novelty({ card }: { card: GenomeCard }) {
  const t = useT();
  const { novelty } = useRevealStatus();
  if (novelty === "unavailable") return <p className="text-[0.75rem] text-muted-foreground">{t("design.wizard.uniqueUnavailable")}</p>;
  if (novelty === "skipped") return null;
  return (
    <ul className="grid gap-1 text-[0.75rem] text-muted-foreground" aria-label={t("design.reveal.unique")}>
      {noveltyKeys(card).map((k) => (
        <li key={k} className="flex items-center gap-2">
          <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", k.endsWith(".close") ? "bg-warn-ink/70" : "bg-brand")} />
          {t(k)}
        </li>
      ))}
    </ul>
  );
}

/** One fold: the draft's first 844 px at 100 % (or the first six screens, scrollable, when expanded). */
function Fold({ d, open, label, assets }: { d: RevealDirection; open: boolean; label: string; assets: PreviewAssets }) {
  return (
    <div
      className={cn(
        "relative mx-auto w-full max-w-[390px] overflow-hidden rounded-[14px] bg-background shadow-[0_1px_2px_rgb(0_0_0/0.06),0_12px_32px_-12px_rgb(0_0_0/0.22)]",
        open && "adm-scroll overflow-y-auto overscroll-contain",
      )}
      style={open ? { height: FOLD.open.h } : { aspectRatio: `${FOLD.w} / ${FOLD.h}` }}
    >
      <LandingThumbnail doc={d.doc} assets={assets} device="mobile" sections={12} aspectRatio={LONG} label={label} className="w-full" />
    </div>
  );
}

export function RevealFolds(props: RevealFoldsProps) {
  const { dnaSlot, actionSlot, onUse, onRetry } = props;
  const t = useT();
  const locale = useAdminLocale();
  const reduced = useReducedMotion();
  const status = useRevealStatus();
  const phase = useSkeleton(props.state === "analysing");
  const directions = props.state === "revealed" ? props.directions : null;
  const explained = useExplained(directions, locale);
  const assets = useRevealAssets(directions);

  if (props.state === "error") {
    return (
      <div className="adm-surface-flat flex flex-wrap items-center gap-3 p-5 text-sm" role="alert">
        <p className="min-w-0 flex-1 text-pretty">{t("design.reveal.error")}</p>
        {onRetry ? (
          <Button variant="outline" className="h-11 rounded-full px-5" onClick={onRetry}>
            {t("design.reveal.retry")}
          </Button>
        ) : null}
      </div>
    );
  }
  if (phase !== "ready" || !directions) {
    const step = status.step ?? "photos";
    return (
      <div className="grid gap-4" aria-busy="true" aria-live="polite">
        <p className="flex items-center gap-2 text-[0.85rem] text-muted-foreground">
          <span aria-hidden="true" className="size-1.5 animate-pulse rounded-full bg-brand" />
          {t(`design.reveal.progress.${step}` as MessageKey)}
        </p>
        {phase === "skeleton" ? <RevealSkeleton ids={props.directions?.map((d) => d.id) ?? [...PENDING]} /> : null}
      </div>
    );
  }
  return (
    <MotionConfig reducedMotion="user">
      <Revealed directions={directions} explained={explained} assets={assets} dnaSlot={dnaSlot} actionSlot={actionSlot} onUse={onUse} reduced={!!reduced} />
    </MotionConfig>
  );
}

/** The skeleton of the exact final layout: three fold boxes and their cards (desktop), one slide and the sheet (phone). */
function RevealSkeleton({ ids }: { ids: readonly string[] }) {
  return (
    <>
      <div className="adm-stage hidden justify-center gap-6 rounded-[1.4rem] p-6 lg:flex" aria-hidden="true">
        {ids.map((id) => (
          <div key={id} className="grid min-w-0 justify-items-center gap-4" style={{ flex: `0 1 ${FOLD.col}px` }}>
            <span className="adm-shimmer block w-full max-w-[390px] rounded-[14px]" style={{ aspectRatio: `${FOLD.w} / ${FOLD.h}` }} />
            <span className="grid w-full max-w-[390px] gap-2">
              <span className="adm-shimmer h-4 w-1/2 rounded-full" />
              <span className="flex gap-1.5">
                <span className="adm-shimmer h-6 w-24 rounded-full" />
                <span className="adm-shimmer h-6 w-20 rounded-full" />
                <span className="adm-shimmer h-6 w-16 rounded-full" />
              </span>
            </span>
          </div>
        ))}
      </div>
      <div className="grid gap-3 lg:hidden" aria-hidden="true">
        <span className="adm-shimmer block w-[92vw] max-w-full rounded-[14px]" style={{ aspectRatio: `${FOLD.w} / ${FOLD.h}` }} />
        <span className="flex justify-center gap-2">
          {ids.map((id) => (
            <span key={id} className="adm-shimmer size-2 rounded-full" />
          ))}
        </span>
      </div>
    </>
  );
}

function Revealed({
  directions,
  explained,
  assets,
  dnaSlot,
  actionSlot,
  onUse,
  reduced,
}: {
  directions: RevealDirections;
  explained: Record<string, Explained>;
  assets: PreviewAssets;
  dnaSlot?: (id: string) => ReactNode;
  actionSlot?: ReactNode;
  onUse(id: string): void;
  reduced: boolean;
}) {
  const t = useT();
  const [active, setActive] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  // one set of initial values on the server and the client (no hydration mismatch); under reduced motion the
  // MotionConfig below drops the rise and the transition is a 180 ms crossfade
  const rise = (i: number) => ({ initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: reduced ? { duration: 0.18 } : { duration: 0.42, ease: QUINT, delay: i * 0.08 } });
  const cardFade = { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.18, delay: reduced ? 0 : 0.42 + 2 * 0.08 } };

  return (
    <>
      {/* desktop: three folds on the stage */}
      <div className="adm-stage hidden justify-center gap-6 rounded-[1.4rem] p-6 lg:flex" onMouseLeave={() => setHover(null)}>
        {directions.map((d, i) => {
          const open = hover === i;
          const shrunk = hover !== null && !open;
          const col = open ? FOLD.open.w : shrunk ? FOLD.shrunk : FOLD.col;
          return (
            <motion.section
              key={d.id}
              {...rise(i)}
              className="group grid min-w-0 content-start gap-4 outline-none transition-[flex-basis] duration-[240ms] ease-out"
              style={{ flex: `0 1 ${col}px` }}
              tabIndex={0}
              aria-label={t("design.reveal.dot", { n: i + 1, label: d.label })}
              onMouseEnter={() => {
                setHover(i);
                setActive(i);
              }}
              onFocus={() => {
                setHover(i);
                setActive(i);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && e.target === e.currentTarget) onUse(d.id);
                if (e.key === "Escape") setHover(null);
              }}
            >
              <div className="rounded-[16px] ring-brand/60 group-focus-visible:ring-2">
                <Fold d={d} open={open} assets={assets} label={t("design.reveal.preview", { label: d.label })} />
              </div>
              <motion.div {...cardFade} className="mx-auto grid w-full max-w-[390px] min-w-0 gap-3">
                <DnaCard d={d} index={i} explained={explained[d.id]} dnaSlot={dnaSlot} />
                {active === i ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="brand" className="h-11 flex-1 rounded-full px-5" onClick={() => onUse(d.id)}>
                      {t("design.reveal.use")}
                    </Button>
                    {actionSlot}
                  </div>
                ) : null}
              </motion.div>
            </motion.section>
          );
        })}
      </div>

      {/* phone: the carousel, its dots, the sheet and the sticky action */}
      <PhoneReveal directions={directions} explained={explained} assets={assets} dnaSlot={dnaSlot} actionSlot={actionSlot} onUse={onUse} rise={rise} />
    </>
  );
}

function DnaCard({ d, index, explained, dnaSlot }: { d: RevealDirection; index: number; explained?: Explained; dnaSlot?: (id: string) => ReactNode }) {
  const t = useT();
  return (
    <div className="grid min-w-0 gap-2.5">
      <p className="flex items-baseline gap-2 text-[0.95rem] font-semibold tracking-[-0.01em]">
        <span className="font-mono text-[0.7rem] font-normal text-muted-foreground tabular-nums">0{index + 1}</span>
        <span className="min-w-0 truncate">{d.label}</span>
      </p>
      {d.card ? (
        <>
          <Chips card={d.card} explained={explained} />
          {explained ? <p className="text-[0.8rem] leading-relaxed text-pretty text-muted-foreground">{t(explained.why.key, explained.why.vars)}</p> : null}
          <Novelty card={d.card} />
        </>
      ) : null}
      {dnaSlot ? <div className="min-w-0">{dnaSlot(d.id)}</div> : null}
    </div>
  );
}

function PhoneReveal({
  directions,
  explained,
  assets,
  dnaSlot,
  actionSlot,
  onUse,
  rise,
}: {
  directions: RevealDirections;
  explained: Record<string, Explained>;
  assets: PreviewAssets;
  dnaSlot?: (id: string) => ReactNode;
  actionSlot?: ReactNode;
  onUse(id: string): void;
  rise: (i: number) => object;
}) {
  const t = useT();
  const scroller = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const current = directions[active] ?? directions[0];

  const goTo = useCallback((i: number) => {
    const el = scroller.current;
    const slide = el?.children[i] as HTMLElement | undefined;
    if (!el || !slide) return;
    slide.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
  }, []);
  const onScroll = useCallback(() => {
    const el = scroller.current;
    const first = el?.children[0] as HTMLElement | undefined;
    if (!el || !first) return;
    // scrollLeft is negative in a right-to-left scroller
    const step = first.offsetWidth + 8;
    setActive(Math.max(0, Math.min(directions.length - 1, Math.round(Math.abs(el.scrollLeft) / step))));
  }, [directions.length]);
  const onKey = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      const rtl = getComputedStyle(e.currentTarget).direction === "rtl";
      const next = rtl ? "ArrowLeft" : "ArrowRight";
      const prev = rtl ? "ArrowRight" : "ArrowLeft";
      if (e.key === next) {
        e.preventDefault();
        goTo(Math.min(directions.length - 1, active + 1));
      } else if (e.key === prev) {
        e.preventDefault();
        goTo(Math.max(0, active - 1));
      } else if (e.key === "Enter") onUse(directions[active]!.id);
    },
    [active, directions, goTo, onUse],
  );
  useEffect(() => {
    if (!open) return;
    const close = (e: globalThis.KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);
  const sheetId = useMemo(() => `reveal-sheet-${directions.map((d) => d.id).join("-")}`, [directions]);

  return (
    <div className="grid gap-3 pb-[172px] lg:hidden">
      <div
        ref={scroller}
        role="region"
        aria-roledescription="carousel"
        aria-label={t("design.reveal.dots")}
        tabIndex={0}
        onScroll={onScroll}
        onKeyDown={onKey}
        className="flex snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain pe-[8vw] outline-none [scrollbar-width:none] focus-visible:ring-2 focus-visible:ring-brand/60"
        style={{ marginInline: "calc(50% - 50vw)" }}
      >
        {directions.map((d, i) => (
          <motion.div key={d.id} {...rise(i)} className="w-[92vw] shrink-0 snap-start" aria-roledescription="slide" aria-label={t("design.reveal.dot", { n: i + 1, label: d.label })}>
            <div className="overflow-hidden" style={{ aspectRatio: `${FOLD.w} / ${FOLD.h}` }}>
              <LandingThumbnail doc={d.doc} assets={assets} device="mobile" sections={4} aspectRatio={`${FOLD.w} / ${FOLD.h}`} label={t("design.reveal.preview", { label: d.label })} className="w-full" />
            </div>
          </motion.div>
        ))}
      </div>
      <div className="flex items-center justify-between gap-3">
        <div role="tablist" aria-label={t("design.reveal.dots")} className="flex items-center gap-1">
          {directions.map((d, i) => (
            <button
              key={d.id}
              type="button"
              role="tab"
              aria-selected={active === i}
              aria-label={t("design.reveal.dot", { n: i + 1, label: d.label })}
              onClick={() => goTo(i)}
              className="grid size-11 place-items-center rounded-full"
            >
              <span className={cn("block h-2 rounded-full transition-[width,background-color] duration-200 ease-out", active === i ? "w-5 bg-foreground" : "w-2 bg-foreground/25")} />
            </button>
          ))}
        </div>
        <Button variant="ghost" className="h-11 rounded-full px-4 text-[0.82rem]" onClick={() => goTo((active + 1) % directions.length)}>
          {t("design.reveal.others")}
        </Button>
      </div>

      {/* the sticky action above the sheet's handle, then the sheet (96 px collapsed) */}
      <div className="fixed inset-x-0 bottom-0 z-40 grid gap-2 px-3 pb-[max(env(safe-area-inset-bottom),8px)]">
        <div className="flex items-center gap-2">
          <Button variant="brand" className="h-[52px] flex-1 rounded-full text-[0.95rem] shadow-lg" onClick={() => onUse(current.id)}>
            {t("design.reveal.use")}
          </Button>
          {actionSlot}
        </div>
        <section id={sheetId} className="adm-surface grid gap-3 overflow-hidden rounded-t-[20px] rounded-b-[14px] px-4 pt-1.5 pb-3 shadow-[0_-8px_24px_-12px_rgb(0_0_0/0.25)]" aria-label={current.label}>
          <button
            type="button"
            className="mx-auto grid h-11 w-full place-items-center"
            aria-expanded={open}
            aria-controls={`${sheetId}-more`}
            aria-label={t(open ? "design.reveal.sheet.close" : "design.reveal.sheet.open")}
            onClick={() => setOpen((o) => !o)}
          >
            <span className="flex items-center gap-2 text-[0.85rem] font-semibold">
              <span className="truncate">{current.label}</span>
              {open ? <ChevronDownIcon className="size-4" /> : <ChevronUpIcon className="size-4" />}
            </span>
          </button>
          {current.card ? <Chips card={current.card} explained={explained[current.id]} className="max-h-[64px] overflow-hidden" /> : null}
          <div id={`${sheetId}-more`} hidden={!open} className="grid max-h-[50dvh] gap-3 overflow-y-auto pb-1">
            {current.card ? (
              <>
                {explained[current.id] ? <p className="text-[0.85rem] leading-relaxed text-pretty text-muted-foreground">{t(explained[current.id]!.why.key, explained[current.id]!.why.vars)}</p> : null}
                <Novelty card={current.card} />
              </>
            ) : null}
            {dnaSlot ? <div className="min-w-0">{dnaSlot(current.id)}</div> : null}
          </div>
        </section>
      </div>
    </div>
  );
}
