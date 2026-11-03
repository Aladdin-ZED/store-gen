/**
 * hero/index — the product as a catalogue entry (design.md DES-§5.13 H8, grammar catalogue; the file is catalogue.tsx
 * because index.tsx is the section's definition): the photo (36 vh on phones), the title, then the merchant's facts as
 * numbered rows on hairlines, the price cluster with the action and the COD line. From 48rem the photo stands at the
 * inline start and the entry runs beside it.
 *
 * The facts are the section's product notes (the merchant's own lines, never invented), 3-5 of them (`facts` caps the
 * count; the schema holds four notes). Numbers: plain "1" by default, "01" with `numbering: "padded"` (a counted
 * device, DS56); each sits in an LTR isolate at the inline start of its row. Signature: the rows ticking in with their
 * hairlines.
 */
import type { ReactElement } from "react";
import { Picture, reveal, SectionShell } from "../../primitives";
import { HeroAct, HeroTitle, heroNotes, mainAsset, NoteText, titleId, type HeroProps } from "./parts";

export function IndexHero({ id, variant, bg, data, ctx }: HeroProps): ReactElement {
  const asset = mainAsset(ctx, data);
  const cutout = !!asset?.alpha;
  const rows = heroNotes(data, data.facts ?? 5);
  const padded = data.numbering === "padded";
  return (
    <SectionShell id={id} ctx={ctx} type="hero" variant={variant} bg={bg} labelledBy={titleId(id)}>
      <div className="lp-container lp-hero__index">
        <figure className="lp-hero__index-media" data-kind={cutout ? "cutout" : "photo"} {...reveal("fade")}>
          <Picture
            asset={asset}
            sizes="(min-width: 64rem) 34rem, (min-width: 48rem) 45vw, 92vw"
            priority
            fit={cutout ? "contain" : "cover"}
            frame={cutout ? undefined : { shape: "rounded", ratio: 1.18 }}
            frameLg={cutout ? undefined : { shape: "rounded", ratio: 1 }}
            frameMin="48rem"
            className="lp-hero__index-pic"
            alt={asset?.alt || ctx.product.name}
          />
        </figure>
        <div className="lp-hero__entry">
          <HeroTitle ctx={ctx} data={data} id={id} />
          {rows.length ? (
            <ol className="lp-hero__facts" role="list" data-stagger="80">
              {rows.map(({ note, i }, k) => (
                <li key={i} className="lp-hero__fact" {...reveal("rise")}>
                  <bdi className="lp-hero__fact-n" dir="ltr" aria-hidden="true">
                    {padded ? String(k + 1).padStart(2, "0") : k + 1}
                  </bdi>
                  <NoteText ctx={ctx} text={note.title} className="lp-hero__fact-t" editPath={`notes.${i}.title`} />
                  {note.detail.trim() ? <NoteText ctx={ctx} text={note.detail} className="lp-hero__fact-d" editPath={`notes.${i}.detail`} /> : null}
                </li>
              ))}
            </ol>
          ) : null}
          <HeroAct ctx={ctx} data={data} id={id} delay={360} />
        </div>
      </div>
    </SectionShell>
  );
}
