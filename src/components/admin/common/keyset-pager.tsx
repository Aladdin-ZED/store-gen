"use client";
/**
 * KeysetPager (P2 SHELL; platform.md PLA-§22.12, §4.5, PD1, PD26): Previous / Next for keyset-paged lists. The cursors
 * are opaque tokens (src/lib/platform/cursor.ts) carried in the URL as `?<param>=<cursor>` with the page's other query
 * parameters kept (filters survive paging), so every page is linkable; plain links with `rel` prev / next, the arrows
 * mirrored in RTL. Nothing renders without a cursor.
 *
 * Props frozen at PLA-§22.12 (src/lib/contracts/r1-p0b-platform.ts).
 */
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ReactElement } from "react";
import { buttonVariants } from "@/components/ui/button";
import { useT } from "@/lib/i18n/admin/client";
import { cn } from "@/lib/utils";
import { pagerHref } from "./primitive-logic";
import { FOCUS_RING, TOUCH } from "./ui-classes";

export interface KeysetPagerProps {
  next: string | null;
  prev: string | null;
  param?: string;
}

export function KeysetPager(p: KeysetPagerProps): ReactElement | null {
  const t = useT();
  const search = useSearchParams();
  if (p.next === null && p.prev === null) return null;
  const param = p.param ?? "cursor";
  const href = (cursor: string) => pagerHref(search?.toString() ?? "", param, cursor);
  const link = cn(buttonVariants({ variant: "outline", size: "lg" }), "gap-1.5", FOCUS_RING, TOUCH);
  const off = cn(link, "pointer-events-none opacity-50");
  return (
    <nav aria-label={t("shell.pager.label")} className="flex items-center justify-end gap-2 pt-1">
      {p.prev !== null ? (
        <Link rel="prev" scroll={false} href={href(p.prev)} className={link}>
          <ChevronLeftIcon aria-hidden="true" className="rtl:rotate-180" />
          {t("shell.pager.prev")}
        </Link>
      ) : (
        <span aria-disabled="true" className={off}>
          <ChevronLeftIcon aria-hidden="true" className="rtl:rotate-180" />
          {t("shell.pager.prev")}
        </span>
      )}
      {p.next !== null ? (
        <Link rel="next" scroll={false} href={href(p.next)} className={link}>
          {t("shell.pager.next")}
          <ChevronRightIcon aria-hidden="true" className="rtl:rotate-180" />
        </Link>
      ) : (
        <span aria-disabled="true" className={off}>
          {t("shell.pager.next")}
          <ChevronRightIcon aria-hidden="true" className="rtl:rotate-180" />
        </span>
      )}
    </nav>
  );
}
