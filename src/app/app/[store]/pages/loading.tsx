import { Screen } from "@/components/admin/common/screen";
import { PageRowsSkeleton } from "@/components/admin/pages/pages-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

/** Pages placeholder: the header, the address line, the toolbar and the rows of the list, as the data fills them. */
export default function PagesLoading() {
  return (
    <Screen wide>
      <div className="grid gap-3">
        <Skeleton className="h-7 w-28 rounded-lg" />
        <Skeleton className="h-4 w-72 max-w-full rounded-full" />
        <Skeleton className="mt-2 h-[3.25rem] w-full max-w-xl rounded-2xl" />
      </div>
      <div className="mt-6 grid gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Skeleton className="h-9 w-80 max-w-full rounded-full" />
          <div className="flex gap-2">
            <Skeleton className="h-9 w-48 rounded-full" />
            <Skeleton className="h-9 w-40 rounded-full" />
          </div>
        </div>
        <PageRowsSkeleton rows={6} />
      </div>
    </Screen>
  );
}
