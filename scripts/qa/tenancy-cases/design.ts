/**
 * Two-store attack cases of the design track (P6 DESIGN, design.md).
 * Extension file (docs/STORE-SAAS.md §F.1, §J.2, §K.3; DES-R13), created at P0 and loaded by
 * scripts/qa/tenancy-check.ts (`test:tenancy`), which lists an empty `cases` as not applicable until the track merges.
 * `actions` holds the attack cases of the track's server actions (they join the harness's `ACTION_CASES`): P0 put
 * `checkHeadlinesAction` here, the frozen stub of src/lib/design/actions.ts (DES-§9.8), so the coverage rule holds
 * from P0 on.
 */
import type { TenancyCase, TrackActionCase } from "../tenancy-check";

export const cases: TenancyCase[] = [];

const HEADLINES = ["Huile d'argan pure, pressée à froid", "زيت الأركان الأصلي"];

export const actions: TrackActionCase[] = [
  // reads the platform shingles only (no record of A to name): the role matrix and the effects count
  {
    file: "src/lib/design/actions.ts",
    name: "checkHeadlinesAction",
    area: "generate",
    path: "/generate",
    permission: ["pages.write"],
    write: false,
    victim: () => ["argan", HEADLINES],
    own: () => ["argan", HEADLINES],
  },
];
