/**
 * The R1 grid monogram (P6 DESIGN; design.md DES-§12.6, DS32). Pure and isomorphic: the favicon of every landing
 * document (`brandIcon`, ./favicon.ts) and the brand kit's empty state draw it from the same function.
 *
 * A 24-unit square grid; the letters A-Z and the digits 0-9 are stroke skeletons (lines and elliptical arcs) on a
 * 14-unit cap height, placed in grid units, never set as text: the output is an SVG of `<path>` elements only.
 *  - stroke width per vibe: 2.5 (maison, editorial, bloom), 3 (apothecary, field, souk, hearth), 3.5 (kinetic, circuit,
 *    garage, playground);
 *  - caps from G27: a pill button gives round caps, every other button butt caps; joins are round (a miter spikes);
 *  - enclosures: none, circle (r = 11), rounded square (r = 6), arch (modern Moroccan: souk and bloom only);
 *  - up to two letters, the initials of the first two Latin words of the name (diacritics folded); a name with no
 *    Latin word (Arabic only) draws the brand glyph (G25: dot, spark or diamond) inside the enclosure;
 *  - optical centring: the letters start bbox-centred and are pulled until the ink centroid (computed from the
 *    skeleton) is within 1.5 % of the enclosure centre (the contract is 2 %);
 *  - colours: the `lp-accent` ground and the `lp-accent-ink` mark; with no enclosure the mark is drawn in the accent.
 */

export type MonogramVibe = "maison" | "editorial" | "bloom" | "apothecary" | "field" | "souk" | "hearth" | "kinetic" | "circuit" | "garage" | "playground";
export type MonogramEnclosure = "none" | "circle" | "rounded" | "arch";
export type MonogramGlyph = "dot" | "spark" | "diamond";

/** A skeleton segment in glyph units (cap height 14, y down): a line, or an elliptical arc from a0 to a1 degrees. */
type Seg = readonly ["L", number, number, number, number] | readonly ["E", number, number, number, number, number, number];
interface Skeleton {
  segs: readonly Seg[];
}

const L = (x1: number, y1: number, x2: number, y2: number): Seg => ["L", x1, y1, x2, y2];
/** Arc of the ellipse (cx, cy, rx, ry) from a0 to a1 degrees, a1 > a0, angles grow clockwise on screen (y down). */
const E = (cx: number, cy: number, rx: number, ry: number, a0: number, a1: number): Seg => ["E", cx, cy, rx, ry, a0, a1];
const g = (...segs: Seg[]): Skeleton => ({ segs });

/** The 36 skeletons, drawn on a 14-unit cap height (the widths vary like a geometric sans). */
export const GRID_GLYPHS: Readonly<Record<string, Skeleton>> = {
  A: g(L(0, 14, 5, 0), L(5, 0, 10, 14), L(1.9, 9.2, 8.1, 9.2)),
  B: g(L(0, 0, 0, 14), L(0, 0, 4.4, 0), E(4.4, 3.4, 3.4, 3.4, -90, 90), L(4.4, 6.8, 0, 6.8), L(0, 6.8, 4.9, 6.8), E(4.9, 10.4, 3.6, 3.6, -90, 90), L(4.9, 14, 0, 14)),
  C: g(E(6, 7, 6, 7, 42, 318)),
  D: g(L(0, 0, 0, 14), L(0, 0, 3, 0), E(3, 7, 6, 7, -90, 90), L(3, 14, 0, 14)),
  E: g(L(8, 0, 0, 0), L(0, 0, 0, 14), L(0, 14, 8, 14), L(0, 7, 6.6, 7)),
  F: g(L(8, 0, 0, 0), L(0, 0, 0, 14), L(0, 7, 6.6, 7)),
  G: g(E(6, 7, 6, 7, 0, 312), L(12, 7, 7, 7)),
  H: g(L(0, 0, 0, 14), L(9, 0, 9, 14), L(0, 7, 9, 7)),
  I: g(L(0, 0, 0, 14)),
  J: g(L(6, 0, 6, 10), E(3, 10, 3, 4, 0, 180)),
  K: g(L(0, 0, 0, 14), L(9, 0, 0, 9), L(3.4, 5.6, 9.2, 14)),
  L: g(L(0, 0, 0, 14), L(0, 14, 8, 14)),
  M: g(L(0, 14, 0, 0), L(0, 0, 5.5, 9.5), L(5.5, 9.5, 11, 0), L(11, 0, 11, 14)),
  N: g(L(0, 14, 0, 0), L(0, 0, 9, 14), L(9, 14, 9, 0)),
  O: g(E(6.5, 7, 6.5, 7, 0, 360)),
  P: g(L(0, 14, 0, 0), L(0, 0, 4.5, 0), E(4.5, 4, 4, 4, -90, 90), L(4.5, 8, 0, 8)),
  Q: g(E(6.5, 7, 6.5, 7, 0, 360), L(8.4, 10.4, 12.6, 14.6)),
  R: g(L(0, 14, 0, 0), L(0, 0, 4.5, 0), E(4.5, 4, 4, 4, -90, 90), L(4.5, 8, 0, 8), L(4.2, 8, 9, 14)),
  S: g(E(4.6, 3.5, 4.3, 3.5, 90, 340), E(4.6, 10.5, 4.6, 3.5, -90, 160)),
  T: g(L(0, 0, 10, 0), L(5, 0, 5, 14)),
  U: g(L(0, 0, 0, 9.5), E(4.5, 9.5, 4.5, 4.5, 0, 180), L(9, 9.5, 9, 0)),
  V: g(L(0, 0, 5, 14), L(5, 14, 10, 0)),
  W: g(L(0, 0, 3.2, 14), L(3.2, 14, 6.5, 3.5), L(6.5, 3.5, 9.8, 14), L(9.8, 14, 13, 0)),
  X: g(L(0, 0, 9.5, 14), L(9.5, 0, 0, 14)),
  Y: g(L(0, 0, 5, 7), L(10, 0, 5, 7), L(5, 7, 5, 14)),
  Z: g(L(0, 0, 9, 0), L(9, 0, 0, 14), L(0, 14, 9, 14)),
  "0": g(E(4.75, 7, 4.75, 7, 0, 360)),
  "1": g(L(0, 3.2, 3.6, 0), L(3.6, 0, 3.6, 14)),
  "2": g(E(4.5, 4.2, 4.3, 4.2, 195, 385), L(8.4, 5.97, 0, 14), L(0, 14, 9, 14)),
  "3": g(E(4.3, 3.5, 4.1, 3.5, 200, 450), E(4.3, 10.5, 4.5, 3.5, -90, 160)),
  "4": g(L(7, 14, 7, 0), L(7, 0, 0, 10), L(0, 10, 9.6, 10)),
  "5": g(L(8.6, 0, 1.4, 0), L(1.4, 0, 1.15, 6.61), E(4.6, 9.5, 4.5, 4.5, -140, 150)),
  "6": g(E(4.6, 9.4, 4.6, 4.6, 0, 360), L(7.6, 0, 0.6, 7.4)),
  "7": g(L(0, 0, 9, 0), L(9, 0, 3, 14)),
  "8": g(E(4.6, 3.5, 3.8, 3.5, 0, 360), E(4.6, 10.5, 4.6, 3.5, 0, 360)),
  "9": g(E(4.6, 4.6, 4.6, 4.6, 0, 360), L(8.6, 6.6, 2, 14)),
};

/** Stroke width per vibe (DES-§12.6), in grid units. */
export function strokeForVibe(vibe: string): number {
  if (vibe === "maison" || vibe === "editorial" || vibe === "bloom") return 2.5;
  if (vibe === "kinetic" || vibe === "circuit" || vibe === "garage" || vibe === "playground") return 3.5;
  return 3;
}

/** The enclosure the theme asks for: arch only for souk and bloom; outline / underline buttons draw none. */
export function enclosureFor(vibe: string, attrs: Readonly<Record<string, string>>): MonogramEnclosure {
  const btn = attrs["data-btn"] ?? "";
  const mask = attrs["data-mask"] ?? "";
  if (btn === "outline" || btn === "underline") return "none";
  if (mask === "arch") return vibe === "souk" || vibe === "bloom" ? "arch" : "rounded";
  if (mask === "circle" || mask === "pill" || btn === "pill") return "circle";
  return "rounded";
}

/** The initials of the first two Latin words (diacritics folded, uppercase), or "" when the name has none. */
export function monogramLetters(name: string): string {
  const words = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^A-Za-z0-9]+/)
    .filter((w) => /^[A-Za-z0-9]/.test(w));
  return words
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

/* ------------------------------------------------------------------ */
/* geometry                                                            */
/* ------------------------------------------------------------------ */

const rad = (d: number) => (d * Math.PI) / 180;
const r2 = (n: number) => Math.round(n * 100) / 100;
const pt = (s: Extract<Seg, readonly ["E", ...number[]]>, a: number): [number, number] => [s[1] + s[3] * Math.cos(rad(a)), s[2] + s[4] * Math.sin(rad(a))];

/** Points along a segment, `n` steps (the arcs by angle). */
function samples(s: Seg, n = 24): [number, number][] {
  if (s[0] === "L") return Array.from({ length: n + 1 }, (_, i) => [s[1] + ((s[3] - s[1]) * i) / n, s[2] + ((s[4] - s[2]) * i) / n]);
  const out: [number, number][] = [];
  for (let i = 0; i <= n; i++) out.push(pt(s, s[5] + ((s[6] - s[5]) * i) / n));
  return out;
}

interface Placed {
  segs: Seg[];
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

function bboxOf(segs: readonly Seg[]): Placed["bbox"] {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const s of segs)
    for (const [x, y] of samples(s, 48)) {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  return { x0, y0, x1, y1 };
}

/** The ink centroid of a skeleton: chord midpoints weighted by chord length. */
export function skeletonCentroid(segs: readonly Seg[]): { x: number; y: number } {
  let sx = 0;
  let sy = 0;
  let sw = 0;
  for (const s of segs) {
    const p = samples(s, 64);
    for (let i = 1; i < p.length; i++) {
      const [ax, ay] = p[i - 1]!;
      const [bx, by] = p[i]!;
      const w = Math.hypot(bx - ax, by - ay);
      sx += ((ax + bx) / 2) * w;
      sy += ((ay + by) / 2) * w;
      sw += w;
    }
  }
  return sw > 0 ? { x: sx / sw, y: sy / sw } : { x: 0, y: 0 };
}

const move = (s: Seg, k: number, dx: number, dy: number): Seg =>
  s[0] === "L" ? ["L", s[1] * k + dx, s[2] * k + dy, s[3] * k + dx, s[4] * k + dy] : ["E", s[1] * k + dx, s[2] * k + dy, s[3] * k, s[4] * k, s[5], s[6]];

function segPath(s: Seg): string {
  if (s[0] === "L") return `M${r2(s[1])} ${r2(s[2])}L${r2(s[3])} ${r2(s[4])}`;
  const [, , , rx, ry, a0, a1] = s;
  const arc = (from: number, to: number) => {
    const [ex, ey] = pt(s, to);
    return `A${r2(rx)} ${r2(ry)} 0 ${to - from > 180 ? 1 : 0} 1 ${r2(ex)} ${r2(ey)}`;
  };
  const [sx, sy] = pt(s, a0);
  // a full ellipse is two half arcs (one SVG arc cannot end where it starts)
  if (a1 - a0 >= 359.9) return `M${r2(sx)} ${r2(sy)}${arc(a0, a0 + 180)}${arc(a0 + 180, a0 + 360)}Z`;
  return `M${r2(sx)} ${r2(sy)}${arc(a0, a1)}`;
}

/* ------------------------------------------------------------------ */
/* layout                                                              */
/* ------------------------------------------------------------------ */

const CENTRE: Record<MonogramEnclosure, { x: number; y: number }> = {
  none: { x: 12, y: 12 },
  circle: { x: 12, y: 12 },
  rounded: { x: 12, y: 12 },
  arch: { x: 12, y: 13.2 },
};
/** [cap height, max width] for one letter / two letters, in grid units. */
const BOX: Record<MonogramEnclosure, [[number, number], [number, number]]> = {
  none: [
    [15, 18],
    [12, 21],
  ],
  circle: [
    [9.6, 11],
    [8, 13.4],
  ],
  rounded: [
    [10.6, 12.5],
    [8.8, 15],
  ],
  arch: [
    [9.4, 11.5],
    [7.8, 13.6],
  ],
};
/** How far the ink centroid may sit from the enclosure centre after placement (grid units; 2 % of 22 = 0.44). */
const CENTROID_PULL = 0.33;

function placeLetters(letters: string, enc: MonogramEnclosure, stroke: number): Placed {
  const [cap, maxW] = BOX[enc][letters.length > 1 ? 1 : 0];
  const glyphs = Array.from(letters).map((c) => GRID_GLYPHS[c]!);
  const widths = glyphs.map((gl) => {
    const b = bboxOf(gl.segs);
    return { x0: b.x0, w: b.x1 - b.x0 };
  });
  const gap = Math.max(1.8, stroke * 0.85);
  let k = cap / 14;
  const total = (kk: number) => widths.reduce((sum, w) => sum + w.w * kk, 0) + gap * (glyphs.length - 1);
  if (total(k) > maxW) k = (maxW - gap * (glyphs.length - 1)) / widths.reduce((sum, w) => sum + w.w, 0);
  const segs: Seg[] = [];
  let x = 0;
  glyphs.forEach((gl, i) => {
    for (const s of gl.segs) segs.push(move(s, k, x - widths[i]!.x0 * k, 0));
    x += widths[i]!.w * k + gap;
  });
  // bbox-centred first, then pulled so the ink centroid sits within CENTROID_PULL of the centre
  const c = CENTRE[enc];
  const b = bboxOf(segs);
  let dx = c.x - (b.x0 + b.x1) / 2;
  let dy = c.y - (b.y0 + b.y1) / 2;
  const m = skeletonCentroid(segs);
  const ex = m.x + dx - c.x;
  const ey = m.y + dy - c.y;
  const off = Math.hypot(ex, ey);
  if (off > CENTROID_PULL) {
    dx -= ex * (1 - CENTROID_PULL / off);
    dy -= ey * (1 - CENTROID_PULL / off);
  }
  const placed = segs.map((s) => move(s, 1, dx, dy));
  return { segs: placed, bbox: bboxOf(placed) };
}

function groundPath(enc: MonogramEnclosure): string | null {
  if (enc === "circle") return "M1 12A11 11 0 0 1 23 12A11 11 0 0 1 1 12Z";
  if (enc === "rounded") return "M7 1H17A6 6 0 0 1 23 7V17A6 6 0 0 1 17 23H7A6 6 0 0 1 1 17V7A6 6 0 0 1 7 1Z";
  if (enc === "arch") return "M2 23V12A10 10 0 0 1 22 12V23Z";
  return null;
}

function glyphPath(glyph: MonogramGlyph, enc: MonogramEnclosure): string {
  const { x, y } = CENTRE[enc];
  const s = enc === "none" ? 1.5 : 1;
  if (glyph === "dot") {
    const r = 3.4 * s;
    return `M${r2(x - r)} ${y}A${r} ${r} 0 0 1 ${r2(x + r)} ${y}A${r} ${r} 0 0 1 ${r2(x - r)} ${y}Z`;
  }
  if (glyph === "diamond") {
    const r = 5 * s;
    return `M${x} ${r2(y - r)}L${r2(x + r)} ${y}L${x} ${r2(y + r)}L${r2(x - r)} ${y}Z`;
  }
  // spark: four long points, four short ones
  const pts: string[] = [];
  for (let i = 0; i < 8; i++) {
    const a = rad(-90 + i * 45);
    const r = (i % 2 === 0 ? 6.4 : 1.7) * s;
    pts.push(`${r2(x + r * Math.cos(a))} ${r2(y + r * Math.sin(a))}`);
  }
  return `M${pts.join("L")}Z`;
}

export interface MonogramInput {
  name: string;
  vibe: string;
  enclosure: MonogramEnclosure;
  caps: "round" | "butt";
  glyph: MonogramGlyph;
  /** the `lp-accent` ground */
  ground: string;
  /** the `lp-accent-ink` mark */
  ink: string;
}

export interface Monogram {
  svg: string;
  kind: "letters" | "glyph";
  letters: string;
  stroke: number;
  /** the ink centroid in grid units (the enclosure centre for a glyph) */
  centroid: { x: number; y: number };
  centre: { x: number; y: number };
}

const HEX = /^#[0-9a-fA-F]{3,8}$/;
const safeColor = (c: string, fallback: string) => (HEX.test(c) ? c : fallback);

/** The grid monogram as a path-only SVG (no `<text>`, no other element). */
export function gridMonogram(input: MonogramInput): Monogram {
  const stroke = strokeForVibe(input.vibe);
  const letters = monogramLetters(input.name);
  const enc = input.enclosure === "arch" && input.vibe !== "souk" && input.vibe !== "bloom" ? "rounded" : input.enclosure;
  const ground = safeColor(input.ground, "#1f2a37");
  const ink = safeColor(input.ink, "#ffffff");
  const markColor = enc === "none" ? ground : ink;
  const bg = groundPath(enc);
  const parts: string[] = [];
  if (bg) parts.push(`<path d="${bg}" fill="${ground}"/>`);
  const centre = CENTRE[enc];
  if (!letters) {
    parts.push(`<path d="${glyphPath(input.glyph, enc)}" fill="${markColor}"/>`);
    return { svg: wrap(parts), kind: "glyph", letters: "", stroke, centroid: centre, centre };
  }
  const placed = placeLetters(letters, enc, stroke);
  // round joins for every cap style: a miter at the acute joins of A, M, N, V, W would spike past the cap height
  const join = "round";
  parts.push(
    `<path d="${placed.segs.map(segPath).join("")}" fill="none" stroke="${markColor}" stroke-width="${stroke}" stroke-linecap="${input.caps}" stroke-linejoin="${join}"/>`,
  );
  return { svg: wrap(parts), kind: "letters", letters, stroke, centroid: skeletonCentroid(placed.segs), centre };
}

const wrap = (parts: string[]) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${parts.join("")}</svg>`;

/** The monogram the theme implies: vibe from data-arch, caps from G27 (data-btn), glyph from G25 (data-glyph). */
export function monogramForTheme(name: string, attrs: Readonly<Record<string, string>>, ground: string, ink: string): Monogram {
  const vibe = attrs["data-arch"] ?? "maison";
  const gl = attrs["data-glyph"];
  return gridMonogram({
    name,
    vibe,
    enclosure: enclosureFor(vibe, attrs),
    caps: attrs["data-btn"] === "pill" ? "round" : "butt",
    glyph: gl === "spark" || gl === "diamond" ? gl : "dot",
    ground,
    ink,
  });
}

/** A data: URI of the SVG (allowed by the documents' img-src). */
export const svgDataUri = (svg: string) => `data:image/svg+xml,${encodeURIComponent(svg)}`;
