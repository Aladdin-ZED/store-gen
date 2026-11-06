/**
 * gallery/contact — the photos as a contact sheet (design.md DES-§5.13 S3, treatment grid-contact): 3-6 distinct photos
 * on a 2 px gap, 2 columns on phones and `cols` (3 by default) from 48rem; no captions, no frames, no lightbox chrome,
 * no button. The title above (its intro beside it on wide screens), the cells revealed in reading order (the grid
 * mirrors in Arabic).
 *
 * Every row keeps one height on a 6-column track: rows of two are square cells, a row of three takes portrait 2:3
 * frames on phones (three photos are one strip, five are two then three) and, on three columns from 48rem, rows of
 * three are square and a closing row of two takes 3:2 frames (four photos are two rows of two). A photo that cannot
 * fill a phone cell at DPR 2 with 1.5 × room (534 px) leaves the grid (I6); the desktop rule is the publish gate's
 * (V11).
 */
import type { ReactElement } from "react";
import { reveal } from "@/landing/primitives";
import { Head, Media } from "./parts";
import type { ViewProps } from "./model";

/** The phone cell's asset floor: (358 − 2) / 2 CSS px × 2 (DPR) × 1.5. */
const CELL_MIN = 534;

/** The span of each cell on a 6-column track, row by row (6 / cells in its row). */
const spans = (rows: number[]): number[] => rows.flatMap((k) => Array<number>(k).fill(6 / k));

/** Phones (and `cols: 2`): rows of two, an odd count closing on a row of three; one photo spans the row. */
function phoneRows(n: number): number[] {
  if (n <= 2) return [n];
  return n % 2 ? [...Array<number>((n - 3) / 2).fill(2), 3] : Array<number>(n / 2).fill(2);
}

/** Three columns: rows of three, a closing row of two; four photos are two rows of two. */
function deskRows(n: number): number[] {
  if (n <= 3) return [n];
  if (n === 4) return [2, 2];
  return n % 3 === 2 ? [...Array<number>((n - 2) / 3).fill(3), 2] : Array<number>(Math.ceil(n / 3)).fill(3);
}

export function Contact({ ctx, data, titleId, shots: all }: ViewProps): ReactElement {
  const sharp = all.filter((s) => !s.asset || !(s.asset.width > 0) || s.asset.width >= CELL_MIN);
  // every photo too small: the sheet keeps them rather than render empty (the publish gate reports V11)
  const shots = (sharp.length ? sharp : all).slice(0, 6);
  const n = shots.length;
  const p = spans(phoneRows(n));
  const d = spans(deskRows(n));
  return (
    <div className="lp-container lp-gallery__cs">
      <Head ctx={ctx} data={data} titleId={titleId} align="split" />
      <div className="lp-gallery__cs-grid" data-n={n} data-cols={data.cols === 2 ? 2 : 3}>
        {shots.map((shot, i) => (
          <figure key={shot.asset?.id ?? i} className="lp-gallery__cs-cell" data-p={p[i]} data-d={d[i]} {...reveal("fade", i * 70)}>
            <Media ctx={ctx} shot={shot} sizes="(min-width: 48rem) 33vw, 50vw" ratio="1" frame={{ shape: "rect", ratio: 1 }} className="lp-gallery__cs-pic" />
          </figure>
        ))}
      </div>
    </div>
  );
}
