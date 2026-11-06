/**
 * Giant wordmark — the store name set edge to edge across the bottom of the big footer.
 *
 * CSS cannot fit a word to its container, so the word is SVG text: its advance is estimated from
 * the display font's real metrics (theme font manifest), the viewBox is sized to that estimate and
 * `textLength` + `lengthAdjust="spacingAndGlyphs"` absorbs the remaining error — the word always
 * spans the full width exactly, at any width, in any font, without measuring in the browser.
 * The estimate keeps that correction within a few percent, so the letterforms never look stretched.
 *
 * Long names stack on two lines (phones from 10 characters, every width beyond 20); both lines share
 * one size, each fitted to its own estimate. The word is never clipped (design.md DES-§4.5.4 footer:big, S24): the
 * plate keeps room under the last baseline for descenders (Arabic letters dip deepest), and the letters are one
 * solid ink (no gradient text, S01; no fade into the edge).
 */
import type { ReactElement } from "react";
import { cssVars } from "../../primitives";
import type { RenderContext } from "../../types";
import { fontData, nearestWeight } from "@/lib/theme/fonts";
import { ARCHETYPE_DEFS, findPairing } from "@/lib/theme/archetypes";
import type { Archetype } from "@/lib/page/schema";

const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
const UPPER = /\p{Lu}/u;
const LOWER = /\p{Ll}/u;
const DIGIT = /\p{Nd}/u;
const ACCENTED_CAP = /[À-ÖØ-ÞĀ-ſ]/;

/** Relative advances (× the font's average lowercase advance) for the glyphs that stray far from it. */
const NARROW_LOWER = new Set([..."iljtfr"]);
const WIDE_LOWER = new Set([..."mw"]);
const NARROW_UPPER = new Set([..."IJ"]);
const WIDE_UPPER = new Set([..."MWŒÆ"]);

/** Arabic letters that never join forward (alef, dal, ra, waw…): about half the advance of the others. */
const ARABIC_NARROW = new Set([..."اأإآدذرزوؤءة"]);

/**
 * Measured correction of the metric estimate per display font: [Latin mixed case, Latin all caps, Arabic] —
 * real advance over estimate, from qa/footer/calibrate.ts (Chromium, every pairing weight).
 * Unlisted fonts: 1.1 / 1.08 / 1.
 */
const WIDTH_FIX: Readonly<Record<string, readonly [number, number, number]>> = {
  "bodoni-moda": [1.12, 1.1, 1],
  "instrument-serif": [1.1, 1.08, 1],
  gloock: [1.12, 1.11, 1],
  fraunces: [0.87, 0.92, 1],
  "young-serif": [1.16, 1.17, 1],
  "bricolage-grotesque": [1.03, 0.96, 1],
  "big-shoulders-display": [1.48, 1.32, 1],
  archivo: [1.14, 1.12, 1],
  "schibsted-grotesk": [1.12, 1.09, 1],
  "hanken-grotesk": [1.08, 1.05, 1],
  "instrument-sans": [1.11, 1.09, 1],
  "el-messiri": [1.1, 1.1, 0.91],
  "reem-kufi": [1.17, 1.2, 0.84],
  "readex-pro": [1.11, 1.1, 1.04],
  alexandria: [1.08, 1.06, 1.04],
  "baloo-bhaijaan-2": [1.08, 1.01, 0.91],
  marhey: [1.19, 1.2, 0.91],
  lemonada: [1.06, 0.95, 1.31],
  changa: [1.04, 0.95, 0.95],
  "noto-kufi-arabic": [1.08, 1.01, 1.08],
  "ibm-plex-sans-arabic": [1.09, 1.06, 0.85],
};

/** Wordmark voice per archetype (Latin names only — Arabic is never cased or letter-spaced). */
const VOICE: Partial<Record<Archetype, { caps: boolean; track: number }>> = {
  maison: { caps: true, track: 0.04 },
  kinetic: { caps: true, track: 0 },
  garage: { caps: true, track: 0.01 },
  editorial: { caps: false, track: -0.055 },
  circuit: { caps: false, track: -0.05 },
  playground: { caps: false, track: -0.045 },
};
const DEFAULT_VOICE = { caps: false, track: -0.035 };

export interface Face {
  /** average lowercase advance, em */
  xw: number;
  /** cap height, em */
  cap: number;
  /** ascent, em */
  asc: number;
  /** width growth of the display weight over the font's default instance */
  bold: number;
  /** measured correction [Latin mixed case, Latin all caps, Arabic] */
  fix: readonly [number, number, number];
}

/** Metrics of a display font at a weight (unknown fonts get neutral grotesk proportions). */
export function faceFor(id: string, weight: number): Face {
  const m = fontData(id)?.metrics;
  const bold = 1 + Math.max(-0.1, (weight - 400) * 0.00024);
  const fix = WIDTH_FIX[id] ?? [1.1, 1.08, 1];
  if (!m || m.unitsPerEm <= 0)
    return { xw: 0.52, cap: 0.7, asc: 0.95, bold, fix };
  const u = m.unitsPerEm;
  return {
    xw: m.xWidthAvg / u,
    cap: m.capHeight / u || 0.7,
    asc: Math.min(1.1, m.ascent / u),
    bold,
    fix,
  };
}

/**
 * The page's display font and weight, resolved like the theme engine does: the archetype's pairing
 * for the chosen fonts, its display weight snapped to a weight the font ships. Arabic pages set every
 * word (Latin names and numbers included) in the Arabic display font.
 */
function displayFont(ctx: RenderContext): { id: string; weight: number } {
  const fonts = ctx.doc.theme.fonts;
  const ar = ctx.locale === "ar";
  const def = ARCHETYPE_DEFS[ctx.archetype];
  const p = findPairing(def, fonts.display, fonts.body) ?? def.fonts[0]!;
  const id = ar ? fonts.displayAr : fonts.display;
  return {
    id,
    weight: nearestWeight(id, ar ? p.displayWeightAr : p.displayWeight),
  };
}

export function faceOf(ctx: RenderContext): Face {
  const { id, weight } = displayFont(ctx);
  return faceFor(id, weight);
}

/**
 * Tabular-figure advances [digit, "+", space] in em, per display font @ weight — measured in Chromium
 * at the size the number is set (optical-size axes change widths) for every pairing of every
 * archetype (qa/director-footer/digits.ts).
 */
const FIGURES: Readonly<Record<string, readonly [number, number, number]>> = {
  "alexandria@500": [0.7, 0.501, 0.27],
  "alexandria@600": [0.7, 0.506, 0.27],
  "alexandria@800": [0.7, 0.515, 0.27],
  "archivo@800": [0.627, 0.649, 0.189],
  "baloo-bhaijaan-2@700": [0.6, 0.546, 0.2],
  "big-shoulders-display@800": [0.446, 0.512, 0.217],
  "big-shoulders-display@900": [0.478, 0.536, 0.22],
  "bodoni-moda@400": [0.58, 0.53, 0.25],
  "bodoni-moda@500": [0.597, 0.53, 0.25],
  "bricolage-grotesque@600": [0.603, 0.495, 0.23],
  "bricolage-grotesque@700": [0.61, 0.499, 0.224],
  "bricolage-grotesque@800": [0.616, 0.502, 0.217],
  "changa@700": [0.58, 0.53, 0.212],
  "el-messiri@500": [0.517, 0.534, 0.25],
  "el-messiri@600": [0.523, 0.539, 0.25],
  "el-messiri@700": [0.53, 0.546, 0.25],
  "fraunces@300": [0.533, 0.539, 0.224],
  "fraunces@400": [0.558, 0.544, 0.217],
  "fraunces@500": [0.571, 0.546, 0.214],
  "fraunces@600": [0.584, 0.548, 0.211],
  "gloock@400": [0.554, 0.421, 0.211],
  "hanken-grotesk@500": [0.56, 0.56, 0.26],
  "hanken-grotesk@600": [0.56, 0.56, 0.26],
  "hanken-grotesk@700": [0.56, 0.56, 0.26],
  "ibm-plex-sans-arabic@700": [0.6, 0.6, 0.236],
  "instrument-sans@600": [0.6, 0.6, 0.193],
  "instrument-serif@400": [0.386, 0.531, 0.17],
  "lemonada@600": [0.66, 0.721, 0.309],
  "marhey@700": [0.659, 0.54, 0.22],
  "noto-kufi-arabic@800": [0.579, 0.579, 0.34],
  "readex-pro@500": [0.569, 0.593, 0.293],
  "readex-pro@600": [0.58, 0.595, 0.306],
  "reem-kufi@500": [0.523, 0.552, 0.13],
  "reem-kufi@600": [0.526, 0.553, 0.13],
  "schibsted-grotesk@600": [0.635, 0.607, 0.227],
  "schibsted-grotesk@800": [0.635, 0.616, 0.192],
  "young-serif@400": [0.65, 0.6, 0.25],
};

/** Digit groups never sit closer than this (em): faces with a hairline space get extra word spacing. */
const MIN_SPACE = 0.24;

/**
 * Advance (em) of a phone number set in the page's display face, and the word spacing (em) that
 * brings a narrow space up to MIN_SPACE — the markup fits the number to its box with these.
 * Fonts outside the table fall back to the metric estimate.
 */
export function figureFit(
  ctx: RenderContext,
  text: string,
): { em: number; space: number } {
  const { id, weight } = displayFont(ctx);
  const known =
    FIGURES[`${id}@${weight}`] ??
    Object.entries(FIGURES).find(([k]) => k.startsWith(`${id}@`))?.[1];
  const f = faceFor(id, weight);
  const [digit, plus, sp] = known ?? [
    f.xw * 1.12 * f.fix[1] * f.bold,
    0.56,
    0.25,
  ];
  const space = Math.max(0, MIN_SPACE - sp);
  let em = 0;
  for (const ch of text)
    em +=
      ch === " "
        ? sp + space
        : DIGIT.test(ch)
          ? digit
          : ch === "+"
            ? plus
            : 0.5;
  return { em, space };
}

/** Extra word space that keeps words apart under negative tracking (mirrored by `word-spacing` in CSS). */
export const wordGap = (track: number) => Math.max(0, -1.5 * track);

/** Estimated advance of a line in em at the given tracking. */
export function advance(line: string, f: Face, track: number): number {
  let w = 0;
  let ar = 0;
  const chars = [...line];
  for (const ch of chars) {
    if (ch === " ") w += 0.25;
    else if (ARABIC.test(ch)) ar += ARABIC_NARROW.has(ch) ? 0.33 : 0.62;
    else if (UPPER.test(ch))
      w +=
        f.xw * (NARROW_UPPER.has(ch) ? 0.62 : WIDE_UPPER.has(ch) ? 1.62 : 1.3);
    else if (LOWER.test(ch))
      w +=
        f.xw * (NARROW_LOWER.has(ch) ? 0.58 : WIDE_LOWER.has(ch) ? 1.5 : 1.06);
    else if (DIGIT.test(ch)) w += f.xw * 1.12;
    else w += 0.3;
  }
  const k = LOWER.test(line) ? f.fix[0] : f.fix[1];
  const spaces = chars.filter((ch) => ch === " ").length;
  return (
    (w * k + ar * f.fix[2]) * f.bold +
    track * Math.max(0, chars.length - 1) +
    spaces * wordGap(track)
  );
}

/** Two balanced lines split at a space (null when the name is one word). */
function splitLines(
  text: string,
  f: Face,
  track: number,
): [string, string] | null {
  const words = text.split(" ");
  if (words.length < 2) return null;
  let best: [string, string] | null = null;
  let bestW = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(" ");
    const b = words.slice(i).join(" ");
    const w = Math.max(advance(a, f, track), advance(b, f, track));
    if (w < bestW) {
      bestW = w;
      best = [a, b];
    }
  }
  return best;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

interface Plate {
  lines: string[];
  /** the word is in Arabic script */
  rtl: boolean;
  /** stacked lines sit flush with the page's start edge (right on RTL pages) */
  pageRtl: boolean;
  track: number;
  face: Face;
  caps: boolean;
}

/**
 * One fitted SVG plate (font-size 100 user units). The letters are filled with one gradient over the
 * whole plate: the page ink, then — from a fifth into the last line's letters — the product accent,
 * thinning out as the word sinks into the edge (earlier lines stay crisp).
 */
function Svg({
  plate,
  className,
  gid,
}: {
  plate: Plate;
  className: string;
  gid: string;
}): ReactElement {
  const { lines, rtl, pageRtl, track, face, caps } = plate;
  const widths = lines.map((l) => advance(l, face, track) * 100);
  const W = Math.max(...widths);
  // vertical frame: from the tallest letter to just under the last baseline
  const top = rtl
    ? face.asc * 92
    : face.cap * (lines.some((l) => ACCENTED_CAP.test(l)) ? 128 : 108);
  const pitch = rtl ? 132 : caps ? face.cap * 132 : face.cap * 100 + 30;
  // room under the last baseline (negative = below it): Arabic bowls and tails, Latin descenders, else a hairline
  const sink = rtl ? -46 : lines.some((l) => /[gjpqyQ,;]/.test(l)) ? -24 : -6;
  const firstBase = top;
  const lastBase = firstBase + pitch * (lines.length - 1);
  const H = lastBase - sink;
  // text-anchor follows the text's own direction: "start" is the right edge of an Arabic word
  const anchor = rtl === pageRtl ? "start" : "end";
  const x = lines.length > 1 ? (pageRtl ? W : 0) : W / 2;
  const fade = Math.max(
    0,
    Math.min(0.9, (lastBase - (rtl ? face.asc * 70 : face.cap * 80)) / H),
  );
  const at = (k: number) => r1((fade + (1 - fade) * k) * 100) / 100;
  return (
    <svg
      className={className}
      viewBox={`0 0 ${r1(W)} ${r1(H)}`}
      preserveAspectRatio="xMidYMax meet"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient
          id={gid}
          gradientUnits="userSpaceOnUse"
          x1="0"
          y1="0"
          x2="0"
          y2={r1(H)}
        >
          <stop offset="0" className="lp-footer__gs lp-footer__gs--ink" />
          <stop
            offset={r1(fade * 100) / 100}
            className="lp-footer__gs lp-footer__gs--ink"
          />
          <stop
            offset={at(0.78)}
            className="lp-footer__gs lp-footer__gs--mid"
          />
          <stop offset="1" className="lp-footer__gs lp-footer__gs--edge" />
        </linearGradient>
      </defs>
      {lines.map((l, i) => (
        <text
          key={i}
          x={r1(x)}
          y={r1(firstBase + pitch * i)}
          fontSize="100"
          textAnchor={lines.length > 1 ? anchor : "middle"}
          direction={rtl ? "rtl" : "ltr"}
          textLength={r1(widths[i]!)}
          lengthAdjust="spacingAndGlyphs"
          fill={`url(#${gid})`}
          className="lp-footer__giant-text"
        >
          {l}
        </text>
      ))}
    </svg>
  );
}

/**
 * The giant word: one-line plate, two-line plate, or both (CSS shows the two-line plate on phones).
 * Returns null for an empty word.
 */
export function GiantWord({
  ctx,
  word,
  uid,
}: {
  ctx: RenderContext;
  word: string;
  uid: string;
}): ReactElement | null {
  const raw = word.replace(/\s+/g, " ").trim();
  if (!raw) return null;
  const rtl = ARABIC.test(raw);
  const voice = rtl
    ? { caps: false, track: 0 }
    : (VOICE[ctx.archetype] ?? DEFAULT_VOICE);
  const text = voice.caps
    ? raw.toLocaleUpperCase(ctx.locale === "fr" ? "fr" : "en")
    : raw;
  const face = faceOf(ctx);
  const plate = (lines: string[]): Plate => ({
    lines,
    rtl,
    pageRtl: ctx.dir === "rtl",
    track: voice.track,
    face,
    caps: voice.caps,
  });
  const n = [...text].length;
  const two = n > 9 ? splitLines(text, face, voice.track) : null;
  const mode = !two ? "one" : n > 20 ? "two" : "both";
  return (
    // a Latin name keeps its own voice (tracking) on Arabic pages: it is tagged as Latin script
    <span
      className="lp-footer__giant-word"
      data-fit={mode}
      lang={rtl ? undefined : "und-Latn"}
      style={cssVars({
        "--ft-track": `${voice.track}em`,
        "--ft-word": `${wordGap(voice.track)}em`,
      })}
    >
      {mode !== "two" ? (
        <Svg
          plate={plate([text])}
          gid={`${uid}-ft-g1`}
          className="lp-footer__giant-svg lp-footer__giant-svg--one"
        />
      ) : null}
      {two ? (
        <Svg
          plate={plate(two)}
          gid={`${uid}-ft-g2`}
          className="lp-footer__giant-svg lp-footer__giant-svg--two"
        />
      ) : null}
    </span>
  );
}
