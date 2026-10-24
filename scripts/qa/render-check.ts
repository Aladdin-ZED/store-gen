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
 *  - runtime size budgets (docs/OFFERS.md §F.9, src/landing/runtime/budgets.json): every chunk and the
 *    heaviest page (every optional chunk + landing, in one document) at most the recorded gzip + 5%.
 *
 *   npx tsx scripts/qa/render-check.ts        (exit code 1 on any failure)
 */
import { LEGAL_KINDS, storePageLinks } from "@/landing/context";
import { FIXTURE_NAMES, fixtureAssets, getFixture } from "@/lib/page/fixtures";
import { DIVIDERS } from "@/lib/page/schema";
import { validateDoc } from "@/lib/page/validate";
import { inlineHashes, renderLandingHtml, renderLegalHtml, renderThankYouHtml, styleAttrViolations } from "@/lib/render/core";
import { runtimeScripts } from "@/landing/document";
import { runtimeChunks, type RuntimeChunk } from "@/landing/generated/assets";
import type { LandingRuntimeConfig } from "@/landing/runtime/config";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
/** Same values as PUBLIC_ENDPOINTS in src/lib/render/store-context.server.ts (server-only, not importable here). */
const PUBLIC_ENDPOINTS = { order: "/api/public/order", lead: "/api/public/lead", event: "/api/public/event", upsell: "/api/public/upsell" };

const now = "2026-10-07T12:00:00.000Z";
const STORE_BASE = "/s/qa-store" as const;
let failures = 0;
const fail = (m: string) => {
  failures++;
  console.log("  FAIL " + m);
};

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
      const opts = {
        mode: "live" as const,
        assets: fixtureAssets("/"),
        pageKey: fx.pageKey,
        store: fx.store,
        urls: { landing: `${STORE_BASE}/${name}`, thankYou: `${STORE_BASE}/${name}/merci`, endpoints: PUBLIC_ENDPOINTS },
        links: storePageLinks(STORE_BASE, name),
        origin: "https://shop.example",
        now,
        upgradeInsecureRequests: true,
      };
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
        }
      }
    }
  }

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

  // runtime budgets: gzip -9 of each chunk, and of the heaviest page's scripts in one document
  const budgets = JSON.parse(readFileSync(join(__dirname, "..", "..", "src", "landing", "runtime", "budgets.json"), "utf8")) as Record<string, number>;
  const gz = (s: string) => gzipSync(Buffer.from(s, "utf8"), { level: 9 }).length;
  const sizes: Record<string, number> = {};
  for (const [name, js] of Object.entries(runtimeChunks)) sizes[name] = gz(js);
  const heaviest: RuntimeChunk[] = ["pixels", "turnstile", "units-matrix", "units-fields", "fill-steps-box", "landing"];
  sizes.page = gz(heaviest.map((n) => runtimeChunks[n]).join("\n"));
  for (const [name, size] of Object.entries(sizes)) {
    const budget = budgets[name];
    if (typeof budget !== "number") fail(`runtime ${name}: no budget in budgets.json`);
    else if (size > budget * 1.05) fail(`runtime ${name} is ${size} B gzip — over its ${budget} B budget + 5%`);
  }
  console.log(`runtime budgets: ${Object.entries(sizes).map(([k, v]) => `${k} ${v}/${budgets[k]}`).join(" · ")}`);
  console.log(failures ? `${failures} FAILURE(S)` : "ALL OK");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
