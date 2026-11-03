/**
 * Benefits — what the product changes in the buyer's day, in five modern compositions:
 *  numbered  editorial index: drawn hairlines, huge numerals that fill with light on scroll, alternating photos/figures
 *  bento     curated asymmetric tiles: photo + frosted caption, rolling figure in product light, statement, icons
 *  zigzag    alternating rows: masked photos opening on reveal, a glass chip floating across each edge
 *  icons     compact "at a glance" panel: product photo column + hairline-ruled cells with tinted squircle icons
 *  stack     sticky stacking cards that recede into a deck as the next one arrives
 *  hanging   numbered rows on hairlines, the thumbnails hanging at the copy column's edge (sheet S1; look pages only)
 * Product photos are never repeated inside one section: past the pool, rows use figures or lit plates.
 */
import type { ReactElement, ReactNode } from "react";
import { SectionShell } from "@/landing/primitives";
import { defineSection, type SectionProps } from "../../types";
import { Bento } from "./bento";
import { COMMON, rowsFor, typo } from "./copy";
import { Hanging } from "./hanging";
import { Icons } from "./icons";
import { copyLang, fill, pick, shortName } from "./kit";
import { schema, type Data, type ViewProps } from "./model";
import { Numbered } from "./numbered";
import { Stack } from "./stack";
import { Zigzag } from "./zigzag";
import { withRevealScope } from "../reveal-scope";

const VIEWS: Record<string, (p: ViewProps) => ReactNode> = {
  numbered: Numbered,
  bento: Bento,
  zigzag: Zigzag,
  icons: Icons,
  stack: Stack,
  hanging: Hanging,
};

export default withRevealScope(defineSection({
  type: "benefits",
  label: "Benefits",
  labelFr: "Bénéfices",
  category: "story",
  description: "What the product changes in the buyer's day — editorial list, bento, zigzag, compact sheet or stacking cards.",
  variants: [
    {
      id: "numbered",
      label: "Numbered",
      description: "Editorial index: huge numerals that fill with light on scroll, drawn hairlines, photos on alternate rows.",
      archetypes: ["editorial", "maison", "apothecary", "souk", "circuit"],
    },
    {
      id: "bento",
      label: "Bento",
      description: "Asymmetric tiles: photo with a glass caption, a rolling key figure, a statement and icon tiles.",
      archetypes: ["circuit", "bloom", "kinetic", "editorial", "garage", "apothecary"],
    },
    {
      id: "zigzag",
      label: "Zigzag",
      description: "Alternating photo and text rows; a frosted chip with the key figure floats over each photo.",
      archetypes: ["hearth", "field", "souk", "playground", "bloom"],
    },
    { id: "icons", label: "Compact grid", description: "A compact “at a glance” panel: product photo beside hairline-ruled icon cells — ideal for short pages.", archetypes: [] },
    {
      id: "stack",
      label: "Stacking cards",
      description: "Big color cards that pin and stack as you scroll, the ones behind receding into a deck.",
      archetypes: ["kinetic", "playground", "bloom", "garage"],
    },
    {
      id: "hanging",
      label: "Hanging rows",
      description: "Numbered rows on fine lines, a small photo hanging at the edge of each one. No icons.",
      archetypes: [],
    },
  ],
  schema,
  defaults: ({ locale, product, rng }) => {
    const lang = copyLang(locale);
    const c = COMMON[lang];
    const vars = { name: product.name, short: shortName(product.name) };
    const t = (s: string) => typo(lang, fill(s, vars));
    return {
      kicker: t(pick(rng, c.kickers)),
      title: t(pick(rng, c.titles)),
      lead: t(pick(rng, c.leads)),
      items: rowsFor(lang, product).map(([icon, title, text, stat, statLabel]) => ({
        icon,
        title: t(title),
        text: t(text),
        stat: t(stat ?? ""),
        statLabel: t(statLabel ?? ""),
      })),
      cta: false,
      ctaLabel: "",
    };
  },
  fields: [
    {
      kind: "group",
      label: "Heading",
      fields: [
        { kind: "text", path: "kicker", label: "Kicker", max: 60, help: "Small label above the title, e.g. “Why you'll love it”." },
        { kind: "text", path: "title", label: "Title", max: 140, help: "Wrap one or two words in *asterisks* to emphasize them." },
        { kind: "textarea", path: "lead", label: "Intro line", max: 280, rows: 2, help: "Optional. One sentence that frames the list." },
      ],
    },
    {
      kind: "list",
      path: "items",
      label: "Benefits",
      itemLabel: "Benefit",
      titlePath: "title",
      min: 2,
      max: 6,
      item: [
        { kind: "icon", path: "icon", label: "Icon", help: "The benefit's symbol: tiles, compact cells, glass chips and photo-less plates." },
        { kind: "text", path: "title", label: "Title", max: 70, help: "An outcome, not a feature: “Absorbed in a minute”." },
        { kind: "textarea", path: "text", label: "Detail", max: 220, rows: 3, help: "One or two concrete sentences: how, how long, how much." },
        {
          kind: "group",
          label: "Key figure (optional)",
          fields: [
            { kind: "text", path: "stat", label: "Figure", max: 14, help: "e.g. “3”, “12 h”, “40 s”. Rolls up on screen. It must be true for your product." },
            { kind: "text", path: "statLabel", label: "Figure caption", max: 48, help: "e.g. “drops are enough”." },
          ],
        },
        { kind: "image", path: "image", label: "Photo", help: "Optional. When empty, your product photos are used — never twice in the section; past them, the figure or icon takes the frame." },
      ],
      newItem: () => ({ icon: "check", title: "", text: "", stat: "", statLabel: "" }),
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
    const titleId = `${id}-title`;
    const View = VIEWS[variant] ?? Numbered;
    return (
      <SectionShell id={id} ctx={ctx} type="benefits" variant={VIEWS[variant] ? variant : "numbered"} bg={bg} labelledBy={titleId}>
        <View ctx={ctx} data={data} id={id} titleId={titleId} bg={bg} />
      </SectionShell>
    );
  },
}));
