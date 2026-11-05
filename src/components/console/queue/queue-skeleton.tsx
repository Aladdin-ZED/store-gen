/**
 * The approval queue while its list streams in (platform.md PLA-§4.5 "States", §4.7 rule 1): the header's frame and
 * row bones that mirror the final two-line rows (ring, name, the facts line, the waiting time); the detail column's
 * bones from 1280 px. Shown after 150 ms by the console's skeleton class, never a spinner.
 */
import { t as message } from "@/lib/i18n/admin";
import type { QueueTab } from "@/lib/platform/queue-rules";
import { cn } from "@/lib/utils";
import { CONSOLE_LOCALE } from "../locale";
import styles from "../shell/console.module.css";
import { TAB_ORDER } from "./queue-nav";

function Rows({ n }: { n: number }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="flex min-h-[calc(var(--row)+14px)] items-center gap-2.5 border-b border-[var(--c-hairline)] ps-7 pe-3 py-1.5">
          <div className={cn(styles.bone, "size-6 shrink-0 rounded-full")} />
          <div className="grid flex-1 gap-1.5">
            <div className={cn(styles.bone, "h-3")} style={{ width: `${38 + ((i * 17) % 28)}%` }} />
            <div className={cn(styles.bone, "h-2.5")} style={{ width: `${56 - ((i * 11) % 20)}%` }} />
          </div>
          <div className={cn(styles.bone, "h-3 w-10 shrink-0")} />
        </div>
      ))}
    </>
  );
}

export function QueueSkeleton({ tab }: { tab: QueueTab }) {
  return (
    <div aria-busy="true" aria-label={message("console.queue.loading", undefined, CONSOLE_LOCALE)} className="-mx-4 -mt-5 -mb-16 flex flex-col md:-mx-6 lg:-mx-8 lg:-mt-7 xl:h-[calc(100dvh-3.5rem)]">
      <div className="grid gap-3 border-b border-[var(--c-hairline)] px-4 pt-4 md:px-6 xl:pt-5">
        <div className="grid gap-1.5">
          <span className="text-[20px] leading-tight font-semibold tracking-[-0.014em]">{message("console.queue.page_title", undefined, CONSOLE_LOCALE)}</span>
          <div className={cn(styles.skeleton, "flex gap-4")}>
            <div className={cn(styles.bone, "h-3 w-40")} />
            <div className={cn(styles.bone, "h-3 w-32")} />
          </div>
        </div>
        <div className="flex gap-0.5 overflow-hidden">
          {TAB_ORDER.map((id) => (
            <span key={id} className={cn("inline-flex h-9 shrink-0 items-center px-2.5 text-[13px]", id === tab ? "font-medium" : "text-muted-foreground")}>
              {message(`console.queue.tab.${id}`, undefined, CONSOLE_LOCALE)}
            </span>
          ))}
        </div>
      </div>
      <div className={cn(styles.skeleton, "min-h-0 flex-1 xl:grid xl:grid-cols-[44%_1fr]")}>
        <div className="min-w-0">
          <Rows n={10} />
        </div>
        <div className="hidden border-s border-[var(--c-hairline)] bg-card p-5 xl:grid xl:content-start xl:gap-3">
          <div className={cn(styles.bone, "h-5 w-1/2")} />
          <div className={cn(styles.bone, "h-3 w-1/3")} />
          <div className={cn(styles.bone, "mt-4 size-14 rounded-full")} />
          <div className={cn(styles.bone, "h-3 w-2/3")} />
          <div className={cn(styles.bone, "h-3 w-1/2")} />
        </div>
      </div>
    </div>
  );
}
