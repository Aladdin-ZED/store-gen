/**
 * banner — the closing color panel. A large rounded panel in a contrasting color block (its own
 * data-bg, so every token re-resolves inside it) holds the heading, the order button and the
 * reassurance strip; the product breaks out of the panel:
 *  cutout  stands on the panel floor in its own light and rises through the top edge
 *  photo   (upright) a tall card in the archetype's mask, slightly tilted, crossing the top edge
 *  wide    (landscape) a wide card that slides out of the panel's end edge — a tall crop would cut
 *          the product out of its own picture
 * Real-data glass chips (rating, saving) ride on the product, which drifts on scroll. The panel is
 * a flat slab of its own colour with the archetype's ambient piece (no mesh of lights: core D60, V40). Without any product
 * visual the panel becomes a split statement (title | lead, button, points).
 */
import type { ReactElement } from "react";
import type { Archetype, SectionBg } from "@/lib/page/schema";
import { GlowOrb } from "@/landing/illustrations";
import { SectionHeader, cssVars, cx, reveal, seededRotation } from "@/landing/primitives";
import type { RenderContext } from "../../types";
import { CARD_RATIO_LG, cardFrame, cardMask, cardShape, wideFrame } from "./fit";
import { isWide, pickVisual, titleScale, type CtaData, type ViewProps } from "./model";
import { Ambient, OrderButton, Points, ProductPic, RatingChip, SaveChip } from "./parts";

/** Archetypes whose language is dark & precise: their panel goes dark on light pages. */
const DARKISH: ReadonlySet<Archetype> = new Set<Archetype>(["maison", "circuit", "kinetic", "garage", "editorial"]);

/** Panel color: the merchant's choice, else the block that contrasts best with the section. */
export function panelTone(data: CtaData, bg: SectionBg, ctx: RenderContext): SectionBg {
  if (data.panel !== "auto") return data.panel;
  const arch = ctx.archetype;
  const darkPage = ctx.doc.theme.palette.base === "dark";
  if (bg === "base" || bg === "soft" || bg === "surface") return darkPage ? "accent" : DARKISH.has(arch) ? "dark" : "accent";
  if (bg === "dark") return "accent";
  if (bg === "accent") return arch === "playground" || arch === "bloom" ? "pop" : "dark";
  return arch === "playground" ? "accent" : "dark";
}

export function Banner({ ctx, data, id, bg, titleId }: ViewProps): ReactElement {
  // the card takes the page's mask at an aspect close to the photo's own (a stadium on circle pages);
  // an upright card is the signature (it crosses the panel's top edge), so a landscape photo is chosen
  // only when it frames the product clearly better
  const shape = cardShape(ctx);
  const visual = pickVisual(ctx, data, {
    preferCutout: true,
    frameOf: (a) => (isWide(a) ? wideFrame(shape) : cardFrame(a, shape)),
    prefer: (a) => (isWide(a) ? 1.5 : 0),
  });
  const kind = !visual.asset ? "none" : visual.cutout ? "cutout" : visual.wide ? "wide" : "photo";
  const framed = kind === "photo" || kind === "wide";
  const rot = framed ? seededRotation(ctx, `${id}:banner`, kind === "wide" ? 0.6 : 0.9) : 0;
  // a long title steps down a size: the panel stays a panel, not a wall of type
  const size = titleScale(data.title) === "m" ? "m" : "l";
  const actions = (
    <>
      <div className="lp-cta__actions" {...reveal("rise", 280)}>
        <OrderButton ctx={ctx} data={data} size="l" />
      </div>
      <Points ctx={ctx} data={data} delay={420} />
    </>
  );
  return (
    <div className="lp-container lp-cta__wrap lp-cq">
      <div className="lp-cta__panel" data-bg={panelTone(data, bg, ctx)} data-media={kind} {...reveal("scale-in")}>
        <div className="lp-cta__panel-bg" aria-hidden="true">
          <Ambient ctx={ctx} uid={`${id}-panel`} scope="panel" />
        </div>
        {kind !== "none" ? (
          <div className="lp-cta__media" style={cssVars({ "--rot": `${rot}deg`, "--card-r": visual.frame ? String(visual.frame.ratio) : null })}>
            <div className="lp-cta__lift" data-parallax="0.04">
              {kind === "cutout" ? (
                <div className="lp-cta__cutout" {...reveal("rise", 180)}>
                  <GlowOrb size="120%" intensity="strong" place="center" className="lp-cta__glow" />
                  <span className="lp-cta__contact" aria-hidden="true" />
                  <ProductPic ctx={ctx} visual={visual} sizes="(min-width: 64rem) 30rem, 80vw" />
                </div>
              ) : (
                <div className="lp-cta__frame" data-shape={visual.frame?.shape} {...reveal("tilt-in", 180)}>
                  {/* product-tinted light spilling around the card onto the panel */}
                  <GlowOrb size="135%" intensity="medium" place="center" className="lp-cta__glow" />
                  <ProductPic
                    ctx={ctx}
                    visual={visual}
                    sizes={kind === "wide" ? "(min-width: 64rem) 38rem, 88vw" : "(min-width: 64rem) 26rem, 72vw"}
                    className="lp-cta__shape"
                    mask={cardMask(visual.frame)}
                    // desktop: the card runs from above the panel's top edge down to its padding line
                    frameLg={kind === "photo" && visual.frame ? { shape: visual.frame.shape, ratio: CARD_RATIO_LG } : undefined}
                    frameMin="48rem"
                  />
                </div>
              )}
              {data.chips ? (
                <>
                  <RatingChip ctx={ctx} className="lp-cta__media-rating" delay={520} />
                  <SaveChip ctx={ctx} className="lp-cta__media-save" delay={640} />
                </>
              ) : null}
            </div>
          </div>
        ) : null}
        <div className={cx("lp-cta__copy", "lp-above-decor")}>
          {kind === "none" ? (
            // no product visual: the panel reads as a split statement — title | lead, button, points
            <SectionHeader ctx={ctx} kicker={data.kicker} title={data.title} lead={data.lead} align="split" size={size} titleId={titleId} editBase="" className="lp-cta__head">
              {actions}
            </SectionHeader>
          ) : (
            <>
              <SectionHeader ctx={ctx} kicker={data.kicker} title={data.title} lead={data.lead} size={size} titleId={titleId} editBase="" className="lp-cta__head" />
              {actions}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
