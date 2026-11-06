import { Screen } from "@/components/admin/common/screen";

/**
 * The orders list's streaming placeholder (OPE-§12, core §I.8 rule 1): the screen's own frame (header, sections, view
 * tabs, filters, the rows), so nothing jumps when the first page arrives. Static shapes only: the language is not
 * known yet.
 */
export default function OrdersLoading() {
  return (
    <Screen wide>
      <div aria-busy="true" className="grid gap-5">
        <span className="sr-only">Loading…</span>
        <div className="grid gap-2">
          <div className="adm-shimmer h-7 w-40 rounded-lg" />
          <div className="adm-shimmer h-4 w-96 max-w-full rounded-md" />
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="adm-shimmer h-10 w-64 rounded-full" />
          <div className="adm-shimmer h-9 w-32 rounded-full" />
        </div>
        <div className="flex gap-1.5 overflow-hidden">
          {[56, 96, 104, 64, 88, 72, 112, 80].map((w, i) => (
            <div key={i} className="adm-shimmer h-8 shrink-0 rounded-full" style={{ width: w }} />
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="adm-shimmer h-9 w-80 max-w-full rounded-full" />
          <div className="adm-shimmer h-9 w-36 rounded-full" />
          <div className="adm-shimmer h-9 w-28 rounded-full" />
        </div>
        <div className="adm-surface grid overflow-hidden">
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} className="flex h-10 items-center gap-4 border-t border-border/60 px-4 first:border-t-0">
              <div className="adm-shimmer h-3.5 w-24 rounded-md" />
              <div className="adm-shimmer h-3.5 w-32 rounded-md" />
              <div className="adm-shimmer hidden h-3.5 w-48 rounded-md md:block" />
              <div className="adm-shimmer ms-auto h-5 w-20 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </Screen>
  );
}
