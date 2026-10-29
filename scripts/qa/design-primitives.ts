/**
 * Golden markup of the seven P6 primitives on legacy documents (P6 DESIGN; design.md DES-§4.5.4, DES-§23.1, TC-1;
 * core §K.2 DES-R18: additive props only). Every primitive is rendered with a fixed matrix of props in the render
 * context of a fixture document WITHOUT `look`, in ar, fr and en; the sha256 of each markup is recorded in
 * src/lib/design/calibration/primitive-goldens.json. `test:render` (scripts/qa/render-cases/design.ts) re-renders the
 * matrix and fails on any difference outside the reviewed allow-list below, each entry with its reason: a document
 * without look keeps today's markup, and new behaviour applies only under look.
 *
 *   npx tsx scripts/qa/design-primitives.ts --write     record the goldens (only from the pre-change primitives)
 *   npx tsx scripts/qa/design-primitives.ts            compare, then run the look-side TC-1 checks
 *
 * The same module renders the look side (`lookCases`): the fixtures with a compiled look, for the TC-1 checks that
 * `test:render` also runs on whole documents (`lookDocProblems`: RTL1, RTL2, RTL4, T2, T7; `numeralCssProblems`: the T1
 * CSS lint) and the opener matrix of SectionHeader (`lookMatrixProblems`).
 */
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRenderContext } from "@/landing/context";
import { Badge, Chip, Sticker } from "@/landing/primitives/Badge";
import { Countdown } from "@/landing/primitives/Countdown";
import { Eyebrow, Kicker } from "@/landing/primitives/Kicker";
import { MarqueeTrack } from "@/landing/primitives/MarqueeTrack";
import { Money, Price } from "@/landing/primitives/Price";
import { RichText } from "@/landing/primitives/RichText";
import { SectionHeader } from "@/landing/primitives/SectionHeader";
import type { RenderContext } from "@/landing/types";
import { compileLook } from "@/lib/design/compile";
import { genomeOf } from "@/lib/design/derive";
import { fixtureAssets, getFixture, type FixtureLocale, type FixtureName } from "@/lib/page/fixtures";
import type { PageDoc } from "@/lib/page/schema";
import { validateDoc } from "@/lib/page/validate";

export const GOLDEN_FILE = join(__dirname, "..", "..", "src", "lib", "design", "calibration", "primitive-goldens.json");
const NOW = "2026-10-24T10:00:00.000Z";
const HOUR = 3_600_000;
const at = (ms: number) => new Date(Date.parse(NOW) + ms).toISOString();

/**
 * Reviewed legacy differences (DES-§23.1): the case keys whose markup may differ from the golden, with the reason.
 * Empty: every primitive change of this step applies under look only.
 */
export const LEGACY_ALLOW: Readonly<Record<string, string>> = {};

/** The fixture documents the matrix runs on: one per locale, without look. */
const CTX_FIXTURES: readonly [FixtureName, FixtureLocale][] = [
  ["argan", "ar"],
  ["tshirt", "fr"],
  ["parfum", "en"],
];

function fixtureDoc(name: FixtureName, locale: FixtureLocale): { doc: PageDoc; pageKey: string; store: ReturnType<typeof getFixture>["store"] } {
  const fx = getFixture(name, { locale, now: NOW });
  const { doc } = validateDoc(fx.doc);
  if (!doc) throw new Error(`${name}/${locale}: invalid fixture`);
  return { doc, pageKey: fx.pageKey, store: fx.store };
}

/** The render context of a document (live mode, the fixture's assets). */
export function contextOf(doc: PageDoc, pageKey: string, store: ReturnType<typeof getFixture>["store"]): RenderContext {
  return createRenderContext(doc, {
    mode: "live",
    assets: fixtureAssets("/"),
    base: "/",
    now: NOW,
    pageKey,
    store,
    links: { home: "./", privacy: "./", terms: "./", shipping: "./", contact: "./" },
  });
}

/** The same fixture document with a compiled look (its genome's), for the look-side checks. */
export function withLook(doc: PageDoc): PageDoc {
  const look = compileLook(genomeOf(doc), {});
  return { ...doc, theme: { ...doc.theme, look } };
}

/** Copy per locale: a title with emphasis, a lead with a range, a Latin product name and Arabic particles. */
const COPY: Record<FixtureLocale, { title: string; lead: string; kicker: string; latin: string; items: string[] }> = {
  ar: {
    title: "زيت *الأركان* من الصويرة في كل قطرة",
    lead: "معصور على البارد مع عناية. التوصيل في 24 – 48 ساعة و الدفع عند الاستلام.\n- خصم −30%\n- Argan Oil Bio ب ثمن مناسب",
    kicker: "Dar Argane",
    latin: "سيروم Argan Oil Pure 30 ml للشعر",
    items: ["الدفع عند الاستلام", "توصيل 24–48 ساعة", "*ضمان* 7 أيام"],
  },
  fr: {
    title: "L'huile d'*argan* pressée à froid : enfin",
    lead: "Livraison en 24 – 48 h. Paiement à la livraison !\n- Économisez −30%\n- Testé « dermatologiquement »",
    kicker: "Formule au karité",
    latin: "T-shirt Oversize 2 en 1",
    items: ["Paiement à la livraison", "Livré en 24–48 h", "*Retour* 7 jours"],
  },
  en: {
    title: "The *scent* that stays all day",
    lead: "Delivered in 24 – 48 h. Pay on delivery.\n- Save −30%\n- Made in Morocco",
    kicker: "Eau de parfum",
    latin: "Parfum Oud Nuit 50 ml",
    items: ["Cash on delivery", "Delivered in 24–48 h", "*7-day* returns"],
  },
};

type Case = [key: string, el: ReactElement];

/** The prop matrix of the seven primitives in one render context. */
export function primitiveMatrix(ctx: RenderContext): Case[] {
  const c = COPY[ctx.locale as FixtureLocale] ?? COPY.en;
  const h = createElement;
  return [
    ["SectionHeader/full", h(SectionHeader, { ctx, kicker: c.kicker, title: c.title, lead: c.lead, editBase: "" })],
    ["SectionHeader/title", h(SectionHeader, { ctx, title: c.title })],
    ["SectionHeader/number-rule", h(SectionHeader, { ctx, number: "01", kicker: c.kicker, title: c.title, rule: true, align: "split", size: "m", titleAs: "h3" })],
    ["SectionHeader/center-xl-nosplit", h(SectionHeader, { ctx, kicker: c.kicker, title: c.title, lead: c.lead, align: "center", size: "xl", titleSplit: false, kickerLook: "pill" })],
    ["SectionHeader/static", h(SectionHeader, { ctx, title: c.latin, lead: c.lead, animate: false, titleId: "t1" }, h("span", null, "x"))],
    ["RichText/inline", h(RichText, { ctx, text: c.title, as: "h2" })],
    ["RichText/split", h(RichText, { ctx, text: c.title, as: "h1", split: true, reveal: "rise" })],
    ["RichText/block", h(RichText, { ctx, text: c.lead, block: true, className: "lp-lead" })],
    ["RichText/latin", h(RichText, { ctx, text: c.latin, as: "p" })],
    ["RichText/plain", h(RichText, { ctx, text: c.items[2]!, decorate: false })],
    ["Price/m", h(Price, { ctx, amount: 149 })],
    ["Price/l-savings", h(Price, { ctx, amount: 149, compareAt: 199, size: "l", showSavings: true })],
    ["Price/xl-from", h(Price, { ctx, amount: 249.9, compareAt: 299, size: "xl", from: true, showSavings: true, animate: false })],
    ["Price/live", h(Price, { ctx, amount: 149, compareAt: 199, live: true, size: "s" })],
    ["Money", h(Money, { ctx, amount: 1299 })],
    ["Countdown/2d", h(Countdown, { ctx, end: at(2 * 24 * HOUR + 3 * HOUR) })],
    ["Countdown/1d-compact", h(Countdown, { ctx, end: at(26 * HOUR), compact: true })],
    ["Countdown/5d", h(Countdown, { ctx, end: at(5 * 24 * HOUR + 7 * 60_000) })],
    ["Countdown/12d-compact", h(Countdown, { ctx, end: at(12 * 24 * HOUR), compact: true })],
    ["Countdown/hours", h(Countdown, { ctx, end: at(5 * HOUR + 33_000), label: "x" })],
    ["Countdown/expired", h(Countdown, { ctx, end: at(-HOUR) })],
    ["Badge", h(Badge, { ctx, text: c.items[0]!, icon: "check" })],
    ["Chip", h(Chip, { ctx, text: c.items[1]!, size: "s" })],
    ["Sticker/burst", h(Sticker, { ctx, text: "−30%", shape: "burst", rotateKey: "k1" })],
    ["Sticker/scallop", h(Sticker, { ctx, text: "−30%", shape: "scallop", size: "l", tone: "accent" })],
    ["Sticker/pill", h(Sticker, { ctx, text: c.items[0]!, shape: "pill", tilt: 0, reveal: "stamp" })],
    ["MarqueeTrack/text", h(MarqueeTrack, { ctx, items: c.items })],
    ["MarqueeTrack/opts", h(MarqueeTrack, { ctx, items: [...c.items, ""], speed: "slow", reverse: true, separator: false, fade: true, minItems: 4 })],
    ["Kicker/auto", h(Kicker, { ctx, text: c.kicker })],
    ["Kicker/pill", h(Kicker, { ctx, text: c.kicker, look: "pill", ornament: false, as: "span", reveal: "fade", delay: 90 })],
    ["Eyebrow", h(Eyebrow, { ctx, text: c.kicker, number: "01" })],
  ];
}

const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

/** Every legacy case: `<fixture>/<locale>/<case>` → its markup. */
export function legacyCases(): Map<string, string> {
  const out = new Map<string, string>();
  for (const [name, locale] of CTX_FIXTURES) {
    const { doc, pageKey, store } = fixtureDoc(name, locale);
    if (doc.theme.look) throw new Error(`${name}/${locale}: the fixture has a look`);
    const ctx = contextOf(doc, pageKey, store);
    for (const [key, el] of primitiveMatrix(ctx)) out.set(`${name}/${locale}/${key}`, renderToStaticMarkup(el));
  }
  return out;
}

/** The look side: the same matrix in the fixture documents with a compiled look. */
export function lookCases(): Map<string, { html: string; ctx: RenderContext }> {
  const out = new Map<string, { html: string; ctx: RenderContext }>();
  for (const [name, locale] of CTX_FIXTURES) {
    const { doc, pageKey, store } = fixtureDoc(name, locale);
    const ctx = contextOf(withLook(doc), pageKey, store);
    for (const [key, el] of primitiveMatrix(ctx)) out.set(`${name}/${locale}/${key}`, { html: renderToStaticMarkup(el), ctx });
  }
  return out;
}

/** The differences of the legacy matrix against the goldens (allow-listed keys excluded). */
export function compareGoldens(): string[] {
  let golden: Record<string, string>;
  try {
    golden = JSON.parse(readFileSync(GOLDEN_FILE, "utf8")) as Record<string, string>;
  } catch {
    return ["src/lib/design/calibration/primitive-goldens.json is missing"];
  }
  const now = legacyCases();
  const diffs: string[] = [];
  for (const [k, html] of now) {
    if (LEGACY_ALLOW[k.split("/").slice(2).join("/")] !== undefined) continue;
    if (golden[k] === undefined) diffs.push(`${k}: no golden`);
    else if (golden[k] !== sha(html)) diffs.push(`${k}: legacy markup changed (a document without look must keep it)`);
  }
  for (const k of Object.keys(golden)) if (!now.has(k)) diffs.push(`${k}: golden case no longer rendered`);
  return diffs;
}

/* ------------------------------------------------------------------ */
/* TC-1 checks on look markup (T1, T2, T7, RTL1, RTL2, RTL4)           */
/* ------------------------------------------------------------------ */

/** A text node of a rendered document with what decides its bidi and its context. */
export interface TextAt {
  text: string;
  /** the innermost explicit direction around it is ltr (a `<bdi dir="ltr">` or an element with dir="ltr") */
  ltr: boolean;
  tags: readonly string[];
  classes: ReadonlySet<string>;
}

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const ATTR = (attrs: string, name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(attrs)?.[1];
const decode = (s: string) => s.replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d))).replace(/&nbsp;/g, " ").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

/** Every visible text node of an HTML string (scripts, styles, templates and comments left out), with its context. */
export function textNodes(html: string): TextAt[] {
  const src = html.replace(/<(script|style|template)\b[\s\S]*?<\/\1>/gi, "").replace(/<!--[\s\S]*?-->/g, "");
  const stack: { tag: string; dir: string | null; cls: string[] }[] = [];
  const out: TextAt[] = [];
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|([^<]+)/g;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    if (m[4] !== undefined) {
      const text = decode(m[4]);
      if (!text.trim()) continue;
      const own = [...stack].reverse().find((s) => s.dir !== null);
      out.push({ text, ltr: own?.dir === "ltr", tags: stack.map((s) => s.tag), classes: new Set(stack.flatMap((s) => s.cls)) });
      continue;
    }
    const tag = m[2]!.toLowerCase();
    if (m[1]) {
      const at = stack.map((s) => s.tag).lastIndexOf(tag);
      if (at >= 0) stack.length = at;
      continue;
    }
    if (VOID.has(tag) || m[3]!.trim().endsWith("/")) continue;
    const dir = ATTR(m[3]!, "dir") ?? (tag === "bdi" ? "auto" : null);
    stack.push({ tag, dir, cls: (ATTR(m[3]!, "class") ?? "").split(/\s+/).filter(Boolean) });
  }
  return out;
}

/** Tags of an HTML string whose class list holds `cls`, with whether an ancestor holds `ancestor`. */
function classPlacements(html: string, cls: string, ancestor: string): { inside: number; outside: number } {
  const src = html.replace(/<(script|style|template)\b[\s\S]*?<\/\1>/gi, "");
  const stack: string[][] = [];
  let inside = 0;
  let outside = 0;
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    if (m[1]) {
      stack.pop();
      continue;
    }
    if (VOID.has(m[2]!.toLowerCase()) || m[3]!.trim().endsWith("/")) continue;
    const c = (ATTR(m[3]!, "class") ?? "").split(/\s+/);
    if (c.includes(cls)) {
      if (stack.some((s) => s.includes(ancestor))) inside++;
      else outside++;
    }
    stack.push(c);
  }
  return { inside, outside };
}

/** A numeric range ("24-48", "24 – 48 h") outside an LTR isolate reads "48-24" on an RTL page (RTL1). */
const RANGE = /\d+\s*[-–‑]\s*\d+/;
/** The oblique dual after a numeral (RTL2): "02 يومين" */
const OBLIQUE_DUAL = /[\d٠-٩]+\s*يومين/;
/** A particle followed by a breakable space: a line may end on it (T2) */
const LOOSE_PARTICLE = /(^|[\s («"“])(من|في|على|إلى|عن|مع|و) (?=\S|$)/u;
const ARABIC = /[؀-ۿ]/;

/**
 * The TC-1 problems of one rendered document under a look (an empty list = every row holds):
 *  - RTL1: every numeric range of an RTL page is inside an LTR isolate;
 *  - RTL2: no numeral + "يومين", and every countdown day label carries its plural forms (`data-forms`);
 *  - RTL4: the Price primitive's struck reference and discount chip sit inside its price cluster;
 *  - T2 (ar): no `.lp-word` box, and no particle followed by a breakable space in an h1 / h2;
 *  - T7 (ar): every Latin run of an h1 / h2 or a lead is inside an LTR isolate.
 */
export function lookDocProblems(html: string, locale: string): string[] {
  const problems: string[] = [];
  const nodes = textNodes(html);
  const rtl = locale === "ar";
  for (const n of nodes) {
    if (rtl && !n.ltr && RANGE.test(n.text)) problems.push(`RTL1: range outside an LTR isolate: "${n.text.trim().slice(0, 60)}"`);
    if (OBLIQUE_DUAL.test(n.text)) problems.push(`RTL2: "${OBLIQUE_DUAL.exec(n.text)![0]}"`);
    if (!rtl) continue;
    const heading = n.tags.includes("h1") || n.tags.includes("h2");
    if (heading && ARABIC.test(n.text) && LOOSE_PARTICLE.test(n.text)) problems.push(`T2: a particle before a breakable space in a heading: "${n.text.trim().slice(0, 60)}"`);
    const lead = n.classes.has("lp-lead") || n.classes.has("lp-sh__lead") || n.classes.has("lp-sh__pull");
    if ((heading || lead) && !n.ltr && /[A-Za-z]{2,}/.test(n.text)) problems.push(`T7: Latin run outside an LTR isolate: "${n.text.trim().slice(0, 60)}"`);
  }
  for (const m of html.matchAll(/<[a-z]+\b[^>]*\sdata-cd-label="d"[^>]*>/g)) if (!/\sdata-forms="/.test(m[0])) problems.push("RTL2: a countdown day label without data-forms");
  if (rtl && /<[a-z]+\b[^>]*\sclass="(?:[^"]*\s)?lp-word(?:\s[^"]*)?"/.test(html)) problems.push("T2: an Arabic document splits a title into .lp-word boxes");
  for (const part of ["lp-price__was", "lp-price__save"]) {
    const inPrice = classPlacements(html, part, "lp-price");
    const inCluster = classPlacements(html, part, "lp-price__cluster");
    if (inPrice.inside > inCluster.inside) problems.push(`RTL4: ${inPrice.inside - inCluster.inside} .${part} outside the price cluster`);
  }
  return problems;
}

/**
 * The T1 / RTL4 CSS lint over a stylesheet (the landing base CSS, minified or not): tabular lining figures on the
 * price parts, the counters, the countdown digits and `[data-num]`; the price cluster one unbroken inline-flex unit.
 */
export function numeralCssProblems(css: string): string[] {
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1]!, decl: m[2]! }));
  const numeric = (d: string) => /font-variant-numeric:[^;}]*tabular-nums/.test(d.replace(/\s+/g, " ").replace(/: /g, ":")) && /font-variant-numeric:[^;}]*lining-nums/.test(d.replace(/: /g, ":"));
  const problems: string[] = [];
  for (const needle of [".lp-price__now", ".lp-price__was", ".lp-price__save", ".lp-price__cluster", ".lp-money", ".lp-counter", ".lp-cd", "[data-num]"]) {
    if (!rules.some((r) => r.sel.includes(needle) && numeric(r.decl))) problems.push(`T1: no tabular lining figures on ${needle}`);
  }
  const cluster = rules.filter((r) => r.sel.includes(".lp-price__cluster") && !r.sel.includes(" .lp-price__cluster ")).map((r) => r.decl.replace(/\s+/g, "")).join(";");
  for (const want of ["display:inline-flex", "flex-wrap:nowrap", "white-space:nowrap"]) if (!cluster.includes(want)) problems.push(`RTL4: the price cluster has no ${want}`);
  return problems;
}

/** The look side of the primitive matrix: the rows the primitives themselves guarantee (an empty list = all hold). */
export function lookMatrixProblems(): string[] {
  const problems: string[] = [];
  for (const [key, { html, ctx }] of lookCases()) {
    const at = (k: string) => key.endsWith(`/${k}`);
    for (const p of lookDocProblems(html, ctx.locale)) problems.push(`${key}: ${p}`);
    if (at("Price/l-savings") && !/class="lp-price__cluster" data-num=""/.test(html)) problems.push(`${key}: no price cluster with data-num`);
    if (ctx.locale === "ar" && at("RichText/latin") && !/<bdi dir="ltr">Argan Oil Pure 30 ml<\/bdi>/.test(html)) problems.push(`${key}: the Latin run is not one <bdi dir="ltr">`);
    if (ctx.locale === "ar" && at("RichText/inline") && !/من الصويرة/.test(html)) problems.push(`${key}: "من" is not bound to the next word`);
    if (ctx.locale === "ar" && at("Countdown/2d") && !(html.includes(">يومان<") && decode(html).includes('"two":"يومان"') && !html.includes("يومين"))) problems.push(`${key}: the dual is not "يومان" with its forms`);
    if (at("Countdown/2d") && !/<bdi class="lp-cd__unit" dir="ltr" data-unit="d"/.test(html)) problems.push(`${key}: the day numeral and its unit are not one <bdi dir="ltr">`);
    if (at("SectionHeader/number-rule") && (/lp-sh__num/.test(html) || !/data-opener="kicker"/.test(html))) problems.push(`${key}: a number shown on the kicker`);
    if (at("Kicker/auto") && !/lp-kicker--label/.test(html)) problems.push(`${key}: the kicker is not a bare label`);
  }
  // the openers: the kicker string is ignored unless the opener is kicker; an opener without its material is bare
  const { doc, pageKey, store } = fixtureDoc("argan", "ar");
  const ctx = contextOf(withLook(doc), pageKey, store);
  const head = (props: Record<string, unknown>) => renderToStaticMarkup(createElement(SectionHeader, { ctx, title: "زيت الأركان", lead: "معصور على البارد", kicker: "Dar Argane", ...props }));
  const expect: [Record<string, unknown>, string, (h: string) => boolean][] = [
    [{ opener: "bare" }, "bare", (h) => !h.includes("lp-kicker")],
    [{ opener: "caption", caption: "الشكل 01" }, "caption", (h) => h.includes("lp-sh__caption") && !h.includes("lp-kicker")],
    [{ opener: "caption" }, "bare", (h) => !h.includes("lp-sh__caption")],
    [{ opener: "number", number: "01" }, "number", (h) => /<span class="lp-sh__index"[^>]*data-num=""[^>]*><bdi dir="ltr">01<\/bdi>/.test(h) && !h.includes("lp-kicker")],
    [{ opener: "number" }, "bare", () => true],
    [{ opener: "quote" }, "quote", (h) => h.indexOf("lp-sh__pull") >= 0 && h.indexOf("lp-sh__pull") < h.indexOf("lp-sh__title") && !h.includes("lp-sh__lead")],
    [{ opener: "image", openerImage: createElement("img", { src: "/x.jpg", alt: "" }) }, "image", (h) => h.indexOf("lp-sh__opener-img") < h.indexOf("lp-sh__title")],
    [{ opener: "kicker" }, "kicker", (h) => h.includes("lp-kicker")],
    [{ opener: "kicker", kicker: "" }, "bare", () => true],
  ];
  for (const [props, kind, ok] of expect) {
    const h = head(props);
    const label = JSON.stringify({ ...props, openerImage: props.openerImage ? "img" : undefined });
    if (!h.includes(`data-opener="${kind}"`) || !ok(h)) problems.push(`SectionHeader ${label}: not the ${kind} opener`);
  }
  // T2 / T7 edges: a particle that ends a run binds to the emphasis after it, a run of particles binds as a chain, and
  // a particle glued to a Latin run leaves the run isolated
  const rt = (text: string, as: NonNullable<Parameters<typeof RichText>[0]["as"]> = "h2") => renderToStaticMarkup(createElement(RichText, { ctx, text, as }));
  const edge = rt("سهل من *أول* مرة");
  if (!/من <em/.test(edge) || lookDocProblems(edge, "ar").length) problems.push(`RichText: "من" before an emphasis is not bound (${edge.slice(0, 80)})`);
  const chain = rt("الدفع و في الدار مع Argan Oil", "p");
  if (!chain.includes("و في الدار") || !chain.includes('مع <bdi dir="ltr">Argan Oil</bdi>')) problems.push(`RichText: particle chain or particle + Latin run (${chain})`);
  return problems;
}

function main() {
  if (process.argv.includes("--write")) {
    const out: Record<string, string> = {};
    for (const [k, html] of legacyCases()) out[k] = sha(html);
    writeFileSync(GOLDEN_FILE, JSON.stringify(out, null, 1) + "\n", "utf8");
    console.log(`wrote ${Object.keys(out).length} primitive goldens`);
    return;
  }
  const diffs = compareGoldens();
  for (const d of diffs) console.log(`  ${d}`);
  console.log(diffs.length ? `${diffs.length} difference(s)` : "legacy primitive markup unchanged");
  const look = lookMatrixProblems();
  for (const p of look) console.log(`  ${p}`);
  console.log(look.length ? `${look.length} look problem(s)` : "look primitives: every TC-1 row holds");
  process.exit(diffs.length || look.length ? 1 : 0);
}

if (require.main === module) main();
