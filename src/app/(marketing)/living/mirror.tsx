import { COPY, type MarketingCopy, type MarketingLocale } from "../copy";
import { f } from "./geom";
import { cv } from "./loom";
import L from "./living.module.css";

/*
 * LANGUAGES: the Mirror (spec §6.8). The same order page twice across a jade axis: on the left in the page's Latin
 * language (French on the French and Arabic pages, English on the English one), on the right in Arabic, laid out right
 * to left with every block mirrored; the other Latin language is a ghost behind the axis. Reflection lines join each
 * field to its twin. Fixed by design: this model is never mirrored by locale. Text inside the pages is depiction.
 * Below a 640 px container the pages stack (spec §6.8 compact), so a phone shows them at full size.
 */

const PW = 220;
const PH = 320;

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

/** One order page (PW×PH) with its top-left corner at (x, y): LTR, or laid out right to left with every block mirrored. */
function Page({ x, y, mock, rtl, travel, fieldOrigin }: { x: number; y: number; mock: Mock; rtl: boolean; travel: boolean; fieldOrigin?: Mock }) {
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
        <rect key={k} x={f(x - s.g / 2)} y={y + s.y} width={PW + s.g} height={PH} rx={16 + k * 2} className={L.shade} fillOpacity={s.a} />
      ))}
      <rect x={f(x + 0.5)} y={y + 0.5} width={PW - 1} height={PH - 1} rx={16} className={L.mpPage} />
      {BLOCKS.map((b, i) => (
        <rect key={i} x={f(bx(b))} y={y + b.y} width={b.w} height={b.h} rx={b.r} className={b.cls} {...flip(b)} />
      ))}
      <rect x={f(rtl ? x + 16 : x + 174)} y={y + 18} width={30} height={6} rx={3} className={L.mpInkSoft} {...flip({ x: 174, w: 30 })} />
      <g {...flip(cap)}>
        <ellipse cx={f(bx(cap) + cap.w / 2)} cy={y + 116} rx={26} ry={4} className={L.mpShadow} />
        <rect x={f(bx(cap))} y={y + 52} width={cap.w} height={62} rx={17} className={L.mpCapsule} />
      </g>
      {FIELDS.map((fy, k) => (
        <g key={k}>
          <rect x={f(x + 16)} y={y + fy} width={188} height={22} rx={7} className={L.mpField} />
          {fieldOrigin ? (
            <text x={f(x + 26)} y={y + fy + 14.5} textAnchor="start" className={`${L.mpText} ${L.mpLat} ${L.mpOut}`}>
              {[fieldOrigin.name, fieldOrigin.phone, fieldOrigin.city][k]}
            </text>
          ) : null}
          <text x={f(tx(26))} y={y + fy + 14.5} textAnchor={anchor} className={`${L.mpText} ${textCls} ${fieldOrigin ? L.mpIn : ""}`}>
            {[mock.name, mock.phone, mock.city][k]}
          </text>
        </g>
      ))}
      <rect x={f(tx(24) + (rtl ? 1 : -2))} y={y + FIELDS[0] + 4} width={1} height={14} className={L.caret} />
      <rect x={f(x + 16)} y={y + CTA_Y} width={188} height={26} rx={13} className={L.mpCta} />
      {fieldOrigin ? (
        <text x={f(x + PW / 2)} y={y + CTA_Y + 17} textAnchor="middle" className={`${L.mpText} ${L.mpCtaText} ${L.mpLat} ${L.mpOut}`}>
          {fieldOrigin.order}
        </text>
      ) : null}
      <text x={f(x + PW / 2)} y={y + CTA_Y + 17} textAnchor="middle" className={`${L.mpText} ${L.mpCtaText} ${textCls} ${fieldOrigin ? L.mpIn : ""}`}>
        {mock.order}
      </text>
      <text x={f(x + PW / 2)} y={y + 306} textAnchor="middle" className={`${L.mpNote} ${textCls}`}>
        {mock.note}
      </text>
    </g>
  );
}

/** The ghost: the other Latin language, a 176×240 page behind the axis. Blocks only: its labels would be cut by the pages. */
function Ghost({ x, y }: { x: number; y: number }) {
  return (
    <g className={L.ghost}>
      <rect x={x + 0.5} y={y + 0.5} width={175} height={239} rx={14} className={L.mpPage} />
      <rect x={x + 14} y={y + 16} width={148} height={64} rx={8} className={L.mpWell} />
      <rect x={x + 14} y={y + 92} width={112} height={7} rx={3} className={L.mpInk} />
      {[110, 134, 158].map((fy) => (
        <rect key={fy} x={x + 14} y={y + fy} width={148} height={18} rx={6} className={L.mpField} />
      ))}
      <rect x={x + 14} y={y + 188} width={148} height={22} rx={11} className={L.mpCta} />
    </g>
  );
}

function pagesOf(locale: MarketingLocale): { latin: MarketingLocale; ghost: MarketingLocale } {
  const latin: MarketingLocale = locale === "en" ? "en" : "fr";
  return { latin, ghost: latin === "en" ? "fr" : "en" };
}

/* wide (container 640 px and up): side by side across a vertical axis at x 480, the view box cropped to the pages */
function MirrorWide({ locale }: { locale: MarketingLocale }) {
  const { latin, ghost } = pagesOf(locale);
  const LEFT = 200;
  const RIGHT = 540;
  const PY = 30;
  return (
    <svg viewBox="186 18 588 344" className={`${L.svg} ${L.w640}`} data-v="wide" aria-hidden="true" focusable="false">
      <g lang={ghost}>
        <Ghost x={480 - 88} y={70} />
      </g>
      <path d="M480 20V360" pathLength={1} className={`${L.axis} ${L.drawn}`} />
      <g lang={latin}>
        <Page x={LEFT} y={PY} mock={COPY[latin].mock} rtl={false} travel={false} />
      </g>
      <g lang="ar" data-rtl-page="">
        <Page x={RIGHT} y={PY} mock={COPY.ar.mock} rtl travel fieldOrigin={COPY[latin].mock} />
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

/* compact (container under 640 px, spec §6.8): the pages stacked at full size, the axis horizontal across the seam,
   the reflection lines vertical, drawn outward from the axis to each page */
function MirrorCompact({ locale }: { locale: MarketingLocale }) {
  const { latin, ghost } = pagesOf(locale);
  const X = 70;
  const TOP = 20;
  const BOTTOM = 420;
  const AXIS = 380;
  const cols = [0, 1, 2, 3].map((k) => X + 16 + (188 * (k + 0.5)) / 4);
  return (
    <svg viewBox="0 0 360 760" className={`${L.svg} ${L.c640}`} data-v="compact" aria-hidden="true" focusable="false">
      <g lang={ghost}>
        <Ghost x={180 - 88} y={AXIS - 120} />
      </g>
      <path d={`M20 ${AXIS + 0.5}H340`} pathLength={1} className={`${L.axis} ${L.drawn}`} />
      <g lang={latin}>
        <Page x={X} y={TOP} mock={COPY[latin].mock} rtl={false} travel={false} />
      </g>
      <g lang="ar" data-rtl-page="">
        <Page x={X} y={BOTTOM} mock={COPY.ar.mock} rtl travel fieldOrigin={COPY[latin].mock} />
      </g>
      {cols.map((x, k) => (
        <g key={k} style={cv({ "--i": k })}>
          <path d={`M${f(x + 0.5)} ${AXIS}V${TOP + PH + 1}`} pathLength={1} className={`${L.reflect} ${L.drawn}`} />
          <path d={`M${f(x + 0.5)} ${AXIS + 1}V${BOTTOM - 1}`} pathLength={1} className={`${L.reflect} ${L.drawn}`} />
        </g>
      ))}
    </svg>
  );
}

export function Mirror({ locale, t }: { locale: MarketingLocale; t: MarketingCopy }) {
  return (
    <div className={L.mirror} data-model="mirror" data-kind="once" data-dur="2400">
      <MirrorWide locale={locale} />
      <MirrorCompact locale={locale} />
      <p className={L.srOnly}>{t.home.mirror.caption}</p>
    </div>
  );
}
