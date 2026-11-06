/**
 * The Console → AI frame (P7 AI; ai.md AI-§K.2): the page heading and the eight tabs as links (keyboard-reachable,
 * `aria-current` on the open one, a 2 px brand underline, horizontally scrollable at 390 px). It renders inside P1's
 * console layout (`src/app/admin/(console)/layout.tsx`), which owns the shell and the console nav item.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { CONSOLE_TABS, tabHref, type ConsoleTab } from "@/lib/ai/platform/console-view";
import { cn } from "@/lib/utils";
import { c } from "./ui";

export function AiConsoleFrame({ tab, title, lead, actions, children }: { tab: ConsoleTab | null; title?: string; lead?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div data-surface="console" className="mx-auto w-full max-w-[1240px] px-4 pb-16 pt-6 md:px-8 md:pt-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold tracking-[-0.015em]">{title ?? c("ai.console.title")}</h1>
          <p className="mt-1 max-w-[70ch] text-sm text-muted-foreground">{lead ?? c("ai.console.lead")}</p>
        </div>
        {actions}
      </header>
      <nav aria-label={c("ai.console.tabs")} className="-mx-4 mt-5 overflow-x-auto border-b px-4 [scrollbar-width:none] md:mx-0 md:px-0">
        <ul className="flex min-w-max gap-1">
          {CONSOLE_TABS.map((id) => {
            const on = id === tab;
            return (
              <li key={id}>
                <Link
                  href={tabHref(id)}
                  aria-current={on ? "page" : undefined}
                  className={cn(
                    "relative inline-flex h-10 items-center rounded-t-md px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                    on ? "font-medium text-foreground after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-brand" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {c(`ai.console.tab.${id}`)}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="mt-6">{children}</div>
    </div>
  );
}
