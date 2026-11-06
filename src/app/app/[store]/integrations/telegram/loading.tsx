import { Screen } from "@/components/admin/common/screen";

/**
 * The Telegram screen while it streams: the header, the three setup steps and the notifications card, in the page's
 * own layout. It fades in after ~200 ms, so a fast render never flashes it.
 */
export default function Loading() {
  return (
    <Screen>
      <div aria-busy="true" aria-live="polite" className="adm-fade grid max-w-3xl gap-5" style={{ ["--i" as string]: 5 }}>
        <span className="sr-only">Loading…</span>
        <div className="mb-3 grid gap-3">
          <div className="adm-shimmer h-10 w-48 max-w-full rounded-xl" />
          <div className="adm-shimmer h-4 w-[28rem] max-w-full rounded-full" />
        </div>
        <div className="adm-surface-flat grid gap-6 p-4 sm:p-6">
          <div className="grid gap-2">
            <div className="adm-shimmer h-4 w-40 rounded-full" />
            <div className="adm-shimmer h-3 w-72 max-w-full rounded-full" />
          </div>
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex gap-4">
              <div className="adm-shimmer size-8 shrink-0 rounded-full" style={{ animationDelay: `${i * 90}ms` }} />
              <div className="grid flex-1 gap-2 pt-1.5">
                <div className="adm-shimmer h-3.5 w-32 rounded-full" />
                <div className="adm-shimmer h-9 w-full max-w-md rounded-lg" />
              </div>
            </div>
          ))}
        </div>
        <div className="adm-shimmer h-80 rounded-[var(--adm-radius)]" />
      </div>
    </Screen>
  );
}
