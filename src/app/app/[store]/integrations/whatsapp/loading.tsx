import { Screen } from "@/components/admin/common/screen";

/**
 * The WhatsApp templates screen while it streams: the header, the number and hours cards, the kinds beside the editor
 * and the preview, in the page's own layout. It fades in after ~200 ms, so a fast render never flashes it.
 */
export default function Loading() {
  return (
    <Screen>
      <div aria-busy="true" aria-live="polite" className="adm-fade grid max-w-6xl gap-5" style={{ ["--i" as string]: 5 }}>
        <span className="sr-only">Loading…</span>
        <div className="mb-3 grid gap-3">
          <div className="adm-shimmer h-10 w-52 max-w-full rounded-xl" />
          <div className="adm-shimmer h-4 w-[30rem] max-w-full rounded-full" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="adm-shimmer h-20 rounded-[var(--adm-radius)]" />
          <div className="adm-shimmer h-20 rounded-[var(--adm-radius)]" style={{ animationDelay: "90ms" }} />
        </div>
        <div className="adm-surface-flat grid gap-5 p-4 sm:p-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
          <div className="flex gap-1.5 overflow-hidden lg:flex-col">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="adm-shimmer h-9 w-28 shrink-0 rounded-xl lg:w-full" style={{ animationDelay: `${i * 60}ms` }} />
            ))}
          </div>
          <div className="grid gap-4">
            <div className="adm-shimmer h-10 w-56 rounded-xl" />
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
              <div className="adm-shimmer h-56 rounded-xl" />
              <div className="adm-shimmer h-40 rounded-2xl" />
            </div>
          </div>
        </div>
        <div className="adm-shimmer h-40 rounded-[var(--adm-radius)]" />
      </div>
    </Screen>
  );
}
