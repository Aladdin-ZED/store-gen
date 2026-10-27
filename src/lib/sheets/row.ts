/**
 * Google Sheets row content of an order (pure, no I/O — the sync, the CSV export and the PHP parity
 * test share it). docs/OFFERS.md §G.4:
 *
 *   13 contract columns (A–M, never reordered)     orderToRow(o)
 *   Produit   "<product> — <bundleLabel>" (+ bump + upsell titles, as in v1)
 *   Variante  the warehouse order text (codes, short names, markers, « », "|| Commande : …"), ≤ 1000
 *   Qté       the offer's units (bump and upsell not included, v1 meaning)
 *
 *   optional columns, only when the owner added the header after column M (trimmed, any case):
 *   "SKU"        JOUR×1 NUIT×1 SER-50×1   (cell sku ?? item sku ?? short name; counted; free, bump, upsell included)
 *   "Articles"   physical pieces (free, bump and upsell included)
 *   "Livraison"  delivery charged
 *   "Prix pack"  the offer price (before options, bump, upsell and delivery)
 *
 * order.php mirrors every value here (`cod_sheet_extras`), checked by scripts/qa/php-parity.ts.
 */
import type { OrderItems, OrderSource, OrderUnit } from "@/lib/db/schema";
import { phoneToNational } from "@/lib/markets/phone";
import { ORDER_TEXT_MAX, orderText, orderUnits, unitsText, type TextMode } from "@/lib/orders/text";
import { cleanText, toSheetsSerial } from "./format";

/** The 13-column contract (header, index). Same order as orders-sheet.ts COLUMNS / gsheets.php GS_COLUMNS. */
export const COL = {
  id: 0,
  date: 1,
  status: 2,
  name: 3,
  phone: 4,
  city: 5,
  address: 6,
  product: 7,
  variant: 8,
  qty: 9,
  total: 10,
  note: 11,
  source: 12,
} as const;
/** columns A–M */
export const CONTRACT_WIDTH = 13;

export type Cell = string | number;

/** What a row is built from (an orders row, or the same fields from order.php's queue). */
export interface SheetOrder {
  id: string;
  createdAt: Date;
  status: string;
  name: string;
  phone: string;
  city: string | null;
  address: string | null;
  productName: string;
  items: OrderItems;
  qty: number;
  subtotal: number | string;
  shipping: number | string;
  total: number | string;
  note: string | null;
  email: string | null;
  riskScore: number;
  utm: Record<string, string> | null;
  /** order.php's queue only ever has live / export / php; 0005 appended the R1 sources (D42) */
  source: OrderSource;
  ref: string | null;
}

/** risk score from which the row is prefixed "[À vérifier]" for the call center */
export const REVIEW_SCORE = 50;

const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: number | string | null | undefined) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** The upsell's own unit (stored by upsell.ts when the upsell is a catalog item). */
export function upsellUnit(items: OrderItems): OrderUnit | null {
  const u = (items.upsell as { unit?: OrderUnit } | undefined)?.unit;
  return u && typeof u === "object" && typeof u.item === "string" ? u : null;
}

/**
 * The order text (§G.4) of a stored order: `orderText` plus the upsell's unit when the upsell is a
 * catalog item ("[UPSELL] 1 × Sérum (options à confirmer)" instead of the offer title).
 */
export function orderTextOf(items: OrderItems | null | undefined, opts: { mode?: TextMode; orderId?: string; max?: number } = {}): string {
  if (!items) return "";
  const unit = upsellUnit(items);
  if (!unit || !items.upsell) return orderText(items, opts);
  const units = orderUnits(items);
  return unitsText(
    {
      units,
      multi: units.some((u) => !!u.label),
      gift: items.gift ?? null,
      bump: items.bump?.unit ? { unit: items.bump.unit } : null,
      upsell: { title: items.upsell.title, unit, confirmOptions: !!items.upsell.confirmOptions },
      extras: items.extras ?? [],
      ...(opts.orderId ? { orderId: opts.orderId } : {}),
    },
    opts.mode ?? "warehouse",
    opts.max ?? ORDER_TEXT_MAX,
  );
}

/** "Produit" cell: "<product> — <bundleLabel>" (+ bump + upsell titles). */
export function productText(o: Pick<SheetOrder, "productName" | "items">): string {
  const parts = [`${o.productName} — ${o.items.bundleLabel}`];
  if (o.items.bump) parts.push(o.items.bump.title);
  if (o.items.upsell) parts.push(o.items.upsell.title);
  return parts.join(" + ");
}

/** "Variante" cell: the warehouse order text (≤ 1000 characters, whole parts dropped with "voir <id>"). */
export function variantCell(o: Pick<SheetOrder, "id" | "items">): string {
  return orderTextOf(o.items, { mode: "warehouse", orderId: o.id });
}

/**
 * Every physical piece of the order: the units (free included), then the bump, then the upsell. A
 * bump or upsell that is not a catalog item has no unit: its title stands for the piece.
 */
export function physicalUnits(items: OrderItems): { unit: OrderUnit | null; title: string }[] {
  const out: { unit: OrderUnit | null; title: string }[] = orderUnits(items).map((unit) => ({ unit, title: "" }));
  if (items.bump) out.push({ unit: items.bump.unit ?? null, title: items.bump.title });
  if (items.upsell) out.push({ unit: upsellUnit(items), title: items.upsell.title });
  return out;
}

/** One SKU token: no spaces inside (tokens are space-separated). */
function skuToken(s: string): string {
  return cleanText(s, 60).replace(/[×\s]+/g, "-");
}

/** "SKU" cell: `cell sku ?? item sku ?? item short`, counted in first-seen order ("TS×2 TS-BL-M×1"). */
export function skuCell(o: Pick<SheetOrder, "items" | "productName">): string {
  const counts = new Map<string, number>();
  for (const { unit, title } of physicalUnits(o.items)) {
    const token = skuToken(unit ? unit.sku || unit.short || unit.label || o.productName : title);
    if (token) counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return Array.from(counts, ([t, n]) => `${t}×${n}`).join(" ");
}

/** "Articles" cell: physical pieces (free, bump and upsell included). */
export function articlesCell(items: OrderItems): number {
  return physicalUnits(items).length;
}

/** "Prix pack" cell: the offer price (v1 rows: subtotal minus bump and upsell). */
export function packPriceCell(o: Pick<SheetOrder, "items" | "subtotal">): number {
  if (typeof o.items.price === "number") return r2(o.items.price);
  return r2(num(o.subtotal) - (o.items.bump?.price ?? 0) - (o.items.upsell?.price ?? 0));
}

/** "Source" cell: "facebook · campagne", "direct (shop.ma)". */
export function sourceText(o: Pick<SheetOrder, "utm" | "source" | "ref">): string {
  const u = o.utm ?? {};
  let s =
    u.source ? [u.source, u.campaign].filter(Boolean).join(" · ")
    : u.fbclid ? "facebook"
    : u.ttclid ? "tiktok"
    : u.sccid ? "snapchat"
    : u.gclid ? "google"
    : "direct";
  if (o.source !== "live") {
    let host = "";
    try {
      host = o.ref ? new URL(o.ref).hostname : "";
    } catch {
      host = "";
    }
    s = `${s} (${host || o.source})`;
  }
  return s;
}

/** The 13 contract cells (A–M). `statusLabel` turns a status id into the agents' French label. */
export function orderToRow(o: SheetOrder, statusLabel: (id: string) => string, timeZone: string): Cell[] {
  const note = [o.riskScore >= REVIEW_SCORE ? "[À vérifier]" : "", o.note ?? "", o.email ? `E-mail : ${o.email}` : ""]
    .map((x) => x.trim())
    .filter(Boolean)
    .join(" · ");
  const row: Cell[] = new Array<Cell>(CONTRACT_WIDTH).fill("");
  row[COL.id] = cleanText(o.id, 40);
  row[COL.date] = toSheetsSerial(o.createdAt, timeZone);
  row[COL.status] = statusLabel(o.status);
  row[COL.name] = cleanText(o.name, 120);
  row[COL.phone] = phoneToNational(o.phone); // RAW text: leading zero kept
  row[COL.city] = cleanText(o.city, 80);
  row[COL.address] = cleanText(o.address, 300);
  row[COL.product] = cleanText(productText(o), 250);
  row[COL.variant] = cleanText(variantCell(o), ORDER_TEXT_MAX);
  row[COL.qty] = Math.max(1, Math.trunc(o.qty));
  row[COL.total] = r2(num(o.total));
  row[COL.note] = cleanText(note, 500);
  row[COL.source] = cleanText(sourceText(o), 120);
  return row;
}

/* ------------------------------------------------------------------ */
/* optional columns (by header)                                        */
/* ------------------------------------------------------------------ */

export type ExtraColumn = "sku" | "articles" | "delivery" | "packPrice";

/** Header text (trimmed, any case, inner spaces collapsed) → optional column. */
const EXTRA_HEADERS: Record<string, ExtraColumn> = { sku: "sku", articles: "articles", livraison: "delivery", "prix pack": "packPrice" };

/** 0-based column index of each optional column found in row 1 after column M (first occurrence wins). */
export type ExtraColumns = Partial<Record<ExtraColumn, number>>;

/** Optional columns from the header cells read after column M (`cells[0]` = column N). */
export function extraColumnsOf(cells: readonly unknown[]): ExtraColumns {
  const out: ExtraColumns = {};
  cells.forEach((v, i) => {
    const key = String(v ?? "")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();
    const col = EXTRA_HEADERS[key];
    if (col && out[col] === undefined) out[col] = CONTRACT_WIDTH + i;
  });
  return out;
}

/** Values of the optional columns for one order. */
export function extraValues(o: Pick<SheetOrder, "items" | "productName" | "subtotal" | "shipping">): Record<ExtraColumn, Cell> {
  return {
    sku: cleanText(skuCell(o), 500),
    articles: articlesCell(o.items),
    delivery: r2(num(o.shipping)),
    packPrice: packPriceCell(o),
  };
}

/**
 * A full append row: the 13 contract cells, then `null` in every column after M except the optional
 * columns the sheet has (the Sheets API skips nulls, so call-center columns are never touched).
 */
export function wideRow(base: readonly Cell[], extras: ExtraColumns, values: Record<ExtraColumn, Cell>): (Cell | null)[] {
  const cols = Object.values(extras).filter((c): c is number => typeof c === "number");
  if (!cols.length) return [...base];
  const width = Math.max(CONTRACT_WIDTH, ...cols.map((c) => c + 1));
  const row: (Cell | null)[] = [...base, ...new Array<null>(width - base.length).fill(null)];
  for (const [k, c] of Object.entries(extras) as [ExtraColumn, number][]) row[c] = values[k];
  return row;
}
