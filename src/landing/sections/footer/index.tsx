/**
 * Footer — the store's identity, contact, legal links and the COD promise, closing the page.
 *
 *  - `simple`: wordmark + short line + COD capsule, contact tiles that lift on a spring, a hairline
 *    that draws across, legal links, socials, back-to-top and the identity line (© year, ICE / RC).
 *  - `big`: a closing statement with WhatsApp / call buttons, a links grid (contact · your order ·
 *    information) and the signature moment: the store name set edge to edge across the bottom edge,
 *    rising out of it as the page ends.
 *
 * Contact details come from Settings → Store (ctx.store, sanitized) and the legal URLs from the
 * delivery mode (ctx.links) — never from section data. The year comes from ctx.now.
 */
import { createT } from "../../i18n";
import { SectionShell } from "../../primitives";
import { defineSection, type DefaultsInput, type FieldSpec } from "../../types";
import { Big } from "./big";
import { COD_LINES, HEADINGS, lang, TAGLINES } from "./copy";
import { FooterSchema, type FooterData } from "./model";
import { Simple } from "./simple";
import { withRevealScope } from "../reveal-scope";

const pick = <T,>(list: readonly T[], rng: () => number): T =>
  list[Math.min(list.length - 1, Math.floor(rng() * list.length))]!;

function defaults({ locale, product, rng }: DefaultsInput): FooterData {
  const l = lang(locale);
  const t = createT(locale);
  // the product name reads well in a tagline only when it is short; markup characters stay literal
  const name = product.name.trim().replace(/\*/g, "\\*");
  const taglines =
    name && [...name].length <= 40
      ? TAGLINES[l]
      : TAGLINES[l].filter((s) => !s.includes("{name}"));
  return {
    tagline: pick(taglines, rng).replace("{name}", name),
    heading: pick(HEADINGS[l], rng),
    cod: pick(COD_LINES[l], rng),
    promises: [
      { icon: "cash-hand", text: t("trust.cod") },
      { icon: "truck", text: t("trust.delivery") },
      { icon: "eye", text: t("trust.check") },
      { icon: "return", text: t("trust.returns") },
    ],
    wordmark: "",
    showContact: true,
    showAddress: true,
    showSocials: true,
    backToTop: true,
  };
}

const fields: FieldSpec[] = [
  {
    kind: "group",
    label: "Words",
    fields: [
      {
        kind: "textarea",
        path: "tagline",
        label: "Short line",
        max: 160,
        rows: 2,
        help: "One or two short sentences about the store. Simple: under the name. Big: under the closing statement.",
      },
      {
        kind: "text",
        path: "heading",
        label: "Closing statement (Big)",
        max: 90,
        placeholder: "Une question avant de commander\u00a0? *On vous répond.*",
        help: "Shown above the WhatsApp / call buttons, only when the store has a WhatsApp, phone or e-mail in Settings → Store. Wrap a few words in *stars* to highlight them.",
      },
      {
        kind: "text",
        path: "cod",
        label: "Cash-on-delivery line",
        max: 100,
        placeholder:
          "Paiement à la livraison · Vérifiez votre colis avant de payer",
        help: "The reassurance shown in the small capsule. Keep it true for every order.",
      },
    ],
  },
  {
    kind: "list",
    path: "promises",
    label: "Your order column (Big)",
    itemLabel: "Promise",
    titlePath: "text",
    min: 0,
    max: 4,
    item: [
      { kind: "icon", path: "icon", label: "Icon" },
      {
        kind: "text",
        path: "text",
        label: "Promise",
        max: 60,
        help: "Only what you really do: cash on delivery, delivery time, checking before paying, exchange.",
      },
    ],
    newItem: () => ({ icon: "check", text: "" }),
  },
  {
    kind: "group",
    label: "Giant word (Big)",
    fields: [
      {
        kind: "text",
        path: "wordmark",
        label: "Giant word",
        max: 28,
        placeholder: "Store name",
        help: "Set edge to edge across the bottom of the page. Empty = your store name. A short word (one or two) gives the most dramatic size.",
      },
    ],
  },
  {
    kind: "group",
    label: "What to show",
    fields: [
      {
        kind: "toggle",
        path: "showContact",
        label: "Contact details",
        help: "WhatsApp, phone and e-mail from Settings → Store. Missing ones are skipped.",
      },
      {
        kind: "toggle",
        path: "showAddress",
        label: "Address",
        help: "Address and city from Settings → Store.",
      },
      {
        kind: "toggle",
        path: "showSocials",
        label: "Social links",
        help: "Instagram, Facebook, TikTok and YouTube links from Settings → Store.",
      },
      { kind: "toggle", path: "backToTop", label: "Back-to-top button" },
    ],
  },
];

export default withRevealScope(defineSection({
  type: "footer",
  label: "Footer",
  labelFr: "Pied de page",
  category: "bottom",
  description:
    "Store identity, contact, legal links and the cash-on-delivery promise: calm and precise, or with a giant wordmark across the bottom edge.",
  singleton: true,
  variants: [
    {
      id: "simple",
      label: "Simple",
      description:
        "Wordmark, short line and COD capsule, contact tiles, legal links, socials and the © line.",
    },
    {
      id: "big",
      label: "Big wordmark",
      description:
        "A closing statement with WhatsApp / call buttons, a links grid, and the store name set edge to edge across the bottom edge.",
      archetypes: [
        "maison",
        "souk",
        "playground",
        "kinetic",
        "circuit",
        "bloom",
        "editorial",
        "garage",
      ],
    },
  ],
  schema: FooterSchema,
  defaults,
  fields,
  render: ({ id, variant, bg, data, ctx }) => {
    const big = variant === "big";
    return (
      <SectionShell
        id={id}
        ctx={ctx}
        type="footer"
        variant={big ? "big" : "simple"}
        bg={bg}
        as="footer"
        className="lp-cq"
      >
        {big ? (
          <Big id={id} ctx={ctx} data={data} />
        ) : (
          <Simple ctx={ctx} data={data} />
        )}
      </SectionShell>
    );
  },
}));
