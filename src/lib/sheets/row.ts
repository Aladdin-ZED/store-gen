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
 *
 * R1 (P5, operations.md OPE-§19.4): the column C labels (`statusLabel`, `statusFromLabel`) and seven more optional
 * headers the app alone writes and reads ("Repère", "Agent", "Note agent", "Tracking", "Transporteur", "Statut
 * livraison", "Livrer à partir du"; `sheetColumnsOf`, `r1Values`, `placeCells`). The export's four stay as they are.
 */
import type { OrderItems, OrderSource, OrderUnit } from "@/lib/db/schema";
import { messageOf, type AdminLocale } from "@/lib/i18n/admin";
import { phoneToNational } from "@/lib/markets/phone";
import { ORDER_STATUSES, type OrderStatus } from "@/lib/orders/contract";
import { projectStatus, type ConfirmState, type ShipState } from "@/lib/orders/state";
import { ORDER_TEXT_MAX, orderText, orderUnits, unitsText, type TextMode } from "@/lib/orders/text";
import { cleanText, toSheetsSerial, wallParts } from "./format";

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

/* ------------------------------------------------------------------ */
/* status labels (column C)                                            */
/* ------------------------------------------------------------------ */

/** A label folded for matching: accents dropped, trimmed, inner spaces collapsed, lower case. */
export function foldLabel(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[\u0300-\u036F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const LABEL_TO_STATUS = new Map<string, OrderStatus>(
  ORDER_STATUSES.flatMap((s) => [
    [foldLabel(s.fr), s.id],
    [foldLabel(s.id), s.id],
  ]),
);

/** Column C's French label of a status id (the first row, "Nouvelle", for an unknown id). */
export const statusLabel = (id: string): string => ORDER_STATUSES.find((s) => s.id === id)?.fr ?? ORDER_STATUSES[0].fr;
/**
 * The status id of a column C label, or null for a blank or unknown one. Every `ORDER_STATUSES` row is accepted, the
 * five R1 projections appended at P0 included ("Refusée", "Doublon", "Injoignable clôturée", "En livraison",
 * "Perdue"), by its French label or its id, in any case and with or without accents.
 */
export const statusFromLabel = (label: string): OrderStatus | null => LABEL_TO_STATUS.get(foldLabel(label)) ?? null;

/* ------------------------------------------------------------------ */
/* R1 optional columns (operations.md OPE-§19.4 rev 3: OD49, OD54, OD55) */
/* ------------------------------------------------------------------ */

/**
 * The seven R1 optional headers, detected like "SKU" (row 1 after column M, trimmed, any case; accents optional).
 * They live beside `extraColumnsOf`, not inside it: the four columns there are the PHP export's (`cod_sheet_extras`;
 * test:php asserts that "Agent" is not one of them), and the export never writes these seven.
 *
 *   "Repère"              orders.landmark                      push bit 2
 *   "Agent"               the confirming member or label       push bit 1, pulled (OD54)
 *   "Note agent"          the last sheet note                  never pushed, pulled as a note event (OD54)
 *   "Tracking"            orders.tracking_ref                  push bit 2, pulled (OD55)
 *   "Transporteur"        orders.carrier_label                 push bit 2, pulled (OD55)
 *   "Statut livraison"    the ship state label (sheet locale)  push bit 1, read-only mirror
 *   "Livrer à partir du"  orders.ship_after (store zone)       push bit 2, read-only mirror (OD49)
 */
export type R1Column = "landmark" | "agent" | "agentNote" | "tracking" | "carrier" | "shipStatus" | "shipAfter";
export type SheetColumn = ExtraColumn | R1Column;
/** 0-based column index of every optional column the tab has (first occurrence wins). */
export type SheetColumns = Partial<Record<SheetColumn, number>>;

export const R1_HEADERS: Readonly<Record<R1Column, string>> = {
  landmark: "Repère",
  agent: "Agent",
  agentNote: "Note agent",
  tracking: "Tracking",
  carrier: "Transporteur",
  shipStatus: "Statut livraison",
  shipAfter: "Livrer à partir du",
};
const R1_BY_FOLDED = new Map<string, R1Column>(Object.entries(R1_HEADERS).map(([k, h]) => [foldLabel(h), k as R1Column]));

/** The optional columns the pull reads back (OPE-§19.6 rev 3); "Statut livraison" and "Livrer à partir du" are mirrors. */
export const PULLED_COLUMNS: readonly R1Column[] = ["agent", "agentNote", "tracking", "carrier"];

export type DirtyBit = 1 | 2 | 4;
/** The contract cells each `sheet_dirty` bit rewrites (OPE-§19.5 step 5): 1 → C; 2 → D, E, F, G; 4 → H, I, J, K. */
export const BIT_CELLS: Readonly<Record<DirtyBit, readonly number[]>> = {
  1: [COL.status],
  2: [COL.name, COL.phone, COL.city, COL.address],
  4: [COL.product, COL.variant, COL.qty, COL.total],
};
/** The optional cells each bit rewrites when the tab has them. */
export const BIT_COLUMNS: Readonly<Record<DirtyBit, readonly SheetColumn[]>> = {
  1: ["agent", "shipStatus"],
  2: ["landmark", "tracking", "carrier", "shipAfter"],
  4: ["sku", "articles", "packPrice", "delivery"],
};

/** Every optional column in the header cells read after column M (`cells[0]` = column N): the export's four and R1's seven. */
export function sheetColumnsOf(cells: readonly unknown[]): SheetColumns {
  const out: SheetColumns = { ...extraColumnsOf(cells) };
  cells.forEach((v, i) => {
    const col = R1_BY_FOLDED.get(foldLabel(String(v ?? "")));
    if (col && out[col] === undefined) out[col] = CONTRACT_WIDTH + i;
  });
  return out;
}

/** The ship state's label in the sheet's locale. */
export type ShipLabel = (state: ShipState) => string;

/**
 * "Statut livraison": `ops.ship.<state>` in `locale` (P4's catalog, OPE-§19.4). While P4's key is missing, the legacy
 * French label of the same status (src/lib/orders/contract.ts) for the ship states that are one ("Expédiée", "En
 * livraison", "Livrée", "Refusée", "Retournée", "Perdue"), else the label of the projection column C shows. `none`
 * (nothing shipped yet) is an empty cell.
 */
export function shipStateLabel(state: ShipState, locale: AdminLocale, confirm: ConfirmState = "confirmed"): string {
  if (state === "none") return "";
  const own = messageOf(`ops.ship.${state}`, locale);
  if (own !== undefined) return own;
  const legacy = ORDER_STATUSES.find((s) => s.id === state);
  return legacy ? legacy.fr : statusLabel(projectStatus({ confirm, ship: state }));
}

/** "Livrer à partir du": the hold's day in the store's time zone ("05/11/2026"); empty when there is no hold. */
export function shipAfterCell(at: Date | null | undefined, timeZone: string): string {
  if (!at || !Number.isFinite(at.getTime())) return "";
  const p = wallParts(at, timeZone);
  return `${p.day}/${p.month}/${p.year}`;
}

/** The order columns the R1 cells are built from. */
export interface R1Fields {
  landmark: string | null;
  confirmState: ConfirmState;
  shipState: ShipState;
  confirmedBy: string | null;
  confirmedByLabel: string | null;
  trackingRef: string | null;
  carrierLabel: string | null;
  shipAfter: Date | null;
}

/** How the R1 cells render: the store's zone, the sheet's locale, the members' display names. */
export interface R1RowCtx {
  timeZone: string;
  locale: AdminLocale;
  /** user id → display name, for the "Agent" cell of an order a member confirmed */
  memberNames?: Readonly<Record<string, string>>;
  /** replaces `shipStateLabel` (a caller with its own catalog, or a test) */
  shipLabel?: ShipLabel;
}

/**
 * The R1 pushed cells of one order. `null` leaves the cell as it is: with no confirmer, tracking or carrier known the
 * app never blanks what a person typed before the pull brought it in. "Note agent" is never written by the app.
 */
export function r1Values(o: R1Fields, ctx: R1RowCtx): Record<Exclude<R1Column, "agentNote">, Cell | null> {
  const member = o.confirmedBy ? ctx.memberNames?.[o.confirmedBy] : undefined;
  const agent = member || o.confirmedByLabel;
  return {
    landmark: o.landmark == null ? null : cleanText(o.landmark, 160),
    agent: agent ? cleanText(agent, 60) : null,
    tracking: o.trackingRef ? cleanText(o.trackingRef, 64) : null,
    carrier: o.carrierLabel ? cleanText(o.carrierLabel, 60) : null,
    shipStatus: cleanText(ctx.shipLabel ? ctx.shipLabel(o.shipState) : shipStateLabel(o.shipState, ctx.locale, o.confirmState), 80),
    shipAfter: shipAfterCell(o.shipAfter, ctx.timeZone),
  };
}

/**
 * A full append row with every optional column the tab has a value for: the 13 contract cells, then `null` in every
 * other cell after M (the API skips nulls, so the call center's own columns are never touched). `wideRow` stays the
 * export's four-column twin (test:php).
 */
export function placeCells(base: readonly Cell[], cols: SheetColumns, values: Partial<Record<SheetColumn, Cell | null>>): (Cell | null)[] {
  const placed = (Object.entries(cols) as [SheetColumn, number][]).filter(([k]) => values[k] != null);
  if (!placed.length) return [...base];
  const width = Math.max(CONTRACT_WIDTH, ...placed.map(([, c]) => c + 1));
  const row: (Cell | null)[] = [...base, ...new Array<null>(width - base.length).fill(null)];
  for (const [k, c] of placed) row[c] = values[k]!;
  return row;
}
