import type { MarketingCopy } from "../copy";
import { f, mx } from "./geom";
import { cv } from "./loom";
import L from "./living.module.css";

/*
 * STEPS: the rail (spec §6.9), and the FINAL band's figure (§6.10). The rail is one hairline with three rings holding
 * the route's own glyphs (photo, page, parcel); under each ring its numeral (rendered from the index, never stored in
 * the copy) and the existing step sentence. Not cards. A jade line draws along it once.
 */

const GLYPHS = ["sg-photo", "sg-page", "sg-parcel"] as const;

export function Rail({ t }: { t: MarketingCopy }) {
  return (
    <ol className={L.rail} data-model="rail" data-kind="once" data-dur="1500">
      {t.steps.map((step, i) => (
        <li key={step} className={L.railStep} style={cv({ "--i": i })}>
          <span className={L.railRing} aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <use href={`#${GLYPHS[i]}`} width={24} height={24} />
            </svg>
          </span>
          <span className={L.railNum}>{i + 1}</span>
          <p className={L.railText}>{step}</p>
        </li>
      ))}
    </ol>
  );
}

const CHECK = "M1.5 6.6l3.2 3.2L11 2.6";

/** The final band's figure: the best_fit frame (the hero's, static) with the three publish gates checked beside it. */
export function FinalArt({ t, rtl }: { t: MarketingCopy; rtl: boolean }) {
  const W = 420;
  const X = (x: number) => mx(x, W, rtl);
  const gates = [t.home.gates.design, t.home.gates.budgets, t.home.gates.honesty];
  const fx = rtl ? W - 220 : 20;
  return (
    <div className={L.finalArt}>
      <div className={L.finalGlow} aria-hidden="true" />
      <div className={L.finalPlate} aria-hidden="true" />
      <svg viewBox={`0 0 ${W} 400`} className={L.svg} aria-hidden="true" focusable="false">
        <use href="#sg-frame-best" x={fx} y={16} width={200} height={368} />
        {gates.map((label, k) => {
          const y = 150 + 52 * k;
          const gx = rtl ? X(244) - 156 : 244;
          return (
            <g key={label}>
              <path d={`M${f(X(220))} ${y + 18}H${f(X(244))}`} className={L.trace} />
              <rect x={f(gx)} y={y} width={156} height={36} rx={10} className={L.gate} />
              <rect x={f(gx + 0.5)} y={y + 0.5} width={155} height={35} rx={9.5} className={L.gateSet} />
              <g transform={`translate(${f(rtl ? gx + 156 - 14 - 12 : gx + 14)} ${y + 12})`}>
                <path d={CHECK} className={L.checkStatic} />
              </g>
              <text x={f(rtl ? gx + 156 - 34 : gx + 34)} y={y + 22.5} textAnchor={rtl ? "end" : "start"} className={`${L.lab} ${L.tSoft}`}>
                {label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
