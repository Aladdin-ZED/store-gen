/**
 * Reviews — customer voices, four modern compositions:
 *  wall      bento: lead quote + color score tile with the product, then a bento of wide/narrow cards
 *            (a swipe rail on phones)
 *  carousel  one large quote at a time on a raised panel; the reviewers' faces are the pagination
 *  summary   honest review module: gauge ring score, real distribution bars, the product, feed of the
 *            best reviews
 *  notes     "stack": a swipeable deck of cards with depth (variant id kept for saved pages)
 * Reviews are merchant content: defaults are product-aware samples flagged `sample: true`.
 */
import { defineSection } from "../../types";
import { Carousel } from "./carousel";
import { defaults, schema } from "./model";
import { Stack } from "./stack";
import { Summary } from "./summary";
import { Wall } from "./wall";
import { withRevealScope } from "../reveal-scope";

const RENDER = { wall: Wall, carousel: Carousel, summary: Summary, notes: Stack } as const;

const def = defineSection({
  type: "reviews",
  label: "Reviews",
  labelFr: "Avis clients",
  category: "proof",
  description: "Customer reviews: bento wall, one big quote at a time, honest score summary, or a swipeable card stack.",
  variants: [
    {
      id: "wall",
      label: "Bento wall",
      description: "Lead quote beside a color score tile with the product, then a bento of review cards (a swipe rail on phones).",
    },
    {
      id: "carousel",
      label: "Big quote",
      description: "One large quote at a time on a raised panel; the reviewers' faces (progress segments on phones) navigate.",
      archetypes: ["maison", "editorial", "bloom", "kinetic"],
    },
    {
      id: "summary",
      label: "Score summary",
      description: "Gauge-ring score, real star distribution and the product beside a clean feed of the best reviews.",
      archetypes: ["circuit", "apothecary", "field", "garage"],
    },
    {
      id: "notes",
      label: "Card stack",
      description: "A swipeable deck of review cards with depth: the next cards wait fanned out behind the top one.",
      archetypes: ["playground", "hearth", "bloom", "souk"],
    },
  ],
  schema,
  defaults: (input) => defaults(input),
  fields: [
    {
      kind: "group",
      label: "Heading",
      fields: [
        { kind: "text", path: "kicker", label: "Kicker", max: 60 },
        { kind: "text", path: "title", label: "Title", max: 140, help: "Wrap one or two words in *stars* to emphasize them." },
        { kind: "textarea", path: "lead", label: "Intro", max: 260, rows: 2 },
      ],
    },
    {
      kind: "list",
      path: "items",
      label: "Reviews",
      itemLabel: "Review",
      titlePath: "name",
      min: 1,
      max: 12,
      newItem: () => ({ name: "", city: "", date: "", rating: 5, title: "", text: "", detail: "", verified: true }),
      item: [
        { kind: "text", path: "name", label: "Customer name", max: 40, help: "First name + initial, e.g. “Salma B.” — ask the customer before publishing it." },
        { kind: "text", path: "city", label: "City", max: 40 },
        { kind: "text", path: "date", label: "Date", max: 32, placeholder: "Il y a 3 jours" },
        { kind: "number", path: "rating", label: "Stars", min: 1, max: 5, step: 1 },
        { kind: "text", path: "title", label: "Review title", max: 80, placeholder: "Livré en 36 h" },
        { kind: "textarea", path: "text", label: "Review", max: 520, rows: 4, help: "Paste it as the customer wrote it." },
        { kind: "image", path: "photo", label: "Customer photo", help: "A photo the customer sent you (optional) — shown in a rounded frame." },
        { kind: "text", path: "detail", label: "What they bought", max: 60, placeholder: "Commande : Pack Duo" },
        { kind: "toggle", path: "verified", label: "Verified purchase", help: "Only for customers whose order was delivered." },
      ],
    },
    {
      kind: "group",
      label: "Score",
      fields: [
        {
          kind: "toggle",
          path: "showSummary",
          label: "Show the score",
          help: "Uses the product rating when you set one (Product → Rating), otherwise the average of the reviews above, labeled as such.",
        },
        {
          kind: "group",
          label: "Real star counts (Score summary bars)",
          fields: [
            { kind: "number", path: "breakdown.five", label: "5 stars", min: 0, step: 1 },
            { kind: "number", path: "breakdown.four", label: "4 stars", min: 0, step: 1 },
            { kind: "number", path: "breakdown.three", label: "3 stars", min: 0, step: 1 },
            { kind: "number", path: "breakdown.two", label: "2 stars", min: 0, step: 1 },
            {
              kind: "number",
              path: "breakdown.one",
              label: "1 star",
              min: 0,
              step: 1,
              help: "Copy these from your real reviews. Left at 0, the bars only appear when the score is the average of the reviews shown.",
            },
          ],
        },
      ],
    },
    { kind: "text", path: "cta", label: "Button under the reviews", max: 60, help: "Leave empty to hide the button." },
    {
      kind: "toggle",
      path: "sample",
      label: "Example reviews",
      help: "On while these are sample texts. Replace them with real customer reviews, then switch it off.",
    },
  ],
  // called as a function (not <View/>) so the returned root element is the view's SectionShell, which
  // the renderer absorbs into the page's single section root (a <View/> element would nest a second
  // padded <section> inside the page's own)
  render: (props) => (RENDER[props.variant as keyof typeof RENDER] ?? Wall)(props),
});

export default withRevealScope(def);
