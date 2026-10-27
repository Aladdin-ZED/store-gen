/**
 * Flag declarations and the kill-switch keys (docs/STORE-SAAS.md §D.4, §H.8; platform.md PLA-§12.2). Isomorphic.
 *
 * Release, ops and experiment flags are declared in code: each track exports `flags: FlagDef[]` from
 * `src/lib/flags/defs/<track>.ts`, this registry imports them (the maintainer pre-writes the import lines at P0,
 * §K.3, so no track edits this file) and the boot task seeds them (`INSERT IGNORE`; console edits to the default
 * and the rules are never overwritten; a flag missing from code is marked `archived`, never deleted). Values are
 * read through `flagValue()` (src/lib/platform/flags.ts, P1). The kill switches are seeded by 0004 and read through
 * `activeKillSwitches()` (src/lib/tenancy/entitlements.ts, T1, cached 30 s; `invalidateFlags()` beside it).
 */
import type { FlagValue } from "@/lib/db/schema";
import { flags as aiFlags } from "./defs/ai";
import { flags as designFlags } from "./defs/design";
import { flags as opsFlags } from "./defs/ops";
import { flags as platformFlags } from "./defs/platform";

export type { FlagRule, FlagValue } from "@/lib/db/schema";

export interface FlagDef<T extends FlagValue = FlagValue> {
  key: string; // ≤ 64 chars, snake_case
  kind: "release" | "ops" | "experiment";
  type: "boolean" | "number" | "string" | "json";
  description: string; // ≤ 300 chars, shown in the console
  default: T;
  ownerTrack: string; // ≤ 16 chars, e.g. "ai", "operations"
}

/** The `flags` rows of kind `kill` (0004 seed): `*_enabled` default true, `platform_read_only` default false. */
export const KILL_SWITCHES = [
  "signups_enabled",
  "publishing_enabled",
  "ai_generation_enabled",
  "sheets_sync_enabled",
  "capi_enabled",
  "uploads_enabled",
  "platform_read_only",
] as const;
export type KillKey = (typeof KILL_SWITCHES)[number];

export function isKillKey(value: unknown): value is KillKey {
  return typeof value === "string" && (KILL_SWITCHES as readonly string[]).includes(value);
}

/** A switch is tripped when an `*_enabled` row is false or `platform_read_only` is true. */
export function killTripped(key: KillKey, value: boolean): boolean {
  return key === "platform_read_only" ? value : !value;
}

/** Every declared flag, in track order (P1, P4, P6, P7; written at P0, `scripts/qa/registries-check.ts` proves none is left out). */
export const FLAG_DEFS: readonly FlagDef[] = [...platformFlags, ...opsFlags, ...designFlags, ...aiFlags];

export function flagDef(key: string): FlagDef | undefined {
  return FLAG_DEFS.find((f) => f.key === key);
}
