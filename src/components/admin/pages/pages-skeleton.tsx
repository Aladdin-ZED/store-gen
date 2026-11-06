/**
 * The pages list's skeleton (docs/STORE-SAAS.md §I.8 rules 1 and 8): the table the data fills, row for row, used by
 * the route's loading state and, still, as the preview of the empty state. No numbers.
 */
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * The list's grid. lg and up: page, status, trend, views, orders, conversion, confirmed, menu. Below: the page and its
 * menu on the first line, the status and the numbers on the second.
 */
export const PAGE_ROW_GRID = "grid grid-cols-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,2.4fr)_6rem_7rem_4.75rem_4.75rem_7rem_7rem_2.25rem]";

export function PageRowsSkeleton({ rows = 5, still = false, className }: { rows?: number; still?: boolean; className?: string }) {
  const bar = (w: string, extra?: string) => <Skeleton className={cn("h-3 rounded-full", w, still && "animate-none", extra)} />;
  return (
    <div aria-hidden="true" className={cn("adm-surface overflow-hidden", className)}>
      <div className={cn(PAGE_ROW_GRID, "hidden items-center gap-4 border-b border-border/60 px-5 py-3 lg:grid")}>
        {["w-16", "w-12", "w-14", "w-10", "w-10", "w-16", "w-16"].map((w, i) => (
          <span key={i} className="flex">
            {bar(w, "h-2.5 opacity-60")}
          </span>
        ))}
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={cn(PAGE_ROW_GRID, "items-center gap-x-3 gap-y-3 border-b border-border/50 px-4 py-3.5 last:border-b-0 lg:gap-4 lg:px-5")}>
          <div className="flex min-w-0 items-center gap-3">
            <Skeleton className={cn("size-8 shrink-0 rounded-lg", still && "animate-none")} />
            <div className="grid gap-1.5">
              {bar(i % 2 ? "w-40" : "w-52")}
              {bar("w-28", "h-2.5 opacity-70")}
            </div>
          </div>
          <Skeleton className={cn("col-start-2 row-start-1 size-7 rounded-full lg:col-start-8", still && "animate-none")} />
          <div className="col-span-2 flex flex-wrap items-center gap-4 lg:contents">
            {bar("w-12", "h-5")}
            <Skeleton className={cn("hidden h-6 w-24 rounded-md sm:block", still && "animate-none")} />
            {bar("w-9")}
            {bar("w-9")}
            {bar("w-14")}
            {bar("w-14")}
          </div>
        </div>
      ))}
    </div>
  );
}
