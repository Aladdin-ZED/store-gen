/**
 * ModeBadge (P2 SHELL; platform.md PLA-§22.12, PD1, PD30; docs/STORE-SAAS.md §A.6): the store's mode (landing pages,
 * store, or both) as a badge.
 *
 * Props frozen at PLA-§22.12 (src/lib/contracts/r1-p0b-platform.ts); P1 builds against them before P2 merges.
 * P0b stub: the track replaces the body, never the signature. The stub renders the mode id as text; its message is P2's.
 */
import type { ReactElement } from "react";
import type { StoreMode } from "@/lib/tenancy/mode";

export interface ModeBadgeProps {
  mode: StoreMode;
}

export function ModeBadge(p: ModeBadgeProps): ReactElement | null {
  return <span data-mode={p.mode}>{p.mode}</span>;
}
