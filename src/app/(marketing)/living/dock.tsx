import type { MarketingCopy } from "../copy";
import type { HomeData } from "./data";
import { f, mx, ptsAttr, samplePath, toD, type Pt, type Seg } from "./geom";
import { cv } from "./loom";
import L from "./living.module.css";

/*
 * INTEGRATIONS: the Dock (spec §6.7). A 2.5D drawing in plain SVG (no CSS 3D, no glow, no spin): a floor plate, an
 * orbit ring with projected ticks, the platform as three extruded plates carrying the wordmark glyph, and four threads
 * to Google Sheets, Meta Conversions API, Telegram and WhatsApp. The Lead and Purchase tags sit on the Meta thread
 * (the real event names, PIXEL_EVENTS.meta). Anchor sides mirror in Arabic like the rest of the page.
 */

const TILE_W = 168;
const TILE_H = 40;

interface Geo {
  W: number;
  H: number;
  cx: number;
  ringY: number;
  floorY: number;
  s: number;
  tiles: boolean;
}

const WIDE: Geo = { W: 560, H: 440, cx: 280, ringY: 250, floorY: 334, s: 1, tiles: true };
const COMPACT: Geo = { W: 360, H: 290, cx: 180, ringY: 150, floorY: 208, s: 0.7, tiles: false };

const ANCHORS = [
  { id: "sheets", deg: 205, glyph: "sg-sheet", name: "Google Sheets" },
  { id: "meta", deg: 335, glyph: "sg-pulse", name: "Meta CAPI" },
  { id: "telegram", deg: 25, glyph: "sg-plane", name: "Telegram" },
  { id: "whatsapp", deg: 155, glyph: "sg-bubble", name: "WhatsApp" },
] as const;

function quadAt(a: Pt, c: Pt, b: Pt, t: number): Pt {
  const u = 1 - t;
  return [u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]];
}

function DockSvg({ g, d, rtl, cls }: { g: Geo; d: HomeData; rtl: boolean; cls: string }) {
  const { W, cx, s } = g;
  const X = (x: number) => mx(x, W, rtl);
  const rx = 200 * s;
  const ry = 70 * s;
  const ringY = g.ringY;
  // 72 projected ticks every 5°, cardinal ones longer, as one path
  let ticks = "";
  for (let i = 0; i < 72; i++) {
    const a = (i * 5 * Math.PI) / 180;
    const len = (i % 18 === 0 ? 7 : 3.5) * s;
    const k0 = 1;
    const k1 = 1 + len / rx;
    ticks += `M${f(cx + rx * k0 * Math.cos(a))} ${f(ringY + ry * k0 * Math.sin(a))}L${f(cx + rx * k1 * Math.cos(a))} ${f(ringY + ry * k1 * Math.sin(a))}`;
  }
  const hw = 62 * s;
  const hh = 22 * s;
  const th = 7 * s;
  const plateY = [ringY, ringY - 16 * s, ringY - 32 * s];
  const top: Pt = [cx, plateY[2]];
  const anchors = ANCHORS.map((an) => {
    const a = (an.deg * Math.PI) / 180;
    return { ...an, p: [X(cx + rx * Math.cos(a)), ringY + ry * Math.sin(a)] as Pt };
  });
  const threads = anchors.map((an) => {
    const c: Pt = [(top[0] + an.p[0]) / 2, Math.min(top[1], an.p[1]) - 40 * s];
    const segs: Seg[] = [{ k: "Q", a: top, c, b: an.p }];
    return { an, c, segs, pts: samplePath(segs, 24) };
  });
  const meta = threads[1];
  const tagAt = (t: number) => quadAt(top, meta.c, meta.an.p, t);
  const lead = tagAt(0.32);
  const purchase = tagAt(0.7);
  const rhombus = (y: number) => `M${f(cx - hw)} ${f(y)}L${f(cx)} ${f(y - hh)}L${f(cx + hw)} ${f(y)}L${f(cx)} ${f(y + hh)}Z`;
  const side = (y: number) => `M${f(cx - hw)} ${f(y)}L${f(cx)} ${f(y + hh)}L${f(cx + hw)} ${f(y)}V${f(y + th)}L${f(cx)} ${f(y + hh + th)}L${f(cx - hw)} ${f(y + th)}Z`;
  // the glyph lies flat on the top plate: rotated 45° then squashed to the plate's ratio
  const flat = `translate(${f(cx)} ${f(plateY[2])}) scale(1 ${f(hh / hw)}) rotate(45) scale(${f(2.1 * s)}) translate(-8 -8)`;
  return (
    <svg viewBox={`0 0 ${W} ${g.H}`} className={`${L.svg} ${cls}`} data-v={g.tiles ? "wide" : "compact"} aria-hidden="true" focusable="false">
      {/* floor */}
      <g className={L.dkFloor}>
        {[230, 170, 110].map((r, i) => (
          <ellipse key={r} cx={cx} cy={g.floorY} rx={f(r * s)} ry={f(0.3 * r * s)} className={L.floorRing} strokeOpacity={[1, 0.75, 0.5][i]} />
        ))}
        <ellipse cx={cx} cy={g.floorY} rx={f(60 * s)} ry={f(10 * s)} className={L.contact} />
        <path d={`M${cx} ${f(ringY + hh + th)}V${f(g.floorY)}`} className={L.beam} />
      </g>
      {/* the orbit ring */}
      <ellipse cx={cx} cy={ringY} rx={f(rx)} ry={f(ry)} pathLength={1} className={`${L.orbit} ${L.drawn}`} />
      <path d={ticks} className={L.orbitTicks} />
      {/* threads (under the core: they emerge from the top plate's edge) */}
      {threads.map((th0, i) => (
        <g key={th0.an.id} style={cv({ "--i": i })}>
          <path d={toD(th0.segs)} className={L.thread} />
          <path d={toD(th0.segs)} pathLength={1} className={`${L.threadOn} ${L.drawn}`} />
        </g>
      ))}
      {/* the core: three extruded plates, bottom to top */}
      {[0, 1, 2].map((k) => (
        <g key={k} className={L.plate} style={cv({ "--i": k })}>
          <path d={side(plateY[k])} className={[L.sideBase, L.sideMid, L.sideTop][k]} />
          <path d={rhombus(plateY[k])} className={[L.plateBase, L.plateMid, L.plateTop][k]} />
          {k === 2 ? (
            <>
              <path d={`M${f(cx - hw)} ${f(plateY[k])}L${f(cx)} ${f(plateY[k] - hh)}L${f(cx + hw)} ${f(plateY[k])}`} className={L.plateHi} />
              <g transform={flat}>
                <use href="#sg-glyph" width={16} height={16} className={L.plateGlyph} />
              </g>
            </>
          ) : null}
        </g>
      ))}
      {/* anchors and packets */}
      {threads.map((th0, i) => (
        <g key={th0.an.id}>
          <circle cx={f(th0.an.p[0])} cy={f(th0.an.p[1])} r={f(2.5 * Math.max(s, 0.85))} className={L.jdF} />
          <circle cx={0} cy={0} r={3} data-pkt={ptsAttr(th0.pts)} style={cv({ "--i": i })} className={L.packet} />
        </g>
      ))}
      {/* the Meta events, on the Meta thread */}
      {g.tiles ? (
        <g className={L.dkTags}>
          {[
            { p: lead, label: d.events.lead, w: 38 },
            { p: purchase, label: d.events.purchase, w: 64 },
          ].map((tg, i) => (
            <g key={tg.label} style={cv({ "--i": i })} className={L.dkTag}>
              <rect x={f(tg.p[0] - tg.w / 2)} y={f(tg.p[1] - 9)} width={tg.w} height={18} rx={9} className={L.tagLight} />
              <text x={f(tg.p[0])} y={f(tg.p[1] + 3.5)} textAnchor="middle" direction="ltr" className={`${L.mono10} ${L.kmF}`}>
                {tg.label}
              </text>
            </g>
          ))}
        </g>
      ) : null}
      {/* tiles: upright pills, back ones above their anchor, front ones below */}
      {g.tiles
        ? threads.map(({ an }) => {
            const back = an.p[1] < ringY;
            const ty = back ? an.p[1] - 50 - TILE_H : an.p[1] + 20;
            const tx = an.p[0] - TILE_W / 2;
            const x0 = Math.max(4, Math.min(W - 4 - TILE_W, tx));
            const gx = rtl ? x0 + TILE_W - 14 - 16 : x0 + 14;
            const nx = rtl ? x0 + TILE_W - 38 : x0 + 38;
            return (
              <g key={an.id}>
                <path d={`M${f(an.p[0])} ${f(back ? an.p[1] - 4 : an.p[1] + 4)}V${f(back ? ty + TILE_H : ty)}`} className={L.leaderLight} />
                <rect x={f(x0)} y={f(ty)} width={TILE_W} height={TILE_H} rx={20} className={L.dkTile} />
                <rect x={f(x0 + 0.5)} y={f(ty + 0.5)} width={TILE_W - 1} height={TILE_H - 1} rx={19.5} data-tile={an.id} className={L.dkTileHl} />
                <use href={`#${an.glyph}`} x={f(gx)} y={f(ty + 12)} width={16} height={16} className={L.dkGlyph} />
                <text x={f(nx)} y={f(ty + 24.5)} textAnchor={rtl ? "end" : "start"} direction="ltr" className={`${L.tileName13} ${L.kF}`}>
                  {an.name}
                </text>
              </g>
            );
          })
        : null}
    </svg>
  );
}

export function Dock({ d, t, rtl }: { d: HomeData; t: MarketingCopy; rtl: boolean }) {
  return (
    <div className={L.dock} data-model="dock" data-kind="once" data-dur="2800">
      <DockSvg g={WIDE} d={d} rtl={rtl} cls={L.w560} />
      <DockSvg g={COMPACT} d={d} rtl={rtl} cls={L.c560} />
      <ul className={L.dockList} aria-hidden="true">
        {ANCHORS.map((an) => (
          <li key={an.id} className={L.dockItem}>
            <svg viewBox="0 0 24 24" className={L.dockItemGlyph} aria-hidden="true" focusable="false">
              <use href={`#${an.glyph}`} width={24} height={24} />
            </svg>
            <bdi dir="ltr">{an.name}</bdi>
          </li>
        ))}
      </ul>
      <p className={L.srOnly}>{t.home.dock.caption}</p>
    </div>
  );
}
