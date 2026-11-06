/**
 * Final call to action — the last push before the footer, said with the product and the COD
 * promise. Three modern compositions of the same data:
 *  banner  a contrasting color panel the product breaks out of (a cutout standing on the panel
 *          floor or a tall framed photo crossing its top edge; a landscape photo slides out of its
 *          side) with real rating / saving chips
 *  stamp   (id kept for saved pages) the quiet close: a start-aligned copy column with the one
 *          order button beside the product in a plain tinted disc; no ring of text, no turning
 *          disc (design.md DES-§5.13 S8, owner rule 2)
 *  poster  giant headline with the product photo set inline as a pill, on the flat colour field of
 *          its block (no mesh of lights: core D60, V40), closing on the big order button with the
 *          live price
 * The primary button carries data-hero-cta (Cta's `hero` prop, DES-§5.9), so the frozen sticky bar
 * hides while it is on screen.
 * The button is always the Cta primitive (href="#order", data-action="order"): it scrolls to the
 * order form and works without JS. Every default line restates a built-in COD promise.
 */
import type { ReactElement } from "react";
import { SectionShell } from "@/landing/primitives";
import { defineSection, type SectionProps } from "../../types";
import { Banner } from "./banner";
import { garmentOf } from "../garment";
import { COMMON, defaultPoints, langOf, pick, titlesFor } from "./copy";
import { schema, type CtaData, type ViewProps } from "./model";
import { Poster } from "./poster";
import { Stamp } from "./stamp";
import { withRevealScope } from "../reveal-scope";

const VIEWS: Record<string, (p: ViewProps) => ReactElement> = {
  banner: Banner,
  stamp: Stamp,
  poster: Poster,
};

export default withRevealScope(defineSection({
  type: "cta",
  label: "Final call to action",
  labelFr: "Appel à l’action",
  category: "conversion",
  description: "The closing push: the product, the COD promise and a big order button with the live price.",
  variants: [
    {
      id: "banner",
      label: "Banner",
      description: "A contrasting color panel with the product breaking out of its top edge, heading and order button beside it.",
    },
    {
      id: "stamp",
      label: "Quiet close",
      description: "A quiet close: the headline, one order button and the cash-on-delivery promise beside the product in a plain disc.",
      archetypes: ["maison", "souk", "playground", "hearth", "bloom"],
    },
    {
      id: "poster",
      label: "Poster",
      description: "A giant headline with the product photo set inline, on a flat field of the product color.",
      archetypes: ["maison", "apothecary", "playground", "kinetic", "circuit", "bloom", "field", "editorial", "garage"],
    },
  ],
  schema,
  defaults: ({ locale, product, offers, rng }): CtaData => {
    const lang = langOf(locale);
    const c = COMMON[lang];
    return {
      kicker: pick(rng, c.kickers),
      title: pick(rng, titlesFor(lang, product.category, garmentOf(product))),
      lead: pick(rng, c.leads),
      ctaLabel: "",
      showPrice: true,
      points: defaultPoints(lang, offers),
      panel: "auto",
      chips: true,
      ring: c.ring,
      inlineImage: true,
    };
  },
  fields: [
    {
      kind: "group",
      label: "Heading",
      fields: [
        { kind: "text", path: "kicker", label: "Kicker", max: 60, help: "Small label above the title, e.g. “Dernière étape”." },
        {
          kind: "text",
          path: "title",
          label: "Title",
          max: 120,
          help: "Short and concrete: under 30 characters reads best in the Poster layout. Wrap a word in *asterisks* to emphasize it.",
        },
        { kind: "textarea", path: "lead", label: "Intro line", max: 240, rows: 3, help: "One or two sentences: how ordering and paying at the door works." },
      ],
    },
    {
      kind: "group",
      label: "Order button",
      fields: [
        { kind: "text", path: "ctaLabel", label: "Button label", max: 60, placeholder: "Je commande maintenant", help: "Leave empty for the default order label. The Badge CTA layout shows labels up to 22 characters (longer ones use “Commander”)." },
        { kind: "toggle", path: "showPrice", label: "Show the live price", help: "The price of the pack selected in the order form, updated as it changes." },
      ],
    },
    {
      kind: "list",
      path: "points",
      label: "Reassurance points",
      itemLabel: "Point",
      titlePath: "text",
      min: 0,
      max: 3,
      item: [
        { kind: "icon", path: "icon", label: "Icon" },
        { kind: "text", path: "text", label: "Text", max: 60, help: "Only what your team really does, e.g. “Livraison en 24–48h”." },
      ],
      newItem: () => ({ icon: "check", text: "" }),
    },
    {
      kind: "group",
      label: "Product image",
      fields: [{ kind: "image", path: "image", label: "Image", help: "Defaults to the product cutout, else an upright product photo. A landscape photo stays landscape (in the Banner it slides out of the panel’s side)." }],
    },
    {
      kind: "group",
      label: "Banner layout",
      fields: [
        {
          kind: "select",
          path: "panel",
          label: "Panel color",
          options: [
            { value: "auto", label: "Automatic (contrasts with the section)" },
            { value: "accent", label: "Accent" },
            { value: "dark", label: "Dark" },
            { value: "pop", label: "Pop" },
            { value: "surface", label: "Light surface" },
          ],
        },
        { kind: "toggle", path: "chips", label: "Rating & saving chips on the product", help: "Shown only with a real rating and a real reference price." },
      ],
    },
    {
      kind: "group",
      label: "Badge CTA layout",
      fields: [
        { kind: "text", path: "ring", label: "Text around the button", max: 110, help: "1–4 short phrases separated by “·”. Empty = the reassurance points. Arabic is set upright on the two halves of the ring, so it shows the first two phrases." },
      ],
    },
    {
      kind: "group",
      label: "Poster layout",
      fields: [{ kind: "toggle", path: "inlineImage", label: "Product photo inside the headline", help: "A rounded photo set between the words of the title." }],
    },
  ],
  render: ({ id, variant, bg, data, ctx }: SectionProps<CtaData>): ReactElement => {
    const titleId = `${id}-title`;
    const known = !!VIEWS[variant];
    const View = VIEWS[variant] ?? Banner;
    return (
      <SectionShell id={id} ctx={ctx} type="cta" variant={known ? variant : "banner"} bg={bg} labelledBy={titleId} className="lp-decor-host">
        <View ctx={ctx} data={data} id={id} bg={bg} titleId={titleId} />
      </SectionShell>
    );
  },
}));
