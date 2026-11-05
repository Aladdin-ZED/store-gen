/**
 * The gates test groups (P6 DESIGN step 8; design.md DES-§25.1 `test:design`, DES-§1.4 DG-06, TC-1, RD-1, GN-1 and the
 * hard-item clause of DG-12). Registered with ./selftest and run by scripts/qa/design-check.ts (fast subset; `--full`
 * runs every seed and every fixture × locale).
 *
 *  - tc1: every design-owned hard target of DES-§8.10 has a failing and a passing fixture (the passing side is a
 *    generated direction after the wizard repair); the X Pulse (T7), "02 يومين" (RTL2) and Bodoni old-style price (T1)
 *    rows are render checks and live in test:render (scripts/qa/render-cases/design.ts);
 *  - calibration: the rev 3 fixtures (poster centred display sections, the 6-question FAQ, the round ladder with a
 *    pill chip, the dark-luxe perfume fold, four splits in a row, gold accents → sand + signal, the one-asset page);
 *  - q: the anchors (the bland clean page = 80, the keep-list pages ≥ 85, the baseline-like pages ≤ 40) and the slop
 *    lines (baseline-like ≥ 6, keep-list ≤ 2);
 *  - repairs: the slop page ≥ 6 → ≤ 2, idempotent, ≤ 30 ms, library lines never hard for N8 / D3, owner text untouched;
 *    runGates ≤ 8 ms p95;
 *  - items: `toGateItem` ids are `design:*`, every title exists in ar / fr / en, no em dash or "Step n" in a value;
 *  - digest: renderDigest fields equal the gate inputs on 20 docs, the GenomeCard carries bands only, the critique
 *    input carries no owner text or contact data;
 *  - explain: four separate chips (no `·`), ≥ 6 distinct why lines per locale over the sweep, no line names a fact the
 *    digest or the photo facts do not carry;
 *  - kinds: gateInputFor on a defaultTemplate-style document of every store kind → 0 hard items, no pool for utility kinds;
 *  - seeds: ≥ 44 seeds, 4 per archetype with distinct grammars, parameters only; each compiles with Q ≥ 85 and 0 hard
 *    items (one per archetype fast, all 44 full); Bolder and Calmer never add a hard item.
 */
import { messages as AR } from "@/lib/i18n/admin/ar/design";
import { messages as EN } from "@/lib/i18n/admin/en/design";
import { messages as FR } from "@/lib/i18n/admin/fr/design";
import { bigWordOf } from "@/landing/sections/hero/copy";
import { FIXTURE_NAMES, type FixtureName } from "@/lib/page/fixtures";
import { ARCHETYPES, type PageDoc } from "@/lib/page/schema";
import { buildTheme } from "@/lib/theme";
import { designDirection, generateDirections, photoFactsOf } from "@/lib/generator/directions";
import { boldnessStep, remixDoc } from "@/lib/generator/remix";
import { genomeOf } from "./derive";
import { critiqueSummary, genomeCard, GenomeCardSchema, renderDigest } from "./digest";
import { explainGenome, whyText } from "./explain";
import { baselineDoc, cleanDoc, directionsOf, factsOf, FIXTURE_META, fixtureInput, gateInputOf, insertAfterHero, mutate, NOVELTY_OK, slopDoc, storeTemplate } from "./fixtures/prepublish";
import { gateInputFor, KIND_GATES } from "./gate-input";
import { applyOps, gateItemsOf, pageView, qScore, repairDoc, runGates, toGateItem } from "./gates";
import type { DesignGateItem, GateInput, GateReport, StorePageKind } from "./gates/types";
import type { DesignGenome } from "./genome";
import { DESIGNER_SEEDS } from "./seeds";
import { registerDesignGroup } from "./selftest";

const ids = (r: GateReport) => [...r.hard, ...r.soft, ...r.info, ...r.slop.items];
const hardOf = (r: GateReport, id: string) => r.hard.filter((i) => i.id === id || i.target === id);
const has = (r: GateReport, id: string) => ids(r).some((i) => i.id === id || i.target === id);
const sec = (id: string, type: string, variant: string, bg: PageDoc["sections"][number]["bg"], data: Record<string, unknown> = {}) => ({ id, type, variant, bg, divider: "auto" as const, spacing: "normal" as const, hidden: false, data });
const p95 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * 0.95))]!;
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;

/** The clean fixture pages (memoised per run). */
const CLEAN = new Map<string, PageDoc>();
const clean = (name: FixtureName = "parfum", locale: "ar" | "fr" = "fr", which = 0) => {
  const k = `${name}|${locale}|${which}`;
  if (!CLEAN.has(k)) CLEAN.set(k, cleanDoc(name, locale, which));
  return structuredClone(CLEAN.get(k)!);
};
const gate = (doc: PageDoc, over: Partial<GateInput> = {}) => runGates(gateInputOf(doc, over));

/* ------------------------------------------------------------------ */
/* TC-1: the hard targets, failing and passing                         */
/* ------------------------------------------------------------------ */

registerDesignGroup({
  id: "tc1",
  title: "TC-1: every design-owned hard target of DES-§8.10 fails on its fixture and passes on the clean page",
  ids: ["DG-06", "TC-1"],
  run({ check, note }) {
    const base = clean();
    const ok = gate(base);
    check(ok.hard.length === 0, `the clean page has hard items: ${ok.hard.map((i) => i.id).join(", ")}`);
    const look = base.theme.look!;
    const theme = buildTheme(base.theme, base.locale);
    const lookDoc = (patch: Partial<typeof look>) => mutate(base, (d) => (d.theme.look = { ...d.theme.look!, ...patch }));
    type Case = { target: string; fail: () => GateReport };
    const flowIdx = (d: PageDoc) => d.sections.map((s, i) => ({ s, i })).filter(({ s }) => !["announcement", "header", "footer", "stickyCta", "whatsappFloat"].includes(s.type));
    const cases: Case[] = [
      { target: "V01", fail: () => gate(base, { theme: { ...theme, tokens: { ...theme.tokens, "base:sec-ink": theme.tokens["base:sec-bg"] ?? "#ffffff" } } }) },
      { target: "V03", fail: () => gate(mutate(base, (d) => (d.sections.find((s) => s.type === "hero")!.data.tint = "#e07020"))) },
      { target: "V04", fail: () => gate(lookDoc({ grid: { ...look.grid, w: 1250, u: 8 } })) },
      { target: "V05", fail: () => gate(lookDoc({ ladder: "mixed", mask: "arch" })) },
      {
        target: "V07",
        fail: () =>
          gate(
            mutate(base, (d) => {
              const f = flowIdx(d);
              d.sections[f[2]!.i]!.bg = d.sections[f[1]!.i]!.bg;
            }),
          ),
      },
      { target: "V11", fail: () => gate(base, { assets: new Map([...FIXTURE_META].map(([k, v]) => [k, { ...v, width: 300 }])) }) },
      { target: "V12", fail: () => gate(base, { assets: new Map([...FIXTURE_META].map(([k, v]) => [k, { ...v, focus: { x: 0.02, y: 0.02 } }])) }) },
      { target: "V13", fail: () => gate(mutate(lookDoc({ img: "cutout-stage" }), (d) => ((d.sections.find((s) => s.type === "hero")!.variant = "stage"), (d.product.cutout = undefined)))) },
      { target: "V18", fail: () => gate(clean("argan", "ar"), { theme: ((t) => ({ ...t, tokens: { ...t.tokens, "lp-display-case": "uppercase" } }))(buildTheme(clean("argan", "ar").theme, "ar")) }) },
      { target: "V19", fail: () => gate(mutate(base, (d) => insertAfterHero(d, sec("tape1", "marquee", "tape", "surface", { items: ["A", "B"] }), sec("tape2", "marquee", "double", "soft", { items: ["C", "D"] })))) },
      { target: "V21", fail: () => gate(lookDoc({ btn: "underline", g: "poster" })) },
      { target: "V22", fail: () => gate(mutate(base, (d) => {
        const form = d.sections.findIndex((s) => s.type === "orderForm");
        const [f] = d.sections.splice(form, 1);
        insertAfterHero(d, ...["b1", "b2", "b3", "b4"].map((id, k) => sec(id, "benefits", "stack", k % 2 ? "soft" : "surface", { title: "x" })));
        d.sections.splice(d.sections.length - 2, 0, f!);
      })) },
      { target: "V23", fail: () => gate(lookDoc({ mo: { ...look.mo, f: "soft-spring" } })) },
      // a strip stacked above a scrapbook hero pushes the price, the CTA and COD below 938 px at 390
      { target: "V25", fail: () => gate(mutate(base, (d) => {
        const i = d.sections.findIndex((s) => s.type === "hero");
        d.sections[i]!.variant = "scrapbook";
        d.sections.splice(i, 0, sec("pre", "marquee", "tape", "soft", { items: ["Livraison partout au Maroc", "Paiement à la livraison"] }));
      })) },
      { target: "V27", fail: () => gate(mutate(base, (d) => d.sections.push(sec("sticky2", "stickyCta", "pill", "base")))) },
      { target: "V29", fail: () => gate(mutate(lookDoc({ depth: "ambient" }), (d) => (d.theme.surfaces = "panels")), { theme: buildTheme(mutate(lookDoc({ depth: "ambient" }), (d) => (d.theme.surfaces = "panels")).theme, "fr") }) },
      { target: "V30", fail: () => gate(mutate(base, (d) => {
        insertAfterHero(d, ...["k1", "k2", "k3", "k4", "k5", "k6"].map((id, k) => sec(id, "faq", "accordion", k % 2 ? "soft" : "surface", { kicker: "Questions", title: "Vos questions", items: [] })));
        for (const s of d.sections) if (typeof s.data.kicker === "string" || ["faq", "benefits", "steps"].includes(s.type)) (s.data.kicker = "Notre sélection"), (s.data.opener = "kicker");
      })) },
      { target: "V31", fail: () => gate(mutate(base, (d) => insertAfterHero(d, sec("offer2", "offer", "tickets", "surface", { title: "Packs" })))) },
      { target: "V32", fail: () => gate(mutate(base, (d) => insertAfterHero(d, sec("tb1", "trustBar", "chips", "surface"), sec("sp", "story", "letter", "base", { title: "x" }), sec("tb2", "trustBar", "ledger", "soft")))) },
      { target: "V33", fail: () => gate(mutate(base, (d) => insertAfterHero(d, ...["g1", "g2", "g3", "g4", "g5", "g6"].map((id, k) => sec(id, "steps", "cards", k % 2 ? "soft" : "surface", { title: "x" }))))) },
      { target: "V34", fail: () => gate(mutate(base, (d) => insertAfterHero(d, sec("mq", "marquee", "outline", "surface", { items: ["Eau de parfum Nuit d’Ambre, flacon de cinquante millilitres"] })))) },
      {
        target: "V35",
        fail: () => {
          const d = clean("argan", "ar");
          const hero = d.sections.find((s) => s.type === "hero")!;
          hero.variant = "stage";
          hero.data = { ...hero.data, ghost: true, bigWord: "الآركان" };
          d.product.name = "زيت الأركان";
          return gate(d);
        },
      },
      { target: "V36", fail: () => gate(mutate(base, (d) => (d.theme.palette = { ...d.theme.palette, pop: "#1f8a8a" })), { theme: buildTheme(mutate(base, (d) => (d.theme.palette = { ...d.theme.palette, pop: "#1f8a8a" })).theme, "fr") }) },
      { target: "V37", fail: () => { const d = mutate(base, (x) => (x.theme.palette = { ...x.theme.palette, accent: "#c9a227" })); return gate(d, { theme: buildTheme(d.theme, "fr") }); } },
      { target: "V38", fail: () => gate(mutate(base, (d) => insertAfterHero(d, sec("z1", "benefits", "zigzag", "surface", { title: "x" }), sec("z2", "story", "image-text", "soft", { title: "y" }), sec("z3", "showcase", "figure", "surface"), sec("z4", "benefits", "zigzag", "soft", { title: "z" })))) },
      { target: "V40", fail: () => gate(base, { theme: { ...theme, attrs: { ...theme.attrs, "data-texture": "grain" } } }) },
      { target: "R8", fail: () => gate(slopDoc()) },
      { target: "N1", fail: () => gate(base, { novelty: { ...NOVELTY_OK, niche: "too_close" } }) },
      { target: "N2", fail: () => gate(base, { novelty: { ...NOVELTY_OK, own: "too_close" } }) },
      { target: "N8", fail: () => gate(base, { origin: new Map([["hero.title", "engine"]]), headlines: [{ path: "hero.title", verdict: "close", band: "high" }] }) },
      {
        target: "D3",
        fail: () => {
          const d = mutate(clean("argan", "ar"), (x) => insertAfterHero(x, sec("faq9", "faq", "accordion", "surface", { title: "أسئلة", items: [{ q: "هل يمكنني إرجاع المنتج إذا لم يعجبني؟", a: "إيه، تقدر ترجعو فاش ما عجبكش، غير صيفط لينا." }] })));
          return gate(d, { origin: new Map([["faq9.items.0.q", "engine"], ["faq9.items.0.a", "engine"]]) });
        },
      },
      {
        target: "D4",
        fail: () => {
          const d = mutate(base, (x) => ((x.product.name = "Sérum Éclat"), insertAfterHero(x, sec("ben9", "benefits", "numbered", "surface", { title: "Ce que change Sérum" }))));
          return gate(d, { origin: new Map([["ben9.title", "engine"]]) });
        },
      },
    ];
    let pairs = 0;
    for (const c of cases) {
      const r = c.fail();
      const hit = hardOf(r, c.target);
      check(hit.length > 0, `${c.target}: the failing fixture raised no hard item (hard: ${r.hard.map((i) => i.target ?? i.id).join(", ") || "none"}; soft: ${r.soft.map((i) => i.id).join(", ")})`);
      check(!hardOf(ok, c.target).length, `${c.target}: hard on the clean page`);
      pairs++;
    }
    // the owner-typed sides stay soft (DS50): D3 and D4 on owner text, N8 on a library line
    const owner = runGates(gateInputOf(mutate(clean("argan", "ar"), (x) => insertAfterHero(x, sec("faq9", "faq", "accordion", "surface", { title: "أسئلة", items: [{ q: "هل يمكنني إرجاع المنتج إذا لم يعجبني؟", a: "إيه، تقدر ترجعو فاش ما عجبكش، غير صيفط لينا." }] }))), { origin: new Map([["faq9.items.0.q", "owner"], ["faq9.items.0.a", "owner"]]) }));
    check(!hardOf(owner, "D3").length && owner.soft.some((i) => i.id === "D3"), "D3 on owner text is not the soft note");
    const lib = gate(base, { origin: new Map([["hero.title", "library"]]), headlines: [{ path: "hero.title", verdict: "close", band: "high" }] });
    check(!hardOf(lib, "N8").length && lib.soft.some((i) => i.id === "N05"), "a library line in the high band is not N05 only");
    note(`${pairs} hard targets × (failing, passing); T1 / T7 / RTL2 are render rows (test:render)`);
  },
});

/* ------------------------------------------------------------------ */
/* the rev 3 calibration fixtures                                      */
/* ------------------------------------------------------------------ */

registerDesignGroup({
  id: "calibration",
  title: "rev 3 calibration fixtures: V08 poster, V09 FAQ, V05 round, S05 dark-luxe glow, V38 splits, sand + signal, one asset",
  ids: ["DG-06", "TC-1"],
  run({ check }) {
    const base = clean();
    // a poster page with 3 display-only centred sections → 0 V08
    const poster = mutate(base, (d) => {
      d.theme.look = { ...d.theme.look!, g: "poster" };
      insertAfterHero(d, sec("p1", "cta", "poster", "accent", { title: "Sillage" }), sec("p2", "story", "manifesto", "soft", { title: "Discret" }), sec("p3", "problem", "quote", "surface", { title: "Présent" }));
    });
    check(!has(gate(poster), "V08"), "a poster page with three display-only centred sections has a V08 item");
    // a 6-question FAQ → 0 V09
    const faq = mutate(base, (d) => insertAfterHero(d, sec("faq6", "faq", "accordion", "surface", { title: "Questions", items: Array.from({ length: 6 }, (_, i) => ({ q: `Question ${i + 1} sur la livraison et le paiement ?`, a: "Oui. Vous payez à la livraison, en espèces, après avoir vu le colis. ".repeat(3) })) })));
    check(!gate(faq).soft.some((i) => i.id === "V09" && i.section === "faq6"), "a 6-question FAQ has a V09 penalty");
    // the round ladder with a pill chip → V05 passes
    const round = mutate(base, (d) => (d.theme.look = { ...d.theme.look!, ladder: "round" }));
    check(!hardOf(gate(round), "V05").length, "the round ladder (pill chip) fails V05");
    // a dark-luxe perfume fold with a product-tinted glow around the bottle → 0 S05
    const dark = directionsOf("parfum", "fr", 3).map((d) => d.doc).find((d) => d.theme.palette.base === "dark") ?? mutate(base, (d) => (d.theme.palette = { ...d.theme.palette, base: "dark" }));
    const darkStage = mutate(dark, (d) => (d.sections.find((s) => s.type === "hero")!.variant = "stage"));
    check(!gate(darkStage, { theme: buildTheme(darkStage.theme, "fr") }).slop.items.some((i) => i.id === "S05"), "the dark-luxe perfume fold with its glow scores S05");
    // four image + text splits in a row → V38 hard
    const splits = mutate(base, (d) => insertAfterHero(d, sec("z1", "benefits", "zigzag", "surface", { title: "x" }), sec("z2", "story", "image-text", "soft", { title: "y" }), sec("z3", "showcase", "figure", "surface"), sec("z4", "benefits", "zigzag", "soft", { title: "z" })));
    check(hardOf(gate(splits), "V38").length > 0, "four splits in a row are not a hard V38");
    // argan-gold, honey, saffron → sand + signal (the repair leaves no accent or pop in the gold band)
    for (const [name, hex] of [["argan-gold", "#b8892f"], ["honey", "#c9a227"], ["saffron", "#d4a017"]] as const) {
      const d = mutate(base, (x) => (x.theme.palette = { ...x.theme.palette, accent: hex }));
      const input = gateInputOf(d);
      const before = runGates(input);
      const fixed = repairDoc(input);
      check(hardOf(before, "V37").length > 0 || hardOf(before, "V03").length > 0 || before.hard.length === 0, `${name}: no V37 before the repair`);
      check(!hardOf(fixed.report, "V37").length && !hardOf(fixed.report, "V03").length, `${name}: the gold band survives the repair`);
    }
    // a white-background perfume with maison → dark-luxe directions (H27 (c), the strategy draw): over 30 maison draws
    // the dark-luxe share stays near the prior (≥ 20 %, so about one in three to five), each one framed on its panel
    const white = fixtureInput("parfum", "fr", 3);
    if (white.palette) white.palette = { ...white.palette, background: "#fafafa", brightness: 0.9 };
    let darkLuxe = 0;
    let unframed = 0;
    for (let k = 0; k < 30; k++) {
      try {
        const g = designDirection({ ...white, brandSeed: `white-${k}` }, "maison", {}, (k % 3) as 0 | 1 | 2).genome;
        if (g?.brand.G9 !== "dark-luxe") continue;
        darkLuxe++;
        if (!["framed", "framed-stage", "tight-detail"].includes(g.page.G18)) unframed++;
      } catch {
        /* a refused draw is not a dark-luxe direction */
      }
    }
    check(darkLuxe >= 6, `the white-background perfume with maison drew ${darkLuxe} dark-luxe directions in 30 (< 20 %)`);
    check(unframed === 0, `${unframed} dark-luxe directions paste a white-background photo unframed (H27 (c))`);
    // the one-asset 1,200 px page → two uses, no tight crop, no V14 penalty
    const one = fixtureInput("argan", "ar", 5);
    const first = (one.product as PageDoc["product"]).images[0]!;
    one.product = { ...(one.product as PageDoc["product"]), images: [first], cutout: undefined };
    one.photos = [{ id: first.id, width: 1200, height: 1500, alpha: false }];
    const doc = generateDirections(one)[0]!;
    const r = runGates(gateInputOf(doc.doc, { assets: new Map([[first.id, { id: first.id, width: 1200, height: 1500, alpha: false }]]), genome: doc.genome ?? genomeOf(doc.doc) }));
    const uses = Object.values(doc.genome?.page.G33.uses ?? {}).flat();
    check(uses.length <= 2 && !uses.some((u) => u.crop === "tight"), `the one-asset page plans ${uses.length} uses (${uses.map((u) => u.crop).join(", ")})`);
    check(!ids(r).some((i) => i.id === "V14"), "the one-asset page has a V14 penalty");
    void photoFactsOf;
  },
});

/* ------------------------------------------------------------------ */
/* Q anchors and slop lines                                            */
/* ------------------------------------------------------------------ */

/** The keep-list pages: each fixture's best engine direction after the wizard repair (fr and ar, two seeds). */
function keepList(full: boolean): { name: FixtureName; report: GateReport }[] {
  const out: { name: FixtureName; report: GateReport }[] = [];
  for (const name of FIXTURE_NAMES) {
    let best: GateReport | null = null;
    for (const locale of ["fr", "ar"] as const)
      for (const seed of full ? [3, 4, 5] : [3, 4]) {
        for (const d of directionsOf(name, locale, seed)) {
          const r = repairDoc(gateInputOf(d.doc)).report;
          if (!best || r.hard.length < best.hard.length || (r.hard.length === best.hard.length && r.q > best.q)) best = r;
        }
      }
    out.push({ name, report: best! });
  }
  return out;
}

registerDesignGroup({
  id: "q",
  title: "Q anchors: the bland clean page = 80, the keep-list pages ≥ 85 with slop ≤ 2, the baseline-like pages ≤ 40 with slop ≥ 6",
  ids: ["DG-06"],
  run({ full, check, note }) {
    check(qScore({ hard: 0, soft: 0, slop: 0, spec: 0.5, nov: 1, comp: 0 }) === 80, "the bland clean page is not 80");
    check(qScore({ hard: 0, soft: 0, slop: 0, spec: 1, nov: 1, comp: 15 }) === 100, "the maximum is not 100");
    const kl = keepList(full);
    for (const { name, report } of kl) {
      check(report.hard.length === 0, `keep-list ${name}: hard items ${report.hard.map((i) => i.id).join(", ")}`);
      check(report.q >= 85, `keep-list ${name}: Q ${report.q} < 85`);
      check(report.slop.score <= 2, `keep-list ${name}: slop ${report.slop.score} > 2`);
    }
    const qs: number[] = [];
    for (const name of FIXTURE_NAMES)
      for (const locale of ["fr", "ar"] as const) {
        const r = gate(baselineDoc(name, locale));
        qs.push(r.q);
        check(r.q <= 40, `baseline ${name}-${locale}: Q ${r.q} > 40`);
        check(r.slop.score >= 6, `baseline ${name}-${locale}: slop ${r.slop.score} < 6`);
      }
    note(`keep-list Q ${kl.map((k) => `${k.name} ${k.report.q}`).join(", ")}; baseline Q ≤ ${Math.max(...qs)}`);
  },
});

/* ------------------------------------------------------------------ */
/* repairs and timing                                                  */
/* ------------------------------------------------------------------ */

registerDesignGroup({
  id: "repairs",
  title: "repairs: the slop page ≥ 6 → ≤ 2, idempotent, ≤ 30 ms; owner text untouched; runGates ≤ 8 ms p95",
  ids: ["DG-06", "DG-12"],
  run({ full, check, note }) {
    const slop = slopDoc();
    const before = gate(slop);
    check(before.slop.score >= 6, `the slop page scores ${before.slop.score} (≥ 6)`);
    const once = repairDoc(gateInputOf(slop));
    check(once.report.slop.score <= 2, `after the repair the slop page scores ${once.report.slop.score} [${once.report.slop.items.map((i) => i.id).join(", ")}]`);
    check(once.log.length > 0 && once.log.every((l) => typeof l.op.op === "string"), "the repair log is empty");
    const twice = repairDoc(gateInputOf(once.doc));
    check(JSON.stringify(twice.doc) === JSON.stringify(once.doc), "repairing twice differs from repairing once");
    // owner text is never rewritten (the kicker the owner typed keeps its numbering; the item stays for the panel)
    const ownerKicker = new Map([["hero.kicker", "owner" as const]]);
    const ownerRun = repairDoc(gateInputOf(slop, { origin: ownerKicker }));
    check(ownerRun.doc.sections.find((s) => s.type === "hero")!.data.kicker === "01 · Argan", "the repair rewrote an owner kicker");
    // prices, items, offers, pixels and the form fields never move
    check(JSON.stringify([once.doc.items, once.doc.offers, once.doc.tracking, once.doc.form]) === JSON.stringify([slop.items, slop.offers, slop.tracking, slop.form]), "the repair changed prices, items, offers, pixels or the form");
    // an owner-added section (absent from the plan) is never dropped
    const planned = genomeOf(slop);
    const withOwner = applyOps(slop, { ...planned, sections: planned.sections.filter((s) => s.id !== "tape1") }, [{ op: "dropSection", section: "tape1" }]);
    check(withOwner.skipped.some((s) => s.why === "owner section"), "an owner-added section was dropped");
    // timing (warm): runGates ≤ 8 ms p95 over 20 docs, repairDoc ≤ 30 ms median
    const docs: PageDoc[] = [];
    for (const name of FIXTURE_NAMES.slice(0, full ? 7 : 4)) for (const locale of ["fr", "ar"] as const) for (const d of directionsOf(name, locale)) docs.push(d.doc);
    const inputs = docs.slice(0, 20).map((d) => gateInputOf(d));
    for (const i of inputs) runGates(i);
    // the best of three passes (a GC pause late in the suite lands on one pass, not on the gates)
    const pass = () =>
      inputs.map((i) => {
        const t0 = performance.now();
        runGates(i);
        return performance.now() - t0;
      });
    const gms = [pass(), pass(), pass()].sort((a, b) => p95(a) - p95(b))[0]!;
    const rms = inputs.slice(0, 8).map((i) => {
      const t0 = performance.now();
      repairDoc(i);
      return performance.now() - t0;
    });
    check(p95(gms) <= 8, `runGates p95 ${p95(gms).toFixed(2)} ms (≤ 8)`);
    check(median(rms) <= 30, `repairDoc median ${median(rms).toFixed(1)} ms (≤ 30)`);
    note(`slop ${before.slop.score} → ${once.report.slop.score} in ${once.log.length} ops; runGates p95 ${p95(gms).toFixed(2)} ms; repairDoc median ${median(rms).toFixed(1)} ms`);
  },
});

/* ------------------------------------------------------------------ */
/* items and titles                                                    */
/* ------------------------------------------------------------------ */

registerDesignGroup({
  id: "items",
  title: "toGateItem ids are design:*, every title exists in ar / fr / en; no em dash or 'Step n' in a design value",
  ids: ["DG-06"],
  run({ check, note }) {
    const reports = [gate(baselineDoc("argan", "fr")), gate(baselineDoc("colors", "ar")), gate(slopDoc()), gate(clean())];
    const all: DesignGateItem[] = reports.flatMap((r) => ids(r));
    const keys = new Set<string>();
    for (const it of all) {
      const g = toGateItem(it);
      check(/^design:[A-Za-z0-9_.-]+$/.test(g.id), `item id ${g.id}`);
      check(g.level === "hard" || g.level === "soft", `level ${g.level}`);
      check(!it.fix?.length || g.fix?.actionId === `design:repair:${it.id}`, `fix action of ${it.id}`);
      keys.add(String(it.msg));
    }
    for (const prefix of ["design.gate.", "design.slop.", "design.copy.", "design.novelty."]) for (const k of Object.keys(EN)) if (k.startsWith(prefix)) keys.add(k);
    for (const k of keys) {
      check(k in EN, `title ${k} missing in en`);
      check(k in FR, `title ${k} missing in fr`);
      check(k in AR, `title ${k} missing in ar`);
    }
    for (const [loc, cat] of [["en", EN], ["fr", FR], ["ar", AR]] as const)
      for (const [k, v] of Object.entries(cat)) {
        check(!/[—–]/.test(v ?? ""), `${loc} ${k}: em or en dash`);
        check(!/\b(step|étape)\s*\d/i.test(v ?? ""), `${loc} ${k}: a "Step n" label`);
      }
    note(`${all.length} items, ${keys.size} titles × 3 locales`);
  },
});

/* ------------------------------------------------------------------ */
/* the render digest, the genome card, the critique input (RD-1)       */
/* ------------------------------------------------------------------ */

registerDesignGroup({
  id: "digest",
  title: "RD-1: renderDigest fields equal the gate inputs on 20 docs; the GenomeCard carries bands only; the critique input is generated text only",
  ids: ["RD-1"],
  run({ check, note }) {
    const docs: PageDoc[] = [];
    for (const name of FIXTURE_NAMES) for (const locale of ["fr", "ar"] as const) docs.push(directionsOf(name, locale)[0]!.doc, baselineDoc(name, locale));
    let n = 0;
    let ms = 0;
    for (const doc of docs.slice(0, 20)) {
      const input = gateInputOf(doc);
      const report = runGates(input);
      const view = gateItemsOf(input).view;
      // per doc the best of three calls (a GC pause is not the digest's time), the worst doc against the budget
      let best = Infinity;
      for (let k = 0; k < 3; k++) {
        const t0 = performance.now();
        renderDigest(doc, input.theme, input.genome, report);
        best = Math.min(best, performance.now() - t0);
      }
      ms = Math.max(ms, best);
      const dg = renderDigest(doc, input.theme, input.genome, report);
      const at = `${doc.theme.archetype}/${doc.locale}/${doc.theme.look ? "look" : "legacy"}`;
      check(JSON.stringify(dg.counts) === JSON.stringify(view.counts), `${at}: digest counts differ from the gates' view`);
      check(JSON.stringify(dg.gates.hard) === JSON.stringify([...new Set(report.hard.map((i) => i.id))]) && dg.gates.q === report.q && dg.gates.slop === report.slop.score, `${at}: digest gates differ from the report`);
      check(dg.heights.total === report.heights.total && dg.heights.formTop === report.heights.formTop && dg.hero.fold === report.heights.fold, `${at}: digest heights differ`);
      check(dg.sections.length === view.all.length && dg.sections.every((s, i) => s.id === view.all[i]!.id && s.glass === view.all[i]!.glass && s.ctas === view.all[i]!.ctas), `${at}: digest sections differ`);
      check(dg.cod === null && !dg.stub, `${at}: cod without store facts or a stub flag`);
      const card = genomeCard(input.genome, report, null, "best_fit");
      check(GenomeCardSchema.safeParse(card).success, `${at}: the card fails its schema`);
      check(Object.values(card.distance).every((b) => typeof b === "string"), `${at}: a distance number on the card`);
      check(card.explanation.length === 4 && card.explanation.every((c) => !c.includes("·")), `${at}: card chips ${JSON.stringify(card.explanation)}`);
      n++;
    }
    check(ms <= 2, `renderDigest ${ms.toFixed(2)} ms (≤ 2)`);
    // the critique input: generated headlines only, no owner text, no contact data
    const doc = mutate(clean(), (d) => (d.sections.find((s) => s.type === "hero")!.data.subtitle = "Appelez le +212 600 000 000"));
    const r = runGates(gateInputOf(doc));
    const ci = critiqueSummary(r, genomeOf(doc), doc, new Map([["hero.title", "owner"]]));
    check(!ci.headlines.some((h) => h.field === "hero.title"), "the critique input carries an owner line");
    check(!ci.headlines.some((h) => /\+212/.test(h.text)), "the critique input carries contact data");
    check(GenomeCardSchema.safeParse(ci.card).success, "the critique card fails its schema");
    note(`${n} docs, renderDigest ≤ ${ms.toFixed(2)} ms`);
  },
});

/* ------------------------------------------------------------------ */
/* the explanation (GN-1)                                              */
/* ------------------------------------------------------------------ */

registerDesignGroup({
  id: "explain",
  title: "GN-1: four separate chips (no ·), ≥ 6 distinct why lines per locale over the sweep, no line names an absent fact",
  ids: ["GN-1"],
  run({ full, check, note }) {
    const lines = new Map<string, Set<string>>();
    for (const name of FIXTURE_NAMES)
      for (const locale of ["fr", "ar"] as const)
        for (const seed of full ? [3, 4, 5, 6, 7, 8] : [3, 4]) {
          const input = fixtureInput(name, locale, seed);
          for (const d of generateDirections(input)) {
            if (!d.genome) continue;
            const ginput = gateInputOf(d.doc);
            const report = runGates(ginput);
            const digest = renderDigest(d.doc, ginput.theme, d.genome, report);
            const photos = photoFactsOf(input, d.doc.product);
            for (const reader of [locale, "en"] as const) {
              const ex = explainGenome(d.genome, { locale: reader, photos, digest });
              check(ex.chips.length === 4 && new Set(ex.chips.map((c) => c.gene)).size === 4, "four chips, one per bold visual gene");
              check(ex.chips.every((c) => !(c.vars ? Object.values(c.vars).join("") : "").includes("·")), "a chip contains ·");
              const text = whyText(ex.why, reader);
              check(!text.includes("{") && !/[—–]/.test(text), `why line "${text}"`);
              // the fact behind the template is present
              const k = String(ex.why.key);
              if (k === "design.why.cutout") check(photos.hasCutout === true && d.genome.page.G18 === "cutout-stage", "why.cutout without a cutout");
              if (k === "design.why.onePhoto") check(photos.count === 1, "why.onePhoto with more photos");
              if (k === "design.why.manyPhotos") check(photos.count >= 3 && ex.why.vars.count === String(photos.count), "why.manyPhotos count");
              if (k === "design.why.darkFromPhoto") check(photos.background.luminance <= 0.35, "why.darkFromPhoto on a light photo");
              if (k === "design.why.background") check(photos.background.uniform, "why.background on a busy background");
              if (k === "design.why.market") check(locale === "ar" && d.genome.brand.G31 !== "none", "why.market off an Arabic page");
              const set = lines.get(reader) ?? new Set<string>();
              set.add(text);
              lines.set(reader, set);
            }
          }
        }
    for (const [loc, set] of lines) check(set.size >= 6, `${loc}: ${set.size} distinct why lines (≥ 6)`);
    note([...lines].map(([l, s]) => `${l} ${s.size}`).join(", ") + " distinct why lines");
  },
});

/* ------------------------------------------------------------------ */
/* store kinds (DES-§8.13)                                             */
/* ------------------------------------------------------------------ */

registerDesignGroup({
  id: "kinds",
  title: "DES-§8.13: gateInputFor on a defaultTemplate-style document of every kind → 0 hard items; utility kinds never pooled",
  ids: ["DG-06"],
  run({ check }) {
    const themes = { fr: buildTheme(clean().theme, "fr"), ar: buildTheme(clean().theme, "ar") };
    const theme = themes.fr;
    for (const kind of Object.keys(KIND_GATES).filter((k) => k !== "landing") as StorePageKind[]) {
      for (const locale of ["fr", "ar"] as const) {
        const doc = storeTemplate(kind, locale);
        const theme = themes[locale];
        const input = gateInputFor(doc, { kind, theme, look: null, assets: new Map(), locale, context: "publish", origin: new Map(), facts: [], ownerProof: false });
        check(input.register === KIND_GATES[kind].register, `${kind}: register ${input.register}`);
        const r = runGates(input);
        check(r.hard.length === 0, `${kind}/${locale}: hard ${r.hard.map((i) => i.id).join(", ")}`);
        if (!["home", "page"].includes(kind)) check(!KIND_GATES[kind].pooled && !KIND_GATES[kind].novelty, `${kind}: pooled or novelty-checked`);
      }
    }
    // a home with glass on a commerce island is a design hard item for the commerce kinds
    const glassy = storeTemplate("product");
    glassy.sections.splice(1, 0, sec("isl", "trustBar", "chips", "surface"));
    const r = runGates(gateInputFor(glassy, { kind: "product", theme, look: null, assets: new Map(), locale: "fr", context: "publish", origin: new Map(), facts: [], ownerProof: false }));
    check(r.hard.some((i) => i.id === "V06"), "glass on a product page is not hard");
  },
});

/* ------------------------------------------------------------------ */
/* designer seeds (DES-§17.2)                                          */
/* ------------------------------------------------------------------ */

/** A seed's page after the wizard repair, its gate report and its genome. */
function seedPage(s: (typeof DESIGNER_SEEDS)[number]): { doc: PageDoc; report: GateReport; genome: DesignGenome; input: ReturnType<typeof fixtureInput> } {
  const input = fixtureInput(s.review.fixture as FixtureName, s.review.locale, 1, s.review.brandSeed);
  const b = designDirection(input, s.archetype, { locks: s.genes }, s.review.direction);
  const g = b.genome ?? genomeOf(b.doc);
  const r = repairDoc({ ...gateInputOf(b.doc), genome: g });
  return { doc: r.doc, report: r.report, genome: g, input };
}

registerDesignGroup({
  id: "seeds",
  title: "DES-§17.2: ≥ 44 designer seeds, 4 per archetype, parameters only; each compiles with Q ≥ 85 and 0 hard items; Bolder / Calmer add no hard item",
  ids: ["DG-06", "DG-12"],
  run({ full, check, note }) {
    check(DESIGNER_SEEDS.length >= 44, `${DESIGNER_SEEDS.length} seeds (≥ 44)`);
    for (const a of ARCHETYPES) {
      const own = DESIGNER_SEEDS.filter((s) => s.archetype === a);
      check(own.length >= 4, `${a}: ${own.length} seeds`);
      check(new Set(own.map((s) => s.genes.G2)).size === own.length, `${a}: two seeds share a grammar`);
    }
    // parameters only (DES-§22): no store id, no genome id (ULID), no page text
    const json = JSON.stringify(DESIGNER_SEEDS);
    check(!/[0-9A-HJKMNP-TV-Z]{26}/.test(json) && !/store_?id|genome_?id|pageId/i.test(json), "a seed carries a store or genome id");
    const pick = full ? DESIGNER_SEEDS : ARCHETYPES.map((a) => DESIGNER_SEEDS.find((s) => s.archetype === a)!);
    const qs: number[] = [];
    for (const s of pick) {
      const page = seedPage(s);
      qs.push(page.report.q);
      check(page.report.hard.length === 0, `${s.id}: hard ${page.report.hard.map((i) => i.id).join(", ")}`);
      check(page.report.q >= 85, `${s.id}: Q ${page.report.q} < 85`);
      // Bolder and Calmer move only their genes (the genome back-derived from the shown page, as the builder does) and,
      // after the remix context's automatic repair (DES-§8.7: 2 rounds), never add a hard item
      const facts = { mood: { mood: "neutral" as const, modest: false, words: [] }, locale: page.doc.locale, photos: photoFactsOf(page.input, page.doc.product), brand: null };
      const shown = genomeOf(page.doc);
      for (const dir of ["bolder", "calmer"] as const) {
        const g2 = boldnessStep(shown, dir, facts);
        check(g2.brand.G12 === shown.brand.G12 && g2.brand.G17 === shown.brand.G17 && g2.brand.G9 === shown.brand.G9, `${s.id} ${dir}: moved a gene outside the boldness set`);
        const doc2 = remixDoc(page.doc, { seed: 7, scope: dir });
        const r2 = repairDoc({ ...gateInputOf(doc2, { context: "remix" }), genome: genomeOf(doc2) }, { rounds: 2 }).report;
        check(r2.hard.length <= page.report.hard.length, `${s.id} ${dir}: adds hard ${r2.hard.map((i) => i.id).join(", ")}`);
      }
    }
    note(`${pick.length} seeds gated, Q ${Math.min(...qs)}-${Math.max(...qs)}`);
  },
});

void factsOf;
void bigWordOf;
