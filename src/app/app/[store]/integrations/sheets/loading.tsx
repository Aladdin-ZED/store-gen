import { Screen } from "@/components/admin/common/screen";

/**
 * The Google Sheets screen while it streams: the header, the status card with its four figures, Last runs and the
 * export key card, in the page's own layout. It fades in after ~200 ms, so a fast render never flashes it.
 */
export default function Loading() {
  return (
    <Screen>
      <div aria-busy="true" aria-live="polite" className="adm-fade grid max-w-5xl gap-5" style={{ ["--i" as string]: 5 }}>
        <span className="sr-only">Loading…</span>
        <div className="mb-3 grid gap-3">
          <div className="adm-shimmer h-10 w-56 max-w-full rounded-xl" />
          <div className="adm-shimmer h-4 w-[30rem] max-w-full rounded-full" />
        </div>
        <div className="adm-surface-flat grid gap-5 p-4 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="grid gap-2">
              <div className="adm-shimmer h-4 w-40 rounded-full" />
              <div className="adm-shimmer h-3 w-56 rounded-full" />
            </div>
            <div className="flex gap-2">
              <div className="adm-shimmer h-8 w-32 rounded-lg" />
              <div className="adm-shimmer h-8 w-28 rounded-lg" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="adm-shimmer h-16 rounded-xl" style={{ animationDelay: `${i * 90}ms` }} />
            ))}
          </div>
          <div className="adm-shimmer h-16 rounded-2xl" />
        </div>
        <div className="adm-shimmer h-72 rounded-[var(--adm-radius)]" />
        <div className="adm-shimmer h-48 rounded-[var(--adm-radius)]" />
      </div>
    </Screen>
  );
}
