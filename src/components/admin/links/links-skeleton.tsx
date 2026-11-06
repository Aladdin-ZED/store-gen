import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** The column template of the links list on wide screens (header, rows and skeleton share it; every track has a fixed
 * floor or width, so the header row, whose actions cell is empty, lines up with the link rows). */
export const LINK_COLUMNS = "xl:grid-cols-[minmax(8rem,1.1fr)_minmax(8rem,1.3fr)_minmax(5rem,0.7fr)_minmax(7rem,1.1fr)_4rem_6rem_5.5rem_7.5rem]";

/**
 * Placeholder rows in the final shape of the links list: two lines on a phone (code and clicks, then target and
 * actions), one grid row per link on a wide screen (≥ 1280 px: the eight columns need the room beside the sidebar). `preview`: the still copy inside the empty state.
 */
export function LinkRowsSkeleton({ rows = 6, preview = false, className }: { rows?: number; preview?: boolean; className?: string }) {
  return (
    <div aria-hidden="true" className={cn("adm-surface divide-y divide-border/70 overflow-hidden", preview && "w-full max-w-md text-start", className)}>
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className={cn("grid gap-2 px-4 py-3.5", !preview && cn("xl:items-center xl:gap-4 xl:px-5", LINK_COLUMNS), preview && i === 1 && "opacity-75", preview && i === 2 && "opacity-50")}
        >
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-24 rounded-md" />
            <span className="flex-1 xl:hidden" />
            <Skeleton className="h-4 w-10 rounded-md xl:hidden" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-3.5 w-36 rounded-full" />
            <span className="flex-1 xl:hidden" />
            <Skeleton className="h-6 w-16 rounded-full xl:hidden" />
          </div>
          {!preview && (
            <>
              <Skeleton className="hidden h-3.5 w-16 rounded-full xl:block" />
              <Skeleton className="hidden h-5 w-28 rounded-md xl:block" />
              <Skeleton className="hidden h-4 w-8 justify-self-end rounded-md xl:block" />
              <Skeleton className="hidden h-3.5 w-16 rounded-full xl:block" />
              <Skeleton className="hidden h-6 w-16 rounded-full xl:block" />
              <Skeleton className="hidden h-8 w-24 rounded-full xl:block" />
            </>
          )}
        </div>
      ))}
    </div>
  );
}
