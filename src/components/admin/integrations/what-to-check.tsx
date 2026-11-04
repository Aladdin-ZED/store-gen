"use client";
/**
 * What to check (OPE-§28.1, §28.3 (2)): for each failing kind, its three most likely causes in the owner's words, what
 * to do, and the screen that does it (src/lib/integrations/causes.ts `whatToCheck`; the cause the last error names
 * comes first). Without a failing kind, one quiet line.
 */
import { ArrowUpRightIcon, CheckIcon } from "lucide-react";
import Link from "next/link";
import type { HubCheck } from "@/lib/integrations/hub.server";
import { useT } from "@/lib/i18n/admin/client";
import { useStore } from "../shell/store-context";
import { kindKey } from "./hub-format";

export function WhatToCheck({ checks, canOpen }: { checks: HubCheck[]; canOpen: boolean }) {
  const t = useT();
  const store = useStore();
  return (
    <section aria-labelledby="int-check-title" className="adm-surface grid content-start gap-4 p-4 sm:p-6">
      <h2 id="int-check-title" className="text-[0.95rem] font-semibold tracking-[-0.01em]">
        {t("int.health.whatToCheck")}
      </h2>
      {checks.length === 0 ? (
        <p className="flex items-start gap-2 text-sm text-pretty text-muted-foreground">
          <CheckIcon className="mt-0.5 size-4 shrink-0 text-success-ink" aria-hidden="true" />
          {t("int.check.allGood")}
        </p>
      ) : (
        checks.map((c) => (
          <div key={c.kind} className="grid gap-2.5">
            <div className="grid gap-0.5">
              <h3 className="text-sm font-semibold text-destructive">{t("int.check.kindFailing", { kind: t(kindKey(c.kind)) })}</h3>
              <p className="text-xs text-muted-foreground">{t("int.check.lead")}</p>
            </div>
            <ol className="grid gap-2">
              {c.items.map((item, i) => (
                <li key={item.code} className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-2 rounded-xl bg-foreground/[0.03] p-3">
                  <span aria-hidden="true" className="flex size-6 items-center justify-center rounded-full bg-foreground/[0.06] text-[0.7rem] font-semibold tabular-nums">
                    {i + 1}
                  </span>
                  <div className="grid min-w-0 gap-1">
                    <p className="text-sm font-medium text-pretty">{t(item.text)}</p>
                    <p className="text-xs leading-relaxed text-pretty text-muted-foreground">{t(item.hint)}</p>
                    {canOpen && (
                      <Link href={store.href(item.path)} className="-ms-1 inline-flex min-h-11 w-fit items-center gap-1 rounded-md px-1 text-xs font-medium text-foreground/80 hover:text-foreground hover:underline sm:min-h-7">
                        {t(item.link)}
                        <ArrowUpRightIcon className="size-3.5 rtl:-scale-x-100" aria-hidden="true" />
                      </Link>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        ))
      )}
    </section>
  );
}
