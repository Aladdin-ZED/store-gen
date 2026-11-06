/**
 * The CSV dialect of the store export (docs/STORE-SAAS.md §F.9, PL-09; R1 P8 step 8). Pure, no I/O.
 *
 * - UTF-8 with a byte-order mark at the start of every file, so Excel opens Arabic text as Arabic;
 * - RFC 4180: CRLF line ends, a cell holding a comma, a quote, CR or LF is quoted and its quotes doubled;
 * - formula injection (OWASP "CSV injection"): a text cell starting with `=`, `+`, `-`, `@`, a tab or a CR gets a
 *   leading apostrophe, so a spreadsheet shows it as text and never runs it. Numbers from numeric columns are written
 *   as numbers (a negative amount stays `-150`); an E.164 phone is text and reads `'+212…` (README.txt says why);
 * - values: NULL → empty, booleans → 1 / 0 as stored, dates → ISO 8601 UTC, decimals with their stored scale
 *   (`199.00`), integer cents as integers, JSON columns as compact JSON.
 */

export const CSV_BOM = "﻿";
const FORMULA_RE = /^[=+\-@\t\r]/;
const QUOTE_RE = /[",\r\n]/;

/** A text cell: the formula guard, then RFC 4180 quoting when needed. */
export function csvText(value: string): string {
  const v = FORMULA_RE.test(value) ? `'${value}` : value;
  return QUOTE_RE.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** What `csvValue` needs to know of a column (a drizzle column satisfies it). */
export interface CsvColumnInfo {
  columnType?: string;
  scale?: number;
}

/** One value as a CSV cell (already escaped). */
export function csvValue(value: unknown, col?: CsvColumnInfo): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "";
    const scale = col?.columnType === "MySqlDecimalNumber" && typeof col.scale === "number" ? col.scale : null;
    return scale !== null ? value.toFixed(scale) : String(value);
  }
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : "";
  if (typeof value === "string") return csvText(value);
  return csvText(JSON.stringify(value) ?? "");
}

/** One CSV line of already-escaped cells, CRLF-terminated. */
export function csvLine(cells: readonly string[]): string {
  return `${cells.join(",")}\r\n`;
}

/** A header line (column names are code, never input, but they are escaped like any text). */
export function csvHeader(names: readonly string[]): string {
  return csvLine(names.map(csvText));
}
