/**
 * Release and ops flags of the design track (P6 DESIGN, design.md).
 * Extension file (docs/STORE-SAAS.md §D.4, §K.3; PLA Q.16), created empty at P0 and imported by
 * src/lib/flags/registry.ts; the boot task seeds what the track declares here.
 */
import type { FlagDef } from "../registry";

export const flags: FlagDef[] = [
  {
    key: "design_new_heroes",
    kind: "release",
    type: "boolean",
    default: true,
    description: "The new hero families (cinema, quiet, index, contact, statement) in the generation pools; off keeps today's six minus scrapbook",
    ownerTrack: "design",
  },
];
