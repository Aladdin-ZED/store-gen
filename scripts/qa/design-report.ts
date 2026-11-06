/**
 * `qa:design-report` (P6 DESIGN; design.md DES-§17.4, DS25, DES-§8.10, DES-§17.7, core §J.3). Local only: reads what
 * `qa:design-corpus` wrote under qa/design-corpus/out/ and prints
 *  - the DS25 table over the corpus (median and minimum Q, hard items after repair, median slop, the median distance of
 *    the 3 directions of a run, grammars seen over one fixture's runs, em / en dashes in generated copy, the median
 *    cliché density, the median specificity, the novelty verdict mix, the composition median);
 *  - the per-target table (the DES-§8.10 targets the corpus, the sweep and the render set measure: value, threshold,
 *    pass / fail, owning gate), the distinctness metrics (distinct in-flow sequences per 100, the top 4-gram share,
 *    first-screen tuples, the hero-family histogram per niche, archetype reach, pairing, display-face and strategy
 *    shares) and the capacity report;
 *  - the admin checks (`test:admin-tokens`, `test:admin-motion`, `test:admin-rtl`) from out/admin.json when present.
 *
 *   npm run qa:design-report [-- --out qa/design-corpus/out] [--json] [--no-regression]
 *
 * Writes out/report.json and out/report.md. Regression rule (core §J.3): against the previous report.json, any target
 * that passed and now fails, or a median Q drop > 3, exits 1. A DS25 miss is reported, never hidden: the owner records
 * the decision before the R1 exit (DG-09).
 */
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { unpackView } from "@/lib/design/distance";
import { FONT_TOKENS, PAIRING_TOKENS } from "@/lib/design/tokens-table";
import { COLOR_STRATEGIES, GRAMMARS } from "@/lib/design/genome";

const ROOT = resolve(__dirname, "..", "..");
const argv = process.argv.slice(2);
const opt = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const OUT = resolve(ROOT, opt("out") ?? "qa/design-corpus/out");

interface Dir {
  i: number;
  archetype: string;
  grammar: number;
  strategy: number;
  heroFamily: string | null;
  hero: string | null;
  pairing: number;
  displayFamily: number;
  arDisplay: number;
  q: number;
  slop: number;
  hard: string[];
  cliche: number;
  spec: number;
  dashes: number;
  composition: number;
  novelty: { platform: string; niche: string; clone: boolean };
  vec: number[];
}
interface Run {
  fixture: string;
  base: string;
  locale: string;
  photos: string;
  run: number;
  niche: string;
  chosen: number;
  pairwise: number[];
  dirs: Dir[];
}
interface Sweep {
  fixture: string;
  locale: string;
  seq: number[];
  hero: string | null;
  pairing: number;
  displayFamily: number;
  arDisplay: number;
  strategy: number;
  archetype: string;
  firstScreen: string;
}
interface Visual {
  name: string;
  group?: string;
  clipping: string[];
  overflow: { w390: number; w1440: number };
  fold: { measured: Record<string, number | null>; estimated: Record<string, number>; ok: boolean };
  fixedPx: number;
  sticky: { hiddenAtHero: boolean | null; shownAfter: boolean | null };
  rtl: string[];
  overlap: number;
  heights: { mobile: number; desktop: number; estimated: number };
}

const read = <T>(file: string): T | null => (existsSync(join(OUT, file)) ? (JSON.parse(readFileSync(join(OUT, file), "utf8")) as T) : null);
const median = (xs: number[]) => {
  if (!xs.length) return NaN;
  const s = xs.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};
const p95 = (xs: number[]) => (xs.length ? xs.slice().sort((a, b) => a - b)[Math.min(xs.length - 1, Math.ceil(xs.length * 0.95) - 1)]! : NaN);
const share = <T>(xs: readonly T[]) => {
  const m = new Map<T, number>();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  return [...m].map(([k, n]) => ({ k, share: n / Math.max(1, xs.length) })).sort((a, b) => b.share - a.share);
};
const entropy = <T>(xs: readonly T[]) => -share(xs).reduce((s, { share: p }) => s + (p > 0 ? p * Math.log2(p) : 0), 0);
const top = <T>(xs: readonly T[]) => share(xs)[0]?.share ?? 0;
const byNiche = (runs: readonly Run[]) => {
  const m = new Map<string, Dir[]>();
  for (const r of runs) {
    const d = r.dirs[r.chosen];
    if (d) m.set(r.niche, [...(m.get(r.niche) ?? []), d]);
  }
  return m;
};
const fmt = (v: number, digits = 2) => (Number.isFinite(v) ? v.toFixed(digits) : "n/a");
const pct = (v: number) => (Number.isFinite(v) ? `${(v * 100).toFixed(1)} %` : "n/a");

interface Row {
  id: string;
  what: string;
  value: string;
  threshold: string;
  pass: boolean | null;
  gate: string;
}

function main() {
  const runs = read<Run[]>("corpus.json") ?? [];
  const sweep = read<Sweep[]>("sweep.json") ?? [];
  const render = read<{ rows: Visual[]; ssim: { group: string; max: number }[] }>("render.json");
  const capacity = read<{ niche: string; pass: boolean; why: string[]; checkpoints: { n: number; mean: number; tau: number; fallbackShare: number }[] }[]>("capacity.json");
  const admin = read<Record<string, { pass: boolean; note?: string }>>("admin.json");
  if (!runs.length) {
    console.error(`design-report: no corpus at ${join(OUT, "corpus.json")} (run qa:design-corpus first)`);
    process.exit(1);
  }
  const dirs = runs.flatMap((r) => r.dirs);
  const chosen = runs.map((r) => r.dirs[r.chosen]).filter((d): d is Dir => !!d);

  // --- DS25 ---
  const qs = dirs.map((d) => d.q);
  const grammarsPerFixture = new Map<string, Set<number>>();
  for (const r of runs) for (const d of r.dirs) grammarsPerFixture.set(r.fixture, (grammarsPerFixture.get(r.fixture) ?? new Set()).add(d.grammar));
  const runsPerFixture = new Map<string, number>();
  for (const r of runs) runsPerFixture.set(r.fixture, (runsPerFixture.get(r.fixture) ?? 0) + 1);
  const fullFixtures = [...grammarsPerFixture].filter(([f]) => (runsPerFixture.get(f) ?? 0) >= 7);
  const grammarsSeen = fullFixtures.length ? Math.min(...fullFixtures.map(([, s]) => s.size)) : NaN;
  const verdicts = share(chosen.map((d) => (d.novelty.clone ? "clone" : d.novelty.platform === "too_close" || d.novelty.niche === "too_close" ? "too_close" : d.novelty.platform === "close" || d.novelty.niche === "close" ? "close" : "ok")));
  const ds25: Row[] = [
    { id: "DS25.q", what: "median Q", value: fmt(median(qs), 0), threshold: "≥ 82", pass: median(qs) >= 82, gate: "Q (DES-§8.5)" },
    { id: "DS25.qmin", what: "minimum Q", value: fmt(Math.min(...qs), 0), threshold: "≥ 70", pass: Math.min(...qs) >= 70, gate: "Q" },
    { id: "DS25.hard", what: "pages with hard items after repair", value: String(dirs.filter((d) => d.hard.length).length), threshold: "0", pass: dirs.every((d) => !d.hard.length), gate: "runGates + repairDoc" },
    { id: "DS25.slop", what: "median slop", value: fmt(median(dirs.map((d) => d.slop)), 1), threshold: "≤ 2", pass: median(dirs.map((d) => d.slop)) <= 2, gate: "slop (DES-§8.3)" },
    { id: "DS25.dist", what: "median distance of the 3 directions of a run", value: fmt(median(runs.flatMap((r) => r.pairwise)), 3), threshold: "≥ 0.35", pass: median(runs.flatMap((r) => r.pairwise)) >= 0.35, gate: "generator (DES-§14.2)" },
    { id: "DS25.grammars", what: "grammars over one fixture's runs (fixtures with ≥ 7 runs)", value: Number.isFinite(grammarsSeen) ? `${grammarsSeen} of 9` : "n/a", threshold: "≥ 7 of 9", pass: Number.isFinite(grammarsSeen) ? grammarsSeen >= 7 : null, gate: "priors + H33" },
    { id: "DS25.dashes", what: "em / en dashes in generated copy", value: String(dirs.reduce((s, d) => s + d.dashes, 0)), threshold: "0", pass: dirs.every((d) => d.dashes === 0), gate: "C (copy)" },
    { id: "DS25.cliche", what: "median cliché density per 100 words", value: fmt(median(dirs.map((d) => d.cliche)), 2), threshold: "≤ 0.5", pass: median(dirs.map((d) => d.cliche)) <= 0.5, gate: "clicheScore" },
    { id: "DS25.spec", what: "median specificity", value: fmt(median(dirs.map((d) => d.spec)), 2), threshold: "≥ 0.5", pass: median(dirs.map((d) => d.spec)) >= 0.5, gate: "C04 (D5)" },
    { id: "DS25.comp", what: "median composition score", value: fmt(median(dirs.map((d) => d.composition)), 1), threshold: "≥ 10 / 15", pass: median(dirs.map((d) => d.composition)) >= 10, gate: "V39 (C9)" },
    { id: "DS25.novelty", what: "novelty verdict mix of the chosen pages", value: verdicts.map((v) => `${v.k} ${pct(v.share)}`).join(", "), threshold: "report", pass: null, gate: "checkNovelty" },
  ];

  // --- per target (DES-§8.10) and the distinctness metrics ---
  const seqs = sweep.length ? sweep.map((s) => s.seq.join(",")) : chosen.map((d) => unpackView(d.vec).seq.join(","));
  const distinctPer100 = (new Set(seqs).size / Math.max(1, seqs.length)) * 100;
  const grams = new Map<string, number>();
  const pages = sweep.length ? sweep.map((s) => s.seq) : chosen.map((d) => unpackView(d.vec).seq);
  for (const seq of pages) {
    const seen = new Set<string>();
    for (let i = 0; i + 4 <= seq.length; i++) seen.add(seq.slice(i, i + 4).join(","));
    for (const g of seen) grams.set(g, (grams.get(g) ?? 0) + 1);
  }
  const top4 = Math.max(0, ...grams.values()) / Math.max(1, pages.length);
  const niches = byNiche(runs);
  const nicheTop = (f: (d: Dir) => unknown) => Math.max(0, ...[...niches.values()].filter((ds) => ds.length >= 5).map((ds) => top(ds.map(f))));
  const archetypes = sweep.length ? sweep.map((s) => s.archetype) : chosen.map((d) => d.archetype);
  const rows = render?.rows ?? [];
  const foldErr = rows.filter((r) => r.heights.mobile > 0 && r.heights.estimated > 0).map((r) => Math.abs(r.heights.mobile - r.heights.estimated) / r.heights.mobile);
  const targets: Row[] = [
    { id: "N1", what: "chosen pages too close or clones at their run", value: pct(chosen.filter((d) => d.novelty.clone || d.novelty.platform === "too_close" || d.novelty.niche === "too_close").length / Math.max(1, chosen.length)), threshold: "report (the wizard resamples)", pass: null, gate: "design:N1" },
    { id: "N3", what: "distinct in-flow sequences per 100 pages", value: fmt(distinctPer100, 0), threshold: "≥ 60", pass: distinctPer100 >= 60, gate: "grammar (DES-§5.7)" },
    { id: "N3.4gram", what: "top 4-section run share", value: pct(top4), threshold: "≤ 50 %", pass: top4 <= 0.5, gate: "choreography" },
    { id: "N4", what: "hero-family entropy (bits)", value: fmt(entropy(dirs.map((d) => d.heroFamily)), 2), threshold: "≥ 2.8", pass: entropy(dirs.map((d) => d.heroFamily)) >= 2.8, gate: "pools" },
    { id: "N5", what: "top archetype share", value: pct(top(archetypes)), threshold: "≤ 45 %", pass: top(archetypes) <= 0.45, gate: "priors" },
    { id: "C1", what: "top hero family per niche (chosen, niches ≥ 5 pages)", value: pct(nicheTop((d) => d.heroFamily)), threshold: "≤ 20 %", pass: niches.size ? nicheTop((d) => d.heroFamily) <= 0.2 : null, gate: "pools + H33" },
    { id: "K1", what: "top colour strategy per niche (chosen)", value: pct(nicheTop((d) => d.strategy)), threshold: "≤ 25 %", pass: niches.size ? nicheTop((d) => d.strategy) <= 0.25 : null, gate: "G9 + H33" },
    { id: "T4", what: "top Arabic display face (ar pages)", value: pct(top(runs.filter((r) => r.locale === "ar").flatMap((r) => r.dirs.map((d) => d.arDisplay)))), threshold: "≤ 30 %", pass: top(runs.filter((r) => r.locale === "ar").flatMap((r) => r.dirs.map((d) => d.arDisplay))) <= 0.3, gate: "F12 + H33" },
    { id: "T5", what: "top pairing / top Latin display family", value: `${pct(top(dirs.map((d) => d.pairing)))} / ${pct(top(dirs.map((d) => d.displayFamily)))}`, threshold: "≤ 25 % / ≤ 20 %", pass: top(dirs.map((d) => d.pairing)) <= 0.25 && top(dirs.map((d) => d.displayFamily)) <= 0.2, gate: "catalogue + H33" },
    { id: "R8", what: "pages at slop ≥ 6", value: String(dirs.filter((d) => d.slop >= 6).length), threshold: "0", pass: dirs.every((d) => d.slop < 6), gate: "design:R8" },
    { id: "C2", what: "rendered folds inside 844 px (image, price, CTA, COD)", value: rows.length ? pct(rows.filter((r) => r.fold.ok).length / rows.length) : "n/a", threshold: "report (calibration)", pass: null, gate: "V25 / budget:C2" },
    { id: "C2.err", what: "height estimate error p95 (mobile)", value: foldErr.length ? pct(p95(foldErr)) : "n/a", threshold: "≤ 10 % (QUAL-5)", pass: foldErr.length ? p95(foldErr) <= 0.1 : null, gate: "height model" },
    { id: "R7", what: "largest fixed-layer sum at 390", value: rows.length ? `${Math.max(...rows.map((r) => r.fixedPx))} px` : "n/a", threshold: "≤ 88 px", pass: rows.length ? rows.every((r) => r.fixedPx <= 88) : null, gate: "V27" },
    { id: "R7.sticky", what: "sticky bar shown while a hero CTA is on screen", value: rows.length ? String(rows.filter((r) => r.sticky.hiddenAtHero === false).length) : "n/a", threshold: "0", pass: rows.length ? rows.every((r) => r.sticky.hiddenAtHero !== false) : null, gate: "V27" },
    { id: "RTL1-5", what: "RTL1 / RTL2 / RTL5 findings on ar pages", value: rows.length ? String(rows.reduce((s, r) => s + r.rtl.length, 0)) : "n/a", threshold: "0", pass: rows.length ? rows.every((r) => !r.rtl.length) : null, gate: "Price / Countdown / footer" },
    { id: "RTL6", what: "pages with clipped text", value: rows.length ? String(rows.filter((r) => r.clipping.length).length) : "n/a", threshold: "0", pass: rows.length ? rows.every((r) => !r.clipping.length) : null, gate: "clip check" },
    { id: "overflow", what: "pages with horizontal overflow", value: rows.length ? String(rows.filter((r) => r.overflow.w390 > 0 || r.overflow.w1440 > 0).length) : "n/a", threshold: "0", pass: rows.length ? rows.every((r) => r.overflow.w390 <= 0 && r.overflow.w1440 <= 0) : null, gate: "visual" },
    { id: "overlap", what: "pages with text overlap between blocks", value: rows.length ? String(rows.filter((r) => r.overlap > 0).length) : "n/a", threshold: "0", pass: rows.length ? rows.every((r) => r.overlap === 0) : null, gate: "visual" },
    { id: "SSIM", what: "runs whose 390 folds are near-duplicates (SSIM > 0.92)", value: render?.ssim.length ? String(render.ssim.filter((s) => s.max > 0.92).length) : "n/a", threshold: "0", pass: render?.ssim.length ? render.ssim.every((s) => s.max <= 0.92) : null, gate: "generator" },
  ];

  const distinct = {
    pages: pages.length,
    distinctPer100,
    top4,
    firstScreens: new Set(sweep.length ? sweep.map((s) => s.firstScreen) : chosen.map((d) => `${d.hero}|${d.displayFamily}|${d.strategy}`)).size,
    heroFamilies: Object.fromEntries([...niches].map(([n, ds]) => [n, share(ds.map((d) => d.heroFamily)).map((x) => `${x.k} ${pct(x.share)}`)])),
    archetypeReach: Object.fromEntries([...new Set(runs.map((r) => r.base))].map((b) => [b, new Set(runs.filter((r) => r.base === b).flatMap((r) => r.dirs.map((d) => d.archetype))).size])),
    pairings: share(dirs.map((d) => PAIRING_TOKENS[d.pairing] ?? String(d.pairing))).slice(0, 8).map((x) => `${x.k} ${pct(x.share)}`),
    displayFaces: share(dirs.map((d) => FONT_TOKENS[d.displayFamily] ?? "-")).slice(0, 8).map((x) => `${x.k} ${pct(x.share)}`),
    strategies: share(dirs.map((d) => COLOR_STRATEGIES[d.strategy] ?? "-")).map((x) => `${x.k} ${pct(x.share)}`),
    grammars: share(dirs.map((d) => GRAMMARS[d.grammar] ?? "-")).map((x) => `${x.k} ${pct(x.share)}`),
  };

  const report = { generatedAt: new Date().toISOString(), runs: runs.length, pages: dirs.length, medianQ: median(qs), ds25, targets, distinct, capacity, admin };
  const prevFile = join(OUT, "report.json");
  const regressions: string[] = [];
  if (existsSync(prevFile) && !argv.includes("--no-regression")) {
    const prev = JSON.parse(readFileSync(prevFile, "utf8")) as typeof report;
    for (const r of [...report.ds25, ...report.targets]) {
      const before = [...prev.ds25, ...prev.targets].find((x) => x.id === r.id);
      if (before?.pass === true && r.pass === false) regressions.push(`${r.id} passed before, fails now (${r.value})`);
    }
    if (Number.isFinite(prev.medianQ) && prev.medianQ - report.medianQ > 3) regressions.push(`median Q ${fmt(prev.medianQ, 0)} → ${fmt(report.medianQ, 0)} (drop > 3)`);
    copyFileSync(prevFile, join(OUT, "report.prev.json"));
  }
  writeFileSync(prevFile, JSON.stringify(report, null, 1));

  const table = (title: string, list: Row[]) =>
    [`## ${title}`, "", "| id | measure | value | threshold | result | gate |", "|---|---|---|---|---|---|", ...list.map((r) => `| ${r.id} | ${r.what} | ${r.value} | ${r.threshold} | ${r.pass === null ? "report" : r.pass ? "pass" : "FAIL"} | ${r.gate} |`), ""].join("\n");
  const md = [
    `# Design report · ${report.generatedAt.slice(0, 10)}`,
    "",
    `${runs.length} runs · ${dirs.length} pages · ${sweep.length} sweep plans · ${rows.length} rendered pages`,
    "",
    table("DS25", ds25),
    table("Targets (DES-§8.10)", targets),
    "## Distinctness",
    "",
    "```json",
    JSON.stringify(distinct, null, 1),
    "```",
    "",
    "## Capacity (DES-§17.7)",
    "",
    capacity ? capacity.map((c) => `- ${c.niche}: ${c.pass ? "pass" : `FAIL ${c.why.join("; ")}`} · ${c.checkpoints.map((p) => `n ${p.n} fallback ${pct(p.fallbackShare)} d̄ ${fmt(p.mean, 3)}`).join(" · ")}`).join("\n") : "- not run (qa:design-corpus --capacity)",
    "",
    "## Admin checks",
    "",
    admin ? Object.entries(admin).map(([k, v]) => `- ${k}: ${v.pass ? "pass" : "FAIL"}${v.note ? ` (${v.note})` : ""}`).join("\n") : "- not recorded (out/admin.json: the results of test:admin-tokens, test:admin-motion, test:admin-rtl on the same build)",
    "",
    regressions.length ? `## Regressions\n\n${regressions.map((r) => `- ${r}`).join("\n")}\n` : "",
  ].join("\n");
  writeFileSync(join(OUT, "report.md"), md);
  if (argv.includes("--json")) console.log(JSON.stringify(report, null, 1));
  else console.log(md);
  if (regressions.length) {
    console.error(`design-report: ${regressions.length} regression(s)`);
    process.exit(1);
  }
}

main();
