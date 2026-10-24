/**
 * Store Health types (docs/STORE-SAAS.md §I.7, SF-03, D53; platform.md PLA-§6.3). Isomorphic, maintainer-owned
 * (§K.3). One computation, two audiences: the tenant ring (issues, never console flags) and the console (both). The
 * score is advisory and monotonic: fixing an issue never lowers it, and it never gates anything (publish gates are §M).
 *
 * `HealthInputs` holds the two core fields every rule reads; P1's src/lib/health/inputs.ts widens it at P0 (through
 * the maintainer) with the read APIs of PLA-§6.3.1.
 */
import type { MessageKey, StoreRow, StoreScope } from "@/lib/tenancy/types";
import type { ModeFeature } from "@/lib/tenancy/mode";

export type HealthGroup = "setup" | "trust" | "design" | "conversion" | "operations" | "integrations" | "quota";

/** Σ = 100 */
export const HEALTH_CAPS: Record<HealthGroup, number> = { setup: 20, trust: 15, design: 15, conversion: 15, operations: 15, integrations: 15, quota: 5 };

export interface HealthEvidence {
  metric: string;
  value: number;
  baseline?: number;
  window: string;
  n: number; // always shown
}

export type HealthFix =
  | { kind: "link"; href: (handle: string) => string; label: MessageKey }
  | { kind: "action"; actionId: string /* a CommandDef.id, PD66 */; label: MessageKey };

export interface HealthIssue {
  id: string; // "<track>:<rule>"
  group: HealthGroup;
  severity: 1 | 2 | 3;
  points: 3 | 6 | 10;
  evidence: HealthEvidence;
  fix: HealthFix;
  text: MessageKey; // health.<track>.<rule>.* in the owning track's catalog (D67)
  snoozedUntil?: string;
}

export interface HealthInputs {
  store: StoreRow;
  now: Date;
}

export interface HealthRule {
  id: string;
  group: HealthGroup;
  minN?: number; // silent below this sample size
  release: "R1" | "R2" | "R3";
  mode?: ModeFeature;
  /** ≤ 40 ms, read-only, scoped; never reads another store */
  collect(scope: StoreScope, inputs: HealthInputs): Promise<HealthIssue | null>;
}

/** The console-only flags (PLA-§6.3); a flag that mirrors a track's issue adds no points of its own (rev 4, PD79). */
export type HealthFlagCode =
  | "sheets_backlog"
  | "sheets_error"
  | "outbox_dead"
  | "capi_failing"
  | "telegram_failing"
  | "quota_high"
  | "quota_full"
  | "risky_orders"
  | "inactive_14d"
  | "dormant_60d"
  | "setup_incomplete"
  | "render_failed"
  | "review_waiting"
  | "restricted"
  | "suspended";

export interface HealthFlag {
  code: HealthFlagCode;
  severity: 1 | 2 | 3;
  since: string; // ISO
  value?: number;
  detail?: string; // key, metric or kind
}
