/**
 * Problem — the everyday pains the product ends, then the turn to the product. Four modern views:
 *  crossed  redline ledger: each pain struck by one clean accent line, its fix written in under it;
 *           it ends on the one line left standing, the product inset in the type as an image pill
 *  chat     (id kept) a two-column ledger on hairlines: each pain beside the product's answer, the turn
 *           under it; no chat mock (design.md DES-§5.13 S5)
 *  split    recessed "Sans" vs raised, vivid "Avec" panels bridged by a half-desaturated product photo
 *  quote    one huge statement with a highlight block on the key words; pains as a quiet index and a
 *           raised answer card with the product
 */
import type { ReactElement } from "react";
import { SectionShell } from "@/landing/primitives";
import { defineSection, type SectionProps } from "../../types";
import { copyLang, familyOf, fill, pick, shortName } from "../benefits/kit";
import { Chat } from "./chat";
import { garmentOf } from "../garment";
import { COMMON, FAMILY_COPY, garmentProblem } from "./copy";
import { Crossed } from "./crossed";
import { schema, type ProblemData, type ViewProps } from "./model";
import { Quote } from "./quote";
import { Split } from "./split";
import { withRevealScope } from "../reveal-scope";

const VIEWS: Record<string, (p: ViewProps) => ReactElement> = {
  crossed: Crossed,
  chat: Chat,
  split: Split,
  quote: Quote,
};

export default withRevealScope(defineSection({
  type: "problem",
  label: "Problem",
  labelFr: "Problème",
  category: "story",
  description: "The everyday pains the product ends — struck through, chatted, split or quoted — then the turn to the product.",
  variants: [
    {
      id: "crossed",
      label: "Struck through",
      description: "A redline ledger: each pain struck by a clean animated line, its fix written in underneath; it ends on the one line left standing, with the product inset in the type.",
      archetypes: [],
    },
    {
      id: "chat",
      label: "Ledger",
      description: "A two-column ledger on hairlines: each pain beside the product's answer, then the one line that names the product.",
      archetypes: ["playground", "hearth", "bloom", "souk"],
    },
    {
      id: "split",
      label: "Without / With",
      description: "A muted panel of pains against a vivid panel of fixes, bridged by a half-desaturated product photo.",
      archetypes: ["kinetic", "circuit", "garage", "apothecary"],
    },
    {
      id: "quote",
      label: "Statement",
      description: "One huge statement in the shopper's words with a highlight block on the key words, answered by a raised product card.",
      archetypes: ["editorial", "maison"],
    },
  ],
  schema,
  defaults: ({ locale, product, rng }): ProblemData => {
    const lang = copyLang(locale);
    const c = COMMON[lang];
    // a garment's pains are about fabric, cut and size, never the jewelry ones of "style"
    const garment = garmentOf(product);
    const f = garment ? garmentProblem(lang, garment) : FAMILY_COPY[familyOf(product.category)][lang];
    const vars = { name: product.name, short: shortName(product.name) };
    return {
      kicker: pick(rng, c.kickers),
      title: pick(rng, c.titles),
      lead: c.lead,
      pains: f.pains.map(([text, fix]) => ({ text, fix })),
      solution: fill(pick(rng, f.solutions), vars),
      note: pick(rng, c.notes),
      quote: f.quote,
      quoteCite: c.cite,
      withoutLabel: c.without,
      withLabel: c.with,
      cta: true,
      ctaLabel: "",
    };
  },
  fields: [
    {
      kind: "group",
      label: "Heading",
      fields: [
        { kind: "text", path: "kicker", label: "Kicker", max: 60, help: "Small label above the title, e.g. “Le problème”." },
        { kind: "text", path: "title", label: "Title", max: 140, help: "Wrap one or two words in *asterisks* to emphasize them." },
        { kind: "textarea", path: "lead", label: "Intro line", max: 280, rows: 2 },
      ],
    },
    {
      kind: "list",
      path: "pains",
      label: "Pains",
      itemLabel: "Pain",
      titlePath: "text",
      min: 2,
      max: 5,
      item: [
        { kind: "text", path: "text", label: "Pain — what the shopper lives today", max: 120, help: "A concrete moment, not an adjective: “La peau qui tiraille dès 11 h”." },
        { kind: "text", path: "fix", label: "Fix — what changes with the product", max: 120, help: "Written under the struck pain (Struck through) and facing it (Without / With)." },
      ],
      newItem: () => ({ text: "", fix: "" }),
    },
    {
      kind: "group",
      label: "The turn",
      fields: [
        { kind: "text", path: "solution", label: "Solution line", max: 200, help: "One line that names the product. Put the name in *asterisks* to emphasize it." },
        { kind: "text", path: "note", label: "Turn label", max: 40, help: "Short label before the solution (the shop's first reply in Chat, a glass chip on the photo in Statement), e.g. “Fini, tout ça.”" },
        { kind: "image", path: "image", label: "Product photo", help: "Used by every layout. Defaults to the product cutout or photos." },
        { kind: "toggle", path: "cta", label: "Show the order button" },
        { kind: "text", path: "ctaLabel", label: "Button label", max: 60, help: "Leave empty for the default order label." },
      ],
    },
    {
      kind: "group",
      label: "Statement layout",
      fields: [
        { kind: "textarea", path: "quote", label: "Statement", max: 240, rows: 3, help: "The pain in the shopper's own words. *Asterisks* get the highlight block." },
        { kind: "text", path: "quoteCite", label: "Caption under the statement", max: 80 },
      ],
    },
    {
      kind: "group",
      label: "Without / With layout",
      fields: [
        { kind: "text", path: "withoutLabel", label: "“Without” panel title", max: 40 },
        { kind: "text", path: "withLabel", label: "“With” panel title", max: 40, help: "The product name is added next to it." },
      ],
    },
  ],
  render: ({ id, variant, bg, data, ctx }: SectionProps<ProblemData>): ReactElement => {
    const titleId = `${id}-title`;
    const View = VIEWS[variant] ?? Crossed;
    return (
      <SectionShell id={id} ctx={ctx} type="problem" variant={VIEWS[variant] ? variant : "crossed"} bg={bg} labelledBy={titleId}>
        <View ctx={ctx} data={data} id={id} bg={bg} titleId={titleId} />
      </SectionShell>
    );
  },
}));
