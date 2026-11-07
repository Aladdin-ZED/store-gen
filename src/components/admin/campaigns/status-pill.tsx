"use client";
/** A campaign's status as a quiet pill (P3 LANDING, wave 2; LAN-§13.1): draft, live, paused, ended. */
import type { CampaignStatus } from "@/lib/campaigns/types";
import { useT } from "@/lib/i18n/admin/client";
import { cn } from "@/lib/utils";

const LOOK: Record<CampaignStatus, { pill: string; dot: string }> = {
  draft: { pill: "bg-foreground/[0.05] text-muted-foreground ring-border", dot: "bg-muted-foreground/60" },
  live: { pill: "bg-emerald-500/10 text-emerald-700 ring-emerald-600/15 dark:text-emerald-300", dot: "bg-emerald-500" },
  paused: { pill: "bg-warn-soft text-warn-ink ring-transparent", dot: "bg-current" },
  ended: { pill: "bg-transparent text-muted-foreground ring-border", dot: "bg-muted-foreground/40" },
};

export function CampaignStatusPill({ status, className }: { status: CampaignStatus; className?: string }) {
  const t = useT();
  const look = LOOK[status];
  return (
    <span className={cn("inline-flex h-6 w-fit shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset", look.pill, className)}>
      <span aria-hidden="true" className={cn("size-1.5 rounded-full", look.dot)} />
      {t(`landing.campaigns.status.${status}`)}
    </span>
  );
}
