"use client";

import { ArrowUpRightIcon, ChevronRightIcon, MoonIcon, SearchIcon, SunIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useMemo, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useCommandPalette, Kbd } from "./command-palette";
import { useStore } from "./store-context";
import { activeNav, SETTINGS_NAV, storeNav } from "./store-nav";

const noop = () => () => {};
/** "⌘" on Apple platforms, "Ctrl" elsewhere (server snapshot: "Ctrl"). */
function useModKey(): string {
  return useSyncExternalStore(
    noop,
    () => (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? "⌘" : "Ctrl"),
    () => "Ctrl",
  );
}

/**
 * Sticky frosted top bar: sidebar toggle, breadcrumb (rooted at the store's name, ADM-30), ⌘K search, theme, and
 * "View store" (the store's public home, `storeUrl()`, for members who can read pages).
 */
export function Topbar() {
  const pathname = usePathname();
  const store = useStore();
  const palette = useCommandPalette();
  const { resolvedTheme, setTheme } = useTheme();
  const mod = useModKey();
  const groups = useMemo(() => storeNav({ handle: store.handle, mode: store.mode, can: store.can }), [store]);
  const section = activeNav(pathname, groups, store.handle);
  const sub = section?.id === "settings" ? SETTINGS_NAV.find((s) => pathname.startsWith(store.href(s.path))) : undefined;
  const storeUrl = store.can("pages.read") ? store.live("") : null;

  return (
    <div className="adm-glass sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 rounded-t-[inherit] px-3 shadow-none! ring-0 sm:px-4 md:rounded-t-xl">
      <SidebarTrigger className="-ms-1 text-muted-foreground hover:text-foreground" />
      <span aria-hidden="true" className="mx-1 h-4 w-px bg-border" />
      <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1.5 text-sm sm:flex">
        <Link href={store.href()} className="max-w-[12rem] truncate text-muted-foreground transition-colors hover:text-foreground">
          {store.name}
        </Link>
        {section && (
          <>
            <ChevronRightIcon className="size-3.5 text-muted-foreground/60" />
            {sub ? (
              <Link href={section.href} className="text-muted-foreground transition-colors hover:text-foreground">
                {section.label}
              </Link>
            ) : (
              <span className="font-medium text-foreground">{section.label}</span>
            )}
          </>
        )}
        {sub && (
          <>
            <ChevronRightIcon className="size-3.5 text-muted-foreground/60" />
            <span className="truncate font-medium text-foreground">{sub.label}</span>
          </>
        )}
      </nav>

      <button
        type="button"
        onClick={palette.open}
        className="group ms-auto flex h-9 w-full max-w-[17rem] items-center gap-2 rounded-full bg-foreground/[0.04] px-3.5 text-start text-sm text-muted-foreground ring-1 ring-foreground/[0.07] transition-all duration-300 ring-inset outline-none hover:bg-foreground/[0.06] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 sm:ms-6"
        aria-label={`Search (${mod}+K)`}
      >
        <SearchIcon className="size-4 shrink-0 transition-transform duration-300 group-hover:scale-110" />
        <span className="flex-1 truncate">Search or jump to…</span>
        <span className="hidden items-center gap-0.5 sm:flex">
          <Kbd>{mod}</Kbd>
          <Kbd>K</Kbd>
        </span>
      </button>

      <div className="flex items-center gap-1 sm:ms-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full text-muted-foreground hover:text-foreground"
              onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
              aria-label="Toggle dark mode"
            >
              <SunIcon className="scale-100 rotate-0 transition-transform duration-500 dark:scale-0 dark:-rotate-90" />
              <MoonIcon className="absolute scale-0 rotate-90 transition-transform duration-500 dark:scale-100 dark:rotate-0" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Light / dark</TooltipContent>
        </Tooltip>
        {storeUrl && (
          <Button asChild variant="ghost" size="sm" className="hidden rounded-full text-muted-foreground hover:text-foreground md:inline-flex">
            <a href={storeUrl} target="_blank" rel="noopener noreferrer">
              View store
              <ArrowUpRightIcon />
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}
