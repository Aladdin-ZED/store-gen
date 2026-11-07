/**
 * Store setting `carrier_credentials` (docs/STORE-SAAS.md §D.10; operations.md OPE-§17.3; level S, **secret**; R2).
 * S4 LOGISTICS owns this file in R2; the R2 contract step (C2-E) registered the key with this shape and S4 refines the
 * validation without changing it: `accounts` maps a `carrier_accounts.id` to that account's adapter credentials, one
 * opaque string (the adapter's JSON: API key, account number, …), encrypted at rest like every secret key and masked
 * entry by entry in the browser (`sensitive: ["accounts"]`). Never exported, never logged.
 */
import { z } from "zod";

export const CarrierCredentialsSetting = z.object({
  accounts: z
    .record(z.string().regex(/^[0-9A-Z]{26}$/), z.string().min(1).max(4_000))
    .refine((o) => Object.keys(o).length <= 50, { error: "At most 50 carrier accounts." })
    .default({}),
});
export type CarrierCredentialsSetting = z.output<typeof CarrierCredentialsSetting>;
