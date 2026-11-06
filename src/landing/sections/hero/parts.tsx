/**
 * Shared hero building blocks: facts derived from the real product/offer data (pack savings,
 * photos, trust points), the headline / kicker / lead / price / CTA atoms every composition reuses,
 * the "×2 −10% · ×3 −20%" pack teaser and the glass callout with its leader line.
 */
import type { ReactElement, ReactNode } from "react";
import { everyOfferFree, fromCents } from "@/lib/page/pricing";
import { defaultOfferView, offerViews } from "../../offers/model";
import type { Archetype } from "@/lib/page/schema";
import { ARCHETYPE_DEFS } from "@/lib/theme/archetypes";
import { fontData } from "@/lib/theme/fonts";
import {
  cssVars,
  Cta,
  cx,
  defaultTrustItems,
  isIconName,
  Kicker,
  Price,
  reveal,
  RichText,
  stagePhotoFrame,
  Stars,
  TrustRow,
  type StageKind,
  type TrustItem,
} from "../../primitives";
import type { RenderContext, ResolvedAsset, SectionProps } from "../../types";
import { bigWordOf, micro } from "./copy";
import { headsClear, visualFacts } from "./framing";
import type { HeroData, HeroNoteData } from "./schema";

export type HeroProps = SectionProps<HeroData>;

export const titleId = (id: string) => `${id}-title`;

/** Deterministic pick from a list (seeded per section + key). */
export function pick<T>(ctx: RenderContext, key: string, list: readonly T[]): T {
  return list[Math.floor(ctx.rng(key)() * list.length) % list.length]!;
}

/* ------------------------------------------------------------------ */
/* Facts from real data                                                */
/* ------------------------------------------------------------------ */

export interface PackSaving {
  bundleId: string;
  qty: number;
  pct: number;
  /** teaser label: "×2" for one item ×n, else the offer's short name ("Duo", "2 au choix") — never "×2" for a duo */
  label: string;
  /** one item ×n (a "×n" teaser is honest) */
  sameItem: boolean;
}

/**
 * Multi-unit packs that genuinely save money, for the "×2 / ×3" teaser: the smallest pack plus the
 * best-saving one (at most two, ordered by quantity). Empty when no pack saves anything.
 */
export function packSavings(ctx: RenderContext): PackSaving[] {
  const all: PackSaving[] = [];
  for (const v of offerViews(ctx)) {
    if (v.qty < 2 || v.soldOut) continue;
    if (v.math.showReference && v.math.savingsPct >= 1) all.push({ bundleId: v.id, qty: v.qty, pct: v.math.savingsPct, label: v.sameItem ? `×${ctx.num(v.qty)}` : v.short, sameItem: v.sameItem });
  }
  if (all.length <= 2) return all.sort((a, b) => a.qty - b.qty);
  const byQty = [...all].sort((a, b) => a.qty - b.qty);
  const first = byQty[0]!;
  const best = all.reduce((x, y) => (y.pct > x.pct ? y : x), byQty[1]!);
  return best.bundleId === first.bundleId ? byQty.slice(0, 2) : [first, best];
}

/** Free delivery is only claimed when it is true for every pack and no fee is added. */
export function freeShipping(ctx: RenderContext): boolean {
  return everyOfferFree(ctx.doc);
}

export function heroTrust(ctx: RenderContext, data: HeroData, max = 3): TrustItem[] {
  const items = data.trust.filter((t) => t.text.trim()).map((t) => ({ icon: isIconName(t.icon) ? t.icon : "check", text: t.text }));
  return (items.length ? items : defaultTrustItems(ctx)).slice(0, max);
}

/** The hero's main visual: explicit image → product cutout → first product photo. */
export function mainAsset(ctx: RenderContext, data: HeroData): ResolvedAsset | null {
  return ctx.asset(data.image) ?? ctx.asset(ctx.product.cutout) ?? ctx.asset(ctx.product.images[0]);
}

/** Photos for collages and galleries: explicit image + extra images, then product photos (unique). */
export function heroPhotos(ctx: RenderContext, data: HeroData, max: number): ResolvedAsset[] {
  const out: ResolvedAsset[] = [];
  const seen = new Set<string>();
  for (const ref of [data.image, ...data.images, ...ctx.product.images]) {
    const a = ctx.asset(ref);
    if (!a || seen.has(a.id)) continue;
    seen.add(a.id);
    out.push(a);
    if (out.length >= max) break;
  }
  if (!out.length) {
    const cut = ctx.asset(ctx.product.cutout);
    if (cut) out.push(cut);
  }
  return out;
}

/** The giant display word: the merchant's word, else the product's brand-like word. */
export function heroWord(ctx: RenderContext, data: HeroData): string {
  return [...(data.bigWord.trim() || bigWordOf(ctx.product.name))].slice(0, 16).join("");
}

const ARABIC_LETTER = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-ﻼ]/;

/**
 * Average advance (em per character) of the giant word in the page's display face, so the word is
 * sized to its column instead of guessed from its letter count: the face's measured lowercase
 * average (font manifest), heavier at display weight, wider again in capitals; Arabic letter shapes
 * vary too much per word for a metric, so a middle value (0.35–0.57 measured) — the CSS fades the
 * word's ends softly into the column edges, so a wider word never shows a hard cut.
 */
export function wordAdvance(ctx: RenderContext, word: string): number {
  if (ARABIC_LETTER.test(word)) return 0.5;
  const id = ctx.locale === "ar" ? ctx.doc.theme.fonts.displayAr : ctx.doc.theme.fonts.display;
  const m = fontData(id)?.metrics;
  const base = m && m.unitsPerEm > 0 ? m.xWidthAvg / m.unitsPerEm : 0.46;
  const upper = ctx.locale !== "ar" && ARCHETYPE_DEFS[ctx.archetype].display.case === "uppercase";
  return Math.round(Math.min(0.75, Math.max(0.34, base * (upper ? 1.75 : 1.2))) * 1000) / 1000;
}

/** Filled notes with their original index (edit paths stay stable when a middle note is empty). */
export function heroNotes(data: HeroData, max: number): { note: HeroNoteData; i: number }[] {
  return data.notes
    .map((note, i) => ({ note, i }))
    .filter((n) => n.note.title.trim())
    .slice(0, max);
}

/** Product stage per archetype (first = most characteristic; the seed picks among them). */
export const STAGES_BY_ARCH: Record<Archetype, readonly StageKind[]> = {
  maison: ["arch", "halo"],
  apothecary: ["halo", "frame"],
  souk: ["arch"],
  playground: ["blob", "halo"],
  kinetic: ["slab"],
  circuit: ["frame"],
  hearth: ["podium", "blob"],
  bloom: ["halo", "blob"],
  field: ["arch", "blob"],
  editorial: ["frame", "arch"],
  garage: ["slab", "frame"],
};

/** Soft languages show a photo that fits none of their sets on a plain lit window, precise ones on glass. */
const PLAIN_STAGE: ReadonlySet<Archetype> = new Set<Archetype>(["maison", "souk", "playground", "hearth", "bloom", "field"]);

/**
 * The archetype's stage for this visual. A regular photo only gets a set whose window shows it
 * whole: a wide product (a massage gun on its side) never goes in an arch, a disc or a blob; people
 * never in a disc (a standing figure would lose the garment), and in an arch or a blob only when
 * every head stays inside its curve. Nothing fitting → a plain rounded window (soft languages) or
 * the glass mat (precise ones).
 */
export function heroStage(ctx: RenderContext, key: string, asset: ResolvedAsset | null, R: number): StageKind {
  const list = STAGES_BY_ARCH[ctx.archetype];
  const facts = visualFacts(asset);
  if (facts.kind !== "photo" || !asset) return pick(ctx, key, list);
  const fits = list.filter((s) => {
    const curved = s === "arch" || s === "halo" || s === "blob";
    if (curved && facts.need > 1) return false;
    if (!facts.person) return true;
    if (s === "halo") return false;
    if (!curved) return true;
    const w = stagePhotoFrame(s, R);
    return headsClear(asset, w.shape, w.ratio);
  });
  return fits.length ? pick(ctx, key, fits) : PLAIN_STAGE.has(ctx.archetype) ? "podium" : "frame";
}

/* ------------------------------------------------------------------ */
/* Atoms                                                               */
/* ------------------------------------------------------------------ */

/** U+2060 WORD JOINER: invisible, glyph-free, forbids a line break on either side. */
const WJ = String.fromCharCode(0x2060);

/**
 * Hyphenated compounds ("week-end", "anti-âge", "porte-monnaie") never break across two lines of a
 * balanced headline or lead: "week-" at the end of a line and "end" on the next reads as a typo.
 */
export const holdCompounds = (text: string): string => text.replace(/(\p{L})-(?=\p{L})/gu, `$1-${WJ}`);

interface AtomProps {
  ctx: RenderContext;
  data: HeroData;
  className?: string;
}

/** Visible characters past which a headline steps down: one size on wide screens (three lines,
    never four), a second for a very long promise (phones too), a third for the 140-character edge. */
const LONG_TITLE = 30;
const XLONG_TITLE = 60;
const XXLONG_TITLE = 90;

/** The page's single h1. Never hidden by a reveal (it is the LCP text); its *emphasis* still draws in. */
export function HeroTitle({ ctx, data, id, className }: AtomProps & { id: string }): ReactElement {
  const text = data.title.trim() || ctx.product.name;
  const n = [...text.replace(/\*/g, "")].length;
  return (
    <RichText
      as="h1"
      id={titleId(id)}
      className={cx(
        "lp-h1 lp-hero__title",
        n > LONG_TITLE && "lp-hero__title--long",
        n > XLONG_TITLE && "lp-hero__title--xlong",
        n > XXLONG_TITLE && "lp-hero__title--xxlong",
        className,
      )}
      text={holdCompounds(text)}
      ctx={ctx}
      editPath="title"
    />
  );
}

/** Kicker + real rating on one line. */
export function HeroMeta({ ctx, data, className, kicker = true }: AtomProps & { kicker?: boolean }): ReactElement | null {
  const rating = ctx.product.rating && data.showRating ? ctx.product.rating : null;
  const hasKicker = kicker && !!data.kicker.trim();
  if (!hasKicker && !rating) return null;
  return (
    <div className={cx("lp-hero__meta", className)} {...reveal("fade")}>
      {hasKicker ? <Kicker ctx={ctx} text={data.kicker} className="lp-hero__kicker" editPath="kicker" /> : null}
      {rating ? <HeroRating ctx={ctx} value={rating.value} count={rating.count} /> : null}
    </div>
  );
}

export function HeroRating({ ctx, value, count, className }: { ctx: RenderContext; value: number; count?: number; className?: string }) {
  return (
    <span className={cx("lp-hero__rating", className)}>
      <Stars ctx={ctx} value={value} count={count} size="s" showValue showCount={count !== undefined} />
    </span>
  );
}

export function HeroLead({ ctx, data, className, delay = 120 }: AtomProps & { delay?: number }) {
  return (
    <RichText
      as="p"
      className={cx("lp-hero__lead", className)}
      text={holdCompounds(data.subtitle)}
      ctx={ctx}
      editPath="subtitle"
      reveal="blur-in"
      delay={delay}
      decorate={false}
    />
  );
}

/**
 * The hero price: the lead item's unit price on single-item pages; on multi-item pages the default
 * offer (docs/OFFERS.md §B.2) — its `from` price ("À partir de" when the choices can cost more) and
 * its struck reference when the saving is real.
 */
export function heroPrice(ctx: RenderContext): { amount: number; compareAt?: number; from: boolean } {
  if (ctx.items.length < 2) return { amount: ctx.lead.price, compareAt: ctx.lead.compareAt, from: false };
  const v = defaultOfferView(ctx);
  if (!v) return { amount: ctx.lead.price, compareAt: ctx.lead.compareAt, from: false };
  return { amount: fromCents(v.math.from), compareAt: v.math.showReference ? fromCents(v.math.displayReference) : undefined, from: v.variable };
}

export function HeroPrice({ ctx, className, size = "l", savings = true }: { ctx: RenderContext; className?: string; size?: "m" | "l" | "xl"; savings?: boolean }) {
  const hp = heroPrice(ctx);
  return (
    <Price
      ctx={ctx}
      amount={hp.amount}
      compareAt={hp.compareAt}
      from={hp.from}
      size={size}
      showSavings={savings}
      className={cx("lp-hero__price", className)}
    />
  );
}

/** Visible characters past which the hero button steps its label down a size (one line, never two). */
const LONG_CTA = 22;

export function HeroCta({ ctx, data, className, size = "xl", variant }: AtomProps & { size?: "l" | "xl"; variant?: "primary" | "glass" }) {
  const label = (data.ctaLabel.trim() || ctx.t("cta.orderNow")).replace(/\*/g, "");
  // the price pill inside the button takes about eight characters of room
  const n = [...label].length + (data.ctaPrice ? 8 : 0);
  return (
    <Cta
      ctx={ctx}
      label={data.ctaLabel}
      withPrice={data.ctaPrice}
      hero
      size={size}
      wide
      variant={variant}
      className={cx("lp-hero__cta", n > LONG_CTA && "lp-hero__cta--long", className)}
      editPath="ctaLabel"
    />
  );
}

/** The type of the next visible section after this one (read-only cross-section info). */
function nextSectionType(ctx: RenderContext, id: string): string | undefined {
  const list = ctx.doc.sections.filter((s) => !s.hidden);
  const at = list.findIndex((s) => s.id === id);
  return at >= 0 ? list[at + 1]?.type : undefined;
}

/**
 * The promises under the button. When a trust bar opens the next section it carries the full set,
 * so the hero keeps only its lead promise (cash on delivery, right under the action) instead of
 * printing the same three lines twice in a row.
 */
export function HeroTrust({
  ctx,
  data,
  id,
  className,
  layout = "inline",
  max = 3,
}: AtomProps & { id: string; layout?: "inline" | "grid" | "stack"; max?: number }) {
  const n = nextSectionType(ctx, id) === "trustBar" ? 1 : max;
  return <TrustRow ctx={ctx} items={heroTrust(ctx, data, n)} layout={layout} size="s" className={cx("lp-hero__trust", className)} />;
}

/**
 * The action line of the sheets H6-H10 (DES-§5.13): the price cluster and the button on one line (wrapping under the
 * price only when both cannot fit), then the COD line, the hero's lead promise. The cluster is one unit (Price).
 */
export function HeroAct({ ctx, data, id, className, delay, cod = true }: AtomProps & { id: string; delay?: number; cod?: boolean }): ReactElement {
  return (
    <div className={cx("lp-hero__act", className)} {...reveal("rise", delay)}>
      <div className="lp-hero__act-row">
        <HeroPrice ctx={ctx} size="m" />
        <HeroCta ctx={ctx} data={data} size="l" />
      </div>
      {cod ? <HeroTrust ctx={ctx} data={data} id={id} max={1} /> : null}
    </div>
  );
}

/** The resolution rule of the slots (DES-§4.11 H13, I6): the asset covers `cssWidth` CSS px at DPR 2 with 1.5 × room. */
export const covers = (asset: ResolvedAsset | null | undefined, cssWidth: number, k = 1.5): boolean => !!asset && asset.width >= cssWidth * 2 * k;

/**
 * "×2 −10% · ×3 −20%": the genuine pack savings as a compact segmented glass pill. Every segment
 * is a real link — it scrolls to the form with that pack preselected. Nothing when no pack saves.
 */
export function PackTeaser({ ctx, data, className, delay, label = true }: AtomProps & { delay?: number; label?: boolean }): ReactElement | null {
  const packs = data.showTeaser ? packSavings(ctx) : [];
  if (!packs.length) return null;
  return (
    <p className={cx("lp-hero__packs", className)} {...reveal("rise", delay)}>
      {label ? <span className="lp-hero__packs-label">{micro(ctx.locale, "packs")}</span> : null}
      {packs.map((p) => (
        <a key={p.bundleId} href="#order" className="lp-hero__pack" data-action="order" data-bundle={p.bundleId}>
          <span className="lp-visually-hidden">{micro(ctx.locale, "pack")} </span>
          <bdi className="lp-hero__pack-q" dir="ltr">
            ×{p.qty}
          </bdi>
          <bdi className="lp-hero__pack-s" dir="ltr">
            {ctx.t("bundle.savePct", { pct: p.pct })}
          </bdi>
        </a>
      ))}
    </p>
  );
}

/**
 * A merchant-written note line (callout, cover line, chip, bullet, masthead): through RichText, so
 * ranges and signs keep their order in Arabic ("24–48", "−20%") and *emphasis* stays a plain accent.
 */
export function NoteText({ ctx, text, className, editPath }: { ctx: RenderContext; text: string; className: string; editPath: string }) {
  return <RichText as="span" className={className} text={text} ctx={ctx} editPath={editPath} decorate={false} />;
}

/** "en pack ×3": the "×n" quantity reads left to right in every language, like the pack chips. */
export function withQty(text: string): ReactNode {
  const parts = text.split(/(×\s?\d+)/);
  if (parts.length === 1) return text;
  return parts.map((p, k) =>
    k % 2 ? (
      <bdi key={k} dir="ltr">
        {p}
      </bdi>
    ) : (
      p
    ),
  );
}

/**
 * The page may use glass (G16, DES-§4.10): a document without look keeps today's glass callouts; a look with
 * `glass: 0` draws them as hairline cards instead (DES-§4.5.4 hero:spec, V06).
 */
export const glassAllowed = (ctx: RenderContext): boolean => (ctx.doc.theme.look?.glass ?? 1) > 0;

/**
 * Frosted glass callout (a hairline card where the page has no glass) with a precise leader line (hairline + ringed
 * end dot) that reaches toward the product from the chip's `side` (the side of the product the chip sits on).
 */
export function Callout({
  ctx,
  note,
  i,
  slot,
  side,
  delay,
  n,
  top,
}: {
  ctx: RenderContext;
  note: HeroNoteData;
  i: number;
  slot: number;
  side: "start" | "end";
  delay: number;
  /** optional index label ("01") for spec sheets */
  n?: string;
  /** computed height of the slot (% of the stage), clear of faces — else the slot's default */
  top?: number;
}): ReactElement {
  return (
    <li
      className={glassAllowed(ctx) ? "lp-hero__callout lp-glass" : "lp-hero__callout lp-hero__callout--line"}
      data-slot={slot}
      data-side={side}
      style={top === undefined ? undefined : cssVars({ "--c-top": `${top}%` })}
      {...reveal("blur-in", delay)}
    >
      {n ? (
        <span className="lp-hero__callout-n" aria-hidden="true">
          {n}
        </span>
      ) : null}
      <NoteText ctx={ctx} text={note.title} className="lp-hero__callout-t" editPath={`notes.${i}.title`} />
      {note.detail.trim() ? <NoteText ctx={ctx} text={note.detail} className="lp-hero__callout-d" editPath={`notes.${i}.detail`} /> : null}
      <span className="lp-hero__leader" aria-hidden="true" />
    </li>
  );
}
