/**
 * hero/editorial — a modern magazine cover: a single-hairline masthead (edition · store) that
 * draws across the grid — the store's name closes it only when the store has a real name and no
 * header already shows it — an oversized headline with one emphasized word, a tall arch/rounded
 * figure running the full height of the spread (it settles into its mask and, for a product with
 * room around it, drifts inside it on scroll), a glass caption straddling the figure's foot (never
 * over a hand or the product), a measured lead, the buy box, and two or three unnumbered cover lines on
 * hairlines (design.md DES-§5.13 H2, S15: no list numbering) — a contents strip of columns on desktop. Generous whitespace, strict 12-column grid.
 *
 * The photo is fitted to the figure's exact mask and aspect (4:5 on phones, the 7:10 spread on
 * desktop); a product lying on its side gets a landscape figure in a rounded mask instead, so it is
 * never cut.
 */
import type { ReactElement } from "react";
import type { FrameShape } from "@/lib/media/focus";
import { cssVars, Money, Picture, reveal, SectionShell } from "../../primitives";
import type { ResolvedAsset } from "../../types";
import { hasStoreName } from "../persona";
import { micro } from "./copy";
import { frameAspect, pageMask, visualFacts } from "./framing";
import {
  HeroCta,
  HeroLead,
  HeroMeta,
  HeroPrice,
  HeroTitle,
  HeroTrust,
  heroNotes,
  mainAsset,
  NoteText,
  PackTeaser,
  titleId,
  type HeroProps,
} from "./parts";

/** A header already sets the store's name as the page's wordmark: the masthead does not repeat it. */
const headerShowsName = (ctx: HeroProps["ctx"]): boolean =>
  ctx.doc.sections.some((s) => s.type === "header" && !s.hidden && s.variant !== "none");

/** The spread's figure on desktop: 7:10, stretched with the copy column when that runs taller. */
const SPREAD = 0.7;
/** The drift layer overfills the figure by 6% above and below. */
const DRIFT_OVERFILL = 1.12;

/** A product with room above and below drifts inside its mask; people and tight crops stay still. */
function drifts(asset: ResolvedAsset | null): boolean {
  if (!asset) return false;
  if (asset.alpha) return true;
  const f = visualFacts(asset);
  if (f.person || f.need > 1) return false;
  const b = asset.subject;
  return asset.subjectKind !== "none" && b.y >= 0.1 && 1 - (b.y + b.h) >= 0.08;
}

export function EditorialHero({ id, variant, bg, data, ctx }: HeroProps): ReactElement {
  const asset = mainAsset(ctx, data);
  const cutout = !!asset?.alpha;
  const lines = heroNotes(data, data.coverLines ?? 3);
  const issue = data.issue.trim();
  const store = headerShowsName(ctx) || !hasStoreName(ctx) ? "" : ctx.store.name.trim();
  const facts = visualFacts(asset);
  // phones: 4:5, widened up to 13:10 for a product on its side (then a rounded mask: an arch or a
  // pill over a landscape window would read as a dome)
  const ratio = frameAspect(facts, 0.8, 1.3);
  const wide = ratio > 1;
  const mask = pageMask(ctx);
  const shape: FrameShape = wide ? "rounded" : mask === "arch" || mask === "pill" ? mask : "rounded";
  const drift = drifts(asset);

  return (
    <SectionShell id={id} ctx={ctx} type="hero" variant={variant} bg={bg} labelledBy={titleId(id)}>
      <div className="lp-container lp-hero__grid">
        <div className="lp-hero__mast" {...reveal("fade")}>
          {issue ? <NoteText ctx={ctx} text={issue} className="lp-hero__issue" editPath="issue" /> : null}
          <span className="lp-hero__rule" aria-hidden="true" {...reveal("wipe-side", 120)} />
          {store ? <span className="lp-hero__store">{store}</span> : null}
        </div>

        <div className="lp-hero__head">
          <HeroMeta ctx={ctx} data={data} />
          <HeroTitle ctx={ctx} data={data} id={id} />
        </div>

        <figure className="lp-hero__figure" data-wide={wide ? "" : undefined} style={wide ? cssVars({ "--fig-r": ratio }) : undefined}>
          <div className="lp-hero__media" data-kind={cutout ? "cutout" : "photo"}>
            {/* desktop: a product photo drifts slowly inside its mask while the page scrolls */}
            <div className="lp-hero__drift" data-drift={drift ? "" : undefined} data-parallax={drift ? "0.06" : undefined}>
              <Picture
                asset={asset}
                sizes="(min-width: 64rem) 32rem, 92vw"
                priority
                fit={cutout ? "contain" : "cover"}
                ratio={String(ratio)}
                frame={{ shape, ratio }}
                frameLg={wide ? undefined : { shape, ratio: drift ? SPREAD / DRIFT_OVERFILL : SPREAD }}
                className="lp-hero__pic"
                alt={asset?.alt || ctx.product.name}
              />
            </div>
          </div>
          <figcaption className="lp-hero__caption lp-glass" {...reveal("rise", 360)}>
            <span className="lp-hero__fig">{micro(ctx.locale, "fig")}</span>
            {/* the name keeps its own direction: a Latin name on an Arabic page is cut at its end */}
            <bdi className="lp-hero__caption-name">{ctx.product.name}</bdi>
            <span className="lp-hero__caption-price">
              <Money ctx={ctx} amount={ctx.lead.price} />
            </span>
          </figcaption>
        </figure>

        <HeroLead ctx={ctx} data={data} delay={160} />

        <div className="lp-hero__buy" {...reveal("rise", 240)}>
          <div className="lp-hero__deal">
            <HeroPrice ctx={ctx} />
            <PackTeaser ctx={ctx} data={data} delay={420} />
          </div>
          <HeroCta ctx={ctx} data={data} />
          <HeroTrust ctx={ctx} data={data} id={id} />
        </div>

        {lines.length ? (
          <ul className="lp-hero__lines" role="list" data-n={lines.length} data-stagger="110">
            {lines.map(({ note, i }) => (
              <li key={i} className="lp-hero__line" {...reveal("rise")}>
                <NoteText ctx={ctx} text={note.title} className="lp-hero__line-t" editPath={`notes.${i}.title`} />
                {note.detail.trim() ? <NoteText ctx={ctx} text={note.detail} className="lp-hero__line-d" editPath={`notes.${i}.detail`} /> : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </SectionShell>
  );
}
