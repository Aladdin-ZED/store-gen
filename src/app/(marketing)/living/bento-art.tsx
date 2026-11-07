import type { MarketingCopy } from "../copy";
import type { HomeData } from "./data";
import { anchor, f, mx, mxRect, wrap } from "./geom";
import { cv } from "./loom";
import L from "./living.module.css";

/*
 * OPERATIONS: the six bento illustrations (spec §6.6). Quiet line drawings in --mk-draw at 1.25 px, with jade only on
 * the one live element of each. Static: the only motion is a hover micro-step (secondary detail 2), never a loop.
 * No figure anywhere: the tracking line carries the real status labels, the profit bars show margin = sales − costs
 * by length alone, the health ring has no score.
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

const HEX_R = 22;
function hexPath(cx: number, cy: number, r = HEX_R): string {
  let d = "";
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i;
    d += `${i ? "L" : "M"}${f(cx + r * Math.cos(a))} ${f(cy + r * Math.sin(a))}`;
  }
  return `${d}Z`;
}

export function DeliveryArt({ t, rtl }: P) {
  const W = 320;
  const X = (x: number) => f(mx(x, W, rtl));
  const counts = [2, 3, 4, 3, 2];
  const dx = HEX_R * 1.5;
  const dy = HEX_R * Math.sqrt(3);
  const cx0 = 160;
  const cy0 = 190;
  const tints = [0.22, 0.12, 0.34, 0.12, 0.22, 0.34, 0.12, 0.22, 0.12, 0.34, 0.22, 0.12, 0.34, 0.22];
  const cells: { x: number; y: number }[] = [];
  counts.forEach((n, q) => {
    for (let k = 0; k < n; k++) cells.push({ x: cx0 + (q - 2) * dx, y: cy0 + (k - (n - 1) / 2) * dy });
  });
  const zone = cells[6];
  const next = cells[10];
  // a week starting Monday (ISO): filled pills are delivery days, outlined pills are closed (no letters: they don't localize)
  const open = [true, true, true, true, true, true, false];
  return (
    <svg viewBox={`0 0 ${W} 290`} className={`${L.svg} ${L.art} ${L.artDelivery}`} aria-hidden="true" focusable="false">
      {open.map((o, i) => (
        <rect key={i} x={f(mxRect(24 + i * 40, 32, W, rtl))} y={20} width={32} height={14} rx={7} className={o ? L.dayOn : L.dayOff} />
      ))}
      <text x={X(24)} y={56} textAnchor={anchor(rtl, "start")} className={`${L.lab} ${L.ksF}`}>
        {t.home.ops.delivery.days}
      </text>
      {cells.map((c, i) => (
        <path key={i} d={hexPath(mx(c.x, W, rtl), c.y, HEX_R - 1.5)} className={L.hex} fillOpacity={tints[i]} />
      ))}
      <path
        d={hexPath(mx(zone.x, W, rtl), zone.y, HEX_R - 1.5)}
        className={`${L.hexZone} ${L.hoverStep}`}
        style={cv({ "--hx": `${f(mx(next.x, W, rtl) - mx(zone.x, W, rtl))}px`, "--hy": `${f(next.y - zone.y)}px` })}
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* 3. profit                                                           */
/* ------------------------------------------------------------------ */

export function ProfitArt({ t, rtl }: P) {
  const W = 320;
  const X = (x: number) => f(mx(x, W, rtl));
  const R = (x: number, w: number) => f(mxRect(x, w, W, rtl));
  const a = anchor(rtl, "start");
  const sales = 272;
  const costs = 172;
  const rows = [
    { label: t.home.ops.profit.sales, y: 20 },
    { label: t.home.ops.profit.costs, y: 70 },
    { label: t.home.ops.profit.margin, y: 120 },
  ];
  return (
    <svg viewBox={`0 0 ${W} 156`} className={`${L.svg} ${L.art}`} aria-hidden="true" focusable="false">
      {rows.map((r) => (
        <text key={r.label} x={X(24)} y={r.y} textAnchor={a} className={`${L.lab} ${L.ksF}`}>
          {r.label}
        </text>
      ))}
      <rect x={R(24, sales)} y={30} width={sales} height={10} rx={5} className={L.barDraw} />
      <rect x={R(24, costs)} y={80} width={costs} height={10} rx={5} className={L.barDraw} />
      <path d={`M${X(24 + costs)} 94V126M${X(24 + sales)} 44V126`} className={L.guide} />
      <rect x={R(24 + costs, sales - costs)} y={130} width={sales - costs} height={10} rx={5} className={L.jdF} />
      <path d={`M${X(24 + sales + 6)} 128V142`} className={`${L.marginTick} ${L.hoverStep}`} style={cv({ "--hx": `${rtl ? -4 : 4}px` })} />
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

export function RolesArt({ t, rtl, d }: P & { d: HomeData }) {
  const W = 300;
  const a = anchor(rtl, "start");
  return (
    <svg viewBox={`0 0 ${W} 150`} className={`${L.svg} ${L.art}`} aria-hidden="true" focusable="false">
      {d.roles.map((role, i) => {
        const x = mxRect(20 + i * 40, 136, W, rtl);
        const y = 14 + i * 30;
        const hole = rtl ? x + 136 - 16 : x + 16;
        return (
          <g key={role} className={L.roleTag} style={cv({ "--i": i, "--hx": `${(rtl ? -1 : 1) * i * 5}px`, "--hy": `${-i * 3}px` })}>
            <rect x={f(x)} y={y} width={136} height={38} rx={10} className={i === 0 ? L.tagLive : L.tagDraw} />
            <circle cx={f(hole)} cy={y + 19} r={4} className={L.drawLine} />
            <text x={f(rtl ? x + 136 - 30 : x + 30)} y={y + 23.5} textAnchor={a} className={`${L.lab} ${L.kF}`}>
              {t.home.roles[role]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* 6. backups                                                          */
/* ------------------------------------------------------------------ */

export function BackupsArt({ rtl }: { rtl: boolean }) {
  const W = 320;
  const X = (x: number) => f(mx(x, W, rtl));
  return (
    <svg viewBox={`0 0 ${W} 150`} className={`${L.svg} ${L.art}`} aria-hidden="true" focusable="false">
      {[3, 2, 1].map((k) => (
        <rect key={k} x={f(mxRect(56 + k * 8, 208, W, rtl))} y={44 + k * 12} width={208} height={56} rx={12} className={L.slab} fillOpacity={1 - k * 0.12} />
      ))}
      <g className={L.hoverStep} style={cv({ "--hy": "-4px" })}>
        <rect x={f(mxRect(56, 208, W, rtl))} y={44} width={208} height={56} rx={12} className={L.slabLive} />
        <use href="#sg-clock" x={X(rtl ? 74 + 20 : 74)} y={62} width={20} height={20} className={L.jadeGlyph} />
        <rect x={f(mxRect(106, 96, W, rtl))} y={64} width={96} height={4} rx={2} className={L.inkBar} />
        <rect x={f(mxRect(106, 60, W, rtl))} y={74} width={60} height={4} rx={2} className={L.inkBar} fillOpacity={0.6} />
      </g>
    </svg>
  );
}
