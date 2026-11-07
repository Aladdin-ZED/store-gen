/**
 * The import framework's kind registry (operations.md OPE-§18.1-§18.5; core D38). Track S3 MONEY owns
 * `src/lib/imports/**` in R2 (parser, mapping spec, detect, map, preview, commit, the `imports.commit` job, the run
 * rows). The contract step (C2-C) froze the types S4 LOGISTICS implements for its `tracking` and `status` kinds
 * (`src/lib/shipping/import-kinds.ts`, imported here) and the mapping spec both tracks store:
 *   - S3 owns what a file becomes (detect → map → `MappedRow`s) and the run (preview, commit slices of 2,000, report);
 *   - the kind's handler owns what each mapped row does (`preview` without a write, `commitSlice` idempotent by the
 *     rows' own keys); the preview and the committed report are the SAME shape (`RowResult`), so what the owner saw is
 *     what happened;
 *   - every effect goes through `applyExternalStatus` or the finance repositories with the store scope; an import never
 *     creates an order and never moves the ship axis backwards.
 * A handler that is not built yet throws `NotBuiltYet` (src/lib/contracts/not-built.ts); S3 answers `kind_unavailable`
 * for it. The contract body of `importKindDefs` lists S4's kinds only; S3 adds its own. No R1 path imports this file.
 */
import { z } from "zod";
import type { IMPORT_KINDS } from "@/lib/db/schema";
import type { StorePermission } from "@/lib/auth/permissions";
import { logisticsImportKinds } from "@/lib/shipping/import-kinds";
import type { FeatureKey } from "@/lib/tenancy/entitlement-keys";
import type { StoreScope, WriteScope } from "@/lib/tenancy/types";

/** `import_mappings.kind` / `import_runs.kind` (0006): remittance, tracking, status, ad_spend, expenses, manifest (export); products, reviews are R3. */
export type ImportKind = (typeof IMPORT_KINDS)[number];

/** Every mappable field of the R2 kinds (OPE-§18.3 table). */
export const IMPORT_FIELDS = [
  // remittance
  "statement_ref", "paid_at", "tracking", "order_id", "phone", "cod_amount", "fee", "return_fee", "net", "customer_name",
  // tracking / status
  "carrier_status", "at", "postponed_to",
  // ad_spend
  "day", "platform", "account_id", "campaign_id", "campaign_name", "spend", "currency",
  // expenses
  "category", "amount", "note",
] as const;
export const ImportField = z.enum(IMPORT_FIELDS);
export type ImportField = z.infer<typeof ImportField>;

/** OPE-§18.3 (zod 4: a partial record, a mapping names only the columns it has). ≤ 8 KB serialised. */
export const MappingSpec = z.object({
  v: z.literal(1),
  headerRow: z.number().int().min(0).max(50),
  skipRows: z.number().int().min(0).max(50).default(0),
  decimal: z.enum([",", "."]).optional(),
  dateFormat: z.enum(["dd/mm/yyyy", "yyyy-mm-dd", "dd-mm-yyyy", "mm/dd/yyyy", "excel"]).optional(),
  columns: z.partialRecord(ImportField, z.object({ col: z.union([z.string().max(80), z.number().int().min(0)]), transform: z.enum(["trim", "upper", "digits", "money", "date"]).optional() })),
  /** e.g. platform = "meta", statement_ref from the file name */
  constants: z.partialRecord(ImportField, z.string().max(80)).default({}),
  /** hash of the folded header cells, for auto-pick */
  headerSignature: z.string().length(16),
});
export type MappingSpec = z.infer<typeof MappingSpec>;

/**
 * One mapped row: money as integer cents (half-up), dates as ISO 8601 UTC strings (parsed in the store timezone), every
 * other value as trimmed text; null = the mapped cell was empty. `rowNo` = the 1-based row of the file.
 */
export type MappedValue = string | number | null;
export interface MappedRow {
  rowNo: number;
  values: Partial<Record<ImportField, MappedValue>>;
}

/** One row's outcome (`import_runs.report`, ≤ 200 errors kept): the preview and the commit answer the same shape. */
export interface RowResult {
  rowNo: number;
  result: "ok" | `skipped:${string}` | `failed:${string}`;
  /** the matched order, when any */
  orderId: string | null;
  /** OPE-§16.7: an event dated before the order's current state */
  late?: boolean;
}

/** What the preview shows: "212 lines: 198 matched, 9 amount differences, 5 unknown". */
export interface PreviewSummary {
  rows: number;
  /** per outcome label of the kind (e.g. ok, matched, amount_diff, unknown, skipped, failed) */
  counts: Record<string, number>;
  /** the first 50 rows' outcomes (plain-words errors are rendered from `result`) */
  results: RowResult[];
  /** the money the file moves, when the kind has one */
  totalCents: number | null;
}

/** The run a handler works for: `createdAt` is the deterministic clock of a file without dates (S4). */
export interface ImportRunCtx {
  id: string;
  kind: ImportKind;
  /** '' = no carrier account */
  carrierAccountId: string;
  createdAt: Date;
  createdBy: string | null;
  /** the store timezone the dates were parsed in */
  tz: string;
  currency: string;
}

/** What a kind does with its rows (S4 implements tracking / status; S3 the others). */
export interface ImportKindHandler {
  /** no write; ≤ 2,000 rows */
  preview(scope: StoreScope, rows: readonly MappedRow[], run: ImportRunCtx): Promise<PreviewSummary>;
  /** one slice of ≤ 2,000 rows; idempotent by the rows' own keys (a resumed run never double-books) */
  commitSlice(scope: WriteScope, rows: readonly MappedRow[], run: ImportRunCtx): Promise<RowResult[]>;
}

export interface ImportKindDef extends ImportKindHandler {
  kind: ImportKind;
  /** the permission to preview and commit the kind */
  permission: StorePermission;
  /** the entitlement the kind needs (null = none) */
  feature: FeatureKey | null;
  /** required fields: each entry is one field, or a list of which at least one must be mapped */
  fields: { required: (ImportField | readonly ImportField[])[]; optional: ImportField[] };
}

/** Every registered import kind. S3 (contract body: S4's logistics kinds only). */
export function importKindDefs(): readonly ImportKindDef[] {
  return logisticsImportKinds;
}
