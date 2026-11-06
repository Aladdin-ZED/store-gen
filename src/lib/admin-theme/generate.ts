/**
 * The admin token generator (core §I.6, DES-§16.2; UX-03's token half). Three inputs per surface (base neutral hue and
 * chroma, accent hue and chroma, contrast standard | high), the Linear method: every colour token is computed in OKLCH
 * for light and dark, and `adminTokensCss()` renders the blocks that scripts/build-admin-css.mjs injects into the
 * precompiled admin stylesheet (no Turbopack loader, HANDOFF §4). Pure and isomorphic: the build script, the
 * monogram and scripts/qa/admin-tokens-check.ts import it.
 *
 * Fidelity rule: the tenant input reproduces R1.0's tokens (src/app/globals.css:74-170 at P0) within ΔE 0.01 in
 * light AND dark, so R1 changes nothing visible but the DES-§16.16 fixes. DES-§16.2's lightness column is a rounding of
 * those values (dark background 0.165 for R1.0's 0.175, sidebar 0.150 for 0.145 …); where the two differ, R1.0 wins:
 * the rounded dark values halve the step between the inset content panel and the sidebar. Dark hairlines stay R1.0's
 * white at 9 / 13 / 8 % alpha (border / input / sidebar border), which composite to ΔL ≈ 0.1 over the ground.
 *
 * Owner rule 1: no token sits in OKLCH hue 25-75° with chroma above 0.06 (checked by test:admin-tokens). Violet (h 295)
 * belongs to impersonation only, so `CATEGORICAL` has none (UX-26).
 */
import { formatOklch, type Oklch } from "./contrast";

export interface SurfaceInput {
  base: { h: number; c: number };
  accent: { h: number; c: number };
  contrast: "standard" | "high";
}

export const SURFACES = {
  tenant: { base: { h: 265, c: 0.006 }, accent: { h: 166, c: 0.1 }, contrast: "standard" },
  console: { base: { h: 230, c: 0.008 }, accent: { h: 205, c: 0.09 }, contrast: "standard" },
} as const satisfies Record<string, SurfaceInput>;

export type SurfaceName = keyof typeof SURFACES;
export type Mode = "light" | "dark";
export const MODES: readonly Mode[] = ["light", "dark"];

/* ------------------------------------------------------------------ */
/* token names                                                         */
/* ------------------------------------------------------------------ */

/** Colour tokens: one value per surface and mode. */
export const ADMIN_COLOR_TOKENS = [
  // neutral roles (DES-§16.2 table)
  "--background",
  "--foreground",
  "--card",
  "--card-foreground",
  "--popover",
  "--popover-foreground",
  "--primary",
  "--primary-foreground",
  "--secondary",
  "--secondary-foreground",
  "--muted",
  "--muted-foreground",
  "--accent",
  "--accent-foreground",
  "--border",
  "--input",
  "--surface-stage",
  "--sidebar",
  "--sidebar-foreground",
  "--sidebar-primary",
  "--sidebar-primary-foreground",
  "--sidebar-accent",
  "--sidebar-accent-foreground",
  "--sidebar-border",
  "--sidebar-ring",
  // accent roles
  "--brand",
  "--brand-foreground",
  "--brand-soft",
  "--ring",
  // status, shared by both surfaces: a fill, a readable ink and a soft ground
  "--success",
  "--success-ink",
  "--success-soft",
  "--warn",
  "--warn-ink",
  "--warn-soft",
  "--destructive",
  "--destructive-ink",
  "--destructive-soft",
  "--info",
  "--info-ink",
  "--info-soft",
  // impersonation (violet, its one meaning) and the R3 break-glass ribbon
  "--imp-bg",
  "--imp-ink",
  "--bg-ribbon",
  "--bg-ribbon-ink",
  // data-viz, read from CATEGORICAL
  "--chart-1",
  "--chart-2",
  "--chart-3",
  "--chart-4",
  "--chart-5",
  "--chart-6",
] as const;

/** Constant tokens: the radius ladder (R-D38) and motion (DES-§16.6); the same on every surface and mode. */
export const ADMIN_CONST_TOKENS = ["--r-chip", "--r-control", "--r-card", "--r-sheet", "--dur-1", "--dur-2", "--dur-3", "--ease-out"] as const;

export type AdminColorToken = (typeof ADMIN_COLOR_TOKENS)[number];
export type AdminConstToken = (typeof ADMIN_CONST_TOKENS)[number];
export type AdminToken = AdminColorToken | AdminConstToken;

export const RADIUS = { "--r-chip": "6px", "--r-control": "8px", "--r-card": "12px", "--r-sheet": "16px" } as const;
export const MOTION = { "--dur-1": "120ms", "--dur-2": "180ms", "--dur-3": "240ms", "--ease-out": "cubic-bezier(.2,.8,.2,1)" } as const;

/** `[data-density]` (core §I.6, DES-§16.7): row height, control height, base type size and cell padding. */
export const DENSITY = {
  comfortable: { "--row-h": "40px", "--ctl-h": "36px", "--fs-base": "14px", "--cell-px": "12px" },
  compact: { "--row-h": "32px", "--ctl-h": "30px", "--fs-base": "13px", "--cell-px": "8px" },
} as const;
export type Density = keyof typeof DENSITY;

/* ------------------------------------------------------------------ */
/* the categorical data-viz set (DES-§16.9)                            */
/* ------------------------------------------------------------------ */

export interface CategoricalColor {
  id: "jade" | "graphite" | "blue" | "indigo" | "rose" | "yellow";
  h: number;
  light: { l: number; c: number };
  dark: { l: number; c: number };
}

/**
 * Defined once (DES-§16.2): jade 166 ("ours", = the tenant brand), graphite (context), blue 250 (= `--info`), indigo
 * 265, rose 350, yellow 95. Emitted as `--chart-1..6` in this order; charts read the tokens, never literals.
 */
export const CATEGORICAL: readonly CategoricalColor[] = [
  { id: "jade", h: 166, light: { l: 0.53, c: 0.1 }, dark: { l: 0.76, c: 0.11 } },
  { id: "graphite", h: 265, light: { l: 0.56, c: 0.02 }, dark: { l: 0.7, c: 0.015 } },
  { id: "blue", h: 250, light: { l: 0.58, c: 0.12 }, dark: { l: 0.72, c: 0.11 } },
  { id: "indigo", h: 265, light: { l: 0.5, c: 0.14 }, dark: { l: 0.68, c: 0.12 } },
  { id: "rose", h: 350, light: { l: 0.6, c: 0.16 }, dark: { l: 0.72, c: 0.14 } },
  { id: "yellow", h: 95, light: { l: 0.8, c: 0.15 }, dark: { l: 0.84, c: 0.14 } },
];

/* ------------------------------------------------------------------ */
/* the generator                                                       */
/* ------------------------------------------------------------------ */

/** A neutral role: lightness per mode ([standard, high] when they differ) and the factor on `base.c` per mode. */
interface NeutralRole {
  light: number | readonly [number, number];
  dark: number | readonly [number, number];
  factor: { light: number; dark: number } | number;
}

/**
 * DES-§16.2's neutral roles, plus the roles shadcn reads that the table folds into "same as" (the foregrounds, the
 * sidebar's own steps), at R1.0's values (the fidelity rule in the header).
 */
const NEUTRAL: Record<string, NeutralRole> = {
  "--background": { light: 0.99, dark: 0.175, factor: { light: 0.25, dark: 2 / 3 } },
  "--card": { light: 0.998, dark: 0.205, factor: { light: 1 / 6, dark: 5 / 6 } },
  "--popover": { light: 0.998, dark: 0.215, factor: { light: 1 / 6, dark: 5 / 6 } },
  "--sidebar": { light: 0.966, dark: 0.145, factor: { light: 0.4, dark: 2 / 3 } },
  "--muted": { light: 0.962, dark: 0.245, factor: { light: 0.5, dark: 1 } },
  "--secondary": { light: 0.962, dark: 0.255, factor: { light: 0.5, dark: 1 } },
  "--accent": { light: 0.955, dark: 0.27, factor: { light: 0.65, dark: 7 / 6 } },
  // light only: the dark hairlines are alpha whites (HAIRLINE_DARK)
  "--border": { light: [0.915, 0.88], dark: 0, factor: 0.65 },
  "--input": { light: 0.885, dark: 0, factor: 0.8 },
  "--sidebar-border": { light: 0.905, dark: 0, factor: 0.65 },
  "--muted-foreground": { light: [0.5, 0.44], dark: [0.7, 0.76], factor: 2 },
  "--foreground": { light: [0.2, 0.16], dark: [0.955, 0.975], factor: { light: 1.4, dark: 0.5 } },
  "--surface-stage": { light: 0.18, dark: 0.12, factor: 1.6 },
  // the ink primary sits 0.015 above the text in light and 0.005 below it in dark
  "--primary": { light: [0.215, 0.175], dark: [0.95, 0.97], factor: { light: 1.4, dark: 0.5 } },
  "--primary-foreground": { light: 0.985, dark: 0.2, factor: { light: 1 / 3, dark: 1 } },
  "--sidebar-accent": { light: 0.93, dark: 0.235, factor: { light: 0.65, dark: 1 } },
};

/** Dark hairlines: white at an alpha (R1.0), a touch stronger under high contrast. */
const HAIRLINE_DARK = { "--border": [0.09, 0.14], "--input": [0.13, 0.18], "--sidebar-border": [0.08, 0.12] } as const;

const pick = (v: number | readonly [number, number], high: boolean): number => (typeof v === "number" ? v : v[high ? 1 : 0]);

function neutral(s: SurfaceInput, mode: Mode, name: string): Oklch {
  const high = s.contrast === "high";
  if (mode === "dark" && name in HAIRLINE_DARK) {
    return { l: 1, c: 0, h: s.base.h, alpha: pick(HAIRLINE_DARK[name as keyof typeof HAIRLINE_DARK], high) };
  }
  const role = NEUTRAL[name]!;
  const factor = typeof role.factor === "number" ? role.factor : role.factor[mode];
  return { l: pick(role[mode], high), c: s.base.c * factor, h: s.base.h };
}

/** Status colours (DES-§16.2: shared by both surfaces). `today` = the R1.0 dark value, kept. */
const STATUS: Record<Mode, Record<string, Oklch>> = {
  light: {
    "--success": { l: 0.64, c: 0.15, h: 150 },
    "--success-ink": { l: 0.44, c: 0.1, h: 152 },
    "--success-soft": { l: 0.955, c: 0.035, h: 150 },
    "--warn": { l: 0.84, c: 0.155, h: 95 },
    "--warn-ink": { l: 0.43, c: 0.075, h: 98 },
    "--warn-soft": { l: 0.965, c: 0.05, h: 95 },
    "--destructive": { l: 0.55, c: 0.19, h: 17 },
    "--destructive-ink": { l: 0.48, c: 0.17, h: 17 },
    "--destructive-soft": { l: 0.955, c: 0.025, h: 17 },
    "--info": { l: 0.58, c: 0.12, h: 250 },
    "--info-ink": { l: 0.4, c: 0.1, h: 250 },
    "--info-soft": { l: 0.955, c: 0.025, h: 250 },
  },
  dark: {
    "--success": { l: 0.74, c: 0.15, h: 150 }, // today
    "--success-ink": { l: 0.83, c: 0.12, h: 152 }, // today
    "--success-soft": { l: 0.28, c: 0.05, h: 150 },
    "--warn": { l: 0.86, c: 0.15, h: 96 }, // today
    "--warn-ink": { l: 0.9, c: 0.105, h: 98 }, // today
    "--warn-soft": { l: 0.29, c: 0.05, h: 95 },
    "--destructive": { l: 0.7, c: 0.16, h: 15 }, // today
    "--destructive-ink": { l: 0.8, c: 0.1, h: 15 },
    "--destructive-soft": { l: 0.28, c: 0.06, h: 15 },
    "--info": { l: 0.72, c: 0.11, h: 250 },
    "--info-ink": { l: 0.84, c: 0.07, h: 250 },
    "--info-soft": { l: 0.28, c: 0.05, h: 250 },
  },
};

/** Impersonation (core §I.6: violet ~295, its one meaning) and break-glass (R3, crimson 17): the same in both modes. */
const RIBBONS: Record<string, Oklch> = {
  "--imp-bg": { l: 0.42, c: 0.15, h: 295 },
  "--imp-ink": { l: 0.99, c: 0.005, h: 295 },
  "--bg-ribbon": { l: 0.45, c: 0.17, h: 17 },
  "--bg-ribbon-ink": { l: 0.99, c: 0.005, h: 17 },
};

/** Every colour token of one surface and mode, as OKLCH values (the checks measure these). */
export function generateColors(s: SurfaceInput, mode: Mode): Record<AdminColorToken, Oklch> {
  const dark = mode === "dark";
  const n = (name: string) => neutral(s, mode, name);
  const fg = n("--foreground");
  const primary = n("--primary");
  const primaryFg = n("--primary-foreground");
  // DES-§16.2 rounds the dark brand to L 0.70 at accent.c; R1.0's brighter jade (L 0.76, C 0.11) is kept
  const brand: Oklch = dark ? { l: 0.76, c: s.accent.c * 1.1, h: s.accent.h } : { l: 0.53, c: s.accent.c, h: s.accent.h };
  // DES-§16.2 gives L 0.99 for both modes, which fails its own ≥ 4.5:1 check on the dark brand: dark keeps R1.0's ink
  const brandFg: Oklch = dark ? { l: 0.19, c: 0.03, h: s.accent.h } : { l: 0.99, c: 0.006, h: s.accent.h };
  const ring: Oklch = { l: dark ? 0.72 : 0.6, c: s.accent.c, h: s.accent.h };
  const chart = (i: number): Oklch => {
    const k = CATEGORICAL[i]!;
    return { ...k[mode], h: k.h };
  };
  return {
    "--background": n("--background"),
    "--foreground": fg,
    "--card": n("--card"),
    "--card-foreground": fg,
    "--popover": n("--popover"),
    "--popover-foreground": fg,
    "--primary": primary,
    "--primary-foreground": primaryFg,
    "--secondary": n("--secondary"),
    "--secondary-foreground": dark ? fg : primary,
    "--muted": n("--muted"),
    "--muted-foreground": n("--muted-foreground"),
    "--accent": n("--accent"),
    "--accent-foreground": dark ? fg : primary,
    "--border": n("--border"),
    "--input": n("--input"),
    "--surface-stage": n("--surface-stage"),
    "--sidebar": n("--sidebar"),
    "--sidebar-foreground": fg,
    "--sidebar-primary": dark ? brand : primary,
    "--sidebar-primary-foreground": dark ? brandFg : primaryFg,
    "--sidebar-accent": n("--sidebar-accent"),
    "--sidebar-accent-foreground": fg,
    "--sidebar-border": n("--sidebar-border"),
    "--sidebar-ring": ring,
    "--brand": brand,
    "--brand-foreground": brandFg,
    "--brand-soft": dark ? { l: 0.3, c: s.accent.c * 0.45, h: s.accent.h } : { l: 0.955, c: s.accent.c * 0.26, h: s.accent.h },
    "--ring": ring,
    ...(STATUS[mode] as Record<
      | "--success"
      | "--success-ink"
      | "--success-soft"
      | "--warn"
      | "--warn-ink"
      | "--warn-soft"
      | "--destructive"
      | "--destructive-ink"
      | "--destructive-soft"
      | "--info"
      | "--info-ink"
      | "--info-soft",
      Oklch
    >),
    ...(RIBBONS as Record<"--imp-bg" | "--imp-ink" | "--bg-ribbon" | "--bg-ribbon-ink", Oklch>),
    "--chart-1": chart(0),
    "--chart-2": chart(1),
    "--chart-3": chart(2),
    "--chart-4": chart(3),
    "--chart-5": chart(4),
    "--chart-6": chart(5),
  };
}

/** DES-§16.2's signature: every token of one surface and mode as CSS values ("oklch(L C H)" for the colours). */
export function generateTokens(s: SurfaceInput, mode: Mode): Record<AdminToken, string> {
  const colors = generateColors(s, mode);
  const out = {} as Record<AdminToken, string>;
  for (const k of ADMIN_COLOR_TOKENS) out[k] = formatOklch(colors[k]);
  return { ...out, ...RADIUS, ...MOTION };
}

/* ------------------------------------------------------------------ */
/* CSS                                                                 */
/* ------------------------------------------------------------------ */

/**
 * Selectors per surface and mode. `:root` is the tenant (the default); the console scopes its subtree. The dark
 * selectors carry one class more than the light ones, so `.dark` on <html> wins over a nested `[data-surface]`.
 */
const SELECTORS: Record<SurfaceName, Record<Mode, string[]>> = {
  tenant: {
    light: [":root", '[data-surface="tenant"]'],
    dark: [".dark", '.dark [data-surface="tenant"]', '[data-surface="tenant"].dark'],
  },
  console: {
    light: ['[data-surface="console"]'],
    dark: ['.dark [data-surface="console"]', '[data-surface="console"].dark'],
  },
};

function block(selectors: readonly string[], decls: Record<string, string>, minify: boolean): string {
  const body = Object.entries(decls).map(([k, v]) => (minify ? `${k}:${v}` : `  ${k}: ${v};`));
  return minify ? `${selectors.join(",")}{${body.join(";")}}` : `${selectors.join(",\n")} {\n${body.join("\n")}\n}`;
}

function colorDecls(s: SurfaceInput, mode: Mode, only?: ReadonlySet<string>): Record<string, string> {
  const colors = generateColors(s, mode);
  const out: Record<string, string> = {};
  for (const k of ADMIN_COLOR_TOKENS) if (!only || only.has(k)) out[k] = formatOklch(colors[k]);
  return out;
}

/** The tokens whose value differs between the standard and the high contrast input (emitted under prefers-contrast). */
function highDelta(s: SurfaceInput, mode: Mode): Set<string> {
  const std = colorDecls({ ...s, contrast: "standard" }, mode);
  const high = colorDecls({ ...s, contrast: "high" }, mode);
  return new Set(Object.keys(high).filter((k) => high[k] !== std[k]));
}

/**
 * The generated stylesheet: constants and density on :root, then light and dark × tenant and console, then the
 * `prefers-contrast: more` deltas. scripts/build-admin-css.mjs appends it to src/app/globals.compiled.css.
 */
export function adminTokensCss(opts: { minify?: boolean } = {}): string {
  const minify = opts.minify ?? false;
  const nl = minify ? "" : "\n\n";
  const parts: string[] = [
    block([":root"], { ...RADIUS, ...MOTION }, minify),
    block([":root", '[data-density="comfortable"]'], DENSITY.comfortable, minify),
    block(['[data-density="compact"]'], DENSITY.compact, minify),
    // touch: controls stay ≥ 44 px whatever the density (DES-§16.7)
    `@media (pointer: coarse){${block([":root", "[data-density]"], { "--ctl-h": "44px" }, true)}}`,
  ];
  for (const surface of Object.keys(SURFACES) as SurfaceName[]) {
    for (const mode of MODES) parts.push(block(SELECTORS[surface][mode], colorDecls(SURFACES[surface], mode), minify));
  }
  const high: string[] = [];
  for (const surface of Object.keys(SURFACES) as SurfaceName[]) {
    for (const mode of MODES) {
      const s: SurfaceInput = { ...SURFACES[surface], contrast: "high" };
      high.push(block(SELECTORS[surface][mode], colorDecls(s, mode, highDelta(s, mode)), true));
    }
  }
  parts.push(`@media (prefers-contrast: more){${high.join("")}}`);
  const head = minify ? "" : "/* admin tokens: GENERATED by src/lib/admin-theme/generate.ts (core §I.6, DES-§16.2) */\n";
  return head + parts.join(nl) + "\n";
}
