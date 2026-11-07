import type { MarketingCopy } from "../copy";
import type { HomeData, Slot } from "./data";
import { f, mirrorSegs, mx, mxRect, toD, type Seg } from "./geom";
import { cv, MiniPage, PALETTE } from "./loom";
import L from "./living.module.css";

/*
 * DIRECTOR: the Director's fan (spec §6.4). One product photo on the inline-start side, three rays arching over to the
 * three covers the Director proposes (best fit, contrast, explore: three real designer seeds, drawn with the hero's
 * block geometry), each with RUBRIC_DIMS.length "assessed" ticks and no number. The radios move the selection ring by
 * CSS alone (:has). SSR is the final frame; the runtime arms it below the fold and the CSS transitions play it.
 */

const SHADES = [
  { a: 0.06, y: 8, g: 4 },
  { a: 0.04, y: 16, g: 8 },
  { a: 0.03, y: 28, g: 12 },
] as const;

/** n "assessed" ticks (w×h, gap) centred on cx, as one path. */
function ticks(cx: number, y: number, n: number, w: number, h: number, gap: number): string {
  const total = n * w + (n - 1) * gap;
  const x0 = cx - total / 2;
  let d = "";
  for (let i = 0; i < n; i++) d += `M${f(x0 + i * (w + gap))} ${f(y)}h${w}v${h}h-${w}Z`;
  return d;
}

/** A phone-size cover: the direction's palette and grammar in a handful of shapes (depiction only). */
function SmallCover({ slot, x, y, w, h, r, rtl }: { slot: Slot; x: number; y: number; w: number; h: number; r: number; rtl: boolean }) {
  const R = (lx: number, lw: number) => f(rtl ? x + w - lx - lw : x + lx);
  const p = 8;
  const iw = w - 2 * p;
  const media = slot === "best_fit" ? { x: p, y: p, w: iw, h: 62, r: 7 } : slot === "contrast" ? { x: p, y: 44, w: iw, h: 52, r: 2 } : { x: p, y: p, w: iw * 0.46, h: 92, r: iw * 0.23 };
  const bars =
    slot === "best_fit"
      ? [{ x: p, y: 80, w: iw * 0.8, h: 6 }, { x: p, y: 90, w: iw * 0.56, h: 5 }]
      : slot === "contrast"
        ? [{ x: p, y: 10, w: iw * 0.92, h: 7 }, { x: p, y: 20, w: iw * 0.84, h: 7 }, { x: p, y: 30, w: iw * 0.5, h: 7 }]
        : [{ x: p + iw * 0.54, y: 16, w: iw * 0.46, h: 6 }, { x: p + iw * 0.54, y: 26, w: iw * 0.34, h: 6 }];
  return (
    <g className={PALETTE[slot]}>
      <rect x={f(x)} y={y} width={w} height={h} rx={r} className={L.fg} />
      <rect x={R(media.x, media.w)} y={y + media.y} width={f(media.w)} height={media.h} rx={f(media.r)} className={L.fs} />
      {bars.map((b, k) => (
        <rect key={k} x={R(b.x, b.w)} y={y + b.y} width={f(b.w)} height={b.h} rx={1.5} className={L.fi} />
      ))}
      {[0, 1].map((k) => (
        <rect key={k} x={R(p, iw)} y={y + 106 + k * 12} width={f(iw)} height={8} rx={3} className={L.fieldBox} />
      ))}
      <rect x={R(p, iw)} y={y + h - 22} width={f(iw)} height={12} rx={slot === "contrast" ? 2 : 6} className={L.fa} />
    </g>
  );
}

interface Geo {
  W: number;
  H: number;
  id: string;
  token: { cx: number; cy: number; w: number; h: number; plinth: number; label: number; size: number; crop: [number, number, number, number]; from: [number, number] };
  covers: readonly number[];
  cy: number;
  cw: number;
  ch: number;
  r: number;
  name: number;
  tick: { y: number; w: number; h: number; gap: number };
  ray: (x: number) => Seg[];
  nameSize: number;
}

// the covers show the whole page (the hero frame at 0.6 scale: 300×552 → 180×331), CTA and note included
const WIDE: Geo = {
  W: 1200,
  H: 463,
  id: "w",
  token: { cx: 120, cy: 220, w: 64, h: 112, plinth: 286, label: 330, size: 13, crop: [64, 146, 176, 302], from: [120, 134] },
  covers: [420, 660, 900],
  cy: 60,
  cw: 180,
  ch: 331,
  r: 14,
  name: 421,
  tick: { y: 437, w: 2, h: 10, gap: 4 },
  ray: (x) => [{ k: "C", a: [120, 134], c1: [120, 0], c2: [x, 0], b: [x, 60] }],
  nameSize: 13,
};

const COMPACT: Geo = {
  W: 360,
  H: 396,
  id: "c",
  token: { cx: 180, cy: 62, w: 36, h: 64, plinth: 100, label: 132, size: 12, crop: [146, 22, 214, 110], from: [180, 146] },
  covers: [12, 128, 244],
  cy: 190,
  cw: 104,
  ch: 150,
  r: 12,
  name: 366,
  tick: { y: 378, w: 2, h: 8, gap: 3 },
  ray: (x) => [{ k: "C", a: [180, 146], c1: [180, 172], c2: [x, 158], b: [x, 190] }],
  nameSize: 12,
};

function Fan({ g, d, t, rtl, cls }: { g: Geo; d: HomeData; t: MarketingCopy; rtl: boolean; cls: string }) {
  const { W, token: k } = g;
  const X = (x: number) => f(mx(x, W, rtl));
  const scale = g.cw / 300;
  const [c0, c1, c2, c3] = k.crop;
  const tick = 8;
  const crop = [
    [c0, c1, 1, 1],
    [c2, c1, -1, 1],
    [c0, c3, 1, -1],
    [c2, c3, -1, -1],
  ]
    .map(([x, y, sx, sy]) => `M${X(x)} ${f(y + tick * sy)}V${f(y)}H${X(x + tick * sx)}`)
    .join("");
  const capX = mxRect(k.cx - k.w / 2, k.w, W, rtl);
  const edgeX = mx(k.cx - k.w / 2 + 6, W, rtl);
  return (
    <svg viewBox={`0 0 ${W} ${g.H}`} className={`${L.svg} ${cls}`} data-v={g.id === "w" ? "wide" : "compact"} aria-hidden="true" focusable="false">
      <defs>
        {g.id !== "w" ? null : g.covers.map((x, i) => (
          <clipPath key={i} id={`fan-${g.id}-${i}`}>
            <rect x={f(mxRect(x, g.cw, W, rtl))} y={g.cy} width={g.cw} height={g.ch} rx={g.r} />
          </clipPath>
        ))}
      </defs>
      {/* the floor the covers stand on */}
      <path d={`M${X(g.covers[0] - 40)} ${f(g.cy + g.ch + 0.5)}H${X(g.covers[2] + g.cw + 40)}`} className={L.floorLine} />
      {/* the product token: a capsule photo on a plinth, framed by crop marks */}
      <g>
        <ellipse cx={X(k.cx)} cy={k.plinth} rx={f(k.w * 0.94)} ry={f(k.w * 0.14)} className={L.plinth} />
        <rect x={f(capX)} y={f(k.cy - k.h / 2)} width={k.w} height={k.h} rx={f(k.w / 2)} className={L.capsule} />
        <path d={`M${f(edgeX)} ${f(k.cy - k.h / 2 + k.w / 2)}V${f(k.cy + k.h / 2 - k.w / 2)}`} className={L.capEdge} />
        <path d={crop} className={L.cropTickLight} />
        <text x={X(k.cx)} y={k.label} textAnchor="middle" fontSize={k.size} className={`${L.lab} ${L.ksF}`}>
          {t.home.director.token}
        </text>
      </g>
      {/* rays: one cubic per cover, arching over (control points at the top) so none crosses a cover */}
      {g.covers.map((x, i) => {
        const segs = mirrorSegs(g.ray(x + g.cw / 2), W, rtl);
        const d0 = toD(segs);
        const s = d.slots[i];
        return (
          <g key={s} style={cv({ "--i": i })}>
            <path d={d0} pathLength={1} className={`${L.ray} ${L.drawn}`} />
            <path d={d0} pathLength={1} data-ray={s} className={`${L.rayOn} ${L.drawn}`} />
            <circle cx={f(segs[0].b[0])} cy={f(segs[0].b[1])} r={2} className={L.jdF} />
          </g>
        );
      })}
      <circle cx={X(k.from[0])} cy={k.from[1]} r={2.5} className={L.jdF} />
      {/* the three covers */}
      {g.covers.map((x0, i) => {
        const s: Slot = d.slots[i];
        const x = mxRect(x0, g.cw, W, rtl);
        return (
          <g key={s} data-cover={s} className={L.cover} style={cv({ "--i": i })}>
            <g data-dim={s} className={L.dim}>
              {SHADES.map((sh, n) => (
                <rect key={n} x={f(x - sh.g / 2)} y={f(g.cy + sh.y)} width={f(g.cw + sh.g)} height={g.ch} rx={g.r + n * 2} className={L.shade} fillOpacity={sh.a} />
              ))}
              {g.id === "w" ? (
                <g clipPath={`url(#fan-${g.id}-${i})`}>
                  <g transform={`translate(${f(x)} ${g.cy}) scale(${f(scale)})`}>
                    <MiniPage slot={s} t={t} rtl={rtl} />
                  </g>
                </g>
              ) : (
                <SmallCover slot={s} x={x} y={g.cy} w={g.cw} h={g.ch} r={g.r} rtl={rtl} />
              )}
              <rect x={f(x + 0.5)} y={f(g.cy + 0.5)} width={g.cw - 1} height={g.ch - 1} rx={g.r - 0.5} className={L.coverEdge} />
            </g>
            <rect x={f(x - 6)} y={g.cy - 6} width={g.cw + 12} height={g.ch + 12} rx={g.r + 5} data-ring={s} className={L.ring} />
            <text x={f(x + g.cw / 2)} y={g.name} textAnchor="middle" fontSize={g.nameSize} className={`${L.lab} ${L.kF}`}>
              {t.home.slots[s]}
            </text>
            <path d={ticks(x + g.cw / 2, g.tick.y, d.rubricDims, g.tick.w, g.tick.h, g.tick.gap)} className={L.ticks} />
          </g>
        );
      })}
    </svg>
  );
}

export function DirectorFan({ d, t, rtl }: { d: HomeData; t: MarketingCopy; rtl: boolean }) {
  return (
    <div className={L.fan} data-model="fan" data-kind="once" data-at="0.35" data-dur="2200">
      <div className={L.fanBox}>
        <Fan g={WIDE} d={d} t={t} rtl={rtl} cls={L.w720} />
        <Fan g={COMPACT} d={d} t={t} rtl={rtl} cls={L.c720} />
      </div>
      <p className={L.srOnly}>{t.home.director.caption}</p>
      <fieldset className={`${L.radios} ${L.radiosLight}`}>
        <legend className={L.srOnly}>{t.home.hero.legend}</legend>
        {d.slots.map((s) => (
          <label key={s} className={L.radio}>
            <input type="radio" name="fan-slot" value={s} defaultChecked={s === "best_fit"} className={L.radioInput} />
            <span>{t.home.slots[s]}</span>
          </label>
        ))}
      </fieldset>
    </div>
  );
}
