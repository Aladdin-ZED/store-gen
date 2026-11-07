import type { MarketingCopy } from "../copy";
import type { HomeData } from "./data";
import { anchor, f, ISO, mirrorSegs, mx, orthoPath, ptsAttr, samplePath, toD, wrap, type Seg } from "./geom";
import { cv, PALETTE } from "./loom";
import L from "./living.module.css";

/*
 * ENGINE: the gene ledger and the exploded page (spec §6.3). One bar per gene of the genome (GENE_KEYS), its height
 * the index of the seed's real value in GENE_VOCAB (struct and range genes, and genes the seed doesn't lock, stand at
 * a neutral 36 at 0.4 alpha), so the ledger is true by construction. The cursor re-samples from apothecary-stage to
 * editorial-editorial-column; the page's grid, layout-and-type and colour-and-image planes recompose and separate,
 * then a token passes the design, novelty and honesty checks. SSR = the final frame (the second seed).
 */

const CHECK = "M1.5 6.6l3.2 3.2L11 2.6";

/** The labelled ids under the ledger: the bold genes and every fifth gene. */
const LABELLED = new Set(["G1", "G2", "G4", "G9", "G18", "G23", "G28", "G5", "G10", "G15", "G20", "G25", "G30", "G35"]);

function Plane({ kind, cols, s }: { kind: "grid" | "layout" | "colour"; cols: { a: number; b: number }; s: number }) {
  const W = 150 * s;
  const H = 190 * s;
  const u0 = -W / 2;
  const v0 = -H / 2;
  const k = (n: number) => n * s;
  if (kind === "grid") {
    const lines = (n: number) => {
      const out: string[] = [];
      for (let i = 0; i <= n; i++) {
        const u = u0 + k(10) + ((W - k(20)) * i) / n;
        out.push(`M${f(u)} ${f(v0 + k(8))}V${f(-v0 - k(8))}`);
      }
      return out.join("");
    };
    return (
      <g>
        <rect x={f(u0)} y={f(v0)} width={f(W)} height={f(H)} rx={k(8)} className={L.planeGrid} />
        <path d={lines(cols.a)} className={L.planeCols} data-pa="" />
        <path d={lines(cols.b)} className={L.planeCols} data-pb="" />
      </g>
    );
  }
  if (kind === "layout") {
    const stage = (
      <g data-pa="" className={L.planeInk}>
        <rect x={f(u0 + k(10))} y={f(v0 + k(10))} width={f(W - k(20))} height={f(k(72))} rx={k(6)} className={L.planeBox} />
        <rect x={f(u0 + k(10))} y={f(v0 + k(92))} width={f(k(104))} height={f(k(8))} rx={k(2)} />
        <rect x={f(u0 + k(10))} y={f(v0 + k(104))} width={f(k(72))} height={f(k(6))} rx={k(2)} fillOpacity={0.6} />
        {[0, 1, 2].map((n) => (
          <rect key={n} x={f(u0 + k(10))} y={f(v0 + k(120 + 15 * n))} width={f(W - k(20))} height={f(k(10))} rx={k(3)} className={L.planeBox} />
        ))}
        <rect x={f(u0 + k(10))} y={f(v0 + k(168))} width={f(W - k(20))} height={f(k(12))} rx={k(6)} className={L.planeBox} />
      </g>
    );
    const editorial = (
      <g data-pb="" className={L.planeInk}>
        <rect x={f(u0 + k(10))} y={f(v0 + k(10))} width={f(k(118))} height={f(k(9))} rx={k(1)} />
        <rect x={f(u0 + k(10))} y={f(v0 + k(23))} width={f(k(110))} height={f(k(9))} rx={k(1)} />
        <rect x={f(u0 + k(10))} y={f(v0 + k(36))} width={f(k(64))} height={f(k(9))} rx={k(1)} />
        <rect x={f(u0 + k(10))} y={f(v0 + k(54))} width={f(W - k(20))} height={f(k(58))} rx={k(1.5)} className={L.planeBox} />
        {[0, 1, 2].map((n) => (
          <rect key={n} x={f(u0 + k(10))} y={f(v0 + k(120 + 15 * n))} width={f(W - k(20))} height={f(k(10))} rx={k(3)} className={L.planeBox} />
        ))}
        <rect x={f(u0 + k(10))} y={f(v0 + k(168))} width={f(W - k(20))} height={f(k(12))} rx={k(1.5)} className={L.planeBox} />
      </g>
    );
    return (
      <g>
        <rect x={f(u0)} y={f(v0)} width={f(W)} height={f(H)} rx={k(8)} className={L.planeLayout} />
        {stage}
        {editorial}
      </g>
    );
  }
  const face = (slot: "best_fit" | "contrast", attr: object, r: number) => (
    <g className={PALETTE[slot]} {...attr}>
      <rect x={f(u0)} y={f(v0)} width={f(W)} height={f(H)} rx={k(8)} className={`${L.fg} ${L.planeEdge}`} />
      <rect x={f(u0 + k(10))} y={f(v0 + k(10))} width={f(W - k(20))} height={f(k(72))} rx={k(r)} className={L.fs} />
      <rect x={f(u0 + k(10))} y={f(v0 + k(168))} width={f(W - k(20))} height={f(k(12))} rx={k(r)} className={L.fa} />
    </g>
  );
  return (
    <g>
      {face("best_fit", { "data-pa": "" }, 6)}
      {face("contrast", { "data-pb": "" }, 1.5)}
    </g>
  );
}

function Planes({ cx, cy, gap, s, cols, rtl, W }: { cx: number; cy: number; gap: number; s: number; cols: HomeData["columns"]; rtl: boolean; W: number }) {
  const x = mx(cx, W, rtl);
  const flip = rtl ? " scale(-1 1)" : "";
  const layer = (kind: "grid" | "layout" | "colour", off: number, n: number) => (
    <g transform={`translate(${f(x)} ${f(cy - off)})`}>
      <g data-plane={n} style={cv({ "--off": `${f(off)}px` })} className={L.planeLift}>
        <g transform={`${flip.trim()} ${ISO}`.trim()}>
          <Plane kind={kind} cols={cols} s={s} />
        </g>
      </g>
    </g>
  );
  return (
    <g>
      {layer("colour", 0, 0)}
      {layer("layout", gap, 1)}
      {layer("grid", gap * 2, 2)}
    </g>
  );
}

function Wide({ d, t, rtl }: { d: HomeData; t: MarketingCopy; rtl: boolean }) {
  const W = 640;
  const X = (x: number) => mx(x, W, rtl);
  const a = (s: "start" | "end") => anchor(rtl, s);
  const CX = 196;
  const CY = 384;
  const GAP = 58;
  const PS = 0.72;
  const barX = (i: number) => 40 + 16 * i;
  const cursorTo = barX(d.ledger.length - 1) - barX(0);
  // the planes' upper-left edges (left corner → top vertex), where the feeds land
  const edge = (off: number, p: number): [number, number] => {
    const l: [number, number] = [CX - 147.2 * PS, CY - off + 10 * PS];
    const tv: [number, number] = [CX + 17.3 * PS, CY - off - 85 * PS];
    return [l[0] + (tv[0] - l[0]) * p, l[1] + (tv[1] - l[1]) * p];
  };
  const feeds: { gene: string; to: [number, number] }[] = [
    { gene: "G3", to: edge(GAP * 2, 0.2) },
    { gene: "G2", to: edge(GAP, 0.12) },
    { gene: "G9", to: edge(0, 0.5) },
  ];
  const feedSegs = feeds.map(({ gene, to }) => {
    const i = d.ledger.findIndex((b) => b.gene === gene);
    const x0 = barX(i);
    const segs: Seg[] = [{ k: "C", a: [x0, 178], c1: [x0, 230], c2: [to[0], to[1] - 50], b: to }];
    return mirrorSegs(segs, W, rtl);
  });
  // the token leaves the top plane's far vertex, runs along the rail and down through the three checks
  const top: [number, number] = [CX + 17.3 * PS, CY - GAP * 2 - 85 * PS];
  const RY = 196;
  const tokenSegs = mirrorSegs(orthoPath([[top[0], top[1]], [top[0], RY], [552, RY], [552, 440]], 12), W, rtl);
  const tokenPts = samplePath(tokenSegs, 48);
  const gateYs = [290, 350, 410];
  const lead = top[1] - RY + (552 - top[0]);
  const total = lead + (440 - RY);
  const passAt = gateYs.map((y) => (lead + (y - RY)) / total);
  const labelY = [CY - GAP * 2 - 10 * PS, CY - GAP - 10 * PS, CY - 10 * PS];
  const layerNames = [t.home.engine.layers[0], t.home.engine.layers[1], t.home.engine.layers[2]];
  const layerIds = ["G3", "G2 G4", "G9 G18"];
  return (
    <svg viewBox={`0 0 ${W} 460`} className={`${L.svg} ${L.vWide}`} data-v="wide" aria-hidden="true" focusable="false">
      <path d={`M${f(X(28))} 150.5H${f(X(596))}`} className={L.baseLine} />
      {d.ledger.map((b, i) => {
        const w = b.bold ? 6 : 4;
        const cx = X(barX(i));
        return (
          <rect
            key={b.gene}
            x={f(cx - w / 2)}
            y={f(150 - b.b.h)}
            width={w}
            height={f(b.b.h)}
            rx={w / 2}
            data-bar={i}
            style={cv({ "--from": f(b.a.h / b.b.h), "--i": i })}
            className={`${L.bar} ${b.bold ? L.barBold : ""} ${b.b.known ? "" : L.barSoft}`}
          />
        );
      })}
      {d.ledger.map((b, i) =>
        LABELLED.has(b.gene) ? (
          <text key={b.gene} x={f(X(barX(i)))} y={b.gene === "G10" ? 182 : 170} textAnchor="middle" className={`${L.mono10} ${L.kmF}`}>
            {b.gene}
          </text>
        ) : null,
      )}
      <path d={`M${f(X(barX(0)))} 50V156`} style={cv({ "--cx": `${f(rtl ? -cursorTo : cursorTo)}px` })} className={L.cursor} />
      <Planes cx={CX} cy={CY} gap={GAP} s={PS} cols={d.columns} rtl={rtl} W={W} />
      {feedSegs.map((segs, i) => (
        <g key={feeds[i].gene}>
          <path d={toD(segs)} className={L.feed} />
          <path d={toD(segs)} pathLength={1} data-feed={i} style={cv({ "--i": i })} className={L.feedOn} />
          <circle cx={f(segs[0].b[0])} cy={f(segs[0].b[1])} r={2.5} className={L.jdF} />
        </g>
      ))}
      {labelY.map((y, i) => {
        const lines = wrap(layerNames[i], 13);
        const rx = X(CX + 147.2 * PS + 4);
        return (
          <g key={i}>
            <path d={`M${f(rx)} ${f(y)}H${f(X(364))}`} className={L.leader} />
            <circle cx={f(X(CX + 147.2 * PS))} cy={f(y)} r={2} className={L.kmF} />
            {lines.map((ln, k) => (
              <text key={k} x={f(X(372))} y={f(y + 4 + 14 * k)} textAnchor={a("start")} className={`${L.lab} ${L.kF}`}>
                {ln}
              </text>
            ))}
            <text x={f(X(372))} y={f(y + 4 + 14 * lines.length)} textAnchor={a("start")} className={`${L.mono10} ${L.kmF}`}>
              {layerIds[i]}
            </text>
          </g>
        );
      })}
      <path d={toD(tokenSegs)} className={L.gateRail} />
      {gateYs.map((y, k) => (
        <g key={y}>
          <path d={`M${f(X(544))} ${y}H${f(X(560))}`} className={L.notch} />
          <g transform={`translate(${f(X(rtl ? 580 : 568) - (rtl ? 0 : 0))} ${y - 6})`}>
            <path d={CHECK} pathLength={1} data-check={k} style={cv({ "--at": f(passAt[k]) })} className={L.checkLight} />
          </g>
          <text x={f(X(586))} y={y + 4} textAnchor={a("start")} className={`${L.lab} ${L.kF}`}>
            {t.home.engine.checks[k]}
          </text>
        </g>
      ))}
      <rect x={-5} y={-5} width={10} height={10} rx={3} data-token={ptsAttr(tokenPts)} className={L.token} />
    </svg>
  );
}

function Compact({ d, t, rtl }: { d: HomeData; t: MarketingCopy; rtl: boolean }) {
  const W = 360;
  const X = (x: number) => mx(x, W, rtl);
  const a = (s: "start" | "end") => anchor(rtl, s);
  const barX = (i: number) => 24 + 9 * i;
  const cursorTo = barX(d.ledger.length - 1) - barX(0);
  const S = 0.6;
  const CX = 128;
  const CY = 420;
  const GAP = 60;
  const labelY = [CY - GAP * 2 - 8, CY - GAP - 8, CY - 8];
  const gx = [64, 180, 296];
  let bold = 0;
  return (
    <svg viewBox={`0 0 ${W} 600`} className={`${L.svg} ${L.vCompact}`} data-v="compact" aria-hidden="true" focusable="false">
      <path d={`M${f(X(14))} 150.5H${f(X(346))}`} className={L.baseLine} />
      {d.ledger.map((b, i) => {
        const w = b.bold ? 5 : 3;
        const cx = X(barX(i));
        return (
          <rect key={b.gene} x={f(cx - w / 2)} y={f(150 - b.b.h)} width={w} height={f(b.b.h)} rx={w / 2} data-bar={i} style={cv({ "--from": f(b.a.h / b.b.h), "--i": i })} className={`${L.bar} ${b.bold ? L.barBold : ""} ${b.b.known ? "" : L.barSoft}`} />
        );
      })}
      {d.ledger.map((b, i) => (b.bold ? <text key={b.gene} x={f(X(barX(i)))} y={bold++ % 2 ? 182 : 170} textAnchor="middle" className={`${L.mono10} ${L.kmF}`}>{b.gene}</text> : null))}
      <path d={`M${f(X(barX(0)))} 50V156`} style={cv({ "--cx": `${f(rtl ? -cursorTo : cursorTo)}px` })} className={L.cursor} />
      <Planes cx={CX} cy={CY} gap={GAP} s={S} cols={d.columns} rtl={rtl} W={W} />
      {labelY.map((y, i) => {
        const lines = wrap(t.home.engine.layers[i], 11);
        const rx0 = X(CX + 147.2 * S + 4);
        return (
          <g key={i}>
            <path d={`M${f(rx0)} ${f(y)}H${f(X(266))}`} className={L.leader} />
            {lines.map((ln, k) => (
              <text key={k} x={f(X(272))} y={f(y + 4 + 14 * k)} textAnchor={a("start")} className={`${L.lab} ${L.kF}`}>
                {ln}
              </text>
            ))}
          </g>
        );
      })}
      <path d={`M${f(X(24))} 520.5H${f(X(336))}`} className={L.gateRail} />
      {gx.map((x, k) => (
        <g key={x}>
          <path d={`M${f(X(x))} 512V528`} className={L.notch} />
          <g transform={`translate(${f(X(x) - 6)} 538)`}>
            <path d={CHECK} pathLength={1} data-check={k} style={cv({ "--at": f((k + 1) / 4) })} className={L.checkLight} />
          </g>
          <text x={f(X(x))} y={570} textAnchor="middle" className={`${L.lab} ${L.kF}`}>
            {t.home.engine.checks[k]}
          </text>
        </g>
      ))}
    </svg>
  );
}

export function Ledger({ d, t, rtl }: { d: HomeData; t: MarketingCopy; rtl: boolean }) {
  return (
    <div className={L.ledger} data-model="ledger" data-kind="once" data-dur="3200">
      <Wide d={d} t={t} rtl={rtl} />
      <Compact d={d} t={t} rtl={rtl} />
      <p className={L.srOnly}>{t.home.engine.caption}</p>
    </div>
  );
}

