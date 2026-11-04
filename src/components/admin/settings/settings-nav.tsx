"use client";
/**
 * The settings frame of the store on screen (P2 SHELL; docs/STORE-SAAS.md §I.3; platform.md PLA-§22.10; design.md
 * DES-§16.8 "Tabs / segmented"): the heading and the sub-navigation. The tabs are the registry's `settings` group
 * (`settingsTabs`, ../shell/store-nav.ts): what P2, P3, P5 and P7 contribute, in their order, filtered by the member's
 * grants and the store's mode, so a track adds a tab without touching this file. A tab's description is its label key
 * with `_lead` when a catalog has it.
 *
 * Desktop: a sticky vertical list (icon, label, one muted line), the active tab on `--accent` with a 2 px inline-start
 * indicator that slides on `--ease-out`. Below 1024 px: one row of tabs that scrolls sideways, the 2 px indicator
 * under the active one. Both render in the screen's language (inside `ScreenLocale`).
 */
import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { useAdminLocale, useT } from "@/lib/i18n/admin/client";
import { cn } from "@/lib/utils";
import { PageHeader } from "../common/page-header";
import { FOCUS_RING } from "../common/ui-classes";
import { useStore } from "../shell/store-context";
import { activeNav, settingsTabs } from "../shell/store-nav";

// a settle, never a bounce (D60, §I.6): the shell's ease-out curve, `--dur-2`
const SLIDE = { type: "tween", duration: 0.18, ease: [0.2, 0.8, 0.2, 1] } as const;

/** The settings heading in the screen's language. */
export function SettingsHeader() {
  const t = useT();
  return <PageHeader title={t("shell.settings.title")} description={t("shell.settings.lead")} className="mb-6 lg:mb-8" />;
}

/** The sub-navigation: the member's settings tabs. */
export function SettingsNav() {
  const t = useT();
  const pathname = usePathname();
  const store = useStore();
  const locale = useAdminLocale();
  const tabs = useMemo(() => settingsTabs({ handle: store.handle, mode: store.mode, can: store.can }, locale), [store, locale]);
  const activeId = useMemo(() => {
    const groups = [{ id: "settings" as const, label: "", items: tabs.map((tab) => ({ ...tab, group: "settings" as const, labelKey: tab.id })) }];
    return activeNav(pathname, groups, store.handle)?.id ?? null;
  }, [pathname, tabs, store.handle]);

  return (
    <nav aria-label={t("shell.settings.nav_label")} className="min-w-0">
      {/* below 1024 px: one scrolling row of tabs */}
      <ul className="adm-scroll -mx-4 flex gap-1 overflow-x-auto border-b border-border px-4 sm:-mx-8 sm:px-8 lg:hidden">
        {tabs.map((tab) => {
          const active = tab.id === activeId;
          return (
            <li key={tab.id} className="shrink-0">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-11 items-center px-2.5 text-[13.5px] whitespace-nowrap transition-colors duration-[var(--dur-2)]",
                  active ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
                  FOCUS_RING,
                )}
              >
                {tab.label}
                {active && <motion.span layoutId="settings-tab-row" aria-hidden="true" transition={SLIDE} className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand" />}
              </Link>
            </li>
          );
        })}
      </ul>

      {/* desktop: the sticky list */}
      <ul className="sticky top-20 hidden gap-0.5 lg:grid">
        {tabs.map((tab) => {
          const active = tab.id === activeId;
          const Icon = tab.icon;
          return (
            <li key={tab.id}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group/tab relative grid grid-cols-[1rem_minmax(0,1fr)] items-start gap-x-3 rounded-[var(--r-control)] px-3 py-2 transition-colors duration-[var(--dur-2)]",
                  active ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                  FOCUS_RING,
                )}
              >
                {active && <motion.span layoutId="settings-tab-list" aria-hidden="true" transition={SLIDE} className="absolute inset-y-2 start-0 w-0.5 rounded-full bg-brand" />}
                <Icon aria-hidden="true" className={cn("mt-0.5 size-4", active ? "text-brand" : "text-muted-foreground group-hover/tab:text-foreground")} />
                <span className="grid min-w-0 gap-0.5">
                  <span className={cn("truncate text-[13.5px]", active && "font-medium")}>{tab.label}</span>
                  {tab.description && <span className="line-clamp-2 text-[12px] leading-snug text-muted-foreground">{tab.description}</span>}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
