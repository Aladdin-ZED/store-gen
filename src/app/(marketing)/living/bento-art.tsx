import type { MarketingCopy } from "../copy";
import type { HomeData } from "./data";
import { anchor, f, mx, mxRect, wrap } from "./geom";
import { cv } from "./loom";
import L from "./living.module.css";

/*
 * OPERATIONS: the six bento illustrations (spec §6.6). Quiet line drawings in --mk-draw at 1.25 px, with jade only on
 * the one live element of each. Each view box is about its cell's width, so the drawings fill their cells at close to
 * 1:1 (the strokes never scale up). Static: the only motion is a hover micro-step (secondary detail 2), never a loop.
 * No figure anywhere: the tracking line carries the real status labels, the profit bars show margin = sales − costs
 * by length alone, the health ring has no score, the backups are four snapshots on a time axis with no times.
 */

type P = { t: MarketingCopy; rtl: boolean };

/* ------------------------------------------------------------------ */
/* 1. order tracking                                                   */
/* ------------------------------------------------------------------ */

export function TrackingArt({ t, rtl, d }: P & { d: HomeData }) {
  void d;
  const labels = [t.home.statuses.new, t.home.statuses.confirmed, t.home.statuses.in_transit, t.home.statuses.delivered];
  const W = 560;
  const X = (x: number) => f(mx(x, W, rtl));
  const nx = [28, 152, 276, 400];
  const cur = 2;
  const dirx = rtl ? -1 : 1;
  const W2 = 320;
  const X2 = (x: number) => f(mx(x, W2, rtl));
  const a2 = anchor(rtl, "start");
  return (
    <>
      <svg viewBox={`0 0 ${W} 132`} className={`${L.svg} ${L.art} ${L.w480}`} aria-hidden="true" focusable="false">
        <path d={`M${X(nx[0])} 50.5H${X(nx[3])}`} className={L.drawSoft} />
        {nx.map((x, i) => (
          <g key={i}>
            <circle cx={X(x)} cy={50.5} r={i < cur ? 4 : 4.5} className={i < cur ? L.dotDone : L.dotTodo} />
            <text x={X(x)} y={86} textAnchor="middle" className={`${L.lab} ${i === cur ? L.kF : L.ksF}`}>
              {labels[i]}
            </text>
          </g>
        ))}
        <circle cx={X(nx[cur])} cy={50.5} r={9} className={`${L.jadeRing} ${L.hoverStep}`} style={cv({ "--hx": `${124 * dirx}px` })} />
        <g>
          <rect x={f(mxRect(476, 48, W, rtl))} y={22} width={48} height={84} rx={9} className={L.drawLine} />
          <path d={`M${X(492)} 40V88`} className={L.drawSoft} />
          {[0, 1, 2, 3].map((k) => (
            <g key={k}>
              <circle cx={X(492)} cy={40 + 16 * k} r={2.5} className={k <= cur ? L.dotDone : L.dotTodo} />
              <rect x={f(mxRect(500, 14, W, rtl))} y={38.5 + 16 * k} width={14} height={3} rx={1.5} className={L.inkBar} />
            </g>
          ))}
        </g>
      </svg>
      <svg viewBox={`0 0 ${W2} 176`} className={`${L.svg} ${L.art} ${L.c480}`} aria-hidden="true" focusable="false">
        <path d={`M${X2(24)} 22V154`} className={L.drawSoft} />
        {[22, 66, 110, 154].map((y, i) => (
          <g key={i}>
            <circle cx={X2(24)} cy={y} r={i < cur ? 4 : 4.5} className={i < cur ? L.dotDone : L.dotTodo} />
            {i === cur ? <circle cx={X2(24)} cy={y} r={9} className={L.jadeRing} /> : null}
            <text x={X2(44)} y={y + 4.5} textAnchor={a2} className={`${L.lab} ${i === cur ? L.kF : L.ksF}`}>
              {labels[i]}
            </text>
          </g>
        ))}
        <rect x={f(mxRect(248, 48, W2, rtl))} y={46} width={48} height={84} rx={9} className={L.drawLine} />
        {[0, 1, 2, 3].map((k) => (
          <circle key={k} cx={X2(264)} cy={64 + 16 * k} r={2.5} className={k <= cur ? L.dotDone : L.dotTodo} />
        ))}
      </svg>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* 2. delivery zones and days                                          */
/* ------------------------------------------------------------------ */

/** A flat-top hexagon of circumradius r centred on (cx, cy). */
function hexPath(cx: number, cy: number, r: number): string {
  let d = "";
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i;
    d += `${i ? "L" : "M"}${f(cx + r * Math.cos(a))} ${f(cy + r * Math.sin(a))}`;
  }
  return `${d}Z`;
}

const HEX_R = 16;
const SQ3 = Math.sqrt(3);
/** Axial cells (q, r) of the delivery map: a radius-4 field with a ragged coast (ring-4 cells left out by index). */
const COAST_GAPS = new Set([1, 2, 6, 9, 10, 11, 15, 19, 20, 22]);
const HEX_CELLS: readonly { q: number; r: number; ring: number; zone: number }[] = (() => {
  const out: { q: number; r: number; ring: number; zone: number }[] = [];
  const dirs = [
    [1, 0],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [0, -1],
    [1, -1],
  ];
  const zoneOf = (q: number, r: number, ring: number) => {
    if (ring <= 1) return 0;
    // three districts around the centre, by the cell's angle on the map
    const x = 1.5 * q;
    const y = SQ3 * (r + q / 2);
    const deg = ((Math.atan2(y, x) * 180) / Math.PI + 360 + 30) % 360;
    return 1 + Math.floor(deg / 120);
  };
  out.push({ q: 0, r: 0, ring: 0, zone: 0 });
  for (let ring = 1; ring <= 4; ring++) {
    // start at direction 4 × ring, then walk the six sides
    let q = dirs[4][0] * ring;
    let r = dirs[4][1] * ring;
    let n = 0;
    for (let side = 0; side < 6; side++) {
      for (let step = 0; step < ring; step++) {
        if (!(ring === 4 && COAST_GAPS.has(n))) out.push({ q, r, ring, zone: zoneOf(q, r, ring) });
        q += dirs[side][0];
        r += dirs[side][1];
        n++;
      }
    }
  }
  return out;
})();
/** Steel tints of the four zones (the centre, then three districts): fill opacity only, no figure. */
const ZONE_TINT = [0.34, 0.22, 0.12, 0.28];

export function DeliveryArt({ t, rtl }: P) {
  // the field's box: the map's bounds plus a margin; the SVG fills whatever height its cell gives it (meet)
  const W = 236;
  const H = 260;
  const cx0 = W / 2;
  const cy0 = H / 2;
  const at = (q: number, r: number) => ({ x: mx(cx0 + 1.5 * HEX_R * q, W, rtl), y: cy0 + SQ3 * HEX_R * (r + q / 2) });
  const zone = at(1, -1);
  const next = at(2, -1);
  // a week starting Monday (ISO): filled pills are delivery days, outlined pills are closed (no letters: they don't localize)
  const open = [true, true, true, true, true, true, false];
  return (
    <>
      <div className={L.days} aria-hidden="true">
        <span className={L.dayRow}>
          {open.map((o, i) => (
            <span key={i} className={o ? L.dayPillOn : L.dayPillOff} />
          ))}
        </span>
        <span className={L.dayLabel}>{t.home.ops.delivery.days}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className={`${L.svg} ${L.deliveryField}`} aria-hidden="true" focusable="false">
        {HEX_CELLS.map((c, i) => {
          const p = at(c.q, c.r);
          return <path key={i} d={hexPath(p.x, p.y, HEX_R - 1)} className={L.hex} fillOpacity={ZONE_TINT[c.zone]} />;
        })}
        <path
          d={hexPath(zone.x, zone.y, HEX_R - 1)}
          className={`${L.hexZone} ${L.hoverStep}`}
          style={cv({ "--hx": `${f(next.x - zone.x)}px`, "--hy": `${f(next.y - zone.y)}px` })}
        />
      </svg>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* 3. profit                                                           */
/* ------------------------------------------------------------------ */

export function ProfitArt({ t, rtl }: P) {
  const W = 360;
  const X = (x: number) => f(mx(x, W, rtl));
  const R = (x: number, w: number) => f(mxRect(x, w, W, rtl));
  const a = anchor(rtl, "start");
  const x0 = 1;
  const sales = 336;
  const costs = 212;
  const rows = [
    { label: t.home.ops.profit.sales, y: 15 },
    { label: t.home.ops.profit.costs, y: 71 },
    { label: t.home.ops.profit.margin, y: 127 },
  ];
  return (
    <svg viewBox={`0 0 ${W} 160`} className={`${L.svg} ${L.art}`} aria-hidden="true" focusable="false">
      {rows.map((r) => (
        <text key={r.label} x={X(x0)} y={r.y} textAnchor={a} fontSize={14} className={`${L.lab} ${L.ksF}`}>
          {r.label}
        </text>
      ))}
      <rect x={R(x0, sales)} y={26} width={sales} height={14} rx={7} className={L.barDraw} />
      <rect x={R(x0, costs)} y={82} width={costs} height={14} rx={7} className={L.barDraw} />
      <path d={`M${X(x0 + costs)} 100V134M${X(x0 + sales)} 44V134`} className={L.guide} />
      <rect x={R(x0 + costs, sales - costs)} y={138} width={sales - costs} height={14} rx={7} className={L.jdF} />
      <path d={`M${X(x0 + sales + 8)} 135V155`} className={`${L.marginTick} ${L.hoverStep}`} style={cv({ "--hx": `${rtl ? -4 : 4}px` })} />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* 4. store health (dark cell)                                         */
/* ------------------------------------------------------------------ */

export function HealthArt({ t, rtl }: P) {
  void rtl;
  const C = 96;
  const r = 70;
  const gap = 7;
  const arc = (i: number) => {
    const a0 = ((-90 + i * 45 + gap / 2) * Math.PI) / 180;
    const a1 = ((-90 + (i + 1) * 45 - gap / 2) * Math.PI) / 180;
    return `M${f(C + r * Math.cos(a0))} ${f(C + r * Math.sin(a0))}A${r} ${r} 0 0 1 ${f(C + r * Math.cos(a1))} ${f(C + r * Math.sin(a1))}`;
  };
  const lines = wrap(t.home.ops.health.title, 12);
  return (
    <svg viewBox={`0 0 ${C * 2} ${C * 2}`} className={`${L.svg} ${L.art} ${L.artHealth}`} aria-hidden="true" focusable="false">
      <circle cx={C} cy={C} r={r - 14} className={L.healthInner} />
      {Array.from({ length: 8 }, (_, i) => (
        <path key={i} d={arc(i)} className={i === 7 ? L.segWait : L.segOk} />
      ))}
      <path d={arc(7)} className={`${L.segOk} ${L.hoverShow}`} />
      {lines.map((ln, k) => (
        <text key={k} x={C} y={f(C + 4 + (k - (lines.length - 1) / 2) * 15)} textAnchor="middle" className={`${L.lab} ${L.tSoft}`}>
          {ln}
        </text>
      ))}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* 5. team roles                                                       */
/* ------------------------------------------------------------------ */

/** The roles' cascade at one width: wide (cells 360 px and up) and compact, so the labels stay near 13 px. */
function RolesSvg({ t, rtl, d, W, TW, TH, dy, cls }: P & { d: HomeData; W: number; TW: number; TH: number; dy: number; cls: string }) {
  const a = anchor(rtl, "start");
  const n = d.roles.length;
  const step = (W - 2 - TW - 8) / (n - 1);
  const H = 1 + (n - 1) * dy + TH + 14;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={`${L.svg} ${L.art} ${cls}`} aria-hidden="true" focusable="false">
      {d.roles.map((role, i) => {
        const x = mxRect(1 + i * step, TW, W, rtl);
        const y = 1 + i * dy;
        const hole = rtl ? x + TW - 20 : x + 20;
        return (
          <g key={role} className={L.roleTag} style={cv({ "--i": i, "--hx": `${(rtl ? -1 : 1) * i * 5}px`, "--hy": `${-i * 3}px` })}>
            {[
              { a: 0.05, dy: 6, g: 2 },
              { a: 0.035, dy: 12, g: 6 },
            ].map((s, k) => (
              <rect key={k} x={f(x - s.g / 2)} y={y + s.dy} width={TW + s.g} height={TH} rx={12 + k * 2} className={L.shade} fillOpacity={s.a} />
            ))}
            <rect x={f(x)} y={y} width={TW} height={TH} rx={12} className={i === 0 ? L.tagLive : L.tagDraw} />
            <circle cx={f(hole)} cy={y + TH / 2} r={4.5} className={i === 0 ? L.jadeRing : L.drawLine} />
            <text x={f(rtl ? x + TW - 36 : x + 36)} y={y + TH / 2 + 5} textAnchor={a} fontSize={14} className={`${L.lab} ${L.kF}`}>
              {t.home.roles[role]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function RolesArt({ t, rtl, d }: P & { d: HomeData }) {
  return (
    <>
      <RolesSvg t={t} rtl={rtl} d={d} W={440} TW={180} TH={44} dy={36} cls={L.w360} />
      <RolesSvg t={t} rtl={rtl} d={d} W={300} TW={188} TH={40} dy={38} cls={L.c360} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* 6. backups                                                          */
/* ------------------------------------------------------------------ */

interface BackupsGeo {
  W: number;
  CW: number;
  CH: number;
  glyph: number;
  bars: readonly [number, number];
  tick: number;
  cls: string;
}

/** Four snapshots on a time axis, the past at the inline start, the latest (jade) at the inline end. No times. */
function BackupsSvg({ rtl, g }: { rtl: boolean; g: BackupsGeo }) {
  const { W, CW, CH, glyph } = g;
  const X = (x: number) => f(mx(x, W, rtl));
  const R = (x: number, w: number) => f(mxRect(x, w, W, rtl));
  const top = 18;
  const axis = top + CH + 38;
  const gap = (W - 2 - 4 * CW) / 3;
  const xs = [0, 1, 2, 3].map((i) => 1 + i * (CW + gap));
  const fade = [0.45, 0.62, 0.8, 1];
  const pad = Math.round(CW * 0.12);
  // the time axis: a quiet ruler of fine ticks
  let ruler = "";
  for (let x = 1 + g.tick / 2; x < W - 4; x += g.tick) ruler += `M${X(x)} ${axis + 4}v4`;
  return (
    <svg viewBox={`0 0 ${W} ${axis + 18}`} className={`${L.svg} ${L.art} ${g.cls}`} aria-hidden="true" focusable="false">
      <path d={`M${X(1)} ${axis + 0.5}H${X(W - 1)}`} className={L.drawSoft} />
      <path d={ruler} className={L.ruler} />
      {xs.map((x0, i) => {
        const live = i === xs.length - 1;
        const cx = x0 + CW / 2;
        const body = (
          <>
            <rect x={R(x0, CW)} y={top} width={CW} height={CH} rx={12} className={live ? L.slabLive : L.slab} />
            <use href="#sg-clock" x={X(rtl ? x0 + pad + glyph : x0 + pad)} y={top + pad} width={glyph} height={glyph} className={live ? L.jadeGlyph : L.dkGlyph} />
            <rect x={R(x0 + pad, g.bars[0])} y={top + CH - pad - 14} width={g.bars[0]} height={4} rx={2} className={L.inkBar} />
            <rect x={R(x0 + pad, g.bars[1])} y={top + CH - pad - 4} width={g.bars[1]} height={4} rx={2} className={L.inkBar} fillOpacity={0.6} />
            <path d={`M${X(cx)} ${top + CH + 1}V${axis - (live ? 9 : 5)}`} className={live ? L.stemLive : L.drawSoft} />
          </>
        );
        return live ? (
          <g key={i}>
            <g className={L.hoverStep} style={cv({ "--hy": "-4px" })}>
              {body}
            </g>
            <circle cx={X(cx)} cy={axis + 0.5} r={8} className={L.jadeRing} />
            <circle cx={X(cx)} cy={axis + 0.5} r={3.5} className={L.jdF} />
          </g>
        ) : (
          <g key={i} opacity={fade[i]}>
            {body}
            <circle cx={X(cx)} cy={axis + 0.5} r={3.5} className={L.dotDone} />
          </g>
        );
      })}
    </svg>
  );
}

export function BackupsArt({ rtl }: { rtl: boolean }) {
  return (
    <>
      <BackupsSvg rtl={rtl} g={{ W: 560, CW: 116, CH: 76, glyph: 20, bars: [72, 48], tick: 21, cls: L.w360 }} />
      <BackupsSvg rtl={rtl} g={{ W: 320, CW: 68, CH: 60, glyph: 16, bars: [40, 26], tick: 16, cls: L.c360 }} />
    </>
  );
}
