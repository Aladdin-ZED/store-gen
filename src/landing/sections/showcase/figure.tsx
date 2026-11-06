/**
 * figure — one large image and its caption column (design.md DES-§5.13 S2; keep-list 7, the "FIG. 01" captions): the
 * title above, the photo true-colour in a hairline frame (4:5, or 4:3 for a landscape photo; 3:2 from 48rem when the
 * photo is landscape), the caption column at the inline end from 48rem, hanging in the margin from 64rem (the photo
 * offset one column). The column holds the figure label (`figure`, a counted device: shown only when set; its numeral
 * in an LTR isolate), the section's short caption and its intro line, the fact the photo shows. A showcase never sells:
 * no price, no button.
 */
import type { ReactElement, ReactNode } from "react";
import { Picture, reveal, RichText } from "@/landing/primitives";
import { aspectOf } from "../benefits/kit";
import { Head, productVisual, type ViewProps } from "./shared";

/** "FIG. 01" / "الشكل 01": the label isolated in its own script's direction, its trailing numeral an LTR isolate. */
function figLabel(text: string): ReactNode {
  const m = /^(.*?)(\d[\d.,-]*)\s*$/.exec(text);
  return (
    <bdi>
      {m ? (
        <>
          {m[1]}
          <bdi dir="ltr">{m[2]}</bdi>
        </>
      ) : (
        text
      )}
    </bdi>
  );
}

export function Figure({ ctx, data, titleId }: ViewProps): ReactElement {
  const asset = productVisual(ctx, data);
  const cutout = !!asset?.alpha;
  const wide = !cutout && aspectOf(asset) > 1.1;
  const phone = wide ? 4 / 3 : 0.8;
  const desk = wide ? 1.5 : 0.8;
  const label = data.figure?.trim() ?? "";
  const caption = data.caption.trim();
  const lead = data.lead.trim();
  return (
    <div className="lp-container lp-showcase__fg" data-wide={wide ? "" : undefined}>
      <Head ctx={ctx} data={{ ...data, lead: "" }} titleId={titleId} />
      <figure className="lp-showcase__fg-fig">
        <div className="lp-showcase__fg-media" data-kind={cutout ? "cutout" : "photo"}>
          <Picture
            asset={asset}
            sizes="(min-width: 64rem) 50rem, (min-width: 48rem) 66vw, 92vw"
            fit={cutout ? "contain" : "cover"}
            ratio={String(phone)}
            frame={cutout ? undefined : { shape: "rounded", ratio: phone }}
            frameLg={cutout ? undefined : { shape: "rounded", ratio: desk }}
            frameMin="48rem"
            className="lp-showcase__fg-pic"
            alt={asset?.alt || ctx.product.name}
          />
        </div>
        {label || caption || lead ? (
          <figcaption className="lp-showcase__fg-cap" {...reveal("rise", 160)}>
            {label ? <span className="lp-showcase__fg-n">{figLabel(label)}</span> : null}
            {caption ? <RichText as="span" className="lp-showcase__fg-t" text={caption} ctx={ctx} editPath="caption" decorate={false} /> : null}
            {lead ? <RichText as="span" className="lp-showcase__fg-d" text={lead} ctx={ctx} editPath="lead" decorate={false} /> : null}
          </figcaption>
        ) : null}
      </figure>
    </div>
  );
}
