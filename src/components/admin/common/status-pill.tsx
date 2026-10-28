/**
 * StatusPill (P2 SHELL; platform.md PLA-§22.12, §6, §22.8, PD1; docs/STORE-SAAS.md §A.5): a store's lifecycle status
 * as a pill (the console's lists and profile, the tenant's store switcher).
 *
 * Props frozen at PLA-§22.12 (src/lib/contracts/r1-p0b-platform.ts); P1 builds against them before P2 merges.
 * P0b stub: the track replaces the body, never the signature. The stub renders the status id as text; its message and
 * semantic tone are P2's.
 */
import type { ReactElement } from "react";
import type { StoreStatus } from "@/lib/tenancy/types";

export interface StatusPillProps {
  status: StoreStatus;
  size?: "sm" | "md";
}

export function StatusPill(p: StatusPillProps): ReactElement | null {
  return (
    <span data-status={p.status} data-size={p.size ?? "md"}>
      {p.status}
    </span>
  );
}
