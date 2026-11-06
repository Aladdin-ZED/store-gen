/**
 * Settings → Anti-spam while it streams, inside the settings frame: the title, the protection card with its share,
 * the keys card and the explanations. It fades in after ~200 ms, so a fast render never flashes it.
 */
export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite" className="adm-fade grid gap-5" style={{ ["--i" as string]: 5 }}>
      <span className="sr-only">Loading…</span>
      <div className="grid gap-2">
        <div className="adm-shimmer h-6 w-32 rounded-lg" />
        <div className="adm-shimmer h-4 w-[26rem] max-w-full rounded-full" />
      </div>
      <div className="adm-surface-flat grid gap-5 p-4 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="grid gap-2">
            <div className="adm-shimmer h-4 w-36 rounded-full" />
            <div className="adm-shimmer h-3 w-72 max-w-full rounded-full" />
          </div>
          <div className="adm-shimmer h-6 w-24 rounded-full" />
        </div>
        <div className="adm-shimmer h-20 rounded-2xl" />
      </div>
      <div className="adm-shimmer h-56 rounded-[var(--adm-radius)]" />
      <div className="adm-shimmer h-40 rounded-[var(--adm-radius)]" />
    </div>
  );
}
