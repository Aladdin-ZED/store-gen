/**
 * The price of an "Order on WhatsApp" intent (P3 LANDING; landing.md LAN-§11.4 step 3, §11.6; docs/OFFERS.md D8, D9: no
 * second pricing engine). Pure and isomorphic: `resolveSelection` (src/lib/orders/validate.ts) and `orderTotals`
 * (src/lib/page/pricing.ts) on the tolerant selection the body carries, exactly what an order of the same choice pays.
 *
 * When the selection does not resolve (a size not picked yet, an item to choose), the offer's real "from" total is
 * priced (`offerMath(…).from`, the card price, plus the bump and the page's own delivery fee for that offer) and each
 * unresolved group is named in `toConfirm`, so the message never shows a number the order would not charge. Nothing
 * here reads a price from the request: an unknown offer falls back to the page's default offer.
 */
import { UnitIn, type SelectionInput } from "@/lib/orders/contract";
import { unitsText, type TextExtra } from "@/lib/orders/text";
import { resolveSelection } from "@/lib/orders/validate";
import { defaultOfferId, itemName, offerName } from "@/lib/page/catalog";
import { bumpOffered, effectiveFree, offerMath, orderTotals, toCents, type Cents } from "@/lib/page/pricing";
import type { Offer, PageDoc } from "@/lib/page/schema";
import { isChoiceGroup } from "@/lib/page/schema";
import type { WaOrderRequest } from "./contract";

export interface WaPrice {
  offer: Offer;
  /** the offer's name as the page shows it */
  offerLabel: string;
  /** every group resolved: `total` is `orderTotals(…).total` of the selection */
  resolved: boolean;
  subtotal: Cents;
  shipping: Cents;
  total: Cents;
  /** the names of the groups still to confirm with the shopper (empty when resolved) */
  toConfirm: string[];
  /** the customer text of what resolved ("2 × Crème (Rose/M)"), "" when nothing did */
  units: string;
  /** the tolerant input, bounded like `UnitIn` (what `leads.sel` keeps for the conversion) */
  input: SelectionInput;
}

/** The words of an item still to pick (a choice unit); the groups are named by the page. */
const ITEM_WORD: Readonly<Record<string, string>> = { ar: "المنتج", fr: "Article", en: "Item" };

const str = (v: unknown) => (typeof v === "string" ? v : "");
const unitOf = (v: unknown): UnitIn => {
  const r = UnitIn.safeParse(v);
  return r.success ? r.data : { o: {}, f: {} };
};

/** The request's choice as a `SelectionInput` (malformed units are empty, non-string extras dropped). */
export function waSelectionInput(doc: Pick<PageDoc, "offers" | "items">, sel: Pick<WaOrderRequest, "bundleId" | "bump" | "units" | "extras" | "b">): SelectionInput {
  const known = sel.bundleId && doc.offers.bundles.some((o) => o.id === sel.bundleId) ? sel.bundleId : defaultOfferId(doc.offers, doc.items);
  const extras: Record<string, string> = {};
  for (const [k, v] of Object.entries(sel.extras ?? {}).slice(0, 16)) if (/^[A-Za-z0-9_-]{2,40}$/.test(k) && typeof v === "string") extras[k] = v.slice(0, 240);
  return {
    offerId: known,
    units: (sel.units ?? []).slice(0, 20).map(unitOf),
    extras,
    bump: sel.bump === true,
    ...(sel.b !== undefined && sel.b !== null ? { b: unitOf(sel.b) } : {}),
  };
}

/** The name of an unresolved group from its error key (`u.<k>.<gid>`, `u.<k>.@item`, `s.<item>.<gid>`, `x.<gid>`, `b.<gid>`). */
function groupName(doc: PageDoc, units: readonly { item: string }[], key: string): string | null {
  const parts = key.split(".");
  const byItem = (id: string | undefined) => doc.items.find((it) => it.id === id);
  const named = (groups: readonly { id: string; name: string }[] | undefined, gid: string | undefined) => groups?.find((g) => g.id === gid)?.name?.trim() || null;
  if (parts[0] === "u" && parts[2] === "@item") return ITEM_WORD[doc.locale] ?? ITEM_WORD.en!;
  if (parts[0] === "u") return named(byItem(units[Number(parts[1])]?.item)?.groups, parts[2]);
  if (parts[0] === "s") return named(byItem(parts[1])?.groups, parts[2]);
  if (parts[0] === "x") return named(doc.offers.extras, parts[1]);
  if (parts[0] === "b") return named(byItem(doc.offers.orderBump?.item)?.groups, parts[1]);
  return null;
}

/** The order-level choices of a resolved selection, as the order text writes them. */
function extrasText(doc: PageDoc, chosen: Record<string, string>): TextExtra[] {
  const out: TextExtra[] = [];
  for (const x of doc.offers.extras) {
    const value = chosen[x.id];
    if (value === undefined || value === "") continue;
    if (isChoiceGroup(x)) {
      const o = x.options.find((c) => c.id === value);
      if (o) out.push({ name: x.name, value: o.label, ...(o.delta ? { delta: o.delta } : {}) });
    } else out.push({ name: x.name, value, typed: true, ...(x.delta ? { delta: x.delta } : {}) });
  }
  return out;
}

/**
 * Prices the shopper's choice on `doc` (the version they saw, OFFERS D8). Resolved: `orderTotals` of the resolved
 * selection. Not resolved: the offer's "from" total, the bump when ticked and offered, and the offer's delivery fee.
 */
export function priceWaSelection(doc: PageDoc, sel: Pick<WaOrderRequest, "bundleId" | "bump" | "units" | "extras" | "b">): WaPrice {
  const input = waSelectionInput(doc, sel);
  const offer = doc.offers.bundles.find((o) => o.id === input.offerId) ?? doc.offers.bundles[0]!;
  const r = resolveSelection(doc, offer, input);
  const offerLabel = offerName({ doc }, offer);
  const text = (bumpUnit = r.bumpUnit) =>
    unitsText({ units: r.units, multi: doc.items.length > 1, gift: offer.gift ?? null, bump: bumpUnit ? { unit: bumpUnit } : null, extras: extrasText(doc, r.selection.extras) }, "customer");

  const totals = r.errors.length ? null : orderTotals(doc, r.selection);
  if (totals) return { offer, offerLabel, resolved: true, subtotal: totals.subtotal, shipping: totals.shipping, total: totals.total, toConfirm: [], units: text(), input };

  const names: string[] = [];
  for (const e of r.errors) {
    const n = groupName(doc, r.selection.units, e.key);
    if (n && !names.includes(n)) names.push(n);
  }
  const bump = input.bump && bumpOffered(doc, offer.id) ? toCents(doc.offers.orderBump!.price) : 0;
  const shipping = effectiveFree(doc, offer) ? 0 : toCents(doc.offers.shippingFee);
  const subtotal = offerMath(doc, offer).from + bump;
  return { offer, offerLabel, resolved: false, subtotal, shipping, total: subtotal + shipping, toConfirm: names.length ? names : [offerLabel], units: text(), input };
}

/** The product the message names: the page's product, else its first item. */
export function waProductName(doc: PageDoc): string {
  const first = doc.items[0];
  return doc.product.name?.trim() || (first ? itemName(doc, first) : "");
}
