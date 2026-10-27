"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useStore } from "../shell/store-context";
import { settingsNavFor } from "../shell/store-nav";

/** Settings sub-navigation of the store on screen: a vertical list with a gliding highlight (horizontal scroller on phones). */
export function SettingsNav() {
  const pathname = usePathname();
  const store = useStore();
  const items = settingsNavFor(store.can).map((i) => ({ ...i, href: store.href(i.path) }));
  return (
    <nav aria-label="Settings" className="-mx-4 overflow-x-auto px-4 adm-scroll lg:mx-0 lg:overflow-visible lg:px-0">
      <ul className="flex gap-1 lg:sticky lg:top-20 lg:flex-col">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.id} className="shrink-0">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex rounded-xl px-3 py-2 text-sm whitespace-nowrap transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring/60 lg:flex-col lg:gap-0.5 lg:py-2.5 lg:whitespace-normal",
                  active ? "text-foreground" : "text-muted-foreground hover:bg-foreground/[0.035] hover:text-foreground",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="settings-active"
                    aria-hidden="true"
                    className="absolute inset-0 rounded-xl bg-card shadow-[0_1px_2px_rgb(0_0_0/0.05),0_8px_20px_-14px_rgb(0_0_0/0.3)] ring-1 ring-border"
                    // a settle, never a bounce (D60, §I.6): the shell's ease-out curve
                    transition={{ type: "tween", duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
                  />
                )}
                <span className="relative z-10 font-medium">{item.label}</span>
                <span className="relative z-10 hidden text-xs text-muted-foreground lg:block">{item.description}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
