#!/usr/bin/env node
/**
 * sync-fonts — copies the curated landing-page fonts from @fontsource(-variable) into public/fonts
 * and generates src/lib/theme/fonts.generated.ts (typed font data: files per subset with their
 * unicode-range, weights, and vertical/horizontal metrics used for CLS-safe fallback faces).
 *
 *   node scripts/sync-fonts.mjs        (npm run fonts:sync)
 *
 * The manifest is the modern type palette of docs/DESIGN.md (v2): no handwriting, stencil or
 * calligraphic display families. Only .woff2 files are copied, and only the subsets the landing
 * pages need: latin + latin-ext everywhere, arabic when the family has it. Variable families ship one file per
 * subset (the "wght" instance, or "opsz" — which also carries wght — for the three serif/grotesque
 * families whose display character depends on optical sizing). Static families ship only the
 * weights actually used by the archetype pairings. Output is deterministic (no timestamps).
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { brotliDecompressSync } from "node:zlib";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const NM = join(ROOT, "node_modules");
const OUT_DIR = join(ROOT, "public", "fonts");
const OUT_TS = join(ROOT, "src", "lib", "theme", "fonts.generated.ts");

/**
 * Curated manifest. `axis` = which variable file family to ship ("wght" default; "opsz" files
 * contain wght + opsz so `font-optical-sizing:auto` gives Bodoni its hairlines at display sizes,
 * Bricolage its condensed display cut and Fraunces its soft display shapes).
 * `italic` = also ship italic files (only display serifs used for *italic emphasis*).
 */
const MANIFEST = [
  // Latin display & text
  { id: "bodoni-moda", variable: true, axis: "opsz", italic: true },
  { id: "fraunces", variable: true, axis: "opsz", italic: true },
  { id: "gloock", weights: [400] },
  { id: "young-serif", weights: [400] },
  { id: "instrument-serif", weights: [400], italic: true },
  { id: "bricolage-grotesque", variable: true, axis: "opsz" },
  { id: "big-shoulders-display", variable: true },
  { id: "archivo", variable: true },
  { id: "schibsted-grotesk", variable: true },
  { id: "hanken-grotesk", variable: true },
  { id: "instrument-sans", variable: true },
  { id: "figtree", variable: true },
  { id: "dm-sans", variable: true },
  // Latin accents (mono labels, captions, spec numbers)
  { id: "jetbrains-mono", variable: true },
  { id: "ibm-plex-mono", weights: [400, 500] },
  // Arabic display & text — modern geometric / kufi / modern naskh only (no calligraphic display faces)
  { id: "el-messiri", variable: true },
  { id: "reem-kufi", variable: true },
  { id: "lemonada", variable: true },
  { id: "marhey", variable: true },
  { id: "changa", variable: true },
  { id: "alexandria", variable: true },
  { id: "noto-kufi-arabic", variable: true },
  { id: "noto-naskh-arabic", variable: true },
  { id: "readex-pro", variable: true },
  { id: "baloo-bhaijaan-2", variable: true },
  { id: "ibm-plex-sans-arabic", weights: [400, 500, 700] },
  { id: "tajawal", weights: [400, 500, 700] },
  // DES-R21 (CCR r1-p6-1, P6 merge): the modern Arabic roster of F11
  { id: "cairo", variable: true },
  { id: "kufam", variable: true },
  { id: "vazirmatn", variable: true },
  // Latin, DES-R21 (CCR r1-p6-1, P6 merge): two display serifs, a display grotesk and a text grotesk
  { id: "cormorant-garamond", weights: [400, 500, 600], italic: true },
  { id: "dm-serif-display", weights: [400], italic: true },
  { id: "syne", variable: true },
  { id: "manrope", variable: true },
];

const SUBSETS = ["latin", "latin-ext", "arabic"];

/* ------------------------------------------------------------------ */
/* sfnt / woff2 metrics                                                */
/* ------------------------------------------------------------------ */

const WOFF2_TAGS = ["cmap", "head", "hhea", "hmtx", "maxp", "name", "OS/2", "post", "cvt ", "fpgm", "glyf", "loca", "prep", "CFF ", "VORG", "EBDT", "EBLC", "gasp", "hdmx", "kern", "LTSH", "PCLT", "VDMX", "vhea", "vmtx", "BASE", "GDEF", "GPOS", "GSUB", "EBSC", "JSTF", "MATH", "CBDT", "CBLC", "COLR", "CPAL", "SVG ", "sbix", "acnt", "avar", "bdat", "bloc", "bsln", "cvar", "fdsc", "feat", "fmtx", "fvar", "gvar", "hsty", "just", "lcar", "mort", "morx", "opbd", "prop", "trak", "Zapf", "Silf", "Glat", "Gloc", "Feat", "Sill"];

function readBase128(buf, st) {
  let acc = 0;
  for (let i = 0; i < 5; i++) {
    const b = buf[st.p++];
    if (i === 0 && b === 0x80) throw new Error("woff2: invalid UIntBase128");
    if (acc & 0xfe000000) throw new Error("woff2: UIntBase128 overflow");
    acc = (acc << 7) | (b & 0x7f);
    if (!(b & 0x80)) return acc >>> 0;
  }
  throw new Error("woff2: UIntBase128 too long");
}

/** Returns { tag: { data: Buffer, transformed: boolean } } for a WOFF2 file (single font, not a collection). */
function readWoff2Tables(buf) {
  if (buf.readUInt32BE(0) !== 0x774f4632) throw new Error("not a woff2 file");
  if (buf.readUInt32BE(4) === 0x74746366) throw new Error("woff2 collections are not supported");
  const numTables = buf.readUInt16BE(12);
  const compressedSize = buf.readUInt32BE(20);
  const st = { p: 48 };
  const dir = [];
  for (let i = 0; i < numTables; i++) {
    const flags = buf[st.p++];
    let tag;
    if ((flags & 63) === 63) {
      tag = buf.toString("latin1", st.p, st.p + 4);
      st.p += 4;
    } else tag = WOFF2_TAGS[flags & 63];
    const version = (flags >> 6) & 3;
    const origLength = readBase128(buf, st);
    const transformed = tag === "glyf" || tag === "loca" ? version !== 3 : version !== 0;
    const length = transformed ? readBase128(buf, st) : origLength;
    dir.push({ tag, length, transformed });
  }
  const data = brotliDecompressSync(buf.subarray(st.p, st.p + compressedSize));
  const tables = {};
  let offset = 0;
  for (const e of dir) {
    tables[e.tag] = { data: data.subarray(offset, offset + e.length), transformed: e.transformed };
    offset += e.length;
  }
  return tables;
}

/** Unicode code point → glyph id, from the best Unicode cmap subtable (format 12 or 4). */
function cmapLookup(cmap) {
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
  if (best < 0) throw new Error("no unicode cmap subtable");
  const fmt = cmap.readUInt16BE(best);
  if (fmt === 4) {
    const segX2 = cmap.readUInt16BE(best + 6);
    const ends = best + 14;
    const starts = ends + segX2 + 2;
    const deltas = starts + segX2;
    const rangeOffsets = deltas + segX2;
    return (cp) => {
      for (let s = 0; s < segX2; s += 2) {
        if (cp > cmap.readUInt16BE(ends + s)) continue;
        const start = cmap.readUInt16BE(starts + s);
        if (cp < start) return 0;
        const delta = cmap.readInt16BE(deltas + s);
        const ro = cmap.readUInt16BE(rangeOffsets + s);
        if (ro === 0) return (cp + delta) & 0xffff;
        const gi = cmap.readUInt16BE(rangeOffsets + s + ro + (cp - start) * 2);
        return gi === 0 ? 0 : (gi + delta) & 0xffff;
      }
      return 0;
    };
  }
  const groups = cmap.readUInt32BE(best + 12);
  return (cp) => {
    for (let g = 0; g < groups; g++) {
      const r = best + 16 + g * 12;
      const s = cmap.readUInt32BE(r);
      const e = cmap.readUInt32BE(r + 4);
      if (cp >= s && cp <= e) return cmap.readUInt32BE(r + 8) + (cp - s);
    }
    return 0;
  };
}

/**
 * Letter frequencies (blend of English + French running text, space included) used to compute an
 * average advance width comparable to capsize's `xWidthAvg`. The same weighting produced the
 * fallback-font constants in src/lib/theme/fonts.ts (Arial 909, Times New Roman 821, …).
 */
const FREQ = { a: 7.9, b: 1.2, c: 3.05, d: 4.0, e: 13.7, f: 1.65, g: 1.45, h: 3.4, i: 7.25, j: 0.4, k: 0.42, l: 4.75, m: 2.7, n: 6.9, o: 6.65, p: 2.2, q: 0.75, r: 6.3, s: 7.1, t: 8.15, u: 4.55, v: 1.3, w: 1.2, x: 0.28, y: 1.15, z: 0.19, " ": 18 };

function readMetrics(tables) {
  const head = tables.head?.data;
  const hhea = tables.hhea?.data;
  const os2 = tables["OS/2"]?.data;
  if (!head || !hhea || !os2) throw new Error("missing head/hhea/OS2");
  const unitsPerEm = head.readUInt16BE(18);
  const numberOfHMetrics = hhea.readUInt16BE(34);
  let xWidthAvg = os2.readInt16BE(2);
  if (tables.hmtx && !tables.hmtx.transformed && tables.cmap) {
    const hmtx = tables.hmtx.data;
    const lookup = cmapLookup(tables.cmap.data);
    let sum = 0;
    let total = 0;
    for (const [ch, f] of Object.entries(FREQ)) {
      const gid = lookup(ch.codePointAt(0));
      if (!gid) continue;
      sum += hmtx.readUInt16BE(4 * Math.min(gid, numberOfHMetrics - 1)) * f;
      total += f;
    }
    if (total > 0) xWidthAvg = sum / total;
  }
  const version = os2.readUInt16BE(0);
  return {
    unitsPerEm,
    ascent: hhea.readInt16BE(4),
    descent: hhea.readInt16BE(6),
    lineGap: hhea.readInt16BE(8),
    xWidthAvg: Math.round(xWidthAvg),
    capHeight: version >= 2 ? os2.readInt16BE(88) : Math.round(unitsPerEm * 0.7),
    xHeight: version >= 2 ? os2.readInt16BE(86) : Math.round(unitsPerEm * 0.5),
  };
}

/* ------------------------------------------------------------------ */
/* fontsource package reading                                          */
/* ------------------------------------------------------------------ */

function packageDir(entry) {
  const dir = join(NM, entry.variable ? "@fontsource-variable" : "@fontsource", entry.id);
  if (!existsSync(join(dir, "metadata.json"))) throw new Error(`font package not installed: ${dir}`);
  return dir;
}

/** file name → { unicodeRange, weight, style } parsed from every CSS file of the package. */
function readCssFaces(dir) {
  const map = new Map();
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".css")) continue;
    const css = readFileSync(join(dir, name), "utf8");
    for (const block of css.match(/@font-face\s*{[^}]*}/g) ?? []) {
      const file = /url\(\.\/files\/([^)]+?\.woff2)\)/.exec(block)?.[1];
      const range = /unicode-range:\s*([^;]+);/.exec(block)?.[1]?.trim();
      const weight = /font-weight:\s*([^;]+);/.exec(block)?.[1]?.trim();
      const style = /font-style:\s*([^;]+);/.exec(block)?.[1]?.trim();
      if (file && range && weight && style) map.set(file, { unicodeRange: range.replace(/\s+/g, ""), weight, style });
    }
  }
  return map;
}

const SAFE_FAMILY = /^[A-Za-z0-9 ]{2,60}$/;
const SAFE_FILE = /^[a-z0-9-]+\.woff2$/;
const SAFE_RANGE = /^(U\+[0-9A-F?]{1,6}(-[0-9A-F]{1,6})?)(,U\+[0-9A-F?]{1,6}(-[0-9A-F]{1,6})?)*$/i;
const SAFE_WEIGHT = /^\d{3}( \d{3,4})?$/;

function collect(entry) {
  const dir = packageDir(entry);
  const meta = JSON.parse(readFileSync(join(dir, "metadata.json"), "utf8"));
  if (!SAFE_FAMILY.test(meta.family)) throw new Error(`unexpected family name for ${entry.id}: ${meta.family}`);
  const faces = readCssFaces(dir);
  const subsets = SUBSETS.filter((s) => meta.subsets.includes(s));
  const styles = entry.italic ? ["normal", "italic"] : ["normal"];
  const files = [];
  for (const subset of subsets) {
    for (const style of styles) {
      const names = entry.variable
        ? [`${entry.id}-${subset}-${entry.axis ?? "wght"}-${style}.woff2`]
        : entry.weights.map((w) => `${entry.id}-${subset}-${w}-${style}.woff2`);
      for (const file of names) {
        const src = join(dir, "files", file);
        if (!existsSync(src)) throw new Error(`missing font file ${src}`);
        const face = faces.get(file);
        if (!face) throw new Error(`no @font-face (unicode-range) found for ${file}`);
        if (!SAFE_FILE.test(file) || !SAFE_RANGE.test(face.unicodeRange) || !SAFE_WEIGHT.test(face.weight)) {
          throw new Error(`unexpected font data for ${file}`);
        }
        files.push({ file, subset, style, weight: face.weight, unicodeRange: face.unicodeRange, bytes: statSync(src).size, src });
      }
    }
  }
  const metricsFile = files.find((f) => f.subset === "latin" && f.style === "normal" && (entry.variable || f.weight === "400"));
  if (!metricsFile) throw new Error(`no latin regular file for ${entry.id}`);
  const metrics = readMetrics(readWoff2Tables(readFileSync(metricsFile.src)));
  const wght = meta.variable && meta.variable.wght;
  const weights = entry.variable ? [] : [...entry.weights];
  const weightRange = entry.variable ? [Number(wght.min), Number(wght.max)] : [Math.min(...weights), Math.max(...weights)];
  return {
    id: entry.id,
    family: meta.family,
    category: meta.category,
    scripts: subsets.includes("arabic") ? ["arabic", "latin"] : ["latin"],
    variable: !!entry.variable,
    axes: entry.variable ? (entry.axis === "opsz" ? "opsz,wght" : "wght") : "",
    weights,
    weightRange,
    italic: !!entry.italic,
    files,
    metrics,
    license: meta.license?.type ?? "OFL-1.1",
    dir,
  };
}

/* ------------------------------------------------------------------ */
/* main                                                                */
/* ------------------------------------------------------------------ */

const fonts = MANIFEST.map(collect);

rmSync(OUT_DIR, { recursive: true, force: true });
let totalBytes = 0;
for (const font of fonts) {
  const dest = join(OUT_DIR, font.id);
  mkdirSync(dest, { recursive: true });
  for (const f of font.files) {
    copyFileSync(f.src, join(dest, f.file));
    totalBytes += f.bytes;
  }
  const license = ["LICENSE", "OFL.txt", "LICENSE.txt"].map((n) => join(font.dir, n)).find((p) => existsSync(p));
  if (license) copyFileSync(license, join(dest, "LICENSE.txt"));
}

const data = {};
for (const f of fonts) {
  data[f.id] = {
    id: f.id,
    family: f.family,
    category: f.category,
    scripts: f.scripts,
    variable: f.variable,
    axes: f.axes,
    weights: f.weights,
    weightRange: f.weightRange,
    italic: f.italic,
    license: f.license,
    metrics: f.metrics,
    files: f.files.map(({ file, subset, style, weight, unicodeRange, bytes }) => ({ file, subset, style, weight, unicodeRange, bytes })),
  };
}

const ts = `// AUTO-GENERATED by scripts/sync-fonts.mjs — do not edit by hand. Re-run \`npm run fonts:sync\`.
// Files live in public/fonts/<id>/<file>. Metrics are read from the latin regular file
// (default instance for variable fonts) and feed the CLS-safe fallback faces in fonts.ts.

export type FontSubset = "latin" | "latin-ext" | "arabic";
export type FontScript = "latin" | "arabic";
export type FontCategory = "serif" | "sans-serif" | "display" | "handwriting" | "monospace";

export interface FontFileData {
  file: string;
  subset: FontSubset;
  style: "normal" | "italic";
  /** CSS font-weight descriptor: "400" (static) or "100 900" (variable range) */
  weight: string;
  unicodeRange: string;
  bytes: number;
}

export interface FontMetricsData {
  unitsPerEm: number;
  /** hhea ascender (font units, positive) */
  ascent: number;
  /** hhea descender (font units, negative) */
  descent: number;
  lineGap: number;
  /** frequency-weighted average advance of lowercase latin + space (font units) */
  xWidthAvg: number;
  capHeight: number;
  xHeight: number;
}

export interface FontData {
  id: string;
  family: string;
  category: FontCategory;
  scripts: readonly FontScript[];
  variable: boolean;
  /** variable axes shipped ("wght" or "opsz,wght"); "" for static fonts */
  axes: string;
  /** static weights shipped (empty for variable fonts) */
  weights: readonly number[];
  /** [min, max] usable weight */
  weightRange: readonly [number, number];
  italic: boolean;
  license: string;
  metrics: FontMetricsData;
  files: readonly FontFileData[];
}

export const FONT_IDS = ${JSON.stringify(fonts.map((f) => f.id))} as const;
export type KnownFontId = (typeof FONT_IDS)[number];

export const FONT_DATA: Readonly<Record<KnownFontId, FontData>> = ${JSON.stringify(data, null, 2)};
`;
writeFileSync(OUT_TS, ts);

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
for (const f of fonts) {
  const bytes = f.files.reduce((s, x) => s + x.bytes, 0);
  console.log(`${f.id.padEnd(30)} ${String(f.files.length).padStart(2)} files  ${kb(bytes).padStart(7)}  ${f.scripts.join("+")}`);
}
console.log(`\n${fonts.length} families, ${fonts.reduce((s, f) => s + f.files.length, 0)} files, ${kb(totalBytes)} → public/fonts`);
console.log(`wrote ${OUT_TS.replace(ROOT, ".")}`);
