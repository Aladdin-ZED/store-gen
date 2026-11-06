/**
 * The queue's streaming placeholder (OPE-§13.1, core §I.8 rule 1): the console's own frame (the top bar, a card, the
 * thumb zone), so nothing jumps when the first state arrives. Static shapes only: the language is not known yet.
 */
export default function QueueLoading() {
  return (
    <div aria-busy="true" className="flex h-[calc(100dvh-3.5rem)] flex-col md:h-auto md:min-h-[calc(100dvh-3.5rem)]">
      <span className="sr-only">Loading…</span>
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3 lg:hidden">
        <div className="adm-shimmer h-9 w-44 rounded-full" />
        <div className="ms-auto adm-shimmer size-9 rounded-full" />
        <div className="adm-shimmer size-9 rounded-full" />
      </div>
      <div className="mx-auto grid min-h-0 w-full max-w-[1480px] flex-1 md:grid-cols-[minmax(0,1fr)_300px] md:gap-6 md:p-6 lg:grid-cols-[260px_minmax(0,1fr)_320px]">
        <div className="hidden flex-col gap-4 lg:flex">
          <div className="adm-shimmer h-10 rounded-full" />
          <div className="grid grid-cols-3 gap-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="adm-shimmer h-16 rounded-xl" />
            ))}
          </div>
          <div className="adm-shimmer h-28 rounded-xl" />
        </div>
        <div className="flex min-h-0 flex-col">
          <div className="grid flex-1 content-start gap-4 p-4 md:rounded-[22px] md:border md:border-border md:p-6">
            <div className="adm-shimmer h-3 w-40 rounded-full" />
            <div className="adm-shimmer h-5 w-3/4 rounded-full" />
            <div className="adm-shimmer h-8 w-36 rounded-lg" />
            <div className="adm-shimmer h-4 w-4/5 rounded-full" />
            <div className="adm-shimmer h-4 w-3/5 rounded-full" />
          </div>
          <div className="grid gap-2 border-t border-border p-4 md:border-0 md:px-0">
            <div className="grid grid-cols-2 gap-2">
              <div className="adm-shimmer h-12 rounded-xl" />
              <div className="adm-shimmer h-12 rounded-xl" />
            </div>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="adm-shimmer h-14 rounded-[14px]" />
              ))}
            </div>
          </div>
        </div>
        <div className="hidden flex-col gap-3 md:flex">
          <div className="adm-shimmer h-24 rounded-xl" />
          <div className="adm-shimmer h-40 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
