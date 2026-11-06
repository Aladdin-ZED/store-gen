/**
 * Stats — merchant-proof numbers, each keyed to its source footnote, in three modern compositions:
 *  big-numbers  the lead figure enormous in a lit color panel (product breaking out over its edge,
 *               a meter drawing to the share), the others as an editorial index beside it
 *  rings        one concentric cluster of rings drawing to each share around the product, with a
 *               legend whose keys light their ring on hover
 *  ticker       figures gliding across a full-bleed band at display size, an outlined echo row the
 *               other way, and a still scoreboard that rolls up underneath
 * Defaults are examples flagged `sample: true`: they stay in the editor as placeholders and never reach the page (only
 * the product's real rating, used as-is, does); the section shows two to four merchant figures or nothing (DS42, S7).
 */
import type { ReactElement, ReactNode } from "react";
import { SectionShell } from "@/landing/primitives";
import { defineSection, type SectionProps } from "../../types";
import { copyLang, familyOf, fill, pick, shortName } from "../benefits/kit";
import { BigNumbers } from "./big-numbers";
import { COMMON, STATS } from "./copy";
import { merchantFigures, schema, type Data, type StatItem, type ViewProps } from "./model";
import { Rings } from "./rings";
import { Ticker } from "./ticker";
import { garmentOf } from "../garment";
import { withRevealScope } from "../reveal-scope";

const VIEWS: Record<string, (p: ViewProps) => ReactNode> = {
  "big-numbers": BigNumbers,
  rings: Rings,
  ticker: Ticker,
};

export default withRevealScope(defineSection({
  type: "stats",
  label: "Numbers",
  labelFr: "Chiffres",
  category: "proof",
  description: "Your real numbers — results, specs or store figures — each with its source.",
  variants: [
    {
      id: "big-numbers",
      label: "Big numbers",
      description: "The lead figure huge in a lit color panel with the product, the others as a clean index beside it.",
      archetypes: ["editorial", "circuit", "kinetic", "maison", "souk", "hearth", "field", "playground", "garage"],
    },
    {
      id: "rings",
      label: "Rings",
      description: "Concentric rings drawing to each share around the product — best for %, x/5 and “12 h of 24” claims.",
      archetypes: ["apothecary", "bloom", "field", "maison", "circuit", "hearth", "playground"],
    },
    {
      id: "ticker",
      label: "Ticker",
      description: "The figures glide across a full-width color band, with a still scoreboard underneath.",
      archetypes: ["kinetic", "garage", "playground", "souk"],
    },
  ],
  schema,
  defaults: ({ locale, product, rng }) => {
    const lang = copyLang(locale);
    const c = COMMON[lang];
    // a garment (even filed under kids) reads as clothing, never as a toy
    const f = STATS[garmentOf(product) ? "style" : familyOf(product.category)][lang];
    const items: StatItem[] = f.items.map(([value, prefix, suffix, label, of]) => ({ value, prefix, suffix, label, of }));
    // the product's own rating is real data: shown as-is, never invented
    if (product.rating && items.length < 4) {
      const count = new Intl.NumberFormat(lang === "en" ? "en-US" : "fr-FR").format(product.rating.count);
      items.push({ value: product.rating.value, prefix: "", suffix: "/5", label: c.rating.replace("{count}", count).slice(0, 90), of: 5 });
    }
    const name = product.name.trim();
    const vars = { name, short: shortName(name) };
    // the product-name title only when the name is short enough to stay a headline
    const titles = vars.short && vars.short.length <= 24 ? c.titles : c.titles.filter((t) => !t.includes("{short}"));
    return {
      kicker: pick(rng, c.kickers),
      title: fill(pick(rng, titles), vars).slice(0, 140),
      lead: pick(rng, c.leads),
      items,
      source: f.source,
      sample: true,
      showImage: true,
      cta: false,
      ctaLabel: "",
    } satisfies Data;
  },
  fields: [
    { kind: "toggle", path: "sample", label: "Example numbers", help: "On while these are sample figures: the page does not show them. Replace every number with a real, checkable one, then switch it off." },
    {
      kind: "group",
      label: "Heading",
      fields: [
        { kind: "text", path: "kicker", label: "Kicker", max: 60, help: "Small label above the title, e.g. “By the numbers”." },
        { kind: "text", path: "title", label: "Title", max: 140, help: "Wrap the key word in *asterisks* to give it the theme's emphasis." },
        { kind: "textarea", path: "lead", label: "Intro line", max: 280, rows: 2 },
      ],
    },
    {
      kind: "list",
      path: "items",
      label: "Numbers",
      itemLabel: "Number",
      titlePath: "label",
      min: 2,
      max: 4,
      item: [
        { kind: "number", path: "value", label: "Value", min: 0, step: 0.1, help: "The number only (4.7, 94, 12400). It rolls up when it comes into view." },
        { kind: "text", path: "prefix", label: "Before the number", max: 4, placeholder: "+", help: "Optional symbol: “+”, “×”, “~”." },
        { kind: "text", path: "suffix", label: "After the number", max: 10, placeholder: "%", help: "Optional: “%”, “/5”, “ h”. Put words in the caption instead (Arabic units too)." },
        { kind: "text", path: "label", label: "Caption", max: 90, help: "Finishes the sentence that starts with the number: “say their skin feels softer after two weeks”." },
        { kind: "number", path: "of", label: "Out of", min: 0, help: "The whole this number is a share of — 100 for %, 5 for a rating, 24 for hours a day. Draws the ring or meter; leave empty for none." },
      ],
      newItem: () => ({ value: 0, prefix: "", suffix: "", label: "" }),
    },
    { kind: "text", path: "source", label: "Source footnote", max: 160, help: "Where the numbers come from: “Survey of 212 customers, March 2026”. Captions get a * keyed to it." },
    {
      kind: "group",
      label: "Product image",
      fields: [
        { kind: "toggle", path: "showImage", label: "Show the product", help: "In the lead panel (Big numbers) and inside the rings (Rings)." },
        { kind: "image", path: "image", label: "Image", help: "Optional. Defaults to the product cutout, else its first photo." },
      ],
    },
    {
      kind: "group",
      label: "Button",
      fields: [
        { kind: "toggle", path: "cta", label: "Show the order button" },
        { kind: "text", path: "ctaLabel", label: "Button label", max: 60, help: "Leave empty for the default “Order now”." },
      ],
    },
  ],
  render: ({ id, variant, bg, data, ctx }: SectionProps<Data>): ReactElement | null => {
    const titleId = `${id}-title`;
    const View = VIEWS[variant] ?? BigNumbers;
    // merchant figures only (DS42): example numbers never reach the page, and one figure is no stats section
    const items = merchantFigures(ctx, data);
    if (items.length < 2) return null;
    return (
      <SectionShell id={id} ctx={ctx} type="stats" variant={VIEWS[variant] ? variant : "big-numbers"} bg={bg} labelledBy={titleId}>
        <View ctx={ctx} data={items === data.items ? data : { ...data, items }} id={id} bg={bg} titleId={titleId} />
      </SectionShell>
    );
  },
}));
