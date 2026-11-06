/**
 * The call-centre settings' streaming placeholder (core §I.8 rule 1): the header, the tabs and the hours table, so
 * nothing jumps when the page arrives. Static shapes only: the language is not known yet.
 */
export default function CallCenterLoading() {
  return (
    <div aria-busy="true" className="mx-auto grid w-full max-w-[1280px] gap-6 px-4 pt-8 pb-16 sm:px-8 sm:pt-10">
      <span className="sr-only">Loading…</span>
      <div className="grid gap-2">
        <div className="adm-shimmer h-7 w-40 rounded-lg" />
        <div className="adm-shimmer h-4 w-96 max-w-full rounded-full" />
      </div>
      <div className="flex gap-4 border-b border-border pb-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="adm-shimmer h-4 w-20 rounded-full" />
        ))}
      </div>
      <div className="grid gap-3 rounded-[18px] border border-border p-5">
        <div className="adm-shimmer h-5 w-36 rounded-full" />
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 py-1.5">
            <div className="adm-shimmer h-4 w-24 rounded-full" />
            <div className="adm-shimmer h-8 w-52 rounded-lg" />
            <div className="adm-shimmer hidden h-8 w-52 rounded-lg sm:block" />
          </div>
        ))}
      </div>
    </div>
  );
}
