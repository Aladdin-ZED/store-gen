/**
 * Comparison — why order this product here rather than elsewhere, criterion by criterion. Three
 * modern views of the same rows:
 *  table      criteria · ours · theirs; our column one raised, lit card with the product breaking
 *             out of its top edge, checks drawing on down the column
 *  versus     a vivid card for us and a quiet, lower card for the alternatives, split by a VS disc
 *  checklist  a ledger: our answer large and checked, the alternative's struck through beneath it
 */
import type { ReactElement } from "react";
import { SectionShell } from "@/landing/primitives";
import { defineSection, type SectionProps } from "../../types";
import { copyLang, familyOf, fill, pick, shortName } from "../benefits/kit";
import { nameFitsTitle, typoDeep } from "../guarantee/model";
import { Checklist } from "./checklist";
import { garmentOf } from "../garment";
import { COMMON, FAMILY_ROWS, garmentRows } from "./copy";
import { schema, type ComparisonData, type ViewProps } from "./model";
import { Table } from "./table";
import { Versus } from "./versus";
import { withRevealScope } from "../reveal-scope";

const VIEWS: Record<string, (p: ViewProps) => ReactElement> = {
  table: Table,
  versus: Versus,
  checklist: Checklist,
};

export default withRevealScope(defineSection({
  type: "comparison",
  label: "Comparison",
  labelFr: "Comparatif",
  category: "story",
  description: "Why order here rather than elsewhere, point by point — as a lit table, a versus duel or a struck-through checklist.",
  variants: [
    {
      id: "table",
      label: "Table",
      description: "Criteria, ours and theirs in a clean grid; our column is a raised, glowing card with the product on top.",
      archetypes: ["maison", "souk", "circuit", "hearth", "bloom", "apothecary"],
    },
    {
      id: "versus",
      label: "Versus",
      description: "A vivid card for us against a quiet card for the alternatives, split by a VS disc that pops in.",
      archetypes: ["kinetic", "playground", "garage", "souk", "hearth"],
    },
    {
      id: "checklist",
      label: "Checklist",
      description: "Our answers checked in large type, the alternatives' struck through beneath them, beside the product photo.",
      archetypes: ["apothecary", "field", "editorial", "maison", "bloom"],
    },
  ],
  schema,
  defaults: ({ locale, product, rng }): ComparisonData => {
    const lang = copyLang(locale);
    const c = COMMON[lang];
    // a garment compares fabric and fit, never gift boxes and plastic pouches
    const garment = garmentOf(product);
    const fam = garment ? garmentRows(lang, garment) : FAMILY_ROWS[familyOf(product.category)][lang];
    const vars = { name: product.name, short: shortName(product.name) };
    return {
      kicker: pick(rng, c.kickers),
      // a {short} title only when the name reads well in the page's own display type
      title: fill(pick(rng, nameFitsTitle(lang, vars.short) ? c.titles : c.titles.filter((t) => !t.includes("{short}"))), vars),
      lead: pick(rng, c.leads),
      usLabel: c.us,
      themLabel: c.them,
      rows: [...fam, ...c.rows].map((r) => ({ label: r.label, us: r.us, them: r.them, partial: !!r.partial })),
      vs: "VS",
      note: c.note,
      cta: true,
      ctaLabel: "",
    };
  },
  fields: [
    {
      kind: "group",
      label: "Heading",
      fields: [
        { kind: "text", path: "kicker", label: "Kicker", max: 60, help: "Small label above the title, e.g. “Comparatif”." },
        { kind: "text", path: "title", label: "Title", max: 140, help: "Wrap one or two words in *asterisks* to emphasize them." },
        { kind: "textarea", path: "lead", label: "Intro line", max: 240, rows: 2 },
      ],
    },
    {
      kind: "group",
      label: "The two sides",
      fields: [
        { kind: "text", path: "usLabel", label: "Our side", max: 40, help: "Header of our column / card, e.g. “Chez nous”." },
        { kind: "text", path: "themLabel", label: "The alternatives", max: 40, help: "Header of the other side, e.g. “Ailleurs”. Compare with a kind of product, never a named brand." },
        { kind: "image", path: "image", label: "Our side's photo", help: "Defaults to the product cutout or photos." },
        { kind: "text", path: "vs", label: "Versus disc text", max: 6, help: "Shown in the Versus layout only. Leave empty to hide the disc." },
      ],
    },
    {
      kind: "list",
      path: "rows",
      label: "Criteria",
      itemLabel: "Criterion",
      titlePath: "label",
      min: 3,
      max: 7,
      item: [
        { kind: "text", path: "label", label: "Criterion", max: 60, help: "What is compared, in one or two words: “Texture”, “Paiement”." },
        { kind: "text", path: "us", label: "Ours", max: 80, help: "What the shopper gets here. Short and concrete. Empty = the check mark alone." },
        { kind: "text", path: "them", label: "Theirs", max: 80, help: "What the usual alternative gives. Stay factual. Empty = the cross alone." },
        { kind: "toggle", path: "partial", label: "Alternatives do it partly", help: "Shows a half mark instead of a cross (and no strike-through)." },
      ],
      newItem: () => ({ label: "", us: "", them: "", partial: false }),
    },
    {
      kind: "group",
      label: "Closing",
      fields: [
        { kind: "toggle", path: "cta", label: "Show the order button" },
        { kind: "text", path: "ctaLabel", label: "Button label", max: 60, help: "Leave empty for the default order label." },
        { kind: "text", path: "note", label: "Footnote", max: 160, help: "Say what you compare with, e.g. “Comparé aux alternatives génériques les plus courantes.”" },
      ],
    },
  ],
  render: ({ id, variant, bg, data, ctx }: SectionProps<ComparisonData>): ReactElement => {
    const titleId = `${id}-title`;
    const known = !!VIEWS[variant];
    const View = VIEWS[variant] ?? Table;
    return (
      <SectionShell id={id} ctx={ctx} type="comparison" variant={known ? variant : "table"} bg={bg} labelledBy={titleId}>
        <View ctx={ctx} data={typoDeep(ctx.locale, data)} id={id} bg={bg} titleId={titleId} />
      </SectionShell>
    );
  },
}));
