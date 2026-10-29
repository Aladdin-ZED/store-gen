/**
 * The installable dashboard (P2 SHELL; platform.md PLA-§23.1, PD10; design.md DES-§16.14, UX-07): the web app
 * manifest of `/app/` and the app icon's geometry. Pure and isomorphic: `GET /app/manifest.webmanifest` serves
 * `appManifest()`, scripts/build-app-icons.mjs rasterizes `appIconSvg()` into public/icons/ (sharp, at build time) and
 * `test:shell` checks both.
 *
 * Colours come from the token generator, never typed here: `theme_color` is the tenant `--sidebar` and
 * `background_color` the tenant `--background`, both light, as hex (DES-§16.14 wins over PLA-§23.1, which wrote
 * `--background` for both). The icon is the platform's initial as a construction-grid monogram (DS32: a 24-unit grid,
 * a stroke skeleton of half arcs, one stroke width, round caps, paths only, no `<text>`) in the near-white ink of the
 * dark foreground on the deep-ink ground of `--surface-stage`. No orange (owner rule 1; `test:shell` runs the band
 * test on every colour used). The maskable icon keeps the mark inside the inner 80 % circle (DES-§16.14), with the
 * margin a launcher's squircle or circle needs.
 */
import type { AdminLocale } from "@/lib/i18n/admin";
import { oklchToHex, type Oklch } from "./contrast";
import { generateColors, SURFACES } from "./generate";

/** The colours of the manifest and the icon, from the tenant tokens. */
export function appColors(): { theme: Oklch; background: Oklch; ground: Oklch; groundTop: Oklch; ink: Oklch } {
  const light = generateColors(SURFACES.tenant, "light");
  const dark = generateColors(SURFACES.tenant, "dark");
  const ground = light["--surface-stage"];
  return {
    theme: light["--sidebar"],
    background: light["--background"],
    ground,
    // a quiet top-to-bottom lift of the ground (+0.05 L, same hue and chroma): depth without a second colour
    groundTop: { ...ground, l: ground.l + 0.05 },
    ink: dark["--foreground"],
  };
}

/* ------------------------------------------------------------------ */
/* the monogram                                                        */
/* ------------------------------------------------------------------ */

/** The construction grid of DS32 (units per side). */
export const GRID = 24;
/** One stroke width (DS32 gives 2.5 / 3 / 3.5 by vibe; the platform mark takes the middle one). */
export const MONOGRAM_STROKE = 3;

/**
 * "S" as two half-arc bowls of radius 3.5 stacked on the grid's vertical axis (centres at y 8.5 and 15.5), each
 * swept 240° from a terminal at 30° off the horizontal; the bowls meet on the grid's centre with a shared tangent.
 * Symmetric under a half turn about (12, 12), so its ink centroid is the grid's centre exactly (DS32's ±2 % rule).
 */
const R = 3.5;
const TERMINAL_DX = R * Math.cos(Math.PI / 6);
const TERMINAL_DY = R * Math.sin(Math.PI / 6);
const f = (n: number) => Number(n.toFixed(4)).toString();
export const MONOGRAM_S = `M${f(12 + TERMINAL_DX)} ${f(8.5 - TERMINAL_DY)}A${R} ${R} 0 1 0 12 12A${R} ${R} 0 1 1 ${f(12 - TERMINAL_DX)} ${f(15.5 + TERMINAL_DY)}`;

/** The mark's farthest ink from the grid centre, in grid units: a bowl's centre (3.5 away) plus its outer edge (R + half the stroke). */
export const MONOGRAM_REACH = 3.5 + R + MONOGRAM_STROKE / 2;
/** The mark's ink box in grid units (stroke included): x 7-17, y 3.5-20.5. */
export const MONOGRAM_BOX = { x0: 12 - R - MONOGRAM_STROKE / 2, x1: 12 + R + MONOGRAM_STROKE / 2, y0: 12 - 2 * R - MONOGRAM_STROKE / 2, y1: 12 + 2 * R + MONOGRAM_STROKE / 2 } as const;

export type AppIconKind = "any" | "maskable";

/**
 * The grid's side as a share of the icon: the "any" icon is a rounded tile and carries the larger mark; the maskable
 * one is full bleed and keeps the mark well inside the safe circle (radius 40 % of the side).
 */
export const GRID_SHARE: Record<AppIconKind, number> = { any: 0.64, maskable: 0.52 };
/** The "any" tile's corner radius as a share of the side (a launcher draws the maskable one's shape itself). */
export const TILE_RADIUS = 0.225;
/** DES-§16.14: the maskable mark stays inside the inner 80 % circle. */
export const SAFE_RADIUS = 0.4;

/** The mark's farthest ink from the icon centre, as a share of the side (the safe-zone rule reads this). */
export function markReach(kind: AppIconKind): number {
  return (MONOGRAM_REACH / GRID) * GRID_SHARE[kind];
}

/** One icon as SVG (paths and rects only), `size` px square. Deterministic: the same input gives the same bytes. */
export function appIconSvg(size: number, kind: AppIconKind): string {
  const c = appColors();
  const hex = { ground: oklchToHex(c.ground), top: oklchToHex(c.groundTop), ink: oklchToHex(c.ink) };
  const unit = (size * GRID_SHARE[kind]) / GRID;
  const offset = (size - GRID * unit) / 2;
  const rx = kind === "any" ? f(size * TILE_RADIUS) : "0";
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`,
    `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${hex.top}"/><stop offset="1" stop-color="${hex.ground}"/></linearGradient></defs>`,
    `<rect width="${size}" height="${size}" rx="${rx}" fill="url(#g)"/>`,
    `<g transform="translate(${f(offset)} ${f(offset)}) scale(${f(unit)})">`,
    `<path d="${MONOGRAM_S}" fill="none" stroke="${hex.ink}" stroke-width="${MONOGRAM_STROKE}" stroke-linecap="round" stroke-linejoin="round"/>`,
    `</g></svg>`,
  ].join("");
}

/** The three files of the manifest (PLA-§23.1), written by scripts/build-app-icons.mjs into public/icons/. */
export const APP_ICONS = [
  { file: "app-192.png", size: 192, kind: "any" },
  { file: "app-512.png", size: 512, kind: "any" },
  { file: "app-maskable-512.png", size: 512, kind: "maskable" },
] as const satisfies readonly { file: string; size: number; kind: AppIconKind }[];

/* ------------------------------------------------------------------ */
/* the manifest                                                        */
/* ------------------------------------------------------------------ */

export interface AppManifest {
  id: string;
  name: string;
  short_name: string;
  start_url: string;
  scope: string;
  display: "standalone";
  orientation: "portrait";
  background_color: string;
  theme_color: string;
  icons: { src: string; sizes: string; type: "image/png"; purpose?: "maskable" }[];
  lang: AdminLocale;
  dir: "ltr" | "rtl";
}

/** `short_name`: the first 12 characters of the brand (code points, never half a pair), trailing spaces cut. */
export function shortName(name: string): string {
  return Array.from(name.trim()).slice(0, 12).join("").trimEnd();
}

/** The `/app/` manifest for the platform brand and the visitor's language. No service worker in R1 (PD10). */
export function appManifest(input: { name: string; locale: AdminLocale }): AppManifest {
  const name = input.name.trim() || "Store Gen";
  const c = appColors();
  return {
    id: "/app/",
    name,
    short_name: shortName(name),
    start_url: "/app?source=pwa",
    scope: "/app/",
    display: "standalone",
    orientation: "portrait",
    background_color: oklchToHex(c.background),
    theme_color: oklchToHex(c.theme),
    icons: APP_ICONS.map((i) => ({ src: `/icons/${i.file}`, sizes: `${i.size}x${i.size}`, type: "image/png" as const, ...(i.kind === "maskable" ? { purpose: "maskable" as const } : {}) })),
    lang: input.locale,
    dir: input.locale === "ar" ? "rtl" : "ltr",
  };
}
