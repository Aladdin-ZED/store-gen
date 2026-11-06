import { Screen } from "@/components/admin/common/screen";
import { Skeleton } from "@/components/ui/skeleton";

/** The brand page's skeleton: the header, the rail, the form column and the specimen at their real sizes (DES-§12.7). */
export default function BrandLoading() {
  return (
    <Screen wide>
      <div className="grid gap-6" aria-busy="true">
        <div className="grid gap-2">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <Skeleton className="h-9 w-full rounded-lg lg:hidden" />
        <div className="grid gap-6 lg:grid-cols-[160px_minmax(0,480px)_320px] xl:grid-cols-[200px_minmax(0,560px)_400px]">
          <div className="hidden gap-1 lg:grid lg:content-start">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-9 rounded-md" />
            ))}
          </div>
          <div className="grid content-start gap-6">
            <Skeleton className="h-[200px] rounded-2xl lg:hidden" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-[260px] rounded-2xl" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-14 rounded-xl" />
          </div>
          <Skeleton className="hidden h-[420px] rounded-2xl lg:block" />
        </div>
      </div>
    </Screen>
  );
}
