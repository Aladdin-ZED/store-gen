"use client";
/**
 * `/app/<h>/finance` (P4 CALL CENTER; operations.md OPE-§16.2, SF-04, OD25): the tab bar (Break-even, Costs, Ad spend),
 * one link per tab so each loads only its own data on the server, then the tab itself.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { useT } from "@/lib/i18n/admin/client";
import { cn } from "@/lib/utils";

export const FIN_TABS = ["breakeven", "costs", "ads"] as const;
export type FinTab = (typeof FIN_TABS)[number];

export function FinanceTabs({ tab, hrefs, readOnly, children }: { tab: FinTab; hrefs: Record<FinTab, string>; readOnly: boolean; children: ReactNode }) {
  const t = useT();
  return (
    <div className="grid gap-5">
      {readOnly && <p className="q-sm rounded-[12px] border border-border bg-muted/40 px-3.5 py-2.5 text-muted-foreground">{t("fin.readOnly")}</p>}
      <nav aria-label={t("fin.title")} className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex min-w-max gap-1 border-b border-border">
          {FIN_TABS.map((id) => (
            <li key={id}>
              <Link
                href={hrefs[id]}
                aria-current={tab === id ? "page" : undefined}
                scroll={false}
                className={cn(
                  "q-sm relative -mb-px inline-flex h-10 items-center px-3 font-medium transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                  tab === id ? "text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t(`fin.tab.${id}`)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {children}
    </div>
  );
}

/** The screen while the `finance_lite` flag is off for the store. */
export function FinanceOff() {
  const t = useT();
  return <p className="q-sm rounded-[18px] border border-dashed border-border px-5 py-8 text-center text-muted-foreground">{t("fin.error.feature_off")}</p>;
}
