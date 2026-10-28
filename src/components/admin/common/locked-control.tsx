/**
 * LockedControl (P2 SHELL; platform.md PLA-§22.12, §22.8, §3.6, PD1, PD56): a control that stays visible with a lock
 * glyph and its reason ("Unlocks after approval", the plan, a kill switch, a role, a later release, the impersonation
 * view); pressing it explains, never errors. `LockReason` is also the `disabled` type of `IssueRow`.
 *
 * Props frozen at PLA-§22.12 (src/lib/contracts/r1-p0b-platform.ts); P1 builds against them before P2 merges.
 * P0b stub: the track replaces the body, never the signature. The stub renders its child as given.
 */
import type { ReactElement } from "react";
import type { KillKey } from "@/lib/flags/registry";
import type { FeatureKey } from "@/lib/tenancy/entitlement-keys";
import type { StoreStatus } from "@/lib/tenancy/types";

export type LockReason =
  | { kind: "pending" }
  | { kind: "state"; status: StoreStatus }
  | { kind: "plan"; key: FeatureKey }
  | { kind: "kill"; key: KillKey }
  | { kind: "role" }
  | { kind: "release"; release: "R2" | "R3" }
  | { kind: "impersonation" } /* rev 2, PD56 */;

export interface LockedControlProps {
  reason: LockReason;
  children: ReactElement;
}

export function LockedControl(p: LockedControlProps): ReactElement | null {
  return p.children;
}
