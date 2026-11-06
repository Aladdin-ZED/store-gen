/**
 * stamp → the quiet close (design.md DES-§5.13 S8; owner rule 2): the id stays for saved pages, the stamp is gone. No
 * ring of text, no rotating disc, no circular type (S17, RTL3): a start-aligned copy column (title, lead, the one
 * primary button with the live price in it, the reassurance points that restate the COD promise) beside the product
 * in a plain tinted disc. The button carries `data-hero-cta` (DES-§5.9), so the frozen sticky bar hides while it is
 * on screen. The disc is a calm frame, never a badge: no orbits, no light loop.
 */
import type { ReactElement } from "react";
import { SectionHeader, reveal } from "@/landing/primitives";
import { stampDisc } from "./fit";
import { pickVisual, titleScale, type ViewProps } from "./model";
import { OrderButton, Points, ProductPic } from "./parts";

export function Stamp({ ctx, data, titleId }: ViewProps): ReactElement {
  // the disc is a circle: the photo that keeps every face whole in it (a cutout stands inside it)
  const visual = pickVisual(ctx, data, { preferCutout: true, frameOf: () => stampDisc(ctx.dir) });
  const kind = visual.asset ? (visual.cutout ? "cutout" : "photo") : "none";
  return (
    <div className="lp-container lp-cta__wrap lp-cq">
      <div className="lp-cta__deck" data-media={kind}>
        <div className="lp-cta__copy">
          <SectionHeader ctx={ctx} kicker={data.kicker} title={data.title} lead={data.lead} size={titleScale(data.title) === "m" ? "m" : "l"} titleId={titleId} editBase="" className="lp-cta__head" />
          <div className="lp-cta__actions" {...reveal("rise", 200)}>
            <OrderButton ctx={ctx} data={data} size="l" />
          </div>
          <Points ctx={ctx} data={data} className="lp-cta__foot" delay={320} />
        </div>
        {kind !== "none" ? (
          <div className="lp-cta__disc" {...reveal("fade", 120)}>
            <ProductPic ctx={ctx} visual={visual} sizes="(min-width: 64rem) 26rem, 72vw" className="lp-cta__disc-pic" />
          </div>
        ) : null}
      </div>
    </div>
  );
}
