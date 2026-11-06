/**
 * `qa:design-corpus` (P6 DESIGN; design.md DES-§17.1, DES-§17.3, DES-§17.5 R1 subset, DES-§17.7, DG-09). Local only:
 * nothing here runs in CI, in a build or against a real store, and no customer data is read or written.
 *
 *   npm run qa:design-corpus                                   the corpus (30 fixtures × 10 runs), the 140-plan sweep and
 *                                                              the 41-page render set with the R1 visual rows
 *   npm run qa:design-corpus -- --fixtures 2 --runs 1 --set 2  a smoke run (2 fixtures × 1 run, 2 pages of the set)
 *   npm run qa:design-corpus -- --pairs 300                    the labelling page (qa/design-corpus/review/index.html)
 *   npm run qa:design-corpus -- --fit [--write]                fit the distance thresholds and the height scale from
 *                                                              labels.json and the measured folds (preFit untouched)
 *   npm run qa:design-corpus -- --capacity [--stores 200]      200 stores × the 3 crowded niches (DES-§17.7)
 *   flags: --no-sweep · --no-render · --no-shots · --port 3451 · --out qa/design-corpus/out
 *
 * The corpus (DES-§17.1): each fixture × run is one simulated store (its brand seed), locales ar 50 % / fr 35 % / en 15 %
 * by the fixture class, the three engine directions repaired (3 rounds) and gated, their novelty bands read against an
 * in-memory pool that grows by each run's chosen direction (the owner-choice model 55 / 30 / 15 %, QUAL-8). Fixtures:
 * the page fixtures in four photo / locale classes (studio fr, studio ar, `low-asset` ar: one compressed photo without
 * alpha, two photos en) plus two studio en, or the JSON files of qa/design-corpus/fixtures/ (git-ignored) when present.
 *
 * The render set (DES-§17.5 R1 subset): the 41 baseline documents and the chosen corpus pages are rendered with the
 * publish renderer and shot with Playwright (`channel: "msedge"`) from a static server on port 3451 or above (never
 * 3400 or 3450): segmented full-page shots ≤ 8,000 px at 390 and 1440 (DPR 1), the 390 fold at DPR 2, the `.lp-skip`
 * link never focused, fonts read from the `--lp-font-*` tokens. Rows per page: text clipping, horizontal overflow, the
 * fold measurement against the height model's estimate (C2), the fixed-layer sum (R7 ≤ 88 px), the sticky bar hidden
 * while a `[data-hero-cta]` is on screen, the RTL1 / RTL2 / RTL5 text regexes on `[dir=rtl]` pages, text overlap between
 * blocks, and per corpus run the SSIM of the three directions' 390 folds (> 0.92 fails). Output: qa/design-corpus/out/
 * (corpus.json, sweep.json, render.json, capacity.json, docs.ndjson, html/, shots/) and qa/saas-baseline/index.json
 * extended per page (genome, gates, slop, Q, heights, fold, ctas, reveals, photoUses, openers, hero family), the
 * 2026-10-24 file kept as index.baseline.json.
 */
import { createServer, type Server } from "node:http";
import type { BrowserContext, Page } from "playwright";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { storePageLinks } from "@/landing/context";
import { variantFeatures } from "@/lib/design/features";
import { packGenome } from "@/lib/design/genome";
import { CAPACITY_NICHES, ownerChoice, simulateNiche } from "@/lib/design/fixtures/capacity";
import { FIXTURE_NOW, fixtureInput, gateInputOf } from "@/lib/design/fixtures/prepublish";
import { distanceView, genomeDistance, packView, unpackView, type DistanceView } from "@/lib/design/distance";
import { genomeOf } from "@/lib/design/derive";
import { repairDoc } from "@/lib/design/gates";
import { estimateHeights } from "@/lib/design/heights";
import { bucketKey, emptyShard, mergeThresholds, nicheTau, sharesOf, shardOf, upsertRow, verdictOf, type PoolShard } from "@/lib/design/pool";
import { heroFamilyOf } from "@/lib/design/tokens-table";
import { generateDirections, type GenerateInput } from "@/lib/generator/directions";
import { hash32 } from "@/lib/generator/rng";
import { FIXTURE_NAMES, fixtureAssets, getFixture, type FixtureName } from "@/lib/page/fixtures";
import type { PageDoc } from "@/lib/page/schema";
import { validateDoc } from "@/lib/page/validate";
import { renderLandingHtml, renderThankYouHtml, type RenderHtmlOptions } from "@/lib/render/core";
import { mulberry32 } from "@/lib/theme/rng";
import calibration from "../../src/lib/design/calibration.json";
import { BASELINE, type BaselineEntry } from "./design-baseline";
import { kitMarkupProblems } from "./design-kit";
import { lookDocProblems } from "./design-primitives";

const ROOT = resolve(__dirname, "..", "..");
const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(`--${name}`);
const opt = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const OUT = resolve(ROOT, opt("out") ?? "qa/design-corpus/out");
const CORPUS = resolve(ROOT, "qa/design-corpus");
const PORT = Number(opt("port") ?? 3451);
if (!Number.isInteger(PORT) || PORT < 3451 || PORT > 65535) {
  console.error("design-corpus: the test server runs on port 3451 or above (never 3400 or 3450)");
  process.exit(1);
}

/* ------------------------------------------------------------------ */
/* fixtures                                                            */
/* ------------------------------------------------------------------ */

type PhotoClass = "studio" | "low-asset" | "two";
interface CorpusFixture {
  name: string;
  fixture: FixtureName;
  locale: "ar" | "fr" | "en";
  photos: PhotoClass;
  /** the niche override (a family the fixture's category does not name) */
  niche?: string;
}

/** The built-in corpus: the page fixtures × four classes, plus two studio en (30). */
function builtInFixtures(): CorpusFixture[] {
  const out: CorpusFixture[] = [];
  for (const f of FIXTURE_NAMES) {
    out.push({ name: `${f}-studio-fr`, fixture: f, locale: "fr", photos: "studio" });
    out.push({ name: `${f}-studio-ar`, fixture: f, locale: "ar", photos: "studio" });
    out.push({ name: `${f}-low-asset-ar`, fixture: f, locale: "ar", photos: "low-asset" });
    out.push({ name: `${f}-two-en`, fixture: f, locale: "en", photos: "two" });
  }
  out.push({ name: "argan-studio-en", fixture: "argan", locale: "en", photos: "studio" }, { name: "parfum-studio-en", fixture: "parfum", locale: "en", photos: "studio" });
  return out;
}

/** qa/design-corpus/fixtures/*.json when present (git-ignored; the same shape), else the built-in list. */
function loadFixtures(): CorpusFixture[] {
  const dir = join(CORPUS, "fixtures");
  if (existsSync(dir)) {
    const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
    const list = files.flatMap((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as CorpusFixture[]);
    if (list.length) return list.filter((x) => (FIXTURE_NAMES as readonly string[]).includes(x.fixture));
  }
  return builtInFixtures();
}

/** A store's wizard input for a corpus fixture: the fixture product with the class's photos. */
function inputOf(c: CorpusFixture, run: number): GenerateInput {
  const input = fixtureInput(c.fixture, c.locale, 100 + run, `corpus-${c.name}-${run}`);
  const keep = c.photos === "studio" ? 4 : c.photos === "two" ? 2 : 1;
  const product = input.product as { images: unknown[]; cutout?: unknown };
  const photos = (input.photos ?? []).slice(0, keep).map((p) => (c.photos === "low-asset" ? { ...p, alpha: false, width: Math.min(p.width, 1280) } : p));
  return { ...input, ...(c.niche ? { niche: c.niche } : {}), product: { ...product, images: product.images.slice(0, keep), cutout: c.photos === "low-asset" ? undefined : product.cutout }, photos };
}

/* ------------------------------------------------------------------ */
/* the corpus run (DES-§17.1)                                          */
/* ------------------------------------------------------------------ */

export interface DirectionRecord {
  i: number;
  archetype: string;
  grammar: number;
  strategy: number;
  hero: string | null;
  heroFamily: string | null;
  pairing: number;
  displayFamily: number;
  arDisplay: number;
  q: number;
  slop: number;
  hard: string[];
  soft: number;
  cliche: number;
  spec: number;
  dashes: number;
  composition: number;
  novelty: { platform: string; niche: string; clone: boolean };
  fold: { ok: boolean; family: string };
  total: number;
  inFlow: number;
  title: string;
  /** line of docs.ndjson */
  doc: number;
  vec: number[];
}

export interface RunRecord {
  fixture: string;
  base: string;
  locale: string;
  photos: PhotoClass;
  run: number;
  niche: string;
  chosen: number;
  pairwise: number[];
  dirs: DirectionRecord[];
}

const heroTitleOf = (doc: PageDoc) => {
  const hero = doc.sections.find((s) => s.type === "hero");
  const t = hero?.data.title ?? hero?.data.headline;
  return typeof t === "string" ? t : "";
};

function runCorpus(fixtures: readonly CorpusFixture[], runs: number): { runs: RunRecord[]; docs: PageDoc[] } {
  const th = mergeThresholds(calibration.thresholds);
  const shards: PoolShard[] = Array.from({ length: 8 }, emptyShard);
  const nicheStores = new Map<string, Set<string>>();
  const records: RunRecord[] = [];
  const docs: PageDoc[] = [];
  const rng = mulberry32(hash32("design-corpus"));
  for (let run = 0; run < runs; run++) {
    for (const c of fixtures) {
      const store = `corpus-${c.name}-${run}`;
      const input = inputOf(c, run);
      const product = (input.product ?? {}) as { category?: string };
      const niche = input.niche ?? `${input.market}:${product.category ?? "general"}`;
      const rows: { storeId: string; vec: Int16Array }[] = [];
      for (const s of shards) for (let i = 0; i < s.ids.length; i++) if (s.niches[i] === niche) rows.push({ storeId: s.stores[i]!, vec: s.vecs[i]! });
      let dirs;
      try {
        dirs = generateDirections({ ...input, shares: sharesOf(rows, () => 0) });
      } catch (e) {
        console.warn(`  ${store}: ${e instanceof Error ? e.message : String(e)}`);
        continue;
      }
      const tau = nicheTau(th, nicheStores.get(niche)?.size ?? 0);
      const views: DistanceView[] = [];
      const dirRecords = dirs.map((d, i): DirectionRecord => {
        const repaired = repairDoc(gateInputOf(d.doc)).doc;
        const report = repairDoc(gateInputOf(repaired), { rounds: 1 }).report;
        const genome = d.genome ?? genomeOf(repaired);
        const view = distanceView(genome, { theme: repaired.theme }, repaired.locale);
        views.push(view);
        const packed = Int16Array.from(packView(view));
        const v = verdictOf(view, packed, shards, { excludeStore: store, niche, bucket: bucketKey(niche, view), tauPlatform: th.platform, tauNiche: tau, clone: th.clone, margin: th.margin });
        docs.push(repaired);
        const hero = repaired.sections.find((s) => s.type === "hero");
        return {
          i,
          archetype: d.archetype,
          grammar: view.cat.grammar,
          strategy: view.cat.strategy,
          hero: hero ? `${hero.variant}` : null,
          heroFamily: heroFamilyOf(view.hero),
          pairing: view.cat.pairing,
          displayFamily: view.cat.displayFamily,
          arDisplay: view.cat.arDisplay,
          q: report.q,
          slop: report.slop.score,
          hard: report.hard.map((x) => x.id),
          soft: report.soft.length,
          cliche: report.copy.cliche,
          spec: report.copy.spec,
          dashes: report.copy.dashes,
          composition: report.composition.score,
          novelty: { platform: v.platform, niche: v.niche, clone: v.clone },
          fold: { ok: report.heights.fold.ok, family: report.heights.fold.family },
          total: report.heights.total,
          inFlow: report.heights.inFlow,
          title: heroTitleOf(repaired),
          doc: docs.length - 1,
          vec: packView(view),
        };
      });
      if (!dirRecords.length) continue;
      const chosen = Math.min(dirRecords.length - 1, ownerChoice(rng()));
      const id = `${store}:${chosen}`;
      upsertRow(shards[shardOf(id, shards.length)]!, { id, storeId: store, kind: "page", niche, bucket: bucketKey(niche, views[chosen]!), fpa: records.length, vec: dirRecords[chosen]!.vec });
      nicheStores.set(niche, (nicheStores.get(niche) ?? new Set()).add(store));
      const pairwise: number[] = [];
      for (let a = 0; a < views.length; a++) for (let b = a + 1; b < views.length; b++) pairwise.push(genomeDistance(views[a]!, views[b]!));
      records.push({ fixture: c.name, base: c.fixture, locale: c.locale, photos: c.photos, run, niche, chosen, pairwise, dirs: dirRecords });
      process.stdout.write(`\r  corpus ${records.length} / ${fixtures.length * runs}`);
    }
  }
  process.stdout.write("\n");
  return { runs: records, docs };
}

/* ------------------------------------------------------------------ */
/* the 140-plan baseline sweep (design-baseline §5.10)                 */
/* ------------------------------------------------------------------ */

const SWEEP_FIXTURES = ["argan", "massage", "blender", "parfum", "duo", "tshirt", "colors"] as const satisfies readonly FixtureName[];

export interface SweepRecord {
  fixture: string;
  locale: string;
  seed: number;
  seq: number[];
  hero: string | null;
  grammar: number;
  pairing: number;
  displayFamily: number;
  arDisplay: number;
  strategy: number;
  archetype: string;
  firstScreen: string;
}

function runSweep(seeds: number): SweepRecord[] {
  const out: SweepRecord[] = [];
  for (const f of SWEEP_FIXTURES)
    for (const locale of ["ar", "fr"] as const)
      for (let seed = 1; seed <= seeds; seed++) {
        const d = generateDirections(fixtureInput(f, locale, seed, `sweep-${f}-${seed}`))[0];
        if (!d) continue;
        const view = distanceView(d.genome ?? genomeOf(d.doc), { theme: d.doc.theme }, locale);
        const hero = d.doc.sections.find((s) => s.type === "hero");
        out.push({
          fixture: f,
          locale,
          seed,
          seq: view.seq,
          hero: hero?.variant ?? null,
          grammar: view.cat.grammar,
          pairing: view.cat.pairing,
          displayFamily: view.cat.displayFamily,
          arDisplay: view.cat.arDisplay,
          strategy: view.cat.strategy,
          archetype: d.archetype,
          firstScreen: `${hero?.variant ?? "-"}|${view.cat.displayFamily}|${view.cat.strategy}`,
        });
      }
  return out;
}

/* ------------------------------------------------------------------ */
/* the render set and the R1 visual rows (DES-§17.5)                   */
/* ------------------------------------------------------------------ */

interface RenderPage {
  name: string;
  html: string;
  doc: PageDoc;
  locale: string;
  /** the corpus run whose three folds are compared (SSIM) */
  group?: string;
  baseline?: BaselineEntry;
}

export interface VisualRow {
  name: string;
  group?: string;
  shots: string[];
  fold390: string | null;
  clipping: string[];
  overflow: { w390: number; w1440: number };
  fold: { measured: Record<string, number | null>; estimated: Record<string, number>; ok: boolean };
  fixedPx: number;
  sticky: { hiddenAtHero: boolean | null; shownAfter: boolean | null };
  rtl: string[];
  overlap: number;
  heights: { mobile: number; desktop: number; estimated: number };
}

const STORE_BASE = "/s/qa-store" as const;
function renderOptions(name: string, fx: { pageKey: string; store: RenderHtmlOptions["store"] }): RenderHtmlOptions {
  return {
    mode: "live",
    assets: fixtureAssets("/"),
    pageKey: fx.pageKey,
    store: fx.store,
    urls: { landing: `${STORE_BASE}/${name}`, thankYou: `${STORE_BASE}/${name}/merci`, endpoints: { order: "/api/public/order" } },
    links: storePageLinks(STORE_BASE, name, `https://platform.example/report/qa-store?p=${encodeURIComponent(`${STORE_BASE}/${name}`)}`),
    origin: "https://shop.example",
    now: FIXTURE_NOW,
    upgradeInsecureRequests: false,
  };
}

async function renderSet(entries: readonly BaselineEntry[], corpus: { runs: RunRecord[]; docs: PageDoc[] }): Promise<RenderPage[]> {
  const out: RenderPage[] = [];
  for (const e of entries) {
    const fx = getFixture(e.fixture, { now: FIXTURE_NOW, locale: e.locale, archetype: e.arch, seed: e.seed });
    const { doc } = validateDoc(fx.doc);
    if (!doc) continue;
    const r = e.page === "landing" ? await renderLandingHtml(doc, renderOptions(e.fixture, fx)) : await renderThankYouHtml(doc, renderOptions(e.fixture, fx));
    out.push({ name: `set-${e.name}`, html: r.html, doc, locale: e.locale, baseline: e });
  }
  for (const run of corpus.runs) {
    const fx = getFixture(run.base as FixtureName, { now: FIXTURE_NOW, locale: run.locale as "ar" | "fr" | "en" });
    for (const d of run.dirs) {
      const doc = corpus.docs[d.doc]!;
      const r = await renderLandingHtml(doc, renderOptions(run.base, fx));
      out.push({ name: `run-${run.fixture}-${run.run}-d${d.i}`, html: r.html, doc, locale: run.locale, group: `${run.fixture}-${run.run}` });
    }
  }
  return out;
}

const TYPES: Record<string, string> = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".avif": "image/avif", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".json": "application/json" };

/** The static test server: /__corpus/* from the output folder, everything else from public/ (port ≥ 3451). */
function serve(htmlDir: string, port: number): Promise<Server> {
  const pub = resolve(ROOT, "public");
  const server = createServer((req, res) => {
    try {
      const url = decodeURIComponent((req.url ?? "/").split("?")[0]!);
      const file = url.startsWith("/__corpus/") ? resolve(htmlDir, url.slice("/__corpus/".length)) : resolve(pub, `.${url}`);
      const inside = file.startsWith(htmlDir) || file.startsWith(pub);
      if (!inside || !existsSync(file) || !statSync(file).isFile()) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { "content-type": TYPES[extname(file).toLowerCase()] ?? "application/octet-stream" });
      res.end(readFileSync(file));
    } catch {
      res.writeHead(500).end();
    }
  });
  return new Promise((ok, fail) => {
    server.once("error", fail);
    server.listen(port, "127.0.0.1", () => ok(server));
  });
}

const QA_CSS =
  "html.lp-qa *,html.lp-qa *::before,html.lp-qa *::after{transition-duration:0s!important;transition-delay:0s!important;animation-duration:0s!important;animation-delay:0s!important;animation-iteration-count:1!important;scroll-behavior:auto!important;caret-color:transparent!important}";

/** Only the local test server answers: every other request (the store's absolute links, wa.me) is aborted at once. */
async function offline(ctx: BrowserContext) {
  ctx.setDefaultTimeout(30_000);
  await ctx.route(/^(?!http:\/\/127\.0\.0\.1:)/, (route) => route.abort());
}

/** Images decoded and fonts ready, at most 8 s (a broken asset never stalls the run). */
async function settle(page: Page) {
  await page.evaluate(() =>
    Promise.race([
      (async () => {
        for (const img of document.images) img.loading = "eager";
        await Promise.all([...document.images].map((img) => img.decode().catch(() => null)));
        await document.fonts.ready;
        (document.activeElement as HTMLElement | null)?.blur?.();
      })(),
      new Promise((ok) => setTimeout(ok, 8_000)),
    ]),
  );
}

/** tsx keeps function names with an `__name` helper the page does not have: functions sent to the page need it. */
const NAME_SHIM = "globalThis.__name = globalThis.__name || ((f) => f);";

/** The QA end state (reveals shown, motion off), like the baseline's harness; the skip link is never focused. */
function qaInit(css: string) {
  let ready = false;
  const setup = () => {
    const root = document.documentElement;
    if (ready || !root) return;
    ready = true;
    root.classList.add("lp-qa");
    const s = document.createElement("style");
    s.textContent = css;
    root.appendChild(s);
  };
  const mark = (node: Node) => {
    if (node.nodeType !== 1) return;
    const el = node as Element;
    if (el.hasAttribute("data-reveal")) el.setAttribute("data-in", "");
    for (const x of el.querySelectorAll("[data-reveal]")) x.setAttribute("data-in", "");
  };
  new MutationObserver((records) => {
    setup();
    for (const r of records) r.addedNodes.forEach(mark);
  }).observe(document, { childList: true, subtree: true });
  setup();
}

/** The page-side measurements of one viewport (runs in the browser). */
function measure(): { clipping: string[]; overflow: number; fold: Record<string, number | null>; overlap: number; scroll: number } {
  const label = (el: Element) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : ""}`;
  const clipping: string[] = [];
  const texts: { el: Element; r: DOMRect; block: Element | null }[] = [];
  for (const el of document.querySelectorAll("body *")) {
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? "").trim().length > 1);
    if (!own) continue;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || el.closest("[aria-hidden=true]")) continue;
    const r = el.getBoundingClientRect();
    // visually hidden text (1 px boxes, clip-path) is the screen reader's, not a clip
    if (r.width <= 2 || r.height <= 2 || el.matches(".lp-visually-hidden, .sr-only, [class*=visually-hidden]")) continue;
    texts.push({ el, r, block: el.closest("[data-section]") });
    // only hidden / clip overflow clips (auto / scroll containers and marquee tracks scroll by design)
    const clips = [cs.overflowX, cs.overflowY].some((o) => o === "hidden" || o === "clip") && !el.closest("[data-section=marquee]");
    if (clips && cs.textOverflow !== "ellipsis" && !/\d/.test(cs.webkitLineClamp ?? "") && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)) clipping.push(label(el));
  }
  let overlap = 0;
  const sample = texts.slice(0, 600);
  for (let i = 0; i < sample.length; i++)
    for (let j = i + 1; j < sample.length; j++) {
      const a = sample[i]!;
      const b = sample[j]!;
      if (a.block === b.block || a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
      const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
      if (w > 0 && h > 0 && w * h > 4) overlap++;
    }
  const hero = document.querySelector('[data-section="hero"]');
  // the fold items' tops, as the height model's FoldReport estimates them
  const top = (sel: string) => {
    const el = hero?.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return Math.round(r.top + window.scrollY);
  };
  const cod = [...(hero?.querySelectorAll("*") ?? [])].find((el) => /(الدفع عند الاستلام|paiement à la livraison|cash on delivery|à la réception|عند الاستلام)/i.test(el.textContent ?? "") && el.children.length === 0);
  return {
    clipping: clipping.slice(0, 8),
    overflow: (document.scrollingElement?.scrollWidth ?? 0) - window.innerWidth,
    fold: { image: top("img"), price: top(".lp-hero__price, [data-price]"), cta: top("[data-hero-cta]"), cod: cod ? Math.round(cod.getBoundingClientRect().top + window.scrollY) : null },
    overlap,
    scroll: document.documentElement.scrollHeight,
  };
}

/** Fixed layers on screen and the sticky bar's state at a scroll position (runs in the browser). */
function fixedState(): { fixedPx: number; sticky: boolean | null; heroCtaOnScreen: boolean } {
  let fixedPx = 0;
  for (const el of document.querySelectorAll("body *")) {
    const cs = getComputedStyle(el);
    if (cs.position !== "fixed" || cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) continue;
    const r = el.getBoundingClientRect();
    if (r.height > 0 && r.bottom > 0 && r.top < window.innerHeight && r.height < window.innerHeight / 2) fixedPx += r.height;
  }
  const bar = document.querySelector("[data-sticky-cta]");
  let sticky: boolean | null = null;
  if (bar) {
    const cs = getComputedStyle(bar);
    const r = bar.getBoundingClientRect();
    sticky = cs.display !== "none" && cs.visibility !== "hidden" && Number(cs.opacity) > 0.05 && r.top < window.innerHeight && r.bottom > 0 && !bar.hasAttribute("hidden") && bar.getAttribute("aria-hidden") !== "true";
  }
  const cta = document.querySelector("[data-hero-cta]");
  const cr = cta?.getBoundingClientRect();
  return { fixedPx: Math.round(fixedPx), sticky, heroCtaOnScreen: !!cr && cr.bottom > 0 && cr.top < window.innerHeight };
}

/** Mean SSIM of two grayscale images of the same size (8 × 8 windows). */
function ssim(a: Uint8Array, b: Uint8Array, w: number, h: number): number {
  const C1 = (0.01 * 255) ** 2;
  const C2 = (0.03 * 255) ** 2;
  let sum = 0;
  let n = 0;
  for (let y = 0; y + 8 <= h; y += 8)
    for (let x = 0; x + 8 <= w; x += 8) {
      let ma = 0;
      let mb = 0;
      for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
        ma += a[(y + j) * w + x + i]!;
        mb += b[(y + j) * w + x + i]!;
      }
      ma /= 64;
      mb /= 64;
      let va = 0;
      let vb = 0;
      let cov = 0;
      for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
        const da = a[(y + j) * w + x + i]! - ma;
        const db = b[(y + j) * w + x + i]! - mb;
        va += da * da;
        vb += db * db;
        cov += da * db;
      }
      va /= 63;
      vb /= 63;
      cov /= 63;
      sum += ((2 * ma * mb + C1) * (2 * cov + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2));
      n++;
    }
  return n ? sum / n : 1;
}

async function shoot(pages: readonly RenderPage[], opts: { shots: boolean }): Promise<{ rows: VisualRow[]; ssim: { group: string; max: number; pairs: number[] }[] }> {
  const htmlDir = join(OUT, "html");
  const shotDir = join(OUT, "shots");
  mkdirSync(htmlDir, { recursive: true });
  mkdirSync(shotDir, { recursive: true });
  for (const p of pages) writeFileSync(join(htmlDir, `${p.name}.html`), p.html);
  const server = await serve(htmlDir, PORT);
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ channel: "msedge", args: ["--font-render-hinting=none"] });
  const rows: VisualRow[] = [];
  try {
    for (const p of pages) {
      const t0 = performance.now();
      const row: VisualRow = { name: p.name, ...(p.group ? { group: p.group } : {}), shots: [], fold390: null, clipping: [], overflow: { w390: 0, w1440: 0 }, fold: { measured: {}, estimated: {}, ok: true }, fixedPx: 0, sticky: { hiddenAtHero: null, shownAfter: null }, rtl: [], overlap: 0, heights: { mobile: 0, desktop: 0, estimated: 0 } };
      const est = estimateHeights(p.doc, { look: p.doc.theme.look ?? null, locale: p.doc.locale, features: variantFeatures });
      row.fold.estimated = est.fold.items as Record<string, number>;
      row.heights.estimated = est.total;
      if (p.locale === "ar") row.rtl = [...lookDocProblems(p.html, "ar"), ...kitMarkupProblems(p.html, "ar")].filter((x) => /RTL[125]\b/.test(x));
      for (const vp of [
        { tag: "390", width: 390, height: 844 },
        { tag: "1440", width: 1440, height: 900 },
      ]) {
        const mobile = vp.width < 800;
        const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile, reducedMotion: "no-preference" });
        await offline(ctx);
        const page = await ctx.newPage();
        await page.addInitScript(NAME_SHIM);
        await page.addInitScript(qaInit, QA_CSS);
        await page.goto(`http://127.0.0.1:${PORT}/__corpus/${p.name}.html`, { waitUntil: "load" });
        await settle(page);
        const m = await page.evaluate(measure);
        if (mobile) {
          row.clipping = m.clipping;
          row.overflow.w390 = m.overflow;
          row.overlap = m.overlap;
          row.heights.mobile = m.scroll;
          row.fold.measured = m.fold;
          row.fold.ok = Object.values(m.fold).every((v) => v === null || v <= 844);
          // the sticky bar while the hero CTA is on screen (V27's behavioural half), then past it
          await page.evaluate(() => document.querySelector("[data-hero-cta]")?.scrollIntoView({ block: "center" }));
          await page.waitForTimeout(250);
          const atHero = await page.evaluate(fixedState);
          row.sticky.hiddenAtHero = atHero.heroCtaOnScreen ? atHero.sticky !== true : null;
          await page.evaluate(() => {
            const cta = document.querySelector("[data-hero-cta]");
            const below = cta ? cta.getBoundingClientRect().bottom + window.scrollY + window.innerHeight : 1600;
            window.scrollTo(0, Math.min(document.documentElement.scrollHeight, below));
          });
          await page.waitForTimeout(250);
          const after = await page.evaluate(fixedState);
          row.fixedPx = after.fixedPx;
          row.sticky.shownAfter = after.heroCtaOnScreen ? null : after.sticky;
          await page.evaluate(() => window.scrollTo(0, 0));
          if (opts.shots) {
            const foldCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
            await offline(foldCtx);
            const fp = await foldCtx.newPage();
            await fp.addInitScript(NAME_SHIM);
            await fp.addInitScript(qaInit, QA_CSS);
            await fp.goto(`http://127.0.0.1:${PORT}/__corpus/${p.name}.html`, { waitUntil: "load" });
            await settle(fp);
            row.fold390 = join(shotDir, `${p.name}-390-fold.png`);
            await fp.screenshot({ path: row.fold390, animations: "disabled" });
            await foldCtx.close();
          }
        } else {
          row.overflow.w1440 = m.overflow;
          row.heights.desktop = m.scroll;
        }
        if (opts.shots) {
          // segmented full-page shots, ≤ 8,000 px each (the baseline's single huge shot is a harness defect)
          for (let y = 0, k = 0; y < m.scroll; y += 8000, k++) {
            const path = join(shotDir, `${p.name}-${vp.tag}-${k}.png`);
            await page.screenshot({ path, fullPage: true, clip: { x: 0, y, width: vp.width, height: Math.min(8000, m.scroll - y) }, animations: "disabled" });
            row.shots.push(path);
          }
        }
        await ctx.close();
      }
      rows.push(row);
      console.log(`  rendered ${rows.length} / ${pages.length} ${p.name} (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
    }
  } finally {
    process.stdout.write("\n");
    await browser.close();
    server.close();
  }
  // SSIM of the three directions' 390 folds per corpus run (grayscale, 128 × 277)
  const groups = new Map<string, string[]>();
  for (const r of rows) if (r.group && r.fold390) groups.set(r.group, [...(groups.get(r.group) ?? []), r.fold390]);
  const out: { group: string; max: number; pairs: number[] }[] = [];
  if (groups.size) {
    const sharp = (await import("sharp")).default;
    const gray = async (f: string) => new Uint8Array(await sharp(f).grayscale().resize(128, 277, { fit: "fill" }).raw().toBuffer());
    for (const [group, files] of groups) {
      const imgs = await Promise.all(files.map(gray));
      const pairs: number[] = [];
      for (let a = 0; a < imgs.length; a++) for (let b = a + 1; b < imgs.length; b++) pairs.push(ssim(imgs[a]!, imgs[b]!, 128, 277));
      out.push({ group, max: Math.max(0, ...pairs), pairs });
    }
  }
  return { rows, ssim: out };
}

/** The extended baseline index (DES-§17.1): the 2026-10-24 file kept as index.baseline.json. */
function writeIndex(pages: readonly RenderPage[], rows: readonly VisualRow[]): void {
  const dir = resolve(ROOT, "qa/saas-baseline");
  mkdirSync(dir, { recursive: true });
  const index = join(dir, "index.json");
  const kept = join(dir, "index.baseline.json");
  const main = resolve(ROOT, "..", "..", "store-gen", "qa", "saas-baseline", "index.json");
  if (!existsSync(kept)) {
    if (existsSync(index)) copyFileSync(index, kept);
    else if (existsSync(main)) copyFileSync(main, kept);
  }
  const byName = new Map(rows.map((r) => [r.name, r]));
  const out = {
    generatedAt: new Date().toISOString(),
    renderer: "scripts/qa/design-corpus.ts (publish renderer, QA end state)",
    browser: "playwright chromium channel msedge",
    viewports: { mobile: "390x844, segments ≤ 8,000 px + 390 fold @2x", desktop: "1440x900, segments ≤ 8,000 px" },
    pages: pages.map((p) => {
      const input = gateInputOf(p.doc);
      const report = repairDoc(input, { rounds: 1 }).report;
      const r = byName.get(p.name);
      const genome = input.genome;
      return {
        name: p.name,
        ...(p.baseline ? { fixture: p.baseline.fixture, archetype: p.baseline.arch ?? null, seed: p.baseline.seed ?? null, page: p.baseline.page } : {}),
        locale: p.locale,
        genome: packGenome(genome),
        gates: [...report.hard, ...report.soft].map((x) => ({ id: x.id, level: x.level, pass: false, value: x.vars ?? null, threshold: null })),
        slop: report.slop.score,
        Q: report.q,
        heights: { estimated: report.heights.total, measured: r?.heights ?? null },
        fold: { estimated: report.heights.fold, measured: r?.fold.measured ?? null },
        ctas: genome.page.G34.primary.length,
        reveals: genome.page.G35,
        photoUses: Object.values(genome.page.G33.uses).reduce((s, u) => s + u.length, 0),
        openers: genome.page.G32.openers,
        hero: { family: heroFamilyOf(distanceView(genome, { theme: p.doc.theme }, p.doc.locale).hero) },
        shots: r?.shots ?? [],
      };
    }),
  };
  writeFileSync(index, JSON.stringify(out, null, 1));
}

/* ------------------------------------------------------------------ */
/* --pairs, --fit                                                      */
/* ------------------------------------------------------------------ */

function readCorpus(): { runs: RunRecord[]; docs: PageDoc[] } {
  const runs = JSON.parse(readFileSync(join(OUT, "corpus.json"), "utf8")) as RunRecord[];
  const docs = readFileSync(join(OUT, "docs.ndjson"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as PageDoc);
  return { runs, docs };
}

/** DES-§17.3 step 1: N pairs stratified by d (a third below 0.2, a third in 0.2-0.45, a third above), rendered folds. */
async function pairs(n: number): Promise<void> {
  const corpus = readCorpus();
  const dirs = corpus.runs.flatMap((r) => r.dirs.map((d) => ({ run: r, d })));
  const rng = mulberry32(hash32("pairs"));
  const bands: { a: number; b: number; d: number }[][] = [[], [], []];
  for (let k = 0; k < n * 40 && bands.some((x) => x.length < Math.ceil(n / 3)); k++) {
    const a = Math.floor(rng() * dirs.length);
    const b = Math.floor(rng() * dirs.length);
    if (a === b) continue;
    const d = genomeDistance(unpackView(dirs[a]!.d.vec), unpackView(dirs[b]!.d.vec));
    const band = d < 0.2 ? 0 : d < 0.45 ? 1 : 2;
    if (bands[band]!.length < Math.ceil(n / 3)) bands[band]!.push({ a, b, d });
  }
  const chosen = bands.flat().slice(0, n);
  const used = [...new Set(chosen.flatMap((p) => [p.a, p.b]))];
  const pages: RenderPage[] = [];
  for (const i of used) {
    const { run, d } = dirs[i]!;
    const fx = getFixture(run.base as FixtureName, { now: FIXTURE_NOW, locale: run.locale as "ar" | "fr" | "en" });
    const doc = corpus.docs[d.doc]!;
    pages.push({ name: `pair-${i}`, html: (await renderLandingHtml(doc, renderOptions(run.base, fx))).html, doc, locale: run.locale });
  }
  const { rows } = await shoot(pages, { shots: true });
  const fold = new Map(rows.map((r) => [r.name, r]));
  const review = join(CORPUS, "review");
  mkdirSync(review, { recursive: true });
  const rel = (f: string | null | undefined) => (f ? `../out/shots/${f.split(/[\\/]/).pop()}` : "");
  const items = chosen.map((p, k) => ({ k, a: `pair-${p.a}`, b: `pair-${p.b}`, aFold: rel(fold.get(`pair-${p.a}`)?.fold390), bFold: rel(fold.get(`pair-${p.b}`)?.fold390), aDesk: rel(fold.get(`pair-${p.a}`)?.shots.find((s) => /-1440-0\.png$/.test(s))), bDesk: rel(fold.get(`pair-${p.b}`)?.shots.find((s) => /-1440-0\.png$/.test(s))), d: Math.round(p.d * 1000) / 1000, sameStore: dirs[p.a]!.run === dirs[p.b]!.run }));
  writeFileSync(join(review, "pairs.json"), JSON.stringify(items, null, 1));
  writeFileSync(join(review, "index.html"), REVIEW_HTML.replace("__ITEMS__", JSON.stringify(items)));
  console.log(`  ${items.length} pairs → ${join(review, "index.html")} (keys 1 near-identical · 2 related · 3 different; Export writes labels.json)`);
}

const REVIEW_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pair labels</title>
<style>:root{color-scheme:light dark;--bg:#fbfbfa;--fg:#17181a;--muted:#6b6f76;--line:#e4e5e7;--acc:#2f5bd8}@media (prefers-color-scheme:dark){:root{--bg:#111214;--fg:#ececee;--muted:#9a9ea6;--line:#2a2c30;--acc:#7c9cff}}
*{box-sizing:border-box}body{margin:0;font:14px/1.5 system-ui,sans-serif;background:var(--bg);color:var(--fg)}header{position:sticky;top:0;display:flex;gap:16px;align-items:center;padding:12px 16px;border-bottom:1px solid var(--line);background:var(--bg)}
main{display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:16px}figure{margin:0;border:1px solid var(--line);border-radius:8px;overflow:hidden}img{display:block;width:100%;height:auto}
.desk{grid-column:span 1}button{font:inherit;padding:6px 12px;border:1px solid var(--line);border-radius:6px;background:transparent;color:inherit;cursor:pointer}button.on{border-color:var(--acc);color:var(--acc)}.muted{color:var(--muted)}</style></head>
<body><header><strong>Pair <span id="k"></span></strong><span class="muted" id="n"></span><button data-l="near-identical">1 near-identical</button><button data-l="related">2 related</button><button data-l="different">3 different</button><span style="flex:1"></span><button id="prev">←</button><button id="next">→</button><button id="export">Export labels.json</button></header>
<main><figure><img id="a"></figure><figure><img id="b"></figure><figure class="desk"><img id="ad"></figure><figure class="desk"><img id="bd"></figure></main>
<script>const items=__ITEMS__;let i=0;const key="design-pair-labels";let labels={};try{labels=JSON.parse(localStorage.getItem(key)||"{}")}catch{}
function show(){const it=items[i];document.getElementById("k").textContent=(i+1)+" / "+items.length;document.getElementById("n").textContent=labels[it.k]||"unlabelled";for(const [id,src] of [["a",it.aFold],["b",it.bFold],["ad",it.aDesk],["bd",it.bDesk]])document.getElementById(id).src=src;for(const b of document.querySelectorAll("[data-l]"))b.classList.toggle("on",labels[it.k]===b.dataset.l)}
function label(l){labels[items[i].k]=l;try{localStorage.setItem(key,JSON.stringify(labels))}catch{}if(i<items.length-1)i++;show()}
for(const b of document.querySelectorAll("[data-l]"))b.onclick=()=>label(b.dataset.l);document.getElementById("prev").onclick=()=>{i=Math.max(0,i-1);show()};document.getElementById("next").onclick=()=>{i=Math.min(items.length-1,i+1);show()};
addEventListener("keydown",(e)=>{if(e.key==="1")label("near-identical");if(e.key==="2")label("related");if(e.key==="3")label("different");if(e.key==="ArrowRight")document.getElementById("next").click();if(e.key==="ArrowLeft")document.getElementById("prev").click()});
document.getElementById("export").onclick=()=>{const out=items.filter((it)=>labels[it.k]).map((it)=>({a:it.a,b:it.b,d:it.d,sameStore:it.sameStore,label:labels[it.k]}));const url=URL.createObjectURL(new Blob([JSON.stringify(out,null,1)],{type:"application/json"}));const a=document.createElement("a");a.href=url;a.download="labels.json";a.click()};show()</script></body></html>`;

const pct = (xs: number[], p: number) => {
  if (!xs.length) return null;
  const s = xs.slice().sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))]!;
};

/** DES-§17.3 step 3: the distance thresholds and the height scale only (preFit and approved are never touched). */
function fit(write: boolean): void {
  const file = join(CORPUS, "labels.json");
  if (!existsSync(file)) {
    console.error(`  no ${file}: run --pairs 300 and export the labels first`);
    process.exitCode = 1;
    return;
  }
  const labels = JSON.parse(readFileSync(file, "utf8")) as { d: number; label: string; sameStore?: boolean }[];
  const near = labels.filter((l) => l.label === "near-identical").map((l) => l.d);
  const related = labels.filter((l) => l.label === "related").map((l) => l.d);
  const relatedSame = labels.filter((l) => l.label === "related" && l.sameStore).map((l) => l.d);
  const cur = calibration.thresholds;
  const r3 = (x: number) => Math.round(x * 1000) / 1000;
  const next = {
    clone: r3(Math.max(0.12, (pct(near, 95) ?? 0.14) - 0.02)),
    platform: r3(Math.max(0.25, (pct(near, 95) ?? 0.2) + 0.05)),
    nicheBase: r3(Math.max(0.4, pct(related, 75) ?? 0.4)),
    ownPage: r3(Math.max(0.3, pct(related, 50) ?? 0.3)),
    brandRadius: r3(Math.min(0.35, pct(relatedSame, 90) ?? 0.35)),
  };
  // the height scale: measured / estimated mobile height over the rendered set (render.json)
  let heightScale = calibration.heightScale;
  const renderFile = join(OUT, "render.json");
  if (existsSync(renderFile)) {
    const rows = (JSON.parse(readFileSync(renderFile, "utf8")) as { rows: VisualRow[] }).rows.filter((r) => r.heights.mobile > 0 && r.heights.estimated > 0);
    const ratio = pct(rows.map((r) => r.heights.mobile / r.heights.estimated), 50);
    if (ratio) heightScale = r3(ratio);
  }
  console.log(`  labels ${labels.length} (near-identical ${near.length}, related ${related.length})`);
  for (const k of Object.keys(next) as (keyof typeof next)[]) console.log(`  ${k.padEnd(12)} ${String(cur[k]).padEnd(6)} → ${next[k]}`);
  console.log(`  heightScale  ${String(calibration.heightScale).padEnd(6)} → ${heightScale}`);
  if (!write) {
    console.log("  (dry run: --write updates src/lib/design/calibration.json; preFit and approved are untouched)");
    return;
  }
  const path = resolve(ROOT, "src/lib/design/calibration.json");
  const json = JSON.parse(readFileSync(path, "utf8")) as typeof calibration;
  json.thresholds = { ...json.thresholds, ...next };
  json.heightScale = heightScale;
  json.counts = { ...(json.counts as Record<string, number>), labels: labels.length, nearIdentical: near.length, related: related.length } as never;
  json.date = new Date().toISOString().slice(0, 10);
  writeFileSync(path, JSON.stringify(json, null, 2) + "\n");
  console.log(`  wrote ${path}`);
}

/* ------------------------------------------------------------------ */
/* main                                                                */
/* ------------------------------------------------------------------ */

async function main() {
  mkdirSync(OUT, { recursive: true });
  const t0 = performance.now();
  if (flag("capacity")) {
    const stores = Number(opt("stores") ?? 200);
    const reports = CAPACITY_NICHES.map((c) => {
      const r = simulateNiche(c, { stores, onStore: (n) => process.stdout.write(`\r  ${c.niche} ${n} / ${stores}`) });
      process.stdout.write("\n");
      return r;
    });
    writeFileSync(join(OUT, "capacity.json"), JSON.stringify(reports, null, 1));
    for (const r of reports) {
      console.log(`  ${r.niche}: ${r.pass ? "pass" : `FAIL ${r.why.join("; ")}`}`);
      for (const p of r.checkpoints)
        console.log(`    n ${String(p.n).padStart(3)} τ ${p.tau.toFixed(3)} d̄ ${p.mean.toFixed(3)} σ ${p.sd.toFixed(3)} P(d<τ) ${(p.pUnder * 100).toFixed(1)} % fallback ${(p.fallbackShare * 100).toFixed(1)} % N1 ${(p.n1Share * 100).toFixed(1)} % top g/s/h ${(p.top.grammar * 100).toFixed(0)}/${(p.top.strategy * 100).toFixed(0)}/${(p.top.heroFamily * 100).toFixed(0)} % hero J ${p.heroJaccard.toFixed(2)}`);
    }
    if (reports.some((r) => !r.pass)) process.exitCode = 1;
  } else if (opt("pairs")) {
    await pairs(Number(opt("pairs")));
  } else if (flag("fit")) {
    fit(flag("write"));
  } else {
    const fixtures = loadFixtures().slice(0, Number(opt("fixtures") ?? 30));
    const runs = Number(opt("runs") ?? 10);
    console.log(`  corpus: ${fixtures.length} fixtures × ${runs} runs`);
    const corpus = runCorpus(fixtures, runs);
    writeFileSync(join(OUT, "corpus.json"), JSON.stringify(corpus.runs));
    writeFileSync(join(OUT, "docs.ndjson"), corpus.docs.map((d) => JSON.stringify(d)).join("\n") + "\n");
    if (!flag("no-sweep")) {
      const seeds = Number(opt("seeds") ?? 10);
      console.log(`  sweep: ${SWEEP_FIXTURES.length} fixtures × ar / fr × ${seeds} seeds`);
      writeFileSync(join(OUT, "sweep.json"), JSON.stringify(runSweep(seeds)));
    }
    if (!flag("no-render")) {
      const set = BASELINE.slice(0, Number(opt("set") ?? BASELINE.length));
      const pages = await renderSet(set, corpus);
      console.log(`  render: ${set.length} baseline pages + ${pages.length - set.length} corpus pages`);
      const { rows, ssim: groups } = await shoot(pages, { shots: !flag("no-shots") });
      writeFileSync(join(OUT, "render.json"), JSON.stringify({ rows, ssim: groups }, null, 1));
      writeIndex(pages, rows);
    }
  }
  console.log(`design-corpus: done in ${((performance.now() - t0) / 1000).toFixed(1)} s → ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
