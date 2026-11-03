/**
 * The section kit documents of the redraws (P6 DESIGN; design.md DES-§4.5.4, DES-§5.13 sheets H1-H4, H9, S5-S8, core
 * D60 / V40, DES-§25.1 `test:render`): fixture pages whose sections are switched to the redrawn variants, so every
 * redraw (the four former aurora variants included) renders in ar and fr, and the markup checks the render cases run on
 * every generated page:
 *  - V40: no `.lp-aurora` element, no `--lp-aurora*` or `--lp-grain*` custom property declared, no `data-texture="grain"`;
 *  - RTL3 (ar documents): no `<textPath>`, no `writing-mode` in the markup, and a `writing-mode` rule of the inlined
 *    stylesheet only ever for non-Arabic text (`:not(:lang(ar))`);
 *  - RTL5: the footer's e-mails in `dir="ltr"` isolates, its addresses in one isolate of their own script's direction,
 *    never a space before a comma or a colon;
 *  - owner rule 2 (S8, S17, S20, S21): no tape, stamp, ticket perforation, seal ring, chat bubble or phone mock class;
 *  - DES-§5.9: the final call's primary button carries `data-hero-cta`;
 *  - DS42 (sheet S7): a stats section with library example figures renders nothing, one with merchant figures renders.
 *
 * Section kit II (step 5; DES-§4.5.4, sheets H5-H10, S1-S4): `KIT_NEW`, the five new hero families, split's ratio and
 * media side, the four new sections and the one-asset page (a single 1,200 px phone photo without alpha: the cinema
 * hero's mobile-only bleed with its framed desktop fallback), checked by `newKitProblems`: one h1, the fold items in
 * the hero's markup (photo, price cluster, the order action, the COD line: the static C2 rows), no chip over a photo,
 * numerals in LTR isolates, and no button, price or picker in the sections that never sell.
 */
import type { AssetResolver } from "@/landing/context";
import { getSection } from "@/landing/registry";
import { allowedBgs } from "@/lib/editor/sections";
import { getFixture, type FixtureName } from "@/lib/page/fixtures";
import type { PageDoc, SectionInstance } from "@/lib/page/schema";
import { validateDoc } from "@/lib/page/validate";
import { BASELINE_ALLOW, cssRules, sectionsOf } from "./design-baseline";

/** One kit page: a fixture with some section types switched to a redrawn variant (and optional data over it). */
export interface KitSpec {
  name: string;
  fixture: FixtureName;
  variants: Readonly<Record<string, string>>;
  data?: Readonly<Record<string, Record<string, unknown>>>;
  /** data per locale over `data` (copy written in the page's language) */
  localized?: Readonly<Record<"ar" | "fr", Readonly<Record<string, Record<string, unknown>>>>>;
  /** one product photo only, no cut-out, resolved at this width (a 3:4 phone photo without alpha) */
  oneAsset?: number;
}

/**
 * Section kit II (step 5): every new hero family in ar and fr, split's ratio and logical media side, the four new
 * sections (hanging benefits, the figure showcase, the contact gallery, the pack showcase) and the one-asset page.
 */
export const KIT_NEW: readonly KitSpec[] = [
  {
    name: "kit-cinema",
    fixture: "argan",
    variants: { hero: "cinema", benefits: "hanging" },
    localized: { fr: { hero: { caption: "Verre ambré, pipette en verre" } }, ar: { hero: { caption: "زجاج عنبري وقطّارة زجاجية" } } },
  },
  {
    name: "kit-quiet",
    fixture: "tshirt",
    variants: { hero: "quiet", benefits: "hanging", showcase: "figure", gallery: "contact", offer: "showcase" },
    localized: { fr: { showcase: { figure: "FIG. 01", caption: "La maille, de près" } }, ar: { showcase: { figure: "الشكل 01", caption: "النسيج عن قرب" } } },
  },
  { name: "kit-index", fixture: "argan", variants: { hero: "index", offer: "showcase" }, data: { hero: { numbering: "padded" } } },
  { name: "kit-contact2", fixture: "tshirt", variants: { hero: "contact", gallery: "contact" }, data: { hero: { titleCell: "bl" }, gallery: { cols: 2 } } },
  { name: "kit-statement", fixture: "parfum", variants: { hero: "statement", showcase: "figure" }, data: { hero: { structure: "word-subline" } } },
  { name: "kit-pair", fixture: "argan", variants: { hero: "statement" }, data: { hero: { structure: "contrast-pair" } } },
  { name: "kit-split", fixture: "tshirt", variants: { hero: "split" }, data: { hero: { ratio: "5:7", mediaSide: "end" } } },
  { name: "kit-one-asset", fixture: "argan", variants: { hero: "cinema" }, oneAsset: 1200 },
];

/** The page's assets, with the one-asset page's single photo resolved as a `oneAsset`-px 3:4 phone photo without alpha. */
export function kitAssets(spec: KitSpec, doc: PageDoc, base: AssetResolver): AssetResolver {
  const id = spec.oneAsset ? doc.product.images[0]?.id : undefined;
  if (!id || !spec.oneAsset) return base;
  const w = spec.oneAsset;
  return {
    ...base,
    resolve(ref) {
      const a = base.resolve(ref);
      return a && a.id === id ? { ...a, width: w, height: Math.round((w * 4) / 3), alpha: false } : a;
    },
  };
}

/**
 * Three pages over the argan fixture (whose defaults already hold hero:stage, problem:chat, trustBar:stamps,
 * marquee:tape, offer:tickets, socialProof:whatsapp, guarantee:seal, cta:banner and footer:big): every redrawn variant
 * appears at least once, and the four former aurora variants (hero:poster, cta:banner, cta:poster, socialProof:ugc).
 */
export const KIT: readonly KitSpec[] = [
  { name: "kit-poster", fixture: "argan", variants: { hero: "poster", whatsappFloat: "tab" } },
  { name: "kit-contact", fixture: "argan", variants: { hero: "scrapbook", cta: "stamp", socialProof: "ugc", footer: "simple" } },
  {
    name: "kit-spec",
    fixture: "argan",
    variants: { hero: "spec", cta: "poster", socialProof: "counter" },
    // merchant figures: the section renders them (DS42)
    data: { stats: { sample: false } },
  },
];

/** The kit page in a locale: the fixture's sections, the spec's variants (on a ground they allow), validated. */
export function kitDoc(spec: KitSpec, locale: "ar" | "fr", now: string): { doc: PageDoc; fx: ReturnType<typeof getFixture> } {
  const fx = getFixture(spec.fixture, { now, locale });
  const sections = (fx.doc as { sections: SectionInstance[] }).sections.map((s): SectionInstance => {
    const variant = spec.variants[s.type];
    const data = { ...(spec.data?.[s.type] ?? {}), ...(spec.localized?.[locale]?.[s.type] ?? {}) };
    if (!variant && !Object.keys(data).length) return s;
    const v = variant ?? s.variant;
    const bgs = allowedBgs(getSection(s.type), v);
    // the one-asset page: the hero shows the product's one photo, never an override
    const own = spec.oneAsset && s.type === "hero" ? { image: undefined, images: [] } : {};
    return { ...s, variant: v, bg: bgs.includes(s.bg) ? s.bg : bgs[0]!, data: { ...s.data, ...data, ...own } };
  });
  const raw = fx.doc as { product: { images: unknown[]; cutout?: unknown } };
  const product = spec.oneAsset ? { ...raw.product, images: raw.product.images.slice(0, 1), cutout: undefined } : raw.product;
  const { doc } = validateDoc({ ...fx.doc, product, sections });
  if (!doc) throw new Error(`${spec.name}/${locale}: invalid kit document`);
  return { doc, fx };
}

const ELEMENT_CLASS = /\sclass="([^"]*)"/g;
/**
 * Class names of the removed shapes (owner rule 2, S17, S20, S21); a section id that keeps the old name is fine. A ring
 * of text is caught by RTL3's `textPath` (an avatar's story ring is not a shape of the list).
 */
const REMOVED_SHAPE = /^lp-[a-z-]+__(?:tape|stamp|stamps|perf|perforation|stub|seal-ring|ring-text|bubble|bubbles|phone|screen|notch|polaroid)(?:$|-)/;
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;
/** The redrawn variants (the allow-list of the baseline goldens): the removed-shape check reads their markup only. */
const REDRAWN = new Set(Object.keys(BASELINE_ALLOW));

/** Every markup problem of a rendered landing document (V40, RTL3, RTL5, the removed shapes, the CTA plan, DS42). */
export function kitMarkupProblems(html: string, locale: string, opts: { cta?: boolean; stats?: "none" | "shown" } = {}): string[] {
  const out: string[] = [];
  const style = /<style>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? "";
  const htmlTag = /<html[^>]*>/.exec(html)?.[0] ?? "";
  const body = html.slice(html.indexOf("<body")).replace(/<script\b[\s\S]*?<\/script>/g, "");
  // V40 (core D60 rev 3)
  for (const m of body.matchAll(ELEMENT_CLASS)) if (/(?:^|\s)lp-aurora(?:$|\s|__)/.test(m[1]!)) out.push(`V40: an .lp-aurora element (class "${m[1]}")`);
  if (/--lp-aurora[\w-]*\s*:/.test(html)) out.push("V40: an --lp-aurora custom property is declared");
  if (/--lp-grain[\w-]*\s*:/.test(html)) out.push("V40: an --lp-grain custom property is declared");
  if (/data-texture="grain"/.test(htmlTag)) out.push('V40: data-texture="grain"');
  // RTL3: Arabic is never on a path nor set vertically
  if (locale === "ar") {
    if (/<textPath\b/i.test(body)) out.push("RTL3: a <textPath> in an ar document");
    if (/writing-mode/i.test(body)) out.push("RTL3: writing-mode in the markup of an ar document");
    for (const r of cssRules(style)) {
      const decl = /writing-mode:\s*([\w-]+)/.exec(r.slice(r.indexOf("{")));
      if (!decl || decl[1] === "horizontal-tb" || decl[1] === "initial" || decl[1] === "inherit") continue;
      const sel = r.slice(0, r.indexOf("{"));
      if (!sel.split(",").every((s) => /:not\(:lang\(ar\)\)/.test(s))) out.push(`RTL3: a writing-mode rule that reaches Arabic text: ${sel.slice(0, 120)}`);
    }
  }
  // owner rule 2: the redrawn variants draw none of the removed shapes
  for (const s of sectionsOf(body)) {
    if (!REDRAWN.has(s.key)) continue;
    for (const m of s.html.matchAll(ELEMENT_CLASS)) for (const c of m[1]!.split(/\s+/)) if (REMOVED_SHAPE.test(c)) out.push(`${s.key}: a removed shape is still drawn (class "${c}")`);
  }
  // RTL5: the footer's channels
  const footer = /<footer\b[\s\S]*<\/footer>/.exec(body)?.[0] ?? "";
  let rest = footer;
  for (const m of footer.matchAll(/<bdi dir="(ltr|rtl)">([\s\S]*?)<\/bdi>/g)) {
    const text = m[2]!.replace(/<[^>]+>/g, "").replace(/&#x27;/g, "'");
    if (EMAIL.test(text) && m[1] !== "ltr") out.push(`RTL5: an e-mail in a dir="${m[1]}" isolate (${text})`);
    if (/\s[,،;:]/.test(text)) out.push(`RTL5: spaced punctuation in "${text}"`);
    if (m[1] === "ltr") rest = rest.replace(m[0], "");
  }
  const loose = rest.replace(/<[^>]+>/g, " ");
  if (EMAIL.test(loose)) out.push(`RTL5: an e-mail outside an LTR isolate (${EMAIL.exec(loose)![0]})`);
  // DES-§5.9: the final call's primary button is the sticky bar's reference
  if (opts.cta) {
    const cta = /<section\b[^>]*\sdata-section="cta"[\s\S]*?<\/section>/.exec(body)?.[0] ?? "";
    if (!cta) out.push("the cta section did not render");
    else if (!/<a\b[^>]*\sdata-hero-cta=""[^>]*\sdata-action="order"|<a\b[^>]*\sdata-action="order"[^>]*\sdata-hero-cta=""/.test(cta)) out.push("the cta section's order button has no data-hero-cta (DES-§5.9)");
  }
  // DS42: example figures never reach the page
  if (opts.stats) {
    const shown = /\sdata-section="stats"/.test(body);
    if (opts.stats === "none" && shown) out.push("DS42: a stats section with library example figures rendered");
    if (opts.stats === "shown" && !shown) out.push("DS42: a stats section with merchant figures did not render");
  }
  return out;
}

/** The section's markup in a rendered body (its root with `data-section="<type>"`). */
function sectionHtml(body: string, type: string): string {
  return sectionsOf(body).find((s) => s.key.startsWith(`${type}.`))?.html ?? "";
}

/**
 * Section kit II markup (step 5): the hero's fold items (C2, static), one h1, its numerals in LTR isolates, nothing over
 * the photo but the cinema caption; and the sections that never sell (showcase:figure, gallery:contact) or leave the
 * picker to the form (offer:showcase) draw no button, price or pack link.
 */
export function newKitProblems(html: string, spec: KitSpec): string[] {
  const out: string[] = [];
  const body = html.slice(html.indexOf("<body")).replace(/<script\b[\s\S]*?<\/script>/g, "");
  const hero = sectionHtml(body, "hero");
  const family = spec.variants.hero;
  if (!hero) return ["the hero did not render"];
  if (!hero.includes(`data-variant="${family}"`)) out.push(`the hero is not hero:${family}`);
  if ((body.match(/<h1\b/g) ?? []).length !== 1) out.push("the page has no single h1");
  // C2 (static): the photo, the price cluster, the order action and the COD line are in the hero's own markup
  if (!/<img\b/.test(hero)) out.push(`hero:${family}: no product photo`);
  if (!/class="[^"]*lp-price\b/.test(hero)) out.push(`hero:${family}: no price cluster`);
  if (!/<a\b[^>]*data-action="order"/.test(hero)) out.push(`hero:${family}: no order action`);
  if (!/class="[^"]*lp-trust\b/.test(hero)) out.push(`hero:${family}: no COD line`);
  if (family !== "split" && /lp-hero__callout|lp-glass/.test(hero)) out.push(`hero:${family}: a chip or glass over the photo`);
  if (family === "cinema") {
    const fig = /<figure class="lp-hero__cine-media"[\s\S]*?<\/figure>/.exec(hero)?.[0] ?? "";
    const text = fig.replace(/<figcaption[\s\S]*?<\/figcaption>/, "").replace(/<[^>]+>/g, "").trim();
    if (text) out.push(`hero:cinema: text over the photo besides the caption ("${text.slice(0, 40)}")`);
  }
  if (family === "index") for (const m of hero.matchAll(/<bdi class="lp-hero__fact-n"[^>]*>/g)) if (!/dir="ltr"/.test(m[0])) out.push("hero:index: a row number outside an LTR isolate");
  if (spec.oneAsset && family === "cinema" && !/data-layout="mobile"/.test(hero)) out.push("hero:cinema with one 1,200 px photo: not the mobile-only bleed with its framed desktop fallback");
  // the sections that never sell, and the showcase that leaves the picker to the form
  for (const [type, variant] of Object.entries(spec.variants)) {
    const key = `${type}:${variant}`;
    if (!["showcase:figure", "gallery:contact", "offer:showcase"].includes(key)) continue;
    const sec = sectionHtml(body, type);
    if (!sec) {
      out.push(`${key} did not render`);
      continue;
    }
    if (/class="[^"]*lp-btn\b/.test(sec)) out.push(`${key}: draws a button`);
    if (/data-bundle=/.test(sec)) out.push(`${key}: draws a pack picker`);
    if (key !== "offer:showcase" && /class="[^"]*lp-price\b|data-action="order"/.test(sec)) out.push(`${key}: draws a price or an order action`);
    if (key === "offer:showcase" && !/href="#order"/.test(sec)) out.push("offer:showcase: no link to the form");
  }
  if (spec.variants.benefits === "hanging") {
    const sec = sectionHtml(body, "benefits");
    if (!/lp-benefits__hrow/.test(sec)) out.push("benefits:hanging: no rows");
    const rows = /<ol class="lp-benefits__hrows"[\s\S]*?<\/ol>/.exec(sec)?.[0] ?? "";
    if (/lp-icon|<svg\b/.test(rows)) out.push("benefits:hanging: an icon in the rows (S07)");
  }
  return out;
}
