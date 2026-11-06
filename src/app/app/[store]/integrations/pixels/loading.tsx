import { Screen } from "@/components/admin/common/screen";

/**
 * Connect → Pixels while it streams: the header, the library and the Server events card (three trigger cards, two
 * switches, a pixel row) in the page's own layout. It fades in after ~200 ms, so a fast render never flashes it.
 */
export default function Loading() {
  return (
    <Screen>
      <div aria-busy="true" aria-live="polite" className="adm-fade grid gap-6" style={{ ["--i" as string]: 5 }}>
        <span className="sr-only">Loading…</span>
        <div className="mb-3 grid gap-3">
          <div className="adm-shimmer h-10 w-40 max-w-full rounded-xl" />
          <div className="adm-shimmer h-4 w-[30rem] max-w-full rounded-full" />
        </div>
        <div className="adm-shimmer h-56 rounded-[var(--adm-radius)]" />
        <div className="adm-surface-flat grid gap-5 p-4 sm:p-6">
          <div className="grid gap-2">
            <div className="adm-shimmer h-4 w-36 rounded-full" />
            <div className="adm-shimmer h-3 w-80 max-w-full rounded-full" />
          </div>
          <div className="grid gap-2.5 md:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="adm-shimmer h-32 rounded-2xl" style={{ animationDelay: `${i * 90}ms` }} />
            ))}
          </div>
          <div className="grid gap-2.5 md:grid-cols-2">
            <div className="adm-shimmer h-20 rounded-2xl" />
            <div className="adm-shimmer h-20 rounded-2xl" />
          </div>
          <div className="adm-shimmer h-28 rounded-2xl" />
        </div>
      </div>
    </Screen>
  );
}
