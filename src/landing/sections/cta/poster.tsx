/**
 * poster — a typographic finale on the flat colour field of its block (no mesh of lights: core D60, V40). The headline is set
 * huge (scaled to its length so it never overflows) with the product photo set inline in it as a
 * rounded pill that opens as the words land; a calm base row carries the lead, the reassurance
 * points and the big order button with the live price. Centered for the soft languages, flush to
 * the start edge for the precise ones (kinetic, circuit, editorial, garage).
 */
import type { ReactElement } from "react";
import type { Archetype } from "@/lib/page/schema";
import { Kicker, RichText, TITLE_REVEAL, cssVars, cx, editAttr, reveal } from "@/landing/primitives";
import { POSTER_PILL } from "./fit";
import { pickVisual, splitTitle, titleScale, wordCount, type ViewProps } from "./model";
import { Ambient, OrderButton, Points, ProductPic, RatingChip } from "./parts";

const START_ALIGNED: ReadonlySet<Archetype> = new Set<Archetype>(["kinetic", "circuit", "editorial", "garage"]);

/** Base delay of the headline and the word cascade gap (base.css --rv-word-gap). */
const TITLE_DELAY = 80;
const WORD_GAP = 55;

export function Poster({ ctx, data, id, titleId }: ViewProps): ReactElement {
  // a regular photo crops best into the pill (the one whose subject frames cleanly in it: a face
  // whole as a bust, a product whole); a cutout sits on a tinted pill
  const visual = pickVisual(ctx, data, { preferCutout: false, frameOf: () => POSTER_PILL });
  const pill = data.inlineImage && !!visual.asset;
  const [first, rest] = pill ? splitTitle(data.title) : [data.title, ""];
  const kind = TITLE_REVEAL[ctx.archetype];
  const n1 = wordCount(first);
  const pillDelay = TITLE_DELAY + n1 * WORD_GAP;
  const hasKicker = !!data.kicker.trim();
  const rating = ctx.product.rating ? <RatingChip ctx={ctx} className="lp-cta__meta-rating" delay={160} /> : null;
  return (
    <>
      <Ambient ctx={ctx} uid={`${id}-field`} scope="field" />
      <div
        className="lp-container lp-container--wide lp-cta__wrap lp-cq lp-above-decor"
        data-align={START_ALIGNED.has(ctx.archetype) ? "start" : "center"}
      >
        {hasKicker || rating ? (
          <div className="lp-cta__meta">
            {hasKicker ? <Kicker ctx={ctx} text={data.kicker} editPath="kicker" reveal="fade" /> : null}
            {rating}
          </div>
        ) : null}
        <h2
          id={titleId}
          className={cx("lp-cta__giant", `lp-cta__giant--${titleScale(data.title)}`, "lp-split")}
          style={cssVars({ "--pill-d": `${pillDelay}ms` })}
          {...editAttr(ctx, "title")}
          {...reveal(kind, TITLE_DELAY)}
        >
          <RichText as="span" text={first} ctx={ctx} split />
          {pill ? (
            <>
              {" "}
              <span className="lp-cta__pill" data-media={visual.cutout ? "cutout" : "photo"} aria-hidden="true">
                <ProductPic ctx={ctx} visual={visual} sizes="(min-width: 64rem) 16rem, 34vw" decorative />
              </span>
            </>
          ) : null}
          {rest ? (
            <>
              {" "}
              <span className="lp-cta__giant-rest" style={cssVars({ "--d": `${pillDelay + 120}ms` })}>
                <RichText as="span" text={rest} ctx={ctx} split />
              </span>
            </>
          ) : null}
        </h2>
        <div className="lp-cta__base">
          <div className="lp-cta__say">
            <RichText as="p" block className="lp-cta__lead lp-lead" text={data.lead} ctx={ctx} editPath="lead" reveal="rise" delay={240} />
            <Points ctx={ctx} data={data} delay={360} />
          </div>
          <div className="lp-cta__actions" {...reveal("rise", 300)}>
            <OrderButton ctx={ctx} data={data} />
          </div>
        </div>
      </div>
    </>
  );
}
