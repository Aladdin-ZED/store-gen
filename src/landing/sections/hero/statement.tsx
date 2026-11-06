/**
 * hero/statement — type first (design.md DES-§5.13 H10; grammars quiet-luxe, poster, editorial-column; the default
 * family of the one-asset grammar H36): the title at display size (48 px on phones, ≤ 3 lines, up to 96 px from
 * 64rem), then the product kept in the first screen as a framed thumbnail ≥ 160 px (or, with `thumb: "cutout"` and a
 * real cut-out, a small cut-out standing on a plinth), the price cluster with the action, the COD line and the lead
 * (the only family whose lead fits the phone's fold).
 *
 * `structure` sets the title (G29): `word-subline` = one big word (the merchant's giant word, else the product's
 * brand-like word) on its own line over the title as a subline at lead size; `contrast-pair` = two short lines split at
 * the title's own break (a line break, a dash, a full stop or a comma; the dash itself is never drawn); absent = the
 * title as written. The big word is sized from its letter count and the face's advance so it never clips (S12).
 * Signature: the type itself; no other device on the hero.
 */
import type { ReactElement } from "react";
import { cssVars, editAttr, Picture, reveal, RichText, SectionShell } from "../../primitives";
import { HeroAct, HeroLead, HeroTitle, heroWord, holdCompounds, mainAsset, titleId, wordAdvance, type HeroProps } from "./parts";

/** Where a contrast pair breaks: a line break, a spaced dash, then a sentence end, then a comma (first match). */
const BREAKS = [/\s*\n\s*/, /\s+[—–-]\s+/, /(?<=[.!?؟])\s+/, /(?<=[,،])\s+/] as const;

/** The two lines of a contrast pair, or null when the title has no break of its own. */
export function contrastPair(title: string): [string, string] | null {
  for (const re of BREAKS) {
    const m = re.exec(title);
    if (!m || m.index === 0) continue;
    const a = title.slice(0, m.index).trim();
    const b = title.slice(m.index + m[0].length).trim();
    if (a && b) return [a, b];
  }
  return null;
}

export function StatementHero({ id, variant, bg, data, ctx }: HeroProps): ReactElement {
  const asset = mainAsset(ctx, data);
  const cutout = !!asset?.alpha && data.thumb === "cutout";
  const text = data.title.trim() || ctx.product.name;
  const pair = data.structure === "contrast-pair" ? contrastPair(text) : null;
  const word = data.structure === "word-subline" ? heroWord(ctx, data) : "";
  let title: ReactElement;
  if (word) {
    title = (
      <h1 id={titleId(id)} className="lp-h1 lp-hero__title lp-hero__st-title" data-structure="word-subline">
        <span className="lp-hero__st-word" style={cssVars({ "--wl": Math.max(3, [...word].length), "--wadv": wordAdvance(ctx, word) })} {...editAttr(ctx, "bigWord")}>
          {word}
        </span>
        <RichText as="span" className="lp-hero__st-sub" text={holdCompounds(text)} ctx={ctx} editPath="title" decorate={false} />
      </h1>
    );
  } else if (pair) {
    title = (
      <h1 id={titleId(id)} className="lp-h1 lp-hero__title lp-hero__st-title" data-structure="contrast-pair">
        <RichText as="span" className="lp-hero__st-line" text={holdCompounds(pair[0])} ctx={ctx} editPath="title" />
        <RichText as="span" className="lp-hero__st-line lp-hero__st-line--2" text={holdCompounds(pair[1])} ctx={ctx} editPath="title" />
      </h1>
    );
  } else {
    title = <HeroTitle ctx={ctx} data={data} id={id} className="lp-hero__st-title" />;
  }
  return (
    <SectionShell id={id} ctx={ctx} type="hero" variant={variant} bg={bg} labelledBy={titleId(id)}>
      <div className="lp-container lp-hero__st">
        {title}
        <div className="lp-hero__st-row">
          <figure className="lp-hero__st-thumb" data-kind={cutout ? "cutout" : "photo"} {...reveal("fade", 160)}>
            <Picture
              asset={asset}
              sizes="(min-width: 64rem) 17rem, (min-width: 48rem) 16rem, 10rem"
              priority
              fit={asset?.alpha ? "contain" : "cover"}
              ratio="0.8"
              frame={asset?.alpha ? undefined : { shape: "rounded", ratio: 0.8 }}
              className="lp-hero__st-pic"
              alt={asset?.alt || ctx.product.name}
            />
          </figure>
          <HeroAct ctx={ctx} data={data} id={id} delay={300} className="lp-hero__st-act" />
          {data.subtitle.trim() ? <HeroLead ctx={ctx} data={data} delay={420} className="lp-hero__st-lead" /> : null}
        </div>
      </div>
    </SectionShell>
  );
}
