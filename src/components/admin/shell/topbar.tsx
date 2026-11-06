"use client";
/**
 * The topbar (P2 SHELL; platform.md PLA-§22.6, §22.8, §20.1, §23.1; docs/STORE-SAAS.md §I.4; design.md DES-§16.5): the
 * one frosted surface of the dashboard (blur, an opaque fallback). The breadcrumb's root is the store's name (ADM-30);
 * then the ⌘K button, the job chip (`pulse.jobs`: "Working in the background", then "Ready · Open" for 60 s), Help,
 * "View store" (the store's public home, for members who read pages) and the bell. Below 768 px it keeps the store
 * switcher, ⌘K and the bell (PLA-§23.1); Help moves to the account menu and ⌘K. It sits under the impersonation
 * ribbon when there is one (`--ribbon-h`).
 */
import { ArrowUpRightIcon, ChevronRightIcon, LifeBuoyIcon, SearchIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAdminLocale, useT } from "@/lib/i18n/admin/client";
import { cn } from "@/lib/utils";
import { JobChip } from "../common/job-chip";
import { FOCUS_RING, TOUCH } from "../common/ui-classes";
import { useCommandPalette, Kbd } from "./command-palette";
import { useHelpSheet } from "./help-sheet";
import { NotificationBell } from "./notification-bell";
import { useStore } from "./store-context";
import { useModKey } from "./shortcut-sheet";
import { activeNav, SETTINGS_ENTRY_ID, sidebarNav, storeNav } from "./store-nav";
import { CompactStoreSwitcher, type SwitcherProps } from "./store-switcher";
import { usePulse } from "./use-pulse";

function Jobs() {
  const t = useT();
  const store = useStore();
  const pulse = usePulse();
  const running = pulse.body?.jobs.running ?? 0;
  const done = pulse.ready.map((j) => {
    const mine = pulse.tracked(j.id);
    return { id: j.id, label: mine?.label ?? t("shell.jobs.background"), href: mine?.href ?? store.href("/notifications") };
  });
  return <JobChip running={running} done={done} onDismiss={pulse.dismissJob} />;
}

export function Topbar({ switcher }: { switcher: SwitcherProps }) {
  const pathname = usePathname();
  const store = useStore();
  const palette = useCommandPalette();
  const help = useHelpSheet();
  const mod = useModKey();
  const t = useT();
  const locale = useAdminLocale();
  const groups = useMemo(() => storeNav({ handle: store.handle, mode: store.mode, can: store.can }, locale), [store, locale]);
  // the breadcrumb: the sidebar's entry, then the settings tab under "Settings"
  const section = activeNav(pathname, sidebarNav(groups, store.handle, locale), store.handle);
  const sub = section?.id === SETTINGS_ENTRY_ID ? activeNav(pathname, groups.filter((g) => g.id === "settings"), store.handle) : undefined;
  const storeUrl = store.can("pages.read") ? store.live("") : null;

  return (
    <div className="adm-glass sticky top-(--ribbon-h) z-30 flex h-14 shrink-0 items-center gap-1.5 rounded-t-[inherit] px-2 shadow-none! ring-0 sm:gap-2 sm:px-4 md:rounded-t-xl">
      <SidebarTrigger aria-label={t("shell.chrome.toggle_sidebar")} className={cn("text-muted-foreground hover:text-foreground rtl:[&_svg]:-scale-x-100 md:-ms-1", TOUCH)} />
      <span aria-hidden="true" className="mx-1 hidden h-4 w-px bg-border md:block" />
      <CompactStoreSwitcher {...switcher} className="md:hidden" />
      <nav aria-label={t("shell.chrome.breadcrumb")} className="hidden min-w-0 items-center gap-1.5 text-sm md:flex">
        <Link href={store.href()} className={cn("max-w-[12rem] truncate rounded-sm text-muted-foreground transition-colors hover:text-foreground", FOCUS_RING)}>
          {store.name}
        </Link>
        {section && (
          <>
            <ChevronRightIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground/60 rtl:rotate-180" />
            {sub ? (
              <Link href={section.href} className={cn("truncate rounded-sm text-muted-foreground transition-colors hover:text-foreground", FOCUS_RING)}>
                {section.label}
              </Link>
            ) : (
              <span aria-current="page" className="truncate font-medium text-foreground">
                {section.label}
              </span>
            )}
          </>
        )}
        {sub && (
          <>
            <ChevronRightIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground/60 rtl:rotate-180" />
            <span aria-current="page" className="truncate font-medium text-foreground">
              {sub.label}
            </span>
          </>
        )}
      </nav>

      <button
        type="button"
        onClick={() => palette.open()}
        className={cn(
          "group ms-auto flex h-9 items-center gap-2 rounded-full text-start text-sm text-muted-foreground transition-colors duration-[var(--dur-2)] hover:text-foreground",
          "max-sm:w-9 max-sm:justify-center max-sm:hover:bg-accent",
          "sm:w-full sm:max-w-[17rem] sm:bg-foreground/[0.04] sm:px-3.5 sm:ring-1 sm:ring-foreground/[0.07] sm:ring-inset sm:hover:bg-foreground/[0.06] md:ms-6",
          FOCUS_RING,
          TOUCH,
        )}
        aria-label={t("shell.chrome.search_label", { shortcut: `${mod}+K` })}
      >
        <SearchIcon aria-hidden="true" className="size-4 shrink-0" />
        <span className="flex-1 truncate max-sm:hidden">{t("shell.chrome.search")}</span>
        <span dir="ltr" className="hidden items-center gap-0.5 sm:flex">
          <Kbd>{mod}</Kbd>
          <Kbd>K</Kbd>
        </span>
      </button>

      <div className="flex shrink-0 items-center gap-0.5 sm:ms-1 sm:gap-1">
        <div className="max-lg:hidden">
          <Jobs />
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full text-muted-foreground hover:text-foreground max-md:hidden" onClick={help.open} aria-label={t("shell.chrome.help")}>
              <LifeBuoyIcon />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("shell.chrome.help")}</TooltipContent>
        </Tooltip>
        {storeUrl && (
          <Button asChild variant="ghost" size="sm" className="hidden rounded-full text-muted-foreground hover:text-foreground lg:inline-flex">
            <a href={storeUrl} target="_blank" rel="noopener noreferrer">
              {t("shell.chrome.view_store")}
              <ArrowUpRightIcon />
            </a>
          </Button>
        )}
        <NotificationBell />
      </div>
    </div>
  );
}

/** The job chip below the topbar on narrower screens (the topbar keeps its room for the switcher, ⌘K and the bell). */
export function NarrowJobs() {
  const pulse = usePulse();
  if ((pulse.body?.jobs.running ?? 0) <= 0 && pulse.ready.length === 0) return null;
  return (
    <div className="px-4 pt-3 sm:px-8 lg:hidden">
      <Jobs />
    </div>
  );
}
