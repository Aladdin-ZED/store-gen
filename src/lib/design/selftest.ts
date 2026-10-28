/**
 * The design test groups (P6 DESIGN; design.md DES-§25.1 `test:design`, DES-§1.4). Each group is registered here and
 * run by scripts/qa/design-check.ts: the seeded fast subset inside `npm test`, the full sweeps with `--full`
 * (`test:design:full`, in `test:slow`). A group names the acceptance ids it proves.
 *
 * Step 1 (theme and type engine) registers the first groups:
 *  - typography: `typeTokens` keeps T1 / T3 / T6 / V15 for every pairing × locale from `metrics.ar` or the fallback,
 *    never calls a fallback value "measured", and costs ≤ 0.2 ms (DES-§10.5, DES-§19);
 *  - N7: two pairings with different Arabic display faces never share (`--lp-ar-scale`, `--lp-display-lh`) unless
 *    their Arabic metrics are equal;
 *  - brand colour: `nearestAllowed` never returns a colour in the guard band, picks the minimum ΔE among its
 *    candidates and is idempotent (BK-1 unit part); the gold band path of the accent and pop roles;
 *  - colour plans: H25 pops, the H34 "sand + signal" fixtures (argan gold, honey, saffron);
 *  - look tokens: the radius ladder (DG-03 token half), `em: "none"`, locks with G23, the look attributes;
 *  - back-compat: a document without look keeps today's tokens and attributes outside the reviewed allow-list
 *    (DS4; the archetype × pairing × base matrix and the builder overrides; the fixtures run in `test:render`).
 */
import { ARCHETYPES, ThemeLook, ThemeSpec, type Locale } from "@/lib/page/schema";
import { allowedForRole, nearestAllowed } from "@/lib/theme/brand-color";
import { deltaE, fromOklch, nearOrange, noOrange, toOklch, type Hex } from "@/lib/theme/color";
import { goldBand, planPalette, popRuleViolation, sandSignal, COLOR_PLANS } from "@/lib/theme/palette";
import { mulberry32 } from "@/lib/theme/rng";
import { buildTheme } from "@/lib/theme";
import { LADDER_PX } from "@/lib/theme/tokens";
import { loadCatalogue } from "./pairings";
import { arabicMetrics, arabicMetricsLabel, PRICE_NUMERALS, typeTokens, type TypeLook } from "./typography";

export interface GroupCtx {
  /** `--full` (test:design:full) */
  full: boolean;
  /** counts a check; a false condition is one failure with the message */
  check(cond: unknown, message: string): void;
  /** a line of the group's report */
  note(message: string): void;
}

export interface DesignGroup {
  id: string;
  title: string;
  /** the acceptance ids of DES-§1.4 the group proves */
  ids: readonly string[];
  run(ctx: GroupCtx): void | Promise<void>;
}

export const DESIGN_GROUPS: DesignGroup[] = [];
/** Registers a group (a later step's module adds its own groups here). */
export function registerDesignGroup(g: DesignGroup): void {
  if (DESIGN_GROUPS.some((x) => x.id === g.id)) throw new Error(`design group ${g.id} registered twice`);
  DESIGN_GROUPS.push(g);
}

const LOCALES: readonly Locale[] = ["ar", "fr", "en"];

/** G5 / G6 extremes and a middle look (the typography engine must hold on every one). */
const TYPE_LOOKS: readonly TypeLook["type"][] = [
  { rm: 1.125, rd: 1.2, dmax: 48, w: 400, wAr: 400, tk: 0, dc: "none", lb: "plain", nu: "lining" },
  { rm: 1.25, rd: 1.5, dmax: 160, w: 700, wAr: 700, tk: 0.03, dc: "uppercase", lb: "mono", nu: "oldstyle" },
  { rm: 1.2, rd: 1.333, dmax: 96, w: 500, wAr: 500, tk: 0.015, dc: "none", lb: "smallcaps", nu: "oldstyle" },
  { rm: 1.125, rd: 1.5, dmax: 120, w: 300, wAr: 300, tk: 0.02, dc: "none", lb: "plain", nu: "lining" },
];

registerDesignGroup({
  id: "typography",
  title: "typeTokens: T1 / T3 / T6 / V15 per pairing × locale, never 'measured' from the fallback",
  ids: ["DG-08"],
  run({ check, note }) {
    const cat = loadCatalogue();
    let calls = 0;
    let ms = 0;
    let fallbackFaces = 0;
    for (const p of cat.pairings) {
      for (const locale of LOCALES) {
        for (const type of TYPE_LOOKS) {
          const look = { type: { ...type, w: p.displayWeight, wAr: p.displayWeightAr } };
          const t0 = performance.now();
          const tt = typeTokens(p, look, locale);
          ms += performance.now() - t0;
          calls++;
          const at = `${p.id} ${locale} rm ${type.rm} rd ${type.rd} dmax ${type.dmax}`;
          // T6: the hero display ≥ 44 px at 390; V15: display / body ≥ 2.5 at both ends
          check(tt.heroAt390 >= 44, `${at}: hero ${tt.heroAt390.toFixed(1)} px at 390 (T6 ≥ 44)`);
          check(tt.ratio.m >= 2.5 && tt.ratio.d >= 2.5, `${at}: display / body ${tt.ratio.m.toFixed(2)} / ${tt.ratio.d.toFixed(2)} (V15 ≥ 2.5)`);
          // the steps grow
          for (let n = 0; n <= 6; n++) check(tt.steps[n]!.m >= tt.steps[n - 1]!.m - 1e-9 && tt.steps[n]!.d >= tt.steps[n - 1]!.d - 1e-9, `${at}: step ${n} below step ${n - 1}`);
          // T1: lining figures unless old-style running copy on a serif body Latin page; prices always tabular lining
          const nu = tt.vars["lp-num-copy"];
          check(nu === "lining-nums" || (nu === "oldstyle-nums" && locale !== "ar" && type.nu === "oldstyle"), `${at}: --lp-num-copy ${nu} (T1)`);
          // T3: Arabic display leading from the marks, padding against the line above, body ≥ 1.6; no Arabic tracking
          if (locale === "ar") {
            check(tt.displayLh >= 1.25 && tt.displayPad >= 0.12 && tt.bodyLh >= 1.6, `${at}: Arabic lh ${tt.displayLh.toFixed(3)} pad ${tt.displayPad} body ${tt.bodyLh} (T3)`);
            if (p.displayAr === "el-messiri") check(tt.displayLh >= 1.32, `${at}: tall-mark face at lh ${tt.displayLh.toFixed(3)} (F13 ≥ 1.32)`);
            check(tt.vars["lp-display-tracking"] === "0em" && tt.vars["lp-label-tracking"] === "0em" && tt.vars["lp-display-case"] === "none", `${at}: Arabic tracking or case`);
          } else check(tt.displayLh >= 1.02 && tt.displayLh <= 1.1, `${at}: Latin display lh ${tt.displayLh.toFixed(3)} (1.02-1.10)`);
          check(tt.arScale >= 1.04 && tt.arScale <= 1.14, `${at}: --lp-ar-scale ${tt.arScale} (1.04-1.14)`);
          // never "measured" from the fallback: the source and its label agree with the metrics table
          const src = arabicMetrics(p.displayAr)?.source;
          check(src !== undefined, `${at}: ${p.displayAr} has no Arabic metrics`);
          if (src === "fallback") check(arabicMetricsLabel(tt.arSource ?? "fallback") === "tuned" && tt.arSource !== "measured", `${at}: a fallback value labelled measured`);
          // every value is finite and safe to inline
          for (const [k, v] of Object.entries(tt.vars)) check(!/NaN|Infinity|undefined/.test(v), `${at}: --${k} = ${v}`);
        }
      }
      if (arabicMetrics(p.displayAr)?.source === "fallback") fallbackFaces++;
    }
    check(PRICE_NUMERALS === "tabular-nums lining-nums", "PRICE_NUMERALS");
    check(arabicMetricsLabel("fallback") === "tuned" && arabicMetricsLabel("measured") === "measured", "arabicMetricsLabel");
    const per = ms / Math.max(1, calls);
    check(per <= 0.2, `typeTokens ${per.toFixed(3)} ms per call (≤ 0.2 ms, DES-§19)`);
    note(`${calls} typeTokens calls (${cat.pairings.length} pairings × ${LOCALES.length} locales × ${TYPE_LOOKS.length} looks) at ${per.toFixed(3)} ms; ${fallbackFaces} pairings on the tuned Arabic fallback`);
  },
});

registerDesignGroup({
  id: "n7",
  title: "N7: (--lp-ar-scale, --lp-display-lh) differs between Arabic display faces with different metrics",
  ids: ["DG-08"],
  run({ check, note }) {
    const cat = loadCatalogue();
    const look = { type: TYPE_LOOKS[2]! };
    const rows = cat.pairings.map((p) => {
      const tt = typeTokens(p, { type: { ...look.type, w: p.displayWeight, wAr: p.displayWeightAr } }, "ar");
      return { id: p.id, face: p.displayAr, key: `${tt.vars["lp-ar-scale"]}|${tt.vars["lp-display-lh"]}` };
    });
    const metrics = (face: string) => JSON.stringify(arabicMetrics(face)?.metrics ?? null);
    let pairs = 0;
    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        const a = rows[i]!;
        const b = rows[j]!;
        if (a.face === b.face) continue;
        pairs++;
        check(a.key !== b.key || metrics(a.face) === metrics(b.face), `${a.id} (${a.face}) and ${b.id} (${b.face}) share ${a.key} with different Arabic metrics`);
      }
    }
    note(`${new Set(rows.map((r) => r.key)).size} distinct (ar-scale, display-lh) tuples over ${rows.length} pairings; ${pairs} cross-face pairs compared`);
  },
});

/** Every colour of a sweep: hues every 3°, lightness and chroma on a grid, plus seeded random sRGB. */
function colourSweep(full: boolean): Hex[] {
  const out: Hex[] = [];
  const step = full ? 1 : 3;
  for (let h = 0; h < 360; h += step) for (const l of [0.25, 0.4, 0.55, 0.7, 0.82, 0.92]) for (const c of [0.03, 0.065, 0.1, 0.16, 0.24]) out.push(fromOklch({ l, c, h }));
  const rnd = mulberry32(0xb4a2d);
  for (let i = 0; i < (full ? 20000 : 3000); i++) out.push(`#${Math.floor(rnd() * 0xffffff).toString(16).padStart(6, "0")}`);
  return out;
}

registerDesignGroup({
  id: "brand-color",
  title: "nearestAllowed: never in the guard band, minimum ΔE among its candidates, idempotent; the gold path",
  ids: ["BK-1"],
  run({ full, check, note }) {
    let moved = 0;
    let n = 0;
    for (const hex of colourSweep(full)) {
      n++;
      const r = nearestAllowed(hex);
      check(!nearOrange(toOklch(r.hex)), `${hex} → ${r.hex} is in the guard band`);
      check(nearestAllowed(r.hex).hex === r.hex && !nearestAllowed(r.hex).moved, `${hex}: not idempotent (${r.hex} → ${nearestAllowed(r.hex).hex})`);
      if (!r.moved) {
        check(r.hex === hex.toLowerCase() && r.side === null && r.deltaE === 0, `${hex}: an allowed colour was changed`);
        continue;
      }
      moved++;
      // the candidates of DES-§12.4; the winner has the minimum ΔE, ties to muted
      const o = toOklch(hex);
      const mutedSteps = o.l >= 0.8 ? [0.038, 0.032, 0.025] : [0.056, 0.05, 0.042];
      const muted = mutedSteps.map((c) => fromOklch({ l: o.l, c, h: o.h })).find((x) => !nearOrange(toOklch(x))) ?? fromOklch({ l: o.l, c: 0.02, h: o.h });
      const cands = { muted, low: noOrange(hex, "low"), high: noOrange(hex, "high") };
      const best = Math.min(...Object.values(cands).map((c) => deltaE(hex, c)));
      check(Math.abs(r.deltaE - best) < 1e-9, `${hex}: ΔE ${r.deltaE} is not the minimum ${best}`);
      check(r.hex === cands[r.side as keyof typeof cands], `${hex}: side ${r.side} does not name the returned candidate`);
      if (Math.abs(deltaE(hex, muted) - best) < 1e-12) check(r.side === "muted", `${hex}: a tie did not go to muted`);
    }
    // the gold band of the accent and pop roles: sand + signal; a neutral may stay in the band at C ≤ 0.06
    const gold = fromOklch({ l: 0.72, c: 0.14, h: 88 });
    for (const role of ["accent", "pop"] as const) {
      const g = allowedForRole(gold, role);
      check(g.band === "gold" && !goldBand(g.hex) && !nearOrange(toOklch(g.hex)) && g.sand && toOklch(g.sand).c <= 0.06, `argan gold as ${role} → ${g.hex} (sand ${g.sand})`);
    }
    check(allowedForRole(gold, "neutral").band === null && allowedForRole(gold, "neutral").hex === gold, "argan gold as a neutral is changed");
    note(`${n} colours, ${moved} moved out of the guard band`);
  },
});

registerDesignGroup({
  id: "color-plans",
  title: "G9 plans: H25 pops, the H34 sand + signal fixtures (argan gold, honey, saffron)",
  ids: ["DG-02", "DG-03"],
  run({ check, note }) {
    // DES-§4.10 worked example: dominant oklch(0.72 0.14 88) argan gold, oklch(0.62 0.13 78) honey,
    // oklch(0.66 0.17 60) saffron (inside the forbidden band, so nearestAllowed moves it first)
    const fixtures = { "argan-gold": fromOklch({ l: 0.72, c: 0.14, h: 88 }), honey: fromOklch({ l: 0.62, c: 0.13, h: 78 }), saffron: fromOklch({ l: 0.66, c: 0.17, h: 60 }) };
    let checks = 0;
    for (const [name, dominant] of Object.entries(fixtures)) {
      const accent0 = nearestAllowed(dominant).hex;
      for (const cs of Object.keys(COLOR_PLANS) as (keyof typeof COLOR_PLANS)[]) {
        const plan = COLOR_PLANS[cs];
        const p = planPalette({ accent: accent0, base: plan.bases[0]!, harmony: plan.harmonies[0]! }, cs, { archetype: "souk" });
        checks++;
        for (const [role, hex] of [["accent", p.accent], ["pop", p.pop]] as const) {
          const o = toOklch(hex);
          check(!(o.c > 0.1 && o.h >= 22 && o.h <= 95), `${name}/${cs}: ${role} ${hex} (h ${o.h.toFixed(0)}°, C ${o.c.toFixed(3)}) in 22-95° at C > 0.10`);
          check(!nearOrange(o), `${name}/${cs}: ${role} ${hex} orange`);
        }
        check(!popRuleViolation(p.accent, p.pop, cs), `${name}/${cs}: ${popRuleViolation(p.accent, p.pop, cs)}`);
      }
      const s = sandSignal(nearestAllowed(dominant).hex);
      if (goldBand(accent0)) check(toOklch(s.sand).c <= 0.06 && Math.abs(s.neutralHue - toOklch(accent0).h) < 1e-6, `${name}: the gold is kept as the sand neutral`);
    }
    // argan gold → olive accent (the analogue outside the band), AA-capable on sand
    const argan = sandSignal(fixtures["argan-gold"]);
    const ao = toOklch(argan.accent);
    check(argan.family === "olive" && ao.h >= 110 && ao.h <= 130, `argan gold: accent ${argan.accent} is not olive (h ${ao.h.toFixed(0)}°)`);
    note(`${checks} planned palettes on the three gold fixtures: no accent or pop in 22-95° at C > 0.10, H25 kept`);
  },
});

registerDesignGroup({
  id: "look-tokens",
  title: "look tokens: the radius ladder (DG-03), em none, locks with G23, the look attributes only with look",
  ids: ["DG-03"],
  async run({ check, note }) {
    // the four ladders: chip < control ≤ card < media in effective radius, pills exempt, mixed media is a mask (0)
    for (const [ladder, [chip, control, card, media]] of Object.entries(LADDER_PX)) {
      if (chip < 999) check(chip < control, `${ladder}: chip ${chip} ≥ control ${control}`);
      check(control <= card, `${ladder}: control ${control} > card ${card}`);
      if (ladder === "mixed") check(control <= 8 && media === 0, `mixed: control ${control} (≤ 8) and media ${media} (the rect / cut mask)`);
      else check(card < media, `${ladder}: card ${card} ≥ media ${media}`);
    }
    // ThemeLook accepts em "none" and a G23 lock; "none" emits no emphasis device
    const look = ThemeLook.parse({
      v: 1,
      g: "stage",
      grid: { c: 12, s: "5:7", m: "wide", w: 1200, u: 8 },
      type: { rm: 1.2, rd: 1.333, dmax: 96, w: 600, wAr: 600, tk: 0.01, dc: "none", lb: "plain", nu: "lining" },
      cs: "ink+one",
      area: 0.05,
      hc: false,
      ladder: "soft",
      corner: "circle",
      hair: { w: 1, s: 0.14 },
      depth: "hairline",
      glass: 0,
      mask: "cut",
      img: "framed-stage",
      dens: "balanced",
      space: 1,
      align: "mixed",
      mo: { f: "quart", d: 420, r: ["fade-rise"], st: 50, sc: false, scope: "heads" },
      kit: { gl: "none", nb: "plain", cap: "plain" },
      em: "none",
      btn: "solid",
      locks: ["G23"],
    });
    const base = ThemeSpec.parse({
      archetype: "apothecary",
      seed: 3,
      palette: { accent: "#2f6f63", pop: "#a8c9bd", base: "light", harmony: "clay-sage" },
      fonts: { display: "schibsted-grotesk", body: "schibsted-grotesk", accent: "jetbrains-mono", displayAr: "alexandria", bodyAr: "ibm-plex-sans-arabic" },
      surfaces: "panels",
    });
    const plain = buildTheme(base, "fr");
    const withLook = buildTheme({ ...base, look }, "fr");
    check(withLook.attrs["data-emphasis"] === "none" && withLook.attrs["data-mask"] === "cut" && withLook.attrs["data-look"] === "1", `look attributes ${JSON.stringify(withLook.attrs)}`);
    check(plain.attrs["data-look"] === undefined && plain.attrs["data-grammar"] === undefined && plain.tokens["lp-radius-chip"] === undefined, "look attributes or tokens on a document without look");
    check(withLook.tokens["lp-radius-control"] === "10px" && withLook.tokens["lp-radius-chip"] === "6px", `soft ladder tokens ${withLook.tokens["lp-radius-chip"]} / ${withLook.tokens["lp-radius-control"]}`);
    check(withLook.attrs["data-surfaces"] === "panels", "an explicit builder surfaces choice must win over the look (DS4)");
    check(buildTheme({ ...base, surfaces: "archetype", look: { ...look, depth: "ambient" } }, "fr").attrs["data-surfaces"] === "flush", "H26: panels with raised cards");
    check(withLook.attrs["data-texture"] === "none" && buildTheme({ ...base, texture: "grain" }, "fr").attrs["data-texture"] === "none", "grain rendered (D60)");
    note(`4 ladders; look attributes, em none, G23 lock, H26 and DS4 precedence on a built theme`);
  },
});

registerDesignGroup({
  id: "legacy-themes",
  title: "back-compat: a document without look keeps today's tokens and attributes (allow-list: DS28, D60)",
  ids: ["DG-02", "DG-03"],
  async run({ check, note }) {
    // the harness module lives in scripts/qa (it reads the recorded file with node:fs)
    const { compareSet, readGolden, LEGACY_ALLOW } = await import("../../../scripts/qa/design-legacy-theme");
    const golden = readGolden();
    check(golden !== null, "src/lib/design/calibration/legacy-theme.json is missing");
    const diffs = compareSet("matrix", golden);
    check(diffs.length === 0, `${diffs.length} key(s) differ`);
    for (const d of diffs) check(false, d);
    note(`${ARCHETYPES.length} archetypes × their legacy pairings × light / dark and 3 builder overrides each, ar + fr: ${Object.keys(golden?.sets.matrix ?? {}).length} recorded keys, ${diffs.length} difference(s) outside the ${LEGACY_ALLOW.length} allow-list entries`);
  },
});
