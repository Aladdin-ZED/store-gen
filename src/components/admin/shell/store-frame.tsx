"use client";
/**
 * The chrome of a store's dashboard (docs/STORE-SAAS.md §I.1, §I.4): the inset sidebar with the store switcher, the
 * frosted top bar with ⌘K, around every screen of `/app/<handle>/…`. The full-screen builder, `(editor)`, gets the
 * bare page: one `[store]` layout guards both (and T2's `team/**` screens), so the frame picks by the active child
 * segment, which names route groups too.
 */
import { useSelectedLayoutSegments } from "next/navigation";
import type { ReactNode } from "react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import type { SearchHit } from "@/lib/admin-data/search";
import type { MembershipSummary } from "@/lib/auth/landing";
import type { ActionResult } from "../lib/action-result";
import { AppSidebar, type NavCounts, type ShellUser } from "./app-sidebar";
import { CommandPaletteProvider } from "./command-palette";
import { Topbar } from "./topbar";

export const EDITOR_SEGMENT = "(editor)";

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
  if (segments[0] === EDITOR_SEGMENT) return <>{children}</>;
  return (
    <CommandPaletteProvider search={search}>
      <SidebarProvider defaultOpen={sidebarOpen} className="bg-sidebar">
        <AppSidebar user={user} counts={counts} memberships={memberships} consoleHref={consoleHref} />
        <SidebarInset className="min-w-0 md:peer-data-[variant=inset]:rounded-2xl md:peer-data-[variant=inset]:shadow-[0_0_0_1px_var(--sidebar-border),0_1px_2px_rgb(0_0_0/0.03),0_24px_48px_-32px_rgb(0_0_0/0.18)]">
          <Topbar />
          <div className="flex min-w-0 flex-1 flex-col">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </CommandPaletteProvider>
  );
}
