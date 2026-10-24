/**
 * Store setting `export_key` (docs/STORE-SAAS.md §D.10; secret; owner: operations, P5): an optional store-owned
 * Google service-account key embedded only in this store's PHP exports (EXP-03). The platform key is never
 * embedded; a leaked export is stopped by deleting this key in Google Cloud.
 */
import { z } from "zod";
import { isoDateTime } from "../fields";

export const ExportKeySetting = z.object({
  clientEmail: z.email().max(254).nullable().default(null),
  privateKey: z.string().min(100).max(20_000).includes("PRIVATE KEY").nullable().default(null),
  /** Google's key id: what to delete in Google Cloud */
  privateKeyId: z.string().max(200).nullable().default(null),
  setAt: isoDateTime.nullable().default(null),
});
export type ExportKeySetting = z.output<typeof ExportKeySetting>;
