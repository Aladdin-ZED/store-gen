/**
 * Sticky order CTA (floating, singleton). Appears once the hero CTA has scrolled away and steps aside
 * while the order form is on screen (runtime: [data-sticky-cta] → data-visible, inert when hidden).
 *  - bar  — a floating liquid-glass dock (specular rim, the button's light pooling in the glass):
 *           the product on a lit tile wearing the pack's quantity badge, two reassurance lines
 *           taking turns, the live price (data-lp-price="current") followed by the pack's tinted
 *           saving and genuine struck reference (as many as fit on phones), and the order button.
 *           The whole dock is the tap target. From tablet width it becomes a centred dock that adds
 *           the product name.
 *  - pill — one luminous capsule (product disc · label over a reassurance line · hairline · live
 *           price · arrow end-cap) that unfolds from its centre and catches one glint each time it
 *           appears.
 * On phones the page frosts progressively where it slides under either one (scroll-edge veil).
 * Pack details follow the shopper's choice: every pack-specific element carries
 * data-bundle-card=<bundle id>, the runtime marks the chosen pack's elements [data-selected]
 * (no JS: the default pack's, marked [data-default]).
 * Without JS the bar simply stays on screen (plain #order link).
 */
import type { ReactElement, ReactNode } from "react";
import { z } from "zod";
import { offerViews, priceLine } from "../../offers/model";
import { AssetRef, type SectionBg } from "@/lib/page/schema";
import {
  Cta,
  Icon,
  Picture,
  cx,
  editAttr,
  plainText,
  resolveProductVisual,
} from "../../primitives";
import { defineSection, type RenderContext } from "../../types";
import { badgeSpot } from "../orderForm/parts";
import { Plain } from "../orderForm/text";
import { stickyCopy } from "./copy";
import { withRevealScope } from "../reveal-scope";

const VARIANT_IDS = ["bar", "pill"] as const;
type VariantId = (typeof VARIANT_IDS)[number];

const schema = z.object({
  /** button text; empty → the kit microcopy ("Commander" / "اطلب الآن") */
  label: z.string().max(40).default(""),
  /** reassurance line; empty → "Paiement à la livraison" */
  note: z.string().max(60).default(""),
  /** optional second line, takes turns with the first */
  note2: z.string().max(60).default(""),
  showThumb: z.boolean().default(true),
  /** thumbnail override; empty → product cutout, else the first product photo */
  image: AssetRef.optional(),
  /** quantity badge, savings and struck reference of the chosen pack */
  showPack: z.boolean().default(true),
  /** tablets & computers: a centred floating dock, or phones/tablets only */
  desktop: z.enum(["dock", "hide"]).default("dock"),
});
type Data = z.infer<typeof schema>;

/** What the bar shows for one pack (the runtime reveals the chosen pack's elements). */
interface Pack {
  id: string;
  isDefault: boolean;
  qty: number;
  /** one item ×n: the "×2" badge says it; any other offer is named instead */
  sameItem: boolean;
  /** offer name (multi-item pages show the chosen offer's name) */
  name: string;
  /** the card price, "Dès 249 DH" when the choices can cost more */
  price: string;
  /** genuine struck reference, formatted */
  was?: string;
  /** "−20%" */
  pct?: string;
  /** "Économisez 80 DH" */
  amount?: string;
}

function packsOf(ctx: RenderContext): Pack[] {
  // the shared offer model (src/landing/offers/model.ts): `from` price, genuine savings only
  return offerViews(ctx).map((v) => ({
    id: v.id,
    isDefault: v.selected,
    qty: v.qty,
    sameItem: v.sameItem,
    name: v.name,
    price: priceLine(ctx, v),
    was: v.reference,
    pct: v.savePct,
    amount: v.savePct ? undefined : v.saveAmount,
  }));
}

/** Runtime hook of a pack-specific element: shown only while its pack is the chosen one. */
const packAttrs = (p: Pack) => ({
  "data-bundle-card": p.id,
  "data-default": p.isDefault ? "" : undefined,
});

/** Quantity badge ("×2"), one per multi-unit pack; spoken as "2 pièces". */
function qtyBadges(
  ctx: RenderContext,
  packs: Pack[],
  className: string,
): ReactNode {
  return packs
    .filter((p) => p.qty > 1 && p.sameItem)
    .map((p) => (
      <span
        key={p.id}
        className={cx("lp-sticky__qty", className)}
        {...packAttrs(p)}
      >
        <bdi dir="ltr" aria-hidden="true">
          ×{ctx.num(p.qty)}
        </bdi>
        <span className="lp-visually-hidden">
          {ctx.t("bundle.qty", { n: p.qty })}
        </span>
      </span>
    ));
}

/**
 * The reassurance lines: one, or two taking turns (rolling on motion-friendly pages). Tiny UI: the
 * markup (*emphasis*) is shown as plain words, and number ranges ("24–48h") stay one unbroken run
 * that never reads "48–24" on Arabic pages (Plain).
 */
function notes(ctx: RenderContext, data: Data): ReactElement {
  const first = plainText(data.note) || ctx.t("trust.cod");
  const second = plainText(data.note2);
  return (
    <span className="lp-sticky__notes" data-count={second ? 2 : 1}>
      <Plain ctx={ctx} className="lp-sticky__note" text={first} editPath="note" />
      {second ? <Plain ctx={ctx} className="lp-sticky__note" text={second} editPath="note2" /> : null}
    </span>
  );
}

function thumb(
  ctx: RenderContext,
  data: Data,
  packs: Pack[],
  showPack: boolean,
): ReactElement | null {
  if (!data.showThumb) return null;
  // a picked image that no longer resolves falls back to the product's own visual
  const visual = resolveProductVisual(ctx, ctx.asset(data.image) ?? undefined);
  if (visual.kind === "empty") return null;
  const cutout = visual.kind === "cutout";
  return (
    <span className="lp-sticky__thumb" data-kind={visual.kind} data-q={cutout ? undefined : badgeSpot(ctx, visual.asset, "4.5rem")}>
      <Picture
        asset={visual.asset}
        className="lp-sticky__pic"
        sizes="4.5rem"
        alt=""
        ratio={cutout ? undefined : 1}
        fit={cutout ? "contain" : "cover"}
      />
      {showPack ? qtyBadges(ctx, packs, "lp-sticky__qty--badge") : null}
    </span>
  );
}

function render({
  id,
  variant,
  bg,
  data,
  ctx,
}: {
  id: string;
  variant: string;
  bg: SectionBg;
  data: Data;
  ctx: RenderContext;
}): ReactElement | null {
  if (!ctx.offers.bundles.length) return null;
  const v: VariantId = (VARIANT_IDS as readonly string[]).includes(variant)
    ? (variant as VariantId)
    : "bar";
  const label = plainText(data.label) || ctx.t("sticky.cta");
  const packs = packsOf(ctx);
  const current = packs.find((p) => p.isDefault) ?? packs[0]!;
  // multi-item pages name the chosen offer (docs/OFFERS.md §B.2), single-item pages the product
  const multi = ctx.items.length > 1;
  const tile = thumb(ctx, data, packs, data.showPack);
  // without a picture the quantity rides next to the price instead of on the tile
  const inlineQty =
    data.showPack && !tile
      ? qtyBadges(ctx, packs, "lp-sticky__qty--inline")
      : null;
  const price = (
    <bdi className="lp-sticky__price" data-lp-price="current">
      {current.price}
    </bdi>
  );
  // End-of-page marker: the runtime hides the bar while any [data-hero-cta] is on screen, so the bar
  // steps aside over the last lines of the page (footer legal links stay reachable).
  const endMarker = (
    <div className="lp-sticky-end" data-hero-cta="" aria-hidden="true" />
  );
  // the renderer only adds editor hooks to a lone root element; this section returns two
  const rootProps = {
    "data-sid": id,
    "data-section": "stickyCta",
    "data-variant": v,
    "data-sticky-cta": "",
    "data-desktop": data.desktop,
    "aria-label": label,
  };

  if (v === "pill") {
    return (
      <>
        <aside className="lp-sticky lp-sticky--pill" {...rootProps}>
          <a
            href="#order"
            className={cx("lp-sticky__pill", tile && "lp-sticky__pill--thumb")}
            data-action="order"
            data-bg={bg}
          >
            {tile}
            <span className="lp-sticky__text">
              <span className="lp-sticky__label" {...editAttr(ctx, "label")}>
                {label}
              </span>
              {notes(ctx, data)}
            </span>
            <span className="lp-sticky__tag">
              {inlineQty}
              {price}
            </span>
            <span className="lp-sticky__go" aria-hidden="true">
              <Icon name="arrow-right" size="1.2rem" strokeWidth={2.1} />
            </span>
          </a>
        </aside>
        {endMarker}
      </>
    );
  }

  return (
    <>
      <aside className="lp-sticky lp-sticky--bar" {...rootProps}>
        <div
          className={cx("lp-sticky__dock", tile && "lp-sticky__dock--thumb")}
          data-bg={bg}
        >
          {tile}
          <span className="lp-sticky__info">
            {/* isolated (dir auto): a Latin name on an Arabic page is cut at its END, never its start */}
            {multi ? (
              <span className="lp-sticky__name lp-sticky__name--offer">
                {packs.map((p) => (
                  <bdi key={p.id} className="lp-sticky__offer" {...packAttrs(p)}>
                    {p.name}
                  </bdi>
                ))}
              </span>
            ) : (
              <bdi className="lp-sticky__name">{ctx.product.name}</bdi>
            )}
            {notes(ctx, data)}
          </span>
          <span className="lp-sticky__buy">
            {inlineQty}
            {price}
            {data.showPack
              ? packs.map((p) =>
                  p.was ? (
                    <s
                      key={`was-${p.id}`}
                      className="lp-sticky__was"
                      {...packAttrs(p)}
                    >
                      <span className="lp-visually-hidden">
                        {ctx.t("price.was")}{" "}
                      </span>
                      <bdi>{p.was}</bdi>
                    </s>
                  ) : null,
                )
              : null}
            {data.showPack
              ? packs.map((p) =>
                  p.pct || p.amount ? (
                    <span
                      key={`save-${p.id}`}
                      className={cx(
                        "lp-sticky__save",
                        p.amount && "lp-sticky__save--amount",
                      )}
                      {...packAttrs(p)}
                    >
                      {p.pct ? <bdi dir="ltr">{p.pct}</bdi> : p.amount}
                    </span>
                  ) : null,
                )
              : null}
          </span>
          <Cta
            ctx={ctx}
            label={label}
            size="m"
            className="lp-sticky__cta"
            editPath="label"
          />
        </div>
      </aside>
      {endMarker}
    </>
  );
}

export default withRevealScope(defineSection({
  type: "stickyCta",
  label: "Sticky order button",
  labelFr: "Bouton de commande flottant",
  category: "floating",
  description:
    "Floating order button that follows the shopper once the hero is gone, with the live price of the chosen pack.",
  singleton: true,
  variants: [
    {
      id: "bar",
      label: "Glass dock",
      description:
        "Liquid-glass dock: product tile with the pack badge, alternating reassurance, live price and saving, order button.",
    },
    {
      id: "pill",
      label: "Floating pill",
      description:
        "One luminous capsule — product disc, label, live price, arrow — that unfolds from its centre and catches a glint.",
      archetypes: ["bloom", "maison", "playground", "apothecary"],
    },
  ],
  schema,
  defaults: ({ locale, offers, archetype, rng }) => {
    const copy = stickyCopy(
      locale,
      archetype,
      (offers.shippingFee ?? 0) === 0,
      rng,
    );
    return {
      label: copy.label,
      note: copy.note,
      note2: copy.note2,
      showThumb: true,
      showPack: true,
      desktop: "dock" as const,
    };
  },
  fields: [
    {
      kind: "group",
      label: "Button",
      fields: [
        {
          kind: "text",
          path: "label",
          label: "Button label",
          max: 40,
          placeholder: "Commander",
          help: "A short verb — the price of the chosen pack is shown next to it. Empty = “Commander” / “اطلب الآن”.",
        },
      ],
    },
    {
      kind: "group",
      label: "Reassurance",
      fields: [
        {
          kind: "text",
          path: "note",
          label: "Reassurance line",
          max: 60,
          placeholder: "Paiement à la livraison",
          help: "Keep it under ~25 characters so it fits next to the price on phones. Empty = “Paiement à la livraison”.",
        },
        {
          kind: "text",
          path: "note2",
          label: "Second line (takes turns)",
          max: 60,
          placeholder: "Livraison offerte",
          help: "Optional. Slides in turn with the first line every few seconds. Empty = one fixed line.",
        },
      ],
    },
    {
      kind: "group",
      label: "Product & pack",
      fields: [
        {
          kind: "toggle",
          path: "showThumb",
          label: "Show the product picture",
        },
        {
          kind: "image",
          path: "image",
          label: "Picture",
          help: "Empty = the product cutout, else its first photo.",
        },
        {
          kind: "toggle",
          path: "showPack",
          label: "Show pack details",
          help: "Quantity badge, savings and the struck reference price of the pack the shopper picked (genuine reference only).",
        },
      ],
    },
    {
      kind: "select",
      path: "desktop",
      label: "On computers",
      options: [
        { value: "dock", label: "Floating dock (centred)" },
        { value: "hide", label: "Hidden — phones and tablets only" },
      ],
      help: "Phones always get the sticky button.",
    },
  ],
  render,
}));
