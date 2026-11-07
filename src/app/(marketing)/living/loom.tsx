import type { CSSProperties, ReactNode } from "react";
import type { MarketingCopy } from "../copy";
import type { BoldGeneId, HomeData, Slot } from "./data";
import { anchor, f, mx, mxRect, orthoPath, rectAttr, toD } from "./geom";
import L from "./living.module.css";

/*
 * HERO: the genome loom (spec §6.2). A store page composes itself from the seven bold genes of a real designer seed,
 * passes the three publish-gate families (design, budgets, honesty: design_blocked, budget_blocked, honesty_blocked),
 * then re-composes into the contrast and explore directions. The SSR markup is the best_fit final frame; the radios
 * switch the state by CSS alone (:has), the runtime (./controllers.ts) adds the intro loop and the FLIP morphs.
 * Geometry is authored in LTR and mirrored by mx()/mxRect() for Arabic; no group with text is ever flipped.
 */

export const cv = (o: Record<string, string | number>) => o as CSSProperties;

export const PALETTE: Readonly<Record<Slot, string>> = { best_fit: L.pal_best, contrast: L.pal_contrast, explore: L.pal_explore };

type Rect = readonly [number, number, number, number];

/** Bounding boxes (frame units, LTR) of the blocks that morph between states: b1 media, b2 title, b3 swatches. */
export const BLOCK_BOXES: Readonly<Record<Slot, Readonly<Record<1 | 2 | 3, Rect>>>> = {
  best_fit: { 1: [16, 44, 268, 212], 2: [16, 272, 232, 38], 3: [16, 329, 172, 10] },
  contrast: { 1: [16, 140, 268, 168], 2: [16, 48, 252, 76], 3: [16, 329, 172, 10] },
  explore: { 1: [16, 44, 128, 264], 2: [156, 64, 128, 82], 3: [156, 179, 128, 10] },
};

const FW = 300;
const FH = 552;

/** A miniature store page (300×552 frame units) in one direction's palette and grammar. Depiction only. */
export function MiniPage({ slot, t, rtl, flip = false, targets = false, label }: { slot: Slot; t: MarketingCopy; rtl: boolean; flip?: boolean; targets?: boolean; label?: string }) {
  const X = (x: number, w: number) => f(mxRect(x, w, FW, rtl));
  const P = (x: number) => f(mx(x, FW, rtl));
  const a = (s: "start" | "end" | "middle") => anchor(rtl, s);
  const box = (n: 1 | 2 | 3) => {
    const [x, y, w, h] = BLOCK_BOXES[slot][n];
    return flip ? { "data-b": n, "data-r": rectAttr(mxRect(x, w, FW, rtl), y, w, h) } : {};
  };
  const m = t.mock;
  const capsule = (cx: number, cy: number, s: number) => {
    const w = 56 * s;
    const h = 104 * s;
    return (
      <g>
        <ellipse cx={P(cx)} cy={f(cy + h / 2 + 4 * s)} rx={f(58 * s)} ry={f(8 * s)} className={L.fi} fillOpacity={0.08} />
        <rect x={X(cx - w / 2, w)} y={f(cy - h / 2)} width={f(w)} height={f(h)} rx={f(w / 2)} className={L.fi} fillOpacity={0.12} />
        <rect x={X(cx - w / 2 + 6 * s, 4 * s)} y={f(cy - h / 2 + 18 * s)} width={f(4 * s)} height={f(h * 0.5)} rx={f(2 * s)} className={L.fg} fillOpacity={0.75} />
      </g>
    );
  };
  const ticks = (x: number, y: number, w: number, h: number) => {
    const i = 10;
    const k = 8;
    const pts: [number, number, number, number][] = [
      [x + i, y + i, 1, 1],
      [x + w - i, y + i, -1, 1],
      [x + i, y + h - i, 1, -1],
      [x + w - i, y + h - i, -1, -1],
    ];
    return <path d={pts.map(([px, py, sx, sy]) => `M${P(px)} ${f(py + k * sy)}V${f(py)}H${P(px + k * sx)}`).join("")} className={L.cropTick} />;
  };
  const fields = (x0: number, y0: number, w: number) =>
    [m.name, m.phone, m.city].map((lab, k) => (
      <g key={lab}>
        <rect x={X(x0, w)} y={f(y0 + 40 * k)} width={f(w)} height={32} rx={10} className={L.fieldBox} />
        <text x={P(x0 + 12)} y={f(y0 + 40 * k + 20)} textAnchor={a("start")} fontSize={10} className={`${L.mt} ${L.fi}`} fillOpacity={0.6}>
          {lab}
        </text>
      </g>
    ));
  const swatches = (x0: number, y0: number, rule: number) => (
    <g {...box(3)}>
      <circle cx={P(x0 + 5)} cy={f(y0)} r={5} className={`${L.fg} ${L.swatchEdge}`} />
      <circle cx={P(x0 + 21)} cy={f(y0)} r={5} className={L.fa} />
      <circle cx={P(x0 + 37)} cy={f(y0)} r={5} className={L.fi} />
      <rect x={X(x0 + 52, rule)} y={f(y0 - 2)} width={rule} height={4} rx={2} className={L.fa} />
    </g>
  );
  const cta = (r: number) => (
    <g data-b={5}>
      <rect x={X(16, 268)} y={476} width={268} height={40} rx={r} className={L.fa} />
      <text x={P(150)} y={500.5} textAnchor="middle" fontSize={13} fontWeight={600} className={`${L.mt} ${L.fai}`}>
        {m.order}
      </text>
    </g>
  );
  const note = (
    <g data-b={6}>
      <path d={`M${P(150 - 64)} 532.5l2.6 2.6 5-5.6`} className={L.noteCheck} />
      <text x={P(150 + 6)} y={539} textAnchor="middle" fontSize={10} className={`${L.mt} ${L.fi}`} fillOpacity={0.6}>
        {m.note}
      </text>
    </g>
  );
  const pal = PALETTE[slot];
  let body: ReactNode;
  if (slot === "best_fit") {
    body = (
      <>
        <g {...box(1)} data-b={1}>
          <rect x={X(16, 268)} y={44} width={268} height={212} rx={14} className={L.fs} />
          {capsule(150, 142, 1)}
          {ticks(16, 44, 268, 212)}
        </g>
        <g {...box(2)} data-b={2}>
          <rect x={X(16, 232)} y={272} width={232} height={16} rx={4} className={L.fi} fillOpacity={0.88} />
          <rect x={X(16, 168)} y={296} width={168} height={14} rx={4} className={L.fi} fillOpacity={0.88} />
        </g>
        {swatches(16, 334, 120)}
        <g data-b={4}>{fields(16, 352, 268)}</g>
        {cta(20)}
        {note}
      </>
    );
  } else if (slot === "contrast") {
    body = (
      <>
        <g {...box(2)} data-b={2}>
          <rect x={X(16, 252)} y={48} width={252} height={20} rx={2} className={L.fi} />
          <rect x={X(16, 236)} y={76} width={236} height={20} rx={2} className={L.fi} />
          <rect x={X(16, 140)} y={104} width={140} height={20} rx={2} className={L.fi} />
        </g>
        <g {...box(1)} data-b={1}>
          <rect x={X(16, 268)} y={140} width={268} height={168} rx={4} className={L.fs} />
          <rect x={X(16, 268)} y={f(140 + 168 * 0.55)} width={268} height={f(168 * 0.45)} className={L.fa} fillOpacity={0.35} />
          {capsule(150, 220, 0.6)}
          {ticks(16, 140, 268, 168)}
        </g>
        {swatches(16, 334, 120)}
        <g data-b={4}>{fields(16, 352, 268)}</g>
        {cta(4)}
        {note}
      </>
    );
  } else {
    const ax = mxRect(16, 128, FW, rtl);
    body = (
      <>
        <g {...box(1)} data-b={1}>
          <path d={`M${f(ax)} 308V108A64 64 0 0 1 ${f(ax + 128)} 108V308Z`} className={L.fs} />
          {capsule(80, 214, 0.7)}
        </g>
        <g {...box(2)} data-b={2}>
          <rect x={X(156, 128)} y={64} width={128} height={18} rx={6} className={L.fi} />
          <rect x={X(156, 96)} y={90} width={96} height={18} rx={6} className={L.fi} />
          <rect x={X(156, 120)} y={128} width={120} height={6} rx={3} className={L.fi} fillOpacity={0.4} />
          <rect x={X(156, 104)} y={140} width={104} height={6} rx={3} className={L.fi} fillOpacity={0.4} />
        </g>
        {swatches(156, 184, 76)}
        <g data-b={4}>{fields(16, 352, 268)}</g>
        {cta(8)}
        {note}
      </>
    );
  }
  const tg = (r: Rect, inset = 3) => <rect x={f(mxRect(r[0], r[2], FW, rtl) - inset)} y={f(r[1] - inset)} width={f(r[2] + 2 * inset)} height={f(r[3] + 2 * inset)} rx={6} />;
  return (
    <g className={pal}>
      <rect width={FW} height={FH} rx={22} className={L.fg} />
      <path d={`M22 0.5H${FW - 22}`} className={L.frameHi} />
      <path d={`M0 28.5H${FW}`} className={L.si} strokeOpacity={0.08} />
      {label ? (
        <g className={L.inSlot}>
          <rect x={104} y={5} width={92} height={18} rx={9} className={L.sa} />
          <text x={150} y={17.5} textAnchor="middle" fontSize={10.5} fontWeight={500} className={`${L.mt} ${L.fa}`}>
            {label}
          </text>
        </g>
      ) : null}
      {body}
      {targets ? (
        <g data-tg="" className={L.target}>
          {tg([104, 5, 92, 18])}
          {tg([0, 0, FW, FH], -6)}
          {tg(BLOCK_BOXES[slot][1])}
          {tg(BLOCK_BOXES[slot][2])}
          {tg(BLOCK_BOXES[slot][3])}
          {tg([16, 476, 268, 40])}
          {tg([60, 526, 180, 16])}
        </g>
      ) : null}
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* gene glyphs (16×16)                                                 */
/* ------------------------------------------------------------------ */

function GeneGlyph({ gene, value, curve, slot }: { gene: BoldGeneId; value: string; curve: string; slot: Slot }) {
  switch (gene) {
    case "G1":
      return <use href="#sg-glyph" width={16} height={16} className={L.glyphUse} />;
    case "G2":
      if (value === "stage")
        return (
          <g className={L.gl}>
            <rect x={0.75} y={0.75} width={14.5} height={14.5} rx={2.5} />
            <rect x={5} y={4} width={6} height={8} rx={1.5} className={L.glFill} />
          </g>
        );
      if (value === "editorial-column")
        return (
          <g className={L.glFill}>
            <rect x={1} y={1.5} width={14} height={2} rx={0.6} />
            <rect x={1} y={5} width={11} height={2} rx={0.6} />
            <rect x={1} y={8.5} width={7} height={2} rx={0.6} />
            <rect x={1} y={12} width={14} height={3} rx={0.6} fillOpacity={0.5} />
          </g>
        );
      return (
        <g className={L.gl}>
          <rect x={0.75} y={0.75} width={6.5} height={14.5} rx={1.5} className={L.glFill} />
          <rect x={8.75} y={0.75} width={6.5} height={14.5} rx={1.5} />
        </g>
      );
    case "G18":
      if (value === "framed-stage")
        return (
          <g className={L.gl}>
            <rect x={3.25} y={1.75} width={9.5} height={10} rx={1.5} />
            <path d="M1 14.5h14" />
          </g>
        );
      if (value === "tonal-duotone")
        return (
          <g className={L.gl}>
            <rect x={0.75} y={0.75} width={14.5} height={14.5} rx={1.5} />
            <rect x={0.75} y={8} width={14.5} height={7.25} className={L.glFill} fillOpacity={0.55} stroke="none" />
          </g>
        );
      return (
        <g className={L.gl}>
          <rect x={0.75} y={0.75} width={14.5} height={14.5} rx={1.5} />
          <rect x={3.75} y={3.75} width={8.5} height={8.5} rx={1} />
        </g>
      );
    case "G4":
      return (
        <g className={L.glFill}>
          <rect x={1} y={2} width={14} height={3} rx={0.8} />
          <rect x={1} y={7.5} width={10} height={2.2} rx={0.8} />
          <rect x={1} y={12} width={6} height={1.6} rx={0.8} />
        </g>
      );
    case "G9":
      return (
        <g className={PALETTE[slot]}>
          <circle cx={3.5} cy={8} r={3} className={`${L.fg} ${L.dotEdge}`} />
          <circle cx={8} cy={8} r={3} className={`${L.fa} ${L.dotEdge}`} />
          <circle cx={12.5} cy={8} r={3} className={`${L.fi} ${L.dotEdge}`} />
        </g>
      );
    case "G23":
      return (
        <g transform="translate(-1 1)">
          <path d="M0 14H18" className={L.glAxis} />
          <path d={curve} className={L.glCurve} />
        </g>
      );
    case "G28":
      return (
        <g className={L.glFill}>
          <rect x={1} y={4.5} width={14} height={2.6} rx={1.3} />
          <rect x={1} y={9.5} width={9} height={2.6} rx={1.3} fillOpacity={0.6} />
        </g>
      );
  }
}

const STATEFUL: readonly BoldGeneId[] = ["G2", "G9", "G18", "G23"];
/** Which frame part each gene's trace and target point at (intro order k). */
const TRACE_K: Readonly<Record<BoldGeneId, number>> = { G2: 0, G18: 0, G4: 1, G9: 2, G23: 4, G28: 5, G1: 6 };

const CHECK = "M1.5 6.6l3.2 3.2L11 2.6";

/* ------------------------------------------------------------------ */
/* the wide variant (680×600)                                          */
/* ------------------------------------------------------------------ */

function Wide({ d, t, rtl }: { d: HomeData; t: MarketingCopy; rtl: boolean }) {
  const W = 680;
  const chipX = mxRect(6, 136, W, rtl);
  const frameX = mxRect(188, FW, W, rtl);
  const gateX = mxRect(512, 152, W, rtl);
  const gates = [t.home.gates.design, t.home.gates.budgets, t.home.gates.honesty];
  const a = (s: "start" | "end") => anchor(rtl, s);
  return (
    <svg viewBox={`0 0 ${W} 600`} className={`${L.svg} ${L.vWide}`} data-v="wide" aria-hidden="true" focusable="false">
      <defs>
        <clipPath id="loom-clip-w">
          <rect width={FW} height={FH} rx={22} />
        </clipPath>
      </defs>
      {/* traces: straight, never crossing, state-independent */}
      <g className={L.depthRail}>
        {d.rail.map((g, i) => {
          const y = 76 + 72 * i;
          const x0 = mx(142, W, rtl);
          const x1 = mx(185, W, rtl);
          return (
            <g key={g}>
              <path d={`M${f(x0)} ${y}H${f(x1)}`} className={L.trace} />
              <path d={`M${f(x0)} ${y}H${f(x1)}`} pathLength={1} data-tr={g} className={`${L.traceOn} ${L.inTrace}`} style={cv({ "--k": TRACE_K[g] })} />
              <rect x={f(mxRect(185, 3, W, rtl))} y={y - 5} width={3} height={10} rx={1} className={L.port} />
            </g>
          );
        })}
        {d.rail.map((g, i) => {
          const y = 52 + 72 * i;
          const gx = chipX + (rtl ? 136 - 112 - 16 : 112);
          return (
            <g key={g} className={L.inChip} style={cv({ "--i": i })}>
              <rect x={chipX} y={y} width={136} height={48} rx={10} className={L.chip} />
              <rect x={chipX + 0.5} y={y + 0.5} width={135} height={47} rx={9.5} data-hl={g} className={L.chipHl} />
              <text x={f(chipX + (rtl ? 126 : 10))} y={y + 19} textAnchor={a("start")} className={`${L.mono} ${L.tMute}`}>
                {g}
              </text>
              {STATEFUL.includes(g) ? null : (
                <g transform={`translate(${f(gx)} ${y + 7})`}>
                  <GeneGlyph gene={g} value={d.genes[g].best_fit} curve="" slot="best_fit" />
                </g>
              )}
            </g>
          );
        })}
        {d.slots.map((s) => (
          <g key={s} data-state={s} data-sl="rail" className={L.state}>
            {d.rail.map((g, i) => {
              const y = 52 + 72 * i;
              const gx = chipX + (rtl ? 136 - 112 - 16 : 112);
              return (
                <g key={g}>
                  <text x={f(chipX + (rtl ? 126 : 10))} y={y + 38} textAnchor={a("start")} data-g={g} className={`${L.mono} ${L.tSoft}`}>
                    {d.genes[g][s]}
                  </text>
                  {STATEFUL.includes(g) ? (
                    <g transform={`translate(${f(gx)} ${y + 7})`}>
                      <GeneGlyph gene={g} value={d.genes[g][s]} curve={d.curves[s]} slot={s} />
                    </g>
                  ) : null}
                </g>
              );
            })}
          </g>
        ))}
      </g>
      {/* the frame */}
      <g className={L.depthFrame}>
        <g transform={`translate(${f(frameX)} 24)`}>
          <g className={L.inFrame}>
            {d.slots.map((s) => (
              <g key={s} data-state={s} data-sl="frame" className={L.state}>
                <MiniPage slot={s} t={t} rtl={rtl} flip targets label={t.home.slots[s]} />
              </g>
            ))}
          </g>
          <g clipPath="url(#loom-clip-w)">
            <g data-scan="" className={L.scan}>
              <rect y={-28} width={FW} height={28} fill="url(#sg-scan)" />
              <path d={`M0 0.5H${FW}`} className={L.scanLine} />
            </g>
          </g>
        </g>
      </g>
      {/* gates */}
      <g className={L.depthGates}>
        {gates.map((label, k) => {
          const y = 196 + 56 * k;
          const lx0 = mx(488, W, rtl);
          const lx1 = mx(512, W, rtl);
          return (
            <g key={label}>
              <path d={`M${f(lx0)} ${y + 20}H${f(lx1)}`} className={L.trace} />
              <rect x={gateX} y={y} width={152} height={40} rx={10} className={L.gate} />
              <rect x={gateX + 0.5} y={y + 0.5} width={151} height={39} rx={9.5} data-gb={k} className={`${L.gateHl} ${L.inGateHl}`} style={cv({ "--k": k })} />
              <g transform={`translate(${f(gateX + (rtl ? 152 - 16 - 12 : 10))} ${y + 14})`}>
                <path d={CHECK} pathLength={1} data-gc={k} className={`${L.check} ${L.inGate}`} style={cv({ "--k": k })} />
              </g>
              <text x={f(gateX + (rtl ? 152 - 32 : 32))} y={y + 25} textAnchor={a("start")} className={`${L.lab} ${L.tSoft}`}>
                {label}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* the compact variant (360×600)                                       */
/* ------------------------------------------------------------------ */

function Compact({ d, t, rtl }: { d: HomeData; t: MarketingCopy; rtl: boolean }) {
  const W = 360;
  const S = 0.84;
  const fx = 54;
  const fy = 64;
  const gates = [t.home.gates.design, t.home.gates.budgets, t.home.gates.honesty];
  const a = (s: "start" | "end") => anchor(rtl, s);
  return (
    <svg viewBox={`0 0 ${W} 600`} className={`${L.svg} ${L.vCompact}`} data-v="compact" aria-hidden="true" focusable="false">
      <defs>
        <clipPath id="loom-clip-c">
          <rect width={FW} height={FH} rx={22} />
        </clipPath>
      </defs>
      {d.rail.map((g, i) => {
        const x = mxRect(8 + 50 * i, 44, W, rtl);
        const cx = x + 22;
        const port = mx(fx + FW * S * ((i + 0.5) / 7), W, rtl);
        const segs = orthoPath(cx === port ? [[cx, 40], [port, 64]] : [[cx, 40], [cx, 52], [port, 52], [port, 64]], 6);
        return (
          <g key={g}>
            <path d={toD(segs)} className={L.trace} />
            <path d={toD(segs)} pathLength={1} className={`${L.traceOn} ${L.inTrace}`} style={cv({ "--k": TRACE_K[g] })} />
            <g className={L.inChip} style={cv({ "--i": i })}>
              <rect x={x} y={8} width={44} height={32} rx={8} className={L.chip} />
              <text x={f(cx)} y={28} textAnchor="middle" className={`${L.mono} ${L.tSoft}`}>
                {g}
              </text>
            </g>
          </g>
        );
      })}
      <g transform={`translate(${f(rtl ? W - fx - FW * S : fx)} ${fy}) scale(${S})`}>
        <g className={L.inFrame}>
          {d.slots.map((s) => (
            <g key={s} data-state={s} data-sl="frame" className={L.state}>
              <MiniPage slot={s} t={t} rtl={rtl} flip label={t.home.slots[s]} />
            </g>
          ))}
        </g>
        <g clipPath="url(#loom-clip-c)">
          <g data-scan="" className={L.scan}>
            <rect y={-28} width={FW} height={28} fill="url(#sg-scan)" />
            <path d={`M0 0.5H${FW}`} className={L.scanLine} />
          </g>
        </g>
      </g>
      {gates.map((label, k) => {
        const x = mxRect(8 + 118 * k, 108, W, rtl);
        return (
          <g key={label}>
            <path d={`M${f(x + 54)} ${f(fy + FH * S)}V548`} className={L.trace} />
            <rect x={x} y={548} width={108} height={40} rx={10} className={L.gate} />
            <rect x={x + 0.5} y={548.5} width={107} height={39} rx={9.5} data-gb={k} className={`${L.gateHl} ${L.inGateHl}`} style={cv({ "--k": k })} />
            <g transform={`translate(${f(x + (rtl ? 108 - 10 - 12 : 10))} 562)`}>
              <path d={CHECK} pathLength={1} data-gc={k} className={`${L.check} ${L.inGate}`} style={cv({ "--k": k })} />
            </g>
            <text x={f(x + (rtl ? 108 - 28 : 28))} y={573} textAnchor={a("start")} className={`${L.lab} ${L.tSoft}`}>
              {label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function Loom({ d, t, rtl }: { d: HomeData; t: MarketingCopy; rtl: boolean }) {
  return (
    <div className={L.loom} data-model="loom" data-kind="loop">
      <div className={L.loomBox}>
        <div className={L.loomGlow} aria-hidden="true" />
        <div className={L.loomPlate} aria-hidden="true" />
        <Wide d={d} t={t} rtl={rtl} />
        <Compact d={d} t={t} rtl={rtl} />
      </div>
      <p className={L.srOnly}>{t.home.hero.caption}</p>
      <fieldset className={L.radios}>
        <legend className={L.srOnly}>{t.home.hero.legend}</legend>
        {d.slots.map((s) => (
          <label key={s} className={L.radio}>
            <input type="radio" name="loom-slot" value={s} defaultChecked={s === "best_fit"} className={L.radioInput} />
            <span>{t.home.slots[s]}</span>
          </label>
        ))}
      </fieldset>
    </div>
  );
}
