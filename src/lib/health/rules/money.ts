/**
 * Store Health rules of the money file (S3 MONEY, operations.md OPE-§P).
 * Extension file (docs/STORE-SAAS.md §K.3, §K.4), created empty at the R2 contract step (C2-D) and imported by
 * src/lib/health/registry.ts (HEALTH_RULES, HEALTH_RULE_FIXTURES); the track fills it and never edits the registry.
 * Rule ids use a prefix of HEALTH_RULE_PREFIXES.money (fin, ops); every rule gets a fixture below (`test:health`).
 */
import type { HealthRule, HealthRuleFixture } from "../types";

export const rules: HealthRule[] = [];

export const fixtures: HealthRuleFixture[] = [];
