/**
 * The Carrier CSV (P4 CALL CENTER; operations.md OPE-§12.8, §18.3, OD49, OD55, OD64, §L "Carrier CSV"): the file the
 * owner uploads to their carrier's portal, written by the store from the column list saved in `ops.carrierCsv`
 * (no presets ship, core D38: the picker is the whole mapping UI). Pure and isomorphic: the route
 * (src/app/api/app/[store]/orders/carrier-csv/route.ts) reads the orders and writes the events; `test:ops` runs this
 * file alone.
 *
 * Rules: the owner's header names in the saved order (≤ 20 columns); `,` or `;` (default `;`: Excel in a French locale
 * opens it in columns); UTF-8 with a BOM; `cod_amount` in the store currency with the locale's decimal separator
 * ("249,90" in fr / ar, "249.90" in en; a whole amount has no decimals); phones as national digits without spaces
 * ("0612345678"); every cell formula-injection safe. Orders on hold (`ship_after > now`, OD49) are never written: the
 * plan lists them so the route refuses them with their ids.
 */
import { phoneToNational } from "@/lib/markets/phone";
import { MANIFEST_SOURCES as SETTING_SOURCES } from "@/lib/settings/keys/ops";

/** The `source` enum of the `manifest` mapping kind (OPE-§18.3); S3 re-exports it in R2. Equal to the setting's list. */
export const MANIFEST_SOURCES = ["order_id", "name", "phone", "city", "address", "landmark", "cod_amount", "content", "qty", "note", "constant"] as const;
export type ManifestSource = (typeof MANIFEST_SOURCES)[number];
// the setting's schema (src/lib/settings/keys/ops.ts) and this list are the same enum: a drift fails `tsc`
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
export const MANIFEST_SOURCES_AGREE: Same<ManifestSource, (typeof SETTING_SOURCES)[number]> = true;

export const CARRIER_CSV_MAX_ORDERS = 200;
export const CARRIER_CSV_MAX_COLUMNS = 20;

export interface CarrierColumn {
  header: string;
  source: ManifestSource;
  /** the text of a `constant` column */
  value?: string;
}

export interface CarrierCsvSpec {
  columns: readonly CarrierColumn[];
  delimiter: "," | ";";
  markPacked?: boolean;
}

/** One order as the file reads it (the route builds it from the order row). */
export interface ManifestRow {
  orderId: string;
  name: string;
  /** E.164 */
  phone: string;
  city: string | null;
  address: string | null;
  landmark: string | null;
  totalCents: number;
  /** the warehouse text of the order's lines (src/lib/orders/text.ts) */
  content: string;
  qty: number;
  note: string | null;
  /** the hold (OD49); null or past = shippable */
  shipAfter: Date | null;
}

/** RFC 4180 cell for `delim`, formula-injection safe (Excel / Sheets): a leading = + - @ tab CR gets a ' prefix. */
export function csvCell(v: unknown, delim: "," | ";" = ","): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return s.includes(delim) || /["\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** The decimal separator of the store's locale: "." in English, "," in French and Arabic (Morocco's usage). */
export const decimalOf = (locale: string): "," | "." => (locale.toLowerCase().startsWith("en") ? "." : ",");

/** Cents → "249,90" / "249.90"; a whole amount has no decimals ("250"). */
export function amountText(cents: number, locale: string): string {
  const c = Math.round(cents);
  const neg = c < 0 ? "-" : "";
  const abs = Math.abs(c);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  return frac ? `${neg}${whole}${decimalOf(locale)}${String(frac).padStart(2, "0")}` : `${neg}${whole}`;
}

/** National digits without spaces ("+212612345678" → "0612345678"); a number that does not parse keeps its digits. */
export const nationalDigits = (e164: string): string => phoneToNational(e164).replace(/[^0-9]/g, "");

/** Which orders a file may carry: held ones (OD49) are refused with their ids, the rest keep their order. */
export function planCarrierCsv<R extends Pick<ManifestRow, "orderId" | "shipAfter">>(rows: readonly R[], now: Date): { ok: R[]; held: string[] } {
  const ok: R[] = [];
  const held: string[] = [];
  for (const r of rows) {
    if (r.shipAfter && r.shipAfter.getTime() > now.getTime()) held.push(r.orderId);
    else ok.push(r);
  }
  return { ok, held };
}

function cellOf(r: ManifestRow, c: CarrierColumn, locale: string): string | number {
  switch (c.source) {
    case "order_id":
      return r.orderId;
    case "name":
      return r.name;
    case "phone":
      return nationalDigits(r.phone);
    case "city":
      return r.city ?? "";
    case "address":
      return r.address ?? "";
    case "landmark":
      return r.landmark ?? "";
    case "cod_amount":
      return amountText(r.totalCents, locale);
    case "content":
      return r.content;
    case "qty":
      return r.qty;
    case "note":
      return r.note ?? "";
    case "constant":
      return c.value ?? "";
  }
}

/**
 * The file: the BOM, the owner's header row, one line per shippable order, CRLF line ends. Held orders are left out
 * (the route refused them before; this stays safe if it is called with them). Throws on an empty or over-long column
 * list (the setting's schema refuses both, so a stored spec never does).
 */
export function writeCarrierCsv(rows: readonly ManifestRow[], spec: CarrierCsvSpec, opts: { locale: string; now: Date }): string {
  const cols = spec.columns;
  if (!cols.length || cols.length > CARRIER_CSV_MAX_COLUMNS) throw new RangeError("carrier csv: 1-20 columns");
  const d = spec.delimiter;
  const line = (cells: readonly unknown[]) => cells.map((x) => csvCell(x, d)).join(d) + "\r\n";
  let out = `﻿${line(cols.map((c) => c.header))}`;
  for (const r of planCarrierCsv(rows, opts.now).ok) out += line(cols.map((c) => cellOf(r, c, opts.locale)));
  return out;
}
