"use client";
/**
 * "Older" for a keyset-paged profile list (platform.md PLA-§4.5 "Lists"): the next page's cursor in the URL with every
 * other parameter kept (filters, the view), and "Newest" back to the first page. 44 px targets on a phone.
 *
 *   <OlderLink param="before" next={page.next} />
 */
import { usePathname, useSearchParams } from "next/navigation";
import { useT } from "@/lib/i18n/admin/client";
import { PrefetchLink } from "../prefetch-link";

const link = "inline-flex h-8 items-center rounded-[var(--r-control)] px-2.5 text-[12.5px] font-medium text-[var(--c-brand-ink)] outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-[var(--ring)] max-md:h-11";

export function OlderLink({ param, next }: { param: string; next: string | number | null }) {
  const t = useT();
  const pathname = usePathname();
  const search = useSearchParams();
  const on = search.get(param);
  if (next === null && !on) return null;
  const href = (value: string | null) => {
    const q = new URLSearchParams(search.toString());
    if (value === null) q.delete(param);
    else q.set(param, value);
    return `${pathname}${q.size ? `?${q}` : ""}`;
  };
  return (
    <nav aria-label={t("console.pager.label")} className="flex items-center justify-between gap-2 border-t border-[var(--c-hairline)] px-4 py-2">
      {on ? (
        <PrefetchLink href={href(null)} className={link}>
          {t("console.pager.newest")}
        </PrefetchLink>
      ) : (
        <span />
      )}
      {next !== null && (
        <PrefetchLink href={href(String(next))} className={link}>
          {t("console.pager.older")}
        </PrefetchLink>
      )}
    </nav>
  );
}
