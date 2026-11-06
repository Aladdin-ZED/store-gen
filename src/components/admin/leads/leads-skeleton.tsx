/**
 * The lead inbox's skeleton rows (docs/STORE-SAAS.md §I.8 rules 1, 6 and 8): the same grid as the rows, two lines on
 * a phone. Used by the route's loading state and, still, as the preview of the empty inbox (never a number).
 */
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** lg and up: select, status, customer, city, selection, total, age, tries, assignee, actions. */
export const LEAD_ROW_GRID = "lg:grid-cols-[1.75rem_6.5rem_minmax(0,1.3fr)_minmax(0,0.8fr)_minmax(0,1.6fr)_6.5rem_4rem_3.5rem_7rem_6.5rem]";

export function LeadRowsSkeleton({ rows = 6, still = false, className }: { rows?: number; still?: boolean; className?: string }) {
  const bar = (w: string, extra?: string) => <Skeleton className={cn("h-3 rounded-full", w, still && "animate-none", extra)} />;
  return (
    <div aria-hidden="true" className={cn("adm-surface overflow-hidden", className)}>
      <div className={cn("hidden items-center gap-3 border-b border-border/60 px-4 py-3 lg:grid", LEAD_ROW_GRID)}>
        <Skeleton className={cn("size-4 rounded", still && "animate-none")} />
        {["w-12", "w-16", "w-10", "w-20", "w-10", "w-8", "w-8", "w-14", ""].map((w, i) => (
          <span key={i}>{w && bar(w, "h-2.5 opacity-60")}</span>
        ))}
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={cn("grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2.5 border-b border-border/50 px-4 py-3.5 last:border-b-0 lg:gap-3", LEAD_ROW_GRID)}>
          <Skeleton className={cn("hidden size-4 rounded lg:block", still && "animate-none")} />
          <span className="hidden lg:block">{bar("w-16", "h-5")}</span>
          <div className="grid gap-1.5">
            {bar(i % 2 ? "w-28" : "w-36")}
            {bar("w-24", "h-2.5 opacity-70")}
          </div>
          <span className="hidden lg:block">{bar("w-16")}</span>
          <div className="col-span-2 grid gap-1.5 lg:col-span-1">{bar(i % 3 ? "w-48" : "w-36", "opacity-80")}</div>
          <span className="hidden lg:block">{bar("w-14")}</span>
          <span className="hidden lg:block">{bar("w-8")}</span>
          <span className="hidden lg:block">{bar("w-6")}</span>
          <span className="hidden lg:block">{bar("w-16")}</span>
          <div className="col-start-2 row-start-1 flex gap-2 lg:col-start-auto lg:row-start-auto lg:justify-end">
            <Skeleton className={cn("size-11 rounded-full lg:size-8", still && "animate-none")} />
            <Skeleton className={cn("size-11 rounded-full lg:size-8", still && "animate-none")} />
          </div>
        </div>
      ))}
    </div>
  );
}
