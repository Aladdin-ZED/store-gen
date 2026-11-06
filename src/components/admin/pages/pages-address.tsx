"use client";
/**
 * The address line of the pages list header (core §I.4 "Live address card", UX-05; PLA-§22.10.2). The card itself is
 * P2's `AddressCard` (src/components/admin/common/address-card.tsx on P2's branch, props `{ store, live, pageId,
 * slots, compact }`); P2 merges with p3-w1-verify, which swaps this local stand-in for
 * `<AddressCard compact store={…} live={live} pageId={homeId} slots={{}} />` (the test-order and campaign slots stay
 * empty until wave 2). Until then: the store's canonical link, Copy and Open, and whether a page answers there.
 */
import { ArrowUpRightIcon, GlobeIcon } from "lucide-react";
import { useT } from "@/lib/i18n/admin/client";
import { cn } from "@/lib/utils";
import { CopyButton } from "../common/copy-button";
import { useStore } from "../shell/store-context";

export function PagesAddress({ live, className }: { live: boolean; className?: string }) {
  const t = useT();
  const store = useStore();
  const url = store.live("");
  const shown = url.replace(/^https?:\/\//, "");
  return (
    <div className={cn("adm-surface flex min-w-0 items-center gap-3 px-3.5 py-2.5", className)}>
      <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", live ? "bg-green-500/10 text-green-700 dark:text-green-300" : "bg-foreground/[0.05] text-muted-foreground")}>
        <GlobeIcon aria-hidden="true" className="size-4" />
      </span>
      <div className="grid min-w-0 flex-1 gap-0.5">
        <span className="text-[0.6875rem] font-medium text-muted-foreground">{live ? t("landing.pages.address") : t("landing.pages.address.none")}</span>
        <bdi dir="ltr" className="truncate font-mono text-[0.8125rem] font-medium" title={url}>
          {shown}
        </bdi>
      </div>
      <CopyButton value={url} label={t("landing.pages.address.copy")} toastMessage={t("landing.pages.toast.copied")} size="icon-sm" className="text-muted-foreground" />
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t("landing.pages.address.open")}
        title={t("landing.pages.address.open")}
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-foreground/[0.05] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <ArrowUpRightIcon className="size-4 rtl:-scale-x-100" />
      </a>
    </div>
  );
}
