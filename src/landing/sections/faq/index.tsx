/**
 * FAQ — the questions every COD shopper asks before ordering (payment, delivery, inspecting the
 * parcel, exchanges) plus the product's own, answered in the brand's voice:
 *  accordion  a hairline list of big questions; the open one lifts into a raised card, +/− morph
 *  two-col    sticky heading + question index beside article-like answers, a reading rail that fills
 *  chat       a brand messenger: question bubbles, answers that arrive typing, a composer that
 *             opens WhatsApp
 * Every variant closes with "still a question?" on the store's channel (WhatsApp, else phone).
 * Views live in their own files; this one holds the definition (defaults, inspector, render).
 */
import type { ReactElement, ReactNode } from "react";
import { SectionShell } from "@/landing/primitives";
import { defineSection, type SectionProps } from "../../types";
import { Accordion } from "./accordion";
import { Chat } from "./chat";
import { typoDeep } from "../guarantee/model";
import { faqDefaults } from "./copy";
import type { ViewProps } from "./parts";
import { schema, type Data } from "./schema";
import { TwoCol } from "./two-col";
import { withRevealScope } from "../reveal-scope";

const VIEWS: Record<string, (p: ViewProps) => ReactNode> = {
  accordion: Accordion,
  "two-col": TwoCol,
  chat: Chat,
};

export default withRevealScope(defineSection({
  type: "faq",
  label: "FAQ",
  labelFr: "Questions fréquentes",
  category: "info",
  description: "Answers to what shoppers ask before ordering — payment, delivery, checking the parcel, exchanges, usage — with a contact button.",
  variants: [
    {
      id: "accordion",
      label: "Accordion",
      description: "Big questions on hairlines; the open one lifts into a raised card while its answer eases open.",
    },
    {
      id: "two-col",
      label: "Two columns",
      description: "Sticky heading and question index beside every answer, open; a reading rail fills as you scroll.",
      archetypes: ["maison", "apothecary", "circuit", "editorial", "field", "garage"],
    },
    {
      id: "chat",
      label: "Chat",
      description: "A brand messenger: question bubbles, answers that arrive typing, a composer that opens WhatsApp.",
      archetypes: ["souk", "playground", "hearth", "bloom", "kinetic"],
    },
  ],
  schema,
  defaults: ({ locale, product, offers, rng }) => faqDefaults({ locale, product, offers, rng }),
  fields: [
    {
      kind: "group",
      label: "Heading",
      fields: [
        { kind: "text", path: "kicker", label: "Kicker", max: 60, placeholder: "Questions fréquentes" },
        { kind: "text", path: "title", label: "Title", max: 140, help: "Wrap a word in *asterisks* to emphasize it." },
        { kind: "textarea", path: "lead", label: "Intro line", max: 280, rows: 2, help: "Leave empty to hide." },
      ],
    },
    {
      kind: "list",
      path: "items",
      label: "Questions",
      itemLabel: "Question",
      titlePath: "q",
      min: 1,
      max: 10,
      item: [
        {
          kind: "text",
          path: "q",
          label: "Question",
          max: 160,
          placeholder: "Puis-je vérifier le colis avant de payer ?",
          help: "Write it the way a shopper would ask it.",
        },
        {
          kind: "textarea",
          path: "a",
          label: "Answer",
          max: 700,
          rows: 4,
          help: "Two or three short sentences. Start a line with “- ” for a bullet; **bold** works.",
        },
      ],
      newItem: () => ({ q: "", a: "" }),
    },
    {
      kind: "toggle",
      path: "openFirst",
      label: "Open the first answer",
      help: "Accordion only. One answer is open at a time.",
    },
    {
      kind: "group",
      label: "Contact line",
      fields: [
        {
          kind: "toggle",
          path: "help",
          label: "Show “Still a question?”",
          help: "Opens WhatsApp with a question about the product (else calls the store phone). Hidden when Settings → Store has neither.",
        },
        { kind: "text", path: "helpTitle", label: "Title", max: 80, placeholder: "Une autre question ?" },
        { kind: "text", path: "helpText", label: "Text", max: 160 },
        { kind: "text", path: "helpLabel", label: "Button label", max: 40, help: "Leave empty for “Écrire sur WhatsApp” (or “Appeler”)." },
      ],
    },
    {
      kind: "toggle",
      path: "sample",
      label: "Example answers",
      help: "On while these are the default answers. Check delivery times, cities and the exchange window against your real policy, then switch it off.",
    },
  ],
  render: ({ id, variant, bg, data, ctx }: SectionProps<Data>): ReactElement => {
    const titleId = `${id}-title`;
    const View = VIEWS[variant] ?? Accordion;
    return (
      <SectionShell id={id} ctx={ctx} type="faq" variant={variant} bg={bg} labelledBy={titleId}>
        <View ctx={ctx} data={typoDeep(ctx.locale, data)} id={id} titleId={titleId} />
      </SectionShell>
    );
  },
}));
