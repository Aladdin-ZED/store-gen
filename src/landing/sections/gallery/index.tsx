/**
 * Gallery — the product's photos, in four modern compositions:
 *  carousel   a product viewer: one photo per view, parallax swipe, rolling counter + thumbnails
 *  masonry    → bento: an asymmetric rounded grid with a heading tile and a price tile
 *  filmstrip  a cinematic full-width strip where the centered photo comes into focus
 *  lookbook   editorial spreads: 1 large + 2 small photos with indexed captions
 * Photos come from the items (own photo or the next product photo) plus, with `fill`, the product
 * photos not shown yet. Runtime contract: data-gallery / data-gallery-track / data-slide /
 * data-thumb / data-dot / data-gallery-prev|next (docs/ARCHITECTURE.md).
 */
import type { ReactElement, ReactNode } from "react";
import { SectionShell } from "@/landing/primitives";
import { defineSection, type SectionProps } from "../../types";
import { copyLang, familyOf, fill, pick, shortName } from "../benefits/kit";
import { Bento } from "./bento";
import { Carousel } from "./carousel";
import { Contact } from "./contact";
import { garmentOf } from "../garment";
import { COMMON, FAMILY, GARMENT_GALLERY } from "./copy";
import { Filmstrip } from "./filmstrip";
import { Lookbook } from "./lookbook";
import { MAX_SHOTS, resolveShots, schema, type Data, type ViewProps } from "./model";
import { withRevealScope } from "../reveal-scope";

const VIEWS: Record<string, (p: ViewProps) => ReactNode> = {
  carousel: Carousel,
  masonry: Bento,
  filmstrip: Filmstrip,
  lookbook: Lookbook,
  contact: Contact,
};

export default withRevealScope(defineSection({
  type: "gallery",
  label: "Gallery",
  labelFr: "Galerie",
  category: "product",
  description: "The product's photos: a swipeable viewer, a bento grid, a cinematic strip or editorial spreads.",
  variants: [
    {
      id: "carousel",
      label: "Viewer",
      description: "One photo per view in its own ambient light, with a rolling counter, captions and thumbnails.",
      archetypes: ["apothecary", "circuit", "kinetic", "hearth", "garage"],
    },
    {
      id: "masonry",
      label: "Bento",
      description: "An asymmetric rounded grid with a heading tile and a lit price tile.",
      archetypes: ["playground", "bloom", "hearth", "field", "souk"],
    },
    {
      id: "filmstrip",
      label: "Filmstrip",
      description: "A cinematic strip running off the screen: the leading photo comes into focus as you swipe. Best with 3 or more photos; two photos show in the viewer.",
      archetypes: ["kinetic", "circuit", "maison", "garage", "editorial"],
    },
    {
      id: "lookbook",
      label: "Lookbook",
      description: "Editorial spreads of one large and two small photos with captions.",
      archetypes: ["maison", "editorial", "souk", "bloom"],
    },
    {
      id: "contact",
      label: "Contact sheet",
      description: "Three to six of your photos as an even grid on a fine gap. No captions, no button.",
      archetypes: [],
    },
  ],
  schema,
  defaults: ({ locale, product, rng }) => {
    const lang = copyLang(locale);
    const c = COMMON[lang];
    // a garment shows its fabric and drape, never "the finish, shine" of a jewel
    const fam = (garmentOf(product) ? GARMENT_GALLERY : FAMILY[familyOf(product.category)])?.[lang] ?? {};
    const vars = { name: product.name, short: shortName(product.name) };
    // product-aware titles most of the time; a common one now and then keeps pages from sounding alike
    const title = fam.titles && rng() < 0.7 ? pick(rng, fam.titles) : pick(rng, c.titles);
    const captions = fam.captions ?? c.captions;
    // one caption per product photo (the rest of the set is filled automatically)
    const count = Math.min(Math.max(product.images.length, 3), 6);
    return {
      kicker: pick(rng, c.kickers),
      title: fill(title, vars),
      lead: fam.lead ?? c.lead,
      items: captions.slice(0, count).map((caption) => ({ caption })),
      fill: true,
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
        { kind: "textarea", path: "lead", label: "Intro line", max: 240, rows: 2 },
      ],
    },
    {
      kind: "list",
      path: "items",
      label: "Photos",
      itemLabel: "Photo",
      titlePath: "caption",
      min: 0,
      max: 12,
      item: [
        {
          kind: "image",
          path: "image",
          label: "Photo",
          help: "Leave empty to use the next product photo. Close-ups, texture and in-use shots work best.",
        },
        { kind: "text", path: "caption", label: "Caption", max: 90, help: "Short: “The dropper”, “30 ml amber glass”. Leave empty for none." },
      ],
      newItem: () => ({ caption: "" }),
    },
    {
      kind: "toggle",
      path: "fill",
      label: "Add the other product photos",
      help: "Shows every product photo not listed above, after your photos. Bento shows up to 8, Lookbook up to 9.",
    },
    {
      kind: "group",
      label: "Order button",
      fields: [
        { kind: "toggle", path: "cta", label: "Show the order button", help: "In Bento, the price tile shows the product name and tagline when this is off." },
        { kind: "text", path: "ctaLabel", label: "Button label", max: 60, help: "Leave empty for the default “Order now”." },
      ],
    },
  ],
  render: ({ id, variant, bg, data, ctx }: SectionProps<Data>): ReactElement | null => {
    let view = VIEWS[variant] ? variant : "carousel";
    const shots = resolveShots(ctx, data, MAX_SHOTS[view] ?? 12);
    if (!shots.length) return null;
    // a strip of two photos is a lead frame and an empty runway: two photos read better in the viewer
    // (the section root then carries the viewer's class, so the page inlines the viewer's CSS)
    if (view === "filmstrip" && shots.length === 2) view = "carousel";
    const titleId = `${id}-title`;
    const View = VIEWS[view]!;
    const titled = !!data.title.trim();
    return (
      <SectionShell
        id={id}
        ctx={ctx}
        type="gallery"
        variant={view}
        bg={bg}
        labelledBy={titled ? titleId : undefined}
        label={titled ? undefined : ctx.t("gallery.label")}
      >
        <View ctx={ctx} data={data} id={id} variant={view} bg={bg} titleId={titleId} shots={shots} />
      </SectionShell>
    );
  },
}));
