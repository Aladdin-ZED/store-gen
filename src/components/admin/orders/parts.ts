/**
 * What an order contains, as the admin shows it (docs/OFFERS.md §G.4 "Admin"): one part per group of
 * identical pieces (free pieces never merge with paid ones), then the bump and the upsell, the
 * non-catalog gift and the order-level choices. Pure and isomorphic: the server builds it once
 * (admin-data/orders.ts, with swatch colours from the order's version) and the drawer renders it.
 *
 * Reads v1 rows too (orderUnits: units rebuilt from `variants`, item "main", no item name).
 */
import type { OrderItems, OrderUnit } from "@/lib/orders";
import { orderUnits } from "@/lib/orders/text";

export type PartKind = "unit" | "free" | "bump" | "upsell";

export interface PartOption {
  name: string;
  /** label the shopper picked ("Noir/M" for a combination) */
  value: string;
  /** warehouse code, shown in small type when it differs from the label */
  code?: string;
  /** surcharge per piece (paid pieces only) */
  delta?: number;
  /** swatch colour of the option (#rrggbb), when the page has one */
  swatch?: string;
}

export interface OrderPart {
  kind: PartKind;
  /** identical pieces */
  count: number;
  /** item name; "" on single-item pages (the options say what the piece is) */
  item: string;
  sku?: string;
  options: PartOption[];
  fields: { name: string; value: string; delta?: number }[];
  /** upsell: its options are confirmed by phone */
  confirm?: boolean;
  /** bump / upsell: the price shown on the page */
  price?: number;
}

export interface OrderView {
  /** the page sells several items (item names always shown) */
  multi: boolean;
  parts: OrderPart[];
  /** non-catalog gift of the offer */
  gift: string | null;
  /** order-level choices (gift wrap, card message) */
  extras: { name: string; value: string; typed: boolean; delta?: number }[];
  /** physical pieces: units (free included), bump, upsell */
  pieces: number;
}

export type SwatchOf = (unit: OrderUnit, option: OrderUnit["options"][number]) => string | undefined;

const HEX = /^#[0-9a-fA-F]{6}$/;

function partOf(kind: PartKind, unit: OrderUnit, multi: boolean, swatchOf?: SwatchOf): OrderPart {
  return {
    kind,
    count: 1,
    item: multi || kind === "bump" || kind === "upsell" ? unit.label || unit.short || "" : "",
    ...(unit.sku ? { sku: unit.sku } : {}),
    options: unit.options
      .filter((o) => o.value)
      .map((o) => {
        const swatch = swatchOf?.(unit, o);
        return {
          name: o.name,
          value: o.value,
          ...(o.code && o.code !== o.value ? { code: o.code } : {}),
          ...(o.delta ? { delta: o.delta } : {}),
          ...(swatch && HEX.test(swatch) ? { swatch } : {}),
        };
      }),
    fields: (unit.fields ?? []).filter((f) => f.value).map((f) => ({ name: f.name, value: f.value, ...(f.delta ? { delta: f.delta } : {}) })),
  };
}

const keyOf = (u: OrderUnit) =>
  JSON.stringify([!!u.free, u.item, u.label, u.short ?? "", u.options.map((o) => [o.name, o.value, o.code ?? ""]), (u.fields ?? []).map((f) => [f.name, f.value])]);

export function orderView(items: OrderItems | null | undefined, opts: { swatchOf?: SwatchOf } = {}): OrderView {
  if (!items) return { multi: false, parts: [], gift: null, extras: [], pieces: 0 };
  const units = orderUnits(items);
  const multi = units.some((u) => !!u.label);
  const parts: OrderPart[] = [];
  const index = new Map<string, OrderPart>();
  for (const u of units) {
    const k = keyOf(u);
    const hit = index.get(k);
    if (hit) {
      hit.count++;
      continue;
    }
    const part = partOf(u.free ? "free" : "unit", u, multi, opts.swatchOf);
    index.set(k, part);
    parts.push(part);
  }
  if (items.bump) {
    const p: OrderPart = items.bump.unit
      ? { ...partOf("bump", items.bump.unit, multi, opts.swatchOf), price: items.bump.price }
      : { kind: "bump", count: 1, item: items.bump.title, options: [], fields: [], price: items.bump.price };
    parts.push(p);
  }
  if (items.upsell) {
    const unit = (items.upsell as { unit?: OrderUnit }).unit;
    const p: OrderPart =
      unit && typeof unit.item === "string"
        ? { ...partOf("upsell", unit, multi, opts.swatchOf), price: items.upsell.price }
        : { kind: "upsell", count: 1, item: items.upsell.title, options: [], fields: [], price: items.upsell.price };
    if (items.upsell.confirmOptions) p.confirm = true;
    parts.push(p);
  }
  return {
    multi,
    parts,
    gift: items.gift?.label ?? null,
    extras: (items.extras ?? []).filter((x) => x.value).map((x) => ({ name: x.name, value: x.value, typed: !!x.typed, ...(x.delta ? { delta: x.delta } : {}) })),
    pieces: units.length + (items.bump ? 1 : 0) + (items.upsell ? 1 : 0),
  };
}
