/** A plan's status as a chip (platform.md PLA-§9.1): active / hidden / retired, text first (never colour alone). */
import { CONSOLE_LOCALE } from "@/components/console/locale";
import { translator } from "@/lib/i18n/admin";
import type { PlanStatus } from "@/lib/platform/plan-rules";
import { cn } from "@/lib/utils";

const tr = translator(CONSOLE_LOCALE);
const TINT: Record<PlanStatus, string> = {
  active: "bg-[var(--c-success-soft)]",
  hidden: "bg-secondary",
  retired: "bg-secondary text-muted-foreground",
};

export function PlanStatusChip({ status }: { status: PlanStatus }) {
  return <span className={cn("inline-flex h-5 items-center rounded-full px-2 text-[11.5px] font-medium", TINT[status])}>{tr(`console.plans.status.${status}`)}</span>;
}
