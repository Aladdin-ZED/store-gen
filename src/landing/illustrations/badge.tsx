/**
 * Badge — a clean circular badge with text running around it (crisp vector, no ink): the modern
 * "rotating text" seal for guarantees, COD promises and poster heroes.
 *
 * Two stacked SVGs in an HTML box: the text ring (rotates when `spin`, composited — cheap) and the
 * static core (the label stays upright). Every phrase gets its own arc, separated by a small glyph
 * (never an emoji). Latin is tracked out along its arc with textLength (a short phrase only so far,
 * then centred on its arc); Arabic is never letter-spaced, so it is sized from a conservative width
 * estimate. The ring text keeps a readable size on screen at the badge's smallest diameter
 * (`minPx`): a short phrase repeats onto more arcs only while it stays that large, a long one goes
 * round once, and a set of phrases too long for the ring keeps its first ones. Every phrase of a
 * ring shares one size. Size: --badge-size (default 8.5rem) or the `size` prop.
 *
 * Arabic phrases never go on the ring (RTL3, design.md DES-§3.4: Arabic is never set on a circle); they are dropped
 * and the core alone shows. Rings with `upright` are set like a printed seal: arcs over the top run
 * clockwise, arcs under the bottom counter-clockwise, so every phrase reads upright; such a ring sways
 * (±6°) instead of spinning, because upright text turned upside down is unreadable. Bidi: Latin and numeric strings are set
 * left-to-right in their own isolate ("−25%" stays "−25%" on RTL pages), and numbers inside Arabic
 * phrases keep their order ("24–48" never flips to "48–24").
 *
 * The class is lp-ringbadge (lp-badge belongs to the primitives' text badge).
 */
import type { ReactElement } from "react";
import { clamp, PathBuilder, polar, rnd, TAU } from "./core/geom";
import { cssLength, cx, delayAttr, estimateEm, hasArabic, illId, isolateNumbers, toneAttr, vars, type Tone } from "./core/svg";
import { glyph, type GlyphKind } from "./glyphs";

/** solid = filled disc (text knocked out) · outline = hairline ring · glass = frosted disc */
export type BadgeVariant = "solid" | "outline" | "glass";

export interface BadgeProps {
  /** unique per page (section id + key) — arc ids */
  uid: string;
  /** ring text: one phrase or 2–4 phrases (each gets its own arc) */
  text: string | readonly string[];
  /** big center text, e.g. "100%", "COD", "مضمون" */
  label?: string;
  /** small line under the label */
  sublabel?: string;
  /** center glyph ("none" to omit). Shown small above the label when both are set. */
  glyph?: GlyphKind | "none";
  /** separator glyph between phrases */
  sep?: GlyphKind;
  variant?: BadgeVariant;
  /** disc color (solid) or line/text color (outline; glass defaults to the glass ink, AA over any backdrop) */
  tone?: Tone;
  /** center glyph color for outline / glass (default accent) */
  tone2?: Tone;
  /** slow rotation of the text ring (motion-gated); an upright ring sways gently instead */
  spin?: boolean;
  /**
   * Seal layout: arcs under the bottom run counter-clockwise so every phrase reads upright (needs 2+
   * arcs; a lone phrase that fits half the ring is set twice). Default: on for Arabic rings, off for
   * Latin ones (the classic rotating badge).
   */
  upright?: boolean;
  /** data-reveal="stamp": the badge pops in with a spring when scrolled into view */
  reveal?: boolean;
  /** reveal delay in ms */
  delay?: number;
  /** width (number → px or CSS length); default --badge-size / 8.5rem */
  size?: number | string;
  /**
   * Smallest diameter the badge is shown at (CSS px; default 112 ≈ 7rem). Sets the ring text's
   * readable minimum: phrases repeat only while they stay that large, and a set of phrases too long
   * for the ring at that size keeps its first phrases (the ring is decorative; the copy lives in the
   * section). A big seal (≥ 160px) can pass its size to hold more text; a badge shown smaller than
   * 7rem (a phone hero at ~6rem) passes its size so the ring text grows within its band (up to 21 / 23.5
   * of 200 units) and still reads at ~9px there.
   */
  minPx?: number;
  className?: string;
}

const C = 100;
const R_TEXT = 80;
/** ring text ceiling (viewBox units of 200): Latin caps ≈ 9% of the diameter, Arabic (no caps, open forms) larger */
const MAX_FS = 18;
const MAX_FS_AR = 20.5;
/** hard band limit: a badge known to be small (minPx) may lift its ring text up to this to stay readable */
const HARD_FS = 21;
const HARD_FS_AR = 23.5;
/** absolute floor (a single phrase longer than the whole ring condenses its glyphs below it) */
const MIN_FS = 10;
/** readable minimum on screen (CSS px): tracked Latin caps, Arabic forms */
const READ_PX = 9;
const READ_PX_AR = 10.5;
/** a phrase repeats onto more arcs only while it stays readable on a badge this small (CSS px) */
const REPEAT_PX = 120;
/** a ring that reads from this diameter down needs no compact alternative */
const SWITCH_MIN = 104;
/** diameters (CSS px) the compact ring may switch at — mirrored by the @container rules in illustrations.css */
const SWITCH_STEPS = [112, 128, 144, 160, 176, 192, 208, 224, 256, 288, 320] as const;
/** a phrase is tracked out along its arc at most this many times its natural width (one phrase round the ring: further) */
const MAX_STRETCH = 1.45;
const MAX_STRETCH_ONE = 1.9;
/** tracked caps (letter-spacing 0.14em) are this much wider than estimateEm's untracked estimate (measured 1.13–1.17) */
const LATIN_TRACKED = 1.15;
/** Arabic ring width margin over estimateEm (which already runs 1.4–1.7× wide of the kit faces, measured) */
const AR_MARGIN = 1;
/** Arabic center-label margin (covers the widest kit display faces) */
const LABEL_AR_MARGIN = 1.3;
/** width available to the center label (~85% of the inner disc) */
const LABEL_W = 100;
/** angular gap around each separator */
const GAP = (13 * Math.PI) / 180;

/**
 * Arc from a0 to a1 (radians, y down, a0 < a1). Clockwise runs over the top of the ring with the
 * glyphs standing outward; `upright` draws it the other way round (a1 → a0, counter-clockwise), so
 * text under the bottom of the ring stands upright, tops toward the centre.
 */
function arcD(r: number, a0: number, a1: number, upright = false): string {
  const [from, to] = upright ? [a1, a0] : [a0, a1];
  const p0 = polar(C, C, r, from);
  const p1 = polar(C, C, r, to);
  return new PathBuilder({ p: 2 }).M(p0[0], p0[1]).A(r, r, a1 - a0 > Math.PI ? 1 : 0, upright ? 0 : 1, p1[0], p1[1]).toString();
}

/** Bidi for one SVG string: Latin / numeric strings isolated left-to-right; Arabic right-to-left with its numbers kept whole. */
function bidi(s: string): { text: string; direction: "ltr" | "rtl"; unicodeBidi: "isolate" } {
  const ar = hasArabic(s);
  return { text: ar ? isolateNumbers(s) : s, direction: ar ? "rtl" : "ltr", unicodeBidi: "isolate" };
}

/** width of a phrase in em, with its safety margin */
function emOf(s: string): number {
  const ar = hasArabic(s);
  return Math.max(1, estimateEm(s, !ar)) * (ar ? AR_MARGIN : 1.08);
}
const readPxOf = (s: string) => (hasArabic(s) ? READ_PX_AR : READ_PX);
/**
 * Ring text ceiling (viewBox units): the band's usual size, lifted on a badge known to be shown
 * smaller than ~7rem (`minPx`) so the phrase still reads at its readable size there — never past
 * the band's hard limit.
 */
const maxFsOf = (s: string, px = 0) => {
  const ar = hasArabic(s);
  const base = ar ? MAX_FS_AR : MAX_FS;
  return px ? clamp((readPxOf(s) * 200 * 1.02) / px, base, ar ? HARD_FS_AR : HARD_FS) : base;
};
const arcOf = (count: number) => R_TEXT * (TAU / count - GAP);
/** the size a phrase takes on one of `count` arcs (viewBox units) */
const fsOn = (s: string, count: number, px = 0) => clamp(arcOf(count) / emOf(s), MIN_FS, maxFsOf(s, px));

interface RingArc {
  id: string;
  d: string;
  s: string;
  len: number;
  ar: boolean;
  fs: number;
  sepAt: number;
}

interface RingLayout {
  arcs: RingArc[];
  upright: boolean;
  ruleR: number;
  /** the smallest badge diameter (CSS px) at which every phrase reads at its readable size */
  readsFrom: number;
}

/**
 * One ring of text: phrases → arcs. A short phrase repeats onto more arcs (fill the ring evenly)
 * only while it keeps a readable size on a ~7.5rem badge — a long phrase is never repeated small.
 * In a seal (upright, Arabic), a phrase that reads at half the ring takes both halves, so it reads
 * upright all round. Every phrase of the ring shares one size (one line of type).
 */
function ringLayout(phrases: readonly string[], seal: boolean, idBase: string, px = 0): RingLayout | null {
  let items = [...phrases];
  if (!items.length) return null;
  // a badge known to be shown smaller than the repeat reference repeats only what reads at that size
  const repeatPx = px ? Math.min(px, REPEAT_PX) : REPEAT_PX;
  const lift = px && px < REPEAT_PX ? px : 0;
  const fill = (list: readonly string[]) => Math.max(...list.map((s) => (emOf(s) * maxFsOf(s, lift)) / arcOf(list.length)));
  const keepsSize = (list: readonly string[], count: number) => list.every((s) => fsOn(s, count, lift) >= (readPxOf(s) * 200) / repeatPx);
  while (items.length <= 2 && fill(items) < 0.5 && keepsSize(items, items.length * 2)) items = [...items, ...items];
  if (seal && items.length === 1 && keepsSize(items, 2)) items = [items[0]!, items[0]!];
  const n = items.length;
  const upright = seal && n >= 2;
  const slice = TAU / n;
  // an upright ring with 4 arcs turns by half a slice: two arcs over the top, two under the bottom
  const top = -Math.PI / 2 - (upright && n === 4 ? slice / 2 : 0);
  const arcs: RingArc[] = items.map((s, i) => {
    const mid = top + i * slice;
    const a0 = mid - (slice - GAP) / 2;
    const a1 = mid + (slice - GAP) / 2;
    const flip = upright && Math.sin(mid) > 0.01;
    return { id: `${idBase}${i}`, d: arcD(R_TEXT, a0, a1, flip), s, len: R_TEXT * (a1 - a0), ar: hasArabic(s), fs: fsOn(s, n, lift), sepAt: mid + slice / 2 };
  });
  const fs = Math.min(...arcs.map((a) => a.fs));
  for (const a of arcs) a.fs = fs;
  // a phrase too long even at the floor is condensed: it reads only as large as it really fits
  const readsFrom = Math.max(...arcs.map((a) => (readPxOf(a.s) * 200) / Math.min(a.fs, a.len / emOf(a.s))));
  return { arcs, upright, ruleR: rnd(R_TEXT - Math.max(MIN_FS, fs) * 0.62 - 4), readsFrom: Math.round(readsFrom) };
}

export function Badge({
  uid,
  text,
  label,
  sublabel,
  glyph: centerGlyph = "spark",
  sep = "dot",
  variant = "solid",
  tone,
  tone2,
  spin = false,
  upright: uprightProp,
  reveal = false,
  delay,
  size,
  minPx,
  className,
}: BadgeProps): ReactElement {
  // glass: the glass ink (AA over any backdrop) unless a tone is asked for
  const t = tone ?? (variant === "solid" ? "accent" : variant === "glass" ? "current" : "ink");

  // phrases → arcs. The ring text keeps a readable size on screen: a short phrase repeats (filling
  // the ring evenly) only while it stays large enough, a long one goes round once instead of twice.
  // When all the phrases only read on a large badge, a compact ring (the first phrase alone, larger)
  // is drawn too and the badge switches between them by its own size (container query, CSS).
  // Arabic is never set on a circle (RTL3, design.md DES-§3.4): an Arabic phrase leaves the ring, the core still shows
  const phrases = (typeof text === "string" ? [text] : [...text]).map((s) => s.trim()).filter((s) => s && !hasArabic(s)).slice(0, 4);
  const seal = uprightProp ?? phrases.some(hasArabic);
  const px = minPx && Number.isFinite(minPx) && minPx > 24 ? minPx : 0;
  const rich = ringLayout(phrases, seal, illId(uid, "r"), px);
  const richAt = rich ? rich.readsFrom : 0;
  const compact = phrases.length > 1 && richAt > SWITCH_MIN && !(px && px >= richAt) ? ringLayout(phrases.slice(0, 1), seal, illId(uid, "c"), px) : null;
  const at = compact ? (SWITCH_STEPS.find((s) => s >= richAt) ?? SWITCH_STEPS[SWITCH_STEPS.length - 1]!) : undefined;

  const ringSvg = (l: RingLayout, fit?: "rich" | "compact") => {
    const turn = spin ? (l.upright ? "lp-idle-sway" : "lp-idle-spin") : undefined;
    return (
      <svg key={fit ?? "ring"} className={cx("lp-ringbadge__ring", turn)} data-fit={fit} viewBox="0 0 200 200" aria-hidden="true" focusable="false">
        <defs>
          {l.arcs.map((a) => (
            <path key={a.id} id={a.id} d={a.d} fill="none" />
          ))}
        </defs>
        {/* the inner rule keeps an even gap under this ring's text */}
        <circle className="lp-ringbadge__rule" cx={C} cy={C} r={l.ruleR} fill="none" stroke="currentColor" vectorEffect="non-scaling-stroke" />
        <g className="lp-ringbadge__ink">
          {l.arcs.length > 1
            ? l.arcs.map((a, i) => {
                const p = polar(C, C, R_TEXT, a.sepAt);
                return glyph(sep, p[0], p[1], 3.6, `sep${i}`);
              })
            : null}
          {l.arcs.map((a) => {
            const b = bidi(a.s);
            // when even the minimum size is too long, Latin glyphs condense too (spacing alone would overlap)
            const squeeze = !a.ar && Math.max(1, estimateEm(a.s)) * a.fs > a.len * 0.97;
            // a short phrase is tracked out along its arc only so far, then sits centred on it
            const natural = Math.max(1, estimateEm(a.s)) * LATIN_TRACKED * a.fs;
            const length = squeeze ? a.len * 0.97 : Math.min(a.len * 0.97, natural * (l.arcs.length > 1 ? MAX_STRETCH : MAX_STRETCH_ONE));
            return (
              <text
                key={`t${a.id}`}
                className="lp-ringbadge__t"
                fill="currentColor"
                fontSize={rnd(a.fs)}
                textAnchor="middle"
                dominantBaseline="central"
                direction={b.direction}
                unicodeBidi={b.unicodeBidi}
                textLength={a.ar ? undefined : rnd(length)}
                lengthAdjust={a.ar ? undefined : squeeze ? "spacingAndGlyphs" : "spacing"}
              >
                <textPath href={`#${a.id}`} startOffset="50%">
                  {b.text}
                </textPath>
              </text>
            );
          })}
        </g>
      </svg>
    );
  };
  const ring = rich ? (compact ? [ringSvg(rich, "rich"), ringSvg(compact, "compact")] : ringSvg(rich)) : null;

  // center: glyph and/or label
  const lbl = label?.trim() ?? "";
  const core: ReactElement[] = [];
  if (centerGlyph !== "none") {
    core.push(
      <g key="g" className="lp-ringbadge__glyph">
        {glyph(centerGlyph, C, lbl ? 66 : C, lbl ? 8 : 26, "g")}
      </g>,
    );
  }
  if (lbl) {
    const ar = hasArabic(lbl);
    const fs = clamp(LABEL_W / (Math.max(1, estimateEm(lbl, !ar)) * (ar ? LABEL_AR_MARGIN : 1)), 14, 46);
    const y = sublabel ? 97 : centerGlyph !== "none" ? 106 : 101;
    const b = bidi(lbl);
    core.push(
      <text
        key="l"
        className="lp-ringbadge__label"
        fill="currentColor"
        x={C}
        y={y}
        fontSize={Math.round(fs)}
        textAnchor="middle"
        dominantBaseline="central"
        direction={b.direction}
        unicodeBidi={b.unicodeBidi}
      >
        {b.text}
      </text>,
    );
    const sub = sublabel?.trim();
    if (sub) {
      const subAr = hasArabic(sub);
      const sfs = clamp((LABEL_W * 0.9) / (Math.max(1, estimateEm(sub, !subAr)) * (subAr ? LABEL_AR_MARGIN : 1)), 8, 12);
      const sb = bidi(sub);
      core.push(
        <text
          key="s"
          className="lp-ringbadge__sub"
          fill="currentColor"
          x={C}
          y={rnd(y + fs * 0.5 + 11)}
          fontSize={rnd(sfs)}
          textAnchor="middle"
          dominantBaseline="central"
          direction={sb.direction}
          unicodeBidi={sb.unicodeBidi}
        >
          {sb.text}
        </text>,
      );
    }
  }

  return (
    <span
      className={cx("lp-ill lp-ringbadge", variant === "glass" && "lp-glass", className)}
      data-tone={toneAttr(t)}
      data-tone2={toneAttr(tone2)}
      data-variant={variant}
      data-ring-at={at}
      data-reveal={reveal ? "stamp" : undefined}
      data-delay={delayAttr(reveal, delay)}
      style={vars({ "--badge-size": cssLength(size) })}
      aria-hidden="true"
    >
      {ring}
      <svg className="lp-ringbadge__core" viewBox="0 0 200 200" aria-hidden="true" focusable="false">
        {variant === "outline" ? <circle cx={C} cy={C} r={99} fill="none" stroke="currentColor" strokeOpacity={0.4} vectorEffect="non-scaling-stroke" /> : null}
        {core}
      </svg>
    </span>
  );
}
