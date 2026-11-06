/**
 * Pieces shared by the guarantee views: the promise list, the COD fact ("0 DH" in the page's own order), the
 * closing row (order button + link to the delivery & returns policy) and the product photo pick.
 */
import type { ReactElement } from "react";
import { Cta, Icon, RichText, reveal } from "@/landing/primitives";
import type { RenderContext, ResolvedAsset } from "../../types";
import { typo, type GuaranteeData, type PromiseLine } from "./model";

/* ------------------------------------------------------------------ */
/* Promise list                                                        */
/* ------------------------------------------------------------------ */

interface ListProps {
  ctx: RenderContext;
  lines: readonly PromiseLine[];
  /** first reveal delay (ms) and step between rows */
  delay?: number;
  step?: number;
  /** icon glyph size */
  iconSize?: string;
}

/**
 * Promises as a real list: icon in a lit disc, the promise in strong type, its sentence beneath.
 * A promise title becomes an h3 (outline of the section); a sentence-only promise stays a paragraph.
 */
export function PromiseList({ ctx, lines, delay = 160, step = 90, iconSize = "1.5rem" }: ListProps): ReactElement | null {
  if (!lines.length) return null;
  return (
    <ul className="lp-guarantee__list" role="list">
      {lines.map((l, i) => {
        const Head = l.titled ? "h3" : "p";
        return (
          <li key={i} className="lp-guarantee__item" {...reveal("rise", delay + i * step)}>
            <span className="lp-guarantee__ico" aria-hidden="true">
              <Icon name={l.icon} size={iconSize} />
            </span>
            <div className="lp-guarantee__txt">
              <RichText as={Head} className="lp-guarantee__ph" text={typo(ctx.locale, l.head)} ctx={ctx} decorate={false} editPath={l.headPath} />
              {l.body ? <RichText as="p" className="lp-guarantee__pb" text={typo(ctx.locale, l.body)} ctx={ctx} decorate={false} editPath={l.bodyPath} /> : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* The COD fact                                                        */
/* ------------------------------------------------------------------ */

/** “0 DH” split into the number and the currency, in the page's own order (“€0”, “0 درهم”). */
export function zeroAmount(ctx: RenderContext): { n: string; cur: string; before: boolean } {
  const n = ctx.num(0);
  // bidi marks some locales wrap around the symbol would only add invisible width
  const m = ctx.money(0).replace(/[\u200e\u200f\u061c]/g, "");
  const i = m.indexOf(n);
  if (i < 0) return { n: m.trim(), cur: "", before: false };
  return { n, cur: (m.slice(0, i) + m.slice(i + n.length)).trim(), before: i > 0 };
}

/* ------------------------------------------------------------------ */
/* Closing row                                                         */
/* ------------------------------------------------------------------ */

/** Order button + a quiet link to the delivery & returns policy. Nothing when both are off. */
export function Foot({ ctx, data, delay = 0 }: { ctx: RenderContext; data: GuaranteeData; delay?: number }): ReactElement | null {
  if (!data.cta && !data.policyLink) return null;
  return (
    <div className="lp-guarantee__foot" {...reveal("rise", delay)}>
      {data.cta ? <Cta ctx={ctx} label={data.ctaLabel} size="l" wide editPath="ctaLabel" /> : null}
      {data.policyLink ? (
        <a className="lp-guarantee__policy" href={ctx.links.shipping}>
          <span>{ctx.t("footer.shipping")}</span>
          <Icon name="arrow-up-right" size="1em" strokeWidth={2} className="lp-guarantee__policy-ico" />
        </a>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Media                                                               */
/* ------------------------------------------------------------------ */

/** The section's own photo, else an upright product photo (cutouts look unfinished in a frame), else any. */
export function pickPhoto(ctx: RenderContext, data: GuaranteeData): ResolvedAsset | null {
  const own = ctx.asset(data.image);
  if (own) return own;
  const shots: ResolvedAsset[] = [];
  for (const ref of ctx.product.images) {
    const a = ctx.asset(ref);
    if (a && !a.alpha) shots.push(a);
  }
  return shots.find((a) => a.height >= a.width * 0.95) ?? shots[0] ?? ctx.asset(ctx.product.cutout) ?? null;
}

/** Small editable span. */
export function Text({ ctx, text, path, className }: { ctx: RenderContext; text: string; path?: string; className?: string }): ReactElement {
  return (
    <RichText as="span" className={className} text={text} ctx={ctx} decorate={false} editPath={path} />
  );
}
