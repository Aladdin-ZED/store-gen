/**
 * hero/cinema — the photo carries the first screen (design.md DES-§5.13 H6, grammar cinematic): edge to edge, 50 vh on
 * phones, 16:9 from 48rem and 21:9 from 64rem, then the commerce band on the page's own ground: the title, the price
 * cluster beside the action, the COD line. Text never sits on the photo except the one optional caption, shown from
 * 48rem only (never in the phone's first screen).
 *
 * H13, slot-relative (DES-§4.11): a bleed needs the asset ≥ 1.5 × its slot at DPR 2 on each breakpoint it declares. A
 * photo that covers the phone slot (390 → 1,170 px) but not the desktop one is a mobile-only bleed with a framed
 * desktop fallback: from 48rem the photo stands framed in the container at the inline end, the band beside it. Below
 * the phone's rule the photo is framed everywhere. `band: "beside"` asks for the side composition on a full bleed too
 * (the band at the inline start, the photo running off the inline-end edge, from 64rem).
 *
 * Signature: the slow settle (1.08 → 1 over 1.5 × --lp-dur-l), the platform's only slow one.
 */
import type { ReactElement } from "react";
import { Picture, reveal, SectionShell } from "../../primitives";
import { covers, HeroAct, HeroTitle, mainAsset, NoteText, titleId, type HeroProps } from "./parts";

/** The bleed slots of the sheet: the phone's full width, the desktop's full width (CSS px). */
const PHONE = 390;
const DESKTOP = 1440;

export function CinemaHero({ id, variant, bg, data, ctx }: HeroProps): ReactElement {
  const asset = mainAsset(ctx, data);
  const cutout = !!asset?.alpha;
  // a cut-out has no scene to bleed: it stands framed on the section's card tier
  const phone = !cutout && covers(asset, PHONE);
  const desktop = phone && covers(asset, DESKTOP);
  const layout = !phone ? "framed" : !desktop ? "mobile" : data.band === "beside" ? "beside" : "below";
  const caption = data.caption?.trim() ?? "";
  return (
    <SectionShell id={id} ctx={ctx} type="hero" variant={variant} bg={bg} labelledBy={titleId(id)}>
      <div className="lp-hero__cine" data-layout={layout}>
        <figure className="lp-hero__cine-media" {...reveal("fade")}>
          <Picture
            asset={asset}
            sizes={layout === "below" ? "100vw" : layout === "beside" ? "(min-width: 64rem) 60vw, 100vw" : "(min-width: 48rem) 40rem, 100vw"}
            priority
            fit={cutout ? "contain" : "cover"}
            frame={cutout ? undefined : { shape: "rounded", ratio: 0.92 }}
            frameLg={cutout ? undefined : { shape: "rounded", ratio: layout === "below" ? 21 / 9 : layout === "beside" ? 4 / 3 : 0.8 }}
            className="lp-hero__cine-pic"
            alt={asset?.alt || ctx.product.name}
          />
          {caption ? (
            <figcaption className="lp-hero__cine-cap">
              <NoteText ctx={ctx} text={caption} className="lp-hero__cine-cap-t" editPath="caption" />
            </figcaption>
          ) : null}
        </figure>
        <div className="lp-container lp-hero__cine-band">
          <HeroTitle ctx={ctx} data={data} id={id} />
          <HeroAct ctx={ctx} data={data} id={id} delay={240} />
        </div>
      </div>
    </SectionShell>
  );
}
