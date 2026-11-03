/**
 * Trust bar — the strip right under the hero that answers the COD shopper's real questions before
 * they scroll: how do I pay, when does it arrive, can I check it, what if it is wrong. Real claims
 * only (free delivery is claimed only when it is true). Four modern compositions: see ./views.tsx.
 */
import type { ReactElement, ReactNode } from "react";
import { plainText, SectionShell } from "@/landing/primitives";
import { defineSection, type FieldSpec, type SectionProps } from "../../types";
import { defaultCopy } from "./copy";
import { claimsOf, schema, type Data, type ViewProps } from "./model";
import { Chips, Ledger, ownsBand, Ribbon } from "./views";
import { withRevealScope } from "../reveal-scope";

const VIEWS: Record<string, (p: ViewProps) => ReactNode> = {
  chips: Chips,
  ledger: Ledger,
  ribbon: Ribbon,
};

/**
 * Saved variants redrawn as another (design.md DES-§5.13 S8; owner rule 2): `stamps` (medals with ring text) left every
 * pool and renders as the `chips` row, so the page ships the chips stylesheet and no stamp shape.
 */
const REDRAWN: Readonly<Record<string, string>> = { stamps: "chips" };

const fields: FieldSpec[] = [
  {
    kind: "list",
    path: "items",
    label: "Promises",
    itemLabel: "Promise",
    titlePath: "title",
    min: 2,
    max: 5,
    item: [
      { kind: "icon", path: "icon", label: "Icon" },
      {
        kind: "text",
        path: "title",
        label: "Promise",
        max: 60,
        help: "Short and true for every order: payment on delivery, delivery time, checking the parcel, exchange. Say “free” only if it really is.",
      },
      {
        kind: "text",
        path: "detail",
        label: "Detail line",
        max: 90,
        help: "Optional second line that makes it concrete, e.g. “You pay the courier in cash.” Shown by the dock, badges and columns where there is room.",
      },
      {
        kind: "text",
        path: "badge",
        label: "Badge ring text",
        max: 28,
        placeholder: "Cash on delivery",
        help: "Badges only: the few words running around the ring (arched over the badge in Arabic). Empty = the promise itself. Keep it under ~24 characters.",
      },
    ],
    newItem: () => ({ icon: "check", title: "", detail: "", badge: "" }),
  },
  {
    kind: "group",
    label: "Heading",
    fields: [
      {
        kind: "text",
        path: "title",
        label: "Heading",
        max: 80,
        help: "Names the strip for screen readers. *Word* gets the theme's emphasis when the heading is shown.",
      },
      { kind: "toggle", path: "showTitle", label: "Show the heading", help: "Off keeps the strip compact; the heading is still read aloud." },
    ],
  },
  {
    kind: "group",
    label: "Ribbon",
    fields: [
      {
        kind: "select",
        path: "speed",
        label: "Scroll speed",
        options: [
          { value: "auto", label: "Match the page style" },
          { value: "slow", label: "Calm" },
          { value: "normal", label: "Normal" },
          { value: "fast", label: "Lively" },
        ],
        help: "Ribbon only. The first promise stays pinned; the others slide by, pause on hover and stay still for visitors who reduce motion.",
      },
    ],
  },
];

export default withRevealScope(defineSection({
  type: "trustBar",
  label: "Trust bar",
  labelFr: "Bandeau confiance",
  category: "proof",
  description: "The COD promises right under the hero: pay on delivery, fast delivery, check before paying, easy exchange.",
  variants: [
    {
      id: "chips",
      label: "Glass dock",
      description: "One frosted capsule on product light, a segment per promise; an accent thumb marks the lead and glides under the pointer.",
      archetypes: ["apothecary", "playground", "circuit", "hearth", "bloom", "field", "garage", "maison", "souk", "kinetic"],
    },
    {
      id: "stamps",
      label: "Badges (shown as the capsule row)",
      description: "Kept for saved pages: it now shows as the frosted capsule row, without medals or ring text.",
      archetypes: ["souk", "playground", "hearth", "field", "bloom"],
    },
    {
      id: "ledger",
      label: "Columns",
      description: "Swiss, precise columns divided by hairlines, with big thin icons and small tracked labels; a clean list on phones.",
      archetypes: ["maison", "apothecary", "circuit", "editorial", "garage"],
    },
    {
      id: "ribbon",
      label: "Ribbon",
      description: "A color band: the lead promise pinned as a capsule, the others sliding under it; tilted a touch on playful pages.",
      archetypes: ["kinetic", "playground", "garage"],
    },
  ],
  schema,
  defaults: ({ locale, product, items, offers, rng }): Data => {
    const copy = defaultCopy(locale, product, offers, rng, items[0]);
    return { title: copy.title, showTitle: false, items: copy.items, speed: "auto" };
  },
  fields,
  render: ({ id, variant, bg, data, ctx }: SectionProps<Data>): ReactElement | null => {
    const claims = claimsOf(data);
    if (!claims.length) return null;
    const saved = REDRAWN[variant] ?? variant;
    const kind = VIEWS[saved] ? saved : "chips";
    const View = VIEWS[kind]!;
    const titleId = data.title.trim() ? `${id}-title` : undefined;
    return (
      <SectionShell
        id={id}
        ctx={ctx}
        type="trustBar"
        variant={kind}
        bg={bg}
        // a floating ribbon runs past the panel edge to the screen edges (boundary-crossing moment)
        className={kind === "ribbon" && !ownsBand(bg) ? "lp-section--bleed" : undefined}
        labelledBy={titleId}
        label={titleId ? undefined : plainText(claims[0]!.title)}
      >
        <View id={id} bg={bg} ctx={ctx} data={data} claims={claims} titleId={titleId} />
      </SectionShell>
    );
  },
}));
