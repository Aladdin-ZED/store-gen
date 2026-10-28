/**
 * The Store Health rule registry (docs/STORE-SAAS.md §I.7, §K.3). Maintainer-owned: the import lines of every track's
 * `./rules/<track>.ts` (each exports `rules: HealthRule[]`) are pre-written here at P0, empty until the track merges,
 * so no track edits this file. The engine (P1, src/lib/health/engine.ts) filters by release and mode and runs them.
 * P0b (CCR P5-8, P6-13): each file also exports `fixtures: HealthRuleFixture[]`, read by P1's `test:health` through
 * `HEALTH_RULE_FIXTURES` with the file they come from (the PD79 prefix check of `HEALTH_RULE_PREFIXES`).
 */
import { rules as aiRules } from "./rules/ai";
import { rules as designRules } from "./rules/design";
import { rules as integrationsRules } from "./rules/integrations";
import { rules as landingRules } from "./rules/landing";
import { rules as opsRules } from "./rules/ops";
import { rules as platformRules } from "./rules/platform";
import { rules as shellRules } from "./rules/shell";
import { fixtures as aiFixtures } from "./rules/ai";
import { fixtures as designFixtures } from "./rules/design";
import { fixtures as integrationsFixtures } from "./rules/integrations";
import { fixtures as landingFixtures } from "./rules/landing";
import { fixtures as opsFixtures } from "./rules/ops";
import { fixtures as platformFixtures } from "./rules/platform";
import { fixtures as shellFixtures } from "./rules/shell";
import type { HealthRule, HealthRuleFile, HealthRuleFixture } from "./types";

export type { HealthRule } from "./types";

/** Every rule, in track order (P1 … P7; written at P0, `scripts/qa/registries-check.ts` proves no file is left out). */
export const HEALTH_RULES: readonly HealthRule[] = [...platformRules, ...shellRules, ...landingRules, ...opsRules, ...integrationsRules, ...designRules, ...aiRules];

/** Every rules file's fixtures with the file they come from, in the same track order (P0b). */
export const HEALTH_RULE_FIXTURES: readonly { file: HealthRuleFile; fixtures: readonly HealthRuleFixture[] }[] = [
  { file: "platform", fixtures: platformFixtures },
  { file: "shell", fixtures: shellFixtures },
  { file: "landing", fixtures: landingFixtures },
  { file: "ops", fixtures: opsFixtures },
  { file: "integrations", fixtures: integrationsFixtures },
  { file: "design", fixtures: designFixtures },
  { file: "ai", fixtures: aiFixtures },
];
