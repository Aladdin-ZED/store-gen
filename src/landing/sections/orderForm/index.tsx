/**
 * Order form — the conversion core (singleton, required, anchored at #order).
 *
 * Variants (docs/SECTIONS.md):
 *  - card    — an elevated two-tone checkout card on a soft product-hue glow: the urgency chip (typed
 *              stock or end date only) across its top edge, the steps joined by a rail that fills as each step
 *              is completed, and a receipt (thumb with live ×qty, chosen pack, live summary,
 *              submit) — a sticky tinted column beside the steps on desktop;
 *  - split   — desktop: sticky product panel whose pack visual follows the chosen bundle (×1 → ×3
 *              stack in depth) under an opaque chip with the pack total | form; phones: a compact
 *              product strip on top;
 *  - minimal — no card: editorial rows (big "01" numeral + step name | bordered fields, labels
 *              above), a progress hairline that draws across each completed step;
 *  - bold    — an accent slab with soft colored depth: giant headline (beside the form on desktop),
 *              big inputs, light cards, the best saving as a still disc on the slab's corner.
 *
 * The quality contract (landing.md LAN-§3.5 OF1-OF13, LD34): the title alone (no kicker), `data-reveal` only on the
 * panel and the submit row, no glass, no trust 3-up (the `trustBar` strip is the page's one trust surface), the
 * delivery slots `[data-lp-dz]` under the offers and the city (LAN-§7.4), the one urgency chip from typed data, the
 * COD line once under the submit (`codLineFor`, also the hero price block's), labels above 52-56 px controls.
 *
 * Runtime markup contract (docs/OFFERS.md §F.6) is followed exactly: see picker.tsx (offer radios,
 * the five offer layouts), units.tsx (personalization: units, item choosers, option groups, shared
 * groups, extras, steps / box navigation, templates) and parts.tsx (fields, bump, summary, submit).
 * Steps: 1 · choose your offer (with the "inline" fill the selected card holds the units) → 2 ·
 * personalize (resolved fill rows / steps / box, §E.1) → 3 · your details; then the checkout.
 */
import type { ReactElement, ReactNode } from "react";
import { z } from "zod";
import { emptySelection, fromCents, orderTotals } from "@/lib/page/pricing";
import { defaultOfferView } from "../../offers/model";
import { AssetRef, type SectionBg } from "@/lib/page/schema";
import { Badge as RingBadge } from "../../illustrations";
import { Honeypot, Icon, Picture, SectionShell, cx } from "../../primitives";
import { defineSection, type RenderContext } from "../../types";
import { codLineFor } from "./cod";
import { formCopy, uiLabels } from "./copy";
import { deliveryFallback } from "./delivery";
import { LETTERBOX, fitsCover } from "./fit";
import { Bump, CodChip, DeliverySlot, Fields, Head, OrderLine, Privacy, StepTitle, Submit, Summary, WhatsAppAlt } from "./parts";
import { PackPicker, PackVisual, allFree, bestSaving, displayOf, packsOf, type Pack } from "./picker";
import { Plain } from "./text";
import { Extras, OptionsSummary, Units, pageHasUnits } from "./units";

export { codLineFor } from "./cod";

const VARIANT_IDS = ["card", "split", "minimal", "bold"] as const;
type Variant = (typeof VARIANT_IDS)[number];

const schema = z.object({
  /** kept for stored docs; never rendered (LD34: the form heading is the title alone) */
  kicker: z.string().max(60).default(""),
  /** empty → page form title → built-in "Commandez maintenant" */
  title: z.string().max(140).default(""),
  lead: z.string().max(260).default(""),
  packsLabel: z.string().max(60).default(""),
  optionsLabel: z.string().max(60).default(""),
  detailsLabel: z.string().max(60).default(""),
  submitLabel: z.string().max(60).default(""),
  reassurance: z.string().max(160).default(""),
  showSummary: z.boolean().default(true),
  /** kept for stored docs; the trust 3-up is gone (R3: the `trustBar` strip is the page's one trust surface) */
  showTrust: z.boolean().default(true),
  /** card: the product line at the top of the card */
  showOrderLine: z.boolean().default(true),
  /** card: "cash on delivery" chip on the card edge · bold: best-saving disc */
  highlight: z.boolean().default(true),
  /** split variant panel image (default: the product ×qty of the chosen pack) */
  image: AssetRef.optional(),
});
type Data = z.infer<typeof schema>;

/** Bold slab color: a color block that always contrasts with the section around it. */
function slabBg(bg: SectionBg): SectionBg {
  return bg === "accent" || bg === "pop" ? "dark" : "accent";
}

/**
 * Split panel visual: one product ×qty composition per pack, stacked in one cell — the runtime marks
 * the chosen one ([data-selected]) and CSS cross-fades to it, a glass chip naming the pack and its
 * total riding on top (an opaque chip: the form has no glass). A merchant panel image replaces the compositions.
 */
function Showcase({ ctx, packs, image }: { ctx: RenderContext; packs: Pack[]; image: Data["image"] }): ReactElement {
  const own = image ? ctx.asset(image) : null;
  if (own) {
    return (
      <div className="lp-of__show">
        {/* the panel is square on phones, 5:4 beside the form: the photo is fitted to each */}
        {own.alpha || !fitsCover(own, 1) ? (
          <Picture asset={own} sizes="(min-width: 64rem) 28rem, 6rem" alt="" fit="contain" className={cx("lp-of__show-own", !own.alpha && LETTERBOX)} />
        ) : (
          <Picture
            asset={own}
            sizes="(min-width: 64rem) 28rem, 6rem"
            alt=""
            frame={{ shape: "rounded", ratio: 1 }}
            frameLg={{ shape: "rounded", ratio: 5 / 4 }}
            className="lp-of__show-own"
          />
        )}
      </div>
    );
  }
  return (
    <div className="lp-of__show" aria-hidden="true">
      {packs.map((p) => (
        <span key={p.id} className="lp-of__show-i" data-bundle-card={p.id} data-selected={p.selected ? "" : undefined}>
          <PackVisual ctx={ctx} pack={p} sizes="(min-width: 64rem) 22rem, 6rem" className="lp-of__show-pv" />
          <span className="lp-of__show-cap">
            <bdi className="lp-of__show-name">
              <Plain ctx={ctx} text={p.titled && p.legacy ? `${p.name} · ${p.qtyLabel}` : p.name} />
            </bdi>
            <bdi className="lp-of__show-price">
              {p.fromWord ? <span className="lp-pack__from">{p.fromWord} </span> : null}
              {p.total}
            </bdi>
          </span>
        </span>
      ))}
    </div>
  );
}

function render({ id, variant, bg, data, ctx }: { id: string; variant: string; bg: SectionBg; data: Data; ctx: RenderContext }): ReactElement | null {
  const v: Variant = (VARIANT_IDS as readonly string[]).includes(variant) ? (variant as Variant) : "card";
  const packs = packsOf(ctx);
  const pack = defaultOfferView(ctx);
  if (!pack) return null;
  const display = displayOf(ctx, v);
  const t = orderTotals(ctx.doc, emptySelection(pack.id));
  const total = t ? fromCents(t.total) : pack.m.total;
  const L = uiLabels(ctx.locale);
  const titleId = `${id}-title`;
  const title = data.title.trim() || ctx.form.title?.trim() || ctx.t("form.title");
  const submitLabel = data.submitLabel.trim() || ctx.form.submitLabel?.trim() || ctx.t("form.submit");
  const reassurance = codLineFor(ctx.doc);
  // the delivery line's server fallback (LAN-§7.4): the default offer's real fee, free when it ships for 0
  const dz = deliveryFallback(ctx, (t ? t.shipping : 0) <= 0);
  const fill = display.fill;
  const hasUnits = pageHasUnits(fill);
  const personalize = hasUnits && fill !== "inline";
  // bold: cards, option rows, add-on and summary are light sheets laid on the color slab
  const surface: SectionBg | undefined = v === "bold" ? "surface" : undefined;
  const units = hasUnits ? <Units ctx={ctx} sid={id} fill={fill} packs={packs} current={pack} surface={surface} /> : null;
  const extras = ctx.offers.extras.length ? <Extras ctx={ctx} offerId={pack.id} /> : null;

  // card: the receipt line (product, chosen pack, live total) heads the checkout block
  const orderLine = v === "card" && data.showOrderLine;
  let step = 0;
  const packsLabel = data.packsLabel.trim() || ctx.t("form.choosePack");
  const optionsLabel = data.optionsLabel.trim() || L.options;
  const detailsLabel = data.detailsLabel.trim() || L.details;

  // Two blocks: the steps, then the checkout (product line on the card, add-on, live summary, submit
  // and reassurances). Desktop card = steps | sticky receipt column; minimal = editorial rows.
  const form = (
    <form
      id="order-form"
      className="lp-of__form"
      data-lp-form=""
      data-state="idle"
      method="post"
      noValidate
      aria-labelledby={titleId}
    >
      <div className="lp-of__steps">
        <fieldset className="lp-of__step lp-of__step--packs" data-lp-bundles="">
          <StepTitle ctx={ctx} n={++step} text={packsLabel} path="packsLabel" />
          <PackPicker ctx={ctx} sid={id} packs={packs} display={display} surface={surface} inline={fill === "inline" ? units : undefined} />
          {fill === "inline" ? extras : null}
          {allFree(packs) && !dz ? (
            <p className="lp-of__ship">
              <Icon name="truck" size="1.2em" />
              <span>{ctx.t("bundle.freeShipping")}</span>
            </p>
          ) : null}
          <DeliverySlot k="offer" text={dz} />
        </fieldset>
        {personalize ? (
          <fieldset className="lp-of__step lp-of__step--options" data-fill={fill}>
            <StepTitle ctx={ctx} n={++step} text={optionsLabel} path="optionsLabel" />
            {units}
            {extras}
          </fieldset>
        ) : null}
        <fieldset className="lp-of__step lp-of__step--details">
          <StepTitle ctx={ctx} n={++step} text={detailsLabel} path="detailsLabel" />
          <Fields ctx={ctx} />
        </fieldset>
      </div>
      <div className="lp-of__checkout">
        {orderLine ? <OrderLine ctx={ctx} packs={packs} total={pack.m.total} /> : null}
        {v === "minimal" ? (
          <p className="lp-of__checkout-k" aria-hidden="true">
            <span className="lp-of__no-2">{String(step + 1).padStart(2, "0")}</span>
            <span>{L.yourOrder}</span>
          </p>
        ) : null}
        {v !== "card" ? <CodChip ctx={ctx} /> : null}
        {!hasUnits && extras ? <div className="lp-of__extras">{extras}</div> : null}
        {data.showSummary ? (
          <Summary ctx={ctx} bundleId={pack.id} surface={surface} subtotal={!orderLine} className={v === "split" ? "lp-sum--inline" : undefined} />
        ) : hasUnits || ctx.items.length > 1 ? (
          <OptionsSummary ctx={ctx} as="line" />
        ) : null}
        {/* OF6: the bump is one row between the summary and the submit */}
        <Bump ctx={ctx} surface={surface} offerId={pack.id} />
        <Submit ctx={ctx} label={submitLabel} reassurance={reassurance} total={total} />
        <WhatsAppAlt ctx={ctx} />
        <Privacy ctx={ctx} />
      </div>
      <Honeypot />
    </form>
  );

  const head = <Head ctx={ctx} data={data} title={title} titleId={titleId} />;
  const shell = (children: ReactNode) => (
    <SectionShell id={id} ctx={ctx} type="orderForm" variant={v} bg={bg} anchor="order" labelledBy={titleId}>
      {children}
    </SectionShell>
  );

  if (v === "split") {
    const rating = ctx.product.rating;
    return shell(
      <div className="lp-container lp-of__wrap">
        <aside className="lp-of__aside">
          <div className="lp-of__aside-in">
            <Showcase ctx={ctx} packs={packs} image={data.image} />
            <div className="lp-of__aside-copy">
              {head}
              <p className="lp-of__product">
                <span className="lp-of__product-name">{ctx.product.name}</span>
                {rating ? (
                  <span className="lp-of__product-rating">
                    <Icon name="star" size="1em" strokeWidth={2} />
                    <bdi>{ctx.num(rating.value)}</bdi>
                    <span className="lp-of__product-count">
                      (<bdi>{ctx.num(rating.count)}</bdi>)
                    </span>
                  </span>
                ) : null}
              </p>
            </div>
            {data.showSummary ? <Summary ctx={ctx} bundleId={pack.id} className="lp-sum--panel" /> : null}
          </div>
        </aside>
        <div className="lp-of__panel">{form}</div>
      </div>,
    );
  }

  if (v === "bold") {
    // the best saving as a still disc on the slab corner: the figure alone (no turning micro-type, no reveal)
    const best = data.highlight ? bestSaving(packs) : null;
    return shell(
      <div className="lp-container lp-of__wrap">
        <div className="lp-of__panel lp-decor-host" data-bg={slabBg(bg)} data-reveal="rise">
          <span className="lp-of__light" aria-hidden="true" />
          {best ? (
            <RingBadge
              uid={`${id}-disc`}
              text={[]}
              label={best.label}
              glyph="none"
              sep="dot"
              // the seal straddles the slab corner, half on the section: never in the section's own colour
              tone={bg === "pop" ? "accent" : "pop"}
              spin={false}
              className="lp-of__disc"
            />
          ) : null}
          <div className="lp-of__side">{head}</div>
          {form}
        </div>
      </div>,
    );
  }

  if (v === "minimal") {
    return shell(
      <div className="lp-container lp-of__wrap">
        {head}
        {form}
      </div>,
    );
  }

  // card
  return shell(
    <div className="lp-container lp-of__wrap">
      {head}
      <div className="lp-of__panel" data-reveal="rise">
        <CodChip ctx={ctx} />
        {form}
      </div>
    </div>,
  );
}

export default defineSection({
  type: "orderForm",
  label: "Order form",
  labelFr: "Formulaire de commande",
  category: "conversion",
  description: "The single order form (#order): pack picker, delivery details, live total and COD reassurance.",
  singleton: true,
  required: true,
  variants: [
    {
      id: "card",
      label: "Checkout card",
      description: "Two-tone checkout card: steps that tick off along a rail, a sticky receipt with the live total, the urgency chip on its edge when Offers holds one.",
    },
    {
      id: "split",
      label: "Split",
      description: "Desktop: sticky product panel that shows the chosen pack ×qty and the live total, beside the form.",
      archetypes: ["circuit", "editorial", "maison", "apothecary"],
    },
    {
      id: "minimal",
      label: "Minimal",
      description: "No card: editorial rows, big step numerals beside bordered fields with their labels above, lots of air.",
      archetypes: ["maison", "editorial", "apothecary", "bloom"],
    },
    {
      id: "bold",
      label: "Bold slab",
      description: "An accent slab with a giant headline, big inputs, light pack cards and the best saving as a disc on its corner.",
      archetypes: ["playground", "kinetic", "garage", "hearth"],
    },
  ],
  schema,
  defaults: ({ locale, product, rng }) => {
    const c = formCopy(locale, product.name, rng);
    return {
      kicker: c.kicker,
      title: c.title,
      lead: c.lead,
      packsLabel: c.packsLabel,
      optionsLabel: c.optionsLabel,
      detailsLabel: c.detailsLabel,
      submitLabel: "",
      reassurance: "",
      showSummary: true,
      showTrust: true,
      showOrderLine: true,
      highlight: true,
    };
  },
  fields: [
    {
      kind: "group",
      label: "Heading",
      fields: [
        { kind: "text", path: "title", label: "Title", max: 140, help: "Wrap a word in *stars* to emphasize it. Empty = the page's form title." },
        { kind: "textarea", path: "lead", label: "Intro", max: 260, rows: 3, help: "One or two lines: what happens after ordering." },
      ],
    },
    {
      kind: "group",
      label: "Steps",
      fields: [
        { kind: "text", path: "packsLabel", label: "Pack step label", max: 60, help: "Empty = “Choose your offer”. Pack cards follow Offers → card style." },
        { kind: "text", path: "optionsLabel", label: "Options step label", max: 60, help: "Shown only when the product has options (color, size…)." },
        { kind: "text", path: "detailsLabel", label: "Details step label", max: 60, help: "Above name, phone and address." },
      ],
    },
    {
      kind: "group",
      label: "Button & reassurance",
      fields: [
        { kind: "text", path: "submitLabel", label: "Button label", max: 60, help: "Empty = “Confirm my order”. The live total rides in the button when there is room." },
        { kind: "text", path: "reassurance", label: "Reassurance line", max: 160, help: "Under the button. Empty = “You only pay when you receive it”." },
      ],
    },
    {
      kind: "group",
      label: "Display",
      fields: [
        { kind: "toggle", path: "showSummary", label: "Order summary", help: "Subtotal, delivery and total — updates live with the chosen pack." },
        { kind: "toggle", path: "showOrderLine", label: "Product line on the card", help: "Checkout card only: photo, product, chosen pack and live total at the head of the receipt." },
        { kind: "toggle", path: "highlight", label: "Signature detail", help: "Bold: the best saving as a disc on the slab corner." },
        { kind: "image", path: "image", label: "Panel image (split)", help: "Empty = the product shown ×qty of the chosen pack." },
      ],
    },
  ],
  render,
});
