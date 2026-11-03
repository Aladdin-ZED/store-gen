/**
 * Showcase — the product itself, examined up close:
 *  hotspots     pinned photo, precise leader lines to raised notes crossing its edge (phones: pins + list)
 *  exploded     the product on its set, each detail tied by one hairline stroke to the point it describes
 *  ingredients  a bento of ingredient / material tiles beside the masked product photo
 *  dimensions   a clean technical drawing: dimension lines, scale chip, large spec figures
 * Views live in their own files; this one holds the definition (defaults, inspector, render).
 */
import type { ReactElement, ReactNode } from "react";
import { SectionShell } from "@/landing/primitives";
import { defineSection, type SectionProps } from "../../types";
import { copyLang, familyOf, fill, pick, shortName } from "../benefits/kit";
import { garmentOf } from "../garment";
import { COMMON, FAMILY_COPY, captionFor, garmentShowcase } from "./copy";
import { Dimensions } from "./dimensions";
import { Exploded } from "./exploded";
import { Figure } from "./figure";
import { Hotspots } from "./hotspots";
import { Ingredients } from "./ingredients";
import { schema, type Data } from "./schema";
import type { ViewProps } from "./shared";
import { withRevealScope } from "../reveal-scope";

const VIEWS: Record<string, (p: ViewProps) => ReactNode> = {
  hotspots: Hotspots,
  exploded: Exploded,
  ingredients: Ingredients,
  dimensions: Dimensions,
  figure: Figure,
};

/**
 * Default pins follow the photo's focal point when the merchant set one: the family's pin pattern
 * (designed around a centred product) is shifted onto it, staying inside the frame.
 */
function pinAt(v: number, focal: number | undefined): number {
  if (focal === undefined) return v;
  return Math.round(Math.min(94, Math.max(6, v + (focal * 100 - 50))));
}

export default withRevealScope(defineSection({
  type: "showcase",
  label: "Product showcase",
  labelFr: "Produit en détail",
  category: "product",
  description: "The product examined up close — pinned details, an exploded view, its ingredients or its real size.",
  variants: [
    { id: "hotspots", label: "Hotspots", description: "Pinned photo with precise leader lines to raised notes crossing its edge; hover links each pair.", archetypes: ["circuit", "apothecary", "garage", "kinetic"] },
    { id: "exploded", label: "Exploded", description: "Product on its set; each detail hangs under a hairline that swings onto the exact point it describes.", archetypes: ["playground", "hearth", "bloom", "maison"] },
    { id: "ingredients", label: "Ingredients", description: "Bento of ingredient or material tiles with origin and share.", archetypes: ["apothecary", "field", "souk", "maison"] },
    { id: "dimensions", label: "Dimensions", description: "Clean technical drawing with real measurements and spec figures.", archetypes: ["circuit", "editorial", "garage"] },
    { id: "figure", label: "Figure", description: "One large photo in a fine frame, its caption in a column beside it. No price, no button.", archetypes: [] },
  ],
  schema,
  defaults: ({ locale, product, rng }) => {
    const lang = copyLang(locale);
    const c = COMMON[lang];
    const family = familyOf(product.category);
    // a garment gets garment details (fabric, cut, finishing), never the jewelry lines of "style"
    const garment = garmentOf(product);
    const g = garment ? garmentShowcase(lang, garment) : null;
    const f = g ?? FAMILY_COPY[family][lang];
    const vars = { name: product.name, short: shortName(product.name) };
    const photo = product.cutout ?? product.images[0];
    return {
      kicker: pick(rng, c.kickers),
      title: fill(pick(rng, g?.titles ?? c.titles), vars),
      lead: pick(rng, g?.leads ?? c.leads),
      points: f.points.map(([label, text, x, y]) => ({ label, text, x: pinAt(x, photo?.fx), y: pinAt(y, photo?.fy) })),
      ingredients: f.ingredients.map(([name, origin, share, text, art, icon]) => ({ name, origin, share, text, art, icon })),
      caption: (g?.caption ?? captionFor(lang, family, f.ingredients.length)).slice(0, 60),
      height: f.size.height,
      width: f.size.width,
      specs: f.size.specs.map(([label, value]) => ({ label, value })),
      scaleNote: f.size.note,
      cta: false,
      ctaLabel: "",
      sample: true,
    };
  },
  fields: [
    {
      kind: "group",
      label: "Heading",
      fields: [
        { kind: "text", path: "kicker", label: "Kicker", max: 60 },
        { kind: "text", path: "title", label: "Title", max: 140, help: "Wrap a word in *asterisks* to emphasize it." },
        { kind: "textarea", path: "lead", label: "Intro line", max: 280, rows: 2 },
        { kind: "image", path: "image", label: "Product photo", help: "A clean, front-facing shot works best. Defaults to the cutout, else the first product photo." },
      ],
    },
    {
      kind: "list",
      path: "points",
      label: "Details (Hotspots & Exploded)",
      itemLabel: "Detail",
      titlePath: "label",
      min: 2,
      max: 6,
      item: [
        { kind: "text", path: "label", label: "Detail", max: 40, help: "The part, named plainly: “Glass dropper”." },
        { kind: "textarea", path: "text", label: "Why it matters", max: 140, rows: 2 },
        { kind: "number", path: "x", label: "Pin — across (%)", min: 0, max: 100, step: 1, help: "Where the detail sits on the photo (Hotspots pin, Exploded anchor): 0 = left edge, 100 = right edge." },
        { kind: "number", path: "y", label: "Pin — down (%)", min: 0, max: 100, step: 1, help: "0 = top of the photo, 100 = bottom." },
      ],
      newItem: () => ({ label: "", text: "", x: 50, y: 50 }),
    },
    {
      kind: "list",
      path: "ingredients",
      label: "Ingredients & materials",
      itemLabel: "Ingredient",
      titlePath: "name",
      min: 2,
      max: 6,
      item: [
        { kind: "text", path: "name", label: "Name", max: 40 },
        { kind: "text", path: "origin", label: "Origin or role", max: 40, help: "“Souss, Morocco”, “Heart note”, “Blades”." },
        {
          kind: "text",
          path: "share",
          label: "Share or key figure",
          max: 16,
          help: "“97 %” counts up and fills a bar; a figure like “650 g” is set large; a word like “Base” shows as a pill. Only if true.",
        },
        { kind: "textarea", path: "text", label: "What it does", max: 140, rows: 2 },
        {
          kind: "select",
          path: "art",
          label: "Line icon",
          options: [
            { value: "sprig", label: "Leafy sprig" },
            { value: "olive", label: "Olive / argan branch" },
            { value: "round", label: "Round leaves" },
            { value: "fern", label: "Fern" },
            { value: "lavender", label: "Lavender / thyme" },
            { value: "wild", label: "Wild flowers / citrus" },
            { value: "flower", label: "Flower" },
            { value: "daisy", label: "Daisy" },
            { value: "leaf", label: "Single leaf" },
            { value: "icon", label: "Icon instead (materials)" },
          ],
        },
        { kind: "icon", path: "icon", label: "Icon", help: "Used when the line icon is set to “Icon instead”." },
      ],
      newItem: () => ({ name: "", origin: "", share: "", text: "", art: "sprig", icon: "leaf" }),
    },
    { kind: "text", path: "caption", label: "Photo caption (Ingredients, Figure)", max: 60, help: "Frosted chip on the photo, e.g. “3 ingredients, nothing else”; in Figure, the first line of the caption column. Leave empty to hide." },
    { kind: "text", path: "figure", label: "Figure label (Figure)", max: 20, help: "Optional, e.g. “FIG. 01”. Shown above the caption." },
    {
      kind: "group",
      label: "Dimensions",
      fields: [
        { kind: "text", path: "height", label: "Height", max: 20, help: "With the unit: “12 cm”. Technical styles add a matching scale." },
        { kind: "text", path: "width", label: "Width", max: 20 },
        {
          kind: "list",
          path: "specs",
          label: "Spec figures",
          itemLabel: "Spec",
          titlePath: "label",
          max: 6,
          item: [
            { kind: "text", path: "label", label: "Label", max: 30 },
            { kind: "text", path: "value", label: "Value", max: 40 },
          ],
          newItem: () => ({ label: "", value: "" }),
        },
        { kind: "text", path: "scaleNote", label: "Scale reference", max: 90, help: "Something everyone can picture: “It fits in a car cup holder”." },
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
    {
      kind: "toggle",
      path: "sample",
      label: "Example details",
      help: "On while these are typical figures for the category. Check every detail, share and size against your product, then switch it off.",
    },
  ],
  render: ({ id, variant, bg, data, ctx }: SectionProps<Data>): ReactElement => {
    const titleId = `${id}-title`;
    const View = VIEWS[variant] ?? Hotspots;
    return (
      <SectionShell id={id} ctx={ctx} type="showcase" variant={variant} bg={bg} labelledBy={titleId}>
        <View ctx={ctx} data={data} id={id} titleId={titleId} bg={bg} />
      </SectionShell>
    );
  },
}));
