/**
 * hero/spec — a precision tech opener (Apple / Nothing): a dark field with a fading hairline grid,
 * a centered mono reference line and headline, then — Apple-style on desktop — the buy console
 * (price + action in one glass capsule) right under the headline, so the product can be shown big:
 * centered on its set, numbered glass callouts on both sides with long hairline leaders that land
 * on a cutout (or on the glass mat of a photo), a light scan sweeping it once, and a strip of real
 * figures that tick up (rating, saving, best pack — that tile links to the pack). Phones read it
 * top-down: headline, product, a numbered spec sheet on hairlines, figures, then the console.
 */
import type { ReactElement } from "react";
import type { SectionBg } from "@/lib/page/schema";
import { GridLines } from "../../illustrations";
import { Counter, ProductStage, reveal, savingsOf, SectionShell } from "../../primitives";
import type { RenderContext } from "../../types";
import { micro } from "./copy";
import { frameAspect, visualFacts } from "./framing";
import {
  Callout,
  HeroCta,
  HeroLead,
  HeroPrice,
  HeroTitle,
  HeroTrust,
  heroNotes,
  mainAsset,
  NoteText,
  packSavings,
  titleId,
  withQty,
  type HeroProps,
  type PackSaving,
} from "./parts";

const NEUTRAL: readonly SectionBg[] = ["base", "soft", "surface"];
const pad = (k: number) => String(k + 1).padStart(2, "0");

interface Stat {
  key: string;
  label: string;
  node: ReactElement;
  /** the figure is an offer: the tile links to the form with that pack preselected */
  bundleId?: string;
}

/** Real figures only: product rating, the saving on the reference price, the best pack saving. */
function stats(ctx: RenderContext, showRating: boolean): Stat[] {
  const out: Stat[] = [];
  const r = ctx.product.rating;
  if (showRating && r) {
    out.push({
      key: "rating",
      label: r.count ? ctx.t("reviews.basedOn", { n: r.count }) : ctx.t("reviews.outOf"),
      node: <Counter ctx={ctx} to={r.value} decimals={1} suffix={micro(ctx.locale, "outOf")} delay={300} />,
    });
  }
  const s = savingsOf(ctx.lead.price, ctx.lead.compareAt);
  if (s && ctx.offers.showSavings !== "none") {
    out.push({ key: "save", label: micro(ctx.locale, "off"), node: <Counter ctx={ctx} to={s.pct} prefix="−" suffix="%" delay={420} /> });
  }
  const best = packSavings(ctx).reduce<PackSaving | null>((b, p) => (!b || p.pct > b.pct ? p : b), null);
  if (best) {
    out.push({
      key: "pack",
      label: best.sameItem ? micro(ctx.locale, "onPack", { qty: best.qty }) : best.label,
      node: <Counter ctx={ctx} to={best.pct} prefix="−" suffix="%" delay={540} />,
      bundleId: best.bundleId,
    });
  }
  return out;
}

export function SpecHero({ id, variant, bg, data, ctx }: HeroProps): ReactElement {
  // a spec sheet is a dark instrument panel: neutral backgrounds are promoted to the dark block
  const field: SectionBg = NEUTRAL.includes(bg) ? "dark" : bg;
  const asset = mainAsset(ctx, data);
  const facts = visualFacts(asset);
  const kind = facts.kind;
  // a square set; a product photo lying on its side gets a landscape one (up to 13:10) so it shows whole
  const R = frameAspect(facts, 1, 1.3);
  // ≤ 3 callouts on the page (DES-§5.13 H4), merchant facts only
  const specs = heroNotes(data, 3);
  // a reference is printed only when the merchant has one: never a made-up code
  const ref = ctx.lead.sku?.trim() ?? "";
  const kicker = data.kicker.trim();
  const figures = stats(ctx, data.showRating);

  return (
    <SectionShell id={id} ctx={ctx} type="hero" variant={variant} bg={field} labelledBy={titleId(id)}>
      {ctx.ornament > 0 ? <GridLines cell={44} major={4} fade="radial" className="lp-hero__gridlines" /> : null}
      <div className="lp-container lp-hero__grid">
        <div className="lp-hero__head">
          {ref || kicker ? (
            <p className="lp-hero__ref" {...reveal("fade")}>
              {ref ? (
                <span className="lp-hero__ref-id">
                  <span className="lp-hero__ref-k">{micro(ctx.locale, "ref")}</span>
                  <bdi className="lp-hero__ref-v" dir="ltr">
                    {ref}
                  </bdi>
                </span>
              ) : null}
              {kicker ? <NoteText ctx={ctx} text={kicker} className="lp-hero__ref-name" editPath="kicker" /> : null}
            </p>
          ) : null}
          <HeroTitle ctx={ctx} data={data} id={id} />
          <HeroLead ctx={ctx} data={data} />
        </div>

        <div className="lp-hero__rig" data-kind={kind} data-n={specs.length}>
          <ProductStage
            ctx={ctx}
            stage={kind === "cutout" ? "none" : "frame"}
            asset={asset}
            priority
            size="l"
            ratio={String(R)}
            seedKey={id}
            className="lp-hero__stage"
          >
            <span className="lp-hero__scan" aria-hidden="true" />
          </ProductStage>
          {specs.length ? (
            <ol className="lp-hero__specs" role="list">
              {specs.map(({ note, i }, k) => (
                <Callout key={i} ctx={ctx} note={note} i={i} slot={k} side={k % 2 === 0 ? "start" : "end"} delay={420 + k * 140} n={pad(k)} />
              ))}
            </ol>
          ) : null}
        </div>

        {figures.length ? (
          <dl className="lp-hero__stats" data-n={figures.length} data-stagger="120">
            {figures.map((f) => (
              <div key={f.key} className="lp-hero__stat" {...reveal("rise")}>
                <dt className="lp-hero__stat-k">{withQty(f.label)}</dt>
                <dd className="lp-hero__stat-v">
                  {f.bundleId ? (
                    <a href="#order" className="lp-hero__stat-link" data-action="order" data-bundle={f.bundleId}>
                      {f.node}
                      <span className="lp-visually-hidden"> {withQty(f.label)}</span>
                    </a>
                  ) : (
                    f.node
                  )}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}

        <div className="lp-hero__buy" {...reveal("rise", 200)}>
          <div className="lp-hero__console">
            <HeroPrice ctx={ctx} savings={figures.every((f) => f.key !== "save")} />
            <HeroCta ctx={ctx} data={data} />
          </div>
          <HeroTrust ctx={ctx} data={data} id={id} />
        </div>
      </div>
    </SectionShell>
  );
}
