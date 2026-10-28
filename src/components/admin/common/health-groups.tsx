/**
 * HealthGroups (P2 SHELL; platform.md PLA-§22.12, §22.16, PD42; docs/STORE-SAAS.md §I.7): the seven groups of the
 * Store Health score as hairline bars, each its label and its penalty over the group's cap.
 *
 * Props frozen at PLA-§22.12 (src/lib/contracts/r1-p0b-platform.ts); P1 builds against them before P2 merges.
 * P0b stub: the track replaces the body, never the signature. The stub renders one list item per group of `caps`:
 * the group id, its component and its cap as text; the group labels and the bars are P2's.
 */
import type { ReactElement } from "react";
import type { HealthGroup } from "@/lib/health/types";

export interface HealthGroupsProps {
  components: Record<HealthGroup, number>;
  caps: Record<HealthGroup, number>;
}

export function HealthGroups(p: HealthGroupsProps): ReactElement | null {
  const groups = Object.keys(p.caps) as HealthGroup[];
  return (
    <ul>
      {groups.map((g) => (
        <li key={g} data-group={g}>
          <span>{g}</span> <span>{`${p.components[g]} / ${p.caps[g]}`}</span>
        </li>
      ))}
    </ul>
  );
}
