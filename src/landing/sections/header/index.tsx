/**
 * Header — the store's name set like a brand, never a nav bar: a landing page has one job, so there
 * are no menu links, only the order button (with the live price beside it on wider screens) and an
 * optional WhatsApp / phone shortcut.
 *
 *  - `minimal` ("island"): wordmark at the start, a buy cluster at the end. At the top of the page it
 *    sits flush on the page color; as the page scrolls it condenses into a floating frosted capsule
 *    inset from the edges (concentric with the button, a light rim along its top edge), the wordmark
 *    eases inward and a hairline along the capsule's foot fills with the accent as the page is read.
 *  - `centered` ("masthead"): the tagline as a small eyebrow above a large centered wordmark; the
 *    order button is a round bag button on phones. Once scrolled the eyebrow slides away under the
 *    top edge, the wordmark condenses and a full-bleed glass band settles behind it, the same reading
 *    hairline running along its foot.
 *  - `none`: no header.
 *
 * Buy cluster: the starting price ("À partir de 149 DH" — the cheapest offer, the same figure the
 * hero shows) sits in a tinted pill that the order button closes, so price and action read as one
 * control. Phones show the button alone.
 *
 * Scroll states are CSS scroll-driven animations (progressive): engines without scroll timelines
 * (and reduced motion) show the settled glass state from the start. Sticky roots are detected by
 * the runtime through `.lp-header` (position sticky), so CTA jumps land below the bar.
 */
import type { ReactElement } from "react";
import { z } from "zod";
import { everyOfferFree, fromCents } from "@/lib/page/pricing";
import { offerViews } from "../../offers/model";
import type { SectionBg } from "@/lib/page/schema";
import { ARCHETYPE_DEFS } from "@/lib/theme/archetypes";
import { createT } from "../../i18n";
import { Cta, cx, Icon, Money, Ornament, Picture, reveal, RichText, SectionShell } from "../../primitives";
import { defineSection, type DefaultsInput, type FieldSpec, type Locale, type RenderContext } from "../../types";
import { withRevealScope } from "../reveal-scope";

const Schema = z.object({
  /** short trust line: eyebrow above the centered wordmark; a small note in the minimal bar on wide screens */
  tagline: z.string().max(60).default(""),
  /** order button label — empty → the built-in "Commander" / "اطلب الآن" */
  ctaLabel: z.string().max(32).default(""),
  showCta: z.boolean().default(true),
  /** "from" price next to the button (tablets & computers) */
  showPrice: z.boolean().default(true),
  /** quick contact link next to the button, shown only when the store has that number */
  contact: z.enum(["none", "whatsapp", "phone"]).default("none"),
  /** keep the header on screen while scrolling (glass state) */
  sticky: z.boolean().default(true),
});

type Data = z.infer<typeof Schema>;

const fields: FieldSpec[] = [
  {
    kind: "text",
    path: "tagline",
    label: "Tagline",
    max: 60,
    placeholder: "Paiement à la livraison",
    help: "One short, true line (shown on one line). Centered: above the name. Minimal: in the middle of the bar on computers. Hidden while an announcement bar opens the page — it already carries your promises.",
  },
  {
    kind: "group",
    label: "Order button",
    fields: [
      { kind: "toggle", path: "showCta", label: "Show the order button", help: "Scrolls to the order form. In the Centered header it is a round bag button on phones." },
      { kind: "text", path: "ctaLabel", label: "Button label", max: 32, placeholder: "Commander", help: "Keep it to one or two words so it fits next to the name on small phones." },
      {
        kind: "toggle",
        path: "showPrice",
        label: "Show the starting price",
        help: "Tablets and computers: “À partir de 149 DH” (your cheapest offer) sits beside the button.",
      },
    ],
  },
  {
    kind: "group",
    label: "Contact & behavior",
    fields: [
      {
        kind: "select",
        path: "contact",
        label: "Contact shortcut",
        options: [
          { value: "none", label: "None" },
          { value: "whatsapp", label: "WhatsApp" },
          { value: "phone", label: "Phone call" },
        ],
        help: "A small round icon button. Uses the number from Settings → Store and hides itself when that number is missing.",
      },
      {
        kind: "toggle",
        path: "sticky",
        label: "Stay on screen while scrolling",
        help: "The header follows the visitor as a frosted glass bar, so the order button is always one tap away.",
      },
    ],
  },
];

/* ------------------------------------------------------------------ */
/* Default copy                                                        */
/* ------------------------------------------------------------------ */

/** ar · fr · en are written; other page languages fall back to English. */
type Lines = Record<"ar" | "fr" | "en", readonly string[]>;
const lang = (l: Locale): keyof Lines => (l === "ar" || l === "fr" ? l : "en");

/** COD-first trust lines; the free-delivery line only when delivery really is free for every order. */
const TAGLINES: Lines = {
  fr: ["Paiement à la livraison", "Vous payez à la réception", "Livré chez vous · payé à la porte"],
  ar: ["الدفع عند الاستلام", "تخلّص غير ملي توصلك الطلبية", "توصيل لباب الدار · الدفع عند الاستلام"],
  en: ["Cash on delivery", "Pay when it arrives", "Delivered to your door · pay on arrival"],
};

const TAGLINES_FREE: Lines = {
  fr: ["Livraison offerte · paiement à la réception"],
  ar: ["توصيل مجاني · الدفع عند الاستلام"],
  en: ["Free delivery · pay on arrival"],
};

function defaults({ locale, offers, rng }: DefaultsInput): Data {
  const free = everyOfferFree({ offers });
  const l = lang(locale);
  const pool = [...TAGLINES[l], ...(free ? TAGLINES_FREE[l] : [])];
  const tagline = pool[Math.floor(rng() * pool.length)] ?? createT(locale)("trust.cod");
  return { tagline, ctaLabel: "", showCta: true, showPrice: true, contact: "none", sticky: true };
}

/* ------------------------------------------------------------------ */
/* Pieces                                                              */
/* ------------------------------------------------------------------ */

/**
 * The tagline line, unless an announcement bar already opens the page: that band carries the
 * store's promises, and the same "Paiement à la livraison" stacked twice above the hero reads as
 * filler. The bar then stays a clean wordmark + action.
 */
function taglineOf(ctx: RenderContext, data: Data): string {
  const announced = ctx.doc.sections.some((s) => s.type === "announcement" && !s.hidden);
  return announced ? "" : data.tagline.trim();
}

const NEUTRAL: ReadonlySet<SectionBg> = new Set<SectionBg>(["base", "soft", "surface"]);

/**
 * The header's color block. The spec and poster heroes turn a neutral background into a color field
 * (dark instrument panel, accent poster); on an edge-to-edge page a neutral header right above one
 * takes that field too, so the top of the page reads as one block instead of a pale strip wedged
 * between the announcement and the hero. Rounded-panel pages keep the header on the page color (the
 * panel is a shape of its own below it).
 */
function headerBg(ctx: RenderContext, id: string, bg: SectionBg): SectionBg {
  if (!NEUTRAL.has(bg)) return bg;
  const list = ctx.doc.sections.filter((s) => !s.hidden);
  const next = list[list.findIndex((s) => s.id === id) + 1];
  if (!next || next.type !== "hero" || !NEUTRAL.has(next.bg)) return bg;
  const surfaces = ctx.doc.theme.surfaces === "archetype" ? ARCHETYPE_DEFS[ctx.archetype].surfaces.kind : ctx.doc.theme.surfaces;
  if (surfaces === "panels") return bg;
  return next.variant === "spec" ? "dark" : next.variant === "poster" ? "accent" : bg;
}

/** Long store names step down a size so the bar never crowds (s ≤ 10, m ≤ 18, l beyond). */
const nameLength = (name: string): "s" | "m" | "l" => {
  const n = [...name.trim()].length;
  return n <= 10 ? "s" : n <= 18 ? "m" : "l";
};

const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
const LATIN = /[A-Za-zÀ-ɏ]/;

/**
 * A store name written in the other script than the page carries its own language, so the right
 * typography applies: a Latin name on an Arabic page gets the archetype's Latin voice (tracking,
 * capitals), an Arabic name on a Latin page is never letter-spaced (that would break its joins).
 */
function nameLang(name: string, locale: Locale): string | undefined {
  const arabic = ARABIC.test(name);
  const latin = LATIN.test(name);
  if (locale === "ar") return latin && !arabic ? "fr" : undefined;
  return arabic && !latin ? "ar" : undefined;
}

/** The store mark: the uploaded logo, else the name in the display face (with the archetype glyph). */
function Wordmark({ ctx, glyph }: { ctx: RenderContext; glyph: boolean }): ReactElement {
  const logo = ctx.store.logo;
  if (logo) {
    return (
      <span className="lp-header__brand lp-header__brand--logo">
        <Picture asset={logo} sizes="12rem" fit="contain" alt={ctx.store.name} className="lp-header__logo" />
      </span>
    );
  }
  const name = ctx.store.name.trim();
  return (
    <span className="lp-header__brand" data-len={nameLength(name)}>
      {glyph ? <Ornament ctx={ctx} size="0.56em" className="lp-header__glyph" /> : null}
      <bdi className="lp-header__name" lang={nameLang(name, ctx.locale)}>
        {name}
      </bdi>
    </span>
  );
}

/** WhatsApp / phone shortcut built from the sanitized store settings (never from section data). */
function Contact({ ctx, kind }: { ctx: RenderContext; kind: Data["contact"] }): ReactElement | null {
  if (kind === "whatsapp") {
    const wa = ctx.store.whatsapp?.replace(/\D/g, "");
    if (!wa || !/^\d{8,15}$/.test(wa)) return null;
    return (
      <a className="lp-header__contact" href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" aria-label={ctx.t("whatsapp.float")}>
        <Icon name="whatsapp" size="1.25em" />
      </a>
    );
  }
  if (kind === "phone") {
    const tel = ctx.store.phone?.replace(/[^\d+]/g, "");
    if (!tel || !/^\+?\d{6,15}$/.test(tel)) return null;
    return (
      <a className="lp-header__contact" href={`tel:${tel}`} aria-label={`${ctx.t("form.phone")} ${ctx.store.phone ?? ""}`.trim()}>
        <Icon name="phone" size="1.15em" />
      </a>
    );
  }
  return null;
}

/** What a visitor pays at least: the lowest card price (`from`) of the offers that can be ordered, else the product's own price. */
function fromPrice(ctx: RenderContext): number | undefined {
  const views = offerViews(ctx);
  const open = views.filter((v) => !v.soldOut);
  const prices = (open.length ? open : views).map((v) => fromCents(v.math.from)).filter((n) => Number.isFinite(n) && n > 0);
  if (prices.length) return Math.min(...prices);
  const unit = ctx.lead.price;
  return Number.isFinite(unit) && unit > 0 ? unit : undefined;
}

/** Price + order button as one control: a tinted pill holding the starting price, closed by the button. */
function Buy({ ctx, data, centered }: { ctx: RenderContext; data: Data; centered: boolean }): ReactElement | null {
  if (!data.showCta) return null;
  const price = data.showPrice ? fromPrice(ctx) : undefined;
  return (
    <span className={cx("lp-header__buy", price !== undefined && "lp-header__buy--price")}>
      {price !== undefined ? (
        <span className="lp-header__price">
          <span className="lp-header__from">{ctx.t("price.from")}</span>{" "}
          <Money ctx={ctx} amount={price} className="lp-header__amount" />
        </span>
      ) : null}
      <Cta
        ctx={ctx}
        label={data.ctaLabel.trim() || ctx.t("cta.order")}
        size="m"
        icon={centered ? "bag" : false}
        className={cx("lp-header__cta", centered && "lp-header__cta--bag")}
        editPath="ctaLabel"
      />
    </span>
  );
}

function Minimal({ ctx, data }: { ctx: RenderContext; data: Data }): ReactElement {
  const note = taglineOf(ctx, data);
  const contact = <Contact ctx={ctx} kind={data.contact} />;
  const buy = <Buy ctx={ctx} data={data} centered={false} />;
  return (
    <div className={cx("lp-container lp-header__bar", note && "lp-header__bar--note")}>
      {data.sticky ? <span className="lp-header__float" aria-hidden="true" /> : null}
      <p className="lp-header__mark" {...reveal("blur-in")}>
        <Wordmark ctx={ctx} glyph />
      </p>
      {note ? (
        <p className="lp-header__note" {...reveal("fade", 140)}>
          <span className="lp-header__tick" aria-hidden="true">
            <Icon name="check" size="0.8em" strokeWidth={2.4} />
          </span>
          <RichText as="span" className="lp-header__note-text" text={note} ctx={ctx} decorate={false} editPath="tagline" />
        </p>
      ) : null}
      {contact || data.showCta ? (
        <div className="lp-header__actions" {...reveal("scale-in", 120)}>
          {contact}
          {buy}
        </div>
      ) : null}
    </div>
  );
}

function Centered({ ctx, data }: { ctx: RenderContext; data: Data }): ReactElement {
  const tagline = taglineOf(ctx, data);
  return (
    <>
      {data.sticky ? <span className="lp-header__band" aria-hidden="true" /> : null}
      <div className="lp-container lp-header__masthead">
        {tagline ? (
          <p className="lp-header__eyebrow" {...reveal("fade", 80)}>
            <RichText as="span" className="lp-header__eyebrow-text" text={tagline} ctx={ctx} decorate={false} editPath="tagline" />
          </p>
        ) : null}
        <div className="lp-header__row">
          <div className="lp-header__side" {...reveal("fade", 160)}>
            <Contact ctx={ctx} kind={data.contact} />
          </div>
          <p className="lp-header__mark" {...reveal("blur-in")}>
            <Wordmark ctx={ctx} glyph={false} />
          </p>
          <div className="lp-header__side lp-header__side--end" {...reveal("fade", 160)}>
            <Buy ctx={ctx} data={data} centered />
          </div>
        </div>
      </div>
    </>
  );
}

export default withRevealScope(defineSection({
  type: "header",
  label: "Header",
  labelFr: "En-tête",
  category: "top",
  description: "The store name as a wordmark (or logo) with the order button and starting price; turns into frosted glass while scrolling.",
  singleton: true,
  variants: [
    {
      id: "minimal",
      label: "Minimal island",
      description: "Wordmark at the start, price + order button at the end; condenses into a floating glass capsule after scroll.",
    },
    {
      id: "centered",
      label: "Centered masthead",
      description: "Large centered wordmark under a small tagline, slim and airy; condenses onto a glass band after scroll.",
      archetypes: ["maison", "souk", "bloom", "apothecary", "hearth", "field", "editorial"],
    },
    { id: "none", label: "No header", description: "Start straight with the hero." },
  ],
  schema: Schema,
  defaults,
  fields,
  render: ({ id, variant, bg, data, ctx }) => {
    if (variant === "none") return null;
    const centered = variant === "centered";
    return (
      <SectionShell
        id={id}
        ctx={ctx}
        type="header"
        variant={centered ? "centered" : "minimal"}
        bg={headerBg(ctx, id, bg)}
        as="header"
        className={cx(
          "lp-section--flush",
          data.sticky && "lp-header--sticky",
          centered && taglineOf(ctx, data) && "lp-header--eyebrow",
        )}
      >
        {centered ? <Centered ctx={ctx} data={data} /> : <Minimal ctx={ctx} data={data} />}
      </SectionShell>
    );
  },
}));
