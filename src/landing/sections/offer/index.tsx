/**
 * Offer showcase — the packs (×1, ×2, ×3…) presented mid-page. Every pack is ONE link
 * (a[data-action="order"][data-bundle][data-bundle-card]): a tap scrolls to the order form with that
 * pack preselected, and the runtime keeps [data-selected] on the shopper's current pack.
 *
 * Variants (docs/SECTIONS.md · v2 modern):
 *  - stacked — a bento: the favourite pack as the hero card (big lit well), the others as compact
 *              cards beside it. Photos stand as a stack of sheets ×qty (iOS-style depth: the copies
 *              peek out above the front sheet and breathe apart on hover / selection); cutouts stand
 *              in depth on a lit floor.
 *  - tickets — (id kept) showcase cards on the page's card tier with one cut corner as the only device: no
 *              perforations, no full-colour pass, no sheen (design.md DES-§5.13 S8): brand + badge header,
 *              the quantity as primary field beside a thumbnail, labelled fields (total · per piece · saving)
 *              and the pill action.
 *  - shelf   — a lit display window: each pack stands on a cylinder podium whose height follows the
 *              quantity (a skyline: the bigger the pack, the higher it stands, "×3" set on its face),
 *              a spotlight that follows the selection, caption cards hanging off the window.
 * All money comes from the shared offer model (src/landing/offers/model.ts, docs/OFFERS.md §E.7):
 * the card price is `from` ("Dès" when choices can cost more), savings only when real, labels per
 * offers.showSavings. Offers of one item ×n keep their art direction (stack, lineup, podium ×n);
 * multi-item, choice and custom-visual offers show the composed visual (§E.6) in the same wells, and
 * their short name ("Duo", "Au choix") where the quantity stood.
 */
import { Fragment, type ReactElement, type ReactNode } from "react";
import { z } from "zod";
import { AssetRef, type SectionBg } from "@/lib/page/schema";
import {
  Icon,
  Money,
  Picture,
  SectionHeader,
  SectionShell,
  TrustRow,
  cssVars,
  cx,
  editAttr,
  frameRegions,
  pictureCrop,
  resolveProductVisual,
  round,
  type TrustItem,
} from "../../primitives";
import { ARCHETYPE_DEFS } from "@/lib/theme/archetypes";
import { defineSection, type RenderContext, type ResolvedAsset } from "../../types";
import { chooseLabel, offerCopy, passLabels } from "./copy";
import { WIDE, fitsCover, photoPlan, type PhotoPlan } from "../orderForm/fit";
import { PlannedPhoto } from "../orderForm/photo";
import { Plain } from "../orderForm/text";
import { allFree, featuredOf, packsOf, type Pack } from "./packs";
import { Lineup, Stack, copiesOf, lineupSpan, type ProductVisual } from "./visuals";
import { OfferVisual } from "../../offers/visual";
import { withRevealScope } from "../reveal-scope";

const VARIANT_IDS = ["stacked", "tickets", "shelf"] as const;
type Variant = (typeof VARIANT_IDS)[number];

const schema = z.object({
  kicker: z.string().max(60).default(""),
  title: z.string().max(140).default(""),
  lead: z.string().max(260).default(""),
  /** button text on every pack; empty → a localized default ("Je prends ce pack") */
  ctaLabel: z.string().max(40).default(""),
  showTrust: z.boolean().default(true),
  /** product picture shown ×qty (default: the cutout, else the first photo) */
  image: AssetRef.optional(),
});
type Data = z.infer<typeof schema>;

interface Common {
  id: string;
  ctx: RenderContext;
  packs: Pack[];
  visual: ProductVisual;
  cta: string;
  /** pack raised as the favourite — none for a lone pack */
  featured: string | null;
  /** the section's own block */
  bg: SectionBg;
  /** card palette ([data-bg]) */
  paper: SectionBg;
}

/**
 * Cards carry the page's own surface whatever block they sit on (a surface card on base / soft and
 * on color blocks, a base card on surface): their [data-bg] palette keeps every text and chip
 * contrast-safe inside them.
 */
const paperOf = (bg: SectionBg): SectionBg => (bg === "surface" ? "base" : "surface");

/** Ids for the accessible name (name, quantity, price, action) and description (perks) of a pack link. */
const idsOf = (id: string, p: Pack) => {
  const u = `${id}-p${p.index}`;
  return { n: `${u}-n`, q: `${u}-q`, p: `${u}-p`, c: `${u}-c`, d: `${u}-d` };
};
type Ids = ReturnType<typeof idsOf>;

/**
 * Visual quantity mark ("×3"), digits per the page locale. The sign is set in the text face: display
 * faces (kufic Arabic ones especially) draw "×" as a heavy star. The outer box keeps the page
 * direction (its logical insets follow RTL); only the figure inside is isolated left-to-right.
 */
const Times = ({ ctx, qty, className }: { ctx: RenderContext; qty: number; className?: string }) => (
  <span className={cx("lp-ofr__times", className)} aria-hidden="true">
    <bdi dir="ltr">
      <span className="lp-ofr__by">×</span>
      {ctx.num(qty)}
    </bdi>
  </span>
);

/** The quantity mark of one item ×n; the short name ("Duo", "Au choix") of any other offer. */
const Mark = ({ ctx, p, className }: { ctx: RenderContext; p: Pack; className?: string }) =>
  p.sameItem ? (
    <Times ctx={ctx} qty={p.qty} className={className} />
  ) : (
    <span className={cx("lp-ofr__times lp-ofr__times--word", className)} aria-hidden="true">
      <bdi>{p.short}</bdi>
    </span>
  );

/** The composed visual (§E.6) of a multi-item / choice / custom offer, in a well of the variant. */
const Composed = ({ ctx, p, sizes, className }: { ctx: RenderContext; p: Pack; sizes: string; className?: string }) => (
  <span className={cx("lp-ov-host lp-ofr__ov", className)} aria-hidden="true">
    <OfferVisual ctx={ctx} view={p} sizes={sizes} max={4} />
  </span>
);

/** Shown by its composition: several items, a choice, or the owner's own visual. */
const composed = (p: Pack) => p.imageLed || (!!p.image && !p.sameItem);

/* ------------------------------------------------------------------ */
/* Shared pieces                                                       */
/* ------------------------------------------------------------------ */

function PackLink({
  id,
  p,
  className,
  featured,
  paper,
  style,
  children,
}: {
  id: string;
  p: Pack;
  className: string;
  featured: boolean;
  /** card palette ([data-bg]); omitted when the pack sits directly on the section */
  paper?: SectionBg;
  style?: ReturnType<typeof cssVars>;
  children: ReactNode;
}) {
  const k = idsOf(id, p);
  return (
    <a
      href="#order"
      className={className}
      data-action="order"
      data-bundle={p.id}
      data-bundle-card={p.id}
      data-featured={featured ? "" : undefined}
      data-badge={p.badge?.kind}
      data-bg={paper}
      style={style}
      aria-labelledby={p.titled || p.contentsText ? `${k.n} ${k.q} ${k.p} ${k.c}` : `${k.n} ${k.p} ${k.c}`}
      aria-describedby={k.d}
    >
      {children}
    </a>
  );
}

function Name({ ctx, p, k }: { ctx: RenderContext; p: Pack; k: Ids }) {
  return (
    <span className="lp-ofr__id">
      <Plain ctx={ctx} className="lp-ofr__name" id={k.n} text={p.name} />
      {p.titled || p.subtitle || p.contentsText ? (
        <span className="lp-ofr__meta">
          {p.titled || p.contentsText ? <bdi id={k.q}>{p.contentsText || p.qtyLabel}</bdi> : null}
          {(p.titled || p.contentsText) && p.subtitle ? <span aria-hidden="true"> · </span> : null}
          {p.subtitle ? <Plain ctx={ctx} text={p.subtitle} /> : null}
        </span>
      ) : null}
    </span>
  );
}

/** Total in big tabular numerals + the genuine reference, struck by one clean hairline. */
function Price({ ctx, p, k }: { ctx: RenderContext; p: Pack; k: Ids }) {
  return (
    <span className="lp-ofr__price" id={k.p}>
      <span className="lp-ofr__now">
        {p.fromWord ? <span className="lp-ofr__from">{p.fromWord} </span> : null}
        <Money ctx={ctx} amount={p.m.total} />
      </span>
      {p.reference ? (
        <>
          {" "}
          <s className="lp-ofr__was lp-price__was">
            <span className="lp-visually-hidden">{ctx.t("price.was")} </span>
            <bdi>{p.reference}</bdi>
          </s>
        </>
      ) : null}
    </span>
  );
}

/** The saving percentage as a solid pill ("−20%"); the amount, when shown, reads in the perks. */
function SaveChip({ p, className }: { p: Pack; className?: string }) {
  if (!p.savePct) return null;
  return (
    <span className={cx("lp-ofr__chip", className)} aria-hidden="true">
      <bdi dir="ltr">{p.savePct}</bdi>
    </span>
  );
}

/**
 * The pack's perks: the saving amount, the per-unit price and free delivery (only when it differs
 * between packs — otherwise the trust row says it once). The element is the link's description, so
 * it also carries, visually hidden, what the pack shows elsewhere (saving chip, badge, gift, and the
 * passes' labelled fields).
 */
function Perks({ ctx, p, k, shared, fields = false }: { ctx: RenderContext; p: Pack; k: Ids; shared: boolean; fields?: boolean }) {
  const amount = fields ? undefined : p.saveAmount;
  const unit = fields ? undefined : p.perUnit;
  const shown: ReactNode[] = [];
  if (amount) shown.push(<span className="lp-ofr__amt">{amount}</span>);
  if (unit) shown.push(<span className="lp-ofr__unit">{unit}</span>);
  if (p.freeShipping && !shared)
    shown.push(
      <span className="lp-ofr__ship">
        <Icon name="truck" size="1.15em" />
        {ctx.t("bundle.freeShipping")}
      </span>,
    );
  const hidden = [
    p.savePct,
    p.saveAmount && !amount ? p.saveAmount : undefined,
    p.perUnit && !unit ? p.perUnit : undefined,
    p.badge?.text,
    p.gift ? `${ctx.t("bundle.gift")}: ${p.gift.label}` : undefined,
  ].filter(Boolean);
  // spoken separators (out of the flex flow) so the description never runs words together
  return (
    <span className="lp-ofr__perks" id={k.d}>
      {shown.map((node, i) => (
        <Fragment key={i}>
          {i ? <span className="lp-visually-hidden"> · </span> : null}
          {node}
        </Fragment>
      ))}
      {hidden.length ? <span className="lp-visually-hidden">{`${shown.length ? " · " : ""}${hidden.join(" · ")}`}</span> : null}
    </span>
  );
}

function Gift({ ctx, p }: { ctx: RenderContext; p: Pack }) {
  if (!p.gift) return null;
  return (
    <span className="lp-ofr__gift" aria-hidden="true">
      {p.gift.asset ? (
        <Picture asset={p.gift.asset} sizes="3rem" alt="" ratio={1} className="lp-ofr__gift-pic" />
      ) : (
        <span className="lp-ofr__gift-pic lp-ofr__gift-ico">
          <Icon name="gift" size="1.2em" />
        </span>
      )}
      <span className="lp-ofr__gift-txt">
        <b>{ctx.t("bundle.gift")}</b>
        <Plain ctx={ctx} text={p.gift.label} />
      </span>
    </span>
  );
}

/** The pack's action, styled as a button (the whole pack is the link). */
function Go({ ctx, k, label, primary, className }: { ctx: RenderContext; k: Ids; label: string; primary: boolean; className?: string }) {
  return (
    <span className={cx("lp-btn lp-btn--m lp-btn--has-icon lp-ofr__go", primary ? "lp-btn--primary" : "lp-btn--secondary", className)}>
      <span className="lp-btn__label" id={k.c} {...editAttr(ctx, "ctaLabel")}>
        {label}
      </span>
      <span className="lp-btn__icon" aria-hidden="true">
        <Icon name="arrow-right" size="1.15em" strokeWidth={2} />
      </span>
    </span>
  );
}

/** Badge as a floating pill on the pack's top edge. */
function Flag({ p, className }: { p: Pack; className?: string }) {
  if (!p.badge) return null;
  return (
    <span className={cx("lp-ofr__flag", className)} aria-hidden="true">
      {p.badge.kind === "custom" ? null : <Icon name={p.badge.kind === "best" ? "tag" : "star"} size="1.05em" strokeWidth={2} />}
      <bdi>{p.badge.text}</bdi>
    </span>
  );
}

/** Check disc on the pack the shopper has now — pops in when the runtime selects it. */
const Check = () => (
  <span className="lp-ofr__check" aria-hidden="true">
    <Icon name="check" size="0.95em" strokeWidth={3} />
  </span>
);

/* ------------------------------------------------------------------ */
/* stacked → bento: the favourite as the hero card                     */
/* ------------------------------------------------------------------ */

function Stacked({ id, ctx, packs, visual, cta, featured, paper }: Common) {
  const shared = allFree(packs);
  return (
    <ul className="lp-ofr__list lp-stk" role="list" data-n={packs.length} data-stagger="90">
      {packs.map((p) => {
        const k = idsOf(id, p);
        const isFeat = p.id === featured;
        const asset = p.image ?? visual.asset;
        const look = composed(p) ? "ov" : !asset ? "none" : asset.alpha ? "line" : "stack";
        const sizes = isFeat ? "(min-width: 64rem) 16rem, 34vw" : "(min-width: 64rem) 11rem, 30vw";
        return (
          <li key={p.id} className="lp-ofr__li" data-feat={isFeat ? "" : undefined} data-reveal={isFeat ? "scale-in" : "rise"}>
            <PackLink id={id} p={p} className="lp-ofr__card lp-ofr__raised lp-stk__card" featured={isFeat} paper={paper}>
              <span className="lp-stk__media" data-look={look}>
                {look === "ov" ? (
                  <Composed ctx={ctx} p={p} sizes={sizes} className="lp-stk__ov" />
                ) : look === "none" ? (
                  <Times ctx={ctx} qty={p.qty} className="lp-stk__num" />
                ) : (
                  <>
                    {look === "stack" ? (
                      <Stack ctx={ctx} pack={p} visual={visual} sizes={sizes} square={isFeat && (packs.length === 3 || packs.length === 4)} />
                    ) : (
                      <Lineup ctx={ctx} pack={p} visual={visual} sizes={sizes} max={4} />
                    )}
                    <Times ctx={ctx} qty={p.qty} className="lp-stk__x lp-glass" />
                  </>
                )}
                <SaveChip p={p} className="lp-stk__chip" />
              </span>
              <Flag p={p} />
              <Check />
              <span className="lp-stk__body">
                <Name ctx={ctx} p={p} k={k} />
                <Price ctx={ctx} p={p} k={k} />
                <Perks ctx={ctx} p={p} k={k} shared={shared} />
              </span>
              <Gift ctx={ctx} p={p} />
              <Go ctx={ctx} k={k} label={cta} primary={isFeat || packs.length === 1} />
            </PackLink>
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* tickets → showcase cards with one cut corner                        */
/* ------------------------------------------------------------------ */

function Passes({ id, ctx, packs, visual, cta, featured, paper }: Common) {
  const shared = allFree(packs);
  const L = passLabels(ctx.locale);
  const brand = ctx.store.name.trim() || ctx.product.name;
  return (
    <ul className="lp-ofr__list lp-pass-list" role="list" data-n={packs.length} data-stagger="110">
      {packs.map((p) => {
        const k = idsOf(id, p);
        const isFeat = p.id === featured;
        const asset = p.image ?? visual.asset;
        const art = composed(p) ? "ov" : !asset ? "none" : asset.alpha ? "cutout" : "photo";
        const plan = art === "photo" ? photoPlan(asset) : null;
        return (
          <li key={p.id} className="lp-ofr__li" data-feat={isFeat ? "" : undefined} data-reveal="tilt-in">
            <PackLink id={id} p={p} className="lp-ofr__card lp-pass" featured={isFeat} paper={paper}>
              <span className="lp-pass__head">
                <bdi className="lp-pass__brand">{brand}</bdi>
                {p.badge ? <bdi className="lp-pass__badge">{p.badge.text}</bdi> : null}
              </span>
              <span className="lp-pass__hero" data-art={art === "ov" ? "photo" : art} data-ov={art === "ov" ? "" : undefined}>
                <span className="lp-pass__primary">
                  <span className="lp-pass__label" aria-hidden="true">
                    {L.qty}
                  </span>
                  <Mark ctx={ctx} p={p} className="lp-pass__x" />
                  <Name ctx={ctx} p={p} k={k} />
                </span>
                {art === "ov" ? (
                  <span className="lp-pass__thumb lp-pass__thumb--ov" aria-hidden="true">
                    <Composed ctx={ctx} p={p} sizes="(min-width: 64rem) 10rem, 36vw" />
                  </span>
                ) : null}
                {art === "photo" && asset && plan ? (
                  <span className="lp-pass__thumb" data-wide={plan.wide ? "" : undefined} aria-hidden="true">
                    <PlannedPhoto asset={asset} sizes="(min-width: 64rem) 10rem, 36vw" plan={plan} />
                  </span>
                ) : null}
                {art === "cutout" ? (
                  <span className="lp-pass__thumb" aria-hidden="true">
                    <Lineup ctx={ctx} pack={p} visual={visual} sizes="(min-width: 64rem) 8rem, 24vw" max={3} />
                  </span>
                ) : null}
              </span>
              <Check />
              <span className="lp-pass__body">
                <span className="lp-pass__fields">
                  <span className="lp-pass__f lp-pass__f--total">
                    <span className="lp-pass__label" aria-hidden="true">
                      {L.total}
                    </span>
                    <Price ctx={ctx} p={p} k={k} />
                  </span>
                  {p.unitPrice ? (
                    <span className="lp-pass__f" aria-hidden="true">
                      <span className="lp-pass__label">{L.unit}</span>
                      <bdi className="lp-pass__v">{p.unitPrice}</bdi>
                    </span>
                  ) : null}
                  {p.savePct || p.saveMoney ? (
                    <span className="lp-pass__f lp-pass__f--save" aria-hidden="true">
                      <span className="lp-pass__label">{L.save}</span>
                      {p.savePct ? (
                        <bdi className="lp-pass__v" dir="ltr">
                          {p.savePct}
                        </bdi>
                      ) : (
                        <span className="lp-pass__v">
                          <Money ctx={ctx} amount={p.m.savings} />
                        </span>
                      )}
                      {p.savePct && p.saveMoney ? <bdi className="lp-pass__sub">{p.saveMoney}</bdi> : null}
                    </span>
                  ) : null}
                </span>
                <Perks ctx={ctx} p={p} k={k} shared={shared} fields />
                <Gift ctx={ctx} p={p} />
                <Go ctx={ctx} k={k} label={cta} primary className="lp-pass__go" />
              </span>
            </PackLink>
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* shelf → lit display window, podiums by quantity                     */
/* ------------------------------------------------------------------ */

/** Most cutout copies standing on one podium. */
const SHELF_MAX = 3;

/**
 * The photo tile's window on the podium, in the page's own shape (offer.shelf.css: an arch head, a
 * 2:3 capsule, a disc, else a 4:5 soft panel) — the photo is fitted subject-first to that exact frame.
 */
/** A wide product's tile turns landscape (a disc stays a disc); too wide even then: shown whole. */
function shelfPlan(asset: ResolvedAsset | null, tile: { shape: "arch" | "pill" | "circle" | "rounded"; ratio: number }): PhotoPlan {
  if (tile.shape === "circle") return { wide: false, fit: fitsCover(asset, 1) ? "cover" : "contain", ratio: 1 };
  return photoPlan(asset, tile.ratio, tile.shape === "pill" ? 3 / 2 : WIDE);
}

/**
 * Phones: the pack's flag sits in a top corner of the podium stage, where a tall tile's top meets it.
 * "end" when the start corner would cover a face or a hand of the photo (or clearly more of the
 * product) than the end corner — the tile fitted to its window exactly as <Picture> crops it.
 */
function flagSide(ctx: RenderContext, asset: ResolvedAsset | null, plan: PhotoPlan | null, tile: { shape: "arch" | "pill" | "circle" | "rounded" }): "end" | undefined {
  if (!asset || asset.alpha || !plan || plan.fit !== "cover" || !asset.subjectKind || asset.subjectKind === "none") return undefined;
  const reg = frameRegions(asset, plan.ratio, pictureCrop(asset, { frame: { shape: tile.shape, ratio: plan.ratio } }));
  const rtl = ctx.dir === "rtl";
  const cost = (left: boolean) => {
    // the flag's reach into the tile's top band (tile fractions; it overhangs the tile's side)
    const z = { x: left ? -0.2 : 0.55, y: -0.12, w: 0.65, h: 0.3 };
    const a = (b: { x: number; y: number; w: number; h: number }) =>
      Math.max(0, Math.min(z.x + z.w, b.x + b.w) - Math.max(z.x, b.x)) * Math.max(0, Math.min(z.y + z.h, b.y + b.h) - Math.max(z.y, b.y));
    return reg.heads.reduce((c, b) => c + 100 * a(b), 0) + reg.hands.reduce((c, b) => c + 30 * a(b), 0) + (asset.subjectKind === "product" ? 2 * a(reg.subject) : 0);
  };
  const start = cost(!rtl);
  const end = cost(rtl);
  return end + 0.05 < start ? "end" : undefined;
}

function tileFrame(ctx: RenderContext): { shape: "arch" | "pill" | "circle" | "rounded"; ratio: number } {
  const mask = ARCHETYPE_DEFS[ctx.archetype]?.mask;
  if (mask === "arch") return { shape: "arch", ratio: 4 / 5 };
  if (mask === "pill") return { shape: "pill", ratio: 2 / 3 };
  if (mask === "circle") return { shape: "circle", ratio: 1 };
  return { shape: "rounded", ratio: 4 / 5 };
}

function Shelf({ id, ctx, packs, visual, cta, featured, paper }: Common) {
  const shared = allFree(packs);
  // podium height by quantity rank: the bigger the pack, the higher it stands (contents count by units)
  const qtys = [...new Set(packs.map((p) => p.qty))].sort((a, b) => a - b);
  const lvlOf = (p: Pack) => (qtys.length > 1 ? round(qtys.indexOf(p.qty) / (qtys.length - 1), 3) : 0.5);
  // one product scale for the whole window: every group is sized against the widest one
  const groupOf = (p: Pack) => {
    const a = p.image ?? visual.asset;
    // a composition (several items, a choice) stands as one landscape group
    if (composed(p)) return 1.8;
    return a?.alpha && !p.image ? 1 + lineupSpan(copiesOf(p.qty, SHELF_MAX)) : 1;
  };
  const widest = Math.max(...packs.map(groupOf));
  const tile = tileFrame(ctx);
  const sizes = packs.length > 3 ? "(min-width: 64rem) 9rem, 24vw" : "(min-width: 64rem) 11rem, 26vw";
  return (
    <ul className="lp-shf" role="list" data-n={packs.length} data-stagger="110" style={cssVars({ "--n": packs.length, "--ws": round(widest, 3) })}>
      {packs.map((p) => {
        const k = idsOf(id, p);
        const isFeat = p.id === featured;
        const asset = p.image ?? visual.asset;
        const gs = groupOf(p);
        const look = composed(p) ? "ov" : !asset ? "none" : asset.alpha ? "cutout" : "photo";
        return (
          <li key={p.id} className="lp-shf__slot" data-reveal="rise" data-wide={look === "photo" && shelfPlan(asset, tile).wide ? "" : undefined}>
            <PackLink
              id={id}
              p={p}
              className="lp-ofr__card lp-shf__pack"
              featured={isFeat}
              style={cssVars({ "--lvl": lvlOf(p), "--gs": round(gs, 3), "--gr": round(gs * 0.8, 4) })}
            >
              <span className="lp-shf__stage" data-look={look === "ov" ? "photo" : look} data-ov={look === "ov" ? "" : undefined} data-flag={p.badge && look === "photo" ? flagSide(ctx, asset, shelfPlan(asset, tile), tile) : undefined}>
                <span className="lp-shf__plinth" aria-hidden="true">
                  {look === "none" ? null : <Mark ctx={ctx} p={p} className="lp-shf__face" />}
                </span>
                <span className="lp-shf__group">
                  {look === "cutout" ? (
                    <Lineup ctx={ctx} pack={p} visual={visual} sizes={sizes} max={SHELF_MAX} width={round(1 / gs, 4)} />
                  ) : look === "ov" ? (
                    <span className="lp-shf__tile lp-shf__tile--ov" aria-hidden="true">
                      <Composed ctx={ctx} p={p} sizes={sizes} />
                    </span>
                  ) : look === "photo" ? (
                    <span className="lp-shf__tile" aria-hidden="true">
                      {asset ? <PlannedPhoto asset={asset} sizes={sizes} plan={shelfPlan(asset, tile)} shape={tile.shape} /> : null}
                    </span>
                  ) : (
                    <Times ctx={ctx} qty={p.qty} className="lp-shf__num" />
                  )}
                </span>
                <Flag p={p} className="lp-shf__flag" />
              </span>
              <span className="lp-shf__cap" data-bg={paper}>
                <Check />
                <Name ctx={ctx} p={p} k={k} />
                <Price ctx={ctx} p={p} k={k} />
                <SaveChip p={p} className="lp-shf__chip" />
                <Perks ctx={ctx} p={p} k={k} shared={shared} />
                <Gift ctx={ctx} p={p} />
                <span className="lp-shf__go">
                  <span id={k.c} {...editAttr(ctx, "ctaLabel")}>
                    {cta}
                  </span>
                  <Icon name="arrow-right" size="1.05em" strokeWidth={2} />
                </span>
              </span>
            </PackLink>
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------------ */

function Foot({ ctx, packs, show, className }: { ctx: RenderContext; packs: Pack[]; show: boolean; className?: string }) {
  if (!show) return null;
  const items: TrustItem[] = [
    { icon: "cash-hand", text: ctx.t("trust.cod") },
    { icon: "truck", text: allFree(packs) ? ctx.t("bundle.freeShipping") : ctx.t("trust.delivery") },
    { icon: "eye", text: ctx.t("trust.check") },
  ];
  return <TrustRow ctx={ctx} items={items} size="s" className={cx("lp-ofr__trust", className)} />;
}

function render({ id, variant, bg, data, ctx }: { id: string; variant: string; bg: SectionBg; data: Data; ctx: RenderContext }): ReactElement | null {
  const v: Variant = (VARIANT_IDS as readonly string[]).includes(variant) ? (variant as Variant) : "stacked";
  const packs = packsOf(ctx);
  if (!packs.length) return null;
  const titleId = `${id}-title`;
  const hasTitle = !!data.title.trim();
  const visual = resolveProductVisual(ctx, data.image ? ctx.asset(data.image) : undefined);
  const common: Common = {
    id,
    ctx,
    packs,
    visual,
    cta: data.ctaLabel.trim() || chooseLabel(ctx.locale, packs.length === 1),
    featured: featuredOf(packs),
    bg,
    paper: paperOf(bg),
  };
  // the window is symmetric: a centred heading, reassurance under it. Cards and passes take an
  // editorial split heading (title | lead + reassurance); a lone pass sits beside a sticky heading.
  const lone = packs.length === 1;
  const head = v === "shelf" ? "center" : v === "tickets" && lone ? "start" : "split";
  const foot = <Foot ctx={ctx} packs={packs} show={data.showTrust} />;
  return (
    <SectionShell
      id={id}
      ctx={ctx}
      type="offer"
      variant={v}
      bg={bg}
      labelledBy={hasTitle ? titleId : undefined}
      label={hasTitle ? undefined : ctx.t("cta.seeOffers")}
    >
      <div className={cx("lp-container lp-ofr", head === "start" && "lp-ofr--aside")}>
        <SectionHeader
          ctx={ctx}
          kicker={data.kicker}
          title={data.title}
          lead={data.lead}
          align={head}
          editBase=""
          titleId={titleId}
          className="lp-ofr__head"
        >
          {head === "center" ? null : foot}
        </SectionHeader>
        <div className="lp-ofr__stage">
          {v === "tickets" ? <Passes {...common} /> : v === "shelf" ? <Shelf {...common} /> : <Stacked {...common} />}
          {head === "center" ? foot : null}
        </div>
      </div>
    </SectionShell>
  );
}

export default withRevealScope(defineSection({
  type: "offer",
  label: "Offer showcase",
  labelFr: "Vitrine des offres",
  category: "offer",
  description: "Your packs (×1, ×2, ×3…) side by side; tapping one jumps to the order form with it preselected.",
  variants: [
    {
      id: "stacked",
      label: "Stacked cards",
      description: "A bento of cards: the favourite pack as the hero, the product stacked ×quantity in a lit well.",
    },
    {
      id: "tickets",
      label: "Wallet passes",
      description: "Full-colour wallet passes: the product strip with a huge quantity, labelled price fields.",
      archetypes: ["souk", "circuit", "kinetic", "editorial", "garage"],
    },
    {
      id: "shelf",
      label: "Display window",
      description: "A lit window: each pack on a podium that rises with the quantity, a spotlight on the selection.",
      archetypes: ["bloom", "maison", "apothecary", "kinetic", "hearth"],
    },
  ],
  schema,
  defaults: ({ locale, product, offers, rng }) => {
    const c = offerCopy(locale, product, offers, rng);
    return { kicker: c.kicker, title: c.title, lead: c.lead, ctaLabel: "", showTrust: true };
  },
  fields: [
    {
      kind: "group",
      label: "Heading",
      fields: [
        { kind: "text", path: "kicker", label: "Kicker", max: 60, help: "Small line above the title." },
        { kind: "text", path: "title", label: "Title", max: 140, help: "Wrap a word in *stars* to emphasize it." },
        { kind: "textarea", path: "lead", label: "Intro", max: 260, rows: 2 },
      ],
    },
    {
      kind: "group",
      label: "Packs",
      fields: [
        {
          kind: "text",
          path: "ctaLabel",
          label: "Button text",
          max: 40,
          help: "Same on every pack. Leave empty for the default. Prices, savings, badges and gifts come from Offers.",
        },
        {
          kind: "image",
          path: "image",
          label: "Product picture",
          help: "Shown ×quantity on each pack. Defaults to the cutout, else the first photo. A pack's own photo always wins.",
        },
        { kind: "toggle", path: "showTrust", label: "Reassurance line", help: "Cash on delivery · delivery · check before paying, with the heading (under the window for the display window)." },
      ],
    },
  ],
  render,
}));
