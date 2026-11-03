/**
 * Story — who made the product and why. Three modern views:
 *  letter      founder note: big title in a sticky start column, the note on a raised card with the
 *              avatar breaking out of its top edge, a solid quote mark and a signature that writes in
 *  image-text  a large masked photo with a frosted glass card overlapping its edge, place chip,
 *              detail inset and subtle parallax
 *  manifesto   one giant statement whose words light up in reading order as the page scrolls
 *
 * Merchant content: defaults are product-aware samples flagged `sample: true`. Nobody is invented —
 * an unsigned note is signed by the store ("L'équipe …"), the place falls back to the store city.
 */
import type { ReactElement } from "react";
import { SectionShell } from "@/landing/primitives";
import { defineSection, type SectionProps } from "../../types";
import { copyLang, familyOf, fill, pick, shortName } from "../benefits/kit";
import { nameFitsTitle, typoDeep } from "../guarantee/model";
import { garmentOf } from "../garment";
import { COMMON, FAMILY_COPY, garmentStory } from "./copy";
import { ImageText } from "./imageText";
import { Letter } from "./letter";
import { Manifesto } from "./manifesto";
import { schema, type StoryData, type ViewProps } from "./model";
import { withRevealScope } from "../reveal-scope";

const VIEWS: Record<string, (p: ViewProps) => ReactElement> = {
  letter: Letter,
  "image-text": ImageText,
  manifesto: Manifesto,
};

export default withRevealScope(defineSection({
  type: "story",
  label: "Story",
  labelFr: "Histoire",
  category: "story",
  description: "Who makes the product and why — as a signed founder note, a large photo with an overlapping card, or a scroll-lit manifesto.",
  variants: [
    {
      id: "letter",
      label: "Founder note",
      description: "Big title beside a raised note card: avatar breaking out of the card, quote mark, signature that writes itself in.",
      archetypes: ["maison", "apothecary", "souk", "hearth", "field", "bloom"],
    },
    {
      id: "image-text",
      label: "Image & text",
      description: "A large masked photo with a frosted glass card overlapping its edge, a place chip and a detail inset.",
      archetypes: [],
    },
    {
      id: "manifesto",
      label: "Manifesto",
      description: "One giant statement led by a product photo pill; its words light up one by one as the page scrolls.",
      archetypes: ["maison", "kinetic", "circuit", "editorial", "garage", "bloom"],
    },
  ],
  schema,
  defaults: ({ locale, product, rng }): StoryData => {
    const lang = copyLang(locale);
    const c = COMMON[lang];
    // a garment tells its own story (fabric, cut, prayer), never the jewelry one of "style"
    const garment = garmentOf(product);
    const f = garment ? garmentStory(lang, garment) : FAMILY_COPY[familyOf(product.category)][lang];
    const vars = { name: product.name, short: shortName(product.name) };
    return {
      kicker: pick(rng, c.kickers),
      // a {short} title only when the name reads well in the page's own display type
      title: fill(pick(rng, nameFitsTitle(lang, vars.short) || f.titles.every((t) => t.includes("{short}")) ? f.titles : f.titles.filter((t) => !t.includes("{short}"))), vars),
      text: fill(f.text, vars),
      statement: fill(pick(rng, f.statements), vars),
      signature: "",
      role: "",
      place: "",
      ps: c.ps,
      facts: f.facts.map(([value, label]) => ({ value, label })),
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
        {
          kind: "text",
          path: "kicker",
          label: "Kicker",
          max: 60,
          help: "Small label above the title, e.g. “Notre histoire”.",
        },
        {
          kind: "text",
          path: "title",
          label: "Title",
          max: 140,
          help: "Wrap one or two words in *asterisks* to emphasize them.",
        },
      ],
    },
    {
      kind: "group",
      label: "The story",
      fields: [
        {
          kind: "textarea",
          path: "text",
          label: "Story",
          max: 900,
          rows: 7,
          help: "Who you are, where the product comes from, why you made it. Two short paragraphs read best — leave an empty line between them.",
        },
        {
          kind: "image",
          path: "image",
          label: "Photo",
          help: "Image & text and Manifesto layouts. Defaults to your product photos.",
        },
        {
          kind: "text",
          path: "place",
          label: "Place",
          max: 48,
          help: "Glass chip on the photo, e.g. “Essaouira”. Empty = your store city.",
        },
      ],
    },
    {
      kind: "group",
      label: "Signature",
      fields: [
        {
          kind: "text",
          path: "signature",
          label: "Signed by",
          max: 60,
          help: "A real name, e.g. “Salma, fondatrice”. Empty = “L'équipe <store>”.",
        },
        {
          kind: "text",
          path: "role",
          label: "Under the name",
          max: 80,
          help: "Role or place, e.g. “Fondatrice · Essaouira”. Empty = your store city.",
        },
        {
          kind: "image",
          path: "portrait",
          label: "Portrait or logo",
          help: "A real photo of the person who signs, or your logo. Empty = store logo, then initials.",
        },
        {
          kind: "text",
          path: "ps",
          label: "P.S. line",
          max: 160,
          help: "Founder note only — a last line after the note, e.g. the pay-on-delivery promise.",
        },
      ],
    },
    {
      kind: "list",
      path: "facts",
      label: "Facts",
      itemLabel: "Fact",
      titlePath: "label",
      min: 0,
      max: 3,
      item: [
        {
          kind: "text",
          path: "value",
          label: "Value",
          max: 24,
          help: "Short and true: “10 s”, “3”, “Agadir”.",
        },
        {
          kind: "text",
          path: "label",
          label: "What it means",
          max: 60,
          help: "e.g. “pour l'appliquer”.",
        },
      ],
      newItem: () => ({ value: "", label: "" }),
    },
    {
      kind: "group",
      label: "Manifesto layout",
      fields: [
        {
          kind: "textarea",
          path: "statement",
          label: "Statement",
          max: 260,
          rows: 3,
          help: "One or two sentences in giant type; its words light up as visitors scroll. *Asterisks* add the accent. Empty = the story's first paragraph.",
        },
      ],
    },
    {
      kind: "group",
      label: "Button",
      fields: [
        { kind: "toggle", path: "cta", label: "Show the order button" },
        {
          kind: "text",
          path: "ctaLabel",
          label: "Button label",
          max: 60,
          help: "Leave empty for the default order label.",
        },
      ],
    },
    {
      kind: "toggle",
      path: "sample",
      label: "Sample story",
      help: "On while this is the built-in sample. Write your brand's real story (and sign it), then switch it off.",
    },
  ],
  render: ({ id, variant, bg, data, ctx }: SectionProps<StoryData>): ReactElement => {
    const titleId = `${id}-title`;
    const known = VIEWS[variant] ? variant : "image-text";
    const View = VIEWS[known]!;
    return (
      <SectionShell id={id} ctx={ctx} type="story" variant={known} bg={bg} labelledBy={titleId}>
        <View ctx={ctx} data={typoDeep(ctx.locale, data)} id={id} bg={bg} titleId={titleId} />
      </SectionShell>
    );
  },
}));
