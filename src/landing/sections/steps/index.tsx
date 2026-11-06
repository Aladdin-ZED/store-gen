/**
 * Steps — how the product is used (or how ordering works), in four modern compositions:
 *  timeline     a rail that fills with the scroll, nodes lighting up as the line reaches them
 *  cards        frosted glass cards on a staircase, giant numerals diffused through the glass
 *  illustrated  masked plates (photo, or a glass lens over a sphere of the product's color) linked by smooth curves
 *  strip        measured frames with a progress track: swipe strip on phones, grid on wide screens
 */
import type { ReactElement, ReactNode } from "react";
import { SectionShell } from "@/landing/primitives";
import { defineSection, type SectionProps } from "../../types";
import { copyLang, familyOf, pick } from "../benefits/kit";
import { Cards } from "./cards";
import { garmentOf } from "../garment";
import { COMMON, FAMILY, garmentSteps } from "./copy";
import { Illustrated } from "./illustrated";
import { schema, type Data, type ViewProps } from "./model";
import { Strip } from "./strip";
import { Timeline } from "./timeline";
import { withRevealScope } from "../reveal-scope";

const VIEWS: Record<string, (p: ViewProps) => ReactNode> = {
  timeline: Timeline,
  cards: Cards,
  illustrated: Illustrated,
  strip: Strip,
};

export default withRevealScope(defineSection({
  type: "steps",
  label: "How it works",
  labelFr: "Comment ça marche",
  category: "story",
  description: "How the product is used — or how ordering works — in 2 to 5 clear steps.",
  variants: [
    { id: "timeline", label: "Timeline", description: "A rail that fills as you scroll; each step lights up as the line reaches it.", archetypes: [] },
    { id: "cards", label: "Glass cards", description: "Frosted cards on a staircase, giant numerals glowing through the glass.", archetypes: ["kinetic", "playground", "garage"] },
    { id: "illustrated", label: "Illustrated", description: "A photo or a glass lens over the product's color per step, linked by smooth curved lines.", archetypes: ["hearth", "bloom", "souk", "field"] },
    { id: "strip", label: "Strip", description: "Frames with a progress track: swipe on phones, grid on desktop.", archetypes: ["circuit", "editorial"] },
  ],
  schema,
  defaults: ({ locale, product, rng }) => {
    const lang = copyLang(locale);
    const c = COMMON[lang];
    // a garment is ordered by size and checked by touch, never "in its gift box" like jewelry
    const garment = garmentOf(product);
    const fam = garment ? garmentSteps(lang, garment) : FAMILY[familyOf(product.category)][lang];
    // product-specific titles first; a generic one now and then keeps pages from sounding alike
    // (a garment always keeps its own: the generic "manual" titles read wrong for clothing)
    const heading = rng() < 0.7 || garment ? pick(rng, fam.titles) : pick(rng, c.titles);
    return {
      kicker: fam.kicker ?? pick(rng, c.kickers),
      title: heading,
      lead: fam.lead,
      steps: fam.steps.map(([icon, title, text, time]) => ({ icon, title, text, time: time ?? "" })),
      media: true,
      note: pick(rng, c.notes),
      cta: true,
      ctaLabel: "",
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
      ],
    },
    {
      kind: "list",
      path: "steps",
      label: "Steps",
      itemLabel: "Step",
      titlePath: "title",
      min: 2,
      max: 5,
      item: [
        { kind: "text", path: "title", label: "Step", max: 70, help: "One gesture, starting with a verb: “Warm three drops in your palm”." },
        { kind: "textarea", path: "text", label: "Detail", max: 180, rows: 2 },
        { kind: "text", path: "time", label: "Duration", max: 16, help: "Optional: “30 s”, “2 min”. When every step has one, the Timeline photo shows the total." },
        { kind: "icon", path: "icon", label: "Icon", help: "Shown on the Illustrated plates (when the step has no photo) and the Strip frames." },
        { kind: "image", path: "image", label: "Photo", help: "Optional: the gesture itself, square or landscape. Replaces the icon plate." },
      ],
      newItem: () => ({ icon: "check", title: "", text: "", time: "" }),
    },
    {
      kind: "group",
      label: "Photo (Timeline)",
      fields: [
        { kind: "toggle", path: "media", label: "Show a photo beside the steps", help: "Wide screens only. Uses the product photos unless you pick one." },
        { kind: "image", path: "image", label: "Photo", help: "Portrait works best." },
      ],
    },
    {
      kind: "group",
      label: "Ending",
      fields: [
        { kind: "text", path: "note", label: "Closing line", max: 80, help: "Short and confident: “That's it.” Leave empty to hide." },
        { kind: "toggle", path: "cta", label: "Show the order button" },
        { kind: "text", path: "ctaLabel", label: "Button label", max: 60, help: "Leave empty for the default “Order now”." },
      ],
    },
  ],
  render: ({ id, variant, bg, data, ctx }: SectionProps<Data>): ReactElement => {
    const titleId = `${id}-title`;
    const View = VIEWS[variant] ?? Timeline;
    return (
      <SectionShell id={id} ctx={ctx} type="steps" variant={variant} bg={bg} labelledBy={titleId}>
        <View ctx={ctx} data={data} id={id} titleId={titleId} bg={bg} />
      </SectionShell>
    );
  },
}));
