/**
 * The baseline goldens of the section kit (P6 DESIGN; design.md DES-§23.1, DES-§25.1 `test:render` "golden HTML for
 * docs without look (allow-listed diffs only; the 41 baseline docs' published checksums unchanged)", DES-§4.5.4).
 *
 * The 41 baseline documents of docs/saas/research/design-baseline.md §1.1 (7 fixtures × ar / fr, the argan and tshirt
 * archetype sweeps, three argan seeds, two thank-you pages) were recorded on the tree before the section kit redraws
 * (`f9d105d`, step 3 of P6) into src/lib/design/calibration/baseline-golden.json:
 *  - per document: the published checksum (sha256 of the validated document's JSON, src/lib/db/boot-tasks.ts), the
 *    page shell (the markup outside the sections, inline stylesheet and section dividers removed), the dividers in
 *    order, and every section's outer markup, each as a 12-hex sha256 prefix;
 *  - the section stylesheet chunks (src/landing/generated/chunks.ts and the merged per-type sheets), one hash each;
 *  - the shared base stylesheet itself (gzip, base64), so a later run can list the rules that were added or removed.
 *
 * `compareBaseline()` re-renders the documents and reports every difference outside the reviewed allow-list below:
 * a checksum that moved (never allowed: every new section field is optional without a default, DES-§4.5.1), a section
 * whose markup changed while its variant is not a reviewed redraw, a chunk that changed outside the redraws, a shell
 * change other than the report row moving into the footer, and a base-stylesheet rule added without a look-only
 * scope (`[data-look]`, `[data-cta-plan]`, `[data-reveal-scope]`) or removed without a reviewed reason.
 *
 *   npx tsx scripts/qa/design-baseline.ts            compare all 41 (exit 1 on any finding)
 *   npx tsx scripts/qa/design-baseline.ts --record   re-record the goldens (only for a reviewed, intended change)
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { storePageLinks } from "@/landing/context";
import { baseCss, sectionCss } from "@/landing/generated/assets";
import { sectionChunkCss } from "@/landing/generated/chunks";
import { fixtureAssets, getFixture, type FixtureName } from "@/lib/page/fixtures";
import type { Archetype } from "@/lib/page/schema";
import { validateDoc } from "@/lib/page/validate";
import { renderLandingHtml, renderThankYouHtml, type RenderHtmlOptions } from "@/lib/render/core";

const GOLDEN = join(__dirname, "..", "..", "src", "lib", "design", "calibration", "baseline-golden.json");
const NOW = "2026-10-24T10:00:00.000Z";
const STORE_BASE = "/s/qa-store" as const;

export interface BaselineEntry {
  name: string;
  fixture: FixtureName;
  locale: "ar" | "fr";
  arch?: Archetype;
  seed?: number;
  page: "landing" | "merci";
}

const FIXTURES = ["argan", "massage", "blender", "parfum", "duo", "tshirt", "colors"] as const satisfies readonly FixtureName[];
const SWEEP = ["maison", "apothecary", "souk", "playground", "kinetic", "circuit", "hearth", "bloom", "field", "editorial", "garage"] as const satisfies readonly Archetype[];

/** The 41 baseline documents (design-baseline.md §1.1, `qa/saas-baseline/render-all.sh`). */
export const BASELINE: readonly BaselineEntry[] = [
  ...FIXTURES.flatMap((f) => (["ar", "fr"] as const).map((l): BaselineEntry => ({ name: `${f}-default-${l}`, fixture: f, locale: l, page: "landing" }))),
  ...SWEEP.flatMap((a): BaselineEntry[] => [
    { name: `argan-${a}-ar`, fixture: "argan", arch: a, locale: "ar", page: "landing" },
    { name: `tshirt-${a}-ar`, fixture: "tshirt", arch: a, locale: "ar", page: "landing" },
  ]),
  ...[7, 4242, 90210].map((s): BaselineEntry => ({ name: `argan-default-ar-s${s}`, fixture: "argan", locale: "ar", seed: s, page: "landing" })),
  { name: "argan-default-ar-merci", fixture: "argan", locale: "ar", page: "merci" },
  { name: "tshirt-default-fr-merci", fixture: "tshirt", locale: "fr", page: "merci" },
];

/** The 14 fixture defaults: the subset test:render compares on every run (the full 41 run in test:design --full). */
export const BASELINE_DEFAULTS: readonly BaselineEntry[] = BASELINE.filter((e) => e.page === "landing" && !e.arch && e.seed === undefined);

/**
 * The reviewed redraws (DES-§4.5.4, DES-§5.13 sheets H1-H4, H9, S5-S8; core D60 / V40; CRIT15): a section of one of
 * these variants may render different markup, and its stylesheet chunk may change. Each entry carries its reason.
 */
export const BASELINE_ALLOW: Readonly<Record<string, string>> = {
  "hero.stage": "H1: ghost word and callout chips off unless the section asks for them (DS56), stagePreset",
  "hero.editorial": "H2: cover lines unnumbered (S15), coverLines",
  "hero.poster": "H3: the turning badge removed (S17), the aurora mesh replaced by a flat slab (V40), priceBlock",
  "hero.spec": "H4: at most 3 callouts, glass only when the page allows it, no library figures",
  "hero.scrapbook": "H9: the collage redrawn as a quiet contact grid, tape and polaroid frames removed (§3.6)",
  "problem.chat": "S5: the chat block becomes a two-column ledger (S20)",
  "socialProof.whatsapp": "S6: plain quote cards without the phone mock (S21)",
  "socialProof.ugc": "V40: the aurora mesh behind the cards replaced by a flat slab",
  "socialProof.counter": "S7 / D2: blocked without merchant numbers",
  "stats.big-numbers": "S7 / DS42: merchant figures only (allowedNumbers), no library figures",
  "stats.rings": "S7 / DS42: merchant figures only (allowedNumbers), no library figures",
  "stats.ticker": "S7 / DS42: merchant figures only (allowedNumbers), no library figures",
  "guarantee.seal": "S8: a hairline card, no seal shape, no circular text (owner rule 2)",
  "cta.stamp": "S8: no stamp shape, no circular text; the primary button carries data-hero-cta (DES-§5.9)",
  "cta.banner": "V40: the aurora replaced by a flat slab; the primary button carries data-hero-cta (DES-§5.9)",
  "cta.poster": "V40: the aurora replaced by a flat slab; the primary button carries data-hero-cta (DES-§5.9)",
  "trustBar.stamps": "S8: redrawn as the chips row, no stamp shapes (owner rule 2)",
  "marquee.tape": "S8: the outline marquee with whole-item duplication, no tape, no rotation (I7)",
  "offer.tickets": "S8: showcase cards with one cut corner, no perforations",
  "whatsappFloat.tab": "RTL3: a horizontal pill in ar (never rotated Arabic), data.tabLabel",
  "footer.big": "S24 / RTL5: the wordmark sized by --sh-word and never clipped, addresses in LTR blocks; CRIT15 report link",
  "footer.simple": "RTL5: addresses and e-mails in LTR inline blocks; CRIT15 report link in the legal row",
  // P3 wave 1 merge (2026-11-06): the order form is P3's (LAN-§26.1); its LAN-§3.5 quality contract redraws every variant
  "orderForm.card": "P3 LAN-§3.5 OF1-OF7: two blocks (steps, checkout), labels above 52-56 px controls, one submit row with the live total and the COD line once, delivery slots (LAN-§7.4)",
  "orderForm.bold": "P3 LAN-§3.5 OF1-OF7: two blocks (steps, checkout), labels above 52-56 px controls, one submit row with the live total and the COD line once, delivery slots (LAN-§7.4)",
  "orderForm.split": "P3 LAN-§3.5 OF1-OF7: two blocks (steps, checkout), labels above 52-56 px controls, one submit row with the live total and the COD line once, delivery slots (LAN-§7.4)",
  "orderForm.minimal": "P3 LAN-§3.5 OF1-OF7: two blocks (steps, checkout), labels above 52-56 px controls, one submit row with the live total and the COD line once, delivery slots (LAN-§7.4)",
};

/**
 * Stylesheet chunks that changed with the same markup (each with its reason): the rendering on a document without look
 * is the same, the source no longer names a removed token.
 */
export const BASELINE_CHUNK_ALLOW: Readonly<Record<string, string>> = {
  "comparison.table": "V40: the column light falls back to the product tint directly (--lp-aurora-1 is no longer emitted)",
  "hero.split": "H5: the ratio and media-side rules, under data attributes only a section with `ratio` / `mediaSide` carries",
};

/**
 * Section kit II (step 5; DES-§4.5.4, sheets H6-H10, S1-S4): new variants, so new stylesheet chunks (and a new rule set
 * in their type's merged sheet). No baseline document renders them: the legacy archetype draw never picks them
 * (src/lib/generator/plan.ts `LOOK_ONLY`).
 */
export const BASELINE_NEW: Readonly<Record<string, string>> = {
  "hero.cinema": "H6: the photo edge to edge, the commerce band on the ground",
  "hero.quiet": "H7: a small object on a mat, one line of type",
  "hero.index": "H8: the merchant's facts as numbered rows",
  "hero.contact": "H9: the contact sheet with a logical title cell",
  "hero.statement": "H10: type first, the product as a framed thumbnail",
  "benefits.hanging": "S1: numbered rows with hanging thumbnails",
  "showcase.figure": "S2: one large image and its caption column",
  "gallery.contact": "S3: the contact-sheet gallery",
  "offer.showcase": "S4: the packs without picker or button",
};

/**
 * Sections a reviewed change may stop rendering (their placeholder is put back into the shell before it is hashed, so
 * the rest of the shell is still compared): a stats section shows merchant figures only and renders nothing with fewer
 * than two (DS42, sheet S7), and the fixtures' stats are library examples (`sample: true`).
 */
export const BASELINE_VANISH: Readonly<Record<string, string>> = {
  "stats.big-numbers": "DS42: library example figures never reach the page",
  "stats.rings": "DS42: library example figures never reach the page",
  "stats.ticker": "DS42: library example figures never reach the page",
};

/** Base-stylesheet rules removed by a reviewed change: the selector (or at-rule prelude) matches one of these. */
const BASE_REMOVED_OK: readonly (readonly [RegExp, string])[] = [
  [/aurora/, "V40: the aurora mesh leaves every generated page (core D60 rev 3)"],
  [/grain/, "V40: the page grain leaves every generated page (core D60 rev 3)"],
  [/lp-badge__ring|lp-ring|textPath|lp-sticker--ring|lp-badge--ring/, "S17 / RTL3: rotating-text rings removed"],
  [/tape|stamp|ticket|perfor|lp-seal/, "owner rule 2: tape, stamp, ticket and seal shapes removed"],
  [/lp-chat|bubble|lp-phone|phone-mock|lp-wa-mock/, "S20 / S21: chat and phone mocks removed"],
];
/** Base-stylesheet rules added or rewritten by a reviewed change that is not look-only (each with its reason). */
const BASE_ADDED_OK: readonly (readonly [RegExp, string])[] = [];
/** A rule added to the base stylesheet must be look-only (no selector change for documents without look, DS4). */
const LOOK_ONLY = /\[data-look|\[data-cta-plan|\[data-reveal-scope/;

const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex").slice(0, 12);

/** The live store-page options of a baseline document (the report link set, as every platform-served render has). */
function optionsFor(e: BaselineEntry, fx: ReturnType<typeof getFixture>): RenderHtmlOptions {
  return {
    mode: "live",
    assets: fixtureAssets("/"),
    pageKey: fx.pageKey,
    store: fx.store,
    urls: { landing: `${STORE_BASE}/${e.fixture}`, thankYou: `${STORE_BASE}/${e.fixture}/merci`, endpoints: { order: "/api/public/order" } },
    links: storePageLinks(STORE_BASE, e.fixture, `https://platform.example/report/qa-store?p=${encodeURIComponent(`${STORE_BASE}/${e.fixture}`)}`),
    origin: "https://shop.example",
    now: NOW,
    upgradeInsecureRequests: true,
  };
}

/** Section roots of the body (each carries data-sid), with their outer markup. */
export function sectionsOf(body: string): { sid: string; key: string; html: string }[] {
  const out: { sid: string; key: string; html: string }[] = [];
  const ROOT = /<([a-z]+)\b[^<>]*\sdata-sid="([^"]+)"[^<>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = ROOT.exec(body))) {
    const tag = m[1]!;
    const start = m.index;
    const open = new RegExp(`<${tag}\\b|</${tag}>`, "g");
    open.lastIndex = start + m[0].length;
    let depth = 1;
    let end = -1;
    let t: RegExpExecArray | null;
    while ((t = open.exec(body))) {
      depth += t[0].startsWith("</") ? -1 : 1;
      if (depth === 0) {
        end = t.index + t[0].length;
        break;
      }
    }
    if (end < 0) break;
    const html = body.slice(start, end);
    const type = /\sdata-section="([^"]+)"/.exec(m[0])?.[1] ?? "?";
    const variant = /\sdata-variant="([^"]+)"/.exec(m[0])?.[1] ?? "?";
    out.push({ sid: m[2]!, key: `${type}.${variant}`, html });
    ROOT.lastIndex = end;
  }
  return out;
}

/** The report row the Shell draws until the footer draws the link (CRIT15): out of the shell hash, so it may move. */
const REPORT_ROW = /<p class="lp-report">[\s\S]*?<\/p>/;
/**
 * The page icon of a logo-less store: the R1 grid monogram since step 13 (DES-§12.5, src/lib/logo/favicon.ts), a
 * reviewed change of every document's head. Out of the shell hash; `test:design`'s favicon group pins the icon.
 */
const ICON_LINK = /<link rel="icon" href="data:image\/svg\+xml,[^"]*"[^>]*\/>/;
/**
 * The dividers between sections (src/landing/illustrations/dividers.tsx): hashed apart from the shell, because they
 * follow their neighbours' grounds and so move when a section stops rendering (BASELINE_VANISH).
 */
const DIVIDER = /<div id="lpi-dv-[^"]*" class="lp-divider[^"]*"[^>]*>[\s\S]*?<\/div>/g;

interface DocGolden {
  sum: string;
  shell: string;
  dividers: string;
  sections: [sid: string, key: string, sha: string][];
}

/** A rendered entry: the golden fields, and the shell text (sections as `<§sid/>` placeholders) before hashing. */
interface Rendered extends DocGolden {
  shellText: string;
}

export async function renderEntry(e: BaselineEntry): Promise<Rendered> {
  const fx = getFixture(e.fixture, { now: NOW, locale: e.locale, archetype: e.arch, seed: e.seed });
  const { doc } = validateDoc(fx.doc);
  if (!doc) throw new Error(`${e.name}: invalid fixture`);
  const sum = createHash("sha256").update(JSON.stringify(doc), "utf8").digest("hex").slice(0, 16);
  const r = e.page === "landing" ? await renderLandingHtml(doc, optionsFor(e, fx)) : await renderThankYouHtml(doc, optionsFor(e, fx));
  if (r.issues.length) throw new Error(`${e.name}: sections failed ${r.issues.map((i) => i.sectionId).join(", ")}`);
  const html = r.html.replace(/<style>[\s\S]*?<\/style>/, "<style/>");
  const sections = e.page === "landing" ? sectionsOf(html) : [];
  let shell = html;
  for (const s of sections) shell = shell.replace(s.html, `<§${s.sid}/>`);
  shell = shell.replace(REPORT_ROW, "").replace(ICON_LINK, "");
  const dividers = sha((shell.match(DIVIDER) ?? []).join("\n"));
  shell = shell.replace(DIVIDER, "");
  return { sum, shell: sha(shell), dividers, shellText: shell, sections: sections.map((s) => [s.sid, s.key, sha(s.html)]) };
}

/** Every stylesheet chunk the documents can inline: the per-variant chunks and the merged per-type sheets. */
function chunkHashes(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, css] of Object.entries(sectionChunkCss)) out[`chunk:${k}`] = sha(css);
  for (const [k, css] of Object.entries(sectionCss)) out[`type:${k}`] = sha(css);
  return out;
}

/** Top-level rules of a minified stylesheet, each with its at-rule context ("@media …>sel{…}"). */
export function cssRules(css: string, prefix = ""): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf("{", i);
    if (open < 0) break;
    const prelude = css.slice(i, open).trim();
    let depth = 1;
    let j = open + 1;
    for (; j < css.length && depth; j++) {
      if (css[j] === "{") depth++;
      else if (css[j] === "}") depth--;
    }
    const body = css.slice(open + 1, j - 1);
    if (prelude.startsWith("@") && body.includes("{")) out.push(...cssRules(body, `${prefix}${prelude}>`));
    else out.push(`${prefix}${prelude}{${body}}`);
    i = j;
  }
  return out;
}

interface Golden {
  recordedAt: string;
  docs: Record<string, DocGolden>;
  chunks: Record<string, string>;
  baseGz: string;
}

export async function recordBaseline(): Promise<void> {
  const docs: Record<string, DocGolden> = {};
  for (const e of BASELINE) {
    const { shellText: _, ...g } = await renderEntry(e);
    docs[e.name] = g;
  }
  const golden: Golden = {
    recordedAt: "f9d105d (P6 step 3, its landing assets rebuilt), before the section kit redraws",
    docs,
    chunks: chunkHashes(),
    baseGz: gzipSync(Buffer.from(baseCss, "utf8"), { level: 9 }).toString("base64"),
  };
  writeFileSync(GOLDEN, JSON.stringify(golden, null, 0).replace(/\],"/g, '],\n"') + "\n", "utf8");
}

const allowed = (key: string) => Object.prototype.hasOwnProperty.call(BASELINE_ALLOW, key);
const added = (key: string) => Object.prototype.hasOwnProperty.call(BASELINE_NEW, key);
const vanishes = (key: string) => Object.prototype.hasOwnProperty.call(BASELINE_VANISH, key);

/** Problems of the re-rendered entries against the goldens (empty when every difference is a reviewed one). */
export async function compareBaseline(entries: readonly BaselineEntry[] = BASELINE): Promise<string[]> {
  const golden = JSON.parse(readFileSync(GOLDEN, "utf8")) as Golden;
  const problems: string[] = [];
  for (const e of entries) {
    const want = golden.docs[e.name];
    if (!want) {
      problems.push(`${e.name}: no golden`);
      continue;
    }
    const got = await renderEntry(e);
    if (got.sum !== want.sum) problems.push(`${e.name}: the published checksum moved (${want.sum} → ${got.sum})`);
    // a section that may stop rendering gets its placeholder back after the golden section before it
    const rendered = new Set(got.sections.map(([sid]) => sid));
    let shell = got.shellText;
    let vanished = false;
    want.sections.forEach(([sid, key], i) => {
      if (rendered.has(sid) || !vanishes(key)) return;
      vanished = true;
      const prev = want.sections.slice(0, i).reverse().find(([p]) => rendered.has(p) || shell.includes(`<§${p}/>`));
      shell = prev ? shell.replace(`<§${prev[0]}/>`, `<§${prev[0]}/><§${sid}/>`) : shell;
    });
    if (sha(shell) !== want.shell) problems.push(`${e.name}: the page shell changed outside the sections`);
    if (!vanished && got.dividers !== want.dividers) problems.push(`${e.name}: the section dividers changed`);
    const before = new Map(want.sections.map(([sid, key, h]) => [sid, { key, h }]));
    for (const [sid, key, h] of got.sections) {
      const b = before.get(sid);
      if (!b) problems.push(`${e.name}: section ${sid} (${key}) is new`);
      else if (b.key !== key && !(allowed(b.key) || allowed(key))) problems.push(`${e.name}: section ${sid} renders ${key}, was ${b.key}`);
      else if (b.h !== h && !allowed(key)) problems.push(`${e.name}: section ${sid} (${key}) changed and is not a reviewed redraw`);
      before.delete(sid);
    }
    for (const [sid, { key }] of before) if (!vanishes(key)) problems.push(`${e.name}: section ${sid} (${key}) no longer renders`);
  }
  // stylesheet chunks: a changed chunk belongs to a reviewed redraw (a merged per-type sheet: any of its redraws)
  const now = chunkHashes();
  for (const [k, h] of Object.entries(golden.chunks)) {
    if (now[k] === h) continue;
    const name = k.replace(/^(chunk|type):/, "");
    const chunkOk = (key: string) => allowed(key) || Object.prototype.hasOwnProperty.call(BASELINE_CHUNK_ALLOW, key);
    const ok = name.includes(".") ? chunkOk(name) : [...Object.keys(BASELINE_ALLOW), ...Object.keys(BASELINE_CHUNK_ALLOW), ...Object.keys(BASELINE_NEW)].some((a) => a.startsWith(`${name}.`));
    if (!ok) problems.push(`stylesheet ${k} ${now[k] ? "changed" : "is gone"} outside the reviewed redraws`);
  }
  for (const k of Object.keys(now)) {
    const name = k.replace(/^(chunk|type):/, "");
    if (!golden.chunks[k] && !allowed(name) && !added(name)) problems.push(`stylesheet ${k} is new outside the reviewed redraws`);
  }
  problems.push(...baseCssProblems(gunzipSync(Buffer.from(golden.baseGz, "base64")).toString("utf8"), baseCss));
  return problems;
}

/** The base stylesheet: every added rule is look-only, every removed rule has a reviewed reason. */
export function baseCssProblems(before: string, after: string): string[] {
  const problems: string[] = [];
  const a = new Set(cssRules(before));
  const b = new Set(cssRules(after));
  for (const r of b) {
    if (a.has(r)) continue;
    const sel = r.slice(0, r.indexOf("{"));
    if (!LOOK_ONLY.test(sel) && !BASE_ADDED_OK.some(([re]) => re.test(r))) problems.push(`base.css: a rule added or changed without a look-only scope: ${r.slice(0, 160)}`);
  }
  for (const r of a) {
    if (b.has(r)) continue;
    const sel = r.slice(0, r.indexOf("{"));
    if (LOOK_ONLY.test(sel)) continue;
    if (!BASE_REMOVED_OK.some(([re]) => re.test(r))) problems.push(`base.css: a rule removed or changed without a reviewed reason: ${r.slice(0, 160)}`);
  }
  return problems;
}

if (process.argv[1] && /design-baseline\.ts$/.test(process.argv[1])) {
  (async () => {
    if (process.argv.includes("--record")) {
      await recordBaseline();
      console.log(`recorded ${BASELINE.length} baseline documents → ${GOLDEN}`);
      return;
    }
    const t0 = performance.now();
    const problems = await compareBaseline();
    for (const p of problems) console.log(`  FAIL ${p}`);
    console.log(`${BASELINE.length} baseline documents in ${((performance.now() - t0) / 1000).toFixed(1)} s · ${problems.length ? `${problems.length} FINDING(S)` : "ALL OK"}`);
    process.exit(problems.length ? 1 : 0);
  })().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
