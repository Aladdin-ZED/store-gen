import { Screen } from "@/components/admin/common/screen";
import { Skeleton } from "@/components/ui/skeleton";

/** Campaigns placeholder: the header, the gauge, then rows in their final shape. */
export default function CampaignsLoading() {
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
        <div className="adm-surface divide-y divide-border/60">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="grid gap-2 px-5 py-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1.2fr)_7rem_6rem_7rem_1.5rem] xl:items-center xl:gap-4">
              <div className="grid gap-1.5">
                <Skeleton className="h-4 w-48 rounded-full" />
                <Skeleton className="h-3 w-32 rounded-full" />
              </div>
              <Skeleton className="h-3.5 w-36 rounded-full" />
              <Skeleton className="h-6 w-16 rounded-full" />
              <Skeleton className="hidden h-3.5 w-10 justify-self-end rounded-full xl:block" />
              <Skeleton className="hidden h-3.5 w-10 justify-self-end rounded-full xl:block" />
            </div>
          ))}
        </div>
      </div>
    </Screen>
  );
}
