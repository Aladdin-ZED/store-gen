"use client";
/**
 * HealthGroups (P2 SHELL; platform.md PLA-§22.12, §22.16, PD42; design.md DES-§16.9; docs/STORE-SAAS.md §I.7): the
 * seven groups of the Store Health score as hairline bars, each its label and its penalty over the group's cap
 * ("4 of 15 points to win back"). The penalty is drawn as loss (`--destructive`, DES-§16.9), the rest of the hairline
 * is the muted track; a group with nothing lost reads as a full calm line. Order: `HEALTH_CAPS`' (setup first).
 *
 * Props frozen at PLA-§22.12 (src/lib/contracts/r1-p0b-platform.ts). A penalty is clamped to 0..cap: a component
 * outside its cap is a caller bug, never drawn past the bar.
 */
import type { ReactElement } from "react";
import { HEALTH_CAPS, type HealthGroup } from "@/lib/health/types";
import { useT } from "@/lib/i18n/admin/client";

export interface HealthGroupsProps {
  components: Record<HealthGroup, number>;
  caps: Record<HealthGroup, number>;
}

const ORDER = Object.keys(HEALTH_CAPS) as HealthGroup[];

export function HealthGroups(p: HealthGroupsProps): ReactElement | null {
  const t = useT();
  const groups = ORDER.filter((g) => Object.hasOwn(p.caps, g));
  return (
    <ul className="grid gap-3">
      {groups.map((g) => {
        const cap = Math.max(0, p.caps[g] ?? 0);
        const raw = p.components[g];
        const lost = cap === 0 ? 0 : Math.min(cap, Math.max(0, Number.isFinite(raw) ? Math.round(raw) : 0));
        return (
          <li key={g} data-group={g} className="grid gap-1.5">
            <div className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className="min-w-0 truncate text-foreground">{t(`health.group.${g}`)}</span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                <bdi>{t("health.group.lost", { lost, cap })}</bdi>
              </span>
            </div>
            <div
              role="meter"
              aria-label={t(`health.group.${g}`)}
              aria-valuemin={0}
              aria-valuemax={cap}
              aria-valuenow={lost}
              aria-valuetext={t("health.group.lost", { lost, cap })}
              className="h-1 overflow-hidden rounded-full bg-muted"
            >
              {lost > 0 && <div className="h-full rounded-full bg-destructive" style={{ width: `${(lost / cap) * 100}%` }} />}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
