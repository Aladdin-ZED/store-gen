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
 *    live landing document (the `.lp-aurora` elements leave with the section redraws of a later step).
 */
import type { RenderCase } from "../render-check";

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
];
