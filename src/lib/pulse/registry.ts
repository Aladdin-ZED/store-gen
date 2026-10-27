/**
 * The pulse contributor registry (docs/STORE-SAAS.md §I.4, §K.3). Maintainer-owned: the import lines of
 * `./contributors/<track>.ts` are pre-written here at P0, so no track edits this file. The pulse route (P2) runs each
 * contributor within its 50 ms budget; a slow or failing one omits its keys.
 */
import { contributor as integrations } from "./contributors/integrations";
import { contributor as landing } from "./contributors/landing";
import { contributor as ops } from "./contributors/ops";
import { contributor as shell } from "./contributors/shell";
import type { PulseContributor } from "./types";

export type { PulseContributor, StorePulse } from "./types";

/** Every contributor, in track order (P2 … P5; written at P0, `scripts/qa/registries-check.ts` proves none is left out). */
export const PULSE_CONTRIBUTORS: readonly PulseContributor[] = [shell, landing, ops, integrations];
