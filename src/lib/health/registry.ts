/**
 * The Store Health rule registry (docs/STORE-SAAS.md §I.7, §K.3). Maintainer-owned: the import lines of every track's
 * `./rules/<track>.ts` (each exports `rules: HealthRule[]`) are pre-written here at P0, empty until the track merges,
 * so no track edits this file. The engine (P1, src/lib/health/engine.ts) filters by release and mode and runs them.
 */
import { rules as aiRules } from "./rules/ai";
import { rules as designRules } from "./rules/design";
import { rules as integrationsRules } from "./rules/integrations";
import { rules as landingRules } from "./rules/landing";
import { rules as opsRules } from "./rules/ops";
import { rules as platformRules } from "./rules/platform";
import { rules as shellRules } from "./rules/shell";
import type { HealthRule } from "./types";

export type { HealthRule } from "./types";

/** Every rule, in track order (P1 … P7; written at P0, `scripts/qa/registries-check.ts` proves no file is left out). */
export const HEALTH_RULES: readonly HealthRule[] = [...platformRules, ...shellRules, ...landingRules, ...opsRules, ...integrationsRules, ...designRules, ...aiRules];
