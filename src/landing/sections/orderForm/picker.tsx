/**
 * The offer picker of the order form (docs/OFFERS.md §E.1–E.4) — five layouts on one display model
 * (src/landing/offers/model.ts), three selected styles and two densities:
 *
 *   stack   Rows     full-width radio rows: check · media (×qty numeral, or the composed thumbnail when
 *                    the offer has a distinct visual or several items) · name / contents / perks · price
 *   tiers   Columns  2–4 equal columns, the popular (else best) one raised
 *   ticket  Passes   wallet passes: a band, labelled fields (Total, per item, you save, delivery)
 *   pills   Segments a segmented control (short labels) over a detail panel (visual, contents, perks)
 *   visual  Cards    image-led cards: the composed visual (§E.6), name, contents chips, savings chip
 *
 * Root: .lp-packs[data-picker][data-sel=soft|solid|outline][data-density][data-media] — CSS switches.
 * Runtime contract (§F.6, unchanged names D3): input[type=radio][name=bundle][value=<offerId>] inside
 * [data-bundle-card=<offerId>] (the runtime toggles [data-selected]; :checked is the no-JS fallback),
 * `data-soldout` + a disabled radio on offers that cannot be ordered, [data-lp-contents=<offerId>] =
 * the contents line. With the "inline" personalization layout the units container is rendered right
 * after the selected card (never inside the <label>): the runtime moves it after the newly selected
 * card.
 */
import type { ReactElement, ReactNode } from "react";
import { resolveDisplay, type ResolvedDisplay } from "@/lib/page/display";
import type { OfferMedia, OfferPicker } from "@/lib/page/schema";
import { allFree, bestSaving, offerViews, type OfferView } from "../../offers/model";
import { OfferThumb, OfferVisual } from "../../offers/visual";
import { Icon, Money, Picture, cssVars, cx } from "../../primitives";
import type { RenderContext, SectionBg } from "../../types";
import { offerWord, uiLabels } from "./copy";
import { Plain } from "./text";

export { allFree, bestSaving };
export type { BadgeKind } from "../../offers/model";
/** @deprecated v1 name: the five pickers (OfferPicker). */
export type CardStyle = OfferPicker;
/** One offer as the form shows it. */
export type Pack = OfferView;

/** Display model of every offer, in page order. */
export const packsOf = (ctx: RenderContext): Pack[] => offerViews(ctx);

/** The page's resolved display (picker fallbacks, fill, selection, media, density). */
export function displayOf(ctx: RenderContext, formVariant: string): ResolvedDisplay {
  return resolveDisplay(ctx.doc, { archetype: ctx.archetype, formVariant });
}

/* ------------------------------------------------------------------ */
/* Media per picker (§E.5 media "auto")                                */
/* ------------------------------------------------------------------ */

type CardMedia = "none" | "qty" | "thumb" | "large";

/** What a card shows as its media for the resolved picker + media axis. */
function cardMedia(picker: OfferPicker, media: OfferMedia, pack: Pack, imageLed: boolean): CardMedia {
  if (pack.image && media !== "none" && picker !== "visual") return picker === "stack" ? "thumb" : "large";
  switch (picker) {
    case "visual":
      return "large";
    case "stack":
      if (media === "none") return "none";
      if (media === "thumb") return "thumb";
      return pack.imageLed ? "thumb" : "qty";
    case "tiers":
    case "ticket":
      if (media === "none") return pack.sameItem ? "qty" : "none";
      if (media === "large") return "large";
      return imageLed ? "large" : pack.sameItem ? "qty" : "large";
    case "pills":
      return "large";
  }
}

/* ------------------------------------------------------------------ */
/* Card pieces                                                         */
/* ------------------------------------------------------------------ */

/** Check disc: pops in with a spring and draws its tick when the card is chosen. */
function Check(): ReactElement {
  return (
    <span className="lp-pack__check" aria-hidden="true">
      <svg viewBox="0 0 24 24" focusable="false">
        <path d="M6.6 12.6l3.7 3.6 7.2-8" pathLength={1} />
      </svg>
    </span>
  );
}

/** "×2" — always written left-to-right, a big numeral with a light multiplication sign. */
function Qty({ ctx, pack }: { ctx: RenderContext; pack: Pack }): ReactElement {
  return (
    <span className={cx("lp-pack__qty", pack.image && "lp-pack__qty--pic")} aria-hidden="true">
      {pack.image ? <Picture asset={pack.image} sizes="5rem" alt="" ratio={1} fit={pack.image.alpha ? "contain" : "cover"} className="lp-pack__qpic" /> : null}
      <bdi className="lp-pack__qn" dir="ltr">
        <span className="lp-pack__times">×</span>
        {ctx.num(pack.qty)}
      </bdi>
    </span>
  );
}

function Badge({ pack }: { pack: Pack }): ReactElement | null {
  if (!pack.badge) return null;
  return (
    <span className="lp-pack__badge" aria-hidden="true">
      {pack.badge.kind === "best" ? <Icon name="star" size="1em" strokeWidth={2} /> : null}
      <span className="lp-pack__badge-t">{pack.badge.text}</span>
    </span>
  );
}

function SoldOut({ ctx, pack }: { ctx: RenderContext; pack: Pack }) {
  return pack.soldOut ? <span className="lp-pack__out">{offerWord(ctx.locale, "soldOut")}</span> : null;
}

/** The contents line ("Crème jour + Crème nuit + Sérum · Offert") — [data-lp-contents]; chips on cards. */
function Contents({ ctx, pack, chips }: { ctx: RenderContext; pack: Pack; chips?: boolean }) {
  if (!pack.contentsText) return null;
  const parts = pack.contents.filter((c) => c.label);
  // chips while they fit one or two short rows; longer contents read as one clamped line
  if (chips && parts.length && parts.length <= 2) {
    const or = offerWord(ctx.locale, "or");
    return (
      <span className="lp-pack__chips" data-lp-contents={pack.id}>
        {parts.map((c, i) =>
          c.choice ? (
            <span key={i} className="lp-pack__chips-or">
              {c.label.split(` ${or} `).map((name, j) => (
                <span key={j} className="lp-pack__chip-wrap">
                  {j > 0 ? <span className="lp-pack__or">{or}</span> : null}
                  <span className="lp-pack__chip">
                    <Plain ctx={ctx} text={name} />
                  </span>
                </span>
              ))}
            </span>
          ) : (
            <span key={i} className="lp-pack__chip" data-free={c.free ? "" : undefined}>
              {c.qty > 1 ? <bdi dir="ltr">{ctx.num(c.qty)}×</bdi> : null}
              <Plain ctx={ctx} text={c.free ? `${c.label} · ${offerWord(ctx.locale, "free")}` : c.label} />
            </span>
          ),
        )}
      </span>
    );
  }
  return <Plain ctx={ctx} className="lp-pack__contents" text={pack.contentsText} />;
}

function Main({ ctx, pack, id, chips }: { ctx: RenderContext; pack: Pack; id?: string; chips?: boolean }): ReactElement {
  return (
    <span className="lp-pack__main">
      <Plain ctx={ctx} className="lp-pack__name" id={id} text={pack.name} />
      {pack.titled && pack.legacy ? (
        <span className="lp-pack__meta">
          <bdi>{pack.qtyLabel}</bdi>
        </span>
      ) : null}
      {pack.contentsText ? (
        chips ? (
          <Contents ctx={ctx} pack={pack} chips />
        ) : (
          <span className="lp-pack__meta lp-pack__meta--contents" data-lp-contents={pack.id}>
            <Plain ctx={ctx} text={pack.contentsText} />
          </span>
        )
      ) : null}
      {pack.subtitle ? <Plain ctx={ctx} className="lp-pack__subt" text={pack.subtitle} /> : null}
    </span>
  );
}

function PriceBlock({ ctx, pack, id, label }: { ctx: RenderContext; pack: Pack; id?: string; label?: string }): ReactElement {
  return (
    <span className="lp-pack__price" id={id}>
      {label ? (
        <span className="lp-pack__flabel" aria-hidden="true">
          {label}
        </span>
      ) : null}
      <span className="lp-pack__now">
        {pack.fromWord ? <span className="lp-pack__from">{pack.fromWord} </span> : null}
        <Money ctx={ctx} amount={pack.m.total} />
      </span>
      {pack.reference ? (
        <>
          {" "}
          <s className="lp-pack__was">
            <span className="lp-visually-hidden">{ctx.t("price.was")} </span>
            <bdi>{pack.reference}</bdi>
          </s>
        </>
      ) : null}
    </span>
  );
}

/**
 * Savings chip ("−25%" + "Économisez 50 DH"), per-unit line, free delivery. Narrow columns
 * (`compact`) keep one short saving label: the percentage, else "−50 DH" (the full sentence is
 * then given to screen readers by SrExtras).
 */
function Perks({ ctx, pack, ship, compact }: { ctx: RenderContext; pack: Pack; ship: boolean; compact?: boolean }) {
  const amount = compact ? undefined : pack.saveAmount;
  const short = compact && !pack.savePct && pack.saved ? `−${pack.saved}` : undefined;
  return (
    <>
      {pack.savePct || amount || short ? (
        <span className="lp-pack__save">
          {pack.savePct ? <bdi className="lp-pack__pct">{pack.savePct}</bdi> : null}
          {pack.savePct && amount ? " " : null}
          {amount ? <span className="lp-pack__amt">{amount}</span> : null}
          {short ? (
            <bdi className="lp-pack__pct" aria-hidden="true">
              {short}
            </bdi>
          ) : null}
        </span>
      ) : null}
      {pack.perUnit && compact ? (
        <span className="lp-pack__unit lp-pack__unit--field">
          {" "}
          <span className="lp-pack__flabel">{uiLabels(ctx.locale).perUnit}</span> <bdi>{pack.unit}</bdi>
        </span>
      ) : pack.perUnit ? (
        <span className="lp-pack__unit"> {pack.perUnit}</span>
      ) : null}
      {ship ? (
        <span className="lp-pack__ship">
          {" "}
          <Icon name="truck" size="1.15em" />
          {ctx.t("bundle.freeShipping")}
        </span>
      ) : null}
    </>
  );
}

/** The merchant's card bullets (stack, visual, pills panel). */
function PerkList({ ctx, pack }: { ctx: RenderContext; pack: Pack }) {
  if (!pack.perks.length) return null;
  return (
    <span className="lp-pack__perklist">
      {pack.perks.map((p, i) => (
        <span key={i} className="lp-pack__perk">
          <svg className="lp-pack__perk-ico" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <path d="M3.8 8.4l2.6 2.5 5.8-6.1" />
          </svg>
          <Plain ctx={ctx} text={p} />
        </span>
      ))}
    </span>
  );
}

/** What the visual layout leaves unsaid, for screen readers (badge, gift, a saving moved aside, perks). */
function SrExtras({ ctx, pack, also }: { ctx: RenderContext; pack: Pack; also?: (string | undefined)[] }) {
  const parts = [
    ...(also ?? []),
    pack.badge?.text,
    pack.gift ? `${ctx.t("bundle.gift")}: ${pack.gift.label}` : undefined,
    pack.soldOut ? offerWord(ctx.locale, "soldOut") : undefined,
  ].filter(Boolean);
  return parts.length ? <span className="lp-visually-hidden"> · {parts.join(" · ")}</span> : null;
}

function Gift({ ctx, pack }: { ctx: RenderContext; pack: Pack }): ReactElement | null {
  if (!pack.gift) return null;
  return (
    <span className="lp-pack__gift" aria-hidden="true">
      {pack.gift.asset ? (
        <Picture asset={pack.gift.asset} sizes="3rem" alt="" ratio={1} className="lp-pack__gift-pic" />
      ) : (
        <span className="lp-pack__gift-ico">
          <Icon name="gift" size="1.15em" />
        </span>
      )}
      <span className="lp-pack__gift-txt">
        <b>{ctx.t("bundle.gift")}</b> <Plain ctx={ctx} text={pack.gift.label} />
      </span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Composed visual                                                     */
/* ------------------------------------------------------------------ */

export interface PackVisualProps {
  ctx: RenderContext;
  pack: Pack;
  sizes: string;
  /** most copies drawn in a copies stack */
  max?: number;
  className?: string;
}

/**
 * The offer's picture (§E.6, src/landing/offers/visual.tsx) in a media well: the well is a size
 * container, the composition keeps its ratio inside it (`.lp-ov-host`).
 */
export function PackVisual({ ctx, pack, sizes, max = 3, className }: PackVisualProps): ReactElement {
  return (
    <span className={cx("lp-ov-host", className)} aria-hidden="true">
      <OfferVisual ctx={ctx} view={pack} sizes={sizes} max={max} />
    </span>
  );
}

/** A thumbnail-sized visual (stack rows): the composition in a square window. */
function Thumb({ ctx, pack, compact }: { ctx: RenderContext; pack: Pack; compact: boolean }) {
  return (
    <span className="lp-pack__thumb" aria-hidden="true">
      <OfferThumb ctx={ctx} view={pack} sizes={compact ? "2.5rem" : "3.5rem"} />
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Form picker                                                         */
/* ------------------------------------------------------------------ */

export interface PackPickerProps {
  ctx: RenderContext;
  /** section id (unique ids) */
  sid: string;
  packs: Pack[];
  display: ResolvedDisplay;
  /** palette of each card ([data-bg]) when the picker sits on a color slab */
  surface?: SectionBg;
  /** "inline" personalization: the units container, placed after the selected card */
  inline?: ReactNode;
}

/** Radio wiring shared by every layout: the whole card is the <label>, name + total name the radio. */
function Radio({ pack, uid }: { pack: Pack; uid: string }): ReactElement {
  return (
    <input
      className="lp-pack__radio"
      type="radio"
      name="bundle"
      value={pack.id}
      defaultChecked={pack.selected}
      disabled={pack.soldOut || undefined}
      aria-labelledby={`${uid}-n ${uid}-p`}
      aria-describedby={`${uid}-d`}
    />
  );
}

/**
 * Offer radios (runtime contract: input[type=radio][name=bundle] inside [data-bundle-card], the
 * default offer preselected). Selected = the page's selected style (soft · solid · outline).
 */
export function PackPicker({ ctx, sid, packs, display, surface, inline }: PackPickerProps): ReactElement {
  const picker = display.picker;
  const compactDensity = display.density === "compact" && picker !== "pills";
  const rootAttrs = {
    "data-picker": picker,
    "data-sel": display.selection,
    "data-density": compactDensity ? "compact" : "comfortable",
    "data-media": display.media,
    "data-n": packs.length,
    "data-multi": ctx.items.length > 1 || packs.some((p) => p.imageLed) ? "" : undefined,
  };
  if (picker === "pills") return <Segmented ctx={ctx} sid={sid} packs={packs} surface={surface} rootAttrs={rootAttrs} inline={inline} />;
  const shared = allFree(packs);
  const L = uiLabels(ctx.locale);
  const imageLed = packs.some((p) => p.imageLed);
  // tiers: the popular offer (else the best price) stands raised in the row
  const featured = (packs.find((p) => p.badge?.kind === "popular") ?? packs.find((p) => p.badge?.kind === "best"))?.id;
  // narrow columns (3+ side by side) keep labels short
  const compact = (picker === "tiers" || picker === "visual") && packs.length > 2;
  const visualSizes = packs.length > 2 ? "(min-width: 48rem) 10rem, 30vw" : "(min-width: 48rem) 15rem, 44vw";
  return (
    <div className={cx("lp-packs", `lp-packs--${picker}`)} {...rootAttrs} data-stagger="70">
      {packs.map((p) => {
        const uid = `${sid}-pk-${p.index}`;
        const ship = p.freeShipping && !shared;
        const media = cardMedia(picker, display.media, p, imageLed);
        const card = (
          <label
            key={p.id}
            className="lp-pack"
            data-bundle-card={p.id}
            data-selected={p.selected ? "" : undefined}
            data-soldout={p.soldOut ? "" : undefined}
            data-badge={p.badge?.kind}
            data-featured={picker === "tiers" && featured === p.id ? "" : undefined}
            data-cm={media}
            data-bg={surface}
          >
            <Radio pack={p} uid={uid} />
            {picker === "ticket" ? <span className="lp-pack__band" aria-hidden="true" /> : null}
            <Check />
            <Badge pack={p} />
            <SoldOut ctx={ctx} pack={p} />
            {media === "large" ? (
              <PackVisual ctx={ctx} pack={p} sizes={picker === "visual" ? visualSizes : "(min-width: 48rem) 12rem, 36vw"} className="lp-pack__media" />
            ) : media === "thumb" ? (
              <Thumb ctx={ctx} pack={p} compact={compactDensity} />
            ) : media === "qty" ? (
              <Qty ctx={ctx} pack={p} />
            ) : null}
            <Main ctx={ctx} pack={p} id={`${uid}-n`} chips={picker === "visual"} />
            {picker === "ticket" ? (
              <>
                {p.savePct ? (
                  <bdi className="lp-pack__tag" aria-hidden="true">
                    {p.savePct}
                  </bdi>
                ) : null}
                <span className="lp-pack__fields">
                  <PriceBlock ctx={ctx} pack={p} id={`${uid}-p`} label={L.total} />
                  {p.unit ? (
                    <span className="lp-pack__field" aria-hidden="true">
                      <span className="lp-pack__flabel">{L.perUnit}</span>
                      <bdi className="lp-pack__fval">{p.unit}</bdi>
                    </span>
                  ) : null}
                  {p.saved ? (
                    <span className="lp-pack__field lp-pack__field--save" aria-hidden="true">
                      <span className="lp-pack__flabel">{L.youSave}</span>
                      <bdi className="lp-pack__fval">{p.saved}</bdi>
                    </span>
                  ) : null}
                  {ship ? (
                    <span className="lp-pack__field lp-pack__field--ship" aria-hidden="true">
                      <span className="lp-pack__flabel">{ctx.t("form.shipping")}</span>
                      <span className="lp-pack__fval">
                        <Icon name="truck" size="1.1em" />
                        {ctx.t("form.free")}
                      </span>
                    </span>
                  ) : null}
                </span>
                <span className="lp-visually-hidden" id={`${uid}-d`}>
                  {[p.savePct, p.saveAmount, p.perUnit, ship ? ctx.t("bundle.freeShipping") : undefined].filter(Boolean).join(" · ")}
                  <SrExtras ctx={ctx} pack={p} also={p.perks} />
                </span>
              </>
            ) : (
              <>
                <PriceBlock ctx={ctx} pack={p} id={`${uid}-p`} />
                <span className="lp-pack__perks" id={`${uid}-d`}>
                  <Perks ctx={ctx} pack={p} ship={ship} compact={compact} />
                  {picker === "stack" || picker === "visual" ? <PerkList ctx={ctx} pack={p} /> : null}
                  <SrExtras ctx={ctx} pack={p} also={compact ? [p.saveAmount, ...(picker === "tiers" ? p.perks : [])] : picker === "tiers" ? p.perks : undefined} />
                </span>
              </>
            )}
            <Gift ctx={ctx} pack={p} />
          </label>
        );
        // "inline": the units of the selected card follow it (a sibling — controls never nest in the <label>)
        return p.selected && inline ? (
          <Inline key={p.id} card={card}>
            {inline}
          </Inline>
        ) : (
          card
        );
      })}
    </div>
  );
}

function Inline({ card, children }: { card: ReactElement; children: ReactNode }) {
  return (
    <>
      {card}
      {children}
    </>
  );
}

/**
 * pills: a segmented control (short label + total per segment) whose accent thumb glides to the
 * chosen segment, over a detail panel that cross-fades to the chosen offer (composed visual, name,
 * contents, prices, perks, gift). The panel repeats what the radios already describe, so it is
 * hidden from assistive tech; the "inline" units sit under it, outside the hidden panel.
 */
function Segmented({
  ctx,
  sid,
  packs,
  surface,
  rootAttrs,
  inline,
}: {
  ctx: RenderContext;
  sid: string;
  packs: Pack[];
  surface?: SectionBg;
  rootAttrs: Record<string, string | number | undefined>;
  inline?: ReactNode;
}): ReactElement {
  const shared = allFree(packs);
  const shortOnly = packs.some((p) => !p.legacy || !p.sameItem);
  return (
    <div className="lp-packs lp-packs--pills" {...rootAttrs}>
      <div className="lp-seg" data-bg={surface} style={cssVars({ "--n": packs.length })}>
        <span className="lp-seg__thumb" aria-hidden="true" />
        {packs.map((p) => {
          const uid = `${sid}-pk-${p.index}`;
          const ship = p.freeShipping && !shared;
          return (
            <label
              key={p.id}
              className="lp-pack lp-seg__opt"
              data-bundle-card={p.id}
              data-selected={p.selected ? "" : undefined}
              data-soldout={p.soldOut ? "" : undefined}
              data-badge={p.badge?.kind}
            >
              <Radio pack={p} uid={uid} />
              {p.badge ? (
                <span className="lp-seg__badge" aria-hidden="true">
                  {p.badge.text}
                </span>
              ) : null}
              {shortOnly ? (
                <bdi className="lp-seg__qty lp-seg__qty--word" aria-hidden="true">
                  {p.short}
                </bdi>
              ) : (
                <bdi className="lp-seg__qty" dir="ltr" aria-hidden="true">
                  <span className="lp-pack__times">×</span>
                  {ctx.num(p.qty)}
                </bdi>
              )}
              <span className="lp-seg__price" id={`${uid}-p`}>
                {p.fromWord ? <span className="lp-pack__from">{p.fromWord} </span> : null}
                <bdi>{p.total}</bdi>
              </span>
              <span className="lp-visually-hidden" id={`${uid}-n`}>
                {p.name}
              </span>
              <span className="lp-visually-hidden" id={`${uid}-d`}>
                {[
                  p.contentsText || undefined,
                  p.reference ? `${ctx.t("price.was")} ${p.reference}` : undefined,
                  p.savePct,
                  p.saveAmount,
                  p.perUnit,
                  ship ? ctx.t("bundle.freeShipping") : undefined,
                  ...p.perks,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                <SrExtras ctx={ctx} pack={p} />
              </span>
            </label>
          );
        })}
      </div>
      <div className="lp-seg__panel" data-bg={surface} aria-hidden="true">
        {packs.map((p) => (
          <div
            key={p.id}
            className="lp-seg__detail"
            data-bundle-card={p.id}
            data-selected={p.selected ? "" : undefined}
            data-badge={p.badge?.kind}
            data-visual={p.imageLed || p.image ? "" : undefined}
          >
            {p.imageLed || p.image ? <PackVisual ctx={ctx} pack={p} sizes="(min-width: 48rem) 10rem, 34vw" className="lp-seg__media" /> : null}
            <span className="lp-seg__text">
              <Badge pack={p} />
              <Main ctx={ctx} pack={p} />
              <PriceBlock ctx={ctx} pack={p} />
              <span className="lp-pack__perks">
                <Perks ctx={ctx} pack={p} ship={p.freeShipping && !shared} />
                <PerkList ctx={ctx} pack={p} />
              </span>
              <Gift ctx={ctx} pack={p} />
            </span>
          </div>
        ))}
      </div>
      {inline}
    </div>
  );
}
