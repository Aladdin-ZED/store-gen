import type { ReactElement } from "react";
import type { RenderContext } from "../types";
import { Ornament } from "./Ornament";
import { lookOf, RichText } from "./RichText";
import { cx, reveal, type RevealKind } from "./util";

export interface KickerProps {
  ctx: RenderContext;
  text: string | undefined | null;
  /** show the archetype glyph (dot · spark · diamond) before the text (default: when ctx.ornament > 0) */
  ornament?: boolean;
  /**
   * pill — a soft tinted capsule; label — bare small label; auto (default) — per archetype
   * (pills for the soft languages, bare labels for maison, kinetic, editorial and garage)
   */
  look?: "auto" | "pill" | "label";
  as?: "p" | "span" | "div";
  className?: string;
  editPath?: string;
  reveal?: RevealKind | false;
  delay?: number;
}

/**
 * Label above a title: glyph + small label type (“● Formule au karité”), as a pill or a bare label. Under a look
 * (design.md DES-§4.5.4, DES-§5.8) a kicker is plain topic words: a bare label in the look's label style
 * (--lp-label-*), with the look's glyph only when its kit has one (data-glyph) and no pill unless asked for.
 */
export function Kicker({ ctx, text, ornament, look = "auto", as = "p", className, editPath, ...rv }: KickerProps): ReactElement | null {
  if (!text || !text.trim()) return null;
  const Tag = as;
  if (lookOf(ctx)) {
    const glyph = ornament ?? ctx.doc.theme.look?.kit.gl !== "none";
    return (
      <Tag className={cx("lp-kicker", `lp-kicker--${look === "pill" ? "pill" : "label"}`, className)} {...reveal(rv.reveal, rv.delay)}>
        {glyph ? <Ornament ctx={ctx} className="lp-kicker__ornament" /> : null}
        <RichText as="span" className="lp-kicker__text" text={text} ctx={ctx} decorate={false} editPath={editPath} />
      </Tag>
    );
  }
  const glyph = ornament ?? ctx.ornament > 0;
  return (
    <Tag className={cx("lp-kicker", look !== "auto" && `lp-kicker--${look}`, className)} {...reveal(rv.reveal, rv.delay)}>
      {glyph ? <Ornament ctx={ctx} className="lp-kicker__ornament" /> : null}
      <RichText as="span" className="lp-kicker__text" text={text} ctx={ctx} decorate={false} editPath={editPath} />
    </Tag>
  );
}

export interface EyebrowProps {
  ctx: RenderContext;
  text: string | undefined | null;
  /** leading index, e.g. "01" or "N°07" */
  number?: string;
  as?: "p" | "span" | "div";
  className?: string;
  editPath?: string;
  reveal?: RevealKind | false;
  delay?: number;
}

/** Editorial eyebrow: optional index, a short hairline, then the label (“01 ── Bienfaits”). */
export function Eyebrow({ ctx, text, number, as = "p", className, editPath, ...rv }: EyebrowProps): ReactElement | null {
  if ((!text || !text.trim()) && !number) return null;
  const Tag = as;
  return (
    <Tag className={cx("lp-eyebrow", className)} {...reveal(rv.reveal, rv.delay)}>
      {number ? <span className="lp-eyebrow__num">{number}</span> : null}
      <span className="lp-eyebrow__rule" aria-hidden="true" />
      {text ? <RichText as="span" text={text} ctx={ctx} decorate={false} editPath={editPath} /> : null}
    </Tag>
  );
}
