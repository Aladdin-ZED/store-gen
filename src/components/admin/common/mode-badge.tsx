"use client";
/**
 * ModeBadge (P2 SHELL; platform.md PLA-§22.12, PD1, PD30; docs/STORE-SAAS.md §A.6): the store's mode (landing pages,
 * full store, or both) as a quiet hairline badge with its icon; never a status colour (a mode is not a state).
 *
 * Props frozen at PLA-§22.12 (src/lib/contracts/r1-p0b-platform.ts). A client component: the label follows the
 * viewer's admin locale (`shell.mode.<mode>`).
 */
import { LayersIcon, PanelsTopLeftIcon, StoreIcon, type LucideIcon } from "lucide-react";
import type { ReactElement } from "react";
import { useT } from "@/lib/i18n/admin/client";
import type { StoreMode } from "@/lib/tenancy/mode";

export interface ModeBadgeProps {
  mode: StoreMode;
}

const ICON: Record<StoreMode, LucideIcon> = { landing: PanelsTopLeftIcon, store: StoreIcon, both: LayersIcon };

export function ModeBadge(p: ModeBadgeProps): ReactElement | null {
  const t = useT();
  const Icon = ICON[p.mode] ?? PanelsTopLeftIcon;
  return (
    <span
      data-mode={p.mode}
      className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-[var(--r-chip)] px-2 text-xs font-medium whitespace-nowrap text-foreground/80 ring-1 ring-border ring-inset"
    >
      <Icon aria-hidden="true" className="size-3.5 text-muted-foreground" />
      {t(`shell.mode.${p.mode}`)}
    </span>
  );
}
