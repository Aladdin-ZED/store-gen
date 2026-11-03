/**
 * counter — one real number, told big: a poster-like color block lit by the product's light — a live
 * "since" label at the top, the delivered-orders count ticking up on its base, hairline rings drawing
 * out from the corner and the COD promises riding its edge as glass chips (no turning badge, no text on a
 * circle: S17, RTL3), and a band of light sweeping it once the count lands; the product's real rating (only when
 * the admin set one) and the CTA beside it; then the delivery cities drifting by as glass chips in
 * two opposite bands.
 * Nothing here is invented: no count → no number, no rating → no stars.
 */
import type { ReactElement } from "react";
import { GlowOrb, Rings } from "../../illustrations";
import { Chip, Container, Counter, MarqueeTrack, RichText, SectionShell, Stars, cssVars, editAttr, reveal } from "../../primitives";
import { countLabel, say } from "../reviews/parts";
import { UI } from "./copy";
import { CtaRow, Header, splitList, titleId } from "./parts";
import type { Props } from "./schema";

export function CounterView({ id, ctx, data, bg }: Props): ReactElement {
  const rating = ctx.product.rating;
  const cities = splitList(data.cities);
  const label = data.countLabel.trim();
  const since = data.since.trim();
  // a real number only: the sample count of the defaults never reaches the page (D2)
  const hasCard = data.count > 0 && !data.sample;
  const cod = [ctx.t("trust.cod"), ctx.t("trust.check")];
  // the numeral scales with its length so 1 200 and 1 250 000 both fill the card without overflowing
  const len = Math.max(3, ctx.num(data.count).length);
  const chips = (list: string[]) => list.map((c, k) => <Chip key={k} ctx={ctx} text={c} icon="map-pin" tone="glass" className="lp-sp__city" />);
  // a second band runs the other way, starting halfway through the list
  const half = Math.ceil(cities.length / 2);
  const second = [...cities.slice(half), ...cities.slice(0, half)];
  return (
    <SectionShell id={id} ctx={ctx} type="socialProof" variant="counter" bg={bg} labelledBy={titleId(id)}>
      <Container>
        <div className="lp-sp__board" data-card={hasCard ? "" : undefined}>
          {/* beside the card the heading shares the row: a size down keeps it to two or three lines */}
          <Header ctx={ctx} data={data} id={id} size={hasCard ? "m" : undefined} className="lp-sp__head" />
          {hasCard ? (
            <div className="lp-sp__tally" data-bg={bg === "accent" ? "dark" : "accent"} {...reveal("scale-in", 120)}>
              <span className="lp-sp__light" aria-hidden="true">
                <GlowOrb place="top-end" size="95%" intensity="medium" idle="drift" />
                <GlowOrb place="bottom-start" size="70%" intensity="subtle" />
                {/* hairline rings radiate from the COD corner and draw on: reach, said quietly */}
                <Rings count={6} spread={0.22} tone="current" reveal delay={300} className="lp-sp__rings" />
              </span>
              {/* poster layout: a live meta label at the top, the number set on the card's base */}
              {since ? (
                <p className="lp-sp__since lp-label" {...editAttr(ctx, "since")} {...reveal("fade", 560)}>
                  <span className="lp-sp__dot" aria-hidden="true" />
                  <RichText text={since} ctx={ctx} decorate={false} />
                </p>
              ) : null}
              <p className="lp-sp__big">
                <span className="lp-sp__num lp-num" style={cssVars({ "--len": String(len) })} {...editAttr(ctx, "count")}>
                  <Counter ctx={ctx} to={data.count} delay={260} />
                </span>
                {label ? (
                  <RichText className="lp-sp__lab" text={label} ctx={ctx} decorate={false} editPath="countLabel" reveal="blur-in" delay={420} />
                ) : null}
              </p>
              {/* the promises sit on the card edge as glass chips (never a ring of text) */}
              <ul className="lp-sp__cod" role="list" data-stagger="90">
                {cod.map((text, k) => (
                  <li key={k} {...reveal("fade", 480)}>
                    <Chip ctx={ctx} text={text} icon={k ? "eye" : "cash-hand"} tone="glass" size="s" />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {rating || data.cta.trim() ? (
            <div className="lp-sp__side">
              {rating ? (
                <p className="lp-sp__rating" {...reveal("rise", 200)}>
                  <span className="lp-num lp-sp__rv" dir="ltr">
                    {ctx.num(rating.value)}
                  </span>
                  <span className="lp-sp__rs">
                    <Stars ctx={ctx} value={rating.value} size="m" />
                    <span className="lp-sp__rc">{countLabel(ctx, rating.count)}</span>
                  </span>
                </p>
              ) : null}
              <CtaRow ctx={ctx} data={data} />
            </div>
          ) : null}
        </div>
      </Container>
      {cities.length ? (
        <div className="lp-sp__band" {...reveal("fade", 200)}>
          <p className="lp-visually-hidden" {...editAttr(ctx, "cities")}>
            {say(ctx, UI.delivered)} {cities.join(", ")}
          </p>
          <Container>
            <p className="lp-sp__band-label lp-label" aria-hidden="true">
              {say(ctx, UI.delivered)}
            </p>
          </Container>
          <div className="lp-sp__rows" aria-hidden="true">
            <MarqueeTrack ctx={ctx} speed="slow" fade minItems={10} separator={false} items={chips(cities)} />
            {cities.length >= 6 ? <MarqueeTrack ctx={ctx} speed="slow" reverse fade minItems={10} separator={false} items={chips(second)} /> : null}
          </div>
        </div>
      ) : null}
    </SectionShell>
  );
}
