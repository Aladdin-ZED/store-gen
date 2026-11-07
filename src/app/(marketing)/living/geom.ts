/**
 * Pure geometry for the homepage's living models (src/app/(marketing)/living/*). Server-side: every model is authored
 * once in LTR user units and mirrored here for Arabic (x' = W - x for points, W - x - w for rects), so no group that
 * holds text is ever flipped with scaleX(-1). Paths are lists of segments, so the same data gives the `d` string, the
 * arc length and the evenly spaced points the client runtime turns into WAAPI transform keyframes (no offset-path).
 */

export type Pt = readonly [number, number];
export type Seg = { k: "L"; a: Pt; b: Pt } | { k: "Q"; a: Pt; c: Pt; b: Pt } | { k: "C"; a: Pt; c1: Pt; c2: Pt; b: Pt };

/** The dimetric projection of the exploded page and the dock glyph (30° axes). */
export const ISO = "matrix(0.866 0.5 -0.866 0.5 0 0)";

const r2 = (n: number) => Math.round(n * 100) / 100;
export const f = (n: number) => String(r2(n));

/** A point's x in a box of width W, mirrored when the locale reads right to left. */
export const mx = (x: number, W: number, rtl: boolean) => (rtl ? W - x : x);
/** A rect's x (its left edge) mirrored in a box of width W. */
export const mxRect = (x: number, w: number, W: number, rtl: boolean) => (rtl ? W - x - w : x);
/** text-anchor for a logical side: "start" sits at the inline start, "end" at the inline end. */
export const anchor = (rtl: boolean, side: "start" | "end" | "middle"): "start" | "end" | "middle" =>
  side === "middle" ? "middle" : (side === "start") !== rtl ? "start" : "end";
export const mirrorPts = (pts: readonly Pt[], W: number, rtl: boolean): Pt[] => pts.map(([x, y]) => [mx(x, W, rtl), y] as const);

/* ------------------------------------------------------------------ */
/* segments                                                            */
/* ------------------------------------------------------------------ */

export function toD(segs: readonly Seg[]): string {
  if (!segs.length) return "";
  const out: string[] = [`M${f(segs[0].a[0])} ${f(segs[0].a[1])}`];
  for (const s of segs) {
    if (s.k === "L") out.push(`L${f(s.b[0])} ${f(s.b[1])}`);
    else if (s.k === "Q") out.push(`Q${f(s.c[0])} ${f(s.c[1])} ${f(s.b[0])} ${f(s.b[1])}`);
    else out.push(`C${f(s.c1[0])} ${f(s.c1[1])} ${f(s.c2[0])} ${f(s.c2[1])} ${f(s.b[0])} ${f(s.b[1])}`);
  }
  return out.join("");
}

function at(s: Seg, t: number): Pt {
  const u = 1 - t;
  if (s.k === "L") return [s.a[0] + (s.b[0] - s.a[0]) * t, s.a[1] + (s.b[1] - s.a[1]) * t];
  if (s.k === "Q") return [u * u * s.a[0] + 2 * u * t * s.c[0] + t * t * s.b[0], u * u * s.a[1] + 2 * u * t * s.c[1] + t * t * s.b[1]];
  return [
    u * u * u * s.a[0] + 3 * u * u * t * s.c1[0] + 3 * u * t * t * s.c2[0] + t * t * t * s.b[0],
    u * u * u * s.a[1] + 3 * u * u * t * s.c1[1] + 3 * u * t * t * s.c2[1] + t * t * t * s.b[1],
  ];
}

/** Dense polyline of the segments (64 steps per curve). */
function dense(segs: readonly Seg[]): Pt[] {
  const pts: Pt[] = [];
  for (const s of segs) {
    const n = s.k === "L" ? 1 : 64;
    for (let i = pts.length ? 1 : 0; i <= n; i++) pts.push(at(s, i / n));
  }
  return pts;
}

export function polyLength(pts: readonly Pt[]): number {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return L;
}

export const segLength = (segs: readonly Seg[]) => polyLength(dense(segs));

/** n points evenly spaced by arc length along the segments (first and last included). */
export function samplePath(segs: readonly Seg[], n: number): Pt[] {
  const pts = dense(segs);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const L = cum[cum.length - 1];
  const out: Pt[] = [];
  let j = 1;
  for (let k = 0; k < n; k++) {
    const d = (L * k) / (n - 1);
    while (j < cum.length - 1 && cum[j] < d) j++;
    const span = cum[j] - cum[j - 1] || 1;
    const t = Math.min(1, Math.max(0, (d - cum[j - 1]) / span));
    out.push([r2(pts[j - 1][0] + (pts[j][0] - pts[j - 1][0]) * t), r2(pts[j - 1][1] + (pts[j][1] - pts[j - 1][1]) * t)]);
  }
  return out;
}

/** Orthogonal polyline with rounded corners of radius r (quadratic corners). */
export function orthoPath(points: readonly Pt[], r: number): Seg[] {
  const segs: Seg[] = [];
  let cur: Pt = points[0];
  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    const next = points[i + 1];
    if (!next) {
      segs.push({ k: "L", a: cur, b: p });
      break;
    }
    const inLen = Math.hypot(p[0] - cur[0], p[1] - cur[1]);
    const outLen = Math.hypot(next[0] - p[0], next[1] - p[1]);
    const rr = Math.min(r, inLen / 2, outLen / 2);
    const inDir: Pt = [(p[0] - cur[0]) / (inLen || 1), (p[1] - cur[1]) / (inLen || 1)];
    const outDir: Pt = [(next[0] - p[0]) / (outLen || 1), (next[1] - p[1]) / (outLen || 1)];
    const before: Pt = [p[0] - inDir[0] * rr, p[1] - inDir[1] * rr];
    const after: Pt = [p[0] + outDir[0] * rr, p[1] + outDir[1] * rr];
    segs.push({ k: "L", a: cur, b: before });
    segs.push({ k: "Q", a: before, c: p, b: after });
    cur = after;
  }
  return segs;
}

/** A smooth curve through the points (Catmull-Rom as cubic segments). */
export function cubic(points: readonly Pt[]): Seg[] {
  const segs: Seg[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    segs.push({
      k: "C",
      a: p1,
      c1: [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6],
      c2: [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6],
      b: p2,
    });
  }
  return segs;
}

export const mirrorSegs = (segs: readonly Seg[], W: number, rtl: boolean): Seg[] => {
  if (!rtl) return [...segs];
  const m = (p: Pt): Pt => [W - p[0], p[1]];
  return segs.map((s) => (s.k === "L" ? { k: "L", a: m(s.a), b: m(s.b) } : s.k === "Q" ? { k: "Q", a: m(s.a), c: m(s.c), b: m(s.b) } : { k: "C", a: m(s.a), c1: m(s.c1), c2: m(s.c2), b: m(s.b) }));
};

/** Points as the compact attribute the runtime reads ("x,y x,y …"). */
export const ptsAttr = (pts: readonly Pt[]) => pts.map(([x, y]) => `${f(x)},${f(y)}`).join(" ");

/** A cubic-bezier easing drawn in a w×h box (y up), as a path. */
export function bezierGlyph([x1, y1, x2, y2]: readonly [number, number, number, number], w: number, h: number): string {
  return `M0 ${f(h)}C${f(x1 * w)} ${f(h - y1 * h)} ${f(x2 * w)} ${f(h - y2 * h)} ${f(w)} 0`;
}

/** Evenly spaced outputs of a CSS linear() easing, drawn in a w×h box as a polyline of n points. */
export function linearGlyph(values: readonly number[], n: number, w: number, h: number): string {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const pos = t * (values.length - 1);
    const lo = Math.floor(pos);
    const v = values[lo] + (values[Math.min(values.length - 1, lo + 1)] - values[lo]) * (pos - lo);
    out.push(`${i ? "L" : "M"}${f(t * w)} ${f(h - v * h)}`);
  }
  return out.join("");
}

/** The four corners of an axis-aligned rect, as an "x y w h" attribute. */
export const rectAttr = (x: number, y: number, w: number, h: number) => `${f(x)} ${f(y)} ${f(w)} ${f(h)}`;

/** Wraps a label into lines of at most `max` characters (on spaces; a longer word stays whole). */
export function wrap(text: string, max: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (!cur) cur = w;
    else if ((cur + " " + w).length <= max) cur += " " + w;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}
