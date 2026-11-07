import { COPY, type MarketingCopy, type MarketingLocale } from "../copy";
import { f } from "./geom";
import { cv } from "./loom";
import L from "./living.module.css";

/*
 * LANGUAGES: the Mirror (spec §6.8). The same order page twice across a jade axis: on the left in the page's Latin
 * language (French on the French and Arabic pages, English on the English one), on the right in Arabic, laid out right
 * to left with every block mirrored; the other Latin language is a ghost behind the axis. Reflection lines join each
 * field to its twin. Fixed by design: this model is never mirrored by locale. Text inside the pages is depiction.
 */

const PW = 220;
const PH = 320;
const PY = 30;
const LEFT = 200;
const RIGHT = 540;

type Mock = MarketingCopy["mock"];

interface Block {
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
  cls: string;
}

/** The page's blocks in LTR page units (0..PW). */
const BLOCKS: readonly Block[] = [
  { x: 16, y: 16, w: 10, h: 10, r: 5, cls: L.mpInk },
  { x: 32, y: 18, w: 52, h: 6, r: 3, cls: L.mpInkSoft },
  { x: 16, y: 38, w: 188, h: 92, r: 10, cls: L.mpWell },
  { x: 16, y: 142, w: 148, h: 9, r: 3, cls: L.mpInk },
  { x: 16, y: 157, w: 100, h: 6, r: 3, cls: L.mpInkSoft },
];

const FIELDS = [176, 204, 232];
const CTA_Y = 264;

function Page({ x, mock, rtl, travel, fieldOrigin }: { x: number; mock: Mock; rtl: boolean; travel: boolean; fieldOrigin?: Mock }) {
  const bx = (b: { x: number; w: number }) => (rtl ? x + PW - b.x - b.w : x + b.x);
  const dxOf = (b: { x: number; w: number }) => x + b.x - bx(b);
  const tx = (inset: number) => (rtl ? x + PW - inset : x + inset);
  const anchor = rtl ? "end" : "start";
  const textCls = rtl ? L.mpAr : L.mpLat;
  const flip = (b: { x: number; w: number }) => (travel ? { "data-flip": "", style: cv({ "--fx": `${f(dxOf(b))}px` }) } : {});
  // the capsule sits a third in from the inline start of the media block
  const cap = { x: 52, w: 34 };
  return (
    <g>
      {[
        { a: 0.06, y: 8, g: 4 },
        { a: 0.04, y: 16, g: 8 },
        { a: 0.03, y: 26, g: 12 },
      ].map((s, k) => (
        <rect key={k} x={f(x - s.g / 2)} y={PY + s.y} width={PW + s.g} height={PH} rx={16 + k * 2} className={L.shade} fillOpacity={s.a} />
      ))}
      <rect x={f(x + 0.5)} y={PY + 0.5} width={PW - 1} height={PH - 1} rx={16} className={L.mpPage} />
      {BLOCKS.map((b, i) => (
        <rect key={i} x={f(bx(b))} y={PY + b.y} width={b.w} height={b.h} rx={b.r} className={b.cls} {...flip(b)} />
      ))}
      <rect x={f(rtl ? x + 16 : x + 174)} y={PY + 18} width={30} height={6} rx={3} className={L.mpInkSoft} {...flip({ x: 174, w: 30 })} />
      <g {...flip(cap)}>
        <ellipse cx={f(bx(cap) + cap.w / 2)} cy={PY + 116} rx={26} ry={4} className={L.mpShadow} />
        <rect x={f(bx(cap))} y={PY + 52} width={cap.w} height={62} rx={17} className={L.mpCapsule} />
      </g>
      {FIELDS.map((fy, k) => (
        <g key={k}>
          <rect x={f(x + 16)} y={PY + fy} width={188} height={22} rx={7} className={L.mpField} />
          {fieldOrigin ? (
            <text x={f(x + 26)} y={PY + fy + 14.5} textAnchor="start" className={`${L.mpText} ${L.mpLat} ${L.mpOut}`}>
              {[fieldOrigin.name, fieldOrigin.phone, fieldOrigin.city][k]}
            </text>
          ) : null}
          <text x={f(tx(26))} y={PY + fy + 14.5} textAnchor={anchor} className={`${L.mpText} ${textCls} ${fieldOrigin ? L.mpIn : ""}`}>
            {[mock.name, mock.phone, mock.city][k]}
          </text>
        </g>
      ))}
      <rect x={f(tx(24) + (rtl ? 1 : -2))} y={PY + FIELDS[0] + 4} width={1} height={14} className={L.caret} />
      <rect x={f(x + 16)} y={PY + CTA_Y} width={188} height={26} rx={13} className={L.mpCta} />
      {fieldOrigin ? (
        <text x={f(x + PW / 2)} y={PY + CTA_Y + 17} textAnchor="middle" className={`${L.mpText} ${L.mpCtaText} ${L.mpLat} ${L.mpOut}`}>
          {fieldOrigin.order}
        </text>
      ) : null}
      <text x={f(x + PW / 2)} y={PY + CTA_Y + 17} textAnchor="middle" className={`${L.mpText} ${L.mpCtaText} ${textCls} ${fieldOrigin ? L.mpIn : ""}`}>
        {mock.order}
      </text>
      <text x={f(x + PW / 2)} y={PY + 306} textAnchor="middle" className={`${L.mpNote} ${textCls}`}>
        {mock.note}
      </text>
    </g>
  );
}

function MirrorSvg({ locale, cls, viewBox, v }: { locale: MarketingLocale; cls: string; viewBox: string; v: string }) {
  const latin: MarketingLocale = locale === "en" ? "en" : "fr";
  const ghost: MarketingLocale = latin === "en" ? "fr" : "en";
  const g = COPY[ghost].mock;
  const gx = 480 - 88;
  return (
    <svg viewBox={viewBox} className={`${L.svg} ${cls}`} data-v={v} aria-hidden="true" focusable="false">
      {/* the ghost: the other Latin language, behind the axis */}
      <g className={L.ghost} lang={ghost}>
        <rect x={gx + 0.5} y={70.5} width={175} height={239} rx={14} className={L.mpPage} />
        <rect x={gx + 14} y={86} width={148} height={64} rx={8} className={L.mpWell} />
        <rect x={gx + 14} y={162} width={112} height={7} rx={3} className={L.mpInk} />
        {[180, 204, 228].map((y, k) => (
          <g key={y}>
            <rect x={gx + 14} y={y} width={148} height={18} rx={6} className={L.mpField} />
            <text x={gx + 22} y={y + 12.5} className={`${L.mpText} ${L.mpLat}`}>
              {[g.name, g.phone, g.city][k]}
            </text>
          </g>
        ))}
        <rect x={gx + 14} y={258} width={148} height={22} rx={11} className={L.mpCta} />
      </g>
      <path d="M480 20V360" pathLength={1} className={`${L.axis} ${L.drawn}`} />
      <g lang={latin}>
        <Page x={LEFT} mock={COPY[latin].mock} rtl={false} travel={false} />
      </g>
      <g lang="ar" data-rtl-page="">
        <Page x={RIGHT} mock={COPY.ar.mock} rtl travel fieldOrigin={COPY[latin].mock} />
      </g>
      {/* reflection lines, drawn outward from the axis */}
      {[...FIELDS.map((y) => PY + y + 11), PY + CTA_Y + 13].map((y, k) => (
        <g key={y} style={cv({ "--i": k })}>
          <path d={`M480 ${f(y + 0.5)}H${LEFT + PW + 1}`} pathLength={1} className={`${L.reflect} ${L.drawn}`} />
          <path d={`M480 ${f(y + 0.5)}H${RIGHT - 1}`} pathLength={1} className={`${L.reflect} ${L.drawn}`} />
        </g>
      ))}
    </svg>
  );
}

export function Mirror({ locale, t }: { locale: MarketingLocale; t: MarketingCopy }) {
  return (
    <div className={L.mirror} data-model="mirror" data-kind="once" data-dur="2400">
      {/* one drawing at every width: the view box is cropped to the pages, so nothing is lost on a phone */}
      <MirrorSvg locale={locale} cls="" viewBox="186 18 588 344" v="wide" />
      <p className={L.srOnly}>{t.home.mirror.caption}</p>
    </div>
  );
}
