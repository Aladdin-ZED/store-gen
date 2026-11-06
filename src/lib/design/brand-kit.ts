/**
 * The brand kit's rules (P6 DESIGN; design.md DES-§12.2-§12.5, DS17, BK-1). Pure and isomorphic: the server actions
 * apply them before a write, the brand page applies the same functions optimistically, so the screen and the stored
 * value never disagree.
 *
 *  - `applyColor`: accent and pop pass `allowedForRole` (the owner's orange band, then the gold band of H34); a moved
 *    pick is stored with a `ColorMove` (the latest per role, ≤ 4) and, on the gold path, the gold is kept as the warm
 *    neutral unless the neutral is locked;
 *  - `cleanGenes`: brand gene values outside `GENE_VOCAB` are dropped and named (the warning item of the response);
 *  - `logoPalette`: the logo's extracted palette (the media pipeline's 96 × 96 pass) through `nearestAllowed`, ≤ 6;
 *  - `logoContrast`: a transparent logo whose ink is < 3:1 on the light or the dark ground;
 *  - `identityChanged`: a logo or mark change re-renders the live pages (DES-§11.6).
 */
import type { BrandSetting } from "@/lib/settings/keys/brand";
import { allowedForRole, nearestAllowed } from "@/lib/theme/brand-color";
import { contrast, toOklch } from "@/lib/theme/color";
import { GENE_VOCAB } from "./vocab";

type Hex = string;
export type BrandColors = BrandSetting["colors"];
export type ColorRoleKey = "accent" | "pop" | "neutral" | "base";

/** The grounds the logo previews sit on (DES-§12.2): the specimen's light and dark grounds. */
export const LIGHT_GROUND = "#ffffff";
export const DARK_GROUND = "#141414";

export interface ColorResult {
  colors: BrandColors;
  /** the request and the stored result when the guard moved it (the 6 s before / after note) */
  moved: { role: "accent" | "pop"; from: Hex; to: Hex; band: "orange" | "gold"; sand?: Hex } | null;
}

const HEX6 = /^#[0-9a-f]{6}$/;

/** Normalised `#rrggbb`, or null. */
export function cleanHex(v: string | null | undefined): Hex | null {
  if (typeof v !== "string") return null;
  let s = v.trim().toLowerCase();
  if (!s.startsWith("#")) s = `#${s}`;
  if (/^#[0-9a-f]{3}$/.test(s)) s = `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  return HEX6.test(s) ? s : null;
}

/** Sets one accent / pop colour (null clears it) through the no-orange guard. */
export function applyColor(cur: BrandColors, role: "accent" | "pop", hexIn: string | null, at: string): ColorResult {
  const colors: BrandColors = { ...cur, moves: cur.moves.filter((m) => m.role !== role) };
  const hex = cleanHex(hexIn);
  if (!hex) {
    colors[role] = null;
    return { colors, moved: null };
  }
  const r = allowedForRole(hex, role);
  colors[role] = r.hex;
  if (!r.moved || !r.band) return { colors, moved: null };
  colors.moves = [...colors.moves, { role, from: hex, to: r.hex, at }].slice(-4);
  // "sand + signal": the gold stays as the page's warm neutral, unless the owner locked the neutral
  if (r.band === "gold" && r.sand && !cur.locks.includes("neutral")) colors.neutralHue = Math.round(toOklch(r.sand).h);
  return { colors, moved: { role, from: hex, to: r.hex, band: r.band, ...(r.sand ? { sand: r.sand } : {}) } };
}

/** The neutral tint's hue (0-360, null clears); neutrals may sit in any band at their low chroma. */
export function applyNeutral(cur: BrandColors, hue: number | null): BrandColors {
  return { ...cur, neutralHue: hue === null || !Number.isFinite(hue) ? null : Math.round(((hue % 360) + 360) % 360) };
}

export function applyBase(cur: BrandColors, base: BrandColors["base"]): BrandColors {
  return { ...cur, base };
}

export function applyLock(cur: BrandColors, role: ColorRoleKey, on: boolean): BrandColors {
  const locks = cur.locks.filter((r) => r !== role);
  return { ...cur, locks: on ? [...locks, role] : locks };
}

/** The roles whose value differs (the `store.brand.updated` audit names these only). */
export function changedRoles(a: BrandSetting, b: BrandSetting): string[] {
  const out: string[] = [];
  for (const k of ["primary", "mark", "wordmark", "inverse"] as const) if (a.logo[k] !== b.logo[k]) out.push(`logo.${k}`);
  for (const k of ["accent", "pop", "neutralHue", "base"] as const) if (a.colors[k] !== b.colors[k]) out.push(`colors.${k}`);
  if (a.colors.locks.slice().sort().join() !== b.colors.locks.slice().sort().join()) out.push("colors.locks");
  if (a.fonts.pairing !== b.fonts.pairing) out.push("fonts.pairing");
  if (a.fonts.locked !== b.fonts.locked) out.push("fonts.locked");
  const genes = new Set([...Object.keys(a.genes), ...Object.keys(b.genes)]);
  for (const g of [...genes].sort()) if ((a.genes as Record<string, string | undefined>)[g] !== (b.genes as Record<string, string | undefined>)[g]) out.push(`genes.${g}`);
  return out;
}

/** A logo or mark change re-renders the live pages' header logo, favicon and OG image (DES-§11.6). */
export function identityChanged(a: BrandSetting, b: BrandSetting): boolean {
  return a.logo.primary !== b.logo.primary || a.logo.mark !== b.logo.mark || a.logo.wordmark !== b.logo.wordmark;
}

export const BRAND_GENE_KEYS = ["G1", "G9", "G12", "G17", "G23", "G26", "G27"] as const;
export type BrandGeneKey = (typeof BRAND_GENE_KEYS)[number];

/** Gene locks validated against GENE_VOCAB: the kept values and the dropped `gene=value` pairs (DES-§12.3). */
export function cleanGenes(input: Readonly<Record<string, string | null | undefined>>): { genes: Partial<Record<BrandGeneKey, string>>; dropped: string[] } {
  const genes: Partial<Record<BrandGeneKey, string>> = {};
  const dropped: string[] = [];
  for (const [gene, value] of Object.entries(input)) {
    if (value === null || value === undefined) continue;
    const entry = (BRAND_GENE_KEYS as readonly string[]).includes(gene) ? GENE_VOCAB[gene as BrandGeneKey] : undefined;
    if (entry && entry.kind === "enum" && (entry.values ?? []).includes(value)) genes[gene as BrandGeneKey] = value;
    else dropped.push(`${gene}=${String(value).slice(0, 48)}`);
  }
  return { genes, dropped };
}

/** The logo palette as stored in `colors.fromLogo`: allowed colours, deduplicated, ≤ 6, by weight. */
export function logoPalette(palette: { colors?: readonly { hex: string; weight?: number }[] } | null | undefined): Hex[] {
  const out: Hex[] = [];
  const colors = [...(palette?.colors ?? [])].sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));
  for (const c of colors) {
    const hex = cleanHex(c.hex);
    if (!hex) continue;
    const allowed = nearestAllowed(hex).hex;
    if (!out.includes(allowed)) out.push(allowed);
    if (out.length === 6) break;
  }
  return out;
}

/**
 * The grounds a logo reads poorly on (< 3:1): only a transparent logo has no ground of its own; its ink is the
 * heaviest colour of its palette (the alpha mask's colour).
 */
export function logoContrast(logo: { alpha: boolean; palette?: { colors?: readonly { hex: string; weight?: number }[] } | null; dominant?: string | null } | null): { light: boolean; dark: boolean } {
  if (!logo || !logo.alpha) return { light: false, dark: false };
  const top = [...(logo.palette?.colors ?? [])].sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))[0]?.hex ?? logo.dominant ?? null;
  const ink = cleanHex(top);
  if (!ink) return { light: false, dark: false };
  return { light: contrast(ink, LIGHT_GROUND) < 3, dark: contrast(ink, DARK_GROUND) < 3 };
}

/** The empty states of DES-§12.2: which tabs have nothing set yet. */
export function brandEmpty(b: BrandSetting): { logo: boolean; colors: boolean; type: boolean } {
  return {
    logo: !b.logo.primary && !b.logo.mark,
    colors: !b.colors.accent && !b.colors.pop && b.colors.neutralHue === null && b.colors.base === null,
    type: !b.fonts.pairing,
  };
}
