"use client";

import {
  ChevronsUpDownIcon,
  DownloadIcon,
  LifeBuoyIcon,
  LogOutIcon,
  MonitorIcon,
  MoonIcon,
  Rows3Icon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  SparklesIcon,
  SunIcon,
  UserRoundCogIcon,
} from "lucide-react";
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
import { ACCOUNT_PATH } from "@/lib/auth/paths";
import { logout } from "@/lib/auth/actions";
import { useAdminLocale, useT } from "@/lib/i18n/admin/client";
import { cn } from "@/lib/utils";
import { initials } from "../lib/format";
import { signOutCleanup } from "./client-state";
import { DENSITIES, useDensity } from "./density";
import { useHelpSheet } from "./help-sheet";
import { IosInstallSheet, useInstallHint } from "./install-hint";
import { useStore } from "./store-context";
import { activeNav, storeNav, type ShellNavGroup, type ShellNavItem } from "./store-nav";
import { StoreSwitcher, type SwitcherProps } from "./store-switcher";
import { usePulse } from "./use-pulse";

export interface ShellUser {
  name: string;
  email: string;
  totpEnabled: boolean;
}

/**
 * The sidebar (P2 SHELL; platform.md PLA-§22.3, §22.6, §23.1; docs/STORE-SAAS.md §I.4; design.md DES-§16.6): the store
 * switcher in the header, the registry's nav with the active pill sliding on `--ease-out` (a tween, never a spring),
 * the badges from the pulse's counts (a key that is absent shows no badge, never a 0 made up for it), settings at the
 * bottom and the account menu. Below 768 px it is a sheet (ui/sidebar.tsx). In Arabic it sits on the inline start,
 * the physical right.
 */
export function AppSidebar({ user, switcher, className }: { user: ShellUser; switcher: SwitcherProps; className?: string }) {
  const pathname = usePathname();
  const store = useStore();
  const { setOpenMobile, isMobile } = useSidebar();
  const t = useT();
  const locale = useAdminLocale();
  const counts = usePulse().body?.counts ?? null;
  const groups = useMemo(() => storeNav({ handle: store.handle, mode: store.mode, can: store.can }, locale), [store, locale]);
  const active = activeNav(pathname, groups, store.handle);
  const generate = groups.flatMap((g) => g.items).find((i) => i.id === "generate");
  const closeMobile = () => {
    if (isMobile) setOpenMobile(false);
  };

  const badgeFor = (item: ShellNavItem) => (item.badgeKey && counts ? (counts[item.badgeKey] ?? 0) : 0);
  const syncFailed = counts?.syncFailed ?? 0;

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
                  // a settle, never a bounce (D60, §I.6): the shell's ease-out curve
                  transition={{ type: "tween", duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
                />
              )}
              <Icon className={cn("relative z-10 transition-colors", isActive ? "text-brand" : "text-sidebar-foreground/55")} />
              <span className="relative z-10">{item.label}</span>
            </Link>
          </SidebarMenuButton>
          {badge > 0 && (
            <SidebarMenuBadge className="top-2 rounded-full rtl:right-auto rtl:left-1 bg-brand/12 px-1.5 text-[0.68rem] font-semibold text-brand tabular-nums peer-hover/menu-button:text-brand">
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
    // the inline-start side: the physical right in Arabic (ui/sidebar.tsx positions with physical sides)
    <Sidebar variant="inset" collapsible="icon" side={locale === "ar" ? "right" : "left"} className={cn("border-none", className)}>
      <SidebarHeader className="gap-3 px-2 pt-3">
        {/* the store switcher slot (§I.4): the store on screen and the member's other stores */}
        <StoreSwitcher {...switcher} />
        {generate && (
          <SidebarMenu>
            <SidebarMenuItem>
              {/* quiet on purpose: the jade accent belongs to each screen's own primary action */}
              <SidebarMenuButton
                asChild
                tooltip={t("shell.chrome.generate")}
                isActive={active?.id === "generate"}
                className={cn(
                  "group/gen h-10 justify-start gap-2.5 rounded-xl bg-background px-2.5 text-[0.86rem] font-medium text-sidebar-foreground shadow-[0_1px_2px_rgb(20_22_34/0.05)] ring-1 ring-sidebar-border transition-[box-shadow,transform] duration-300",
                  "hover:bg-background hover:text-sidebar-foreground hover:shadow-[0_1px_2px_rgb(20_22_34/0.06),0_8px_20px_-12px_rgb(20_22_34/0.3)] active:scale-[0.985] active:bg-background",
                  "data-active:bg-background data-active:ring-brand/40 dark:bg-sidebar-accent dark:hover:bg-sidebar-accent",
                  "group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:justify-center",
                )}
              >
                <Link href={generate.href} onClick={closeMobile}>
                  <span className="grid size-6 shrink-0 place-items-center rounded-md bg-brand text-brand-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.25)] transition-transform duration-200 ease-[cubic-bezier(.2,.8,.2,1)] group-hover/gen:scale-[1.06] group-data-[collapsible=icon]:size-5 [&_svg]:size-3.5!">
                    <SparklesIcon />
                  </span>
                  <span className="flex-1 truncate">{t("shell.chrome.generate")}</span>
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
            {syncFailed > 0 && (
              <Link
                href={store.href("/orders?sheet=failed")}
                onClick={closeMobile}
                className="mx-1 mb-2 flex items-center gap-2 rounded-xl bg-destructive/8 px-3 py-2.5 text-[0.78rem] leading-snug text-destructive ring-1 ring-destructive/15 transition-colors ring-inset hover:bg-destructive/12 group-data-[collapsible=icon]:hidden"
              >
                <ShieldAlertIcon className="size-4 shrink-0" />
                <span>{t("shell.chrome.sync_failed", { count: syncFailed })}</span>
              </Link>
            )}
            <SidebarMenu className="gap-0.5">{renderItems(settings)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="px-2 pb-3">
        <UserMenu user={user} roleLabel={t(`team.role.${store.role}`)} onNavigate={closeMobile} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function UserMenu({ user, roleLabel, onNavigate }: { user: ShellUser; roleLabel: string; onNavigate(): void }) {
  const { theme, setTheme } = useTheme();
  const { isMobile } = useSidebar();
  const t = useT();
  const store = useStore();
  const help = useHelpSheet();
  const { density, setDensity } = useDensity();
  const install = useInstallHint();
  const rtl = useAdminLocale() === "ar";
  // the sign-out form lives outside the menu: the menu unmounts as soon as an item is chosen
  const signOut = useRef<HTMLFormElement>(null);
  const shield = user.totpEnabled ? "text-success-ink" : "text-warn-ink";
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        {/* signing out also forgets this browser's state of the store and its dashboard drafts (§B.4, §E.6) */}
        <form ref={signOut} action={logout} onSubmit={() => signOutCleanup(store.id, store.viewerId)} className="hidden" />
        <IosInstallSheet open={install.iosOpen} onOpenChange={install.setIosOpen} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="h-12 rounded-xl px-2 data-open:bg-sidebar-accent hover:bg-sidebar-accent/60"
              aria-label={t("shell.chrome.account_menu")}
            >
              <UserAvatar name={user.name} />
              <span className="grid min-w-0 flex-1 text-start leading-tight">
                <span className="truncate text-[0.84rem] font-medium">{user.name}</span>
                <span className="flex items-center gap-1 truncate text-[0.72rem] text-sidebar-foreground/65">
                  {user.totpEnabled ? <ShieldCheckIcon className={cn("size-3", shield)} /> : <ShieldAlertIcon className={cn("size-3", shield)} />}
                  {roleLabel}
                </span>
              </span>
              <ChevronsUpDownIcon className="ms-auto size-4 text-sidebar-foreground/45" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side={isMobile ? "top" : rtl ? "left" : "right"} align="end" sideOffset={10} className="w-64 rounded-xl p-1.5">
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
                <Link href={ACCOUNT_PATH} onClick={onNavigate}>
                  {user.totpEnabled ? <ShieldCheckIcon className={shield} /> : <ShieldAlertIcon className={shield} />}
                  <span className="flex-1">{t("shell.chrome.two_factor")}</span>
                  <span className={cn("text-xs", shield)}>{t(user.totpEnabled ? "shell.chrome.on" : "shell.chrome.off")}</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={ACCOUNT_PATH} onClick={onNavigate}>
                  <UserRoundCogIcon />
                  {t("shell.chrome.account")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <SunIcon className="dark:hidden" />
                  <MoonIcon className="hidden dark:block" />
                  {t("shell.chrome.appearance")}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="rounded-xl">
                  <DropdownMenuRadioGroup value={theme ?? "system"} onValueChange={setTheme}>
                    <DropdownMenuRadioItem value="light">
                      <SunIcon /> {t("shell.chrome.light")}
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="dark">
                      <MoonIcon /> {t("shell.chrome.dark")}
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="system">
                      <MonitorIcon /> {t("shell.chrome.system")}
                    </DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Rows3Icon />
                  {t("shell.density.label")}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="rounded-xl">
                  <DropdownMenuRadioGroup value={density} onValueChange={(v) => setDensity(v === "compact" ? "compact" : "comfortable")}>
                    {DENSITIES.map((d) => (
                      <DropdownMenuRadioItem key={d} value={d}>
                        {t(`shell.density.${d}`)}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuItem
                onSelect={() => {
                  onNavigate();
                  help.open();
                }}
              >
                <LifeBuoyIcon />
                {t("shell.chrome.help")}
              </DropdownMenuItem>
              {install.offer && (
                <DropdownMenuItem onSelect={install.install}>
                  <DownloadIcon />
                  {t("shell.install.cta")}
                </DropdownMenuItem>
              )}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => signOut.current?.requestSubmit()}>
              <LogOutIcon />
              {t("shell.chrome.sign_out")}
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
