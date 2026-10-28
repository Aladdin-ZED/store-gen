/**
 * Store Health rules of the ops track (P4 CALL CENTER, operations.md).
 * Extension file (docs/STORE-SAAS.md §I.7, §K.3), created empty at P0 and imported by src/lib/health/registry.ts;
 * the track fills it (sentences `health.<track>.<rule>.*` in its own i18n file, D67) and never edits the registry.
 */
import type { HealthRule, HealthRuleFixture } from "../types";

export const rules: HealthRule[] = [];

/** `test:health` fixtures of this file's rules (one per rule, `HealthRuleFixture`, P0b), filled by the track with its rules. */
export const fixtures: HealthRuleFixture[] = [];
