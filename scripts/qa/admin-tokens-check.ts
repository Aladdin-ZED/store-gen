/**
 * test:admin-tokens (core §I.6, §J.1; DES-§16.2, §16.8, §16.9; PLA-§O.1, PLA-§22.18 row 4): the admin's colour tokens
 * and its "no aurora, no grain" rule. Pure Node, no build, no server:
 *
 *   npm run test:admin-tokens            (exit 1 on a violation, 2 when the lint itself is broken)
 *   npx tsx scripts/qa/admin-tokens-check.ts --strict      (PENDING entries fail too: gate:r1)
 *
 * Token maths, for both surfaces (tenant, console) in both modes, standard and high contrast:
 * - band: no token in OKLCH hue 25-75° with chroma > 0.06 (owner rule 1), nor any oklch() literal of the admin CSS;
 * - contrast (DES-§16.2): foreground on background ≥ 7:1 (12:1 high); muted-foreground on background and card ≥ 4.5:1;
 *   brand as text on background ≥ 4.5:1 and brand-foreground on brand ≥ 4.5:1; border vs background ΔL ≥ 0.07;
 *   imp-ink on imp-bg ≥ 7:1; every status ink on its soft ground ≥ 4.5:1 (and the ribbon ink, the primary ink);
 * - fidelity: the tenant tokens reproduce R1.0's src/app/globals.css:74-170 within ΔE 0.01 (`R10`, light and dark; a
 *   dark hairline keeps R1.0's alpha white exactly);
 * - `--info` / `--info-ink` exist in light and dark; `--ui-spring` exists nowhere;
 * - blends (blendHit() of src/lib/theme/blend.ts): the monogram disc for every hue in both modes, and the 1 px hairline
 *   (`color-mix(in oklch, var(--foreground) 9%, transparent)`) over background and card;
 * - the compiled stylesheet carries the generator's current output (else: run `npm run css:admin`);
 * - `CATEGORICAL` is what DES-§16.9 lists and what `--chart-1..6` emit.
 * File rules over admin CSS, src/components/**, src/app/** and the compiled CSS (comments ignored):
 * - `aurora`: adm-aurora, adm-grain, aurora, mesh, grain, feTurbulence (D60 rev 3, UX-38);
 * - `radial-stack`: 3 or more radial-gradient( layers on a ::before / ::after;
 * - `chart-literal`: a chart component (name with chart / funnel / spark, or importing recharts) paints a colour literal
 *   instead of a token (the charts read CATEGORICAL through `--chart-n`);
 * - `ui-spring`: the deleted `--ui-spring` token.
 */
import { BLEND_GUARD, blendHit } from "../../src/lib/theme/blend";
import {
  contrastRatio,
  deltaE,
  formatOklch,
  inOrangeBand,
  oklchToHex,
  over,
  parseOklch,
} from "../../src/lib/admin-theme/contrast";
import {
  ADMIN_COLOR_TOKENS,
  CATEGORICAL,
  MODES,
  SURFACES,
  adminTokensCss,
  generateColors,
  type AdminColorToken,
  type Mode,
  type SurfaceInput,
} from "../../src/lib/admin-theme/generate";
import { foldAllowedHue, monogramInk } from "../../src/lib/admin-theme/monogram";
import { blankComments, lineAt, read, runLint, scan, type Fixture, type Hit, type PendingEntry } from "../../src/lib/admin-theme/lint";

const NAME = "test:admin-tokens";
const COMPILED = "src/app/globals.compiled.css";
const ADMIN_CSS = ["src/app/globals.css", "src/components/admin/styles", COMPILED];

/* ------------------------------------------------------------------ */
/* R1.0's tokens (src/app/globals.css:74-170 at P0, 0042571)           */
/* ------------------------------------------------------------------ */

/**
 * The tenant's output must reproduce these within ΔE 0.01 (DES-§16.2: "R1 changes nothing visible"). `--chart-3..5`
 * (pistachio, ink, slate sky) are not here on purpose: the charts now read CATEGORICAL (DES-§16.9, DES-§16.16
 * "palette visuals").
 */
const R10_LIGHT: Partial<Record<AdminColorToken, string>> = {
  "--background": "oklch(0.99 0.0015 265)",
  "--foreground": "oklch(0.2 0.008 265)",
  "--card": "oklch(0.998 0.001 265)",
  "--card-foreground": "oklch(0.2 0.008 265)",
  "--popover": "oklch(0.998 0.001 265)",
  "--popover-foreground": "oklch(0.2 0.008 265)",
  "--primary": "oklch(0.215 0.008 265)",
  "--primary-foreground": "oklch(0.985 0.002 265)",
  "--secondary": "oklch(0.962 0.003 265)",
  "--secondary-foreground": "oklch(0.215 0.008 265)",
  "--muted": "oklch(0.962 0.003 265)",
  "--muted-foreground": "oklch(0.5 0.012 265)",
  "--accent": "oklch(0.955 0.004 265)",
  "--accent-foreground": "oklch(0.215 0.008 265)",
  "--destructive": "oklch(0.55 0.19 17)",
  "--border": "oklch(0.915 0.004 265)",
  "--input": "oklch(0.885 0.005 265)",
  "--ring": "oklch(0.6 0.1 166)",
  "--brand": "oklch(0.53 0.1 166)",
  "--brand-foreground": "oklch(0.99 0.006 166)",
  "--brand-soft": "oklch(0.955 0.026 166)",
  "--success": "oklch(0.64 0.15 150)",
  "--success-ink": "oklch(0.44 0.1 152)",
  "--warn": "oklch(0.84 0.155 95)",
  "--warn-ink": "oklch(0.43 0.075 98)",
  "--chart-1": "oklch(0.53 0.1 166)",
  "--chart-2": "oklch(0.56 0.02 265)",
  "--sidebar": "oklch(0.966 0.0025 265)",
  "--sidebar-foreground": "oklch(0.2 0.008 265)",
  "--sidebar-primary": "oklch(0.215 0.008 265)",
  "--sidebar-primary-foreground": "oklch(0.985 0.002 265)",
  "--sidebar-accent": "oklch(0.93 0.004 265)",
  "--sidebar-accent-foreground": "oklch(0.2 0.008 265)",
  "--sidebar-border": "oklch(0.905 0.004 265)",
  "--sidebar-ring": "oklch(0.6 0.1 166)",
};

const R10_DARK: Partial<Record<AdminColorToken, string>> = {
  "--background": "oklch(0.175 0.004 265)",
  "--foreground": "oklch(0.955 0.003 265)",
  "--card": "oklch(0.205 0.005 265)",
  "--card-foreground": "oklch(0.955 0.003 265)",
  "--popover": "oklch(0.215 0.005 265)",
  "--popover-foreground": "oklch(0.955 0.003 265)",
  "--primary": "oklch(0.95 0.003 265)",
  "--primary-foreground": "oklch(0.2 0.006 265)",
  "--secondary": "oklch(0.255 0.006 265)",
  "--secondary-foreground": "oklch(0.955 0.003 265)",
  "--muted": "oklch(0.245 0.006 265)",
  "--muted-foreground": "oklch(0.7 0.012 265)",
  "--accent": "oklch(0.27 0.007 265)",
  "--accent-foreground": "oklch(0.955 0.003 265)",
  "--destructive": "oklch(0.7 0.16 15)",
  "--border": "oklch(1 0 0 / 9%)",
  "--input": "oklch(1 0 0 / 13%)",
  "--ring": "oklch(0.72 0.1 166)",
  "--brand": "oklch(0.76 0.11 166)",
  "--brand-foreground": "oklch(0.19 0.03 166)",
  "--brand-soft": "oklch(0.3 0.045 166)",
  "--success": "oklch(0.74 0.15 150)",
  "--success-ink": "oklch(0.83 0.12 152)",
  "--warn": "oklch(0.86 0.15 96)",
  "--warn-ink": "oklch(0.9 0.105 98)",
  "--chart-1": "oklch(0.76 0.11 166)",
  "--chart-2": "oklch(0.7 0.015 265)",
  "--sidebar": "oklch(0.145 0.004 265)",
  "--sidebar-foreground": "oklch(0.955 0.003 265)",
  "--sidebar-primary": "oklch(0.76 0.11 166)",
  "--sidebar-primary-foreground": "oklch(0.19 0.03 166)",
  "--sidebar-accent": "oklch(0.235 0.006 265)",
  "--sidebar-accent-foreground": "oklch(0.955 0.003 265)",
  "--sidebar-border": "oklch(1 0 0 / 8%)",
  "--sidebar-ring": "oklch(0.72 0.1 166)",
};

/* ------------------------------------------------------------------ */
/* token maths                                                         */
/* ------------------------------------------------------------------ */

const GEN = "src/lib/admin-theme/generate.ts";
const tokHit = (rule: string, detail: string, file = GEN): Hit => ({ file, line: 1, rule, detail });

/** Every check of DES-§16.2 on one surface input; `label` names it in the messages. */
function surfaceHits(label: string, input: SurfaceInput, mode: Mode): Hit[] {
  const hits: Hit[] = [];
  const t = generateColors(input, mode);
  const at = `${label}/${mode}/${input.contrast}`;
  for (const k of ADMIN_COLOR_TOKENS) {
    if (inOrangeBand(t[k])) hits.push(tokHit("band", `${at} ${k} ${formatOklch(t[k])} is in hue 25-75° with chroma > 0.06`));
  }
  const need = (fg: AdminColorToken, bg: AdminColorToken, min: number) => {
    const r = contrastRatio(t[fg], t[bg]);
    if (r < min) hits.push(tokHit("contrast", `${at} ${fg} on ${bg} is ${r.toFixed(2)}:1, needs ${min}:1`));
  };
  need("--foreground", "--background", input.contrast === "high" ? 12 : 7);
  need("--muted-foreground", "--background", 4.5);
  need("--muted-foreground", "--card", 4.5);
  need("--brand", "--background", 4.5);
  need("--brand-foreground", "--brand", 4.5);
  need("--primary-foreground", "--primary", 4.5);
  need("--imp-ink", "--imp-bg", 7);
  need("--bg-ribbon-ink", "--bg-ribbon", 4.5);
  for (const s of ["success", "warn", "destructive", "info"] as const) need(`--${s}-ink`, `--${s}-soft`, 4.5);
  // a dark hairline is an alpha white: measure it as painted over the ground
  const dl = Math.abs(over(t["--border"], t["--background"]).l - t["--background"].l);
  if (dl < 0.07) hits.push(tokHit("contrast", `${at} --border vs --background ΔL ${dl.toFixed(3)}, needs 0.07`));
  for (const k of ["--info", "--info-ink"] as const) {
    if (!t[k]) hits.push(tokHit("info", `${at} ${k} is missing`));
  }
  // blends: the hairline over the grounds, the monogram disc for every hue
  const fg = oklchToHex(t["--foreground"]);
  for (const ground of ["--background", "--card"] as const) {
    const hit = blendHit(fg, oklchToHex(t[ground]), BLEND_GUARD);
    if (hit) hits.push(tokHit("blend", `${at} hairline --foreground into ${ground} at t=${hit.t} (${hit.space}) is h ${hit.h.toFixed(1)} c ${hit.c.toFixed(3)}`));
  }
  const card = oklchToHex(t["--card"]);
  for (let raw = 0; raw < 360; raw += 0.5) {
    const ink = monogramInk(foldAllowedHue(raw), mode);
    if (inOrangeBand(ink)) {
      hits.push(tokHit("blend", `${at} monogram ink for hue ${raw} is ${formatOklch(ink)}`, "src/lib/admin-theme/monogram.ts"));
      break;
    }
    const hit = blendHit(oklchToHex(ink), card, BLEND_GUARD);
    if (hit) {
      hits.push(tokHit("blend", `${at} monogram disc for hue ${raw} at t=${hit.t} (${hit.space}) is h ${hit.h.toFixed(1)} c ${hit.c.toFixed(3)}`, "src/lib/admin-theme/monogram.ts"));
      break;
    }
  }
  return hits;
}

function fidelityHits(): Hit[] {
  const hits: Hit[] = [];
  for (const [mode, refs] of [["light", R10_LIGHT], ["dark", R10_DARK]] as const) {
    const t = generateColors(SURFACES.tenant, mode);
    for (const [k, ref] of Object.entries(refs) as [AdminColorToken, string][]) {
      const want = parseOklch(ref)!;
      const got = t[k];
      const alphaOff = Math.abs((got.alpha ?? 1) - (want.alpha ?? 1)) > 1e-9;
      const d = want.c === 0 && got.c === 0 ? Math.abs(got.l - want.l) : deltaE(got, want);
      if (d > 0.01 || alphaOff) hits.push(tokHit("fidelity", `tenant/${mode} ${k} ${formatOklch(got)} is ΔE ${d.toFixed(4)} from R1.0's ${ref}`));
    }
  }
  return hits;
}

/** The data-viz set: DES-§16.9 lists exactly CATEGORICAL, and `--chart-1..6` emit it in order. */
function categoricalHits(): Hit[] {
  const hits: Hit[] = [];
  const doc = read("docs/saas/spec/design.md");
  const m = /categorical \(≤ 6, from `CATEGORICAL`[^)]*\):\s*([^(]+)\(/.exec(doc);
  if (!m) return [tokHit("categorical", "DES-§16.9's categorical line was not found in docs/saas/spec/design.md")];
  const listed = m[1]!
    .split(",")
    .map((s) => s.replace(/\*/g, "").trim())
    .filter(Boolean)
    .map((s) => {
      const [id, hue] = s.split(/\s+/);
      return `${id}${hue ? ` ${hue}` : ""}`;
    })
    .sort();
  const ours = CATEGORICAL.map((c) => (c.id === "graphite" ? "graphite" : `${c.id} ${c.h}`)).sort();
  if (listed.join("|") !== ours.join("|")) hits.push(tokHit("categorical", `DES-§16.9 lists [${listed.join(", ")}], CATEGORICAL is [${ours.join(", ")}]`));
  if (CATEGORICAL.some((c) => c.h >= 280 && c.h <= 310)) hits.push(tokHit("categorical", "CATEGORICAL holds a violet: it belongs to impersonation (UX-26)"));
  for (const s of Object.values(SURFACES)) {
    for (const mode of MODES) {
      const t = generateColors(s, mode);
      CATEGORICAL.forEach((c, i) => {
        const tok = `--chart-${i + 1}` as AdminColorToken;
        if (deltaE(t[tok], { ...c[mode], h: c.h }) > 1e-9) hits.push(tokHit("categorical", `${tok} (${mode}) is not CATEGORICAL[${i}] (${c.id})`));
      });
    }
  }
  return hits;
}

/** Every oklch() literal of the admin CSS sources sits outside the band (hand-written tokens such as --auth-*). */
function literalHits(): Hit[] {
  const hits: Hit[] = [];
  for (const f of scan(ADMIN_CSS, [".css"])) {
    const src = read(f);
    for (const m of src.matchAll(/oklch\([^)]*\)/g)) {
      const o = parseOklch(m[0]);
      if (o && inOrangeBand(o)) hits.push({ file: f, line: lineAt(src, m.index), rule: "band", detail: `${m[0]} is in hue 25-75° with chroma > 0.06` });
    }
  }
  return hits;
}

/** The compiled stylesheet carries the generator's current blocks (build-admin-css.mjs injects them). */
function compiledHits(): Hit[] {
  const css = read(COMPILED);
  if (!css.includes(adminTokensCss({ minify: true }).trim())) {
    return [tokHit("compiled", `${COMPILED} does not carry the current generated tokens: run npm run css:admin`, COMPILED)];
  }
  for (const sel of ['[data-surface="console"]', ".dark"]) {
    if (!css.includes(sel)) return [tokHit("compiled", `${COMPILED} has no ${sel} block`, COMPILED)];
  }
  return [];
}

function tokenHits(): Hit[] {
  const hits: Hit[] = [];
  for (const [label, s] of Object.entries(SURFACES)) {
    for (const contrast of ["standard", "high"] as const) {
      for (const mode of MODES) hits.push(...surfaceHits(label, { ...s, contrast }, mode));
    }
  }
  return [...hits, ...fidelityHits(), ...categoricalHits(), ...literalHits(), ...compiledHits()];
}

/** The token maths' own fixtures: a bad surface must trip band, contrast and blend; the real ones must not. */
function tokenSelfTest(): string[] {
  const out: string[] = [];
  const bad: SurfaceInput = { base: { h: 50, c: 0.08 }, accent: { h: 45, c: 0.14 }, contrast: "standard" };
  const rules = new Set(surfaceHits("fixture", bad, "light").map((h) => h.rule));
  for (const r of ["band", "blend"]) if (!rules.has(r)) out.push(`the orange fixture surface did not fire ${r}`);
  const dim = generateColors(SURFACES.tenant, "light");
  if (contrastRatio(dim["--muted"], dim["--background"]) >= 4.5) out.push("contrast maths: muted on background should be < 4.5:1");
  if (Math.abs(contrastRatio({ l: 1, c: 0, h: 0 }, { l: 0, c: 0, h: 0 }) - 21) > 0.01) out.push("contrast maths: white on black is not 21:1");
  if (!inOrangeBand(parseOklch("oklch(0.7 0.15 50)")!)) out.push("band maths: oklch(0.7 0.15 50) is orange");
  if (inOrangeBand(parseOklch("oklch(0.7 0.05 50)")!)) out.push("band maths: chroma 0.05 is outside the band");
  if (foldAllowedHue(50) >= 22 && foldAllowedHue(50) <= 78) out.push("fold: hue 50 stayed in the band");
  const half = over({ l: 1, c: 0, h: 0, alpha: 0.5 }, { l: 0, c: 0, h: 0 });
  if (Math.abs(half.l - 0.5981) > 0.005) out.push(`compositing: white 50 % over black is L ${half.l.toFixed(3)}`);
  return out;
}

/* ------------------------------------------------------------------ */
/* file rules                                                          */
/* ------------------------------------------------------------------ */

/** feTurbulence also matches inside an encoded data URI ("%3CfeTurbulence"), so it has no leading word boundary. */
const AURORA = /\b(?:adm-aurora|adm-grain|aurora|mesh|grain)\b|feTurbulence/gi;
const RADIAL = /radial-gradient\(/g;
const PSEUDO_RULE = /([^{}]*::?(?:before|after)[^{}]*)\{([^{}]*)\}/g;
const COLOR_LITERAL =
  /#[0-9a-f]{3,8}\b|\b(?:oklch|oklab|rgba?|hsla?|lab|lch)\(|\b(?:bg|text|fill|stroke|from|to|via|border|ring)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-\d/gi;

const isChart = (file: string, src: string) =>
  /^src\/components\/(admin|console)\//.test(file) && (/(chart|funnel|spark)[^/]*\.tsx?$/i.test(file) || /from ["']recharts["']/.test(src));

function judge(file: string, raw: string): Hit[] {
  const css = file.endsWith(".css");
  const src = blankComments(raw, css ? "css" : "ts");
  const hits: Hit[] = [];
  const at = (i: number) => lineAt(src, i);
  for (const m of src.matchAll(AURORA)) hits.push({ file, line: at(m.index), rule: "aurora", detail: `"${m[0]}" (D60: no aurora, mesh or grain in the admin)` });
  for (const m of src.matchAll(/--ui-spring\b/g)) hits.push({ file, line: at(m.index), rule: "ui-spring", detail: "--ui-spring was deleted (DES-R17): use --ease-out" });
  if (css) {
    for (const m of src.matchAll(PSEUDO_RULE)) {
      const n = (m[2]!.match(RADIAL) ?? []).length;
      if (n >= 3) hits.push({ file, line: at(m.index + m[1]!.length), rule: "radial-stack", detail: `${n} radial-gradient layers on ${m[1]!.trim().slice(-60)}` });
    }
  } else {
    // Tailwind arbitrary values: before:bg-[radial-gradient(...),radial-gradient(...),...]
    for (const m of src.matchAll(/\b(?:before|after):[^\s"'`]*/g)) {
      const n = (m[0].match(RADIAL) ?? []).length;
      if (n >= 3) hits.push({ file, line: at(m.index), rule: "radial-stack", detail: `${n} radial-gradient layers in ${m[0].slice(0, 40)}…` });
    }
  }
  if (isChart(file, src)) {
    for (const m of src.matchAll(COLOR_LITERAL)) {
      hits.push({ file, line: at(m.index), rule: "chart-literal", detail: `"${m[0]}": charts read the --chart-n / status tokens (CATEGORICAL)` });
    }
  }
  return hits;
}

const FIXTURES: Fixture[] = [
  { name: "aurora class (R1.0 empty-state.tsx:28)", file: "src/components/admin/common/x.tsx", src: `<div className="adm-aurora adm-grain adm-fade" />`, expect: ["aurora"] },
  { name: "grain svg", file: "src/components/admin/styles/x.css", src: `:root{--g:url("data:image/svg+xml,%3Cfilter%3E%3CfeTurbulence/%3E")}`, expect: ["aurora"] },
  { name: "mesh word in JSX", file: "src/app/app/x.tsx", src: `const bg = "mesh";`, expect: ["aurora"] },
  { name: "ui-spring consumer", file: "src/app/globals.css", src: `.x{transition:transform 300ms var(--ui-spring)}`, expect: ["ui-spring"] },
  {
    name: "three radial layers on ::before",
    file: "src/components/admin/styles/x.css",
    src: `.hero::before{background:radial-gradient(a,b),radial-gradient(c,d),radial-gradient(e,f)}`,
    expect: ["radial-stack"],
  },
  { name: "three radial layers in a Tailwind before:", file: "src/components/admin/x.tsx", src: `<i className="before:bg-[radial-gradient(a),radial-gradient(b),radial-gradient(c)]" />`, expect: ["radial-stack"] },
  { name: "chart literal", file: "src/components/admin/dashboard/x-chart.tsx", src: `<Area stroke="#f97316" fill="oklch(0.7 0.1 50)" className="fill-emerald-500" />`, expect: ["chart-literal"] },
  { name: "comments are documentation", file: "src/app/x.tsx", src: `// no aurora, no grain, no mesh (D60)\n/* --ui-spring is gone */\nexport const ok = 1;`, expect: [] },
  { name: "one radial on ::before and two elsewhere", file: "src/components/admin/styles/x.css", src: `.a::before{background:radial-gradient(a,b)}.b{background:radial-gradient(a),radial-gradient(b),radial-gradient(c)}`, expect: [] },
  { name: "chart on tokens", file: "src/components/admin/dashboard/x-chart.tsx", src: `import { Area } from "recharts";\n<Area stroke="var(--chart-1)" fill="var(--brand)" />`, expect: [] },
  { name: "words that only contain the names", file: "src/components/admin/x.tsx", src: `const granular = "meshes"; const graining = 1;`, expect: [] },
];

/* ------------------------------------------------------------------ */
/* PENDING: files P2 does not own (CCR r1-p2-1, P0b P2-13)             */
/* ------------------------------------------------------------------ */

const PENDING: PendingEntry[] = [
  { path: "src/components/admin/media/media-library.tsx", rule: "aurora", owner: "maintainer (unowned in R1)", ccr: "r1-p2-1 §1" },
  { path: "src/components/admin/settings/market-form.tsx", rule: "aurora", owner: "maintainer (unowned in R1)", ccr: "r1-p2-1 §1" },
  { path: "src/components/admin/settings/sheets-wizard.tsx", rule: "aurora", owner: "P5", ccr: "r1-p2-1 §4" },
  { path: "src/components/admin/pages/pages-view.tsx", rule: "aurora", owner: "P3", ccr: "r1-p2-1 §3" },
  { path: "src/components/generate/step-details.tsx", rule: "aurora", owner: "P6", ccr: "r1-p2-1 §6" },
  { path: "src/components/generate/step-photos.tsx", rule: "aurora", owner: "P6", ccr: "r1-p2-1 §6" },
  { path: "src/components/builder/panels/ThemePanel.tsx", rule: "aurora", owner: "P6", ccr: "r1-p2-1 §6" },
];

const ROOTS = ["src/components", "src/app", "src/components/admin/styles"];

if (require.main === module) {
  const broken = tokenSelfTest();
  if (broken.length) {
    for (const b of broken) console.error(`${NAME} self-test: ${b}`);
    process.exit(2);
  }
  runLint({
    name: NAME,
    fixtures: FIXTURES,
    judge,
    files: () => scan(ROOTS, [".ts", ".tsx", ".css"]),
    pending: PENDING,
    extra: tokenHits,
  });
}
