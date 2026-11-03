"use client";
/**
 * StatusPill (P2 SHELL; platform.md PLA-§22.12, §6, §22.8, PD1; design.md DES-§16.8 "Status chips"; docs/STORE-SAAS.md
 * §A.5): a store's lifecycle status as text plus an icon on its tinted soft ground, never a bare dot (the dot is kept
 * for live state, UX-06). The console's lists and profile, the tenant's store switcher and picker.
 *
 * Props frozen at PLA-§22.12 (src/lib/contracts/r1-p0b-platform.ts). A client component: the label follows the
 * viewer's admin locale (`shell.status.<status>`).
 */
import { ArchiveIcon, BanIcon, CircleCheckIcon, CircleXIcon, ClockIcon, PauseCircleIcon, Trash2Icon, type LucideIcon } from "lucide-react";
import type { ReactElement } from "react";
import { useT } from "@/lib/i18n/admin/client";
import type { StoreStatus } from "@/lib/tenancy/types";
import { cn } from "@/lib/utils";

export interface StatusPillProps {
  status: StoreStatus;
  size?: "sm" | "md";
}

type Tone = "info" | "success" | "warn" | "danger" | "neutral";

const LOOK: Record<StoreStatus, { icon: LucideIcon; tone: Tone }> = {
  pending: { icon: ClockIcon, tone: "info" },
  active: { icon: CircleCheckIcon, tone: "success" },
  restricted: { icon: PauseCircleIcon, tone: "warn" },
  suspended: { icon: BanIcon, tone: "danger" },
  closed: { icon: ArchiveIcon, tone: "neutral" },
  scheduled_deletion: { icon: Trash2Icon, tone: "danger" },
  purged: { icon: Trash2Icon, tone: "neutral" },
  rejected: { icon: CircleXIcon, tone: "danger" },
};

const TONE: Record<Tone, string> = {
  info: "bg-info-soft text-info-ink",
  success: "bg-success-soft text-success-ink",
  warn: "bg-warn-soft text-warn-ink",
  danger: "bg-destructive-soft text-destructive-ink",
  neutral: "bg-muted text-muted-foreground",
};

export function StatusPill(p: StatusPillProps): ReactElement | null {
  const t = useT();
  const look = LOOK[p.status] ?? LOOK.closed;
  const Icon = look.icon;
  const sm = p.size === "sm";
  return (
    <span
      data-status={p.status}
      data-size={sm ? "sm" : "md"}
      className={cn(
        "inline-flex shrink-0 items-center rounded-[var(--r-chip)] font-medium whitespace-nowrap",
        sm ? "h-5 gap-1 px-1.5 text-[11px] [:lang(ar)_&]:text-xs" : "h-6 gap-1.5 px-2 text-xs",
        TONE[look.tone],
      )}
    >
      <Icon aria-hidden="true" className={sm ? "size-3" : "size-3.5"} strokeWidth={2.25} />
      {t(`shell.status.${p.status}`)}
    </span>
  );
}
