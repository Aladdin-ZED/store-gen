/**
 * Specs — what the product is, exactly:
 *  sheet      clean label | value rows on hairlines that draw in, figures roll up, product tile beside
 *  tabs       frosted segmented control with a gliding indicator over one large raised stage
 *  accordion  smooth expanding groups (icon discs, +/− morph) beside a sticky product column
 *  label      the spec card — a modern product card read like a label, with price and order button
 * Views live in their own files; this one holds the definition (defaults, inspector, render).
 */
import type { ReactElement, ReactNode } from "react";
import { SectionShell } from "@/landing/primitives";
import { defineSection, type SectionProps } from "../../types";
import { typoDeep } from "../guarantee/model";
import { Accordion } from "./accordion";
import { specsDefaults } from "./copy";
import { Label } from "./label";
import type { ViewProps } from "./parts";
import { schema, type Data } from "./schema";
import { Sheet } from "./sheet";
import { Tabs } from "./tabs";
import { withRevealScope } from "../reveal-scope";

const VIEWS: Record<string, (p: ViewProps) => ReactNode> = {
  sheet: Sheet,
  tabs: Tabs,
  accordion: Accordion,
  label: Label,
};

const ICON_HELP = "Shown in the tab or beside the group title.";

export default withRevealScope(defineSection({
  type: "specs",
  label: "Specs & details",
  labelFr: "Caractéristiques",
  category: "product",
  description: "The product's exact specs, how to use it and how delivery works — as a sheet, tabs, expanding groups or a spec card.",
  variants: [
    {
      id: "sheet",
      label: "Spec sheet",
      description: "Label and value on hairlines that draw in, figures that roll up, the product tile beside.",
      archetypes: ["maison", "circuit", "editorial", "garage", "souk", "field"],
    },
    {
      id: "tabs",
      label: "Tabs",
      description: "Frosted pill tabs with a gliding indicator over one large panel; the photo changes with the tab.",
      archetypes: ["apothecary", "circuit", "kinetic", "bloom", "playground", "garage"],
    },
    {
      id: "accordion",
      label: "Accordion",
      description: "Groups that open smoothly, icon discs and a +/− morph, beside a sticky product column.",
      archetypes: ["playground", "hearth", "kinetic", "bloom", "maison", "apothecary", "editorial"],
    },
    {
      id: "label",
      label: "Spec card",
      description: "A modern product card: lit product, name, key figure, chips, spec grid, price and button.",
      archetypes: ["souk", "field", "hearth", "apothecary"],
    },
  ],
  schema,
  defaults: ({ locale, product, items, rng }) => specsDefaults({ locale, product, item: items[0]!, rng }),
  fields: [
    {
      kind: "group",
      label: "Heading",
      fields: [
        { kind: "text", path: "kicker", label: "Kicker", max: 60 },
        { kind: "text", path: "title", label: "Title", max: 140, help: "Wrap a word in *asterisks* to emphasize it." },
        { kind: "textarea", path: "lead", label: "Intro line", max: 280, rows: 2 },
        {
          kind: "image",
          path: "image",
          label: "Product photo",
          help: "Defaults to the cutout, else the first product photo. Tabs show your other photos on the next tabs.",
        },
      ],
    },
    {
      kind: "list",
      path: "rows",
      label: "Specifications",
      itemLabel: "Spec",
      titlePath: "label",
      min: 1,
      max: 14,
      item: [
        { kind: "text", path: "label", label: "Label", max: 40, placeholder: "Contenance", help: "What is measured, in a word or two." },
        {
          kind: "text",
          path: "value",
          label: "Value",
          max: 90,
          placeholder: "30 ml",
          help: "Exactly as on the pack. A number with its unit (“30 ml”, “6 niveaux”) rolls up when it scrolls in.",
        },
      ],
      newItem: () => ({ label: "", value: "" }),
    },
    {
      kind: "list",
      path: "groups",
      label: "Tabs & groups",
      itemLabel: "Group",
      titlePath: "title",
      min: 1,
      max: 6,
      item: [
        { kind: "text", path: "title", label: "Title", max: 32, help: "Keep it to one or two words: it sits in a pill on phones." },
        { kind: "icon", path: "icon", label: "Icon", help: ICON_HELP },
        {
          kind: "select",
          path: "kind",
          label: "Content",
          options: [
            { value: "text", label: "Text" },
            { value: "specs", label: "The specifications list" },
          ],
          help: "“The specifications list” shows the rows above; the text then becomes a short intro.",
        },
        {
          kind: "textarea",
          path: "body",
          label: "Text",
          max: 1200,
          rows: 5,
          help: "Start a line with “- ” for a bullet. **Bold** and *emphasis* work.",
        },
      ],
      newItem: () => ({ title: "", icon: "info", kind: "text", body: "" }),
    },
    {
      kind: "list",
      path: "highlights",
      label: "Highlights",
      itemLabel: "Highlight",
      titlePath: "text",
      max: 6,
      item: [{ kind: "text", path: "text", label: "Highlight", max: 32, placeholder: "Sans parabènes" }],
      newItem: () => ({ text: "" }),
    },
    { kind: "text", path: "note", label: "Footnote", max: 160, help: "Small print under the specs, e.g. “Measured in our lab”. Leave empty to hide." },
    {
      kind: "group",
      label: "Button",
      fields: [
        { kind: "toggle", path: "cta", label: "Show the order button" },
        { kind: "text", path: "ctaLabel", label: "Button label", max: 60, help: "Leave empty for the default “Order now”." },
      ],
    },
    {
      kind: "toggle",
      path: "sample",
      label: "Example specs",
      help: "On while these are typical figures for the category. Check every value, highlight and delivery promise against your product, then switch it off.",
    },
  ],
  render: ({ id, variant, bg, data, ctx }: SectionProps<Data>): ReactElement => {
    const titleId = `${id}-title`;
    const View = VIEWS[variant] ?? Sheet;
    return (
      <SectionShell id={id} ctx={ctx} type="specs" variant={variant} bg={bg} labelledBy={titleId}>
        <View ctx={ctx} data={typoDeep(ctx.locale, data)} id={id} titleId={titleId} bg={bg} />
      </SectionShell>
    );
  },
}));
