import { Screen } from "@/components/admin/common/screen";
import { LinkRowsSkeleton } from "@/components/admin/links/links-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

/** Short links placeholder: the header, the gauge, then the rows in their final shape. */
export default function LinksLoading() {
  return (
    <Screen wide>
      <div className="grid gap-5">
        <div className="mb-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="grid gap-2">
            <Skeleton className="h-8 w-44 rounded-lg" />
            <Skeleton className="h-4 w-[32rem] max-w-full rounded-full" />
          </div>
          <Skeleton className="h-10 w-40 rounded-full" />
        </div>
        <div className="grid max-w-xs gap-2">
          <Skeleton className="h-3.5 w-full rounded-full" />
          <Skeleton className="h-1.5 w-full rounded-full" />
        </div>
        <LinkRowsSkeleton rows={8} />
      </div>
    </Screen>
  );
}
