/**
 * Store setting `sheets_sa` (docs/STORE-SAAS.md §D.10; operations.md IN-09, OPE Q.3d; level S, **secret**; R2): a
 * store-owned Google service account. S5 INTEGRATIONS 2 owns this file in R2; the R2 contract step (C2-E) registered
 * the key with this shape (`json` ≤ 20,000 characters, null = not set; the browser sees "set / not set" through the
 * masked field) and S5 refines the validation (a parsed service-account JSON) without changing it.
 */
import { z } from "zod";

export const SheetsSaSetting = z.object({
  json: z.string().min(2).max(20_000).nullable().default(null),
});
export type SheetsSaSetting = z.output<typeof SheetsSaSetting>;
