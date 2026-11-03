/**
 * hero/scrapbook → a quiet contact grid (design.md DES-§5.13 H9; DES-§3.4: the scrapbook collage is a banned
 * aesthetic, kept only so saved pages still render). The id stays; the collage is gone: no tilted cards, no tape, no
 * polaroid frames, no stickers, no chips over the photos. The photos sit in square cells on a 2 px gap (the sheet is
 * the device: a contact sheet, not a gallery of cards), and one cell holds the title at section size (the photos
 * lead), the price cluster, the action and the COD line.
 *
 * 390: two photos side by side, the title cell under them, the other photos after it. From 48rem: three columns, the
 * title cell spans the rows of the inline-end column (`tr`: logical, so the top-left cell in Arabic). The signature is
 * the cell cascade: cells in reading order, the title cell last.
 */
import type { ReactElement } from "react";
import { Picture, reveal, SectionShell } from "../../primitives";
import { HeroCta, HeroLead, HeroMeta, HeroPrice, HeroTitle, HeroTrust, heroPhotos, PackTeaser, titleId, type HeroProps } from "./parts";

/** Reveal step of the cascade (ms per cell, reading order; the title cell comes last). */
const STEP = 90;

export function ScrapbookHero({ id, variant, bg, data, ctx }: HeroProps): ReactElement {
  const photos = heroPhotos(ctx, data, 4);
  const n = photos.length;
  return (
    <SectionShell id={id} ctx={ctx} type="hero" variant={variant} bg={bg} labelledBy={titleId(id)}>
      <div className="lp-container lp-hero__contact">
        <div className="lp-hero__sheet" data-n={n} data-cell="tr">
          {photos.map((asset, i) => (
            <figure key={asset.id} className="lp-hero__cell" data-i={i} {...(i ? reveal("fade", i * STEP) : {})}>
              <Picture
                asset={asset}
                sizes="(min-width: 64rem) 26rem, (min-width: 48rem) 33vw, 50vw"
                priority={i < 2}
                fit={asset.alpha ? "contain" : "cover"}
                ratio="1"
                frame={asset.alpha ? undefined : { shape: "rounded", ratio: 1 }}
                className="lp-hero__cell-pic"
                alt={asset.alt || ctx.product.name}
              />
            </figure>
          ))}
          <div className="lp-hero__cell lp-hero__cell--title" {...reveal("rise", Math.max(1, n) * STEP)}>
            <div className="lp-hero__head">
              <HeroMeta ctx={ctx} data={data} />
              <HeroTitle ctx={ctx} data={data} id={id} />
              <HeroLead ctx={ctx} data={data} />
            </div>
            <div className="lp-hero__buy">
              <div className="lp-hero__deal">
                <HeroPrice ctx={ctx} size="m" />
                <PackTeaser ctx={ctx} data={data} label={false} />
              </div>
              <HeroCta ctx={ctx} data={data} size="l" />
              <HeroTrust ctx={ctx} data={data} id={id} max={2} />
            </div>
          </div>
        </div>
      </div>
    </SectionShell>
  );
}
