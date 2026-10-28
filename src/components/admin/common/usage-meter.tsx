/**
 * UsageMeter (P2 SHELL; platform.md PLA-§22.12, §22.9, §9, PD1; docs/STORE-SAAS.md §G.4): one quota as used / limit,
 * warning from `warnAt` (0.8 by default) of the limit; `limit: null` = unlimited (no bar).
 *
 * Props frozen at PLA-§22.12 (src/lib/contracts/r1-p0b-platform.ts); P1 builds against them before P2 merges.
 * P0b stub: the track replaces the body, never the signature. The stub renders the label, the used value (over the
 * limit when there is one) and a native meter; the unit's formatting (bytes, credits) is P2's.
 */
import type { ReactElement } from "react";

export interface UsageMeterProps {
  label: string;
  used: number;
  limit: number | null;
  unit?: "bytes" | "count" | "credits";
  warnAt?: number /* 0.8 */;
}

export function UsageMeter(p: UsageMeterProps): ReactElement | null {
  const limit = p.limit;
  return (
    <div data-unit={p.unit ?? "count"}>
      <span>{p.label}</span> <span>{limit === null ? p.used : `${p.used} / ${limit}`}</span>
      {limit !== null && limit > 0 && <meter aria-label={p.label} min={0} max={limit} value={Math.min(p.used, limit)} high={limit * (p.warnAt ?? 0.8)} />}
    </div>
  );
}
