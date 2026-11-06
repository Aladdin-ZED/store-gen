/**
 * Release and ops flags of the ops track (P4 CALL CENTER, operations.md).
 * Extension file (docs/STORE-SAAS.md §D.4, §K.3; PLA Q.16), created empty at P0 and imported by
 * src/lib/flags/registry.ts; the boot task seeds what the track declares here.
 *
 *   finance_lite   release, default true: Profit lite (SF-04, OD25, core D63): the /finance screen, its actions, the
 *                  `fin.alerts` job and the `fin:*` Store Health rules. Nothing else in R1 depends on it, so the
 *                  maintainer can defer the feature by flipping the flag.
 */
import type { FlagDef } from "../registry";

export const flags: FlagDef[] = [
  {
    key: "finance_lite",
    kind: "release",
    type: "boolean",
    description: "Profit lite (SF-04): item costs, packaging, my carrier's fees, manual ad spend, break-even CPA and the three profit alerts.",
    default: true,
    ownerTrack: "operations",
  },
];
