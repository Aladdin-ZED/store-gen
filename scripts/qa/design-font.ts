/**
 * A small, dependency-free outline reader for the design checks (P6 DESIGN; design.md DES-§10.2 F15, DES-§10.5,
 * DES-§27.3 DES-R21). It reads the shipped WOFF2 files (Brotli, and the W3C WOFF2 §5.1-5.3 `glyf` / `loca`
 * reconstruction of the transformed glyph table), WOFF 1.0 files (per-table zlib, untransformed glyphs) and plain
 * TrueType, then gives glyph outlines at a variable-font location (`fvar` / `avar` / `gvar` with IUP) and the Arabic
 * positional forms of a word (Presentation Forms-B through `cmap`, else the `isol` / `init` / `medi` / `fina` and
 * `rlig` lookups of `GSUB`, single and ligature substitutions, through extension lookups).
 *
 * It measures; it never shapes for display. `scripts/qa/design-ink.ts` (F15 ink-density ratio) and the hand-tuned
 * Arabic metrics table of src/lib/design/typography.ts use it; `theme:check` cross-checks the WOFF2 reconstruction
 * against the untransformed `.woff` of the faces that ship both (CRIT2-7). The maintainer's shared module
 * `scripts/fonts/woff2-sfnt.mjs` (DES-R21) is the build-time owner of WOFF2 reading; CCR r1-p6-1 offers this code to it.
 *
 * Only TrueType outlines (`glyf`) are read: every shipped face is TrueType-flavoured (a CFF font throws).
 */
import { readFileSync } from "node:fs";
import { brotliDecompressSync, inflateSync } from "node:zlib";

export interface Pt {
  x: number;
  y: number;
  on: boolean;
}
interface Component {
  gid: number;
  dx: number;
  dy: number;
  /** 2 × 2 transform [xx, xy, yx, yy] */
  m: readonly [number, number, number, number];
}
type Glyph = { kind: "empty" } | { kind: "simple"; contours: Pt[][] } | { kind: "composite"; components: Component[] };

export interface Axis {
  tag: string;
  min: number;
  def: number;
  max: number;
}

/** An outline at a location: contours in font units, the (varied) advance width. */
export interface Outline {
  contours: Pt[][];
  advance: number;
}

const WOFF2_TAGS = ["cmap", "head", "hhea", "hmtx", "maxp", "name", "OS/2", "post", "cvt ", "fpgm", "glyf", "loca", "prep", "CFF ", "VORG", "EBDT", "EBLC", "gasp", "hdmx", "kern", "LTSH", "PCLT", "VDMX", "vhea", "vmtx", "BASE", "GDEF", "GPOS", "GSUB", "EBSC", "JSTF", "MATH", "CBDT", "CBLC", "COLR", "CPAL", "SVG ", "sbix", "acnt", "avar", "bdat", "bloc", "bsln", "cvar", "fdsc", "feat", "fmtx", "fvar", "gvar", "hsty", "just", "lcar", "mort", "morx", "opbd", "prop", "trak", "Zapf", "Silf", "Glat", "Gloc", "Feat", "Sill"];

/* ------------------------------------------------------------------ */
/* containers                                                          */
/* ------------------------------------------------------------------ */

interface RawTables {
  tables: Map<string, Buffer>;
  /** the WOFF2 transformed glyf table (version 0), decoded straight into glyphs */
  woff2Glyf: Buffer | null;
  /** the WOFF2 transformed hmtx (version 1) */
  woff2Hmtx: Buffer | null;
}

function base128(buf: Buffer, st: { p: number }): number {
  let acc = 0;
  for (let i = 0; i < 5; i++) {
    const b = buf[st.p++]!;
    if (i === 0 && b === 0x80) throw new Error("woff2: invalid UIntBase128");
    acc = (acc * 128) + (b & 0x7f);
    if (!(b & 0x80)) return acc;
  }
  throw new Error("woff2: UIntBase128 too long");
}

function readWoff2(buf: Buffer): RawTables {
  if (buf.readUInt32BE(4) === 0x74746366) throw new Error("woff2 collections are not supported");
  const numTables = buf.readUInt16BE(12);
  const compressedSize = buf.readUInt32BE(20);
  const st = { p: 48 };
  const dir: { tag: string; length: number; transformed: boolean }[] = [];
  for (let i = 0; i < numTables; i++) {
    const flags = buf[st.p++]!;
    let tag: string;
    if ((flags & 63) === 63) {
      tag = buf.toString("latin1", st.p, st.p + 4);
      st.p += 4;
    } else tag = WOFF2_TAGS[flags & 63]!;
    const version = (flags >> 6) & 3;
    const origLength = base128(buf, st);
    const transformed = tag === "glyf" || tag === "loca" ? version !== 3 : version !== 0;
    const length = transformed ? base128(buf, st) : origLength;
    dir.push({ tag, length, transformed });
  }
  const data = brotliDecompressSync(buf.subarray(st.p, st.p + compressedSize));
  const tables = new Map<string, Buffer>();
  let woff2Glyf: Buffer | null = null;
  let woff2Hmtx: Buffer | null = null;
  let off = 0;
  for (const e of dir) {
    const slice = Buffer.from(data.subarray(off, off + e.length));
    off += e.length;
    if (e.tag === "glyf" && e.transformed) woff2Glyf = slice;
    else if (e.tag === "hmtx" && e.transformed) woff2Hmtx = slice;
    else if (e.tag === "loca" && e.transformed) continue;
    else tables.set(e.tag, slice);
  }
  return { tables, woff2Glyf, woff2Hmtx };
}

function readWoff1(buf: Buffer): RawTables {
  const numTables = buf.readUInt16BE(12);
  const tables = new Map<string, Buffer>();
  for (let i = 0; i < numTables; i++) {
    const e = 44 + i * 20;
    const tag = buf.toString("latin1", e, e + 4);
    const offset = buf.readUInt32BE(e + 4);
    const compLength = buf.readUInt32BE(e + 8);
    const origLength = buf.readUInt32BE(e + 12);
    const raw = buf.subarray(offset, offset + compLength);
    tables.set(tag, compLength < origLength ? inflateSync(raw) : Buffer.from(raw));
  }
  return { tables, woff2Glyf: null, woff2Hmtx: null };
}

function readSfnt(buf: Buffer): RawTables {
  const numTables = buf.readUInt16BE(4);
  const tables = new Map<string, Buffer>();
  for (let i = 0; i < numTables; i++) {
    const e = 12 + i * 16;
    const tag = buf.toString("latin1", e, e + 4);
    tables.set(tag, Buffer.from(buf.subarray(buf.readUInt32BE(e + 8), buf.readUInt32BE(e + 8) + buf.readUInt32BE(e + 12))));
  }
  return { tables, woff2Glyf: null, woff2Hmtx: null };
}

/* ------------------------------------------------------------------ */
/* glyphs                                                              */
/* ------------------------------------------------------------------ */

const F2DOT14 = (v: number) => v / 16384;

/** Reads composite records starting at `p`; returns the components, the end offset and whether instructions follow. */
function readComponents(b: Buffer, p: number): { components: Component[]; end: number; instructions: boolean } {
  const components: Component[] = [];
  let instructions = false;
  for (;;) {
    const flags = b.readUInt16BE(p);
    const gid = b.readUInt16BE(p + 2);
    p += 4;
    let a1: number;
    let a2: number;
    if (flags & 0x0001) {
      a1 = b.readInt16BE(p);
      a2 = b.readInt16BE(p + 2);
      p += 4;
    } else {
      a1 = b.readInt8(p);
      a2 = b.readInt8(p + 1);
      p += 2;
    }
    let m: [number, number, number, number] = [1, 0, 0, 1];
    if (flags & 0x0008) {
      const s = F2DOT14(b.readInt16BE(p));
      m = [s, 0, 0, s];
      p += 2;
    } else if (flags & 0x0040) {
      m = [F2DOT14(b.readInt16BE(p)), 0, 0, F2DOT14(b.readInt16BE(p + 2))];
      p += 4;
    } else if (flags & 0x0080) {
      m = [F2DOT14(b.readInt16BE(p)), F2DOT14(b.readInt16BE(p + 2)), F2DOT14(b.readInt16BE(p + 4)), F2DOT14(b.readInt16BE(p + 6))];
      p += 8;
    }
    // point-matching anchors (ARGS_ARE_XY_VALUES unset) do not occur in the shipped faces: placed at the origin
    const xy = (flags & 0x0002) !== 0;
    components.push({ gid, dx: xy ? a1 : 0, dy: xy ? a2 : 0, m });
    if (flags & 0x0100) instructions = true;
    if (!(flags & 0x0020)) break;
  }
  return { components, end: p, instructions };
}

function readGlyfEntry(b: Buffer): Glyph {
  if (b.length === 0) return { kind: "empty" };
  const n = b.readInt16BE(0);
  if (n < 0) return { kind: "composite", components: readComponents(b, 10).components };
  const endPts: number[] = [];
  for (let i = 0; i < n; i++) endPts.push(b.readUInt16BE(10 + i * 2));
  let p = 10 + n * 2;
  const insLen = b.readUInt16BE(p);
  p += 2 + insLen;
  const count = n ? endPts[n - 1]! + 1 : 0;
  const flags: number[] = [];
  while (flags.length < count) {
    const f = b[p++]!;
    flags.push(f);
    if (f & 0x08) {
      const r = b[p++]!;
      for (let i = 0; i < r; i++) flags.push(f);
    }
  }
  const xs: number[] = [];
  let v = 0;
  for (const f of flags) {
    if (f & 0x02) {
      const d = b[p++]!;
      v += f & 0x10 ? d : -d;
    } else if (!(f & 0x10)) {
      v += b.readInt16BE(p);
      p += 2;
    }
    xs.push(v);
  }
  const ys: number[] = [];
  v = 0;
  for (const f of flags) {
    if (f & 0x04) {
      const d = b[p++]!;
      v += f & 0x20 ? d : -d;
    } else if (!(f & 0x20)) {
      v += b.readInt16BE(p);
      p += 2;
    }
    ys.push(v);
  }
  const contours: Pt[][] = [];
  let start = 0;
  for (const e of endPts) {
    const c: Pt[] = [];
    for (let i = start; i <= e; i++) c.push({ x: xs[i]!, y: ys[i]!, on: (flags[i]! & 1) !== 0 });
    contours.push(c);
    start = e + 1;
  }
  return { kind: "simple", contours };
}

function read255(b: Buffer, st: { p: number }): number {
  const code = b[st.p++]!;
  if (code === 253) {
    const v = b.readUInt16BE(st.p);
    st.p += 2;
    return v;
  }
  if (code === 255) return b[st.p++]! + 253;
  if (code === 254) return b[st.p++]! + 506;
  return code;
}

/** W3C WOFF2 §5.1-5.3: the transformed glyf table (version 0) decoded into glyphs. */
function decodeWoff2Glyf(t: Buffer): Glyph[] {
  const numGlyphs = t.readUInt16BE(4);
  const sizes = [0, 1, 2, 3, 4, 5, 6].map((i) => t.readUInt32BE(8 + i * 4));
  let off = 36;
  const stream = (size: number) => {
    const s = t.subarray(off, off + size);
    off += size;
    return s;
  };
  const nContour = stream(sizes[0]!);
  const nPoints = stream(sizes[1]!);
  const flagS = stream(sizes[2]!);
  const glyphS = stream(sizes[3]!);
  const compS = stream(sizes[4]!);
  // the bbox and instruction streams follow; outlines need neither (boxes are recomputed from the points)
  const st = { np: { p: 0 }, fl: 0, gl: { p: 0 }, cp: 0 };
  const out: Glyph[] = [];
  for (let g = 0; g < numGlyphs; g++) {
    const nc = nContour.readInt16BE(g * 2);
    if (nc === 0) {
      out.push({ kind: "empty" });
      continue;
    }
    if (nc < 0) {
      const r = readComponents(compS, st.cp);
      st.cp = r.end;
      if (r.instructions) read255(glyphS, st.gl);
      out.push({ kind: "composite", components: r.components });
      continue;
    }
    const counts: number[] = [];
    for (let i = 0; i < nc; i++) counts.push(read255(nPoints, st.np));
    const contours: Pt[][] = [];
    let x = 0;
    let y = 0;
    for (const n of counts) {
      const c: Pt[] = [];
      for (let i = 0; i < n; i++) {
        const raw = flagS[st.fl++]!;
        const on = !(raw >> 7);
        const f = raw & 0x7f;
        const p = st.gl.p;
        const at = (k: number) => glyphS[p + k]!;
        const sign = (fl: number, v: number) => (fl & 1 ? v : -v);
        let dx: number;
        let dy: number;
        let nb: number;
        if (f < 10) {
          dx = 0;
          dy = sign(f, ((f & 14) << 7) + at(0));
          nb = 1;
        } else if (f < 20) {
          dx = sign(f, (((f - 10) & 14) << 7) + at(0));
          dy = 0;
          nb = 1;
        } else if (f < 84) {
          const b0 = f - 20;
          const b1 = at(0);
          dx = sign(f, 1 + (b0 & 0x30) + (b1 >> 4));
          dy = sign(f >> 1, 1 + ((b0 & 0x0c) << 2) + (b1 & 0x0f));
          nb = 1;
        } else if (f < 120) {
          const b0 = f - 84;
          dx = sign(f, 1 + (Math.floor(b0 / 12) << 8) + at(0));
          dy = sign(f >> 1, 1 + (((b0 % 12) >> 2) << 8) + at(1));
          nb = 2;
        } else if (f < 124) {
          const b2 = at(1);
          dx = sign(f, (at(0) << 4) + (b2 >> 4));
          dy = sign(f >> 1, ((b2 & 0x0f) << 8) + at(2));
          nb = 3;
        } else {
          dx = sign(f, (at(0) << 8) + at(1));
          dy = sign(f >> 1, (at(2) << 8) + at(3));
          nb = 4;
        }
        st.gl.p += nb;
        x += dx;
        y += dy;
        c.push({ x, y, on });
      }
      contours.push(c);
    }
    read255(glyphS, st.gl); // instruction length (the bytes live in the instruction stream)
    out.push({ kind: "simple", contours });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* the font                                                            */
/* ------------------------------------------------------------------ */

export type ArabicForm = "isol" | "init" | "medi" | "fina";

export class Font {
  readonly upem: number;
  readonly numGlyphs: number;
  readonly axes: Axis[];
  /** how the last `shapeArabic` call reached the positional forms */
  formSource: "presentation-forms" | "gsub" | "isolated" = "isolated";
  private glyphs: Glyph[];
  private advances: number[];
  private cmapTable: Map<number, number>;
  private tables: Map<string, Buffer>;
  private avar: { from: number; to: number }[][] | null = null;
  private gvarCache = new Map<number, ReturnType<Font["gvarTuples"]>>();

  constructor(raw: RawTables) {
    this.tables = raw.tables;
    const head = this.table("head");
    this.upem = head.readUInt16BE(18);
    const locFormat = head.readInt16BE(50);
    this.numGlyphs = this.table("maxp").readUInt16BE(4);
    if (!raw.woff2Glyf && !this.tables.has("glyf")) throw new Error("only TrueType (glyf) outlines are read");
    this.glyphs = raw.woff2Glyf ? decodeWoff2Glyf(raw.woff2Glyf) : this.readGlyf(locFormat);
    this.advances = this.readAdvances(raw.woff2Hmtx);
    this.cmapTable = this.readCmap();
    this.axes = this.readFvar();
    this.readAvar();
  }

  static open(path: string): Font {
    const buf = readFileSync(path);
    const sig = buf.readUInt32BE(0);
    if (sig === 0x774f4632) return new Font(readWoff2(buf));
    if (sig === 0x774f4646) return new Font(readWoff1(buf));
    return new Font(readSfnt(buf));
  }

  private table(tag: string): Buffer {
    const t = this.tables.get(tag);
    if (!t) throw new Error(`missing table ${tag}`);
    return t;
  }

  private readGlyf(locFormat: number): Glyph[] {
    const loca = this.table("loca");
    const glyf = this.table("glyf");
    const at = (i: number) => (locFormat === 0 ? loca.readUInt16BE(i * 2) * 2 : loca.readUInt32BE(i * 4));
    const out: Glyph[] = [];
    for (let g = 0; g < this.numGlyphs; g++) out.push(readGlyfEntry(glyf.subarray(at(g), at(g + 1))));
    return out;
  }

  private readAdvances(transformed: Buffer | null): number[] {
    const nh = this.table("hhea").readUInt16BE(34);
    const out: number[] = [];
    if (transformed) for (let i = 0; i < nh; i++) out.push(transformed.readUInt16BE(1 + i * 2));
    else {
      const hmtx = this.table("hmtx");
      for (let i = 0; i < nh; i++) out.push(hmtx.readUInt16BE(i * 4));
    }
    while (out.length < this.numGlyphs) out.push(out[out.length - 1] ?? 0);
    return out;
  }

  private readCmap(): Map<number, number> {
    const cmap = this.table("cmap");
    const count = cmap.readUInt16BE(2);
    let best = -1;
    let rank = -1;
    for (let i = 0; i < count; i++) {
      const pid = cmap.readUInt16BE(4 + i * 8);
      const eid = cmap.readUInt16BE(6 + i * 8);
      const off = cmap.readUInt32BE(8 + i * 8);
      const fmt = cmap.readUInt16BE(off);
      let r = -1;
      if (fmt === 12 && ((pid === 3 && eid === 10) || pid === 0)) r = 3;
      else if (fmt === 4 && pid === 3 && eid === 1) r = 2;
      else if (fmt === 4 && pid === 0) r = 1;
      if (r > rank) {
        rank = r;
        best = off;
      }
    }
    const map = new Map<number, number>();
    if (best < 0) return map;
    const fmt = cmap.readUInt16BE(best);
    if (fmt === 4) {
      const segX2 = cmap.readUInt16BE(best + 6);
      const ends = best + 14;
      const starts = ends + segX2 + 2;
      const deltas = starts + segX2;
      const ranges = deltas + segX2;
      for (let s = 0; s < segX2 / 2; s++) {
        const end = cmap.readUInt16BE(ends + s * 2);
        const start = cmap.readUInt16BE(starts + s * 2);
        const delta = cmap.readInt16BE(deltas + s * 2);
        const ro = cmap.readUInt16BE(ranges + s * 2);
        for (let c = start; c <= end && c !== 0xffff; c++) {
          let g: number;
          if (ro === 0) g = (c + delta) & 0xffff;
          else {
            const gi = cmap.readUInt16BE(ranges + s * 2 + ro + (c - start) * 2);
            g = gi === 0 ? 0 : (gi + delta) & 0xffff;
          }
          if (g) map.set(c, g);
        }
      }
    } else {
      const n = cmap.readUInt32BE(best + 12);
      for (let i = 0; i < n; i++) {
        const r = best + 16 + i * 12;
        const s = cmap.readUInt32BE(r);
        const e = cmap.readUInt32BE(r + 4);
        const g = cmap.readUInt32BE(r + 8);
        for (let c = s; c <= e; c++) map.set(c, g + (c - s));
      }
    }
    return map;
  }

  private readFvar(): Axis[] {
    const t = this.tables.get("fvar");
    if (!t) return [];
    const offset = t.readUInt16BE(4);
    const count = t.readUInt16BE(8);
    const size = t.readUInt16BE(10);
    const out: Axis[] = [];
    for (let i = 0; i < count; i++) {
      const r = offset + i * size;
      out.push({ tag: t.toString("latin1", r, r + 4), min: t.readInt32BE(r + 4) / 65536, def: t.readInt32BE(r + 8) / 65536, max: t.readInt32BE(r + 12) / 65536 });
    }
    return out;
  }

  private readAvar() {
    const t = this.tables.get("avar");
    if (!t) return;
    const count = t.readUInt16BE(6);
    let p = 8;
    const maps: { from: number; to: number }[][] = [];
    for (let i = 0; i < count; i++) {
      const n = t.readUInt16BE(p);
      p += 2;
      const m: { from: number; to: number }[] = [];
      for (let k = 0; k < n; k++) {
        m.push({ from: F2DOT14(t.readInt16BE(p)), to: F2DOT14(t.readInt16BE(p + 2)) });
        p += 4;
      }
      maps.push(m);
    }
    this.avar = maps;
  }

  /** The box a `glyf` glyph header stores (untransformed tables only: WOFF 1.0, TrueType), or null. */
  storedBox(gid: number): [number, number, number, number] | null {
    const glyf = this.tables.get("glyf");
    const loca = this.tables.get("loca");
    if (!glyf || !loca) return null;
    const long = this.table("head").readInt16BE(50) === 1;
    const at = (i: number) => (long ? loca.readUInt32BE(i * 4) : loca.readUInt16BE(i * 2) * 2);
    if (at(gid + 1) <= at(gid)) return null;
    const p = at(gid);
    return [glyf.readInt16BE(p + 2), glyf.readInt16BE(p + 4), glyf.readInt16BE(p + 6), glyf.readInt16BE(p + 8)];
  }

  /** Glyph id of a code point (0 = .notdef). */
  gid(cp: number): number {
    return this.cmapTable.get(cp) ?? 0;
  }
  hasChar(cp: number): boolean {
    return this.cmapTable.has(cp);
  }

  /** Normalised coordinates for user-space axis values (unknown axes ignored, missing axes at their default). */
  normalise(user: Readonly<Record<string, number>>): number[] {
    return this.axes.map((a, i) => {
      const v = Math.min(a.max, Math.max(a.min, user[a.tag] ?? a.def));
      let n = v < a.def ? -(a.def - v) / (a.def - a.min || 1) : v > a.def ? (v - a.def) / (a.max - a.def || 1) : 0;
      const m = this.avar?.[i];
      if (m && m.length >= 2) {
        for (let k = 1; k < m.length; k++) {
          const lo = m[k - 1]!;
          const hi = m[k]!;
          if (n <= hi.from) {
            n = hi.from === lo.from ? lo.to : lo.to + ((n - lo.from) * (hi.to - lo.to)) / (hi.from - lo.from);
            break;
          }
        }
      }
      return Math.min(1, Math.max(-1, n));
    });
  }

  /** The glyph's outline at normalised `coords` (composites resolved), with its varied advance. */
  outline(gid: number, coords: readonly number[] = []): Outline {
    return this.resolve(gid, coords, 0);
  }

  private resolve(gid: number, coords: readonly number[], depth: number): Outline {
    const g = this.glyphs[gid];
    const adv0 = this.advances[gid] ?? 0;
    if (!g || g.kind === "empty" || depth > 8) {
      const d = this.deltas(gid, 0, [], coords);
      return { contours: [], advance: adv0 + (d ? d.x[1]! - d.x[0]! : 0) };
    }
    if (g.kind === "simple") {
      const flat = g.contours.flat();
      const ends: number[] = [];
      let n = 0;
      for (const c of g.contours) ends.push((n += c.length) - 1);
      const d = this.deltas(gid, flat.length, ends, coords, flat);
      if (!d) return { contours: g.contours, advance: adv0 };
      const contours: Pt[][] = [];
      let k = 0;
      for (const c of g.contours) {
        const out: Pt[] = [];
        for (const p of c) {
          out.push({ x: p.x + d.x[k]!, y: p.y + d.y[k]!, on: p.on });
          k++;
        }
        contours.push(out);
      }
      return { contours, advance: adv0 + d.x[flat.length + 1]! - d.x[flat.length]! };
    }
    const d = this.deltas(gid, g.components.length, [], coords);
    const contours: Pt[][] = [];
    g.components.forEach((c, i) => {
      const sub = this.resolve(c.gid, coords, depth + 1);
      const dx = c.dx + (d ? d.x[i]! : 0);
      const dy = c.dy + (d ? d.y[i]! : 0);
      for (const ct of sub.contours) contours.push(ct.map((p) => ({ x: c.m[0] * p.x + c.m[2] * p.y + dx, y: c.m[1] * p.x + c.m[3] * p.y + dy, on: p.on })));
    });
    const n = g.components.length;
    return { contours, advance: adv0 + (d ? d.x[n + 1]! - d.x[n]! : 0) };
  }

  /* ---- gvar ---------------------------------------------------------- */

  private gvarTuples(gid: number) {
    const t = this.tables.get("gvar");
    if (!t) return null;
    const axisCount = t.readUInt16BE(4);
    const sharedCount = t.readUInt16BE(6);
    const sharedOff = t.readUInt32BE(8);
    const glyphCount = t.readUInt16BE(12);
    const flags = t.readUInt16BE(14);
    const dataOff = t.readUInt32BE(16);
    if (gid >= glyphCount) return null;
    const long = (flags & 1) !== 0;
    const at = (i: number) => (long ? t.readUInt32BE(20 + i * 4) : t.readUInt16BE(20 + i * 2) * 2);
    const start = dataOff + at(gid);
    const end = dataOff + at(gid + 1);
    if (end <= start) return null;
    const shared: number[][] = [];
    for (let i = 0; i < sharedCount; i++) {
      const tup: number[] = [];
      for (let a = 0; a < axisCount; a++) tup.push(F2DOT14(t.readInt16BE(sharedOff + (i * axisCount + a) * 2)));
      shared.push(tup);
    }
    const countRaw = t.readUInt16BE(start);
    const count = countRaw & 0x0fff;
    const sharedPoints = (countRaw & 0x8000) !== 0;
    let ser = start + t.readUInt16BE(start + 2);
    let hp = start + 4;
    const headers: { size: number; peak: number[]; lo: number[] | null; hi: number[] | null; privatePoints: boolean }[] = [];
    for (let i = 0; i < count; i++) {
      const size = t.readUInt16BE(hp);
      const idx = t.readUInt16BE(hp + 2);
      hp += 4;
      let peak: number[];
      if (idx & 0x8000) {
        peak = [];
        for (let a = 0; a < axisCount; a++) peak.push(F2DOT14(t.readInt16BE(hp + a * 2)));
        hp += axisCount * 2;
      } else peak = shared[idx & 0x0fff] ?? [];
      let lo: number[] | null = null;
      let hi: number[] | null = null;
      if (idx & 0x4000) {
        lo = [];
        hi = [];
        for (let a = 0; a < axisCount; a++) lo.push(F2DOT14(t.readInt16BE(hp + a * 2)));
        hp += axisCount * 2;
        for (let a = 0; a < axisCount; a++) hi.push(F2DOT14(t.readInt16BE(hp + a * 2)));
        hp += axisCount * 2;
      }
      headers.push({ size, peak, lo, hi, privatePoints: (idx & 0x2000) !== 0 });
    }
    const readPoints = (p: { p: number }): number[] | null => {
      let n = t[p.p++]!;
      if (n & 0x80) n = ((n & 0x7f) << 8) | t[p.p++]!;
      if (n === 0) return null;
      const out: number[] = [];
      let last = 0;
      while (out.length < n) {
        const ctl = t[p.p++]!;
        const words = (ctl & 0x80) !== 0;
        const run = (ctl & 0x7f) + 1;
        for (let i = 0; i < run && out.length < n; i++) {
          last += words ? t.readUInt16BE((p.p += 2) - 2) : t[p.p++]!;
          out.push(last);
        }
      }
      return out;
    };
    const readDeltas = (p: { p: number }, n: number): number[] => {
      const out: number[] = [];
      while (out.length < n) {
        const ctl = t[p.p++]!;
        const run = (ctl & 0x3f) + 1;
        for (let i = 0; i < run && out.length < n; i++) {
          if (ctl & 0x80) out.push(0);
          else if (ctl & 0x40) {
            out.push(t.readInt16BE(p.p));
            p.p += 2;
          } else out.push(t.readInt8(p.p++));
        }
      }
      return out;
    };
    const sp = { p: ser };
    const sharedPts = sharedPoints ? readPoints(sp) : null;
    ser = sp.p;
    return { headers, sharedPts, ser, readPoints, readDeltas };
  }

  /**
   * Summed deltas of `n` points + 4 phantom points at `coords` (IUP for the points a tuple leaves out of a simple
   * glyph), or null when the glyph has no variation data.
   */
  private deltas(gid: number, n: number, ends: number[], coords: readonly number[], orig?: Pt[]): { x: number[]; y: number[] } | null {
    if (!coords.length || coords.every((c) => c === 0)) return null;
    let v = this.gvarCache.get(gid);
    if (v === undefined) {
      v = this.gvarTuples(gid);
      this.gvarCache.set(gid, v);
    }
    if (!v) return null;
    const total = n + 4;
    const x = new Array<number>(total).fill(0);
    const y = new Array<number>(total).fill(0);
    let ser = v.ser;
    for (const h of v.headers) {
      const here = ser;
      ser += h.size;
      let scalar = 1;
      for (let a = 0; a < coords.length; a++) {
        const peak = h.peak[a] ?? 0;
        if (peak === 0) continue;
        const c = coords[a]!;
        if (c === peak) continue;
        const lo = h.lo ? h.lo[a]! : Math.min(0, peak);
        const hi = h.hi ? h.hi[a]! : Math.max(0, peak);
        if (c <= lo || c >= hi) {
          scalar = 0;
          break;
        }
        scalar *= c < peak ? (c - lo) / (peak - lo) : (c - hi) / (peak - hi);
      }
      if (scalar === 0) continue;
      const p = { p: here };
      const pts = h.privatePoints ? v.readPoints(p) : v.sharedPts;
      const count = pts ? pts.length : total;
      const dx = v.readDeltas(p, count);
      const dy = v.readDeltas(p, count);
      if (!pts) {
        for (let i = 0; i < total; i++) {
          x[i]! += dx[i]! * scalar;
          y[i]! += dy[i]! * scalar;
        }
        continue;
      }
      const tx = new Array<number | null>(total).fill(null);
      const ty = new Array<number | null>(total).fill(null);
      pts.forEach((pi, k) => {
        if (pi < total) {
          tx[pi] = dx[k]!;
          ty[pi] = dy[k]!;
        }
      });
      if (orig && ends.length) iup(orig, ends, tx, ty);
      for (let i = 0; i < total; i++) {
        x[i]! += (tx[i] ?? 0) * scalar;
        y[i]! += (ty[i] ?? 0) * scalar;
      }
    }
    return { x, y };
  }

  /* ---- GSUB ---------------------------------------------------------- */

  private gsubLookups(features: readonly string[]): { type: number; at: number }[][] {
    const t = this.tables.get("GSUB");
    if (!t) return features.map(() => []);
    const scriptList = t.readUInt16BE(4);
    const featureList = t.readUInt16BE(6);
    const lookupList = t.readUInt16BE(8);
    // the arab script's default language system, else DFLT's
    let langSys = -1;
    const sc = t.readUInt16BE(scriptList);
    for (const want of ["arab", "DFLT"]) {
      for (let i = 0; i < sc && langSys < 0; i++) {
        const r = scriptList + 2 + i * 6;
        if (t.toString("latin1", r, r + 4) !== want) continue;
        const script = scriptList + t.readUInt16BE(r + 4);
        const def = t.readUInt16BE(script);
        if (def) langSys = script + def;
      }
      if (langSys >= 0) break;
    }
    if (langSys < 0) return features.map(() => []);
    const fIdx: number[] = [];
    const fc = t.readUInt16BE(langSys + 4);
    for (let i = 0; i < fc; i++) fIdx.push(t.readUInt16BE(langSys + 6 + i * 2));
    const lookup = (li: number): { type: number; at: number }[] => {
      const l = lookupList + t.readUInt16BE(lookupList + 2 + li * 2);
      const type = t.readUInt16BE(l);
      const subs: { type: number; at: number }[] = [];
      const n = t.readUInt16BE(l + 4);
      for (let s = 0; s < n; s++) {
        let at = l + t.readUInt16BE(l + 6 + s * 2);
        let ty = type;
        // an extension subtable (type 7) points at a subtable of its real type
        if (ty === 7) {
          ty = t.readUInt16BE(at + 2);
          at = at + t.readUInt32BE(at + 4);
        }
        subs.push({ type: ty, at });
      }
      return subs;
    };
    return features.map((tag) => {
      const out: { type: number; at: number }[] = [];
      for (const fi of fIdx) {
        const r = featureList + 2 + fi * 6;
        if (t.toString("latin1", r, r + 4) !== tag) continue;
        const f = featureList + t.readUInt16BE(r + 4);
        const lc = t.readUInt16BE(f + 2);
        for (let k = 0; k < lc; k++) out.push(...lookup(t.readUInt16BE(f + 4 + k * 2)));
      }
      return out;
    });
  }

  private coverage(at: number, gid: number): number {
    const t = this.tables.get("GSUB")!;
    const fmt = t.readUInt16BE(at);
    if (fmt === 1) {
      const n = t.readUInt16BE(at + 2);
      for (let i = 0; i < n; i++) if (t.readUInt16BE(at + 4 + i * 2) === gid) return i;
      return -1;
    }
    const n = t.readUInt16BE(at + 2);
    for (let i = 0; i < n; i++) {
      const r = at + 4 + i * 6;
      const s = t.readUInt16BE(r);
      const e = t.readUInt16BE(r + 2);
      if (gid >= s && gid <= e) return t.readUInt16BE(r + 4) + gid - s;
    }
    return -1;
  }

  /** One single substitution (type 1) through the subtables; the glyph unchanged when none applies. */
  private single(subs: readonly { type: number; at: number }[], gid: number): number {
    const t = this.tables.get("GSUB")!;
    let g = gid;
    for (const s of subs) {
      if (s.type !== 1) continue;
      const ci = this.coverage(s.at + t.readUInt16BE(s.at + 2), g);
      if (ci < 0) continue;
      g = t.readUInt16BE(s.at) === 1 ? (g + t.readInt16BE(s.at + 4)) & 0xffff : t.readUInt16BE(s.at + 6 + ci * 2);
      break;
    }
    return g;
  }

  /** Ligature substitutions (type 4) over a glyph run. */
  private ligatures(subs: readonly { type: number; at: number }[], run: number[]): number[] {
    const t = this.tables.get("GSUB")!;
    const out = [...run];
    for (const s of subs) {
      if (s.type !== 4) continue;
      for (let i = 0; i < out.length; i++) {
        const ci = this.coverage(s.at + t.readUInt16BE(s.at + 2), out[i]!);
        if (ci < 0) continue;
        const set = s.at + t.readUInt16BE(s.at + 6 + ci * 2);
        const nl = t.readUInt16BE(set);
        for (let k = 0; k < nl; k++) {
          const lig = set + t.readUInt16BE(set + 2 + k * 2);
          const glyph = t.readUInt16BE(lig);
          const comp = t.readUInt16BE(lig + 2);
          let match = i + comp <= out.length;
          for (let c = 1; c < comp && match; c++) if (out[i + c] !== t.readUInt16BE(lig + 4 + (c - 1) * 2)) match = false;
          if (match) {
            out.splice(i, comp, glyph);
            break;
          }
        }
      }
    }
    return out;
  }

  /**
   * The glyphs of an Arabic word in logical order with their positional forms: Presentation Forms-B code points when
   * the cmap maps every letter's form, else the GSUB `isol/init/medi/fina` single substitutions and the `rlig`
   * ligatures (lam-alef), else the isolated base glyphs (`formSource` says which).
   */
  shapeArabic(text: string): number[] {
    const chars = [...text].map((ch) => ch.codePointAt(0)!);
    const forms = arabicForms(chars);
    const pf = chars.map((cp, i) => presentationForm(cp, forms[i]!));
    if (pf.every((p, i) => p === null || this.hasChar(p) || !isArabicLetter(chars[i]!))) {
      this.formSource = "presentation-forms";
      const glyphs = chars.map((cp, i) => this.gid(pf[i] ?? cp));
      return this.lamAlefPf(chars, forms, glyphs);
    }
    const [isol, init, medi, fina, rlig] = this.gsubLookups(["isol", "init", "medi", "fina", "rlig"]);
    const byForm: Record<ArabicForm, readonly { type: number; at: number }[]> = { isol: isol!, init: init!, medi: medi!, fina: fina! };
    if (!init!.some((s) => s.type === 1) || !fina!.some((s) => s.type === 1)) {
      this.formSource = "isolated";
      return chars.map((cp) => this.gid(cp));
    }
    this.formSource = "gsub";
    const run = chars.map((cp, i) => (isArabicLetter(cp) ? this.single(byForm[forms[i]!], this.gid(cp)) : this.gid(cp)));
    return this.ligatures(rlig!, run);
  }

  /** Presentation forms: lam followed by an alef becomes the lam-alef ligature code point when the font maps it. */
  private lamAlefPf(chars: number[], forms: ArabicForm[], glyphs: number[]): number[] {
    const out: number[] = [];
    for (let i = 0; i < chars.length; i++) {
      const lig = chars[i] === 0x0644 ? LAM_ALEF[chars[i + 1] ?? 0] : undefined;
      if (lig !== undefined) {
        const cp = lig + (forms[i] === "medi" || forms[i] === "fina" ? 1 : 0);
        if (this.hasChar(cp)) {
          out.push(this.gid(cp));
          i++;
          continue;
        }
      }
      out.push(glyphs[i]!);
    }
    return out;
  }
}

/* ------------------------------------------------------------------ */
/* Arabic joining                                                      */
/* ------------------------------------------------------------------ */

/** Right-joining letters (join only to the previous letter); every other Arabic letter here is dual-joining. */
const RIGHT_JOINING = new Set([0x0622, 0x0623, 0x0624, 0x0625, 0x0627, 0x0629, 0x062f, 0x0630, 0x0631, 0x0632, 0x0648, 0x0671]);
const NON_JOINING = new Set([0x0621]);
const isArabicLetter = (cp: number) => cp >= 0x0620 && cp <= 0x064a;
const joinType = (cp: number): "D" | "R" | "U" => (!isArabicLetter(cp) || NON_JOINING.has(cp) ? "U" : RIGHT_JOINING.has(cp) ? "R" : "D");

export function arabicForms(chars: readonly number[]): ArabicForm[] {
  return chars.map((cp, i) => {
    const t = joinType(cp);
    if (t === "U") return "isol";
    const prev = i > 0 ? joinType(chars[i - 1]!) : "U";
    const next = i + 1 < chars.length ? joinType(chars[i + 1]!) : "U";
    const joinsPrev = prev === "D";
    const joinsNext = t === "D" && next !== "U";
    return joinsPrev && joinsNext ? "medi" : joinsPrev ? "fina" : joinsNext ? "init" : "isol";
  });
}

/** Presentation Forms-B: first code point (isolated) and form count per letter (order isol, fina, init, medi). */
const PF_B: Readonly<Record<number, readonly [number, number]>> = {
  0x0621: [0xfe80, 1], 0x0622: [0xfe81, 2], 0x0623: [0xfe83, 2], 0x0624: [0xfe85, 2], 0x0625: [0xfe87, 2], 0x0626: [0xfe89, 4],
  0x0627: [0xfe8d, 2], 0x0628: [0xfe8f, 4], 0x0629: [0xfe93, 2], 0x062a: [0xfe95, 4], 0x062b: [0xfe99, 4], 0x062c: [0xfe9d, 4],
  0x062d: [0xfea1, 4], 0x062e: [0xfea5, 4], 0x062f: [0xfea9, 2], 0x0630: [0xfeab, 2], 0x0631: [0xfead, 2], 0x0632: [0xfeaf, 2],
  0x0633: [0xfeb1, 4], 0x0634: [0xfeb5, 4], 0x0635: [0xfeb9, 4], 0x0636: [0xfebd, 4], 0x0637: [0xfec1, 4], 0x0638: [0xfec5, 4],
  0x0639: [0xfec9, 4], 0x063a: [0xfecd, 4], 0x0641: [0xfed1, 4], 0x0642: [0xfed5, 4], 0x0643: [0xfed9, 4], 0x0644: [0xfedd, 4],
  0x0645: [0xfee1, 4], 0x0646: [0xfee5, 4], 0x0647: [0xfee9, 4], 0x0648: [0xfeed, 2], 0x0649: [0xfeef, 2], 0x064a: [0xfef1, 4],
};
/** lam + alef ligatures (isolated; +1 = final), keyed by the alef. */
const LAM_ALEF: Readonly<Record<number, number>> = { 0x0622: 0xfef5, 0x0623: 0xfef7, 0x0625: 0xfef9, 0x0627: 0xfefb };
const FORM_INDEX: Record<ArabicForm, number> = { isol: 0, fina: 1, init: 2, medi: 3 };

/** The Presentation Forms-B code point of a letter in a form, or null when the letter has none. */
export function presentationForm(cp: number, form: ArabicForm): number | null {
  const e = PF_B[cp];
  if (!e) return null;
  // a two-form letter has no initial / medial form: it shows its isolated / final shape
  const i = e[1] === 2 ? (form === "medi" || form === "fina" ? 1 : 0) : e[1] === 1 ? 0 : FORM_INDEX[form];
  return e[0] + i;
}

/* ------------------------------------------------------------------ */
/* IUP (gvar: points a tuple leaves out are interpolated)              */
/* ------------------------------------------------------------------ */

function iup(orig: Pt[], ends: number[], tx: (number | null)[], ty: (number | null)[]) {
  let start = 0;
  for (const end of ends) {
    for (const [d, axis] of [
      [tx, "x"],
      [ty, "y"],
    ] as const) {
      const touched: number[] = [];
      for (let i = start; i <= end; i++) if (d[i] !== null) touched.push(i);
      if (touched.length === 0) {
        for (let i = start; i <= end; i++) d[i] = 0;
        continue;
      }
      if (touched.length === 1) {
        for (let i = start; i <= end; i++) d[i] = d[touched[0]!]!;
        continue;
      }
      for (let k = 0; k < touched.length; k++) {
        const a = touched[k]!;
        const b = touched[(k + 1) % touched.length]!;
        const n = end - start + 1;
        for (let j = (a - start + 1) % n; ; j = (j + 1) % n) {
          const i = start + j;
          if (i === b) break;
          const ca = orig[a]![axis];
          const cb = orig[b]![axis];
          const da = d[a]!;
          const db = d[b]!;
          const c = orig[i]![axis];
          let v: number;
          if (ca === cb) v = da === db ? da : 0;
          else {
            const [x1, x2, d1, d2] = ca < cb ? [ca, cb, da, db] : [cb, ca, db, da];
            v = c <= x1 ? d1 : c >= x2 ? d2 : d1 + ((c - x1) * (d2 - d1)) / (x2 - x1);
          }
          d[i] = v;
        }
      }
    }
    start = end + 1;
  }
}

/* ------------------------------------------------------------------ */
/* geometry                                                            */
/* ------------------------------------------------------------------ */

/** TrueType quadratic contours flattened to polygons (8 segments per curve). */
export function flatten(contours: readonly Pt[][], dx = 0, dy = 0): [number, number][][] {
  const out: [number, number][][] = [];
  for (const c of contours) {
    if (c.length < 2) continue;
    // start on an on-curve point (or the midpoint of two off-curve points)
    let s = c.findIndex((p) => p.on);
    const pts: Pt[] = [];
    if (s < 0) {
      const a = c[0]!;
      const b = c[1]!;
      pts.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, on: true });
      s = 1;
      for (let i = 0; i < c.length; i++) pts.push(c[(s + i) % c.length]!);
    } else for (let i = 0; i < c.length; i++) pts.push(c[(s + i) % c.length]!);
    pts.push(pts[0]!);
    const poly: [number, number][] = [[pts[0]!.x + dx, pts[0]!.y + dy]];
    let cur = pts[0]!;
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i]!;
      if (p.on) {
        poly.push([p.x + dx, p.y + dy]);
        cur = p;
        continue;
      }
      const next = pts[i + 1] ?? pts[0]!;
      const end = next.on ? next : { x: (p.x + next.x) / 2, y: (p.y + next.y) / 2, on: true };
      for (let k = 1; k <= 8; k++) {
        const t = k / 8;
        const u = 1 - t;
        poly.push([u * u * cur.x + 2 * u * t * p.x + t * t * end.x + dx, u * u * cur.y + 2 * u * t * p.y + t * t * end.y + dy]);
      }
      cur = end;
      if (next.on) i++;
    }
    out.push(poly);
  }
  return out;
}

/** Ink area (nonzero winding, scanline integration over `rows` rows) and ink bbox of polygons. */
export function inkOf(polys: readonly [number, number][][], rows = 600): { area: number; bbox: [number, number, number, number] } {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of polys)
    for (const [x, y] of p) {
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  if (!(x1 > x0 && y1 > y0)) return { area: 0, bbox: [0, 0, 0, 0] };
  // edges sorted by their lower y; a row scans only the edges active at its y
  const edges: { ylo: number; yhi: number; ax: number; ay: number; k: number; w: number }[] = [];
  for (const p of polys) {
    for (let i = 0; i + 1 < p.length; i++) {
      const [ax, ay] = p[i]!;
      const [bx, by] = p[i + 1]!;
      if (ay === by) continue;
      edges.push({ ylo: Math.min(ay, by), yhi: Math.max(ay, by), ax, ay, k: (bx - ax) / (by - ay), w: by > ay ? 1 : -1 });
    }
  }
  edges.sort((a, b) => a.ylo - b.ylo);
  const dy = (y1 - y0) / rows;
  let area = 0;
  let next = 0;
  let active: typeof edges = [];
  const hits: { x: number; w: number }[] = [];
  for (let r = 0; r < rows; r++) {
    const y = y0 + (r + 0.5) * dy;
    while (next < edges.length && edges[next]!.ylo <= y) active.push(edges[next++]!);
    active = active.filter((e) => e.yhi > y);
    hits.length = 0;
    for (const e of active) if (e.ylo <= y) hits.push({ x: e.ax + (y - e.ay) * e.k, w: e.w });
    hits.sort((a, b) => a.x - b.x);
    let w = 0;
    for (let i = 0; i < hits.length; i++) {
      const prev = w;
      w += hits[i]!.w;
      if (prev !== 0 && i > 0) area += (hits[i]!.x - hits[i - 1]!.x) * dy;
    }
  }
  return { area, bbox: [x0, y0, x1, y1] };
}

/** A glyph run laid out left to right (pass an Arabic run reversed: its visual order). */
export function layout(font: Font, gids: readonly number[], coords: readonly number[]): [number, number][][] {
  const polys: [number, number][][] = [];
  let pen = 0;
  for (const g of gids) {
    const o = font.outline(g, coords);
    polys.push(...flatten(o.contours, pen, 0));
    pen += o.advance;
  }
  return polys;
}

/** Ink box of one glyph (font units, default location): [xMin, yMin, xMax, yMax] over its on- and off-curve points. */
export function glyphBox(font: Font, gid: number, coords: readonly number[] = []): [number, number, number, number] | null {
  const o = font.outline(gid, coords);
  const pts = o.contours.flat();
  if (!pts.length) return null;
  return [Math.min(...pts.map((p) => p.x)), Math.min(...pts.map((p) => p.y)), Math.max(...pts.map((p) => p.x)), Math.max(...pts.map((p) => p.y))];
}
