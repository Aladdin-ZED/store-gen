/**
 * The in-house XLSX writer (operations.md OPE-§18.6 "Writer", rev 3, OPS-27; R2, S3 MONEY; no dependency, OD29).
 * Track S3 owns this file in R2: inline strings (`t="inlineStr"`), two number formats (date, currency with two
 * decimals), `deflateRawSync` per part, ≤ 50,000 rows × 40 columns; LibreOffice and Excel open the files without repair
 * and the reader (`xlsx.ts`) round-trips every writer fixture cell for cell. The contract step (C2-C) froze the
 * signature for S4 LOGISTICS (the manifest export and the Carrier CSV route's `format=xlsx`) and S3's accountant
 * exports. Stub until S3 merges: throws `NotBuiltYet("S3", "writeXlsx")`. No R1 path calls it (the R1 Carrier CSV route
 * answers CSV only until S4 takes it over in R2).
 */
import { notBuiltYet } from "@/lib/contracts/not-built";

/** A text cell (formula-like text stays text), a number, a date, or money in cents with its currency. */
export type Cell = string | number | { date: Date } | { money: number /* cents */; currency: string };

/** The bytes of an .xlsx workbook with one sheet per entry (sheet names ≤ 31 characters). S3 (stub: NotBuiltYet). */
export function writeXlsx(sheets: { name: string; rows: Cell[][] }[]): Uint8Array {
  void sheets;
  return notBuiltYet("S3", "writeXlsx");
}
