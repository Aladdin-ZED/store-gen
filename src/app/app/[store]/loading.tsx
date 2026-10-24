import { Screen } from "@/components/admin/common/screen";

/** Streaming placeholder for every panel screen: header + a calm shimmer grid. */
export default function Loading() {
  return (
    <Screen>
      <div aria-busy="true" aria-live="polite" className="grid gap-8">
        <span className="sr-only">Loading…</span>
        <div className="grid gap-3">
          <div className="adm-shimmer h-3 w-24 rounded-full" />
          <div className="adm-shimmer h-10 w-72 max-w-full rounded-xl" />
          <div className="adm-shimmer h-4 w-96 max-w-full rounded-full" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="adm-shimmer h-32 rounded-[var(--adm-radius)]" style={{ animationDelay: `${i * 90}ms` }} />
          ))}
        </div>
        <div className="adm-shimmer h-80 rounded-[var(--adm-radius)]" />
      </div>
    </Screen>
  );
}
