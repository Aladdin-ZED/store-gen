/**
 * hanging — numbered rows with hanging thumbnails (design.md DES-§5.13 S1; keep-list 7, the numbered 01-05 benefits
 * with their thumbnails): 3-5 rows, each a number, a 72 px thumbnail of the merchant's photos, the title on one line and
 * the body; hairlines between rows, no icons (S07). From 48rem the numbers and the thumbnails hang in the margin at
 * the inline start, crossing the text column's edge (the signature): the heading and the copy share one column.
 *
 * A thumbnail needs a distinct photo per row that covers 72 px at DPR 2 with 1.5 × room (216 px); when one row has
 * none — or with `thumbs: false` — every row is the numbered ledger (a mixed column reads as missing photos).
 */
import { Picture, reveal } from "@/landing/primitives";
import { idx } from "./kit";
import type { ViewProps } from "./model";
import { Action, Head, Text, Title, photoPicker } from "./parts";

/** The thumbnail's CSS size and the asset width it needs (72 × 2 × 1.5). */
const THUMB = 72;
const THUMB_MIN = THUMB * 3;

export function Hanging({ ctx, data, titleId }: ViewProps) {
  const rows = data.items.slice(0, 5);
  const pick = photoPicker(ctx, rows);
  const photos = rows.map((it) => pick(it));
  const thumbs = data.thumbs !== false && photos.every((p) => !!p && (!(p.width > 0) || p.width >= THUMB_MIN));
  return (
    <div className="lp-container lp-benefits__hang" data-thumbs={thumbs ? "" : undefined}>
      <Head ctx={ctx} data={data} titleId={titleId} />
      <ol className="lp-benefits__hrows" role="list" data-stagger="70">
        {rows.map((it, i) => {
          const photo = photos[i];
          return (
            <li key={i} className="lp-benefits__hrow" {...reveal("rise")}>
              <bdi className="lp-benefits__hn" dir="ltr" aria-hidden="true">
                {idx(i)}
              </bdi>
              {thumbs && photo ? (
                <span className="lp-benefits__hthumb">
                  <Picture asset={photo} sizes={`${THUMB}px`} ratio="1" fit={photo.alpha ? "contain" : "cover"} frame={photo.alpha ? undefined : { shape: "rounded", ratio: 1 }} alt="" />
                </span>
              ) : null}
              <div className="lp-benefits__hcopy">
                <Title ctx={ctx} item={it} i={i} />
                <Text ctx={ctx} item={it} i={i} />
              </div>
            </li>
          );
        })}
      </ol>
      <Action ctx={ctx} data={data} />
    </div>
  );
}
