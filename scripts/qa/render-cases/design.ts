/**
 * render-check cases of the design track (P6 DESIGN, design.md).
 * Extension file (docs/STORE-SAAS.md §J.1 `render-check`, §K.3; ENGP-12), created empty at P0 and imported by
 * scripts/qa/render-check.ts; import only types from the harness (it runs at load).
 *
 *  - no-look back-compat (DS4, DES-§23.1, DES-§25.1 "allow-listed diffs only"): every page fixture × ar / fr / en
 *    keeps the theme tokens and `<html>` attributes recorded before P6 (src/lib/design/calibration/legacy-theme.json),
 *    except the reviewed allow-list of scripts/qa/design-legacy-theme.ts, each with its reason: the DS28 spring
 *    (`--lp-ease-spring`, `--lp-ease-pop`), and core D60 / V40 (no `--lp-grain*`, `data-texture="none"`, no
 *    `--lp-aurora*`);
 *  - V40 on the rendered documents: no `--lp-aurora*` custom property, no `--lp-grain`, no `data-texture="grain"` in a
 *    live landing document (the `.lp-aurora` elements leave with the section redraws of a later step);
 *  - the seven primitives (DES-§4.5.4, DES-R18 additive props): their markup on documents without look equals the
 *    goldens recorded from the pre-change primitives (src/lib/design/calibration/primitive-goldens.json, allow-list
 *    `LEGACY_ALLOW` of scripts/qa/design-primitives.ts: empty); under a look, the TC-1 rows the primitives guarantee
 *    and the SectionHeader opener matrix;
 *  - TC-1 T1 CSS lint: tabular lining figures on `.lp-price*`, `.lp-count*`, `[data-num]` in the landing base
 *    stylesheet, and the price cluster one unbroken inline-flex unit (RTL4);
 *  - TC-1 RTL1 (ranges as LTR isolates), RTL2 (countdown plural forms, never "02 يومين"), RTL4 (the price cluster),
 *    T2 (no word boxes, no particle before a breakable space in an Arabic heading) and T7 (Latin runs isolated in
 *    Arabic headings and leads) on the ar fixtures rendered with a look, and RTL2 / RTL4 on a fr one.
 */
import type { RenderCase } from "../render-check";

/**
 * The look documents of the TC-1 rows (design.md DES-§8.10 fixtures: argan T2 and its announcement's "24-48" RTL1,
 * massage T7, parfum RTL4), and one Latin page; four renders keep the case inside test:render's share.
 */
const LOOK_DOCS = [
  ["argan", "ar"],
  ["massage", "ar"],
  ["parfum", "ar"],
  ["tshirt", "fr"],
] as const;

export const cases: RenderCase[] = [
  {
    name: "no-look themes keep today's tokens and attributes (allow-list: DS28, D60)",
    async run(kit) {
      const { compareSet } = await import("../design-legacy-theme");
      for (const d of compareSet("fixtures")) kit.fail(d);
    },
  },
  {
    name: "V40: no aurora or grain custom property and no grain texture in a document's theme",
    async run(kit) {
      // the theme stylesheet is where these custom properties were declared (the landing CSS only reads them, with
      // fallbacks), so the check builds each fixture's theme instead of rendering the documents a second time
      const { validateDoc } = await import("@/lib/page/validate");
      const { buildTheme } = await import("@/lib/theme");
      for (const name of kit.fixtures) {
        for (const locale of ["ar", "fr", "en"] as const) {
          const { doc } = validateDoc(kit.getFixture(name, { now: kit.now, locale }).doc);
          if (!doc) continue;
          const theme = buildTheme({ ...doc.theme, texture: "grain" }, locale);
          const tag = `${name}/${locale}`;
          if (/--lp-aurora(?:-[123])?\s*:/.test(theme.css)) kit.fail(`${tag}: an --lp-aurora custom property is declared`);
          if (/--lp-grain(?:-opacity)?\s*:/.test(theme.css)) kit.fail(`${tag}: an --lp-grain custom property is declared`);
          if (theme.attrs["data-texture"] !== "none") kit.fail(`${tag}: data-texture="${theme.attrs["data-texture"]}" with texture "grain" in the doc`);
        }
      }
    },
  },
  {
    name: "primitives: a document without look keeps the seven primitives' markup (goldens; allow-list empty)",
    async run(kit) {
      const { compareGoldens } = await import("../design-primitives");
      for (const d of compareGoldens()) kit.fail(d);
    },
  },
  {
    name: "primitives under a look: TC-1 rows (T2, T7, RTL1, RTL2, RTL4) and the SectionHeader openers",
    async run(kit) {
      const { lookMatrixProblems } = await import("../design-primitives");
      for (const p of lookMatrixProblems()) kit.fail(p);
    },
  },
  {
    name: "T1 CSS lint: tabular lining figures on .lp-price*, .lp-count*, [data-num]; the price cluster one unit (RTL4)",
    async run(kit) {
      const { numeralCssProblems } = await import("../design-primitives");
      const { baseCss } = await import("@/landing/generated/assets");
      for (const p of numeralCssProblems(baseCss)) kit.fail(`base.css: ${p}`);
    },
  },
  {
    name: "TC-1 on look documents: RTL1, RTL2, RTL4, T2, T7 (ar) and RTL2, RTL4 (fr)",
    async run(kit) {
      const { validateDoc } = await import("@/lib/page/validate");
      const { renderLandingHtml } = await import("@/lib/render/core");
      const { lookDocProblems, withLook } = await import("../design-primitives");
      for (const [name, locale] of LOOK_DOCS) {
        const fx = kit.getFixture(name, { now: kit.now, locale });
        const { doc } = validateDoc(fx.doc);
        if (!doc) {
          kit.fail(`${name}/${locale}: invalid fixture`);
          continue;
        }
        const r = await renderLandingHtml(withLook(doc), kit.liveOptions(name, fx));
        if (r.issues.length) kit.fail(`${name}/${locale} with look: sections failed ${r.issues.map((i) => i.sectionId).join(", ")}`);
        if (!/<html[^>]*\sdata-look="1"/.test(r.html)) kit.fail(`${name}/${locale}: the look document has no data-look`);
        for (const p of lookDocProblems(r.html, locale)) kit.fail(`${name}/${locale} with look: ${p}`);
      }
    },
  },
];
