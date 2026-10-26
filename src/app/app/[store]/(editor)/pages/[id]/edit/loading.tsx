/** Builder skeleton while the page loads: same frame as the editor, so nothing jumps. */
export default function Loading() {
  const shimmer =
    "animate-pulse rounded-lg bg-[color-mix(in_oklab,var(--muted)_85%,transparent)] motion-reduce:animate-none";
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background" aria-busy="true" aria-label="Loading the builder">
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border/70 px-3">
        <div className={`${shimmer} size-8`} />
        <div className={`${shimmer} h-5 w-40`} />
        <div className={`${shimmer} h-5 w-24`} />
        <div className="mx-auto hidden gap-1.5 md:flex">
          <div className={`${shimmer} h-8 w-28`} />
          <div className={`${shimmer} h-8 w-16`} />
        </div>
        <div className={`${shimmer} ms-auto h-8 w-28`} />
        <div className="h-8 w-28 rounded-lg bg-[color-mix(in_oklab,var(--brand)_35%,transparent)]" />
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="flex w-14 shrink-0 flex-col items-center gap-2 border-e border-border/70 py-3">
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className={`${shimmer} size-9 rounded-xl`} />
          ))}
        </div>
        <div className="hidden w-[324px] shrink-0 space-y-2 border-e border-border/70 p-4 lg:block">
          <div className={`${shimmer} mb-4 h-5 w-28`} />
          {Array.from({ length: 9 }, (_, i) => (
            <div key={i} className={`${shimmer} h-10 rounded-xl`} />
          ))}
        </div>
        <div className="grid flex-1 place-items-center bg-[color-mix(in_oklab,var(--muted)_60%,var(--background))]">
          <div className="h-[min(78vh,760px)] w-[min(360px,80vw)] rounded-[2.75rem] bg-neutral-900/90 p-3 shadow-2xl">
            <div className={`${shimmer} h-full w-full rounded-[2.1rem]`} />
          </div>
        </div>
      </div>
    </div>
  );
}
