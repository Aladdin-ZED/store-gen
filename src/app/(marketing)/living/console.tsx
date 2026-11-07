import type { MarketingCopy } from "../copy";
import type { HomeData, StateKind } from "./data";
import { anchor, f, mx, mxRect, wrap } from "./geom";
import L from "./living.module.css";

/*
 * CONSOLE: one screen for every call (spec §6.5b). The agent's queue, the script with the current line, and the
 * outcome pad: ATTEMPT_OUTCOMES in order, each with its state mark (ok: a filled jade dot; waiting: a steel ring;
 * stopped: a hollow neutral ring with a strike, never red). No names, no numbers. SSR = the still frame (the card in
 * the script, line two current, Confirmed set); the runtime loops it (./controllers.ts) when it is the most visible.
 */

function Mark({ kind, cx, cy }: { kind: StateKind; cx: number; cy: number }) {
  if (kind === "ok") return <circle cx={f(cx)} cy={f(cy)} r={3} className={L.jsF} />;
  if (kind === "wait") return <circle cx={f(cx)} cy={f(cy)} r={2.75} className={L.moveRing} />;
  return <circle cx={f(cx)} cy={f(cy)} r={2.75} className={L.stopRing} />;
}

/** A queue row (w×h): a phone glyph and two neutral bars. */
function Row({ x, y, w, h, rtl, W }: { x: number; y: number; w: number; h: number; rtl: boolean; W: number }) {
  const X = (v: number) => f(mx(v, W, rtl));
  const R = (v: number, vw: number) => f(mxRect(v, vw, W, rtl));
  return (
    <g>
      <rect x={R(x, w)} y={y} width={w} height={h} rx={8} className={L.objRaised} />
      <use href="#sg-phone" x={X(rtl ? x + 10 + 12 : x + 10)} y={f(y + h / 2 - 6)} width={12} height={12} className={L.tileGlyph} />
      <rect x={R(x + 30, w * 0.42)} y={f(y + h / 2 - 5)} width={f(w * 0.42)} height={3} rx={1.5} className={L.objLine} />
      <rect x={R(x + 30, w * 0.26)} y={f(y + h / 2 + 2)} width={f(w * 0.26)} height={3} rx={1.5} className={L.objLine} fillOpacity={0.6} />
    </g>
  );
}

function Pad({ d, t, x0, y0, cw, ch, gap, rtl, W, size, max }: { d: HomeData; t: MarketingCopy; x0: number; y0: number; cw: number; ch: number; gap: number; rtl: boolean; W: number; size: number; max: number }) {
  const a = anchor(rtl, "start");
  return (
    <g>
      {d.outcomes.map((o, i) => {
        const col = i % 3;
        const row = Math.floor(i / 3);
        const x = mxRect(x0 + col * (cw + gap), cw, W, rtl);
        const y = y0 + row * (ch + gap);
        const lines = wrap(t.home.outcomes[o.id], max);
        const tx = rtl ? x + cw - 10 : x + 10;
        const ly = lines.length > 1 ? [y + ch / 2 - 1.5, y + ch / 2 + size + 0.5] : [y + ch / 2 + size * 0.36];
        const markX = rtl ? x + 11 : x + cw - 11;
        return (
          <g key={o.id} data-o={o.id} className={L.padChip}>
            <rect x={f(x)} y={y} width={cw} height={ch} rx={10} className={L.obj} />
            {o.id === "confirmed" || o.id === "callback" ? <rect x={f(x)} y={y} width={cw} height={ch} rx={10} data-fill={o.id} className={o.id === "confirmed" ? L.chipOk : L.chipWait} /> : null}
            <Mark kind={o.kind} cx={markX} cy={y + 11} />
            {lines.map((ln, k) => (
              <text key={k} x={f(tx)} y={f(ly[k])} textAnchor={a} fontSize={size} className={`${L.chipText} ${o.kind === "stop" ? L.tMute : L.tSoft}`}>
                {ln}
              </text>
            ))}
            {o.kind === "stop" ? <path d={ly.map((b) => `M${f(x + 8)} ${f(b - size * 0.32)}H${f(x + cw - 8)}`).join("")} className={L.strike} /> : null}
          </g>
        );
      })}
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* wide (720×316)                                                      */
/* ------------------------------------------------------------------ */

function Wide({ d, t, rtl }: { d: HomeData; t: MarketingCopy; rtl: boolean }) {
  const W = 720;
  const X = (v: number) => f(mx(v, W, rtl));
  const R = (v: number, w: number) => f(mxRect(v, w, W, rtl));
  const a = anchor(rtl, "start");
  const bars = [200, 168, 184, 120, 176, 140];
  // the card: SSR in the script's slot; the runtime flies it in from the first queue row (FLIP) and out
  const slot = { x: mxRect(200, 224, W, rtl), y: 48, w: 224, h: 28 };
  const q0 = { x: mxRect(16, 160, W, rtl), y: 56, w: 160, h: 36 };
  const cb = { x: mxRect(16, 160, W, rtl), y: 262, w: 160, h: 36 };
  const flip = (to: { x: number; y: number; w: number; h: number }) =>
    `translate(${f(to.x)}px, ${f(to.y)}px) scale(${f(to.w / slot.w)}, ${f(to.h / slot.h)}) translate(${f(-slot.x)}px, ${f(-slot.y)}px)`;
  const clock = { cx: mx(30, W, rtl), cy: 280 };
  return (
    <svg viewBox={`0 0 ${W} 316`} className={`${L.svg} ${L.w600}`} data-v="wide" aria-hidden="true" focusable="false">
      <rect x={0.5} y={0.5} width={W - 1} height={315} rx={20} className={L.panel} />
      <path d={`M1 40.5H${W - 1}`} className={L.panelLine} />
      <circle cx={X(22)} cy={20.5} r={3} className={L.jsF} />
      <text x={X(34)} y={25} textAnchor={a} className={`${L.lab} ${L.tSoft}`}>
        {t.home.roles.agent}
      </text>
      <path d={`M${X(184)} 41V315`} className={L.panelLine} />
      <path d={`M${X(440)} 41V315`} className={L.panelLine} />
      {/* queue */}
      <g data-queue="">
        {[0, 1, 2, 3].map((k) => (
          <g key={k} data-q={k}>
            <Row x={16} y={56 + 44 * k} w={160} h={36} rtl={rtl} W={W} />
          </g>
        ))}
      </g>
      <text x={X(18)} y={252} textAnchor={a} className={`${L.small} ${L.tMute}`}>
        {t.home.outcomes.callback}
      </text>
      <g>
        <rect x={R(16, 160)} y={262} width={160} height={36} rx={8} className={L.obj} />
        <circle cx={f(clock.cx)} cy={clock.cy} r={7} className={L.clockFace} />
        <path d={`M${f(clock.cx)} ${clock.cy}V${clock.cy - 4.5}`} data-hand={`${f(clock.cx)}px ${clock.cy}px`} className={L.clockHand} />
        <path d={`M${f(clock.cx)} ${clock.cy}H${f(clock.cx + (rtl ? -3.5 : 3.5))}`} className={L.clockHand} />
        <rect x={R(48, 64)} y={276} width={64} height={3} rx={1.5} className={L.objLine} />
        <rect x={R(48, 40)} y={283} width={40} height={3} rx={1.5} className={L.objLine} fillOpacity={0.6} />
      </g>
      {/* script */}
      <rect x={R(200, 224)} y={48} width={224} height={28} rx={8} className={L.slot} />
      <g data-hlline="">
        <rect x={R(196, 232)} y={118} width={232} height={22} rx={6} className={L.lineBand} />
        <rect x={R(196, 2)} y={120} width={2} height={18} rx={1} className={L.jsF} />
      </g>
      {bars.map((w, k) => (
        <rect key={k} x={R(208, w)} y={94 + 32 * k} width={w} height={6} rx={3} className={L.scriptBar} />
      ))}
      <g data-card="" data-from={flip(q0)} data-cb={flip(cb)} data-exit={`translateX(${rtl ? -24 : 24}px)`}>
        <rect x={f(slot.x)} y={slot.y} width={slot.w} height={slot.h} rx={8} className={L.cardIn} />
        <rect x={R(208, 2)} y={56} width={2} height={12} rx={1} className={L.jsF} />
        <use href="#sg-phone" x={X(rtl ? 216 + 12 : 216)} y={56} width={12} height={12} className={L.tileGlyph} />
        <rect x={R(236, 96)} y={58} width={96} height={3} rx={1.5} className={L.objLine} />
        <rect x={R(236, 60)} y={65} width={60} height={3} rx={1.5} className={L.objLine} fillOpacity={0.6} />
      </g>
      {/* outcome pad */}
      <Pad d={d} t={t} x0={448} y0={56} cw={80} ch={60} gap={8} rtl={rtl} W={W} size={12} max={11} />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* compact (360×516)                                                   */
/* ------------------------------------------------------------------ */

function Compact({ d, t, rtl }: { d: HomeData; t: MarketingCopy; rtl: boolean }) {
  const W = 360;
  const X = (v: number) => f(mx(v, W, rtl));
  const R = (v: number, w: number) => f(mxRect(v, w, W, rtl));
  const a = anchor(rtl, "start");
  const bars = [248, 200, 224, 160];
  return (
    <svg viewBox={`0 0 ${W} 516`} className={`${L.svg} ${L.c600}`} data-v="compact" aria-hidden="true" focusable="false">
      <rect x={0.5} y={0.5} width={W - 1} height={515} rx={18} className={L.panel} />
      <path d={`M1 40.5H${W - 1}`} className={L.panelLine} />
      <circle cx={X(22)} cy={20.5} r={3} className={L.jsF} />
      <text x={X(34)} y={25} textAnchor={a} className={`${L.lab} ${L.tSoft}`}>
        {t.home.roles.agent}
      </text>
      {[0, 1, 2].map((k) => (
        <Row key={k} x={16} y={54 + 42 * k} w={328} h={34} rtl={rtl} W={W} />
      ))}
      <path d={`M1 188.5H${W - 1}`} className={L.panelLine} />
      <rect x={R(16, 328)} y={202} width={328} height={28} rx={8} className={L.cardIn} />
      <rect x={R(24, 2)} y={210} width={2} height={12} rx={1} className={L.jsF} />
      <rect x={R(36, 120)} y={213} width={120} height={3} rx={1.5} className={L.objLine} />
      <rect x={R(12, 336)} y={240} width={336} height={22} rx={6} className={L.lineBand} />
      <rect x={R(12, 2)} y={242} width={2} height={18} rx={1} className={L.jsF} />
      {bars.map((w, k) => (
        <rect key={k} x={R(24, w)} y={248 + 26 * k} width={w} height={6} rx={3} className={L.scriptBar} />
      ))}
      <path d={`M1 352.5H${W - 1}`} className={L.panelLine} />
      <Pad d={d} t={t} x0={12} y0={364} cw={104} ch={40} gap={8} rtl={rtl} W={W} size={12} max={14} />
    </svg>
  );
}

export function Console({ d, t, rtl }: { d: HomeData; t: MarketingCopy; rtl: boolean }) {
  return (
    <div className={L.console} data-model="console" data-kind="loop">
      <Wide d={d} t={t} rtl={rtl} />
      <Compact d={d} t={t} rtl={rtl} />
      <p className={L.srOnly}>{t.home.console.caption}</p>
    </div>
  );
}
