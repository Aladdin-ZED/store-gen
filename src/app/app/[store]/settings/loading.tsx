/** Settings tab placeholder: the heading and tab list stay; only the content column shimmers. */
export default function SettingsLoading() {
  return (
    <div aria-busy="true" aria-live="polite" className="grid grid-cols-1 gap-5">
      <span className="sr-only">Loading…</span>
      {[13, 9].map((rem, i) => (
        <div key={rem} className="adm-surface grid gap-5 p-5 sm:p-6">
          <div className="grid gap-2">
            <div className="adm-shimmer h-4 w-40 rounded-full" />
            <div className="adm-shimmer h-3 w-72 max-w-full rounded-full" />
          </div>
          <div className="adm-shimmer rounded-2xl" style={{ height: `${rem}rem`, animationDelay: `${i * 90}ms` }} />
        </div>
      ))}
    </div>
  );
}
