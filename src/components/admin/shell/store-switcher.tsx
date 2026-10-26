"use client";
/**
 * The store switcher (docs/STORE-SAAS.md §I.4, §B.4; ADM-29): the slot that replaced the sidebar's brand block. The
 * trigger shows the store on screen (tile, name, mode, state pill); the menu lists the member's other stores
 * (`listMemberships`, T2), "Create a store" and, for platform staff, the console. Switching is a plain navigation
 * to `/app/<handle>`: the URL is the store context (D1), and the target re-checks the membership.
 */
import { ArrowUpRightIcon, CheckIcon, ChevronsUpDownIcon, PlusIcon, ShieldIcon } from "lucide-react";
import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";
import type { MembershipSummary } from "@/lib/auth/landing";
import { appHref } from "@/lib/urls";
import { cn } from "@/lib/utils";
import { TONE_CLASSES } from "../common/status-chip";
import { STORE_MODE_LABELS, STORE_ROLE_LABELS, STORE_STATUS, storeInitials } from "../lib/store-labels";
import { useStore } from "./store-context";

/** Where a new store starts (T2's onboarding skeleton, §I.1). */
const NEW_STORE_PATH = "/app/new";

export function StoreTile({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-[10px] text-[0.72rem] font-semibold tracking-[-0.01em] text-brand-foreground",
        "bg-[linear-gradient(160deg,color-mix(in_oklab,var(--brand)_82%,white),var(--brand)_60%)]",
        "shadow-[inset_0_1px_0_rgb(255_255_255/0.32),inset_0_-1px_0_rgb(0_0_0/0.12),0_0_0_1px_color-mix(in_oklab,var(--brand)_75%,black_18%)]",
        className,
      )}
    >
      {storeInitials(name)}
    </span>
  );
}

export function StoreSwitcher({ memberships, consoleHref }: { memberships: readonly MembershipSummary[] | null; consoleHref: string | null }) {
  const store = useStore();
  const { isMobile, setOpenMobile } = useSidebar();
  const state = STORE_STATUS[store.status];
  const others = (memberships ?? []).filter((m) => m.storeId !== store.id && m.status === "active");
  const close = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="h-12 gap-2.5 rounded-xl px-1.5 data-open:bg-sidebar-accent hover:bg-sidebar-accent/60"
              aria-label={`Store: ${store.name}. Switch store`}
            >
              <StoreTile name={store.name} />
              <span className="grid min-w-0 flex-1 gap-0.5 text-start leading-tight">
                <span className="truncate text-[0.88rem] font-semibold tracking-[-0.015em]">{store.name}</span>
                <span className="flex min-w-0 items-center gap-1.5 text-[0.72rem] text-sidebar-foreground/65">
                  <span className="truncate">{STORE_MODE_LABELS[store.mode]}</span>
                  {state && (
                    <span className={cn("inline-flex h-4 shrink-0 items-center rounded-full px-1.5 text-[0.64rem] font-medium ring-1 ring-inset", TONE_CLASSES[state.tone].chip)}>
                      {state.label}
                    </span>
                  )}
                </span>
              </span>
              <ChevronsUpDownIcon className="ms-auto size-4 text-sidebar-foreground/45" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side={isMobile ? "bottom" : "right"} align="start" sideOffset={10} className="w-72 rounded-xl p-1.5">
            <DropdownMenuLabel className="px-2 pt-1.5 pb-1 text-[0.72rem] font-medium text-muted-foreground">Your stores</DropdownMenuLabel>
            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <Link href={store.href()} onClick={close} className="gap-2.5">
                  <StoreTile name={store.name} className="size-7 rounded-lg text-[0.66rem]" />
                  <span className="grid min-w-0 flex-1 leading-tight">
                    <span className="truncate text-sm font-medium">{store.name}</span>
                    <span className="truncate text-xs text-muted-foreground">{STORE_ROLE_LABELS[store.role]}</span>
                  </span>
                  <CheckIcon className="size-4 text-brand" />
                </Link>
              </DropdownMenuItem>
              {others.map((m) => {
                const pill = STORE_STATUS[m.storeStatus];
                return (
                  <DropdownMenuItem key={m.storeId} asChild>
                    <Link href={appHref(m.handle)} onClick={close} className="gap-2.5">
                      <StoreTile name={m.name} className="size-7 rounded-lg text-[0.66rem] opacity-90" />
                      <span className="grid min-w-0 flex-1 leading-tight">
                        <span className="truncate text-sm">{m.name}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {STORE_ROLE_LABELS[m.role]}
                          {pill ? ` · ${pill.label}` : ""}
                        </span>
                      </span>
                    </Link>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href={NEW_STORE_PATH} onClick={close}>
                <PlusIcon />
                Create a store
              </Link>
            </DropdownMenuItem>
            {consoleHref && (
              <DropdownMenuItem asChild>
                <a href={consoleHref}>
                  <ShieldIcon />
                  <span className="flex-1">Platform console</span>
                  <ArrowUpRightIcon className="size-3.5 text-muted-foreground" />
                </a>
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
