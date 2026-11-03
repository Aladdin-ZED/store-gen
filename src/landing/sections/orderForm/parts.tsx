/**
 * Building blocks of the order form, shared by the four variants. Runtime contract
 * (docs/ARCHITECTURE.md "Order form markup"): [data-field] wrappers with an always-present
 * [data-error], [data-lp-sum=subtotal|bump|shipping|total] (plain text — the runtime rewrites it),
 * button[type=submit][data-lp-submit] + [data-lp-submit-label], [data-lp-status][aria-live].
 * The quality contract (landing.md LAN-§3.5 OF1-OF13): one submit, the WhatsApp alternative a text link, no kicker,
 * no trust 3-up (the page's `trustBar` is its one trust surface), the delivery slots `[data-lp-dz]` (LAN-§7.4), the
 * one urgency chip from typed data, the COD line once under the submit.
 */
import type { ReactElement } from "react";
import { itemById } from "@/lib/page/catalog";
import { bumpOffered, emptySelection, everyOfferFree, fromCents, orderTotals } from "@/lib/page/pricing";
import { shopperOf } from "../../addons/facts";
import { defaultOfferView } from "../../offers/model";
import { unitVisual } from "../../offers/visual";
import {
  Checkbox,
  FieldShell,
  Icon,
  Input,
  Picture,
  RichText,
  Select,
  Textarea,
  cx,
  editAttr,
  pictureCrop,
  quietCorner,
} from "../../primitives";
import type { RenderContext, ResolvedAsset, SectionBg } from "../../types";
import { orderMessage, whatsappHref, whatsappNumber } from "../whatsappFloat/wa";
import { offerWord, optionalLabel, uiLabels, unitWord } from "./copy";
import type { Pack } from "./picker";
import { Plain } from "./text";
import { BumpBody, OptionsSummary } from "./units";

/**
 * The visual the receipt thumbnail starts on: unit 1 of the default offer (its item, or the photo of
 * the option it starts on), and the swap layer the runtime cross-fades the chosen unit's photo into.
 */
export function receiptVisual(ctx: RenderContext): { asset: ResolvedAsset | null; kind: "cutout" | "photo" | "empty"; key: string; item: string } {
  const view = defaultOfferView(ctx);
  const line = view?.offer.lines[0];
  const id = line ? ("item" in line.pick ? line.pick.item : line.pick.choice[0]!) : ctx.lead.id;
  const item = itemById(ctx.doc, id) ?? ctx.lead;
  const v = unitVisual(ctx, item, line?.rules);
  return { asset: v.asset, kind: v.asset ? (v.asset.alpha ? "cutout" : "photo") : "empty", key: v.key, item: item.id };
}

/** The receipt thumbnail's swap layer (runtime-filled; React never renders into it). */
function ThumbSlot({ base, item }: { base: string; item: string }) {
  return <span className="lp-vslot" data-lp-vslot="thumb" data-unit={0} data-item={item} data-base={base} aria-hidden="true" />;
}

export interface HeadData {
  lead: string;
}

/**
 * The section's only h2 and the lead (LAN-§3.5 OF8, LD34): no kicker (the doc's `kicker` is ignored), no reveal and
 * no per-word split, so the form's reveals stay on the panel and the submit row.
 */
export function Head({ ctx, data, title, titleId, className }: { ctx: RenderContext; data: HeadData; title: string; titleId: string; className?: string }) {
  return (
    <header className={cx("lp-of__head", className)}>
      <RichText as="h2" id={titleId} className="lp-of__title lp-h2" text={title} ctx={ctx} editPath="title" />
      {data.lead.trim() ? <RichText as="p" className="lp-of__lead lp-lead" text={data.lead} ctx={ctx} editPath="lead" /> : null}
    </header>
  );
}

/**
 * Step legend: a numeral (disc, or a big editorial "01" in minimal) + the step name + a tick that
 * draws in once every required control of the step is valid (CSS :has(:invalid), no script) — the
 * numeral morphs into a check and the step rail fills: progress the shopper can feel.
 */
export function StepTitle({ ctx, n, text, path }: { ctx: RenderContext; n: number; text: string; path: string }) {
  return (
    <legend className="lp-of__legend">
      <span className="lp-of__no" aria-hidden="true">
        <span className="lp-of__no-1">{n}</span>
        <span className="lp-of__no-2">{String(n).padStart(2, "0")}</span>
        <svg className="lp-of__tick" viewBox="0 0 24 24" focusable="false">
          <path d="M6.5 12.5l3.6 3.6 7.4-8.2" pathLength={1} />
        </svg>
      </span>
      <span className="lp-of__legend-txt" {...editAttr(ctx, path)}>
        {text}
      </span>
    </legend>
  );
}

/**
 * The receipt line of the order: thumbnail with a live quantity bubble, "your order", the product,
 * the chosen pack and its live total. Pack-dependent bits are rendered once per pack and tagged
 * [data-bundle-card] — the runtime marks the chosen one ([data-selected]) and CSS cross-fades to it.
 * The thumbnail shows the option the shopper is choosing (the runtime cross-fades its photo in).
 */
export function OrderLine({ ctx, packs, total, className }: { ctx: RenderContext; packs: Pack[]; total: number; className?: string }): ReactElement {
  const visual = receiptVisual(ctx);
  return (
    <div className={cx("lp-of__line", className)}>
      <span
        className={cx("lp-of__line-media", !visual.asset && "lp-of__line-media--none")}
        data-q={visual.kind === "photo" ? badgeSpot(ctx, visual.asset, "4.5rem") : undefined}
      >
        {visual.asset ? (
          <Picture
            asset={visual.asset}
            sizes="4.5rem"
            alt=""
            ratio={1}
            fit={visual.kind === "cutout" ? "contain" : "cover"}
            className="lp-of__line-pic"
            imgClassName={visual.kind === "cutout" ? "lp-of__line-cut" : undefined}
          />
        ) : null}
        {visual.asset ? <ThumbSlot base={visual.key} item={visual.item} /> : null}
        <span className="lp-of__line-qty" aria-hidden="true">
          {packs.map((p) => (
            <bdi key={p.id} dir="ltr" className="lp-of__swap" data-bundle-card={p.id} data-selected={p.selected ? "" : undefined}>
              ×{ctx.num(p.qty)}
            </bdi>
          ))}
        </span>
      </span>
      <span className="lp-of__line-txt" data-multi={ctx.items.length > 1 ? "" : undefined}>
        <span className="lp-of__line-k">{uiLabels(ctx.locale).yourOrder}</span>
        {/* bdi: a Latin name on an Arabic page takes its own direction, so the 2-line clamp ends
            it with "…" after its last word, never "…prière avec" (its start looking cut) */}
        <bdi className="lp-of__line-name">{ctx.product.name}</bdi>
        <span className="lp-of__line-pack">
          {packs.map((p) => (
            <bdi key={p.id} className="lp-of__swap" data-bundle-card={p.id} data-selected={p.selected ? "" : undefined}>
              <Plain ctx={ctx} text={p.name} />
            </bdi>
          ))}
        </span>
      </span>
      <bdi className="lp-of__line-price" data-lp-price="current">
        {ctx.money(total)}
      </bdi>
    </div>
  );
}

/**
 * Where a small badge (the live "×2") rides on a square photo thumbnail: the corner of the fitted
 * crop that covers no face and the least of the product — "se" (block start · inline end, the
 * default), "ss", "ee" or "es". CSS reads it as [data-q] on the thumbnail.
 */
export function badgeSpot(ctx: RenderContext, asset: ResolvedAsset | null | undefined, sizes: string): string | undefined {
  if (!asset || asset.alpha) return undefined;
  const crop = pictureCrop(asset, { ratio: 1, sizes });
  const c = quietCorner(asset, 1, { crop, chip: { w: 0.34, h: 0.34 }, dir: ctx.dir, prefer: { block: "start", inline: "end" } });
  const spot = `${c.block[0]}${c.inline[0]}`;
  return spot === "se" ? undefined : spot;
}

/** The phone control (keep-list 4, OF11): LTR, the market's dial prefix, the tel keypad, `autocomplete="tel"`. */
function PhoneField({ ctx, enterKeyHint }: { ctx: RenderContext; enterKeyHint: "next" | "send" }) {
  return (
    <div className="lp-input-group" dir="ltr">
      <span className="lp-input-group__prefix">
        <span className="lp-input-group__cc" aria-hidden="true">
          {ctx.market.phoneCountry}
        </span>
        <span className="lp-input-group__dial">{ctx.market.phonePrefix}</span>
      </span>
      <Input
        name="phone"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        enterKeyHint={enterKeyHint}
        dir="ltr"
        required
        minLength={6}
        maxLength={20}
        placeholder={ctx.market.phonePlaceholder}
        className="lp-input--grouped"
      />
    </div>
  );
}

/** A delivery line slot (LAN-§7.4): the server fallback, or empty and hidden; the `assist` add-on rewrites it. */
export function DeliverySlot({ k, text }: { k: "offer" | "city"; text?: string | null }) {
  return (
    <p className="lp-dz" data-lp-dz={k} aria-live="polite" hidden={!text || undefined}>
      {text || null}
    </p>
  );
}

/**
 * Delivery details (LAN-§3.5 OF2, OF11, OF13): name, phone, city, [address] in the default state, labels above the
 * controls, the last text control sending (`enterkeyhint`). The address follows the store's `checkout.addressMode`
 * when the render context carries it (`required`: one line after the city; `optional`: behind the disclosure; the
 * doc's `form.address` is superseded, `hidden` included), else the doc's `form.address`. An optional email and the note
 * sit behind one `<details>` ("Ajouter une adresse" when the address is in it), so the form stays near one screen.
 */
export function Fields({ ctx }: { ctx: RenderContext }) {
  const f = ctx.form;
  const L = uiLabels(ctx.locale);
  const opt = (label: string) => `${label} (${optionalLabel(ctx.locale)})`;
  const cities = ctx.market.cities;
  const cityMode = f.city === "select" && cities.length === 0 ? "text" : f.city;
  const facts = shopperOf(ctx);
  const address = facts ? facts.addressMode : f.address;
  const last = f.email === "required" ? "email" : address === "required" ? "address" : cityMode === "text" ? "city" : "phone";
  const hint = (k: typeof last) => (k === last ? "send" : "next");
  const addressField = (optional: boolean) => (
    <FieldShell ctx={ctx} field="address" label={optional ? opt(ctx.t("form.address")) : ctx.t("form.address")} optional={optional} className="lp-of__f lp-of__f--wide">
      <Input
        name="address"
        autoComplete="street-address"
        enterKeyHint={optional ? "next" : hint("address")}
        required={!optional}
        maxLength={240}
        placeholder={ctx.t("form.addressPh")}
      />
    </FieldShell>
  );
  const emailField = (optional: boolean) => (
    <FieldShell ctx={ctx} field="email" label={optional ? opt(ctx.t("form.email")) : ctx.t("form.email")} optional={optional} className="lp-of__f lp-of__f--wide">
      <Input
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        enterKeyHint={optional ? "next" : hint("email")}
        dir="ltr"
        required={!optional}
        maxLength={120}
        placeholder={L.email}
      />
    </FieldShell>
  );
  const more = address === "optional" || f.email === "optional" || f.note !== "hidden";
  return (
    <div className="lp-of__fields">
      <FieldShell ctx={ctx} field="name" label={ctx.t("form.name")} className="lp-of__f">
        <Input name="name" autoComplete="name" enterKeyHint="next" required minLength={2} maxLength={80} placeholder={ctx.t("form.namePh")} />
      </FieldShell>
      <FieldShell ctx={ctx} field="phone" label={ctx.t("form.phone")} className="lp-of__f">
        <PhoneField ctx={ctx} enterKeyHint={hint("phone")} />
      </FieldShell>
      {cityMode === "select" ? (
        <FieldShell ctx={ctx} field="city" label={ctx.t("form.city")} className="lp-of__f">
          <Select name="city" options={cities} placeholder={ctx.t("form.cityPh")} required autoComplete="address-level2" />
        </FieldShell>
      ) : cityMode === "text" ? (
        <FieldShell ctx={ctx} field="city" label={ctx.t("form.city")} className="lp-of__f">
          <Input name="city" autoComplete="address-level2" enterKeyHint={hint("city")} required maxLength={80} placeholder={ctx.t("form.cityPh")} />
        </FieldShell>
      ) : null}
      {cityMode !== "hidden" ? <DeliverySlot k="city" /> : null}
      {address === "required" ? addressField(false) : null}
      {f.email === "required" ? emailField(false) : null}
      {more ? (
        <details className="lp-of__more">
          <summary className="lp-of__more-sum">
            <Icon name="plus" size="1em" strokeWidth={2} />
            <span>{address === "optional" ? L.addAddress : L.addNote}</span>
          </summary>
          <div className="lp-of__more-body">
            {address === "optional" ? addressField(true) : null}
            {f.email === "optional" ? emailField(true) : null}
            {f.note !== "hidden" ? (
              <FieldShell ctx={ctx} field="note" label={ctx.t("form.note")} optional className="lp-of__f lp-of__f--wide">
                <Textarea name="note" rows={2} maxLength={300} placeholder={ctx.t("form.notePh")} />
              </FieldShell>
            ) : null}
          </div>
        </details>
      ) : null}
    </div>
  );
}
/**
 * Order bump (LAN-§3.5 OF6): one compact row of at most 56 px between the summary and the submit, a real checkbox,
 * the title (its one-line description under it) and the price; never a card with a picture, never a reveal. A bump
 * that is a catalog item (orderBump.item) reveals that item's options under the row once ticked ([data-lp-bump-body],
 * names b.<gid>, disabled until then); a bump limited to some offers (orderBump.offers) carries their ids in
 * data-offers and starts hidden when the default offer is not one of them (the runtime follows the selected offer).
 */
export function Bump({ ctx, surface, offerId }: { ctx: RenderContext; surface?: SectionBg; offerId?: string }) {
  const bump = ctx.offers.orderBump;
  if (!bump?.enabled) return null;
  const item = bump.item ? itemById(ctx.doc, bump.item) : undefined;
  const title = bump.title.trim() || (item ? item.name.trim() || ctx.product.name : "");
  const card = (
    <label className="lp-bump" data-bg={surface}>
      <Checkbox name="bump" value="1" className="lp-bump__check" />
      <span className="lp-bump__body">
        <span className="lp-bump__line">
          <span className="lp-bump__add">{ctx.t("form.bumpAdd")}</span> <Plain ctx={ctx} className="lp-bump__title" text={title} />
        </span>
        {bump.description ? <Plain ctx={ctx} className="lp-bump__desc" text={bump.description} /> : null}
      </span>
      <span className="lp-bump__price">
        <bdi dir="ltr">+{ctx.money(bump.price)}</bdi>
      </span>
    </label>
  );
  if (!item && !bump.offers) return card;
  const shown = offerId ? bumpOffered(ctx.doc, offerId) : true;
  return (
    <div className="lp-bump-wrap" data-lp-bump="" data-offers={bump.offers?.join(" ")} hidden={!shown}>
      {card}
      {item ? <BumpBody ctx={ctx} item={item} /> : null}
    </div>
  );
}
/**
 * Live order summary (server-rendered values from orderTotals(); the runtime keeps them current).
 * `subtotal={false}` when a receipt line above already carries the pack total. Products with
 * options end it with the live one-line summary of the choices, right under the total.
 */
export function Summary({
  ctx,
  bundleId,
  className,
  surface,
  subtotal = true,
}: {
  ctx: RenderContext;
  bundleId: string;
  className?: string;
  surface?: SectionBg;
  subtotal?: boolean;
}) {
  const cents = orderTotals(ctx.doc, emptySelection(bundleId));
  if (!cents) return null;
  const totals = { subtotal: fromCents(cents.subtotal), shipping: fromCents(cents.shipping), total: fromCents(cents.total) };
  const bump = ctx.offers.orderBump?.enabled ? ctx.offers.orderBump : null;
  const free = totals.shipping <= 0;
  const allFree = everyOfferFree(ctx.doc);
  return (
    <dl className={cx("lp-sum", className)} data-bg={surface}>
      <div className="lp-sum__row lp-sum__row--stale" hidden>
        <dt className="lp-visually-hidden">{unitWord(ctx.locale, "stale")}</dt>
        <dd className="lp-of__stale" data-lp-stale="" data-msg={unitWord(ctx.locale, "stale")} role="status" aria-live="polite" />
      </div>
      {subtotal ? (
        <div className="lp-sum__row">
          <dt>{ctx.t("form.subtotal")}</dt>
          <dd>
            <bdi data-lp-sum="subtotal">{ctx.money(totals.subtotal)}</bdi>
          </dd>
        </div>
      ) : null}
      {bump ? (
        <div className="lp-sum__row lp-sum__row--bump">
          <dt>
            <Plain ctx={ctx} text={bump.title.trim() || (bump.item ? (itemById(ctx.doc, bump.item)?.name.trim() || ctx.product.name) : "")} />
          </dt>
          <dd>
            <bdi data-lp-sum="bump" data-zero="">
              {ctx.money(0)}
            </bdi>
          </dd>
        </div>
      ) : null}
      <div className="lp-sum__row">
        <dt>{ctx.t("form.shipping")}</dt>
        <dd>
          <bdi data-lp-sum="shipping" data-zero={free ? "" : undefined} data-all-free={allFree ? offerWord(ctx.locale, "allFree") : undefined}>
            {free ? ctx.t("form.free") : ctx.money(totals.shipping)}
          </bdi>
        </dd>
      </div>
      <div className="lp-sum__row lp-sum__row--total">
        <dt>{ctx.t("form.total")}</dt>
        <dd>
          <bdi data-lp-sum="total">{ctx.money(totals.total)}</bdi>
        </dd>
      </div>
      <OptionsSummary ctx={ctx} as="row" />
    </dl>
  );
}

/**
 * The submit row (LAN-§3.5 OF5, OF7): the one `button[type=submit][data-lp-submit]` with the live total, the status
 * line (aria-live) and the COD line once under it (the reassurance string, `codLineFor(doc)`). The row carries the
 * form's second and last reveal.
 */
export function Submit({ ctx, label, reassurance, total }: { ctx: RenderContext; label: string; reassurance: string; total: number }) {
  return (
    <div className="lp-of__go" data-reveal="fade">
      <button type="submit" className={cx("lp-btn lp-btn--primary lp-btn--xl lp-btn--has-price lp-of__submit", Array.from(label).length > 24 && "lp-of__submit--long")} data-lp-submit="">
        <span className="lp-btn__label" data-lp-submit-label="" {...editAttr(ctx, "submitLabel")}>
          {label}
        </span>
        <span className="lp-btn__price">
          <bdi dir="ltr" data-lp-sum="total">
            {ctx.money(total)}
          </bdi>
        </span>
      </button>
      <p className="lp-of__status" data-lp-status="" role="status" aria-live="polite" />
      <p className="lp-of__assure" data-lp-cod="">
        <Icon name="shield-check" size="1.2em" />
        <Plain ctx={ctx} text={reassurance} editPath="reassurance" />
      </p>
    </div>
  );
}
/** WhatsApp ordering link: when the form enables it, or (no form setting) the store has a number. */
export function WhatsAppAlt({ ctx }: { ctx: RenderContext }) {
  const wa = ctx.doc.form.whatsapp;
  if (wa && !wa.enabled) return null;
  const number = whatsappNumber(ctx);
  if (!number) return null;
  return (
    <div className="lp-of__alt">
      <span className="lp-of__or">{ctx.t("form.or")}</span>
      <a className="lp-of__wa" href={whatsappHref(number, orderMessage(ctx.locale, ctx.product.name))} target="_blank" rel="noopener noreferrer">
        <Icon name="whatsapp" size="1.35em" />
        <span>{ctx.t("form.whatsapp")}</span>
      </a>
    </div>
  );
}

export function Privacy({ ctx }: { ctx: RenderContext }) {
  return (
    <p className="lp-of__privacy">
      <Icon name="lock" size="1.05em" />
      <span>{ctx.t("form.privacy")}</span>
    </p>
  );
}

/**
 * The form's one urgency chip (LAN-§3.5 OF10, LD36, LP-21): only from what the owner typed in Offers, the stock left
 * (`urgency.stockLeft` above 0) or a future end date (`urgency.countdownEnd`), never a timer of its own (the page keeps
 * one `[data-countdown]`) and never when an urgency section already says it. Nothing typed: no chip.
 */
export function CodChip({ ctx }: { ctx: RenderContext }) {
  const u = ctx.offers.urgency;
  if (ctx.doc.sections.some((x) => x.type === "urgency" && !x.hidden)) return null;
  const stock = typeof u?.stockLeft === "number" && u.stockLeft > 0 ? u.stockLeft : null;
  const end = u?.countdownEnd && Date.parse(u.countdownEnd) > Date.parse(ctx.now) ? u.countdownEnd : null;
  const text = stock !== null ? ctx.t("urgency.stockLeft", { n: ctx.num(stock) }) : end ? endsOn(ctx, end) : null;
  if (!text) return null;
  return (
    <span className="lp-of__cod" data-lp-urgency="">
      <Icon name={stock !== null ? "box" : "clock"} size="1.1em" />
      <span>{text}</span>
    </span>
  );
}

/** "Offre valable jusqu'au 30 octobre" in the page language (the market's time zone; Latin digits, like every price). */
function endsOn(ctx: RenderContext, iso: string): string {
  const tz = ctx.market.code === "MA" ? "Africa/Casablanca" : "UTC";
  const tag = ctx.locale === "ar" ? "ar-MA-u-nu-latn" : ctx.locale === "fr" ? "fr-MA" : "en-GB";
  let date: string;
  try {
    date = new Intl.DateTimeFormat(tag, { day: "numeric", month: "long", timeZone: tz }).format(new Date(iso));
  } catch {
    date = iso.slice(0, 10);
  }
  return uiLabels(ctx.locale).endsOn.replace("{date}", date);
}
