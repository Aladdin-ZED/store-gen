import type { ReactElement, ReactNode } from "react";
import type { Archetype } from "@/lib/page/schema";
import { ARCHETYPE_DEFS } from "@/lib/theme/archetypes";
import { fontData } from "@/lib/theme/fonts";
import type { RenderContext } from "../types";
import { Kicker, type KickerProps } from "./Kicker";
import { inlineText, parseInline } from "./markup";
import { lookOf, RichText } from "./RichText";
import { cssVars, cx, joinPath, reveal, type RevealKind } from "./util";

/** Title entrance per archetype (DESIGN.md §3 motion column) — sections may override. */
export const TITLE_REVEAL: Record<Archetype, RevealKind> = {
  maison: "blur-in",
  apothecary: "rise",
  souk: "rise",
  playground: "tilt-in",
  kinetic: "wipe-up",
  circuit: "blur-in",
  hearth: "rise",
  bloom: "blur-in",
  field: "rise",
  editorial: "wipe-up",
  garage: "wipe-up",
};

export interface SectionHeaderProps {
  ctx: RenderContext;
  kicker?: string | null;
  title: string | null | undefined;
  lead?: string | null;
  /** start (default), center, or split (title | lead side by side on desktop) */
  align?: "start" | "center" | "split";
  /** editorial section number, e.g. "01" */
  number?: string;
  /**
   * Data path prefix for click-to-edit: fields are `${editBase}.kicker|title|lead`
   * ("" → "kicker"/"title"/"lead"). Omit to disable.
   */
  editBase?: string;
  titleAs?: "h1" | "h2" | "h3";
  /** title scale: m → lp-h2, l (default) → lp-h1, xl → lp-display-3 */
  size?: "m" | "l" | "xl";
  /** id on the title (use with SectionShell labelledBy) */
  titleId?: string;
  titleReveal?: RevealKind | false;
  /** reveal the title word by word (blur-to-sharp + rise, staggered). Default true. */
  titleSplit?: boolean;
  /** kicker look (pill / bare label); default per archetype */
  kickerLook?: KickerProps["look"];
  /** false disables all reveal attributes */
  animate?: boolean;
  /** hairline that runs out from the meta row, drawn on reveal */
  rule?: boolean;
  className?: string;
  /** extra content under the lead (rating, CTA…) */
  children?: ReactNode;
  /**
   * How the head opens (design.md DES-§5.8, G32; under a look only, a document without one keeps today's head):
   * `bare` the title alone · `caption` a small caption column at inline-start (`caption`) · `number` a plain list
   * number (`number`), never on a kicker · `quote` the lead first, as a pulled line · `image` the section's first image
   * above the title (`openerImage`) · `kicker` today's meta row. The kicker string is ignored unless it is `kicker`
   * (the default). An opener without its material falls back to `bare`.
   */
  opener?: Opener;
  /** the caption column of the `caption` opener */
  caption?: string | null;
  /** the image of the `image` opener (the section's first image, already rendered) */
  openerImage?: ReactNode;
}

/** The section-head openers (design.md DES-§5.8; the same list as src/lib/design/consts.ts OPENERS). */
export type Opener = "bare" | "caption" | "number" | "quote" | "image" | "kicker";

const TITLE_CLASS = { m: "lp-h2", l: "lp-h1", xl: "lp-display-3" } as const;

const ARABIC_LETTER = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFC]/;
/** breakable whitespace (no-break spaces keep their words together) */
const BREAK = /[^\S\u00A0\u2007\u202F]+/;

/**
 * Width (em of the display face) of the title's longest unbreakable word — base.css caps the title
 * size so it always fits its column (--sh-word → --lp-fs-cap). From the face's measured lowercase
 * advance (font manifest), wider at display weight and wider again in capitals; Arabic letter
 * shapes vary too much for a metric (0.35–0.57 em measured), so a middle-high value. Null for
 * words too short to ever overflow.
 */
export function longestWordEm(ctx: RenderContext, title: string): number | null {
  const words = inlineText(parseInline(title))
    .split(BREAK)
    // a line may break after a hyphen ("anti-chute")
    .flatMap((w) => w.split(/(?<=[-\u2010])/));
  const id = ctx.locale === "ar" ? ctx.doc.theme.fonts.displayAr : ctx.doc.theme.fonts.display;
  const m = fontData(id)?.metrics;
  const base = m && m.unitsPerEm > 0 ? m.xWidthAvg / m.unitsPerEm : 0.48;
  const upper = ctx.locale !== "ar" && ARCHETYPE_DEFS[ctx.archetype]?.display.case === "uppercase";
  let best = 0;
  for (const w of words) {
    const n = [...w].length;
    if (!n) continue;
    const em = ARABIC_LETTER.test(w) ? n * 0.52 : n * Math.min(0.78, Math.max(0.36, base * (upper ? 1.55 : 1.12)));
    best = Math.max(best, em);
  }
  return best >= 3.5 ? Math.round(best * 100) / 100 : null;
}

/**
 * Modern editorial heading block: a meta row (optional tabular section number · kicker pill with
 * the archetype glyph), a big balanced title on the archetype's fluid scale that reveals word by
 * word, and a lead held to a comfortable measure. Choreography: meta fades, title words cascade,
 * lead follows.
 */
export function SectionHeader({
  ctx,
  kicker,
  title,
  lead,
  align = "start",
  number,
  editBase,
  titleAs = "h2",
  size = "l",
  titleId,
  titleReveal,
  titleSplit = true,
  kickerLook,
  animate = true,
  rule = false,
  className,
  children,
  opener,
  caption,
  openerImage,
}: SectionHeaderProps): ReactElement | null {
  if (lookOf(ctx)) {
    return LookHeader({ ctx, kicker, title, lead, align, number, editBase, titleAs, size, titleId, titleReveal, titleSplit, kickerLook, animate, rule, className, children, opener, caption, openerImage });
  }
  const hasTitle = !!title && !!title.trim();
  const hasLead = !!lead && !!lead.trim();
  const num = number?.trim();
  const hasMeta = !!num || (!!kicker && !!kicker.trim());
  if (!hasTitle && !hasLead && !hasMeta && !children) return null;
  const tKind = titleReveal === undefined ? TITLE_REVEAL[ctx.archetype] : titleReveal;
  const word = hasTitle ? longestWordEm(ctx, title!) : null;
  return (
    <header
      className={cx("lp-sh", `lp-sh--${align}`, `lp-sh--${size}`, rule && "lp-sh--rule", className)}
      style={word ? cssVars({ "--sh-word": word }) : undefined}
    >
      {hasMeta ? (
        <div className="lp-sh__meta" {...reveal(animate && "fade")}>
          {num ? (
            <span className="lp-sh__num" aria-hidden="true">
              {num}
            </span>
          ) : null}
          <Kicker ctx={ctx} text={kicker} as="span" look={kickerLook} editPath={joinPath(editBase, "kicker")} />
          {rule ? <span className="lp-sh__rule" aria-hidden="true" {...reveal(animate && "wipe-side", 120)} /> : null}
        </div>
      ) : null}
      {hasTitle ? (
        <RichText
          as={titleAs}
          id={titleId}
          className={cx("lp-sh__title", TITLE_CLASS[size])}
          text={title}
          ctx={ctx}
          editPath={joinPath(editBase, "title")}
          reveal={animate && tKind}
          delay={hasMeta ? 90 : 0}
          split={animate && !!tKind && titleSplit}
        />
      ) : null}
      {hasLead || children ? (
        <div className="lp-sh__side">
          {hasLead ? (
            <RichText
              as="div"
              block
              className="lp-sh__lead lp-lead"
              text={lead}
              ctx={ctx}
              editPath={joinPath(editBase, "lead")}
              reveal={animate && "fade"}
              delay={320}
            />
          ) : null}
          {children ? <div className="lp-sh__extra">{children}</div> : null}
        </div>
      ) : null}
    </header>
  );
}

/**
 * The head under a look (DES-§4.5.4, DES-§5.8, T2): one opener, the title revealed as a whole line (the word split only
 * when the caller asks for it explicitly), the lead with `text-wrap: pretty`. Every opener keeps the same title and
 * lead markup, so a section's CSS needs no per-opener rules beyond the opener's own element.
 */
function LookHeader({
  ctx,
  kicker,
  title,
  lead,
  align = "start",
  number,
  editBase,
  titleAs = "h2",
  size = "l",
  titleId,
  titleReveal,
  titleSplit = false,
  kickerLook,
  animate = true,
  rule = false,
  className,
  children,
  opener = "kicker",
  caption,
  openerImage,
}: SectionHeaderProps): ReactElement | null {
  const hasTitle = !!title && !!title.trim();
  const hasLead = !!lead && !!lead.trim();
  const num = number?.trim();
  // an opener without its material falls back to the bare title; the list number is the `number` opener's alone
  // (never on a kicker, DES-§4.5.4), so a kicker opener without a kicker string is bare even when a number is given
  const kind: Opener =
    opener === "kicker" && !(kicker && kicker.trim())
      ? "bare"
      : opener === "caption" && !(caption && caption.trim())
        ? "bare"
        : opener === "number" && !num
          ? "bare"
          : opener === "quote" && !hasLead
            ? "bare"
            : opener === "image" && !openerImage
              ? "bare"
              : opener;
  if (!hasTitle && !hasLead && kind === "bare" && !children) return null;
  const tKind = titleReveal === undefined ? TITLE_REVEAL[ctx.archetype] : titleReveal;
  const word = hasTitle ? longestWordEm(ctx, title!) : null;
  const leadNode = (pulled: boolean) =>
    hasLead ? (
      <RichText
        as="div"
        block
        className={cx(pulled ? "lp-sh__pull" : "lp-sh__lead", "lp-lead")}
        text={lead}
        ctx={ctx}
        editPath={joinPath(editBase, "lead")}
        reveal={animate && "fade"}
        delay={pulled ? 0 : 320}
      />
    ) : null;
  return (
    <header
      className={cx("lp-sh", `lp-sh--${align}`, `lp-sh--${size}`, rule && "lp-sh--rule", className)}
      data-opener={kind}
      style={word ? cssVars({ "--sh-word": word }) : undefined}
    >
      {kind === "kicker" ? (
        <div className="lp-sh__meta" {...reveal(animate && "fade")}>
          <Kicker ctx={ctx} text={kicker} as="span" look={kickerLook} editPath={joinPath(editBase, "kicker")} />
          {rule ? <span className="lp-sh__rule" aria-hidden="true" {...reveal(animate && "wipe-side", 120)} /> : null}
        </div>
      ) : kind === "caption" ? (
        <p className="lp-sh__caption" {...reveal(animate && "fade")}>
          <RichText as="span" text={caption} ctx={ctx} decorate={false} />
        </p>
      ) : kind === "number" ? (
        <span className="lp-sh__index" aria-hidden="true" data-num="" {...reveal(animate && "fade")}>
          <bdi dir="ltr">{num}</bdi>
        </span>
      ) : kind === "image" ? (
        <div className="lp-sh__opener-img">{openerImage}</div>
      ) : kind === "quote" ? (
        leadNode(true)
      ) : null}
      {hasTitle ? (
        <RichText
          as={titleAs}
          id={titleId}
          className={cx("lp-sh__title", TITLE_CLASS[size])}
          text={title}
          ctx={ctx}
          editPath={joinPath(editBase, "title")}
          reveal={animate && tKind}
          delay={kind === "bare" || kind === "image" ? 0 : 90}
          split={animate && !!tKind && titleSplit}
        />
      ) : null}
      {(hasLead && kind !== "quote") || children ? (
        <div className="lp-sh__side">
          {kind !== "quote" ? leadNode(false) : null}
          {children ? <div className="lp-sh__extra">{children}</div> : null}
        </div>
      ) : null}
    </header>
  );
}
