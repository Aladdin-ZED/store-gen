import { Screen } from "@/components/admin/common/screen";

/**
 * The integrations hub while it streams: the header, three strip tiles, the backlog card beside What to check, and
 * the log's rows, in the page's own layout. It fades in after ~200 ms, so a fast render never flashes it.
 */
export default function Loading() {
  return (
    <Screen>
      <div aria-busy="true" aria-live="polite" className="adm-fade grid gap-8" style={{ ["--i" as string]: 5 }}>
        <span className="sr-only">Loading…</span>
        <div className="grid gap-3">
          <div className="adm-shimmer h-10 w-56 max-w-full rounded-xl" />
          <div className="adm-shimmer h-4 w-[30rem] max-w-full rounded-full" />
        </div>
        <div className="grid gap-3">
          <div className="adm-shimmer h-4 w-28 rounded-full" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="adm-shimmer h-40 rounded-[var(--adm-radius)] max-sm:[&:nth-child(n+2)]:hidden" style={{ animationDelay: `${i * 90}ms` }} />
            ))}
          </div>
        </div>
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="adm-shimmer h-80 rounded-[var(--adm-radius)]" />
          <div className="adm-shimmer h-56 rounded-[var(--adm-radius)]" />
        </div>
        <div className="grid gap-3">
          <div className="adm-shimmer h-4 w-24 rounded-full" />
          <div className="flex gap-2">
            <div className="adm-shimmer h-8 w-40 rounded-lg" />
            <div className="adm-shimmer h-8 w-40 rounded-lg" />
          </div>
          <div className="adm-shimmer h-96 rounded-[var(--adm-radius)]" />
        </div>
      </div>
    </Screen>
  );
}
