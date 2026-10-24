"use client";

import { ChevronsUpDownIcon, LogOutIcon, MonitorIcon, MoonIcon, ShieldAlertIcon, ShieldCheckIcon, SparklesIcon, SunIcon, UserRoundCogIcon } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useMemo, useRef } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import type { MembershipSummary } from "@/lib/auth/landing";
import { logout } from "@/lib/auth/actions";
import { cn } from "@/lib/utils";
import { initials } from "../lib/format";
import { STORE_ROLE_LABELS } from "../lib/store-labels";
import { useStore } from "./store-context";
import { activeNav, storeNav, type ShellNavGroup, type ShellNavItem } from "./store-nav";
import { StoreSwitcher } from "./store-switcher";

export interface ShellUser {
  name: string;
  email: string;
  totpEnabled: boolean;
}

export interface NavCounts {
  newOrders: number;
  syncFailed: number;
}

/** The account's own pages (T2, docs/STORE-SAAS.md §I.1): password, two-step verification, devices. */
export const ACCOUNT_PATH = "/app/account";

export function AppSidebar({
  user,
  counts,
  memberships,
  consoleHref,
}: {
  user: ShellUser;
  counts: NavCounts | null;
  memberships: readonly MembershipSummary[] | null;
  consoleHref: string | null;
}) {
  const pathname = usePathname();
  const store = useStore();
  const { setOpenMobile, isMobile } = useSidebar();
  const groups = useMemo(() => storeNav({ handle: store.handle, mode: store.mode, can: store.can }), [store]);
  const active = activeNav(pathname, groups, store.handle);
  const generate = groups.flatMap((g) => g.items).find((i) => i.id === "generate");
  const closeMobile = () => {
    if (isMobile) setOpenMobile(false);
  };

  const badgeFor = (item: ShellNavItem) => (item.badgeKey && counts ? (counts[item.badgeKey as keyof NavCounts] ?? 0) : 0);

  const renderItems = (list: ShellNavItem[]) =>
    list.map((item) => {
      const isActive = active?.id === item.id;
      const badge = badgeFor(item);
      const Icon = item.icon;
      return (
        <SidebarMenuItem key={item.id}>
          <SidebarMenuButton
            asChild
            isActive={isActive}
            tooltip={item.label}
            className={cn(
              "relative h-9 rounded-[10px] px-2.5 text-[0.86rem] text-sidebar-foreground/75 transition-colors duration-200",
              "hover:bg-sidebar-accent/60 hover:text-sidebar-foreground data-active:bg-transparent data-active:text-sidebar-foreground",
            )}
          >
            <Link href={item.href} onClick={closeMobile} aria-current={isActive ? "page" : undefined}>
              {isActive && (
                <motion.span
                  layoutId="nav-active"
                  aria-hidden="true"
                  className="absolute inset-0 rounded-[10px] bg-background shadow-[0_1px_2px_rgb(0_0_0/0.05),0_6px_16px_-10px_rgb(0_0_0/0.25)] ring-1 ring-sidebar-border dark:bg-sidebar-accent"
                  transition={{ type: "spring", stiffness: 480, damping: 38, mass: 0.7 }}
                />
              )}
              <Icon className={cn("relative z-10 transition-colors", isActive ? "text-brand" : "text-sidebar-foreground/55")} />
              <span className="relative z-10">{item.label}</span>
            </Link>
          </SidebarMenuButton>
          {badge > 0 && (
            <SidebarMenuBadge className="top-2 rounded-full bg-brand/12 px-1.5 text-[0.68rem] font-semibold text-brand tabular-nums peer-hover/menu-button:text-brand">
              {badge > 99 ? "99+" : badge}
            </SidebarMenuBadge>
          )}
        </SidebarMenuItem>
      );
    });

  // the generator has its own button in the header; settings sit at the bottom
  const body: ShellNavGroup[] = groups
    .filter((g) => g.id !== "settings")
    .map((g) => ({ ...g, items: g.items.filter((i) => i.id !== "generate") }))
    .filter((g) => g.items.length > 0);
  const settings = groups.find((g) => g.id === "settings")?.items ?? [];

  return (
    <Sidebar variant="inset" collapsible="icon" className="border-none">
      <SidebarHeader className="gap-3 px-2 pt-3">
        {/* the store switcher slot (§I.4): the store on screen and the member's other stores */}
        <StoreSwitcher memberships={memberships} consoleHref={consoleHref} />
        {generate && (
          <SidebarMenu>
            <SidebarMenuItem>
              {/* quiet on purpose: the jade accent belongs to each screen's own primary action */}
              <SidebarMenuButton
                asChild
                tooltip="Generate a page"
                isActive={active?.id === "generate"}
                className={cn(
                  "group/gen h-10 justify-start gap-2.5 rounded-xl bg-background px-2.5 text-[0.86rem] font-medium text-sidebar-foreground shadow-[0_1px_2px_rgb(20_22_34/0.05)] ring-1 ring-sidebar-border transition-[box-shadow,transform] duration-300",
                  "hover:bg-background hover:text-sidebar-foreground hover:shadow-[0_1px_2px_rgb(20_22_34/0.06),0_8px_20px_-12px_rgb(20_22_34/0.3)] active:scale-[0.985] active:bg-background",
                  "data-active:bg-background data-active:ring-brand/40 dark:bg-sidebar-accent dark:hover:bg-sidebar-accent",
                  "group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:justify-center",
                )}
              >
                <Link href={generate.href} onClick={closeMobile}>
                  <span className="grid size-6 shrink-0 place-items-center rounded-md bg-brand text-brand-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.25)] transition-transform duration-500 ease-[cubic-bezier(.34,1.36,.64,1)] group-hover/gen:rotate-12 group-data-[collapsible=icon]:size-5 [&_svg]:size-3.5!">
                    <SparklesIcon />
                  </span>
                  <span className="flex-1 truncate">Generate a page</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        )}
      </SidebarHeader>

      <SidebarContent className="adm-scroll gap-0 px-1">
        {body.map((g) => (
          <SidebarGroup key={g.id}>
            <SidebarGroupLabel className="h-7 text-[0.75rem] font-medium tracking-[-0.005em] text-sidebar-foreground/65">{g.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">{renderItems(g.items)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            {counts && counts.syncFailed > 0 && (
              <Link
                href={store.href("/orders?sheet=failed")}
                onClick={closeMobile}
                className="mx-1 mb-2 flex items-center gap-2 rounded-xl bg-destructive/8 px-3 py-2.5 text-[0.78rem] leading-snug text-destructive ring-1 ring-destructive/15 transition-colors ring-inset hover:bg-destructive/12 group-data-[collapsible=icon]:hidden"
              >
                <ShieldAlertIcon className="size-4 shrink-0" />
                <span>
                  {counts.syncFailed} order{counts.syncFailed === 1 ? "" : "s"} didn&apos;t reach Google Sheets
                </span>
              </Link>
            )}
            <SidebarMenu className="gap-0.5">{renderItems(settings)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="px-2 pb-3">
        <UserMenu user={user} roleLabel={STORE_ROLE_LABELS[store.role]} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function UserMenu({ user, roleLabel }: { user: ShellUser; roleLabel: string }) {
  const { theme, setTheme } = useTheme();
  const { isMobile } = useSidebar();
  // the sign-out form lives outside the menu: the menu unmounts as soon as an item is chosen
  const signOut = useRef<HTMLFormElement>(null);
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <form ref={signOut} action={logout} className="hidden" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="h-12 rounded-xl px-2 data-open:bg-sidebar-accent hover:bg-sidebar-accent/60"
              aria-label="Account menu"
            >
              <UserAvatar name={user.name} />
              <span className="grid min-w-0 flex-1 text-start leading-tight">
                <span className="truncate text-[0.84rem] font-medium">{user.name}</span>
                <span className="flex items-center gap-1 truncate text-[0.72rem] text-sidebar-foreground/65">
                  {user.totpEnabled ? (
                    <ShieldCheckIcon className="size-3 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <ShieldAlertIcon className="size-3 text-warn-ink" />
                  )}
                  {roleLabel}
                </span>
              </span>
              <ChevronsUpDownIcon className="ms-auto size-4 text-sidebar-foreground/45" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side={isMobile ? "top" : "right"} align="end" sideOffset={10} className="w-64 rounded-xl p-1.5">
            <DropdownMenuLabel className="flex items-center gap-2.5 px-2 py-2 font-normal">
              <UserAvatar name={user.name} />
              <span className="grid min-w-0 leading-tight">
                <span className="truncate text-sm font-medium text-foreground">{user.name}</span>
                <span className="truncate text-xs text-muted-foreground">{user.email}</span>
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <Link href={ACCOUNT_PATH}>
                  {user.totpEnabled ? <ShieldCheckIcon className="text-emerald-600 dark:text-emerald-400" /> : <ShieldAlertIcon className="text-warn-ink" />}
                  <span className="flex-1">Two-step verification</span>
                  <span className={cn("text-xs", user.totpEnabled ? "text-emerald-600 dark:text-emerald-400" : "text-warn-ink")}>
                    {user.totpEnabled ? "On" : "Off"}
                  </span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={ACCOUNT_PATH}>
                  <UserRoundCogIcon />
                  Account & devices
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <SunIcon className="dark:hidden" />
                  <MoonIcon className="hidden dark:block" />
                  Appearance
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="rounded-xl">
                  <DropdownMenuRadioGroup value={theme ?? "system"} onValueChange={setTheme}>
                    <DropdownMenuRadioItem value="light">
                      <SunIcon /> Light
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="dark">
                      <MoonIcon /> Dark
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="system">
                      <MonitorIcon /> System
                    </DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => signOut.current?.requestSubmit()}>
              <LogOutIcon />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

export function UserAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <Avatar className={cn("size-8 rounded-[10px] ring-1 ring-foreground/10", className)}>
      <AvatarFallback className="rounded-[10px] bg-[linear-gradient(135deg,color-mix(in_oklab,var(--brand)_22%,var(--card)),color-mix(in_oklab,var(--chart-3)_26%,var(--card)))] text-[0.72rem] font-semibold text-foreground/80">
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}
