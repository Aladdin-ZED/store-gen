/**
 * Guarantee — the COD promise, said plainly and made tangible: you pay at your door, you check the
 * parcel before paying, someone answers you after delivery. Three modern compositions of the same data:
 *  seal    a big rotating badge on a pool of light, crossing into a raised card of promises
 *  split   the product photo with a live “price, paid at the door” glass chip, a promise panel
 *          overlapping its edge, threaded by a hairline that draws down through the icons
 *  letter  a wide signed promise card: the statement in display type, a signature row, the
 *          promises checked in a side column
 * Every default line restates a real store policy (no invented durations, refunds or numbers).
 */
import type { ReactElement } from "react";
import { SectionShell } from "@/landing/primitives";
import { defineSection, type SectionProps } from "../../types";
import { garmentOf } from "../garment";
import { COMMON, defaultPromises, langOf } from "./copy";
import { Letter } from "./letter";
import { schema, type GuaranteeData, type ViewProps } from "./model";
import { Seal } from "./seal";
import { Split } from "./split";
import { withRevealScope } from "../reveal-scope";

const VIEWS: Record<string, (p: ViewProps) => ReactElement> = {
  seal: Seal,
  split: Split,
  letter: Letter,
};

const pick = <T,>(rng: () => number, list: readonly T[]): T => list[Math.min(list.length - 1, Math.floor(rng() * list.length))]!;

export default withRevealScope(defineSection({
  type: "guarantee",
  label: "Guarantee",
  labelFr: "Garantie",
  category: "offer",
  description: "The cash-on-delivery promise made tangible: pay at the door, check before paying, help after delivery.",
  variants: [
    {
      id: "seal",
      label: "Promise card",
      description: "A quiet hairline card that spells the promises out, with the cash-on-delivery fact as a small text chip at its top.",
      archetypes: ["souk", "maison", "playground", "bloom", "kinetic", "garage", "field"],
    },
    {
      id: "split",
      label: "Split",
      description: "Product photo with a live “paid at the door” price chip, overlapped by a panel of promises with icons.",
      archetypes: ["apothecary", "circuit", "hearth", "kinetic", "editorial", "field", "garage", "playground"],
    },
    {
      id: "letter",
      label: "Promise card",
      description: "A wide signed card: the promise in large type, a signature line, the promises checked beside it.",
      archetypes: ["maison", "editorial", "hearth", "bloom", "apothecary"],
    },
  ],
  schema,
  defaults: ({ locale, product, rng }): GuaranteeData => {
    const lang = langOf(locale);
    const c = COMMON[lang];
    return {
      kicker: pick(rng, c.kickers),
      title: pick(rng, c.titles),
      lead: pick(rng, c.leads),
      promises: defaultPromises(lang, product.category, !!garmentOf(product)).map((p) => ({ icon: p.icon, title: p.title, text: p.text })),
      ring: c.ring,
      badgeCenter: "zero",
      badgeLabel: "",
      badgeSub: "",
      priceChip: true,
      signName: "",
      signRole: c.signRole,
      cta: true,
      ctaLabel: "",
      policyLink: true,
    };
  },
  fields: [
    {
      kind: "group",
      label: "Heading",
      fields: [
        { kind: "text", path: "kicker", label: "Kicker", max: 60, help: "Small label above the title, e.g. “Notre engagement”." },
        { kind: "text", path: "title", label: "Promise", max: 140, help: "The promise in one line. Wrap one or two words in *asterisks* to emphasize them." },
        { kind: "textarea", path: "lead", label: "Intro line", max: 280, rows: 3, help: "One or two sentences on how it works at the door." },
      ],
    },
    {
      kind: "list",
      path: "promises",
      label: "Promises",
      itemLabel: "Promise",
      titlePath: "title",
      min: 2,
      max: 4,
      item: [
        { kind: "icon", path: "icon", label: "Icon" },
        { kind: "text", path: "title", label: "Promise", max: 70, help: "Short and concrete: “Payez à la réception”." },
        { kind: "textarea", path: "text", label: "How it works", max: 170, rows: 2, help: "One sentence. Only promise what your team really does." },
      ],
      newItem: () => ({ icon: "check", title: "", text: "" }),
    },
    {
      kind: "group",
      label: "Badge (Badge layout)",
      fields: [
        { kind: "text", path: "ring", label: "Text around the badge", max: 110, help: "1–4 short phrases separated by “·”. Empty = the promise titles." },
        {
          kind: "select",
          path: "badgeCenter",
          label: "Badge center",
          options: [
            { value: "zero", label: "0 upfront (in the page currency)" },
            { value: "check", label: "Check mark" },
            { value: "text", label: "My own word" },
          ],
        },
        { kind: "text", path: "badgeLabel", label: "Center word", max: 10, help: "Used with “My own word”: very short, e.g. “COD”." },
        { kind: "text", path: "badgeSub", label: "Small line under it", max: 22, help: "Empty = “d'avance” with the 0 upfront center." },
      ],
    },
    {
      kind: "group",
      label: "Photo (Split layout)",
      fields: [
        { kind: "image", path: "image", label: "Photo", help: "Defaults to an upright product photo." },
        { kind: "toggle", path: "priceChip", label: "Show the live price chip", help: "A frosted chip on the photo: the selected pack's price, payable at the door." },
      ],
    },
    {
      kind: "group",
      label: "Signature (Promise card layout)",
      fields: [
        { kind: "text", path: "signName", label: "Signed by", max: 60, help: "Empty = your store name." },
        { kind: "text", path: "signRole", label: "Role", max: 60, help: "e.g. “Le service client”." },
      ],
    },
    {
      kind: "group",
      label: "Closing",
      fields: [
        { kind: "toggle", path: "cta", label: "Show the order button" },
        { kind: "text", path: "ctaLabel", label: "Button label", max: 60, help: "Leave empty for the default order label." },
        { kind: "toggle", path: "policyLink", label: "Link to “Delivery & returns”", help: "Points to your delivery & returns page." },
      ],
    },
  ],
  render: ({ id, variant, bg, data, ctx }: SectionProps<GuaranteeData>): ReactElement => {
    const titleId = `${id}-title`;
    const known = !!VIEWS[variant];
    const View = VIEWS[variant] ?? Seal;
    return (
      <SectionShell id={id} ctx={ctx} type="guarantee" variant={known ? variant : "seal"} bg={bg} labelledBy={titleId} className="lp-decor-host">
        <View ctx={ctx} data={data} id={id} bg={bg} titleId={titleId} />
      </SectionShell>
    );
  },
}));
