import { Screen } from "@/components/admin/common/screen";
import { LeadRowsSkeleton } from "@/components/admin/leads/leads-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

/** Leads placeholder: the header, the five counters, the views and filters, then the rows as the inbox fills them. */
export default function LeadsLoading() {
  return (
    <Screen wide>
      <div className="grid gap-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="grid gap-2">
            <Skeleton className="h-7 w-32 rounded-lg" />
            <Skeleton className="h-4 w-96 max-w-full rounded-full" />
          </div>
          <Skeleton className="h-10 w-36 rounded-full" />
        </div>
        <div className="adm-surface grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="grid gap-2 px-5 py-4">
              <Skeleton className="h-3 w-20 rounded-full" />
              <Skeleton className="h-6 w-12 rounded-md" />
              <Skeleton className="h-3 w-16 rounded-full" />
            </div>
          ))}
        </div>
        <Skeleton className="h-9 w-[30rem] max-w-full rounded-full" />
        <div className="flex gap-2 overflow-hidden">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-9 w-36 shrink-0 rounded-full" />
          ))}
        </div>
        <LeadRowsSkeleton rows={8} />
      </div>
    </Screen>
  );
}
