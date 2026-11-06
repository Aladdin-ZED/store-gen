"use client";
/**
 * The store switcher (P2 SHELL; platform.md PLA-§22.3, TN-07; docs/STORE-SAAS.md §I.4, §B.4; ADM-29): the slot that
 * replaced the sidebar's brand block, and the topbar's compact copy below 768 px. The trigger shows the store on screen
 * (`Monogram`, name, `ModeBadge`, `StatusPill`); the popover lists the member's stores with their role and state, a
 * search field above five stores, "Create a store" (hidden at the day's limit, `p:store:create`, with
 * `shell.picker.create_limit`) and, for staff, the console entries (`staffNavFor`, PD36; "Platform console" until P1's
 * file names them).
 *
 * Choosing a store clears this store's client state (`clearStoreClientState`: drafts, pollers, AI jobs), remembers the
 * choice as the session's picker hint (`setLastStoreAction`, never an authorisation) and navigates to `/app/<h>` (an
 * agent's queue): the URL is the store context (D1) and the target re-checks the membership.
 */
import { ArrowUpRightIcon, CheckIcon, ChevronsUpDownIcon, PlusIcon, ShieldIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { Suspense, use, useState } from "react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";
import { setLastStoreAction } from "@/app/app/actions";
import type { PlatformRole, StoreRole } from "@/lib/auth/permissions";
import { useAdminLocale, useT } from "@/lib/i18n/admin/client";
import type { StoreMode } from "@/lib/tenancy/mode";
import type { StoreStatus } from "@/lib/tenancy/types";
import { cn } from "@/lib/utils";
import { ModeBadge } from "../common/mode-badge";
import { Monogram } from "../common/monogram";
import { StatusPill } from "../common/status-pill";
import { FOCUS_RING, TOUCH } from "../common/ui-classes";
import { clearStoreClientState } from "./client-state";
import { staffNavFor } from "./nav";
import { useStore } from "./store-context";

/** Where a new store starts (T2's onboarding skeleton, §I.1). */
const NEW_STORE_PATH = "/app/new";
/** The search field shows above this many stores (PLA-§22.3). */
export const SWITCHER_SEARCH_FROM = 6;

/** One of the member's stores, as the layout hands it over (`listMemberships` + usable + the landing path). */
export interface SwitcherStore {
  storeId: string;
  handle: string;
  name: string;
  role: StoreRole;
  status: "active" | "suspended";
  storeStatus: StoreStatus;
  mode: StoreMode;
  usable: boolean;
  /** `/app/<h>`, or the queue for an agent (`storeHomePath`) */
  href: string;
}

export interface SwitcherProps {
  /** null while the memberships could not be read: the store on screen only */
  stores: readonly SwitcherStore[] | null;
  platformRole: PlatformRole | "none";
  /** the console's home, for staff (the fallback entry while P1's staff nav is empty) */
  consoleHref: string | null;
  /** may this user create another store today (`p:store:create`, 3 a day)? streamed after the first paint */
  canCreate: Promise<boolean>;
}

function CreateItem({ canCreate, onPick }: { canCreate: Promise<boolean>; onPick(): void }) {
  const t = useT();
  if (!use(canCreate)) {
    return <p className="px-2 py-1.5 text-xs leading-relaxed text-muted-foreground">{t("shell.picker.create_limit")}</p>;
  }
  return (
    <CommandItem value="__create" onSelect={onPick} className="gap-2">
      <PlusIcon aria-hidden="true" />
      {t("shell.switcher.create")}
    </CommandItem>
  );
}

function SwitcherList({ p, close }: { p: SwitcherProps; close(): void }) {
  const t = useT();
  const store = useStore();
  const router = useRouter();
  const all = p.stores ?? [];
  const others = all.filter((m) => m.storeId !== store.id);
  const staff = staffNavFor(p.platformRole);

  const go = (href: string, next?: SwitcherStore) => {
    close();
    if (next) {
      clearStoreClientState(store.id, store.viewerId);
      void setLastStoreAction(next.storeId).catch(() => undefined);
    }
    router.push(href);
  };

  return (
    <Command loop className="rounded-[inherit]">
      {all.length >= SWITCHER_SEARCH_FROM && <CommandInput placeholder={t("shell.switcher.search")} aria-label={t("shell.switcher.search")} />}
      <CommandList className="max-h-[min(24rem,60svh)]">
        <CommandEmpty>{t("shell.switcher.no_match")}</CommandEmpty>
        <CommandGroup heading={t("shell.switcher.your_stores")}>
          <CommandItem value={`${store.name} ${store.handle}`} onSelect={() => go(store.href())} className="gap-2.5">
            <Monogram name={store.name} seed={store.id} size={24} />
            <span className="grid min-w-0 flex-1 leading-tight">
              <span className="truncate text-sm font-medium">{store.name}</span>
              <span className="truncate text-xs text-muted-foreground">{t(`team.role.${store.role}`)}</span>
            </span>
            <CheckIcon aria-label={t("shell.switcher.current")} className="size-4 text-brand" />
          </CommandItem>
          {others.map((m) => (
            <CommandItem key={m.storeId} value={`${m.name} ${m.handle}`} disabled={!m.usable} onSelect={() => go(m.href, m)} className="gap-2.5">
              <Monogram name={m.name} seed={m.storeId} size={24} />
              <span className="grid min-w-0 flex-1 leading-tight">
                <span className="truncate text-sm">{m.name}</span>
                <span className="truncate text-xs text-muted-foreground">{m.status === "suspended" ? t("shell.cmdk.member_paused") : t(`team.role.${m.role}`)}</span>
              </span>
              {m.storeStatus !== "active" && <StatusPill status={m.storeStatus} size="sm" />}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup>
          <Suspense fallback={null}>
            <CreateItem canCreate={p.canCreate} onPick={() => go(NEW_STORE_PATH)} />
          </Suspense>
          {staff.map((s) => (
            <CommandItem key={s.id} value={`__staff ${s.id}`} onSelect={() => go(s.href())} className="gap-2">
              <ShieldIcon aria-hidden="true" />
              <span className="flex-1">{t(s.label)}</span>
              <ArrowUpRightIcon aria-hidden="true" className="size-3.5 text-muted-foreground" />
            </CommandItem>
          ))}
          {staff.length === 0 && p.consoleHref && (
            <CommandItem value="__console" onSelect={() => go(p.consoleHref!)} className="gap-2">
              <ShieldIcon aria-hidden="true" />
              <span className="flex-1">{t("shell.switcher.console")}</span>
              <ArrowUpRightIcon aria-hidden="true" className="size-3.5 text-muted-foreground" />
            </CommandItem>
          )}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}

/** The sidebar's switcher (the header slot). */
export function StoreSwitcher(p: SwitcherProps) {
  const store = useStore();
  const { isMobile, setOpenMobile } = useSidebar();
  const t = useT();
  const rtl = useAdminLocale() === "ar";
  const [open, setOpen] = useState(false);
  const close = () => {
    setOpen(false);
    if (isMobile) setOpenMobile(false);
  };
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="h-12 gap-2.5 rounded-xl px-1.5 data-[state=open]:bg-sidebar-accent hover:bg-sidebar-accent/60"
              aria-label={t("shell.switcher.label", { store: store.name })}
            >
              <Monogram name={store.name} seed={store.id} size={32} />
              <span className="grid min-w-0 flex-1 gap-1 text-start leading-tight">
                <span className="truncate text-[0.88rem] font-semibold tracking-[-0.015em]">{store.name}</span>
                <span className="flex min-w-0 items-center gap-1.5">
                  <ModeBadge mode={store.mode} />
                  {store.status !== "active" && <StatusPill status={store.status} size="sm" />}
                </span>
              </span>
              <ChevronsUpDownIcon className="ms-auto size-4 text-sidebar-foreground/45" />
            </SidebarMenuButton>
          </PopoverTrigger>
          <PopoverContent side={isMobile ? "bottom" : rtl ? "left" : "right"} align="start" sideOffset={10} className="w-72 rounded-[var(--r-sheet)] p-0">
            {open && <SwitcherList p={p} close={close} />}
          </PopoverContent>
        </Popover>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

/** The topbar's copy below 768 px (PLA-§23.1: the topbar keeps the switcher, the bell and ⌘K at 360 px). */
export function CompactStoreSwitcher(p: SwitcherProps & { className?: string }) {
  const store = useStore();
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={t("shell.switcher.label", { store: store.name })}
        className={cn("flex h-9 min-w-0 items-center gap-2 rounded-[var(--r-control)] px-1.5 hover:bg-accent", FOCUS_RING, TOUCH, p.className)}
      >
        <Monogram name={store.name} seed={store.id} size={24} />
        <span className="max-w-[9rem] truncate text-sm font-semibold tracking-[-0.01em]">{store.name}</span>
        <ChevronsUpDownIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={8} className="w-[min(18rem,calc(100vw-2rem))] rounded-[var(--r-sheet)] p-0">
        {open && <SwitcherList p={p} close={() => setOpen(false)} />}
      </PopoverContent>
    </Popover>
  );
}
