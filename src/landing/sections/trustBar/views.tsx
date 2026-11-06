/**
 * The four trust bar compositions (one signature moment each):
 *  chips   → glass dock: one frosted capsule on a band of product light, split into one segment per
 *          promise. A solid accent "thumb" marks the lead promise and glides to the segment under the
 *          pointer with a spring (segmented-control morph). Bento tiles inside the glass on phones.
 *  stamps  (id kept for saved pages) renders as the chips row: no medals, no ring text (design.md
 *          DES-§5.13 S8, owner rule 2, S17, RTL3); see index.tsx REDRAWN.
 *  ledger  Swiss columns: the frame rules draw across, the dividers grow down, an accent bar on each
 *          column's top rule stretches across its column on hover. A precise list on phones.
 *  ribbon  a color band: the lead promise pinned at the start as an inverted capsule, the other
 *          promises sliding under it in a smooth marquee. On a neutral block the band floats, tilted
 *          a touch on playful archetypes, and runs past the panel edge to the screen edges.
 */
import type { ReactElement } from "react";
import { GlowOrb } from "@/landing/illustrations";
import { cssVars, cx, Icon, MarqueeTrack, pad2, reveal, RichText, seededRotation } from "@/landing/primitives";
import type { Archetype, SectionBg } from "@/lib/page/schema";
import { glueRanges, type Claim, type Data, type ViewProps } from "./model";
import type { RenderContext } from "../../types";

/* ------------------------------------------------------------------ */
/* Shared pieces                                                       */
/* ------------------------------------------------------------------ */

/** The section's h2: visually hidden unless the merchant shows it. */
function Heading({ ctx, data, titleId }: { ctx: RenderContext; data: Data; titleId?: string }): ReactElement | null {
  if (!titleId) return null;
  const shown = data.showTitle;
  return (
    <RichText
      as="h2"
      id={titleId}
      ctx={ctx}
      text={data.title}
      editPath="title"
      className={shown ? "lp-trustBar__title" : "lp-visually-hidden"}
      decorate={shown}
      reveal={shown ? "blur-in" : false}
    />
  );
}

function Name({ ctx, c }: { ctx: RenderContext; c: Claim }): ReactElement {
  return <RichText as="span" className="lp-trustBar__name" text={glueRanges(c.title, ctx.dir)} ctx={ctx} decorate={false} editPath={`items.${c.i}.title`} />;
}

function Detail({ ctx, c }: { ctx: RenderContext; c: Claim }): ReactElement | null {
  if (!c.detail) return null;
  return <RichText as="span" className="lp-trustBar__detail" text={glueRanges(c.detail, ctx.dir)} ctx={ctx} decorate={false} editPath={`items.${c.i}.detail`} />;
}

const count = (claims: Claim[]) => cssVars({ "--n": claims.length });

/* ------------------------------------------------------------------ */
/* chips → glass dock                                                  */
/* ------------------------------------------------------------------ */

export function Chips({ ctx, data, claims, titleId }: ViewProps): ReactElement {
  return (
    <div className="lp-container lp-trustBar__wrap">
      <Heading ctx={ctx} data={data} titleId={titleId} />
      <div className="lp-trustBar__stage">
        {/* product light under the glass: the frost has a color to pick up */}
        <GlowOrb className="lp-trustBar__glow" shape="wide" intensity={ctx.ornament < 0.35 ? "subtle" : "soft"} place="center" />
        <ul
          className="lp-trustBar__list lp-trustBar__dock"
          role="list"
          data-n={claims.length}
          data-stagger="70"
          style={count(claims)}
          {...reveal("scale-in")}
        >
          {claims.map((c, k) => (
            // --k drives the gliding thumb and hides the hairlines next to it
            <li
              key={c.i}
              className={cx("lp-trustBar__item", k === 0 && "lp-trustBar__item--lead")}
              style={cssVars({ "--k": k })}
              {...reveal("blur-in")}
            >
              <span className="lp-trustBar__body">
                <span className="lp-trustBar__icon" aria-hidden="true">
                  <Icon name={c.icon} size="1.2em" strokeWidth={1.8} />
                </span>
                <span className="lp-trustBar__copy">
                  <Name ctx={ctx} c={c} />
                  <Detail ctx={ctx} c={c} />
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* ledger                                                              */
/* ------------------------------------------------------------------ */

export function Ledger({ ctx, data, claims, titleId }: ViewProps): ReactElement {
  return (
    <div className="lp-container lp-trustBar__wrap">
      <Heading ctx={ctx} data={data} titleId={titleId} />
      <ul className="lp-trustBar__list" role="list" data-reveal="draw" data-stagger="90" data-n={claims.length} style={count(claims)}>
        {claims.map((c, k) => (
          <li key={c.i} className="lp-trustBar__item" {...reveal("rise")}>
            <span className="lp-trustBar__mark" aria-hidden="true" />
            <span className="lp-trustBar__idx" aria-hidden="true">
              {pad2(k + 1)}
            </span>
            <span className="lp-trustBar__icon" aria-hidden="true">
              <Icon name={c.icon} size="100%" strokeWidth={1.25} />
            </span>
            <span className="lp-trustBar__copy">
              <Name ctx={ctx} c={c} />
              <Detail ctx={ctx} c={c} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* ribbon                                                              */
/* ------------------------------------------------------------------ */

/** Archetypes whose strips move at a brisker pace by default. */
const BRISK: ReadonlySet<Archetype> = new Set(["kinetic", "garage", "playground"]);

/** WCAG relative luminance of a #rrggbb color (0 black … 1 white); 0.5 when unparsable. */
function luminance(hex: string): number {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return 0.5;
  const lin = (h: string) => {
    const c = parseInt(h, 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(m[1]!) + 0.7152 * lin(m[2]!) + 0.0722 * lin(m[3]!);
}

/**
 * Color block of a band floating on the section: the accent, unless it would melt into the block
 * (a near-black accent on a dark block takes the pop color, a pale accent on a light block goes dark).
 */
function bandBg(ctx: RenderContext, bg: SectionBg): SectionBg {
  const dark = bg === "dark" || (ctx.doc.theme.palette.base === "dark" && bg !== "accent" && bg !== "pop");
  const lum = luminance(ctx.doc.theme.palette.accent);
  if (dark && lum < 0.08) return "pop";
  if (!dark && lum > 0.62) return "dark";
  return "accent";
}

/** On a color block the section IS the band; on any other block a color band floats inside it. */
export const ownsBand = (bg: SectionBg): boolean => bg === "accent" || bg === "pop";

export function Ribbon({ id, bg, ctx, data, claims, titleId }: ViewProps): ReactElement {
  const own = ownsBand(bg);
  const speed = data.speed !== "auto" ? data.speed : BRISK.has(ctx.archetype) ? "normal" : "slow";
  // calm pages (quiet products, luxury) keep the band level: a lean reads as noise there
  const tilt = own || ctx.motion === "calm" ? 0 : Math.max(-2, Math.min(2, seededRotation(ctx, `${id}:ribbon`, 0.85)));
  // the lead promise stays pinned; the others travel (a single promise simply travels)
  const [lead, ...rest] = claims;
  const pinned = rest.length > 0 ? lead : undefined;
  const ticks = (pinned ? rest : claims).map((c) => (
    <span key={c.i} className="lp-trustBar__tick">
      <span className="lp-trustBar__icon" aria-hidden="true">
        <Icon name={c.icon} size="1em" strokeWidth={1.9} />
      </span>
      <Name ctx={ctx} c={c} />
    </span>
  ));
  return (
    <div className="lp-trustBar__wrap">
      {data.showTitle ? (
        <div className="lp-container">
          <Heading ctx={ctx} data={data} titleId={titleId} />
        </div>
      ) : (
        <Heading ctx={ctx} data={data} titleId={titleId} />
      )}
      <div
        className={cx("lp-trustBar__band", own && "lp-trustBar__band--own")}
        data-bg={own ? undefined : bandBg(ctx, bg)}
        data-tilt={tilt !== 0 ? "" : undefined}
        style={cssVars({ "--tilt": tilt ? `${tilt}deg` : null })}
        {...reveal("wipe-side")}
      >
        {/* first in reading order; laid over the start of the track */}
        {pinned ? (
          <span className="lp-trustBar__pin">
            <span className="lp-trustBar__pincap" {...reveal("blur-in")}>
              <span className="lp-trustBar__icon" aria-hidden="true">
                <Icon name={pinned.icon} size="1.05em" strokeWidth={1.9} />
              </span>
              <Name ctx={ctx} c={pinned} />
            </span>
          </span>
        ) : null}
        <MarqueeTrack ctx={ctx} items={ticks} speed={speed} minItems={8} className="lp-trustBar__ticker" />
      </div>
    </div>
  );
}
