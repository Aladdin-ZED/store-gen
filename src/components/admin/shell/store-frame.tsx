"use client";
/**
 * The chrome of a store's dashboard (docs/STORE-SAAS.md §I.1, §I.4): the inset sidebar with the store switcher, the
 * frosted top bar with ⌘K, around every screen of `/app/<handle>/…`. The full-screen builder, `(editor)`, gets the
 * bare page: one `[store]` layout guards both (and T2's `team/**` screens), so the frame picks by the active child
 * segment, which names route groups too.
 *
 * The chrome follows the viewer's language (the layout's `LocaleRoot`); the screen inside it renders in the
 * language its route supports (`screenLocalesFor`, ./store-nav.ts), else English left to right (§I.5, D36). In RTL the
 * sidebar sits on the inline start, which is the physical right.
 */
import { usePathname, useSelectedLayoutSegments } from "next/navigation";
import type { ReactNode } from "react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import type { SearchHit } from "@/lib/admin-data/search";
import { cn } from "@/lib/utils";
import type { MembershipSummary } from "@/lib/auth/landing";
import { ScreenLocale } from "../common/screen-locale";
import type { ActionResult } from "../lib/action-result";
import { AppSidebar, type NavCounts, type ShellUser } from "./app-sidebar";
import { CommandPaletteProvider } from "./command-palette";
import { useStore } from "./store-context";
import { screenLocalesFor, storeRelativePath } from "./store-nav";
import { Topbar } from "./topbar";

export const EDITOR_SEGMENT = "(editor)";
const ENGLISH = ["en"] as const;

export function StoreFrame({
  user,
  counts,
  memberships,
  consoleHref,
  sidebarOpen,
  search,
  children,
}: {
  user: ShellUser;
  counts: NavCounts | null;
  memberships: readonly MembershipSummary[] | null;
  consoleHref: string | null;
  sidebarOpen: boolean;
  search: (q: string) => Promise<ActionResult<SearchHit[]>>;
  children: ReactNode;
}) {
  const segments = useSelectedLayoutSegments();
  const pathname = usePathname();
  const store = useStore();
  // the builder is English in R1 (design.md); it has no chrome of its own here
  if (segments[0] === EDITOR_SEGMENT) return <ScreenLocale supported={ENGLISH}>{children}</ScreenLocale>;
  const supported = screenLocalesFor(storeRelativePath(pathname, store.href()) ?? "");
  return (
    <CommandPaletteProvider search={search}>
      <SidebarProvider defaultOpen={sidebarOpen} className="bg-sidebar">
        <AppSidebar user={user} counts={counts} memberships={memberships} consoleHref={consoleHref} />
        <SidebarInset
          className={cn(
            "min-w-0 md:peer-data-[variant=inset]:rounded-2xl md:peer-data-[variant=inset]:shadow-[0_0_0_1px_var(--sidebar-border),0_1px_2px_rgb(0_0_0/0.03),0_24px_48px_-32px_rgb(0_0_0/0.18)]",
            // the inset's gap belongs on the side away from the sidebar: ui/sidebar.tsx writes it for a left sidebar
            "rtl:md:peer-data-[variant=inset]:mr-0! rtl:md:peer-data-[variant=inset]:ml-2! rtl:md:peer-data-[variant=inset]:peer-data-[state=collapsed]:mr-2!",
          )}
        >
          <Topbar />
          <div className="flex min-w-0 flex-1 flex-col">
            <ScreenLocale supported={supported}>{children}</ScreenLocale>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </CommandPaletteProvider>
  );
}
