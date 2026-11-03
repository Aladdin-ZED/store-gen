/**
 * hero/poster — a full-bleed colour field, type first (design.md DES-§5.13 H3): the headline set big on the field,
 * the product in front of it as one masked print (the page's arch, else a straight rounded rectangle; a cutout
 * stands free), the price cluster crossing the print's lower corner on a contrasting block, then the action and the
 * COD line. The field is a flat slab of its own colour: no mesh of lights (core D60, V40), no turning badge (S17).
 *
 * Optional, never by default (DS56, DES-§4.5.4): `ghost` sets the giant product word edge to edge behind the print
 * (Latin or Arabic, sized from the face's metrics, never clipped); `priceBlock: "band"` draws the price cluster as a
 * full-width band over the action instead of the tag on the print.
 */
import type { ReactElement } from "react";
import type { SectionBg } from "@/lib/page/schema";
import { cssVars, cx, editAttr, Picture, Price, reveal, SectionShell } from "../../primitives";
import { frameAspect, pageMask, posterFlip, visualFacts } from "./framing";
import { HeroCta, HeroLead, HeroMeta, HeroTitle, HeroTrust, heroWord, mainAsset, PackTeaser, titleId, wordAdvance, type HeroProps } from "./parts";

const COLOR_FIELDS: readonly SectionBg[] = ["accent", "dark", "pop"];

/** Arabic letter bodies sit low in the em box: the print overlaps an Arabic word less. */
const ARABIC = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-ﻼ]/;

/** The price block takes the colour that contrasts with the field. */
const TAG_BG: Record<"accent" | "pop" | "dark", SectionBg> = { accent: "dark", pop: "dark", dark: "accent" };

export function PosterHero({ id, variant, bg, data, ctx }: HeroProps): ReactElement {
  // a poster is a colour field: neutral backgrounds are promoted to the accent block
  const field = (COLOR_FIELDS.includes(bg) ? bg : "accent") as "accent" | "pop" | "dark";
  // the giant word is a device the page asks for (≤ 15 % of a niche's pages), never the default
  const word = data.ghost === true ? heroWord(ctx, data) : "";
  const band = data.priceBlock === "band";
  const asset = mainAsset(ctx, data);
  const cutout = !!asset?.alpha;
  // a photo print is 4:5, widened (up to 13:10) for a product lying on its side; the price tag swaps corners when
  // its own would sit on a face, a hand or the product itself
  const ratio = frameAspect(visualFacts(asset), 0.8, 1.3);
  const flip = !cutout && !band && posterFlip(ctx, asset, ratio);
  // the sheet's masks: the page's arch on an upright print, else a straight rounded rectangle
  const shape = !cutout && ratio <= 1 && pageMask(ctx) === "arch" ? "arch" : "rounded";
  const price = <Price ctx={ctx} amount={ctx.lead.price} compareAt={ctx.lead.compareAt} size="xl" showSavings className="lp-hero__price" />;

  const head = (
    <div className="lp-hero__head">
      <HeroMeta ctx={ctx} data={data} />
      <HeroTitle ctx={ctx} data={data} id={id} />
      <HeroLead ctx={ctx} data={data} />
    </div>
  );
  const art = (
    <div className={cx("lp-hero__art", !word && "lp-hero__art--solo")} data-flip={flip ? "" : undefined} data-wide={!cutout && ratio > 1 ? "" : undefined}>
      <div className="lp-hero__print" data-kind={cutout ? "cutout" : "photo"} data-shape={cutout ? undefined : shape} {...reveal("scale-in", 120)}>
        <Picture
          asset={asset}
          sizes={!cutout && ratio > 1 ? "(min-width: 64rem) 34rem, 92vw" : "(min-width: 64rem) 27rem, 76vw"}
          priority
          fit={cutout ? "contain" : "cover"}
          ratio={cutout ? undefined : String(ratio)}
          frame={cutout ? undefined : { shape, ratio }}
          className="lp-hero__pic"
          alt={asset?.alt || ctx.product.name}
        />
      </div>
      {band ? null : (
        <div className="lp-hero__tag" data-bg={TAG_BG[field]} {...reveal("rise", 360)}>
          {price}
        </div>
      )}
    </div>
  );

  return (
    <SectionShell id={id} ctx={ctx} type="hero" variant={variant} bg={field} labelledBy={titleId(id)}>
      <div
        className="lp-container lp-hero__grid"
        data-ghost={word ? "" : undefined}
        data-price={band ? "band" : undefined}
        data-script={word && ARABIC.test(word) ? "ar" : undefined}
        style={word ? cssVars({ "--wl": Math.max(3, [...word].length), "--wadv": wordAdvance(ctx, word) }) : undefined}
      >
        {word ? (
          // a graphic, not a paragraph: Arabic paragraph leading must not open up the giant word
          <div className="lp-hero__mega" aria-hidden="true" {...editAttr(ctx, "bigWord")}>
            <span className="lp-hero__mega-w" {...reveal("wipe-up")}>
              {word}
            </span>
          </div>
        ) : null}
        {/* phones read the sheet top-down: title, print, price and action (the word, when asked for, sits behind the print) */}
        {word ? art : head}
        {word ? head : art}

        <div className="lp-hero__buy" {...reveal("rise", 200)}>
          {band ? (
            <div className="lp-hero__band" data-bg={TAG_BG[field]}>
              {price}
            </div>
          ) : null}
          <PackTeaser ctx={ctx} data={data} delay={360} />
          <HeroCta ctx={ctx} data={data} />
          <HeroTrust ctx={ctx} data={data} id={id} />
        </div>
      </div>
    </SectionShell>
  );
}
