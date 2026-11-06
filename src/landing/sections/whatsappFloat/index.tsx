/**
 * WhatsApp float — a direct line to the shop (floating, singleton). One gesture for both variants:
 * a vivid disc (WhatsApp green re-lit in the theme's hue) is the seed and liquid glass grows out of it.
 *  - bubble — the disc in a glass bezel. On hover / keyboard focus, and once per page view a few
 *             seconds after it shows, the disc "types" (three dots) and the bezel grows sideways
 *             into a glass capsule that unveils the line;
 *  - tab    — a slim glass pill floating just off the page edge: the disc on top, the glass runs
 *             down from it with the line set vertically; it leans toward the page under the pointer.
 *             Arabic is never rotated or set vertically (RTL3, design.md DES-§4.5.4): on an ar page the
 *             tab is a horizontal pill, the disc at the inline start and the line beside it.
 * Number: the form's WhatsApp setting, else the store's (./wa.ts). No number → renders nothing.
 * With a sticky order bar on the page: phones show the float together with the bar (never over the
 * hero button or the form), and up to wide screens the bubble glides above the bar while it is shown.
 */
import type { ReactElement } from "react";
import { z } from "zod";
import { Icon, RichText, cx, plainText } from "../../primitives";
import { holdRanges } from "../orderForm/text";
import { defineSection, type DefaultsInput, type SectionProps } from "../../types";
import { inLocale, questionMessage, whatsappHref, whatsappNumber } from "./wa";
import { withRevealScope } from "../reveal-scope";

const schema = z.object({
  /** visible line; empty → the kit's "Une question ? Écrivez-nous" */
  label: z.string().max(60).default(""),
  /** prefilled WhatsApp message; empty → a greeting that names the product */
  message: z.string().max(200).default(""),
  side: z.enum(["end", "start"]).default("end"),
  /** disc color: WhatsApp green (the page's success green), the page accent, or ink */
  tone: z.enum(["green", "accent", "ink"]).default("green"),
  /** bubble: open once by itself a few seconds after the page loads */
  peek: z.boolean().default(true),
  /**
   * tab: a shorter line for the tab (P6 DESIGN, design.md DES-§4.5.4; optional with no default, so a saved page keeps
   * its checksum); absent → the visible line above
   */
  tabLabel: z.string().max(30).optional(),
});
type Data = z.infer<typeof schema>;

/** Short lines that fit the capsule on one line and the tab vertically (≤ 30 characters). */
const LINES = [
  { ar: "عندك سؤال؟ كتب لينا", fr: "Une question ? Écrivez-nous", en: "Questions? Message us" },
  { ar: "سولنا على واتساب", fr: "On vous répond sur WhatsApp", en: "Ask us on WhatsApp" },
  { ar: "محتار؟ تواصل معنا", fr: "Un doute ? Parlons-en", en: "Not sure? Talk to us" },
] as const;

/** French typography: a no-break space (U+00A0) before ? ! : ; » so the mark never starts a line. */
const NBSP = String.fromCharCode(0xa0);
const frenchSpaces = (s: string): string => s.replace(/ +([?!:;»])/g, `${NBSP}$1`);

function defaults({ locale, rng }: DefaultsInput): Data {
  const line = LINES[Math.min(LINES.length - 1, Math.floor(rng() * LINES.length))]!;
  return { label: inLocale(locale, line), message: "", side: "end", tone: "green", peek: true };
}

function render({ id, variant, bg, data, ctx }: SectionProps<Data>): ReactElement | null {
  const number = whatsappNumber(ctx);
  if (!number) return null;
  const v = variant === "tab" ? "tab" : "bubble";
  // one plain line (no *markup* in a floating chip); French gets its no-break space before ? !
  const line = (v === "tab" ? plainText(data.tabLabel ?? "") : "") || plainText(data.label) || ctx.t("whatsapp.float");
  const label = ctx.locale === "fr" ? frenchSpaces(line) : line;
  const href = whatsappHref(number, data.message.trim() || questionMessage(ctx.locale, ctx.product.name));

  // a number range stays one unbroken run, and never reads "18–9" on Arabic pages (RichText isolates)
  const text = (
    <RichText as="span" className="lp-wa__text" text={holdRanges(ctx, label)} ctx={ctx} decorate={false} editPath={v === "tab" && data.tabLabel?.trim() ? "tabLabel" : "label"} />
  );
  const disc = (
    <span className="lp-wa__disc" aria-hidden="true">
      <Icon name="whatsapp" size="1em" strokeWidth={1.8} />
      {v === "bubble" ? (
        <span className="lp-wa__dots">
          <i />
          <i />
          <i />
        </span>
      ) : null}
    </span>
  );
  // the line is the link's name; "WhatsApp" tells screen-reader users where it goes
  const where = <span className="lp-visually-hidden"> · WhatsApp</span>;

  return (
    <div
      className={cx("lp-wa", `lp-wa--${v}`)}
      data-sid={id}
      data-section="whatsappFloat"
      data-variant={v}
      data-bg={bg}
      data-side={data.side}
      data-tone={data.tone}
      data-peek={v === "bubble" && data.peek ? "" : undefined}
    >
      {v === "tab" ? (
        <a className="lp-wa__tab" href={href} target="_blank" rel="noopener noreferrer">
          <span className="lp-wa__skin" aria-hidden="true" />
          {disc}
          <span className="lp-wa__col">{text}</span>
          {where}
        </a>
      ) : (
        <a className="lp-wa__cap" href={href} target="_blank" rel="noopener noreferrer">
          <span className="lp-wa__skin" aria-hidden="true" />
          <span className="lp-wa__line">
            <span className="lp-wa__say">{text}</span>
          </span>
          {disc}
          {where}
        </a>
      )}
    </div>
  );
}

export default withRevealScope(defineSection({
  type: "whatsappFloat",
  label: "WhatsApp button",
  labelFr: "Bouton WhatsApp",
  category: "floating",
  description:
    "A floating WhatsApp contact with a prefilled message. Hidden when no number is set. On phones it appears with the sticky order bar, so it never covers the hero button or the form.",
  singleton: true,
  variants: [
    {
      id: "bubble",
      label: "Bubble",
      description: "Disc in a glass bezel that morphs into a capsule with your line — on hover, and once by itself.",
    },
    {
      id: "tab",
      label: "Side tab",
      description: "Slim glass pill on the page edge: the disc on top, your line set vertically below it (a horizontal pill on Arabic pages).",
      archetypes: ["editorial", "maison"],
    },
  ],
  schema,
  defaults,
  fields: [
    {
      kind: "group",
      label: "Message",
      fields: [
        {
          kind: "text",
          path: "label",
          label: "Line",
          max: 60,
          placeholder: "Une question ? Écrivez-nous",
          help: "Keep it short (about 30 characters). Empty = the default line. The number comes from the form's WhatsApp setting, else Settings → Store.",
        },
        {
          kind: "text",
          path: "tabLabel",
          label: "Shorter line for the side tab",
          max: 30,
          help: "Side tab only. Empty = the line above. On Arabic pages the tab is a horizontal pill, so a few words read best.",
        },
        {
          kind: "textarea",
          path: "message",
          label: "Prefilled message",
          max: 200,
          rows: 2,
          help: "What the shopper's WhatsApp opens with. Empty = a greeting that names the product.",
        },
      ],
    },
    {
      kind: "group",
      label: "Look & placement",
      fields: [
        {
          kind: "select",
          path: "tone",
          label: "Button color",
          options: [
            { value: "green", label: "WhatsApp green (recommended)" },
            { value: "accent", label: "Page accent" },
            { value: "ink", label: "Ink (monochrome)" },
          ],
          help: "Green is recognized at a glance; it is tuned to the page so it stays legible.",
        },
        {
          kind: "select",
          path: "side",
          label: "Side",
          options: [
            { value: "end", label: "End (right in French, left in Arabic)" },
            { value: "start", label: "Start (left in French, right in Arabic)" },
          ],
          help: "Pick the side that does not cover your page's key content.",
        },
        {
          kind: "toggle",
          path: "peek",
          label: "Show the line once by itself",
          help: "Bubble only: a few seconds after the page opens, the button shows its line, then tucks it away.",
        },
      ],
    },
  ],
  render,
}));
