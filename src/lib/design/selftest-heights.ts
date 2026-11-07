/**
 * The measurement-core groups of `test:design` (P6 DESIGN; design.md DES-§25.1, DES-§5.3, DES-§5.12, DES-§5.13,
 * DES-§8.4, DES-§19; core §M.2 rows C2, C3, F1; ids DG-04, DG-06). Registered with src/lib/design/selftest.ts and run by
 * scripts/qa/design-check.ts:
 *  - heights: the model against src/lib/design/calibration/heights.json (the page totals within 0.8-1.25 on ≥ 90 % of
 *    pages; the fold items' error p95 ≤ 10 % per family × script), the calibration fitted against this model version,
 *    no report flagged `stub`, ≤ 1 ms per document;
 *  - fold contract: every §5.12 fold row ≤ 760 px in ar and fr with the longest library title (the sheet's line cap),
 *    the §5.12 budget totals reproduced from the sheets (± 2 px), the H28 first rung (the editorial lead leaves the
 *    Arabic fold), and the fold of a look document read from the sheet;
 *  - form: `features.h = { base: 1.1, fixed: true }` gives the default-state form 928 px whatever the density, the
 *    spacing and G21; every form variant × density × script ≤ 1,100 px with ≤ 3 offers; the per-row terms;
 *  - features: `VariantFeaturesResolved` carries `h` and `family`; fixed layers never count in flow.
 */
import { SECTIONS } from "@/landing/registry";
import { libraryFor, lineText } from "@/lib/ai/copy-library";
import { FAMILIES } from "@/lib/ai/copy-library/types";
import { getFixture } from "@/lib/page/fixtures";
import type { PageDoc, ThemeLook } from "@/lib/page/schema";
import { validateDoc } from "@/lib/page/validate";
import { compileLook } from "./compile";
import { genomeOf } from "./derive";
import { variantFeatures } from "./features";
import { estimateHeights, foldType, HEIGHT_MODEL_VERSION, heightParams, PRE_SHEET } from "./heights";
import { HEIGHTS_CALIBRATION } from "./heights-calibration";
import { registerDesignGroup } from "./selftest";
import { FOLD_TARGET, foldLayout, nominalType, SHEETS, type FoldLayout } from "./sheets";

const q = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))]! : 0;
};
const pct = (v: number) => `${Math.round(v * 1000) / 10} %`;

/** The calibration pages' documents, rebuilt from their recipes (once per run). */
let docsCache: { page: (typeof HEIGHTS_CALIBRATION.pages)[number]; doc: PageDoc }[] | null = null;
function calibrationDocs() {
  docsCache ??= HEIGHTS_CALIBRATION.pages.flatMap((page) => {
    const fx = getFixture(page.fixture, { locale: page.locale, archetype: page.arch ?? undefined, seed: page.seed ?? undefined, now: HEIGHTS_CALIBRATION.now });
    const { doc } = validateDoc(fx.doc);
    return doc ? [{ page, doc }] : [];
  });
  return docsCache;
}

const report = (doc: PageDoc, look: ThemeLook | null = doc.theme.look ?? null) => estimateHeights(doc, { look, locale: doc.locale, features: variantFeatures });

registerDesignGroup({
  id: "heights",
  title: "height model vs the measured renders (calibration/heights.json), ≤ 1 ms per document",
  ids: ["DG-04"],
  run({ check, note }) {
    const docs = calibrationDocs();
    check(HEIGHTS_CALIBRATION.pages.length >= 39, `calibration: ${HEIGHTS_CALIBRATION.pages.length} pages (the 39 baseline landings expected)`);
    check(docs.length === HEIGHTS_CALIBRATION.pages.length, "calibration: a recipe no longer builds a valid document");
    check(HEIGHT_MODEL_VERSION >= 1, "HEIGHT_MODEL_VERSION is the P0 stub's 0");
    check(HEIGHTS_CALIBRATION.model === HEIGHT_MODEL_VERSION, `calibration measured with model ${HEIGHTS_CALIBRATION.model}, the model is ${HEIGHT_MODEL_VERSION}: re-run scripts/qa/design-heights.ts`);
    const ratios: number[] = [];
    const errs = new Map<string, number[]>();
    for (const { page, doc } of docs) {
      const r = report(doc);
      check(r.stub === undefined, `${page.fixture}/${page.locale}: a report flagged stub`);
      check(r.inFlow === page.sections.length, `${page.fixture}/${page.arch ?? "default"}/${page.locale}: ${r.inFlow} in-flow sections, ${page.sections.length} measured`);
      ratios.push(r.total / page.total);
      const key = `${page.hero}/${page.locale === "ar" ? "ar" : "lat"}`;
      for (const k of ["image", "price", "cta", "cod"] as const) {
        const m = page.fold[k];
        const e = r.fold.items[k];
        if (m === undefined || m <= 0) continue;
        check(e !== undefined, `${page.fixture}/${page.locale}: no estimate for the fold item ${k}`);
        // the error relative to what the C2 gate compares: the fold line, or the item's own top beyond it (the band is
        // multiplicative there: estimate × 0.9 > 844); an item well inside the fold never turns a decision
        if (e !== undefined) errs.set(key, [...(errs.get(key) ?? []), Math.abs(e - m) / Math.max(m, 844)]);
      }
    }
    const inBand = ratios.filter((x) => x >= 0.8 && x <= 1.25).length;
    check(inBand >= Math.ceil(0.9 * ratios.length), `page totals within 0.8-1.25 on ${inBand}/${ratios.length} pages (≥ 90 % required)`);
    note(`page total ratio: p10 ${q(ratios, 0.1).toFixed(2)} · median ${q(ratios, 0.5).toFixed(2)} · p90 ${q(ratios, 0.9).toFixed(2)} · in band ${inBand}/${ratios.length}`);
    const all: number[] = [];
    const pending: string[] = [];
    for (const [key, xs] of [...errs.entries()].sort()) {
      all.push(...xs);
      // a pre-sheet composition that sizes its image from the photo: a 25 % bound until its redraw (PRE_SHEET)
      const photo = PRE_SHEET[`hero:${key.split("/")[0]}`]?.photoSized === true;
      if (photo && q(xs, 0.95) > 0.1) pending.push(`${key} ${pct(q(xs, 0.95))}`);
      check(q(xs, 0.95) <= (photo ? 0.25 : 0.1), `fold items ${key}: error p95 ${pct(q(xs, 0.95))} (≤ ${photo ? 25 : 10} % required)`);
    }
    if (pending.length) note(`above 10 % until the redraw from their sheet (photo-sized pre-sheet compositions): ${pending.join(" · ")}`);
    note(`fold item error p95 per family × script: ${[...errs.entries()].sort().map(([k, xs]) => `${k} ${pct(q(xs, 0.95))}`).join(" · ")} · all ${pct(q(all, 0.95))}`);

    // ≤ 1 ms per document (DES-§19): warm, documents without look (the genomeOf path) and with one
    const looks = docs.slice(0, 8).map(({ doc }) => ({ ...doc, theme: { ...doc.theme, look: compileLook(genomeOf(doc), {}) } }));
    for (const { doc } of docs) report(doc);
    const t0 = performance.now();
    let n = 0;
    for (let i = 0; i < 5; i++) for (const { doc } of docs) (report(doc), n++);
    for (let i = 0; i < 5; i++) for (const doc of looks) (report(doc), n++);
    const ms = (performance.now() - t0) / n;
    check(ms <= 1, `estimateHeights takes ${ms.toFixed(3)} ms per document (≤ 1 ms)`);
    note(`estimateHeights: ${ms.toFixed(3)} ms per document over ${n} runs`);
  },
});

/** The longest hero headline of the copy library per locale, its slots filled with a long product name. */
function longestTitle(locale: "ar" | "fr"): string {
  const lib = libraryFor(locale);
  const product = locale === "ar" ? "سيروم زيت الأركان الحر" : "Sérum à l'huile d'argan pure";
  let best = "";
  for (const f of FAMILIES) {
    for (const h of lib.families[f]?.headline ?? []) {
      const t = lineText(h).replace(/\{product\}/g, product).replace(/\{[a-z]+\}/g, "").replace(/\*+/g, "");
      if ([...t].length > [...best].length) best = t;
    }
  }
  return best;
}

/**
 * §5.12 fold budget totals (Latin, Arabic) of every family: the bottom of the lowest fold item at 390, the announcement
 * counted. Two rows differ from the §5.12 sums by what follows the COD line or what leaves with the lead: the editorial
 * Arabic fold without its lead also loses the lead's 12 px gap (783 − 61 − 12 = 710, the table's 722 kept the gap), and
 * the cinema band's bottom padding (12) sits below the COD line (724 / 754 → 712 / 742).
 */
const BUDGET: Readonly<Record<string, readonly [number, number]>> = {
  stage: [758, 754],
  editorial: [746, 710],
  poster: [682, 720],
  spec: [728, 758],
  split: [689, 719],
  cinema: [712, 742],
  quiet: [707, 722],
  index: [730, 760],
  contact: [632, 648],
  statement: [536, 584],
};
/** Every registered hero family (section kit II registered the five new ones: cinema, quiet, index, contact, statement). */
const EXISTING = ["stage", "editorial", "poster", "spec", "split", "cinema", "quiet", "index", "contact", "statement"] as const;

registerDesignGroup({
  id: "fold",
  title: "fold contract: §5.12 rows ≤ 760 px in ar and fr from the sheets, the H28 first rung, look documents",
  ids: ["DG-04"],
  run({ check, note }) {
    const rows: string[] = [];
    for (const [family, [lat, ar]] of Object.entries(BUDGET)) {
      const sheet = SHEETS[`hero:${family}`];
      check(sheet?.fold, `hero:${family}: no sheet fold stack`);
      if (!sheet?.fold) continue;
      for (const locale of ["fr", "ar"] as const) {
        const isAr = locale === "ar";
        const title = longestTitle(locale);
        const lay: FoldLayout = foldLayout(sheet.fold, { ar: isAr, announcement: true, type: nominalType(isAr), titleChars: [...title].length, leadChars: 120 });
        const want = isAr ? ar : lat;
        check(Math.abs(lay.bottom - want) <= 2, `hero:${family} ${locale}: the sheet's fold ends at ${lay.bottom} px, §5.12 budgets ${want}`);
        check(lay.bottom <= FOLD_TARGET, `hero:${family} ${locale}: fold ends at ${lay.bottom} px > ${FOLD_TARGET}`);
        for (const k of ["image", "price", "cta", "cod"] as const) check(lay.items[k] !== undefined && lay.items[k]! <= FOLD_TARGET, `hero:${family} ${locale}: ${k} not in the fold (${lay.items[k]})`);
        rows.push(`${family}/${locale} ${lay.bottom}${lay.dropped.length ? ` (−${lay.dropped.join(",")})` : ""}`);
      }
    }
    note(`fold bottoms at 390 (announcement counted): ${rows.join(" · ")}`);
    // H28's first rung: the editorial lead leaves the Arabic fold, stays in the Latin one
    const ed = SHEETS["hero:editorial"]!.fold!;
    check(foldLayout(ed, { ar: true, announcement: true, type: nominalType(true), leadChars: 80 }).dropped.includes("lead"), "hero:editorial ar keeps its lead in a fold past 760 px");
    check(!foldLayout(ed, { ar: false, announcement: true, type: nominalType(false), leadChars: 80 }).dropped.length, "hero:editorial fr dropped its lead from a fold that fits");

    // a look document reads its hero's sheet, with the fixture's real title through typeTokens: every existing family
    for (const fixture of ["argan", "tshirt"] as const) {
      for (const locale of ["ar", "fr"] as const) {
        const { doc: base } = validateDoc(getFixture(fixture, { locale, now: HEIGHTS_CALIBRATION.now }).doc);
        if (!base) continue;
        const look = compileLook(genomeOf(base), {});
        for (const family of EXISTING) {
          const doc: PageDoc = { ...base, theme: { ...base.theme, look }, sections: base.sections.map((s) => (s.type === "hero" ? { ...s, variant: family } : s)) };
          const r = report(doc, look);
          const tops = (["image", "price", "cta", "cod"] as const).map((k) => r.fold.items[k]);
          check(tops.every((t) => t !== undefined), `${fixture}/${locale} hero:${family} with look: a fold item is missing`);
          check(r.fold.family === family && r.fold.limit === 844, `${fixture}/${locale} hero:${family}: fold family / limit`);
          // the sheet stack from the hero's own top (the header and the announcement as estimated)
          const heroTop = r.sections.find((s) => s.type === "hero")!.top;
          const lay = foldLayout(SHEETS[`hero:${family}`]!.fold!, { ar: locale === "ar", top: heroTop, type: foldType(doc, heightParams(doc, look), locale), titleChars: [...String((doc.sections.find((s) => s.type === "hero")!.data as { title?: string }).title ?? "").replace(/\*+/g, "")].length, leadChars: [...String((doc.sections.find((s) => s.type === "hero")!.data as { subtitle?: string }).subtitle ?? "")].length });
          check(r.fold.items.cod === lay.items.cod, `${fixture}/${locale} hero:${family}: the report's fold is not the sheet's stack`);
          check(r.fold.ok === tops.every((t) => t! <= 844), `${fixture}/${locale} hero:${family}: fold.ok disagrees with its items`);
        }
      }
    }
  },
});

registerDesignGroup({
  id: "form",
  title: "order form: 1.1 screens fixed (928 px) whatever density, spacing and G21; ≤ 1,100 px per variant × density × script",
  ids: ["DG-04", "DG-06"],
  run({ check, note }) {
    const { doc: base } = validateDoc(getFixture("argan", { locale: "fr", now: HEIGHTS_CALIBRATION.now }).doc);
    if (!base) return void check(false, "argan/fr fixture invalid");
    const look0 = compileLook(genomeOf(base), {});
    // the default state: ≤ 2 offers, no per-piece option group, no bump
    const twoOffers: PageDoc = { ...base, items: base.items.map((it) => ({ ...it, groups: [] })), offers: { ...base.offers, bundles: base.offers.bundles.slice(0, 2), orderBump: undefined } };
    let worst = 0;
    const forms = SECTIONS.find((d) => d.type === "orderForm")?.variants.map((v) => v.id) ?? [];
    for (const variant of forms) {
      for (const dens of ["airy", "balanced", "dense"] as const) {
        for (const space of [0.75, 1, 1.6]) {
          for (const spacing of ["tight", "normal", "airy"] as const) {
            const look = { ...look0, dens, space };
            const doc: PageDoc = { ...twoOffers, theme: { ...twoOffers.theme, look }, sections: twoOffers.sections.map((s) => (s.type === "orderForm" ? { ...s, variant, spacing } : s)) };
            const r = report(doc, look);
            check(r.formHeight === 928, `orderForm:${variant} ${dens} G21 ${space} ${spacing}: ${r.formHeight} px, 928 expected`);
          }
        }
        // every form variant × density × script ≤ 1,100 px with the fixtures' offers (≤ 3) and no option group
        for (const locale of ["ar", "fr", "en"] as const) {
          const { doc: fx } = validateDoc(getFixture("argan", { locale, now: HEIGHTS_CALIBRATION.now }).doc);
          if (!fx) continue;
          const look = { ...look0, dens };
          const doc: PageDoc = { ...fx, items: fx.items.map((it) => ({ ...it, groups: [] })), offers: { ...fx.offers, bundles: fx.offers.bundles.slice(0, 3), orderBump: undefined }, theme: { ...fx.theme, look }, sections: fx.sections.map((s) => (s.type === "orderForm" ? { ...s, variant } : s)) };
          const h = report(doc, look).formHeight ?? 0;
          worst = Math.max(worst, h);
          check(h > 0 && h <= 1100, `orderForm:${variant} ${dens} ${locale}: ${h} px > 1,100`);
        }
      }
    }
    // the per-row terms: + 0.15 per offer row beyond 2, + 0.25 per per-piece option group, + 0.07 for the bump
    const three: PageDoc = { ...twoOffers, offers: { ...twoOffers.offers, bundles: base.offers.bundles.slice(0, 3) } };
    if (base.offers.bundles.length >= 3) check(report(three, null).formHeight === Math.round((1.1 + 0.15) * 844), "a third offer row does not add 0.15 screen");
    note(`default-state form 928 px in every variant × density × G21 × spacing; worst with ≤ 3 offers ${worst} px`);
  },
});

registerDesignGroup({
  id: "features",
  title: "VariantFeaturesResolved carries h and family; fixed layers never count in flow",
  ids: ["DG-06"],
  run({ check }) {
    for (const def of SECTIONS) {
      for (const v of def.variants) {
        const f = variantFeatures(def.type, v.id, {});
        check(typeof f.family === "string", `${def.type}:${v.id}: no family`);
        // h: declared (fitted, sheeted or fixed) wherever the registry declares it, never dropped by the resolution
        const declared = SHEETS[`${def.type}:${v.id}`]?.h;
        if (declared !== undefined) check(f.h === declared, `${def.type}:${v.id}: resolved h ${JSON.stringify(f.h)} ≠ the sheet's ${declared}`);
      }
    }
    const form = variantFeatures("orderForm", "card", {});
    check(typeof form.h === "object" && form.h.fixed === true && form.h.base === 1.1, "orderForm:card resolves without its fixed h");
    check(variantFeatures("hero", "stage", {}).h === SHEETS["hero:stage"]!.h, "hero:stage resolves without the sheet's h");
    // fixed layers: never in flow, never in the total
    const { doc } = validateDoc(getFixture("argan", { locale: "ar", now: HEIGHTS_CALIBRATION.now }).doc);
    if (doc) {
      const r = report(doc);
      check(!r.sections.some((s) => s.type === "stickyCta" || s.type === "whatsappFloat"), "a fixed layer counted in flow");
      check(r.total === r.sections.reduce((a, s) => a + s.height, 0), "the total is not the sum of the in-flow sections");
      check(r.sections.every((s, i) => i === 0 || s.top === r.sections[i - 1]!.top + r.sections[i - 1]!.height), "section tops do not follow each other");
      check(r.formTop === r.sections.find((s) => s.type === "orderForm")?.top, "formTop is not the order form's top");
      check(r.screens === Math.round((r.total / 844) * 100) / 100 && r.viewport === 390 && r.v === 1, "screens / viewport / v");
    }
  },
});
