/**
 * hero/quiet — a small object, a lot of ground, one line of type (design.md DES-§5.13 H7, grammar quiet-luxe): the
 * photo at 4:5 (or 1:1) inset from the edges on phones (the inset is the composition; `frame: "bleed"` runs it edge to
 * edge instead), capped at 52 vh, then the title on one line at a small display size (≤ 56 px), the price cluster with
 * the action, and the COD line. No lead, no kicker, no chips. From 64rem the photo stands in the fourth to seventh
 * columns and the text closes a narrow column at the inline end, level with the photo's foot.
 *
 * Signature: stillness — the photo's slow fade is the whole choreography.
 */
import type { ReactElement } from "react";
import { cssVars, Picture, reveal, SectionShell } from "../../primitives";
import { HeroAct, HeroTitle, mainAsset, titleId, type HeroProps } from "./parts";

export function QuietHero({ id, variant, bg, data, ctx }: HeroProps): ReactElement {
  const asset = mainAsset(ctx, data);
  const cutout = !!asset?.alpha;
  const ratio = data.ratio === "1:1" ? 1 : 0.8;
  const bleed = data.frame === "bleed" && !cutout;
  return (
    <SectionShell id={id} ctx={ctx} type="hero" variant={variant} bg={bg} labelledBy={titleId(id)}>
      <div className="lp-container lp-hero__quiet" data-frame={bleed ? "bleed" : "framed"} style={cssVars({ "--q-r": ratio })}>
        <figure className="lp-hero__quiet-media" data-kind={cutout ? "cutout" : "photo"} {...reveal("fade")}>
          <Picture
            asset={asset}
            sizes="(min-width: 64rem) 25rem, (min-width: 48rem) 22rem, 86vw"
            priority
            fit={cutout ? "contain" : "cover"}
            ratio={String(ratio)}
            frame={cutout ? undefined : { shape: "rounded", ratio }}
            className="lp-hero__quiet-pic"
            alt={asset?.alt || ctx.product.name}
          />
        </figure>
        <div className="lp-hero__quiet-text">
          <HeroTitle ctx={ctx} data={data} id={id} />
          <HeroAct ctx={ctx} data={data} id={id} delay={420} />
        </div>
      </div>
    </SectionShell>
  );
}
