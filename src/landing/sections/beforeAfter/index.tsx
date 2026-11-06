/**
 * Before / after — the customer's own photos of the change, three modern ways:
 *  slider    one frame (an arch on arch / pill pages), the before laid over the after, a frosted
 *            knob on a line of light that the shopper drags; on reveal the knob introduces itself
 *            ("‹ Glissez ›"), glides once across the photo, then folds into its round grip
 *  cards     an asymmetric pair: the after card larger, raised and lit, an accent arrow disc on the
 *            seam; two arches on arch / pill pages, a slight collage tilt where the archetype tilts
 *  timeline  Day 1 → in-between → result: the photos rise from one progress line that draws node to
 *            node, the result the largest frame (phones: compact rows closing on a full frame)
 * Photos and words are merchant proof: defaults are product-aware samples flagged `sample: true`
 * (the product photo stands in, graded, until the customer's photos are uploaded).
 */
import type { ReactElement, ReactNode } from "react";
import { SectionShell } from "@/landing/primitives";
import { CITIES, PEOPLE, shuffle } from "../reviews/copy";
import {
  defineSection,
  type DefaultsInput,
  type SectionProps,
} from "../../types";
import { Cards } from "./cards";
import { COMMON, FAMILIES, PERSONAL, baFamilyOf, langOf } from "./copy";
import { schema, type Data, type ViewProps } from "./model";
import { Slider } from "./slider";
import { Timeline } from "./timeline";
import { garmentOf } from "../garment";
import { withRevealScope } from "../reveal-scope";

const VIEWS: Record<string, (p: ViewProps) => ReactNode> = {
  slider: Slider,
  cards: Cards,
  timeline: Timeline,
};

/** PEOPLE indexes of women (personal-care stories are credited to a customer by default). */
const WOMEN = [0, 2, 3, 5, 6, 8, 10];

function pick<T>(rng: () => number, list: readonly T[]): T {
  return list[Math.min(list.length - 1, Math.floor(rng() * list.length))]!;
}

function defaults({ locale, product, rng }: DefaultsInput): Data {
  const L = langOf(locale);
  // a garment (even filed under kids) compares outfits, never toys
  const fam = garmentOf(product) ? "style" : baFamilyOf(product.category);
  const c = FAMILIES[fam][L];
  const common = COMMON[L];
  const people = PERSONAL.has(fam) ? WOMEN : PEOPLE.map((_, i) => i);
  const person = PEOPLE[pick(rng, people)]!;
  const city = shuffle(CITIES, rng)[0]!;
  return {
    kicker: pick(rng, common.kickers),
    title: pick(rng, c.titles),
    lead: c.lead,
    before: {
      label: c.before.label ?? common.before,
      when: c.before.when,
      caption: c.before.caption,
    },
    after: {
      label: c.after.label ?? common.after,
      when: c.after.when,
      caption: c.after.caption,
    },
    stages: [{ when: c.stage.when, caption: c.stage.caption }],
    results: c.results.map((text) => ({ text })),
    who: `${person[L]} · ${city[L]}`,
    note: common.notes[c.note],
    start: 50,
    sample: true,
    cta: false,
    ctaLabel: "",
  };
}

const momentFields = (path: "before" | "after", name: string) => ({
  kind: "group" as const,
  label: name,
  fields: [
    {
      kind: "image" as const,
      path: `${path}.image`,
      label: "Photo",
      help: "The customer's own photo, untouched. Same angle and light for both photos makes the change obvious.",
    },
    {
      kind: "text" as const,
      path: `${path}.label`,
      label: "Tag",
      max: 24,
      placeholder: path === "before" ? "Avant" : "Après",
      help: "Short word on the photo. Leave empty for the default.",
    },
    {
      kind: "text" as const,
      path: `${path}.when`,
      label: "When",
      max: 32,
      placeholder: path === "before" ? "Jour 1" : "Jour 28",
      help: "When the photo was taken: “Jour 1”, “Semaine 4”, “20 h”.",
    },
    {
      kind: "textarea" as const,
      path: `${path}.caption`,
      label: "What you see",
      max: 140,
      rows: 2,
    },
  ],
});

export default withRevealScope(defineSection({
  type: "beforeAfter",
  label: "Before / after",
  labelFr: "Avant / après",
  category: "proof",
  description:
    "The customer's real before and after photos: a draggable compare, two cards, or a Day 1 → result timeline.",
  variants: [
    {
      id: "slider",
      label: "Slider",
      description:
        "One frame, a frosted knob the shopper drags across the photo; it introduces itself and glides once to show the change.",
    },
    {
      id: "cards",
      label: "Two cards",
      description:
        "Before and after side by side, the after card larger and lit, an accent arrow disc on the seam (two arches on arch pages).",
      archetypes: [
        "souk",
        "hearth",
        "playground",
        "bloom",
        "field",
        "maison",
        "garage",
      ],
    },
    {
      id: "timeline",
      label: "Timeline",
      description:
        "Day 1 → in-between → result: the photos rise from one progress line toward the largest, final frame; best with 3–4 photos.",
      archetypes: [
        "apothecary",
        "kinetic",
        "circuit",
        "bloom",
        "field",
        "editorial",
      ],
    },
  ],
  schema,
  defaults,
  fields: [
    {
      kind: "toggle",
      path: "sample",
      label: "Example content",
      help: "On while this shows sample words and the product photo. Upload the customer's real photos, then switch it off.",
    },
    {
      kind: "group",
      label: "Heading",
      fields: [
        {
          kind: "text",
          path: "kicker",
          label: "Kicker",
          max: 60,
          help: "Small label above the title, e.g. “Avant / après”.",
        },
        {
          kind: "text",
          path: "title",
          label: "Title",
          max: 140,
          help: "Wrap the key words in *asterisks* to give them the theme's emphasis.",
        },
        {
          kind: "textarea",
          path: "lead",
          label: "Intro line",
          max: 280,
          rows: 2,
        },
      ],
    },
    momentFields("before", "Before"),
    momentFields("after", "After"),
    {
      kind: "list",
      path: "stages",
      label: "In-between moments (timeline)",
      itemLabel: "Moment",
      titlePath: "when",
      max: 2,
      item: [
        {
          kind: "image",
          path: "image",
          label: "Photo",
          help: "Optional. Without a photo the moment shows its words only.",
        },
        {
          kind: "text",
          path: "when",
          label: "When",
          max: 32,
          placeholder: "Jour 14",
        },
        {
          kind: "textarea",
          path: "caption",
          label: "What you see",
          max: 140,
          rows: 2,
        },
      ],
      newItem: () => ({ when: "", caption: "" }),
    },
    {
      kind: "list",
      path: "results",
      label: "Results",
      itemLabel: "Result",
      titlePath: "text",
      max: 4,
      item: [
        {
          kind: "text",
          path: "text",
          label: "Result",
          max: 48,
          help: "Short and concrete: “Moins de frisottis”.",
        },
      ],
      newItem: () => ({ text: "" }),
    },
    {
      kind: "group",
      label: "Proof details",
      fields: [
        {
          kind: "text",
          path: "who",
          label: "Whose photos",
          max: 60,
          placeholder: "Salma B. · Casablanca",
          help: "First name, initial and city of the customer (with their permission).",
        },
        {
          kind: "text",
          path: "note",
          label: "Honesty note",
          max: 180,
          help: "Shown under the photos, e.g. “Résultats individuels : ils varient d'une personne à l'autre.”",
        },
        {
          kind: "number",
          path: "start",
          label: "Slider start (%)",
          min: 10,
          max: 90,
          step: 5,
          help: "Where the divider rests before the shopper drags it. At 50 it runs through the middle of the photo's subject (a face, the product). Between 30 and 70 the knob introduces itself with a word (“Glissez”).",
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
          help: "Leave empty for the default “Order now”.",
        },
      ],
    },
  ],
  render: ({
    id,
    variant,
    bg,
    data,
    ctx,
  }: SectionProps<Data>): ReactElement => {
    const titleId = `${id}-title`;
    const v = VIEWS[variant] ? variant : "slider";
    const View = VIEWS[v]!;
    return (
      <SectionShell
        id={id}
        ctx={ctx}
        type="beforeAfter"
        variant={v}
        bg={bg}
        labelledBy={titleId}
      >
        <View ctx={ctx} data={data} id={id} titleId={titleId} />
      </SectionShell>
    );
  },
}));
