/**
 * The Profit screen's streaming placeholder (core §I.8 rule 1): the header, the tabs and the break-even card, so
 * nothing jumps when the page arrives. Static shapes only: the language is not known yet.
 */
export default function FinanceLoading() {
  return (
    <div aria-busy="true" className="mx-auto grid w-full max-w-[1280px] gap-6 px-4 pt-8 pb-16 sm:px-8 sm:pt-10">
      <span className="sr-only">Loading…</span>
      <div className="grid gap-2">
        <div className="adm-shimmer h-7 w-28 rounded-lg" />
        <div className="adm-shimmer h-4 w-80 max-w-full rounded-full" />
      </div>
      <div className="flex gap-4 border-b border-border pb-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="adm-shimmer h-4 w-20 rounded-full" />
        ))}
      </div>
      <div className="grid gap-4 rounded-[18px] border border-border p-6">
        <div className="adm-shimmer h-5 w-48 rounded-full" />
        <div className="adm-shimmer h-8 w-full max-w-2xl rounded-lg" />
        <div className="adm-shimmer h-4 w-64 rounded-full" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="adm-shimmer h-16 rounded-[14px]" />
          ))}
        </div>
      </div>
    </div>
  );
}
