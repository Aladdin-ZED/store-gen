/**
 * Shared plumbing: tones, ids, the decorative <svg> root and text-width estimation.
 *
 * Colors never come from hard-coded values: the root carries data-tone / data-tone2 / data-tone3
 * and illustrations.css maps them to theme tokens (--sec-* with --lp-* fallbacks). Shapes paint
 * with currentColor (tone) or the utility classes i-f2/i-s2 (tone2) and i-f3/i-s3 (tone3).
 *
 * Idle loops run on an inner <g> (or an inner HTML box), never on the element that carries
 * data-reveal: the reveal system (styles/base.css) drives the revealed element's own animation-*
 * properties, so the two would otherwise overwrite each other.
 */
import type { CSSProperties, ReactElement, ReactNode } from "react";

/** Primary/secondary illustration colors (mapped to tokens in illustrations.css). */
export type Tone =
  | "current"
  | "ink"
  | "soft"
  | "line"
  | "accent"
  | "accent-ink"
  | "accent-soft"
  | "accent-strong"
  | "pop"
  | "pop-ink"
  | "bg"
  | "card"
  | "card-ink"
  | "chip"
  | "dark"
  /** a clean white-ish surface: the section's card color (kept for older call sites) */
  | "paper"
  /** soft hue-true accent tint (--mx-tint-2) — a highlight block that keeps the section ink legible */
  | "highlight"
  /** section-aware product light (the one product-tinted glow, ≤ 10 % alpha): the default of every light effect */
  | "glow";

/** Tertiary color (fills behind/inside shapes). */
export type Tone3 = "bg" | "card" | "chip" | "paper" | "ink" | "accent" | "pop" | "dark";

/**
 * Subtle idle loops; they only run under html[data-motion] (never "off") without reduced motion.
 * float = slow hover · drift = ambient wander (lights) · spin / spin-rev = slow rotation ·
 * pulse = breathing glow · twinkle = sparkle shimmer.
 */
export type Idle = "spin" | "spin-rev" | "float" | "drift" | "pulse" | "twinkle";

/** Props shared by every standalone SVG illustration. */
export interface IllBase {
  className?: string;
  /** primary color */
  tone?: Tone;
  /** rendered width (number → px). Height follows the viewBox aspect ratio. */
  size?: number | string;
  /** data-reveal="draw": strokes draw on (and end dots pop) when scrolled into view */
  reveal?: boolean;
  /** reveal delay in ms (data-delay, read by the runtime) */
  delay?: number;
  idle?: Idle;
  /** mirror horizontally in RTL documents */
  rtlFlip?: boolean;
}

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/** Unique, valid XML id derived from the caller's uid (section id + local key). */
export function illId(uid: string, local: string): string {
  const clean = uid.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 80) || "x";
  return `lpi-${clean}-${local}`;
}

export const urlRef = (id: string): string => `url(#${id})`;

/** data-tone value (omitted for "current", which simply inherits the text color). */
export const toneAttr = (tone: Tone | undefined): string | undefined => (tone && tone !== "current" ? tone : undefined);

/** data-delay for a reveal (integer ms ≥ 0), or undefined when there is no reveal. */
export const delayAttr = (reveal: boolean | undefined, delay: number | undefined): number | undefined =>
  reveal && delay && Number.isFinite(delay) ? Math.max(0, Math.round(delay)) : undefined;

/**
 * A CSS length from a size prop: numbers are px, strings must look like a plain CSS length or
 * percentage (anything else is dropped — values end up in a style attribute).
 */
export function cssLength(v: number | string | undefined): string | undefined {
  if (v === undefined) return undefined;
  if (typeof v === "number") return Number.isFinite(v) && v > 0 ? `${Math.round(v * 100) / 100}px` : undefined;
  const s = v.trim();
  return /^\d{1,5}(\.\d{1,3})?(px|rem|em|%|vw|vh|vmin|vmax|cqi|svh|dvh)$/.test(s) ? s : undefined;
}

/**
 * Inline style holding only CSS custom properties (the landing CSP and the section contract allow
 * nothing else in style attributes). Undefined values are skipped; returns undefined when empty.
 */
export function vars(map: Record<`--${string}`, string | number | undefined>): CSSProperties | undefined {
  const out: Record<string, string> = {};
  let any = false;
  for (const [k, v] of Object.entries(map)) {
    if (v === undefined) continue;
    out[k] = String(v);
    any = true;
  }
  return any ? (out as CSSProperties) : undefined;
}

export interface RootProps extends IllBase {
  /** viewBox; omit for unitless layers that tile in CSS pixels */
  vb?: string;
  /** component slug → class "lp-ill--<kind>" */
  kind: string;
  tone2?: Tone;
  tone3?: Tone3;
  height?: number | string;
  /** preserveAspectRatio */
  par?: string;
  /** absolutely positioned full-bleed layer (class lp-layer) */
  layer?: boolean;
  /** extra data-* attributes (keys without the "data-" prefix) */
  data?: Record<string, string | number | undefined>;
  style?: CSSProperties;
  children: ReactNode;
}

export function SvgRoot(p: RootProps): ReactElement {
  const extra: Record<string, string> = {};
  if (p.data) {
    for (const [k, v] of Object.entries(p.data)) if (v !== undefined) extra[`data-${k}`] = String(v);
  }
  return (
    <svg
      viewBox={p.vb}
      className={cx("lp-ill", `lp-ill--${p.kind}`, p.layer && "lp-layer", p.rtlFlip && "lp-flip-rtl", p.className)}
      width={p.size}
      height={p.height}
      preserveAspectRatio={p.par}
      data-tone={toneAttr(p.tone)}
      data-tone2={toneAttr(p.tone2)}
      data-tone3={p.tone3}
      data-reveal={p.reveal ? "draw" : undefined}
      data-delay={delayAttr(p.reveal, p.delay)}
      style={p.style}
      aria-hidden="true"
      focusable="false"
      {...extra}
    >
      {p.idle ? <g className={`lp-idle lp-idle-${p.idle}`}>{p.children}</g> : p.children}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Text helpers (SVG text can't be measured at render time)            */
/* ------------------------------------------------------------------ */

const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
const ARABIC_DIGIT = /[٠-٩۰-۹٪]/;

export const hasArabic = (s: string): boolean => ARABIC.test(s);

/** Unicode isolates: LEFT-TO-RIGHT ISOLATE … POP DIRECTIONAL ISOLATE (default-ignorable, never drawn). */
const LRI = "⁦";
const PDI = "⁩";
const DIGIT = "0-9٠-٩۰-۹";
/** A number with its sign, inner separators and percent: "24–48", "−25%", "1.299", "3/4", "٢٤٪". */
const NUMERIC_RUN = new RegExp(`[+\\u2212-]?[${DIGIT}](?:[${DIGIT}]|[.,:/\\u2013\\u2212-](?=[${DIGIT}]))*[%\\u066A]?`, "g");

/**
 * Arabic text with every number kept in reading order. Inside an Arabic run the bidi algorithm sees
 * the dash of "24–48" (or the sign of "−25%") as a neutral between two Arabic-context numbers and
 * swaps them ("48–24"); an LTR isolate around each number keeps it whole. Text without Arabic
 * letters is returned unchanged: set it with direction="ltr" instead.
 */
export function isolateNumbers(s: string): string {
  return hasArabic(s) ? s.replace(NUMERIC_RUN, (m) => `${LRI}${m}${PDI}`) : s;
}

/**
 * Rough advance width of a string in em, for a display face set in caps (Latin) or Arabic.
 * Arabic = 0.62em per letter + 0.4em per word (isolated/final forms swash wide). Fitted against the
 * kit's Arabic faces: ≥ the real width for ~90% of phrases, worst case ≈ 1.37× — callers that must
 * never overflow add a margin.
 */
export function estimateEm(s: string, caps = true): number {
  let w = 0;
  let inArabicWord = false;
  for (const ch of s) {
    const arabicLetter = ARABIC.test(ch) && !ARABIC_DIGIT.test(ch);
    if (arabicLetter) {
      w += inArabicWord ? 0.62 : 1.02;
      inArabicWord = true;
      continue;
    }
    inArabicWord = false;
    if (ch === " ") w += 0.3;
    else if (/[0-9٠-٩۰-۹]/.test(ch)) w += 0.58;
    else if (/[.,:;'’!|·•-]/.test(ch)) w += 0.3;
    else if (/[MWmw@%٪]/.test(ch)) w += 0.86;
    else if (caps || /[A-Z]/.test(ch)) w += 0.66;
    else w += 0.52;
  }
  return w;
}
