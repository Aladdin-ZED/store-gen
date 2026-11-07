/**
 * Store Health rules of the logistics file (S4 LOGISTICS, operations.md OPE-§P).
 * Extension file (docs/STORE-SAAS.md §K.3, §K.4), created empty at the R2 contract step (C2-D) and imported by
 * src/lib/health/registry.ts (HEALTH_RULES, HEALTH_RULE_FIXTURES); the track fills it and never edits the registry.
 * Rule ids use a prefix of HEALTH_RULE_PREFIXES.logistics (ops, ship); every rule gets a fixture below (`test:health`).
 */
import type { HealthRule, HealthRuleFixture } from "../types";

export const rules: HealthRule[] = [];

export const fixtures: HealthRuleFixture[] = [];
