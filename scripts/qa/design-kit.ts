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
 */
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
    const data = spec.data?.[s.type];
    if (!variant && !data) return s;
    const v = variant ?? s.variant;
    const bgs = allowedBgs(getSection(s.type), v);
    return { ...s, variant: v, bg: bgs.includes(s.bg) ? s.bg : bgs[0]!, data: { ...s.data, ...(data ?? {}) } };
  });
  const { doc } = validateDoc({ ...fx.doc, sections });
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
