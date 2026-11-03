"use client";
/**
 * TodayBrief (P2 SHELL; platform.md PLA-§22.12, §22.17, PD62; docs/STORE-SAAS.md §I.6): the dashboard's one to three
 * template lines ("3 orders to confirm", …) under the "Today" heading, numbers in tabular numerals, each optionally a
 * link to where it is handled; never model text (PD62). A line whose source is unavailable is left out by its caller,
 * never written as a made-up 0 (build note item 14). At most 3 lines render.
 *
 * A client component: it translates the lines in the viewer's admin locale (`useT`). Props frozen at PLA-§22.12
 * (src/lib/contracts/r1-p0b-platform.ts). Nothing renders without lines.
 */
import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import type { ReactElement } from "react";
import { useT } from "@/lib/i18n/admin/client";
import type { MessageKey } from "@/lib/tenancy/types";
import { cn } from "@/lib/utils";
import { FOCUS_RING, TOUCH } from "./ui-classes";

export interface TodayBriefProps {
  lines: { key: MessageKey; vars: Record<string, string | number>; href?: string }[];
}

const MAX_LINES = 3;

export function TodayBrief(p: TodayBriefProps): ReactElement | null {
  const t = useT();
  const lines = p.lines.slice(0, MAX_LINES);
  if (!lines.length) return null;
  return (
    <section aria-label={t("brief.title")} className="grid gap-2">
      <h2 className="text-[11px] font-medium text-muted-foreground">{t("brief.title")}</h2>
      <ul className="grid gap-0.5">
        {lines.map((line, i) => {
          const text = t(line.key, line.vars);
          return (
            <li key={`${line.key}:${i}`} className="adm-rise" style={{ ["--i" as string]: i }}>
              {line.href ? (
                <Link
                  href={line.href}
                  className={cn(
                    "group -mx-2 flex min-h-9 items-center justify-between gap-3 rounded-[var(--r-control)] px-2 py-1.5 text-[15px] leading-snug text-foreground tabular-nums transition-colors duration-[var(--dur-1)] hover:bg-muted",
                    FOCUS_RING,
                    TOUCH,
                  )}
                >
                  <span className="min-w-0 text-pretty">{text}</span>
                  <ChevronRightIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground transition-transform duration-[var(--dur-1)] group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" />
                </Link>
              ) : (
                <p className="py-1.5 text-[15px] leading-snug text-pretty text-foreground tabular-nums">{text}</p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
