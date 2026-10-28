/**
 * Renderer regression check — every fixture × ar/fr/en × landing, thank-you and the four legal
 * documents, rendered in memory (no files written) with the live renderer:
 *  - no section fails to render; every inline <script>/<style> hash is in the CSP; the live CSP has
 *    frame-ancestors + upgrade-insecure-requests; one runtime script on landing/thank-you, none on
 *    legal documents; style attributes only carry custom properties; lp-config parses;
 *  - every BuiltTheme attribute the CSS switches on is on <html>;
 *  - dividers are v2 kinds only, never the same shape twice in a row, none on "panels" pages;
 *  - a v1 document (paper texture, hard shadow, torn/scallop dividers…) is migrated, not rejected;
 *  - store documents (docs/STORE-SAAS.md §C.6, §C.8): links and URLs under the store base (`/s/<h>/<slug>`,
 *    `/s/<h>/policies/<kind>?p=`), the canonical at the store's origin, and no aggregateRating in the JSON-LD even
 *    when the doc carries a rating;
 *  - runtime size budgets (docs/OFFERS.md §F.9, src/landing/runtime/budgets.json): every chunk and every page
 *    cap of `compositions` (page, thanks-page: the chunks of one document) at most the recorded gzip + 5%, except the
 *    frozen `landing` chunk (docs/STORE-SAAS.md header freeze rule, ENGC-10): tolerance 0 against its recorded
 *    budget, and its bytes equal to the pin `src/landing/runtime/landing.sha256` (sha256 hex of the chunk text); the
 *    add-on chunks (§H.13, `addonChunks`) are measured with them once the asset build emits them, each against its own
 *    budget, and count in the compositions that name them;
 *  - inlined CSS budgets (design.md DES-R5, DS24, DES-§19, DES-§4.5.4; budgets.json `css`, `css-base`, `css-variants`):
 *    over every live landing document, the gzip -9 bytes of the shared base stylesheet (`baseCss`), of the page's
 *    section and variant chunks (`sectionChunks`, checked to be exactly what the document inlines after the base) and
 *    of its whole inline stylesheet; each maximum fails above its key, so a chunk that drifts into base.css fails its
 *    own line;
 *  - "Report this store" (docs/STORE-SAAS.md D76, §C.6, §K.2 P0 maintainer CCR, CRIT15): every live landing document
 *    carries exactly one link to its absolute `reportUrl` (the Shell's `.lp-report` row until P6's footer draws it,
 *    before the floating layers), with its footer shown or hidden; thank-you and legal documents at most one (P3 draws
 *    them); an export carries none;
 *  - the tracks' cases (docs/STORE-SAAS.md §J.1 render-check, §K.3, ENGP-12): every `./render-cases/<track>.ts`
 *    exports `cases: RenderCase[]`, imported below (written at P0, `scripts/qa/registries-check.ts` proves none is
 *    left out), so no track edits this harness. A case file imports only types from here: this module runs at load.
 *
 *   npx tsx scripts/qa/render-check.ts        (exit code 1 on any failure)
 */
import { exportLinks, LEGAL_KINDS, storePageLinks } from "@/landing/context";
import { FIXTURE_NAMES, fixtureAssets, getFixture, type Fixture, type FixtureName } from "@/lib/page/fixtures";
import { DIVIDERS } from "@/lib/page/schema";
import { validateDoc } from "@/lib/page/validate";
import { inlineHashes, renderLandingHtml, renderLegalHtml, renderThankYouHtml, styleAttrViolations } from "@/lib/render/core";
import { runtimeScripts, sectionChunks, variantChunksIn } from "@/landing/document";
import { addonChunks, baseCss, runtimeChunks } from "@/landing/generated/assets";
import type { LandingRuntimeConfig } from "@/landing/runtime/config";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { cases as aiCases } from "./render-cases/ai";
import { cases as designCases } from "./render-cases/design";
import { cases as landingCases } from "./render-cases/landing";
/** Same values as PUBLIC_ENDPOINTS in src/lib/render/store-context.server.ts (server-only, not importable here). */
const PUBLIC_ENDPOINTS = { order: "/api/public/order", lead: "/api/public/lead", event: "/api/public/event", upsell: "/api/public/upsell" };

const now = "2026-10-07T12:00:00.000Z";
const STORE_BASE = "/s/qa-store" as const;
/** What the server's `reportUrl(store, storePath(store, "/<slug>"))` answers for the QA store (src/lib/urls, §C.6). */
const reportFor = (path: string) => `https://platform.example/report/qa-store?p=${encodeURIComponent(path)}`;
const REPORT_LINK = /<a href="https:\/\/platform\.example\/report\/qa-store[?"]/g;
const reportLinks = (html: string) => (html.match(REPORT_LINK) ?? []).length;
let failures = 0;
const fail = (m: string) => {
  failures++;
  console.log("  FAIL " + m);
};
const gz = (s: string) => gzipSync(Buffer.from(s, "utf8"), { level: 9 }).length;

/** The document's one inline stylesheet (documentCss: font faces, theme tokens, base, section chunks, add-on CSS, rows). */
const STYLE = /<style>([\s\S]*?)<\/style>/;
const SECTION_TYPE = /\sdata-section="([A-Za-z][A-Za-z0-9]{0,40})"/g;
/** The largest inlined-CSS figures over the live landing documents, gzip -9 bytes, with the page they come from. */
const cssMax = { base: { bytes: 0, at: "" }, variants: { bytes: 0, at: "" }, page: { bytes: 0, at: "" } };
const keepMax = (m: { bytes: number; at: string }, bytes: number, at: string) => {
  if (bytes > m.bytes) Object.assign(m, { bytes, at });
};

/**
 * Measures a live landing document's inline stylesheet: the whole of it, the shared base, and the page's section and
 * variant chunks, i.e. `sectionChunks(doc, rendered)` with `rendered` read back from the markup (the section roots'
 * data-section types, `variantChunksIn`). The chunks must be exactly what the document inlines after the base.
 */
function measureCss(tag: string, doc: Parameters<typeof sectionChunks>[0], html: string) {
  const style = STYLE.exec(html)?.[1] ?? "";
  const body = html.slice(html.indexOf("<body")).replace(/<script\b[\s\S]*?<\/script>/g, "");
  const rendered = { types: new Set([...body.matchAll(SECTION_TYPE)].map((m) => m[1]!)), variants: variantChunksIn(body) };
  const sections = sectionChunks(doc, rendered).join("\n");
  if (!style.includes(sections ? `${baseCss}\n${sections}` : baseCss)) {
    fail(`${tag}: the inline stylesheet is not the base then the section chunks render-check measures (css budgets unreliable)`);
    return;
  }
  keepMax(cssMax.base, gz(baseCss), tag);
  keepMax(cssMax.variants, gz(sections), tag);
  keepMax(cssMax.page, gz(style), tag);
}

/** The live store-page options every fixture is rendered with: a store document in P mode (docs/STORE-SAAS.md §C.6). */
function liveOptions(name: FixtureName, fx: Fixture) {
  return {
    mode: "live" as const,
    assets: fixtureAssets("/"),
    pageKey: fx.pageKey,
    store: fx.store,
    urls: { landing: `${STORE_BASE}/${name}`, thankYou: `${STORE_BASE}/${name}/merci`, endpoints: PUBLIC_ENDPOINTS },
    links: storePageLinks(STORE_BASE, name, reportFor(`${STORE_BASE}/${name}`)),
    origin: "https://shop.example",
    now,
    upgradeInsecureRequests: true,
  };
}

/** What a case gets: the harness's fixtures, options and failure counter (a case renders with the live renderer itself). */
export interface RenderKit {
  now: string;
  storeBase: typeof STORE_BASE;
  fixtures: readonly FixtureName[];
  getFixture: typeof getFixture;
  liveOptions: typeof liveOptions;
  /** counts one failure (the run exits 1) and prints it under the case's name */
  fail(message: string): void;
}

/** What a track's case file exports: `export const cases: RenderCase[]` (scripts/qa/render-cases/<track>.ts). */
export interface RenderCase {
  name: string;
  run(kit: RenderKit): void | Promise<void>;
}

/** Every case file, in track order (P3, P6, P7). */
const RENDER_CASES: readonly (readonly [track: string, cases: readonly RenderCase[]])[] = [
  ["landing", landingCases],
  ["design", designCases],
  ["ai", aiCases],
];

async function main() {
  for (const name of FIXTURE_NAMES) {
    for (const locale of ["ar", "fr", "en"] as const) {
      const fx = getFixture(name, { now, locale });
      const { doc, issues } = validateDoc(fx.doc);
      if (!doc) {
        fail(`${name}/${locale}: invalid doc ${JSON.stringify(issues.slice(0, 3))}`);
        continue;
      }
      // a store document in P mode (docs/STORE-SAAS.md §C.6): store base "/s/qa-store", platform origin
      const opts = liveOptions(name, fx);
      const pages = [
        ["landing", await renderLandingHtml(doc, opts)],
        ["merci", await renderThankYouHtml(doc, opts)],
        ...(await Promise.all(LEGAL_KINDS.map(async (k) => [k, await renderLegalHtml(doc, k, { mode: "live", assets: opts.assets, store: fx.store, links: opts.links, now, upgradeInsecureRequests: true })] as const))),
      ] as const;
      const warns = issues.filter((i) => i.level === "warning").length;
      console.log(`${name}/${locale} ${doc.theme.archetype} warnings=${warns}`);
      for (const [kind, r] of pages) {
        const { scripts, styles } = inlineHashes(r.html);
        const tag = `${name}/${locale}/${kind}`;
        if (r.issues.length) fail(`${tag}: failed sections ${r.issues.map((i) => i.sectionId + ":" + i.message).join("; ")}`);
        for (const h of [...scripts, ...styles]) if (!r.csp.includes(`'${h}'`)) fail(`${tag}: hash missing from CSP ${h}`);
        const styleCount = (r.html.match(/<style\b/g) ?? []).length;
        // Offers v2 (§F.9): the core chunk plus exactly the feature / pixels / turnstile chunks the page's config needs
        const pageCfg = /<script type="application\/json" id="lp-config">([\s\S]*?)<\/script>/.exec(r.html)?.[1];
        const want =
          kind === "landing" || kind === "merci"
            ? pageCfg
              ? runtimeScripts(kind === "landing" ? "landing" : "thanks", JSON.parse(pageCfg) as LandingRuntimeConfig).map((js) => `sha256-${createHash("sha256").update(js.replace(/\r\n?/g, "\n"), "utf8").digest("base64")}`)
              : null
            : [];
        if (want === null) fail(`${tag}: no #lp-config`);
        else if (scripts.length !== want.length || want.some((h) => !scripts.includes(h))) fail(`${tag}: ${scripts.length} executable scripts, expected exactly the ${want.length} chunk(s) its config needs`);
        if (styleCount < 1) fail(`${tag}: no <style>`);
        const v = styleAttrViolations(r.html);
        if (v.length) fail(`${tag}: style attr violations ${v.slice(0, 3).join(" | ")}`);
        const html = /<html[^>]*>/.exec(r.html)?.[0] ?? "";
        for (const a of ["data-surfaces", "data-arch", "data-btn", "data-shadow", "data-texture"]) if (!html.includes(a + "=")) fail(`${tag}: <html> lacks ${a}`);
        if (/data-kind="(marquee-tape|scallop|zigzag|torn|stitch|zellige-band)"/.test(r.html.replace(/<style[\s\S]*?<\/style>/g, ""))) fail(`${tag}: retired divider/edge name in markup`);
        if (!/frame-ancestors 'none'/.test(r.csp) || !/upgrade-insecure-requests/.test(r.csp)) fail(`${tag}: live CSP lacks frame-ancestors/upgrade`);
        // D76 / CRIT15: one report link per landing document; P3 adds the thank-you and legal ones (at most one each)
        const reports = reportLinks(r.html);
        if (kind === "landing" ? reports !== 1 : reports > 1) fail(`${tag}: ${reports} "Report this store" links, expected ${kind === "landing" ? "exactly 1" : "at most 1"}`);
        if (kind === "landing" && !r.html.includes(`href="${reportFor(`${STORE_BASE}/${name}`)}"`)) fail(`${tag}: the report link is not the document's absolute reportUrl`);
        if (kind === "landing") {
          if (!r.html.includes(`<link rel="canonical" href="https://shop.example${STORE_BASE}/${name}"/>`)) fail(`${tag}: canonical is not the store URL`);
          if (/aggregateRating/i.test(r.html)) fail(`${tag}: aggregateRating in the document (§C.8)`);
          if (/href="\/legal\//.test(r.html)) fail(`${tag}: a root /legal link`);
          const kinds = [...r.html.matchAll(/class="lp-divider[^"]*" data-kind="([a-z]+)"/g)].map((m) => m[1]!);
          const surfaces = /data-surfaces="(\w+)"/.exec(html)?.[1];
          if (kinds.some((k) => !(DIVIDERS as readonly string[]).includes(k))) fail(`${tag}: unknown divider ${kinds.join(",")}`);
          if (surfaces === "panels" && kinds.length) fail(`${tag}: auto dividers on a panels page (${kinds.join(",")})`);
          for (let i = 1; i < kinds.length; i++) if (kinds[i] === kinds[i - 1]) fail(`${tag}: same divider twice in a row (${kinds[i]})`);
          console.log(`   ${surfaces} dividers: ${kinds.join(" ") || "-"} · ${Math.round(r.html.length / 1024)} KB`);
          const cfg = /<script type="application\/json" id="lp-config">([\s\S]*?)<\/script>/.exec(r.html)?.[1];
          if (!cfg || JSON.parse(cfg).v !== 2) fail(`${tag}: lp-config missing or not v2`);
          measureCss(`${name}/${locale}`, doc, r.html);
        }
      }
    }
  }

  /* "Report this store" (D76, CRIT15): the Shell row with the footer hidden, its place, and never in an export */
  for (const name of FIXTURE_NAMES) {
    const fx = getFixture(name, { now, locale: name === "argan" ? "ar" : "fr" });
    const { doc } = validateDoc(fx.doc);
    if (!doc) continue;
    const noFooter = { ...doc, sections: doc.sections.map((x) => (x.type === "footer" ? { ...x, hidden: true } : x)) };
    const live = await renderLandingHtml(noFooter, liveOptions(name, fx));
    const tag = `${name}/report`;
    if (reportLinks(live.html) !== 1 || !live.html.includes('<p class="lp-report">')) fail(`${tag}: footer hidden, ${reportLinks(live.html)} report links (expected the Shell row)`);
    const row = live.html.indexOf('<p class="lp-report">');
    const floating = live.html.search(/<(?:aside|div|a)\b[^>]*class="lp-(?:sticky|wa)\b/);
    if (row >= 0 && floating >= 0 && floating < row) fail(`${tag}: the report row comes after a floating layer`);
    const { styles } = inlineHashes(live.html);
    for (const h of styles) if (!live.csp.includes(`'${h}'`)) fail(`${tag}: style hash missing from the CSP`);
    const exported = await renderLandingHtml(doc, { mode: "export", assets: fixtureAssets("./"), pageKey: fx.pageKey, store: fx.store, urls: { landing: "./", thankYou: "merci/index.html", endpoints: PUBLIC_ENDPOINTS }, links: exportLinks(0), now });
    if (/\/report\/|lp-report/.test(exported.html)) fail(`${name}/export: an exported document carries the report link`);
  }
  console.log("report link: one per live landing (footer shown or hidden), none in exports");

  /* legacy (v1) theme values are migrated, not fatal */
  const fx = getFixture("argan", { now });
  const legacy = JSON.parse(JSON.stringify(fx.doc));
  legacy.theme.texture = "paper";
  legacy.theme.shadow = "hard";
  legacy.theme.surfaces = "boxed";
  legacy.theme.dividers = ["torn", "arch", "scallop", "arch"];
  legacy.sections[3].divider = "marquee-tape";
  legacy.sections[4].bg = "kraft";
  const v = validateDoc(legacy);
  if (!v.doc) fail(`legacy doc rejected: ${JSON.stringify(v.issues.slice(0, 4))}`);
  else {
    const t = v.doc.theme;
    if (t.texture !== "archetype" || t.shadow !== "archetype" || t.surfaces !== "archetype" || t.dividers.join() !== "arch") fail(`legacy theme not migrated ${JSON.stringify(t)}`);
    if (v.doc.sections[3]!.divider !== "auto" || v.doc.sections[4]!.bg !== "base") fail("legacy section values not migrated");
    console.log(`legacy migration: ${v.issues.filter((i) => i.message.startsWith("Retired")).length} retired values repaired`);
  }

  // the tracks' cases (ENGP-12): a case that throws is one failure, and the next case still runs
  let caseCount = 0;
  for (const [track, cases] of RENDER_CASES) {
    for (const c of cases) {
      caseCount++;
      const kit: RenderKit = { now, storeBase: STORE_BASE, fixtures: FIXTURE_NAMES, getFixture, liveOptions, fail: (m) => fail(`[${track}] ${c.name}: ${m}`) };
      try {
        await c.run(kit);
      } catch (e) {
        fail(`[${track}] ${c.name} threw: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
  console.log(`render cases: ${caseCount} (${RENDER_CASES.map(([t, c]) => `${t} ${c.length}`).join(" · ")})`);

  // runtime budgets: gzip -9 of each chunk, and of each page cap's chunks in one document (CCR r1.0-c0b-1)
  const budgets = JSON.parse(readFileSync(join(__dirname, "..", "..", "src", "landing", "runtime", "budgets.json"), "utf8")) as Record<string, unknown> & {
    compositions?: Record<string, string[]>;
  };
  const budgetOf = (name: string) => (typeof budgets[name] === "number" ? (budgets[name] as number) : undefined);
  // every chunk a document can embed: the core runtime chunks, plus the add-on chunks once the hook builds them (§H.13)
  const chunks: Record<string, string> = { ...runtimeChunks, ...addonChunks };
  const sizes: Record<string, number> = {};
  for (const [name, js] of Object.entries(chunks)) sizes[name] = gz(js);
  // page caps = the chunks of one document, from budgets.json (ENGP-12): a new chunk needs no change here
  const compositions = budgets.compositions ?? {};
  if (!compositions.page || !compositions["thanks-page"]) fail("budgets.json: compositions.page / compositions['thanks-page'] missing");
  for (const [cap, names] of Object.entries(compositions)) {
    const unbudgeted = names.filter((n) => budgetOf(n) === undefined);
    if (unbudgeted.length) fail(`budgets.json compositions.${cap}: ${unbudgeted.join(", ")} have no budget`);
    // a named chunk that is not built yet (the R1 add-ons before P3) adds nothing, so today's page measures as before
    sizes[cap] = gz(names.filter((n) => n in chunks).map((n) => chunks[n]).join("\n"));
  }
  for (const [name, size] of Object.entries(sizes)) {
    const budget = budgetOf(name);
    if (typeof budget !== "number") fail(`runtime ${name}: no budget in budgets.json`);
    else if (name === "landing" ? size > budget : size > budget * 1.05) fail(`runtime ${name} is ${size} B gzip — over its ${budget} B budget${name === "landing" ? " (frozen: tolerance 0)" : " + 5%"}`);
  }
  // the frozen landing chunk: byte-identical to its pin (any change re-records size and pin through the maintainer)
  const pinFile = join(__dirname, "..", "..", "src", "landing", "runtime", "landing.sha256");
  const pin = (readFileSync(pinFile, "utf8").trim().split(/\s+/)[0] ?? "").toLowerCase();
  const landingSha = createHash("sha256").update(runtimeChunks.landing, "utf8").digest("hex");
  if (!/^[0-9a-f]{64}$/.test(pin)) fail("src/landing/runtime/landing.sha256 holds no sha256");
  else if (landingSha !== pin) fail(`runtime landing changed: sha256 ${landingSha} ≠ the pin ${pin} (frozen chunk: re-measure and re-record through the maintainer)`);
  console.log(`runtime budgets: ${Object.entries(sizes).map(([k, v]) => `${k} ${v}/${budgetOf(k)}`).join(" · ")} · landing sha256 ${landingSha.slice(0, 12)}`);

  // inlined CSS (DES-R5, DS24, DES-§19): the maxima over the live landing documents, each against its own key
  const cssBudget = { base: budgetOf("css-base"), variants: budgetOf("css-variants"), page: budgetOf("css") };
  const cssKey = { base: "css-base", variants: "css-variants", page: "css" } as const;
  for (const line of ["base", "variants", "page"] as const) {
    const budget = cssBudget[line];
    const { bytes, at } = cssMax[line];
    if (budget === undefined) fail(`budgets.json: no "${cssKey[line]}" budget`);
    else if (!at) fail(`css ${line}: no live landing document was measured`);
    else if (bytes > budget) fail(`css ${line} is ${bytes} B gzip on ${at} — over its ${budget} B budget ("${cssKey[line]}")`);
  }
  console.log(
    `css: base ${cssMax.base.bytes}/${cssBudget.base} · variants ${cssMax.variants.bytes}/${cssBudget.variants} · page ${cssMax.page.bytes}/${cssBudget.page} (${cssMax.page.at})`,
  );
  console.log(failures ? `${failures} FAILURE(S)` : "ALL OK");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
