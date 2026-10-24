/**
 * Store setting `sheets` (docs/STORE-SAAS.md §D.10, operations.md OPE-§19.2; owner: operations, P5): the store's
 * Google Sheet. Uniqueness and the ownership proof live in `sheet_bindings` (SHT-01, SHT-09); `pending` is a
 * connection awaiting its proof. Accepts the legacy single-tenant value as it is.
 */
import { z } from "zod";
import { isoDateTime, optional, optionalText } from "../fields";

export const SheetsSetting = z.object({
  enabled: z.boolean().default(false),
  url: optional(z.url({ protocol: /^https$/, hostname: /^docs\.google\.com$/ }).max(500)),
  spreadsheetId: optional(z.string().regex(/^[A-Za-z0-9_-]{20,100}$/)),
  sheetId: z.number().int().nonnegative().optional(),
  sheetTitle: optionalText(100),
  connectedAt: isoDateTime.nullable().optional(),
  /** read statuses back from the sheet */
  pull: z.boolean().default(true),
  pending: z
    .object({
      spreadsheetId: z.string().regex(/^[A-Za-z0-9_-]{20,100}$/),
      sheetId: z.number().int().nonnegative().nullable(),
      codeHash: z.string().length(64),
      expiresAt: isoDateTime,
    })
    .nullable()
    .default(null),
});
export type SheetsSetting = z.output<typeof SheetsSetting>;
