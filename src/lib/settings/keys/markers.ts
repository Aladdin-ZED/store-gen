/**
 * Platform markers (docs/STORE-SAAS.md §D.10; owner: core): one-time boot tasks write them last, so an interrupted
 * run starts over at the next boot.
 *   doc_schema  the document schema the published checksums are computed on (src/lib/db/boot-tasks.ts, DB-19)
 *   tenancy_v1  the store #1 conversion is done (§D.8); `freeRename` is the one-time grant renameHandle() consumes
 *               (ENGC-30). Absent (null) = the conversion has not finished.
 */
import { z } from "zod";
import { isoDateTime } from "../fields";

/** 0 = not synced yet */
export const DocSchemaMarker = z.number().int().min(0);

export const TenancyV1Marker = z
  .object({ v: z.literal(1), at: isoDateTime, store1: z.boolean(), freeRename: z.boolean() })
  .nullable();
export type TenancyV1Marker = z.output<typeof TenancyV1Marker>;
