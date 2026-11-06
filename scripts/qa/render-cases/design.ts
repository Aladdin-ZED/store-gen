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
 *    Arabic headings and leads) on the ar fixtures rendered with a look, and RTL2 / RTL4 on a fr one; on the same look
 *    documents the reveal scope (≤ 60 `data-reveal` nodes, DES-§5.11 G35, budget R5);
 *  - the section kit redraws (step 4; DES-§4.5.4, sheets H1-H4, H9, S5-S8): the 14 fixture-default baseline documents
 *    against their goldens (scripts/qa/design-baseline.ts: published checksums unchanged, markup and stylesheet chunks
 *    changed only in the reviewed redraws, base-stylesheet rules added only under a look-only scope; the 41 run in
 *    test:design --full), the kit pages of scripts/qa/design-kit.ts in ar and fr (every redrawn variant and the four
 *    former aurora variants), and every fixture in ar: V40 (no `.lp-aurora` element, no `--lp-aurora*` / `--lp-grain`
 *    custom property, no `data-texture="grain"`), RTL3 (no `writing-mode` or `textPath` reaching Arabic), RTL5 (the
 *    footer's addresses and e-mails), no removed shape (owner rule 2), the cta's `data-hero-cta` (DES-§5.9) and DS42;
 *  - section kit II (step 5; DES-§4.5.4, sheets H5-H10, S1-S4): the kit pages of `KIT_NEW` in ar and fr (the five new
 *    hero families, split's ratio and media side, the four new sections, the one-asset page with a single 1,200 px
 *    phone photo without alpha) through the redraw checks and the static C2 rows; and the CSS accounting of the
 *    per-variant chunks: each new hero family ≤ 1,400 B gz, one family plus the two heaviest new sections ≤ 2,700 B gz;
 *  - CRIT15 (core D76, §C.6): a live render, a test render and a preview each carry exactly one absolute
 *    `/report/<handle>?p=<path>` link, drawn by the footer (`footer:big` and `footer:simple`) with `rel="nofollow"`, and
 *    an export carries none.
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
      const { kitMarkupProblems } = await import("../design-kit");
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
        // the reveal scope (G35, R5): the hero and the section heads only
        const body = r.html.slice(r.html.indexOf("<body")).replace(/<script\b[\s\S]*?<\/script>/g, "");
        const reveals = (body.match(/\sdata-reveal(?=[\s=>])/g) ?? []).length;
        if (reveals > 60) kit.fail(`${name}/${locale} with look: ${reveals} data-reveal nodes (≤ 60)`);
        for (const p of kitMarkupProblems(r.html, locale)) kit.fail(`${name}/${locale} with look: ${p}`);
      }
    },
  },
  {
    name: "baseline: the 14 fixture-default documents keep their checksums, and change only in the reviewed redraws",
    async run(kit) {
      const { BASELINE_DEFAULTS, compareBaseline } = await import("../design-baseline");
      for (const p of await compareBaseline(BASELINE_DEFAULTS)) kit.fail(p);
    },
  },
  {
    name: "section kit: the redrawn variants in ar and fr (V40, RTL3, RTL5, owner rule 2, data-hero-cta, DS42)",
    async run(kit) {
      const { renderLandingHtml } = await import("@/lib/render/core");
      const { KIT, kitDoc, kitMarkupProblems } = await import("../design-kit");
      for (const spec of KIT) {
        for (const locale of ["ar", "fr"] as const) {
          const { doc, fx } = kitDoc(spec, locale, kit.now);
          const r = await renderLandingHtml(doc, kit.liveOptions(spec.fixture, fx));
          const tag = `${spec.name}/${locale}`;
          if (r.issues.length) kit.fail(`${tag}: sections failed ${r.issues.map((i) => i.sectionId).join(", ")}`);
          for (const p of kitMarkupProblems(r.html, locale, { cta: true, stats: spec.data?.stats ? "shown" : "none" })) kit.fail(`${tag}: ${p}`);
        }
      }
    },
  },
  {
    name: "every fixture in ar: V40, RTL3, RTL5, no removed shape, DS42 (library figures stay off the page)",
    async run(kit) {
      const { validateDoc } = await import("@/lib/page/validate");
      const { renderLandingHtml } = await import("@/lib/render/core");
      const { kitMarkupProblems } = await import("../design-kit");
      for (const name of kit.fixtures) {
        const fx = kit.getFixture(name, { now: kit.now, locale: "ar" });
        const { doc } = validateDoc(fx.doc);
        if (!doc) continue;
        const r = await renderLandingHtml(doc, kit.liveOptions(name, fx));
        const examples = !doc.product.rating && doc.sections.some((s) => s.type === "stats" && !s.hidden && (s.data as { sample?: unknown }).sample === true);
        for (const p of kitMarkupProblems(r.html, "ar", examples ? { stats: "none" } : {})) kit.fail(`${name}/ar: ${p}`);
      }
    },
  },
  {
    name: "section kit II: the new hero families, split's options, the four new sections and the one-asset page in ar and fr",
    async run(kit) {
      const { renderLandingHtml } = await import("@/lib/render/core");
      const { KIT_NEW, kitAssets, kitDoc, kitMarkupProblems, newKitProblems } = await import("../design-kit");
      for (const spec of KIT_NEW) {
        for (const locale of ["ar", "fr"] as const) {
          const { doc, fx } = kitDoc(spec, locale, kit.now);
          const opts = kit.liveOptions(spec.fixture, fx);
          const r = await renderLandingHtml(doc, { ...opts, assets: kitAssets(spec, doc, opts.assets) });
          const tag = `${spec.name}/${locale}`;
          if (r.issues.length) kit.fail(`${tag}: sections failed ${r.issues.map((i) => i.sectionId).join(", ")}`);
          for (const p of [...kitMarkupProblems(r.html, locale), ...newKitProblems(r.html, spec)]) kit.fail(`${tag}: ${p}`);
        }
      }
    },
  },
  {
    name: "section kit II CSS: each new hero family's chunk ≤ 1,400 B gz; one family + the two heaviest new sections ≤ 2,700 B gz",
    async run(kit) {
      const { gzipSync } = await import("node:zlib");
      const { sectionChunkCss } = await import("@/landing/generated/chunks");
      const gz = (key: string) => {
        const css = (sectionChunkCss as Readonly<Record<string, string>>)[key];
        if (!css) kit.fail(`no stylesheet chunk ${key}`);
        return css ? gzipSync(Buffer.from(css, "utf8"), { level: 9 }).length : 0;
      };
      const heroes = ["cinema", "quiet", "index", "contact", "statement"].map((v) => [v, gz(`hero.${v}`)] as const);
      for (const [v, n] of heroes) if (n > 1400) kit.fail(`hero.${v}: ${n} B gz (≤ 1,400)`);
      const sections = ["benefits.hanging", "showcase.figure", "gallery.contact", "offer.showcase"].map(gz).sort((a, b) => b - a);
      const page = Math.max(...heroes.map(([, n]) => n)) + sections[0]! + sections[1]!;
      if (page > 2700) kit.fail(`the heaviest family + two new sections: ${page} B gz (≤ 2,700)`);
    },
  },
  {
    name: "CRIT15: one absolute report link in a live render, a test render and a preview (footer big, simple), none in an export",
    async run(kit) {
      const { validateDoc } = await import("@/lib/page/validate");
      const { renderLandingHtml } = await import("@/lib/render/core");
      const { exportLinks } = await import("@/landing/context");
      const { fixtureAssets } = await import("@/lib/page/fixtures");
      // argan draws footer:big, blender footer:simple
      for (const [name, locale] of [["argan", "ar"], ["blender", "fr"]] as const) {
        const fx = kit.getFixture(name, { now: kit.now, locale });
        const { doc } = validateDoc(fx.doc);
        if (!doc) {
          kit.fail(`${name}/${locale}: invalid fixture`);
          continue;
        }
        const live = kit.liveOptions(name, fx);
        const href = live.links.report ?? "";
        const t = (u: string) => `${u}?sg-test=t`;
        const e = live.urls.endpoints;
        const test = { ...live, urls: { ...live.urls, thankYou: t(live.urls.thankYou), endpoints: { order: t(e.order), lead: t(e.lead), upsell: t(e.upsell) } }, pixels: false };
        const preview = { ...live, runtimeMode: "preview" as const, pageKey: "pk_preview_page", upgradeInsecureRequests: false };
        for (const [mode, opts] of [["live", live], ["test", test], ["preview", preview]] as const) {
          const r = await renderLandingHtml(doc, opts);
          const tag = `${name}/${locale}/${mode}`;
          const links = [...r.html.matchAll(/<a href="(https?:\/\/[^"]*\/report\/[^"]*)"[^>]*>/g)];
          if (links.length !== 1) {
            kit.fail(`${tag}: ${links.length} report links (exactly 1)`);
            continue;
          }
          const a = links[0]![0];
          const url = links[0]![1]!;
          if (url !== href || !/^https:\/\/[^/]+\/report\/qa-store\?p=%2F/.test(url)) kit.fail(`${tag}: the report link is not the absolute reportUrl given (${url})`);
          if (!/\srel="nofollow"/.test(a)) kit.fail(`${tag}: the report link has no rel="nofollow"`);
          const at = r.html.indexOf(a);
          const footer = r.html.search(/<footer\b[^>]*\sdata-section="footer"/);
          if (footer < 0 || at < footer || at > r.html.indexOf("</footer>", footer)) kit.fail(`${tag}: the report link is not in the footer's legal row`);
          if (r.html.includes('<p class="lp-report">')) kit.fail(`${tag}: the shell's fallback row is drawn beside the footer's link`);
        }
        const exported = await renderLandingHtml(doc, {
          mode: "export",
          assets: fixtureAssets("./"),
          pageKey: fx.pageKey,
          store: fx.store,
          urls: { landing: "./", thankYou: "merci/index.html", endpoints: { order: e.order } },
          links: exportLinks(0),
          now: kit.now,
        });
        const markup = exported.html.replace(/<style>[\s\S]*?<\/style>/g, "");
        if (/\/report\/|lp-report|lp-footer__legal-report/.test(markup)) kit.fail(`${name}/${locale}/export: an exported document carries the report link`);
      }
    },
  },
];
