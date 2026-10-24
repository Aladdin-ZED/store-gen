/**
 * The Store Health rule registry (docs/STORE-SAAS.md §I.7, §K.3). Maintainer-owned: the import lines of every track's
 * `./rules/<track>.ts` (each exports `rules: HealthRule[]`) are pre-written here at P0, empty until the track merges,
 * so no track edits this file. The engine (P1, src/lib/health/engine.ts) filters by release and mode and runs them.
 */
import type { HealthRule } from "./types";

export type { HealthRule } from "./types";

/** Every rule, in track order (P0: `...<track>Rules` per `./rules/<track>.ts`). */
export const HEALTH_RULES: readonly HealthRule[] = [];
