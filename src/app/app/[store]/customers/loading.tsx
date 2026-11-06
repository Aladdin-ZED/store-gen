/**
 * The customers screens' streaming placeholder (OPE-§9.2, core §I.8 rule 1): the header, the controls and the rows of
 * the list, so nothing jumps when the page arrives. Static shapes only: the language is not known yet.
 */
export default function CustomersLoading() {
  return (
    <div aria-busy="true" className="mx-auto grid w-full max-w-[1280px] gap-6 px-4 pt-8 pb-16 sm:px-8 sm:pt-10">
      <span className="sr-only">Loading…</span>
      <div className="grid gap-2">
        <div className="adm-shimmer h-7 w-44 rounded-lg" />
        <div className="adm-shimmer h-4 w-80 max-w-full rounded-full" />
      </div>
      <div className="flex gap-3 border-b border-border pb-2.5">
        <div className="adm-shimmer h-4 w-20 rounded-full" />
        <div className="adm-shimmer h-4 w-16 rounded-full" />
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
        <div className="adm-shimmer h-9 w-full rounded-lg sm:w-72" />
        <div className="flex gap-1.5">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="adm-shimmer h-8 w-24 rounded-full" />
          ))}
        </div>
      </div>
      <div className="overflow-hidden rounded-[18px] border border-border">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-border/70 px-4 py-3.5 last:border-0">
            <div className="adm-shimmer h-3 w-36 rounded-full" />
            <div className="adm-shimmer hidden h-3 w-28 rounded-full md:block" />
            <div className="adm-shimmer hidden h-3 w-20 rounded-full md:block" />
            <div className="ms-auto adm-shimmer h-3 w-12 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
