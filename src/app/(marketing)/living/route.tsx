import type { ReactNode } from "react";
import type { MarketingCopy } from "../copy";
import type { HomeData } from "./data";
import { anchor, cubic, f, mirrorSegs, mx, mxRect, orthoPath, ptsAttr, samplePath, segLength, toD, type Pt, type Seg } from "./geom";
import L from "./living.module.css";

/*
 * ROUTE: from the first tap to the door (spec §6.5a). One smooth path through five stations: your page, the agents'
 * queue (new), the confirmation call (confirmed), delivery (in transit), the door and the tracking page (delivered).
 * Google Sheets, Telegram and Meta Conversions API (Lead) hear about the order at the page, WhatsApp at the call; the
 * trigger rail shows the three real PURCHASE_TRIGGERS with the confirmed one set. Every animation is authored on one
 * 0..1 progress: the runtime gives it a ViewTimeline (scroll-linked) when it can, else a 9 s loop. SSR = the final
 * frame (token at the door, the path drawn, every station lit).
 */

const TILE_H = 36;

interface Station {
  /** the station's object, drawn in the LTR frame (mirrored by the caller's helpers) */
  draw: (h: Helpers) => ReactNode;
  /** what lights up when the token arrives */
  on: (h: Helpers) => ReactNode;
}

interface Helpers {
  X: (x: number) => string;
  R: (x: number, w: number) => string;
  rtl: boolean;
  W: number;
}

function phone(h: Helpers, x: number, y: number, w: number, hh: number) {
  const pad = w * 0.125;
  const iw = w - 2 * pad;
  return (
    <g>
      <rect x={h.R(x, w)} y={y} width={w} height={hh} rx={w * 0.19} className={L.obj} />
      <rect x={h.R(x + pad, iw)} y={f(y + pad + 4)} width={f(iw)} height={f(hh * 0.3)} rx={5} className={L.objSoft} />
      {[0, 1, 2].map((k) => (
        <rect key={k} x={h.R(x + pad, iw)} y={f(y + pad + 10 + hh * 0.3 + k * hh * 0.105)} width={f(iw)} height={f(hh * 0.065)} rx={f(hh * 0.032)} className={L.objLine} />
      ))}
      <rect x={h.R(x + pad, iw)} y={f(y + hh - pad - hh * 0.09)} width={f(iw)} height={f(hh * 0.09)} rx={f(hh * 0.045)} className={L.jsF} />
    </g>
  );
}

/** A 20×20 tile glyph from the sprite, placed at its inline-start. */
const glyph = (id: string, x: number, y: number, s = 20) => <use href={`#${id}`} x={f(x)} y={f(y)} width={s} height={s} className={L.tileGlyph} />;

function Tile({ h, x, y, w, id, name, tag }: { h: Helpers; x: number; y: number; w: number; id: string; name: string; tag?: string }) {
  const rx = mxRect(x, w, h.W, h.rtl);
  const gx = h.rtl ? rx + w - 10 - 20 : rx + 10;
  const tx = h.rtl ? rx + w - 36 : rx + 36;
  return (
    <g>
      <rect x={f(rx)} y={y} width={w} height={TILE_H} rx={TILE_H / 2} className={L.tile} />
      {glyph(id, gx, y + 8)}
      <text x={f(tx)} y={y + 22.5} textAnchor={h.rtl ? "end" : "start"} direction="ltr" className={`${L.tileName} ${L.tSoft}`}>
        {name}
      </text>
      {tag ? (
        <g>
          <rect x={f(h.rtl ? rx + 8 : rx + w - 8 - 38)} y={y + 9} width={38} height={18} rx={9} className={L.tag} />
          <text x={f(h.rtl ? rx + 8 + 19 : rx + w - 8 - 19)} y={y + 21.5} textAnchor="middle" direction="ltr" className={`${L.mono10} ${L.tSoft}`}>
            {tag}
          </text>
        </g>
      ) : null}
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* the wide variant (1200×480)                                         */
/* ------------------------------------------------------------------ */

function Wide({ d, t, rtl }: { d: HomeData; t: MarketingCopy; rtl: boolean }) {
  const W = 1200;
  const h: Helpers = { X: (x) => f(mx(x, W, rtl)), R: (x, w) => f(mxRect(x, w, W, rtl)), rtl, W };
  const SX = [96, 348, 600, 852, 1080];
  const PY = 280;
  const knots: Pt[] = [
    [96, PY],
    [222, PY - 36],
    [348, PY],
    [474, PY + 36],
    [600, PY],
    [726, PY - 36],
    [852, PY],
    [966, PY + 36],
    [1080, PY],
  ];
  const segs = mirrorSegs(cubic(knots), W, rtl);
  const L0 = segLength(segs);
  const stops = [0, 2, 4, 6, 8].map((i) => (i === 0 ? 0 : segLength(segs.slice(0, i)) / L0));
  const pts = samplePath(segs, 48);
  const labels = [t.home.route.page, t.home.statuses.new, t.home.statuses.confirmed, t.home.statuses.in_transit, t.home.statuses.delivered];
  const stations: Station[] = [
    { draw: () => phone(h, 64, 136, 64, 116), on: () => null },
    {
      draw: () => (
        <g>
          <rect x={h.R(312, 96)} y={202} width={96} height={22} rx={6} className={L.objBack} />
          <rect x={h.R(306, 96)} y={213} width={96} height={22} rx={6} className={L.obj} />
          <rect x={h.R(300, 96)} y={224} width={96} height={22} rx={6} className={L.objRaised} />
          <rect x={h.R(306, 2)} y={230} width={2} height={10} rx={1} className={L.jsF} />
          <rect x={h.R(316, 44)} y={231.5} width={44} height={3} rx={1.5} className={L.objLine} />
          <rect x={h.R(316, 28)} y={237.5} width={28} height={3} rx={1.5} className={L.objLine} />
        </g>
      ),
      on: () => null,
    },
    {
      draw: () => (
        <g>
          <use href="#sg-headset" x={h.X(rtl ? 620 : 580)} y={166} width={40} height={40} className={L.tileGlyph} />
          <rect x={h.R(552, 96)} y={220} width={96} height={24} rx={12} className={L.obj} />
          <circle cx={h.X(566)} cy={232} r={3} className={L.moveRing} />
          <text x={h.X(576)} y={236} textAnchor={anchor(rtl, "start")} className={`${L.chipText} ${L.tMute}`}>
            {t.home.statuses.new}
          </text>
        </g>
      ),
      on: () => (
        <g>
          <rect x={h.R(552, 96)} y={220} width={96} height={24} rx={12} className={L.chipOk} />
          <circle cx={h.X(566)} cy={232} r={3} className={L.jsF} />
          <text x={h.X(576)} y={236} textAnchor={anchor(rtl, "start")} className={`${L.chipText} ${L.tInk}`}>
            {t.home.statuses.confirmed}
          </text>
        </g>
      ),
    },
    {
      draw: () => (
        <g>
          <path d={`M${h.X(818)} 240.5H${h.X(886)}`} className={L.road} />
          <path d={`M${h.X(828)} 248.5H${h.X(876)}`} className={L.roadDash} />
          <use href="#sg-parcel" x={h.X(rtl ? 874 : 830)} y={186} width={44} height={44} className={L.tileGlyph} />
        </g>
      ),
      on: () => null,
    },
    {
      draw: () => (
        <g>
          <rect x={h.R(1050, 40)} y={176} width={40} height={64} rx={4} className={L.obj} />
          <rect x={h.R(1056, 28)} y={184} width={28} height={22} rx={2} className={L.objLine} fillOpacity={0.6} />
          <circle cx={h.X(1082)} cy={212} r={2} className={L.objDot} />
          <path d={`M${h.X(1040)} 240.5H${h.X(1100)}`} className={L.road} />
          {phone(h, 1130, 168, 40, 72)}
          <path d={`M${h.X(1142)} 184V226`} className={L.objLineStroke} />
          {[0, 1, 2, 3].map((k) => (
            <circle key={k} cx={h.X(1142)} cy={184 + 14 * k} r={2.5} className={L.dotOff} />
          ))}
          <text x={h.X(1150)} y={262} textAnchor="middle" className={`${L.small} ${L.tMute}`}>
            {t.home.route.tracking}
          </text>
        </g>
      ),
      on: () => (
        <g>
          <circle cx={h.X(1070)} cy={168} r={9} className={L.checkDisc} />
          <use href="#sg-check" x={h.X(rtl ? 1077 : 1063)} y={161} width={14} height={14} className={L.checkInk} />
        </g>
      ),
    },
  ];
  // the tracking page's dots: one per status, lit at stations 2..5
  const dotOn = (k: number) => <circle cx={h.X(1142)} cy={184 + 14 * k} r={2.5} className={L.jsF} />;
  // integration tiles and their spurs (Latin names in every locale)
  const bus = (x: number): Seg[] => mirrorSegs(x === 96 ? [{ k: "L", a: [96, 136], b: [96, 92] }] : orthoPath([[96, 136], [96, 114], [x, 114], [x, 92]], 8), W, rtl);
  const spurs = [96, 240, 402].map(bus);
  const wa = mirrorSegs([{ k: "L", a: [600, 166], b: [600, 92] }], W, rtl);
  const railY = 404;
  // the Sheets glyph's inline-start (Tile: 10 from the pill's inline-start edge); its bottom row fills on arrival
  const sheetGx = rtl ? mxRect(32, 128, W, rtl) + 128 - 30 : 42;
  return (
    <svg viewBox={`0 0 ${W} 480`} className={`${L.svg} ${L.w720}`} data-v="wide" aria-hidden="true" focusable="false">
      {/* spurs (base, then the jade overlays lit with their station) */}
      {spurs.map((s, i) => (
        <path key={i} d={toD(s)} className={L.spur} />
      ))}
      <path d={toD(wa)} className={L.spur} />
      {/* the path */}
      <path d={toD(segs)} className={L.routeBase} />
      <path d={toD(segs)} strokeDasharray={`48 ${f(L0)}`} strokeDashoffset={f(48 - L0)} data-trail={f(L0)} className={L.trail} />
      <path d={toD(segs)} pathLength={1} data-travel="" className={L.routeOn} />
      {/* stations: stems, nodes, objects, labels */}
      {SX.map((x, i) => (
        <g key={i}>
          <path d={`M${h.X(x)} ${i === 3 ? 249 : 252}V272`} className={L.stem} />
          <circle cx={h.X(x)} cy={PY} r={5} className={L.node} />
          {stations[i].draw(h)}
          <text x={h.X(x)} y={336} textAnchor="middle" className={`${L.stationLab} ${L.tSoft}`}>
            {labels[i]}
          </text>
        </g>
      ))}
      {/* trigger rail: order, confirmed (set), delivered */}
      <path d={`M${h.X(96)} ${railY + 0.5}H${h.X(1080)}`} className={L.railLine} />
      {d.triggers.map((tr, k) => {
        const x = [96, 600, 1080][k];
        const set = tr === "confirmed";
        return (
          <g key={tr}>
            <circle cx={h.X(x)} cy={railY + 0.5} r={3.5} className={set ? L.notchSet : L.notchOpen} />
            {set ? (
              <g data-purchase="">
                <rect x={h.R(x - 36, 72)} y={railY + 14} width={72} height={20} rx={10} className={L.tag} />
                <text x={h.X(x)} y={railY + 27.5} textAnchor="middle" direction="ltr" className={`${L.mono10} ${L.tSoft}`}>
                  {d.events.purchase}
                </text>
              </g>
            ) : null}
          </g>
        );
      })}
      {/* tiles */}
      <Tile h={h} x={32} y={56} w={128} id="sg-sheet" name="Google Sheets" />
      <Tile h={h} x={180} y={56} w={120} id="sg-plane" name="Telegram" />
      <Tile h={h} x={322} y={56} w={160} id="sg-pulse" name="Meta CAPI" tag={d.events.lead} />
      <Tile h={h} x={536} y={56} w={128} id="sg-bubble" name="WhatsApp" />
      {/* what each arrival lights (station i); SSR = all lit */}
      {SX.map((x, i) => (
        <g key={i} data-on={i} className={L.on}>
          <circle cx={h.X(x)} cy={PY} r={5} className={L.nodeOn} />
          <text x={h.X(x)} y={336} textAnchor="middle" className={`${L.stationLab} ${L.tInk}`}>
            {labels[i]}
          </text>
          {stations[i].on(h)}
          {i === 0 ? (
            <g>
              {spurs.map((s, k) => (
                <path key={k} d={toD(s)} className={L.spurOn} />
              ))}
              <rect x={f(sheetGx + 3.5)} y={76.6} width={13} height={4.2} rx={0.6} className={L.sheetRow} />
            </g>
          ) : null}
          {i === 2 ? (
            <g>
              <path d={toD(wa)} className={L.spurOn} />
              <circle cx={h.X(600)} cy={railY + 0.5} r={3.5} className={L.notchSet} />
            </g>
          ) : null}
          {i >= 1 ? dotOn(i - 1) : null}
        </g>
      ))}
      {/* the order token (SSR: at the door) */}
      <g transform={`translate(${f(pts[pts.length - 1][0])} ${f(pts[pts.length - 1][1])})`}>
        <g data-token={ptsAttr(pts)} data-stops={stops.map((s) => f(s)).join(" ")} className={L.orderToken}>
          <rect x={-11} y={-7} width={22} height={14} rx={4} className={L.tokenBody} />
          <rect x={rtl ? 3 : -7} y={-3} width={4} height={6} rx={1} className={L.jsF} />
        </g>
      </g>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* the compact variant (360×940): the path runs down                   */
/* ------------------------------------------------------------------ */

function Compact({ d, t, rtl }: { d: HomeData; t: MarketingCopy; rtl: boolean }) {
  const W = 360;
  const h: Helpers = { X: (x) => f(mx(x, W, rtl)), R: (x, w) => f(mxRect(x, w, W, rtl)), rtl, W };
  const SY = [90, 270, 450, 630, 810];
  const PX = 64;
  const knots: Pt[] = [];
  SY.forEach((y, i) => {
    knots.push([PX, y]);
    if (i < SY.length - 1) knots.push([i % 2 ? PX + 18 : PX - 18, y + 90]);
  });
  const segs = mirrorSegs(cubic(knots), W, rtl);
  const L0 = segLength(segs);
  const stops = [0, 2, 4, 6, 8].map((i) => (i === 0 ? 0 : segLength(segs.slice(0, i)) / L0));
  const pts = samplePath(segs, 48);
  const labels = [t.home.route.page, t.home.statuses.new, t.home.statuses.confirmed, t.home.statuses.in_transit, t.home.statuses.delivered];
  const icons = ["sg-page", "sg-phone", "sg-headset", "sg-parcel", "sg-check"];
  const tiles = [
    { y: 128, id: "sg-sheet", name: "Google Sheets", from: 0 },
    { y: 172, id: "sg-plane", name: "Telegram", from: 0 },
    { y: 216, id: "sg-pulse", name: "Meta CAPI", from: 0, tag: d.events.lead },
    { y: 488, id: "sg-bubble", name: "WhatsApp", from: 2 },
  ];
  const spur = (tile: (typeof tiles)[number]): Seg[] => {
    const y0 = SY[tile.from] + 26;
    return mirrorSegs(orthoPath([[86, y0], [196, y0], [196, tile.y + TILE_H / 2], [204, tile.y + TILE_H / 2]], 8), W, rtl);
  };
  const a = anchor(rtl, "start");
  return (
    <svg viewBox={`0 0 ${W} 900`} className={`${L.svg} ${L.c720}`} data-v="compact" aria-hidden="true" focusable="false">
      {tiles.map((tl, i) => (
        <path key={i} d={toD(spur(tl))} className={L.spur} />
      ))}
      <path d={`M${h.X(18)} ${SY[0]}V${SY[4]}`} className={L.railLine} />
      <path d={toD(segs)} className={L.routeBase} />
      <path d={toD(segs)} strokeDasharray={`48 ${f(L0)}`} strokeDashoffset={f(48 - L0)} data-trail={f(L0)} className={L.trail} />
      <path d={toD(segs)} pathLength={1} data-travel="" className={L.routeOn} />
      {SY.map((y, i) => (
        <g key={i}>
          <rect x={h.R(PX - 22, 44)} y={y - 22} width={44} height={44} rx={12} className={L.obj} />
          <use href={`#${icons[i]}`} x={h.X(rtl ? PX + 12 : PX - 12)} y={y - 12} width={24} height={24} className={L.tileGlyph} />
          <text x={h.X(100)} y={y + 5} textAnchor={a} className={`${L.stationLab} ${L.tSoft}`}>
            {labels[i]}
          </text>
        </g>
      ))}
      {d.triggers.map((tr, k) => {
        const y = SY[[0, 2, 4][k]];
        const set = tr === "confirmed";
        return (
          <g key={tr}>
            <circle cx={h.X(18)} cy={y} r={3.5} className={set ? L.notchSet : L.notchOpen} />
            {set ? (
              <g>
                <rect x={h.R(100, 72)} y={y + 34} width={72} height={20} rx={10} className={L.tag} />
                <text x={h.X(136)} y={y + 47.5} textAnchor="middle" direction="ltr" className={`${L.mono10} ${L.tSoft}`}>
                  {d.events.purchase}
                </text>
              </g>
            ) : null}
          </g>
        );
      })}
      {tiles.map((tl) => (
        <Tile key={tl.id} h={h} x={204} y={tl.y} w={148} id={tl.id} name={tl.name} tag={tl.tag} />
      ))}
      {SY.map((y, i) => (
        <g key={i} data-on={i} className={L.on}>
          <rect x={h.R(PX - 22, 44)} y={y - 22} width={44} height={44} rx={12} className={L.objLit} />
          <text x={h.X(100)} y={y + 5} textAnchor={a} className={`${L.stationLab} ${L.tInk}`}>
            {labels[i]}
          </text>
          {tiles
            .filter((tl) => tl.from === i)
            .map((tl) => (
              <path key={tl.id} d={toD(spur(tl))} className={L.spurOn} />
            ))}
        </g>
      ))}
      <g transform={`translate(${f(pts[pts.length - 1][0])} ${f(pts[pts.length - 1][1])})`}>
        <g data-token={ptsAttr(pts)} data-stops={stops.map((s) => f(s)).join(" ")} className={L.orderToken}>
          <rect x={-7} y={-11} width={14} height={22} rx={4} className={L.tokenBody} />
          <rect x={-3} y={-7} width={6} height={4} rx={1} className={L.jsF} />
        </g>
      </g>
    </svg>
  );
}

export function Route({ d, t, rtl }: { d: HomeData; t: MarketingCopy; rtl: boolean }) {
  return (
    <div className={L.route} data-model="route" data-kind="loop">
      <Wide d={d} t={t} rtl={rtl} />
      <Compact d={d} t={t} rtl={rtl} />
      <p className={L.srOnly}>{t.home.route.caption}</p>
    </div>
  );
}
