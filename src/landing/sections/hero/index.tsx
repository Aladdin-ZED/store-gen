/**
 * Hero — the single most important composition of the page: it must stop the scroll on a phone in
 * one second and carry the archetype's personality. Eleven genuinely different modern compositions
 * share one data shape, so switching variants never loses content. The page's only h1 lives here.
 *
 * The five families of section kit II (design.md DES-§4.5.4, sheets H6-H10: cinema, quiet, index, contact,
 * statement) reach generated pages through the genome's grammar pools only (release flag `design_new_heroes`); the
 * archetype draw of the legacy generator never picks them (src/lib/generator/plan.ts `LOOK_ONLY`).
 */
import { createT } from "../../i18n";
import { defineSection, type FieldSpec } from "../../types";
import { garmentOf } from "../garment";
import { bigWordOf, familyCopy, familyOf, garmentHero } from "./copy";
import { CinemaHero } from "./cinema";
import { ContactHero } from "./contact";
import { EditorialHero } from "./editorial";
import { IndexHero } from "./catalogue";
import type { HeroProps } from "./parts";
import { PosterHero } from "./poster";
import { QuietHero } from "./quiet";
import { HeroSchema, type HeroData } from "./schema";
import { ScrapbookHero } from "./scrapbook";
import { SpecHero } from "./spec";
import { SplitHero } from "./split";
import { StageHero } from "./stage";
import { StatementHero } from "./statement";
import { withRevealScope } from "../reveal-scope";

const RENDER: Record<string, (p: HeroProps) => ReturnType<typeof StageHero>> = {
  stage: StageHero,
  editorial: EditorialHero,
  poster: PosterHero,
  scrapbook: ScrapbookHero,
  spec: SpecHero,
  split: SplitHero,
  cinema: CinemaHero,
  quiet: QuietHero,
  index: IndexHero,
  contact: ContactHero,
  statement: StatementHero,
};

const fields: FieldSpec[] = [
  {
    kind: "group",
    label: "Headline",
    fields: [
      { kind: "text", path: "kicker", label: "Kicker", max: 90, help: "Small line above the headline — usually the product name." },
      {
        kind: "text",
        path: "title",
        label: "Headline (h1)",
        max: 140,
        help: "One promise, under 8 words. Wrap one word in *stars* to emphasize it; **double stars** for bold.",
      },
      { kind: "textarea", path: "subtitle", label: "Sub-headline", max: 260, rows: 3, help: "Who it is for and how it feels. Two short sentences at most." },
    ],
  },
  {
    kind: "group",
    label: "Buy box",
    fields: [
      { kind: "text", path: "ctaLabel", label: "Button label", max: 48, placeholder: "Je commande maintenant", help: "Leave empty for the default call to action." },
      { kind: "toggle", path: "ctaPrice", label: "Show the price inside the button" },
      { kind: "toggle", path: "showRating", label: "Show the rating", help: "Only appears when the product has a real rating." },
      { kind: "toggle", path: "showTeaser", label: "Show the pack savings (×2 / ×3)", help: "Computed from your packs — hidden when no pack saves money." },
      { kind: "toggle", path: "showBundles", label: "Show pack chips (Split layout)" },
    ],
  },
  {
    kind: "list",
    path: "notes",
    label: "Product notes",
    itemLabel: "Note",
    titlePath: "title",
    max: 4,
    item: [
      {
        kind: "text",
        path: "title",
        label: "Note",
        max: 40,
        help: "A short fact: callout (Stage, Spec), cover line (Editorial), bullet (Split).",
      },
      { kind: "text", path: "detail", label: "Detail", max: 60, help: "Optional second line." },
    ],
    newItem: () => ({ title: "", detail: "" }),
  },
  {
    kind: "list",
    path: "trust",
    label: "Trust points",
    itemLabel: "Trust point",
    titlePath: "text",
    max: 4,
    item: [
      { kind: "icon", path: "icon", label: "Icon" },
      { kind: "text", path: "text", label: "Text", max: 60, help: "Keep it true: cash on delivery, delivery time, check before paying. When a trust bar comes right after the hero, only the first point shows here." },
    ],
    newItem: () => ({ icon: "check", text: "" }),
  },
  {
    kind: "group",
    label: "Art direction",
    fields: [
      { kind: "toggle", path: "ghost", label: "Show a giant word behind the product (Stage, Poster)", help: "Off by default: one strong idea per page. Use it on a Latin brand name that fits." },
      { kind: "text", path: "bigWord", label: "Giant word", max: 16, help: "The oversized word behind the product when it is on. Short: a brand or an ingredient." },
      { kind: "text", path: "issue", label: "Masthead line", max: 60, help: "Editorial layout only, e.g. “Édition 01 · Soin”." },
      { kind: "image", path: "image", label: "Main image", help: "Defaults to the product cutout, then the first product photo." },
      { kind: "images", path: "images", label: "Extra photos", max: 4, help: "Used by the Contact sheet and the Split gallery." },
      { kind: "images", path: "photos", label: "Contact sheet photos", max: 4, help: "Contact layout: 3 or 4 different photos. Empty: the main image, the extra photos, then the product's." },
      { kind: "text", path: "caption", label: "Photo caption", max: 60, help: "Cinema layout only: one short line over the photo on wide screens, never on phones." },
    ],
  },
];

export default withRevealScope(defineSection({
  type: "hero",
  label: "Hero",
  labelFr: "Héros",
  category: "hero",
  description: "The opening composition: headline, product, price and the main call to action.",
  singleton: true,
  variants: [
    {
      id: "stage",
      label: "Stage",
      description: "The product landing on a studio stage, then the headline, the price and the button. A giant word and up to two callouts only when you turn them on.",
      archetypes: ["maison", "apothecary", "souk", "hearth", "bloom", "field", "playground"],
    },
    {
      id: "editorial",
      label: "Editorial",
      description: "Modern magazine opener: oversized headline, tall arch or rounded figure, two or three cover lines on hairlines.",
      archetypes: ["editorial", "maison", "apothecary", "bloom", "field"],
    },
    {
      id: "poster",
      label: "Poster",
      description: "Full-bleed color field, type first: a big headline, the product as one masked print and a bold price block.",
      archetypes: ["kinetic", "playground", "garage"],
      bgs: ["accent", "pop", "dark"],
    },
    {
      id: "scrapbook",
      label: "Contact sheet",
      description: "Your photos as a quiet contact sheet on a fine grid, one cell holding the headline, price and button.",
      archetypes: ["playground", "hearth", "field", "souk", "bloom"],
    },
    {
      id: "spec",
      label: "Spec",
      description: "Precision tech: dark grid, the product centered with up to three numbered callouts, real figures that tick up.",
      archetypes: ["circuit", "garage", "kinetic"],
      bgs: ["dark", "accent", "pop"],
    },
    {
      id: "split",
      label: "Product page",
      description: "Premium product page: swipeable gallery beside title, rating, price, pack chips, button and trust list.",
    },
    {
      id: "cinema",
      label: "Cinema",
      description: "Your photo edge to edge across the first screen, the headline, price and button on the ground under it.",
      archetypes: [],
    },
    {
      id: "quiet",
      label: "Quiet",
      description: "A small product on a lot of space, one line of type, the price and the button on one line.",
      archetypes: [],
    },
    {
      id: "index",
      label: "Index",
      description: "A catalogue entry: the photo, the headline, your product notes as numbered rows, the price and the button.",
      archetypes: [],
    },
    {
      id: "contact",
      label: "Contact sheet II",
      description: "Three or four of your photos on a fine grid, one cell holding the headline, the price and the button.",
      archetypes: [],
    },
    {
      id: "statement",
      label: "Statement",
      description: "Type first: a big headline, the product as a small framed photo, the price, the button and one line.",
      archetypes: [],
    },
  ],
  schema: HeroSchema,
  defaults: ({ locale, product, rng }): HeroData => {
    const t = createT(locale);
    // a garment speaks of fabric, cut and prayer, never "the detail people notice" of jewelry
    const garment = garmentOf(product);
    const copy = garment ? garmentHero(locale, garment) : familyCopy(locale, familyOf(product.category));
    const pickOne = <T,>(list: readonly T[]): T => list[Math.floor(rng() * list.length) % list.length]!;
    return {
      kicker: product.name,
      title: pickOne(copy.titles),
      subtitle: product.tagline?.trim() || pickOne(copy.subs),
      bigWord: bigWordOf(product.name),
      issue: copy.issue,
      ctaLabel: "",
      ctaPrice: false,
      showRating: true,
      showTeaser: true,
      showBundles: true,
      notes: copy.notes.map((n) => ({ ...n })),
      trust: [
        { icon: "cash-hand", text: t("trust.cod") },
        { icon: "truck", text: t("trust.delivery") },
        { icon: "eye", text: t("trust.check") },
      ],
      images: [],
    };
  },
  fields,
  render: (props) => (RENDER[props.variant] ?? StageHero)(props),
}));
