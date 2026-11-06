/**
 * Pieces shared by the final-CTA views: the order button (Cta primitive), the reassurance points,
 * the product picture, the real-data chips (rating, saving) and the archetype's ambient layer.
 */
import type { ReactElement } from "react";
import { Beam, DotGrid, GridLines, Shape3D, Spotlight, ZelligeLines } from "@/landing/illustrations";
import { Cta, Icon, Picture, RichText, Stars, cx, plainText, reveal, type MaskKind } from "@/landing/primitives";
import type { RenderContext } from "../../types";
import { glueRanges } from "../trustBar/model";
import { asPictureFrame, type Frame } from "./fit";
import { pointLines, productSaving, type CtaData, type Visual } from "./model";

/* ------------------------------------------------------------------ */
/* Order button                                                        */
/* ------------------------------------------------------------------ */

/** Label length (characters) past which a phone button gives the label its own row. */
const LONG_LABEL = 24;
/** Past this length a label beside the price no longer fits one line in a phone-wide panel button. */
const MID_LABEL = 16;

/**
 * The section's order button with the live price pill of the selected pack. A long merchant label
 * is flagged so that on phones it takes a full row and the price + arrow move under it, instead of
 * being squeezed into a tall column of single words.
 */
export function OrderButton({ ctx, data, size = "xl" }: { ctx: RenderContext; data: CtaData; size?: "l" | "xl" }): ReactElement {
  const chars = plainText(data.ctaLabel).length;
  const long = chars > LONG_LABEL;
  // the banner's button sits inside the panel's padding: on phones a mid-length label beside the
  // price takes the same two-row layout (cta.banner.css) instead of wrapping onto cramped lines
  const mid = !long && data.showPrice && chars > MID_LABEL;
  // beside the live price the built-in label is the short order verb ("Commander · 449 DH →", the
  // orb's word too): the longer phrase would wrap onto two cramped lines in a phone-wide button
  const label = data.ctaLabel.trim() ? data.ctaLabel : data.showPrice ? ctx.t("cta.order") : "";
  return (
    <Cta
      ctx={ctx}
      label={label}
      size={size}
      withPrice={data.showPrice}
      // the final call's primary button: the frozen sticky bar hides while it is on screen (DES-§5.9)
      hero
      wide
      icon="arrow-right"
      className={cx("lp-cta__btn", long && "lp-cta__btn--long", mid && "lp-cta__btn--mid")}
      editPath="ctaLabel"
    />
  );
}

/* ------------------------------------------------------------------ */
/* Reassurance points                                                  */
/* ------------------------------------------------------------------ */

export function Points({ ctx, data, className, delay = 0 }: { ctx: RenderContext; data: CtaData; className?: string; delay?: number }): ReactElement | null {
  const lines = pointLines(data);
  if (!lines.length) return null;
  return (
    <ul className={cx("lp-cta__points", className)} role="list">
      {lines.map((l, i) => (
        <li key={i} className="lp-cta__point" {...reveal("fade", delay + i * 80)}>
          <span className="lp-cta__point-ico" aria-hidden="true">
            <Icon name={l.icon} size="1em" strokeWidth={2} />
          </span>
          <RichText as="span" text={glueRanges(l.text, ctx.dir)} ctx={ctx} decorate={false} editPath={l.path} />
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Product picture                                                     */
/* ------------------------------------------------------------------ */

/**
 * The product picture. A photo is fitted to the exact frame the layout draws it in (`visual.frame`,
 * or `frameLg` from `frameMin` up): faces, hands and a product's top stay inside the mask. `mask`
 * draws the kit's shape (continuous corners, true arch, media edge) instead of a local one.
 */
export function ProductPic({
  ctx,
  visual,
  sizes,
  className,
  decorative = false,
  mask,
  frameLg,
  frameMin,
}: {
  ctx: RenderContext;
  visual: Visual;
  sizes: string;
  className?: string;
  /** alt="" (the picture repeats something already named nearby) */
  decorative?: boolean;
  mask?: MaskKind;
  frameLg?: Frame;
  frameMin?: string;
}): ReactElement {
  const photo = !visual.cutout && !!visual.frame;
  return (
    <Picture
      asset={visual.asset}
      sizes={sizes}
      fit={visual.cutout ? "contain" : "cover"}
      className={cx("lp-cta__pic", className)}
      alt={decorative ? "" : visual.asset?.alt || ctx.product.name}
      mask={photo ? mask : undefined}
      frame={photo ? asPictureFrame(visual.frame!) : undefined}
      frameLg={photo && frameLg ? asPictureFrame(frameLg) : undefined}
      frameMin={photo && frameLg ? frameMin : undefined}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Real-data chips                                                     */
/* ------------------------------------------------------------------ */

/** Frosted rating chip — only when the product carries a real aggregated rating. */
export function RatingChip({ ctx, className, delay = 0 }: { ctx: RenderContext; className?: string; delay?: number }): ReactElement | null {
  const r = ctx.product.rating;
  if (!r) return null;
  return (
    <span className={cx("lp-cta__chip lp-cta__chip--rating lp-glass", className)} {...reveal("rise", delay)}>
      <Stars ctx={ctx} value={r.value} count={r.count} size="s" />
      <span className="lp-cta__chip-num" aria-hidden="true">
        {ctx.num(Math.round(r.value * 10) / 10)}
      </span>
    </span>
  );
}

/** Round saving disc (“−25%”) — only with a real reference price and savings shown on the page. */
export function SaveChip({ ctx, className, delay = 0 }: { ctx: RenderContext; className?: string; delay?: number }): ReactElement | null {
  const pct = productSaving(ctx);
  if (pct === null) return null;
  return (
    <span className={cx("lp-cta__save", className)} {...reveal("stamp", delay)}>
      <bdi dir="ltr" className="lp-cta__save-pct">
        {ctx.t("bundle.savePct", { pct })}
      </bdi>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Ambient layer — the archetype's modern signature, felt not read     */
/* ------------------------------------------------------------------ */

/**
 * One quiet piece of the archetype's vocabulary (zellige hairlines for souk, a precise grid for
 * circuit, a stage beam for kinetic, a glossy 3D sphere for playground). Layers fill their
 * positioned host; the sphere is placed by `.lp-cta__accent` in the section CSS. The soft languages
 * (bloom, field, hearth) keep only the product-tinted light: a floating object there reads as
 * clip-art. Nothing when ornament is off.
 */
export function Ambient({ ctx, uid, scope }: { ctx: RenderContext; uid: string; scope: "panel" | "stage" | "field" }): ReactElement | null {
  if (ctx.ornament <= 0) return null;
  const seed = `${ctx.seed}:${uid}`;
  switch (ctx.archetype) {
    case "souk":
      return <ZelligeLines uid={`${uid}-z`} variant="rosette" tile={scope === "stage" ? 72 : 92} opacity={0.07} className="lp-cta__ambient" />;
    case "maison":
      return <Spotlight origin={scope === "panel" ? "top-end" : "top"} pool={false} intensity="soft" className="lp-cta__ambient" />;
    case "apothecary":
      return <DotGrid cell={20} fade="radial" className="lp-cta__ambient" />;
    case "circuit":
      return <GridLines cell={40} major={4} fade="radial" className="lp-cta__ambient" />;
    case "editorial":
      // a quiet column grid; inside the panel it would cross the copy, so it stays outside
      return scope === "panel" ? null : <GridLines cell={96} fade="radial" opacity={0.22} className="lp-cta__ambient" />;
    case "kinetic":
      return <Beam seed={seed} origin="top-end" count={3} intensity="soft" className="lp-cta__ambient" />;
    case "garage":
      return <Beam seed={seed} origin="top-start" count={2} intensity="subtle" className="lp-cta__ambient" />;
    case "playground":
      return (
        <span className={cx("lp-cta__accent", `lp-cta__accent--${scope}`)} aria-hidden="true">
          <Shape3D shape="sphere" finish="gloss" tone="pop" size="100%" seed={seed} idle="float" />
        </span>
      );
    default:
      return null;
  }
}
