/**
 * The pulse contributor registry (docs/STORE-SAAS.md §I.4, §K.3). Maintainer-owned: the import lines of
 * `./contributors/<track>.ts` are pre-written here at P0, so no track edits this file. The pulse route (P2) runs each
 * contributor within its 50 ms budget; a slow or failing one omits its keys.
 */
import type { PulseContributor } from "./types";

export type { PulseContributor, StorePulse } from "./types";

/** Every contributor, in track order (P0: one entry per `./contributors/<track>.ts`). */
export const PULSE_CONTRIBUTORS: readonly PulseContributor[] = [];
