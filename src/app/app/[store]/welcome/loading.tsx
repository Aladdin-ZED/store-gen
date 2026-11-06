import { Skeleton } from "@/components/admin/common/skeleton";

/** Streaming placeholder for the welcome flow: the top bar, a heading and the photos step's drop zone (PLA-§22.2). */
export default function Loading() {
  return (
    <div className="flex min-h-svh flex-col bg-background" aria-busy="true">
      <div className="border-b border-border/70">
        <div className="mx-auto flex w-full max-w-[1320px] items-center justify-between gap-4 px-4 py-3 sm:px-8">
          <Skeleton className="h-7 w-36 rounded-lg" />
          <Skeleton className="hidden h-1 w-[220px] rounded-full sm:block" />
          <Skeleton className="h-9 w-24 rounded-full" />
        </div>
      </div>
      <div className="mx-auto grid w-full max-w-[620px] gap-6 px-4 pt-8 sm:px-8 sm:pt-12">
        <Skeleton className="h-8 w-2/3 rounded-lg" />
        <Skeleton className="h-[340px] w-full rounded-2xl sm:h-[380px]" />
      </div>
    </div>
  );
}
