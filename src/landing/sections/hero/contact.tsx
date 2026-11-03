/**
 * hero/contact — the photos lead (design.md DES-§5.13 H9, grammar gallery-led, treatment grid-contact; it replaces
 * scrapbook in every pool): 3-4 distinct photos in square cells on a 2 px gap (the sheet is the device: a contact
 * sheet, not a gallery of cards), one cell holding the title at section size, the price cluster, the action and the COD
 * line. No tape, no frames, no chips over the photos.
 *
 * `titleCell` (logical, absent = tr): the column is the cell's inline side (l = inline start, so the right in Arabic),
 * the row its block side. With four photos, from 48rem the title cell spans the two rows of its column, its content at
 * the top (t) or settled at the foot (b); on phones it follows the first two photos (t) or closes the sheet (b). Three
 * photos run as one strip of three square frames, the title band under it on phones and, from 48rem, above (t) or
 * under it (b) with the head at the cell's side.
 * Signature: the cell cascade in reading order, the title cell last.
 */
import type { ReactElement } from "react";
import { Picture, reveal, SectionShell } from "../../primitives";
import type { ResolvedAsset } from "../../types";
import { HeroAct, HeroTitle, heroPhotos, titleId, type HeroProps } from "./parts";

/** Reveal step of the cascade (ms per cell). */
const STEP = 90;

/** The sheet's photos: the section's own list (distinct, resolved), else the hero's usual pool. */
function sheetPhotos(ctx: HeroProps["ctx"], data: HeroProps["data"]): ResolvedAsset[] {
  if (!data.photos?.length) return heroPhotos(ctx, data, 4);
  const out: ResolvedAsset[] = [];
  for (const ref of data.photos) {
    const a = ctx.asset(ref);
    if (a && !out.some((b) => b.id === a.id)) out.push(a);
  }
  return out.length ? out : heroPhotos(ctx, data, 4);
}

export function ContactHero({ id, variant, bg, data, ctx }: HeroProps): ReactElement {
  const photos = sheetPhotos(ctx, data);
  const n = photos.length;
  const cell = data.titleCell ?? "tr";
  return (
    <SectionShell id={id} ctx={ctx} type="hero" variant={variant} bg={bg} labelledBy={titleId(id)}>
      <div className="lp-container">
        <div className="lp-hero__cs" data-n={n} data-cell={cell}>
          {photos.map((asset, i) => (
            <figure key={asset.id} className="lp-hero__cs-cell" data-i={i} {...reveal("fade", i * STEP)}>
              <Picture
                asset={asset}
                sizes="(min-width: 64rem) 26rem, (min-width: 48rem) 33vw, 50vw"
                priority={i < 2}
                fit={asset.alpha ? "contain" : "cover"}
                ratio="1"
                frame={asset.alpha ? undefined : { shape: "rect", ratio: 1 }}
                className="lp-hero__cs-pic"
                alt={asset.alt || ctx.product.name}
              />
            </figure>
          ))}
          <div className="lp-hero__cs-title" {...reveal("rise", Math.max(1, n) * STEP)}>
            <HeroTitle ctx={ctx} data={data} id={id} />
            <HeroAct ctx={ctx} data={data} id={id} />
          </div>
        </div>
      </div>
    </SectionShell>
  );
}
