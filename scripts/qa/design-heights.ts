/**
 * Height-model calibration (P6 DESIGN; design.md DES-§5.3, DES-§5.12, QUAL-5, ENGP-6): renders the baseline matrix of
 * landing fixtures with the live renderer, measures them in Edge at 390 × 844 (Playwright, channel msedge, the QA end
 * state: every reveal shown, no motion) and writes `src/lib/design/calibration/heights.json`: per page its recipe
 * (fixture, archetype, locale, seed), the measured page height, each in-flow section's height and the hero's fold
 * items (top px of the product image, the title, the price, the primary CTA and the COD line). Numbers and ids only,
 * never page text, so `test:design` and `test:prepublish` read a committed fixture instead of the git-ignored
 * qa/saas-baseline/index.json (which records page totals only).
 *
 *   npx tsx scripts/qa/design-heights.ts             measure and write the fixture
 *   npx tsx scripts/qa/design-heights.ts --check     measure and compare with the model, write nothing
 *   npx tsx scripts/qa/design-heights.ts --only argan-default-ar
 *
 * No server: each document is written to a temp folder with its fonts and photos pointing at public/ on disk (the
 * scripts/qa/render.ts method) and opened from file://. Run it through the machine mutex (it starts a browser).
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { fixtureAssets, getFixture, type FixtureLocale, type FixtureName } from "@/lib/page/fixtures";
import type { Archetype } from "@/lib/page/schema";
import { validateDoc } from "@/lib/page/validate";
import { renderLandingHtml } from "@/lib/render/core";
import { HEIGHT_MODEL_VERSION } from "@/lib/design/heights";
import { CALIBRATION_NOW, CALIBRATION_RECIPES, recipeName, type CalibrationFile, type CalibrationPage } from "@/lib/design/heights-calibration";

const ROOT = resolve(__dirname, "..", "..");
const PUBLIC_URL = pathToFileURL(join(ROOT, "public")).href + "/";
const OUT = join(ROOT, "src", "lib", "design", "calibration", "heights.json");

const QA_CSS =
  "html.lp-qa *,html.lp-qa *::before,html.lp-qa *::after{transition-duration:0s!important;transition-delay:0s!important;" +
  "animation-duration:0s!important;animation-delay:0s!important;animation-iteration-count:1!important;scroll-behavior:auto!important}";

/** The QA end state baked in (scripts/qa/render.ts): every [data-reveal] element starts with data-in. */
const revealAll = (html: string) => html.replace(/(<[a-zA-Z][a-zA-Z0-9-]*\b[^<>]*?\sdata-reveal="[^"]*")/g, '$1 data-in=""');
const localizeFonts = (html: string) => html.replace(/url\("\/fonts\//g, `url("${PUBLIC_URL}fonts/`).replace(/<link rel="preload" as="font"[^>]*\/>/g, "");

async function renderPage(fixture: FixtureName, locale: FixtureLocale, archetype: Archetype | undefined, seed: number | undefined): Promise<{ html: string; sids: Map<string, [string, string]>; hero: string }> {
  const fx = getFixture(fixture, { archetype, locale, seed, now: CALIBRATION_NOW });
  const { doc } = validateDoc(fx.doc);
  if (!doc) throw new Error(`${fixture}/${locale}: invalid fixture doc`);
  const r = await renderLandingHtml(doc, {
    mode: "live",
    assets: fixtureAssets(PUBLIC_URL),
    pageKey: fx.pageKey,
    store: fx.store,
    links: { home: "./", privacy: "./", terms: "./", shipping: "./", contact: "./" },
    urls: { landing: "./", thankYou: "./", endpoints: { order: "/api/public/order" } },
    base: "/",
    now: CALIBRATION_NOW,
    runtimeMode: "preview",
    qa: true,
    upgradeInsecureRequests: false,
  });
  if (r.issues.length) throw new Error(`${fixture}/${locale}: sections failed ${r.issues.map((i) => i.sectionId).join(", ")}`);
  const sids = new Map(doc.sections.filter((s) => !s.hidden).map((s) => [s.id, [s.type, s.variant] as [string, string]]));
  return { html: revealAll(localizeFonts(r.html)), sids, hero: doc.sections.find((s) => s.type === "hero" && !s.hidden)?.variant ?? "" };
}

interface Measured {
  total: number;
  sections: { sid: string; top: number; h: number; fixed: boolean }[];
  fold: Record<string, number>;
}

/** Runs in the page: every top-level section's box, the page height and the hero's fold items (top px). */
const MEASURE = `(() => {
  const y = (el) => (el ? Math.round(el.getBoundingClientRect().top + window.scrollY) : -1);
  const sections = [];
  for (const el of Array.from(document.querySelectorAll("[data-sid]"))) {
    if (el.parentElement && el.parentElement.closest("[data-sid]")) continue;
    const r = el.getBoundingClientRect();
    sections.push({ sid: el.getAttribute("data-sid") || "", top: Math.round(r.top + window.scrollY), h: Math.round(r.height), fixed: getComputedStyle(el).position === "fixed" });
  }
  const hero = document.querySelector(".lp-hero");
  const fold = {};
  if (hero) {
    fold.image = y(hero.querySelector(".lp-hero__visual img, .lp-hero__visual, .lp-hero__media img, picture img, img"));
    fold.title = y(hero.querySelector("h1"));
    fold.price = y(hero.querySelector(".lp-hero__price, .lp-price"));
    fold.cta = y(hero.querySelector(".lp-hero__cta, [data-hero-cta]"));
    fold.cod = y(hero.querySelector(".lp-hero__trust"));
  }
  return { total: document.documentElement.scrollHeight, sections, fold };
})()`;

async function main() {
  const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : undefined;
  const check = process.argv.includes("--check");
  const dir = mkdtempSync(join(tmpdir(), "p6-heights-"));
  const browser = await chromium.launch({ channel: "msedge", args: ["--allow-file-access-from-files", "--font-render-hinting=none"] });
  const pages: CalibrationPage[] = [];
  try {
    for (const rc of CALIBRATION_RECIPES) {
      const name = recipeName(rc);
      if (only && name !== only) continue;
      const { html, sids, hero } = await renderPage(rc.fixture, rc.locale, rc.arch ?? undefined, rc.seed ?? undefined);
      const file = join(dir, `${name}.html`);
      writeFileSync(file, html, "utf8");
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
      const page = await context.newPage();
      await page.addInitScript({
        content: `new MutationObserver(function () { var r = document.documentElement; if (!r || r.hasAttribute("data-qa-css")) return; r.setAttribute("data-qa-css", ""); var s = document.createElement("style"); s.textContent = ${JSON.stringify(QA_CSS)}; r.appendChild(s); }).observe(document, { childList: true, subtree: true });`,
      });
      // the page's clock is the render time: a countdown stays live (an expired one hides its section)
      await page.clock.install({ time: new Date(CALIBRATION_NOW) });
      await page.goto(pathToFileURL(file).href, { waitUntil: "load" });
      await page.evaluate(async () => {
        for (const img of Array.from(document.images)) img.loading = "eager";
        await Promise.all(Array.from(document.images).map((img) => img.decode().catch(() => null)));
        await document.fonts.ready;
      });
      await page.waitForTimeout(250);
      // a string, not a function: tsx's name helper (`__name`) does not exist in the page
      const m = (await page.evaluate(MEASURE)) as Measured;
      await context.close();
      // a section's height runs to the next in-flow section's top (dividers and gaps belong to the section above);
      // document order, never sorted by position (a section the runtime hides measures 0)
      const flow = m.sections.filter((s) => !s.fixed && sids.has(s.sid));
      const rows: CalibrationPage["sections"] = flow.map((s, i) => {
        const [type, variant] = sids.get(s.sid)!;
        if (s.h === 0) return [type, variant, 0];
        const next = flow.slice(i + 1).find((x) => x.h > 0)?.top ?? m.total;
        return [type, variant, Math.max(0, next - s.top)];
      });
      const fold: CalibrationPage["fold"] = {};
      for (const k of ["image", "title", "price", "cta", "cod"] as const) if ((m.fold[k] ?? -1) >= 0) fold[k] = m.fold[k];
      pages.push({ ...rc, total: m.total, hero, fold, sections: rows });
      console.log(`${name.padEnd(28)} ${String(m.total).padStart(6)} px · ${rows.length} sections · hero ${hero} fold ${JSON.stringify(fold)}`);
    }
  } finally {
    await browser.close();
    rmSync(dir, { recursive: true, force: true });
  }
  if (check || only) return;
  const file: CalibrationFile = {
    v: 1,
    model: HEIGHT_MODEL_VERSION,
    viewport: [390, 844],
    now: CALIBRATION_NOW,
    renderer: "scripts/qa/design-heights.ts: live renderer, QA end state, Playwright channel msedge, 390 × 844 @2x",
    pages,
  };
  writeFileSync(OUT, JSON.stringify(file, null, 1).replace(/\[\n\s+("[^"]+"),\n\s+("[^"]+"),\n\s+(\d+)\n\s+\]/g, "[$1, $2, $3]") + "\n", "utf8");
  console.log(`wrote ${pages.length} pages → src/lib/design/calibration/heights.json`);
}

main().catch((e) => {
  console.error(e instanceof Error ? (e.stack ?? e.message) : e);
  process.exit(1);
});
