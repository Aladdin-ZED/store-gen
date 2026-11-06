/**
 * Video — the product moving, three modern compositions:
 *  framed     landscape clips: a cinematic frame across the container with the chapters on a frosted
 *             glass dock straddling its bottom edge; vertical clips: a tall frame breaking out of a
 *             panel of its own blurred light (concentric arches on arch themes) beside the copy
 *  phone      a vertical customer video in a modern phone with story chrome (creator, verified pill,
 *             their words), standing on a disc of the product's light, turning gently on scroll,
 *             frosted COD chips over its edges
 *  fullbleed  a film edge to edge, opening from an inset card as it scrolls in, the headline and a
 *             hairline chapter bar over it; film-first on phones; vertical clips become a tall panel
 *             over a field of their own light on desktop
 * Chapters run on segmented tracks: the playhead fills them in turn and lights the current one.
 * The file plays muted and looped while visible (runtime [data-autoplay]); without a video the
 * poster / product photo holds the frame with a slow drift. Creator name, city and words are
 * merchant proof: defaults are samples flagged `sample: true`.
 */
import type { ReactElement } from "react";
import { SectionShell, plainText } from "../../primitives";
import { defineSection, type SectionProps } from "../../types";
import { COMMON, CREATORS, FAMILIES, UI, familyOf, freshKickers, langOf, pick, shortName } from "./copy";
import { Framed } from "./framed";
import { Fullbleed } from "./fullbleed";
import { resolveMedia, schema, type Data, type ViewProps } from "./model";
import { Phone } from "./phone";
import { garmentOf } from "../garment";
import { withRevealScope } from "../reveal-scope";

const VIEWS: Record<string, (p: ViewProps) => ReactElement> = {
  framed: Framed,
  phone: Phone,
  fullbleed: Fullbleed,
};

export default withRevealScope(defineSection({
  type: "video",
  label: "Video",
  labelFr: "Vidéo",
  category: "product",
  description: "Your product video, playing silently while it is on screen — framed, in a phone, or full width.",
  variants: [
    {
      id: "framed",
      label: "Framed",
      description: "A large lit frame with a glass play button and the chapters on a segmented track; wide for landscape clips, beside the copy for vertical ones.",
      archetypes: ["maison", "apothecary", "souk", "playground", "circuit", "hearth", "bloom", "field", "editorial", "garage"],
    },
    {
      id: "phone",
      label: "Phone",
      description: "A vertical customer video in a modern phone on a disc of the product's light, with story overlays and floating COD chips.",
      archetypes: ["apothecary", "playground", "kinetic", "hearth", "bloom"],
    },
    {
      id: "fullbleed",
      label: "Full-bleed",
      description: "A film edge to edge with the headline and the chapters over it, opening up as it scrolls in.",
      archetypes: ["maison", "kinetic", "circuit", "editorial", "garage"],
    },
  ],
  schema,
  defaults: ({ locale, product, rng }) => {
    const lang = langOf(locale);
    // a garment (even filed under kids) is filmed as clothing: worn, in motion
    const family = garmentOf(product) ? "style" : familyOf(product.category);
    const f = FAMILIES[family][lang];
    const c = COMMON[lang];
    const short = shortName(product.name);
    const people = CREATORS[lang];
    const [creatorName, creatorCity] = pick(rng, family === "care" || family === "kids" ? people.women : [...people.women, ...people.men]);
    const title = pick(rng, f.titles);
    const caption = (short ? pick(rng, c.captions).replace("{short}", short) : c.caption).slice(0, 80);
    return {
      kicker: pick(rng, freshKickers(c.kickers, `${title} ${caption}`)),
      title,
      lead: pick(rng, c.leads),
      caption,
      chapters: f.chapters.map((text) => ({ text })),
      creatorName,
      creatorCity,
      quote: f.quote,
      cta: true,
      ctaLabel: "",
      sample: true,
    } satisfies Data;
  },
  fields: [
    {
      kind: "group",
      label: "Video",
      fields: [
        {
          kind: "image",
          path: "video",
          label: "Video file",
          help: "MP4 or WebM, up to 25 MB. Plays muted and looped while it is on screen. Vertical phone videos suit the Phone variant; landscape demos suit Framed and Full-bleed.",
        },
        {
          kind: "image",
          path: "poster",
          label: "Cover image",
          help: "Shown while the video loads, and in its place when there is no video. Defaults to the first product photo.",
        },
        { kind: "text", path: "caption", label: "Caption on the video", max: 80, help: "A short line on a glass chip over the video (Framed and Full-bleed), e.g. “Argan oil, up close”." },
      ],
    },
    {
      kind: "group",
      label: "Heading",
      fields: [
        { kind: "text", path: "kicker", label: "Kicker", max: 60, help: "Small label above the title, e.g. “In action”." },
        { kind: "text", path: "title", label: "Title", max: 140, help: "Wrap the key words in *asterisks* to give them the theme's emphasis." },
        { kind: "textarea", path: "lead", label: "Intro line", max: 280, rows: 2 },
      ],
    },
    {
      kind: "list",
      path: "chapters",
      label: "Chapters (Framed, Full-bleed)",
      itemLabel: "Chapter",
      titlePath: "text",
      min: 0,
      max: 4,
      item: [{ kind: "text", path: "text", label: "What the viewer sees", max: 48, placeholder: "The texture" }],
      newItem: () => ({ text: "" }),
    },
    {
      kind: "group",
      label: "Customer video (Phone)",
      fields: [
        {
          kind: "toggle",
          path: "sample",
          label: "Example content",
          help: "On while the name, city and words below are samples. Replace them with the real customer's (with their permission), then switch it off.",
        },
        { kind: "text", path: "creatorName", label: "Customer name", max: 40, help: "First name is enough. Leave empty to hide the story header." },
        { kind: "text", path: "creatorCity", label: "City", max: 40 },
        { kind: "textarea", path: "quote", label: "Their words", max: 140, rows: 2, help: "One line in their own voice, shown at the bottom of the phone screen." },
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
  render: ({ id, variant, bg, data, ctx }: SectionProps<Data>): ReactElement => {
    const v = VIEWS[variant] ? variant : "framed";
    const View = VIEWS[v]!;
    const titleId = `${id}-title`;
    const hasTitle = !!data.title.trim();
    const media = resolveMedia(ctx, data);
    return (
      <SectionShell
        id={id}
        ctx={ctx}
        type="video"
        variant={v}
        bg={bg}
        labelledBy={hasTitle ? titleId : undefined}
        label={hasTitle ? undefined : UI[langOf(ctx.locale)].video.replace("{name}", plainText(ctx.product.name))}
      >
        <View ctx={ctx} data={data} id={id} titleId={titleId} media={media} />
      </SectionShell>
    );
  },
}));
