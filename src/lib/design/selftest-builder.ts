/**
 * `test:design` groups of the builder step (P6 DESIGN; design.md DES-§15.1-§15.4, DES-§14.7, DES-§11.6; DG-06,
 * DG-12 R1, SF-02). Pure: no database, no browser.
 *  - builder-fixes: every panel fix of the argan baseline (fr, ar) applies through the real editor store as exactly
 *    one history step that ⌘Z reverts; "Fix all" is one step too; rows carry the shared ids; Ignore drops soft rows only.
 *  - builder-differentiate: the ≤ 6 variants never move a brand or page lock; the pick never yields a platform
 *    `too_close` or a clone.
 *  - builder-boldness: Bolder / Calmer move the rhythm genes in opposite directions; Upgrade gives a legacy page a look.
 *  - builder-brand: "Apply my brand" copies the brand's colours, pairing and genes; a page already in the brand is null.
 */
import { createEditorStore } from "@/lib/editor/store";
import type { EditorBootstrap } from "@/lib/editor/types";
import { boldnessStep, remixDoc, remixInput } from "@/lib/generator/remix";
import { PageDoc } from "@/lib/page/schema";
import { applyBrand, brandLockedGenes, geneValue, type BrandLite } from "./brand-apply";
import { genomeOf } from "./derive";
import { baselineDoc, cleanDoc, gateInputOf } from "./fixtures/prepublish";
import { gateRun } from "./gates/run";
import { applyFix, budgetEstimate, fixAllOps, needsDifferentiate, panelModel, qLabel, type PanelModel } from "./panel";
import { differentiateDocs, pickDifferentiate } from "./panel-diff";
import { registerDesignGroup } from "./selftest";

const bootOf = (doc: PageDoc): EditorBootstrap => ({
  page: { id: "01JBUILDERSELFTEST00000000", kind: "landing", name: "t", slug: "t", status: "draft", publishedVersionId: null, updatedAt: 0 },
  doc,
  draftIsLive: false,
  assets: {},
  store: { name: "t" },
  storeHealth: { hasLegalName: true, hasPhone: true, hasEmail: true, hasAddress: true },
  check: {} as EditorBootstrap["check"],
  versions: [],
  hasMoreVersions: false,
  user: { id: "u", name: "u", canWrite: true, canPublish: true, canExport: true, canUpload: true },
  ai: { enabled: false, bgRemoval: false, tier: "lite" },
  notices: [],
});

function modelOf(doc: PageDoc, ignored?: ReadonlySet<string>): PanelModel {
  const run = gateRun(gateInputOf(doc, { context: "builder" }));
  return panelModel({ report: run.report, items: run.items, slop: run.slop.items, checklist: null, budget: budgetEstimate(doc, run.view), ...(ignored ? { ignored } : {}) });
}

registerDesignGroup({
  id: "builder-fixes",
  title: "Design check panel: rows, shared ids, Ignore, and every Fix / Fix all as one editor history step",
  ids: ["DG-06"],
  run({ check, note }) {
    check(qLabel(90) === "excellent" && qLabel(89) === "good" && qLabel(80) === "good" && qLabel(79) === "fair" && qLabel(65) === "fair" && qLabel(64) === "needsWork", "the Q labels are off their bands");
    let fixes = 0;
    let applied = 0;
    for (const locale of ["fr", "ar"] as const) {
      const doc = PageDoc.parse(baselineDoc("argan", locale));
      const m = modelOf(doc);
      const rows = Object.values(m.groups).flat();
      check(rows.length > 0, `${locale}: the baseline page shows no row`);
      check(m.blocking === m.groups.blocking.length && m.groups.blocking.every((r) => r.level === "hard"), `${locale}: the blocking group holds a soft row`);
      check(rows.every((r) => /^(design|budget):|^[a-z]+:/.test(r.id)), `${locale}: a row without a shared id`);
      check(new Set(rows.map((r) => r.key)).size === rows.length, `${locale}: two rows share a key`);
      check(m.meters.length === 7 && m.meters.every((x) => Number.isFinite(x.value) && x.value >= 0), `${locale}: the meters are not the seven real counts`);
      // Ignore: soft rows leave, hard rows stay
      const soft = rows.find((r) => r.ignorable);
      const hard = m.groups.blocking[0];
      if (soft) {
        const keys = new Set([soft.key, ...(hard ? [hard.key] : [])]);
        const m2 = modelOf(doc, keys);
        const rows2 = Object.values(m2.groups).flat();
        check(!rows2.some((r) => r.key === soft.key), `${locale}: an ignored soft row is still shown`);
        if (hard) check(rows2.some((r) => r.key === hard.key), `${locale}: a hard row was ignored`);
      }
      // each Fix: one replaceDoc, one history step, ⌘Z restores the page
      const g = genomeOf(doc);
      for (const r of rows) {
        if (!r.fix?.length) continue;
        fixes++;
        const next = applyFix(doc, g, r.fix);
        if (!next) continue;
        applied++;
        check(PageDoc.safeParse(next).success, `${locale}: the fix of ${r.id} gives an invalid page`);
        const store = createEditorStore(bootOf(doc));
        const before = store.temporal.getState().pastStates.length;
        store.getState().replaceDoc(next);
        check(store.temporal.getState().pastStates.length === before + 1, `${locale}: the fix of ${r.id} is not one history step`);
        store.getState().undo();
        check(JSON.stringify(store.getState().doc) === JSON.stringify(doc), `${locale}: ⌘Z after the fix of ${r.id} does not restore the page`);
      }
      // Fix all: the blocking group's ops in one step
      const all = fixAllOps(m);
      const next = applyFix(doc, g, all);
      if (next) {
        const store = createEditorStore(bootOf(doc));
        store.getState().replaceDoc(next);
        check(store.temporal.getState().pastStates.length === 1, `${locale}: Fix all is not one history step`);
      }
    }
    check(applied > 0, "no panel fix applied on the baseline pages");
    note(`${fixes} fixes offered, ${applied} applied as one step each`);
  },
});

registerDesignGroup({
  id: "builder-differentiate",
  title: "Differentiate: locks never move, the pick never yields a platform too_close or a clone",
  ids: ["DG-06", "SF-02"],
  run({ check, note }) {
    const doc = cleanDoc("parfum", "fr");
    const g = genomeOf(doc);
    const locked = ["G2", "G4"];
    const cands = differentiateDocs(doc, 11, locked);
    check(cands.length > 0, "no Differentiate variant for the parfum direction");
    for (const c of cands) {
      const cg = genomeOf(c.doc);
      check(cg.page.G2 === g.page.G2 && cg.brand.G4 === g.brand.G4, `variant ${c.gene}→${c.to} moved a locked gene`);
      check(c.gene !== "G2" && c.gene !== "G4", `variant tried the locked ${c.gene}`);
    }
    // a page lock (look.locks) is read too
    const pageLocked = { ...doc, theme: { ...doc.theme, look: { ...doc.theme.look!, locks: ["G9" as const, "G18" as const] } } };
    const lg = genomeOf(pageLocked);
    for (const c of differentiateDocs(pageLocked, 5)) {
      const cg = genomeOf(c.doc);
      check(cg.brand.G9 === lg.brand.G9 && cg.page.G18 === lg.page.G18, `variant ${c.gene}→${c.to} moved a page lock`);
    }
    const all = differentiateDocs(doc, 3);
    const bad = all.map((c, i) => ({ key: c.key, platform: i === 0 ? "too_close" : "ok", niche: "ok", own: "ok", clone: i === 1 }));
    const pick = pickDifferentiate(all, bad);
    if (all.length > 2) check(pick?.key === all[2]!.key, "the pick skipped the first clean variant or took a refused one");
    check(pickDifferentiate(all, all.map((c) => ({ key: c.key, platform: "too_close", niche: "ok", own: "ok", clone: false }))) === null, "a platform too_close variant was picked");
    check(pickDifferentiate(all, all.map((c) => ({ key: c.key, platform: "ok", niche: "ok", own: "ok", clone: true }))) === null, "a clone was picked");
    check(needsDifferentiate({ platform: "ok", niche: "close", own: "ok" }) && needsDifferentiate({ platform: "too_close", niche: "ok", own: "ok" }) && !needsDifferentiate({ platform: "ok", niche: "ok", own: "first" }), "Differentiate shows on the wrong bands");
    check(needsDifferentiate(null, ["design:N1"]), "a server N1 does not offer Differentiate");
    note(`${cands.length} variants under G2 + G4 locks`);
  },
});

registerDesignGroup({
  id: "builder-boldness",
  title: "Bolder / Calmer move the rhythm genes in opposite directions; Upgrade gives a legacy page its look",
  ids: ["DG-12"],
  run({ check }) {
    const doc = cleanDoc("parfum", "fr");
    const g = genomeOf(doc);
    const facts = remixInput(doc, 1, g);
    const up = boldnessStep(g, "bolder", facts);
    const down = boldnessStep(g, "calmer", facts);
    check(up.brand.G5.rd >= g.brand.G5.rd && down.brand.G5.rd <= g.brand.G5.rd, `G5.rd: calmer ${down.brand.G5.rd}, page ${g.brand.G5.rd}, bolder ${up.brand.G5.rd}`);
    check(up.page.G21 <= g.page.G21 && down.page.G21 >= g.page.G21, `G21: calmer ${down.page.G21}, page ${g.page.G21}, bolder ${up.page.G21}`);
    check(JSON.stringify(up) !== JSON.stringify(down), "Bolder and Calmer give the same genome");
    for (const scope of ["bolder", "calmer"] as const) {
      const out = remixDoc(doc, { seed: 4, scope });
      check(out !== doc && PageDoc.safeParse(out).success, `${scope}: no valid change`);
      check(out.sections.length === doc.sections.length, `${scope}: the sections changed`);
    }
    const legacy = baselineDoc("argan", "fr");
    check(!legacy.theme.look, "the baseline fixture already has a look");
    const up2 = remixDoc(legacy, { seed: 1, scope: "upgrade" });
    check(!!up2.theme.look, "Upgrade to design DNA gave no look");
  },
});

registerDesignGroup({
  id: "builder-brand",
  title: "Apply my brand: colours, pairing and genes from the brand setting as one edit; the locks it reports",
  ids: ["DG-12", "SF-02"],
  run({ check }) {
    const doc = cleanDoc("parfum", "fr");
    const g = genomeOf(doc);
    const brand: BrandLite = { accent: "#1f6f5c", pop: "#c7e5dc", base: "light", neutralHue: null, pairing: null, fontsLocked: false, colorLocks: [], genes: { G9: g.brand.G9 === "duotone" ? "tonal" : "duotone" }, voice: true };
    const next = applyBrand(doc, brand);
    check(!!next, "a different brand changed nothing");
    if (next) {
      check(next.theme.palette.accent === "#1f6f5c", "the accent was not applied");
      check(genomeOf(next).brand.G9 === brand.genes.G9, "the brand's colour strategy was not applied");
      check(PageDoc.safeParse(next).success, "the branded page is invalid");
      check(applyBrand(next, brand) === null, "applying the brand twice changed the page again");
    }
    check(JSON.stringify(brandLockedGenes(brand)) === JSON.stringify(["G9", "G28"]), `brand locks: ${brandLockedGenes(brand).join(",")}`);
    check(geneValue(g, "G23") === g.brand.G23.f && geneValue(g, "G2") === g.page.G2, "geneValue reads the wrong holder");
  },
});
