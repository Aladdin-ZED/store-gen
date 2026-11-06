/**
 * hero/stage — the product landing on its stage (design.md DES-§5.13 H1): at 390 the product first (≈ 46 vh, 42 in
 * Arabic), then the title, the price cluster beside the action and the COD line; from 64rem the copy column at the
 * inline start and the product at the inline end. The signature is the product settling onto its set; nothing else
 * competes with it: no giant word and no callout chips unless the section asks for them (DS56, S12, S13).
 *
 * The set is the archetype's stage (arch, halo, blob, podium, glass frame, slab) for saved pages, or one of the three
 * presets of DES-§4.11.1 when `stagePreset` is set: `glow` (a product-tinted radial, cut-outs only), `contact` (a soft
 * contact shadow) or `plinth` (a flat tinted slab with a hairline). A regular photo on a preset is the framed-stage
 * treatment: the true-colour photo framed whole on the plinth or casting the contact shadow, never a fake cut-out (a
 * glow asked for a photo becomes `contact`, whose edge needs no matte).
 *
 * A regular photo is framed whole: a wide product gets a landscape stage (never a portrait window that would cut it),
 * people only get a set whose curve keeps every head inside, and asked-for callouts slide to heights where neither the
 * chip nor its leader lands on a face or a hand (framing.ts).
 */
import type { ReactElement, ReactNode } from "react";
import { cssVars, cx, editAttr, Picture, ProductStage, reveal, SectionShell } from "../../primitives";
import type { RenderContext, ResolvedAsset } from "../../types";
import { frameAspect, stageCalloutTops, visualFacts } from "./framing";
import {
  Callout,
  HeroCta,
  HeroLead,
  HeroMeta,
  HeroPrice,
  HeroTitle,
  HeroTrust,
  heroNotes,
  heroStage,
  heroWord,
  mainAsset,
  PackTeaser,
  titleId,
  wordAdvance,
  type HeroProps,
} from "./parts";
import type { HeroData } from "./schema";

/** Callout slots around the product: alternate sides so leaders never cross. */
const SIDES = ["end", "start", "end"] as const;
/** Their default heights (fractions of the stage) — mirrored in hero.stage.css. */
const TOPS = [0.13, 0.45, 0.75] as const;

type Preset = NonNullable<HeroData["stagePreset"]>;

/**
 * One of the three stage presets (DES-§4.11.1): the set under the product (the glow field, the plinth slab or nothing),
 * the product itself (a cut-out standing free, or the photo framed whole at the slot's aspect) and, for `contact`, the
 * soft ellipse at its base. The tokens are the look's `--lp-stage-*`; a page without look falls back to its tints.
 */
function PresetStage({ asset, preset, R, children }: { ctx: RenderContext; asset: ResolvedAsset | null; preset: Preset; R: number; children?: ReactNode }): ReactElement {
  const cutout = !!asset?.alpha;
  const p: Preset = !cutout && preset === "glow" ? "contact" : preset;
  return (
    <div className="lp-hero__stage lp-hero__preset" data-preset={p} data-kind={cutout ? "cutout" : "photo"} style={cssVars({ "--stage-ratio": String(R) })}>
      {p === "contact" ? null : <span className="lp-hero__preset-set" aria-hidden="true" {...reveal("fade")} />}
      <div className="lp-hero__preset-obj">
        {p === "contact" ? <span className="lp-hero__contact" aria-hidden="true" /> : null}
        <Picture
          asset={asset}
          sizes="(min-width: 64rem) 30rem, 80vw"
          priority
          fit={cutout ? "contain" : "cover"}
          ratio={cutout ? undefined : String(R)}
          frame={cutout ? undefined : { shape: "rounded", ratio: R }}
          className="lp-hero__preset-pic"
        />
      </div>
      {children}
    </div>
  );
}

export function StageHero({ id, variant, bg, data, ctx }: HeroProps): ReactElement {
  const asset = mainAsset(ctx, data);
  const facts = visualFacts(asset);
  const kind = facts.kind;
  // a photo whose subject is wider than the 4:5 set gets a landscape stage (up to 13:10)
  const R = frameAspect(facts, 0.8, 1.3);
  const preset = data.stagePreset;
  const stage = heroStage(ctx, `${id}:stage`, asset, R);
  // the giant word and the callouts are devices the page asks for (DS56: ghost off, chips 0 by default)
  const word = data.ghost === true ? heroWord(ctx, data) : "";
  const notes = heroNotes(data, Math.min(2, data.chips ?? 0));
  const tops = notes.length
    ? stageCalloutTops(
        ctx,
        asset,
        stage,
        R,
        notes.map(({ note }) => note),
        SIDES,
        TOPS,
      )
    : undefined;
  const over = (
    <>
      {word ? (
        <span className="lp-hero__word" aria-hidden="true" {...editAttr(ctx, "bigWord")}>
          <span className="lp-hero__word-in" {...reveal("wipe-up", 80)}>
            {word}
          </span>
        </span>
      ) : null}
      {notes.length ? (
        <ul className="lp-hero__callouts" role="list">
          {notes.map(({ note, i }, k) => (
            <Callout key={i} ctx={ctx} note={note} i={i} slot={k} side={SIDES[k]!} delay={380 + k * 160} top={tops?.[k]} />
          ))}
        </ul>
      ) : null}
    </>
  );

  return (
    <SectionShell id={id} ctx={ctx} type="hero" variant={variant} bg={bg} labelledBy={titleId(id)}>
      <div className="lp-container lp-hero__grid">
        <div className="lp-hero__head">
          <HeroMeta ctx={ctx} data={data} />
          <HeroTitle ctx={ctx} data={data} id={id} />
          <HeroLead ctx={ctx} data={data} />
        </div>

        <div
          className={cx("lp-hero__visual", word && "lp-hero__visual--word")}
          data-kind={kind}
          data-stage={preset ? undefined : stage}
          data-wide={R > 1 ? "" : undefined}
          style={cssVars({ "--wl": word ? Math.max(3, [...word].length) : undefined, "--wadv": word ? wordAdvance(ctx, word) : undefined })}
        >
          {preset ? (
            <PresetStage ctx={ctx} asset={asset} preset={preset} R={R}>
              {over}
            </PresetStage>
          ) : (
            <ProductStage
              ctx={ctx}
              stage={stage}
              asset={asset}
              priority
              size="l"
              ratio={R === 0.8 ? undefined : String(R)}
              seedKey={id}
              className="lp-hero__stage"
            >
              {over}
            </ProductStage>
          )}
        </div>

        <div className="lp-hero__buy" {...reveal("rise", 180)}>
          <div className="lp-hero__deal">
            <HeroPrice ctx={ctx} />
            <PackTeaser ctx={ctx} data={data} delay={420} />
          </div>
          <HeroCta ctx={ctx} data={data} />
          <HeroTrust ctx={ctx} data={data} id={id} />
        </div>
      </div>
    </SectionShell>
  );
}
