/**
 * Placeholders of the landing settings screens (landing.md LAN-§7.3, §8.4, §3.3; docs/STORE-SAAS.md §I.8 rule 3): each
 * mirrors its screen's final layout, so nothing moves when the content streams in. It fades in after 200 ms
 * (`@starting-style`), so a fast load never flashes it.
 */
import type { CSSProperties, ReactNode } from "react";

const bar = (w: string, h = "0.75rem"): CSSProperties => ({ width: w, height: h });

function Lines({ rows }: { rows: string[] }) {
  return (
    <div className="grid gap-2">
      {rows.map((w, i) => (
        <div key={i} className="adm-shimmer rounded-full" style={bar(w, i === 0 ? "1rem" : "0.75rem")} />
      ))}
    </div>
  );
}

function Busy({ children }: { children: ReactNode }) {
  return (
    <div aria-busy="true" aria-live="polite" className="grid grid-cols-1 gap-5 transition-opacity delay-200 duration-200 ease-out starting:opacity-0">
      <span className="sr-only">Loading…</span>
      {children}
    </div>
  );
}

/** The delivery editor: switches + live card, then zones (360 px) beside cities, then the calendar. */
export function DeliverySkeleton() {
  return (
    <Busy>
      <div className="adm-surface grid gap-4 p-5 sm:p-6">
        <Lines rows={["14rem", "22rem"]} />
        <div className="adm-shimmer h-20 rounded-2xl" />
      </div>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[22.5rem_minmax(0,1fr)]">
        <div className="adm-surface grid content-start gap-3 p-4">
          <Lines rows={["8rem"]} />
          {[0, 1, 2].map((i) => (
            <div key={i} className="adm-shimmer h-[5.5rem] rounded-xl" style={{ animationDelay: `${i * 80}ms` }} />
          ))}
        </div>
        <div className="adm-surface grid content-start gap-3 p-4">
          <div className="adm-shimmer h-10 rounded-xl" />
          <div className="flex gap-2">
            {["3rem", "6rem", "7rem"].map((w) => (
              <div key={w} className="adm-shimmer h-7 rounded-full" style={{ width: w }} />
            ))}
          </div>
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="adm-shimmer h-11 rounded-lg" style={{ animationDelay: `${i * 50}ms` }} />
          ))}
        </div>
      </div>
      <div className="adm-surface grid gap-4 p-5 sm:p-6">
        <Lines rows={["10rem", "18rem"]} />
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="adm-shimmer h-11 w-14 rounded-xl" />
          ))}
        </div>
      </div>
    </Busy>
  );
}

/** "After the order" and the checkout options: two cards beside a 390 px phone preview. */
export function CheckoutSkeleton() {
  return (
    <Busy>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_24.375rem]">
        <div className="adm-surface grid content-start gap-4 p-5 sm:p-6">
          <Lines rows={["10rem", "20rem"]} />
          {[0, 1, 2].map((i) => (
            <div key={i} className="adm-shimmer h-12 rounded-xl" />
          ))}
          <div className="adm-shimmer h-28 rounded-xl" />
        </div>
        <div className="adm-shimmer hidden h-[32rem] rounded-[2rem] xl:block" />
      </div>
      <div className="adm-surface grid gap-4 p-5 sm:p-6">
        <Lines rows={["9rem", "16rem"]} />
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="adm-shimmer h-12 rounded-xl" />
        ))}
      </div>
    </Busy>
  );
}

/** Policies: one column of question cards. */
export function PoliciesSkeleton() {
  return (
    <Busy>
      {[7, 9, 11, 7, 7, 8, 9].map((rem, i) => (
        <div key={i} className="adm-surface grid gap-4 p-5 sm:p-6">
          <Lines rows={["12rem", "18rem"]} />
          <div className="adm-shimmer rounded-xl" style={{ height: `${rem / 2.5}rem`, animationDelay: `${i * 70}ms` }} />
        </div>
      ))}
    </Busy>
  );
}
