"use client";
/**
 * The console sidebar (platform.md PLA-§4.2, §4.3; design.md DES-§16.11): deep ink in both themes, the five groups of
 * `consoleNavFor` with the pulse badges (Approvals, Notifications, Flags, Health, Break-glass), and the footer with
 * the platform wordmark (`platform.brand.name`, Instrument Sans), the build id (8 characters) and the Node version.
 * The active item carries a 2 px teal indicator at the inline start; links prefetch on hover and focus.
 */
import { usePathname } from "next/navigation";
import { useT } from "@/lib/i18n/admin/client";
import { cn } from "@/lib/utils";
import { BrandMark } from "@/components/admin/shell/brand-mark";
import { compactCount } from "../format";
import { consoleIcon } from "../icons";
import { activeConsoleItem, consoleBadgeCount, type ConsoleNavGroup } from "../nav";
import { PrefetchLink } from "../prefetch-link";
import { useConsolePulse } from "./pulse-provider";
import styles from "./console.module.css";

export interface SidebarFooter {
  brand: string;
  build: string;
  node: string;
}

export function ConsoleSidebar({ nav, footer, onNavigate, className }: { nav: ConsoleNavGroup[]; footer: SidebarFooter; onNavigate?(): void; className?: string }) {
  const t = useT();
  const pathname = usePathname();
  const { pulse } = useConsolePulse();
  const active = activeConsoleItem(nav, pathname);

  return (
    <nav aria-label={t("console.nav.label")} className={cn("flex h-full w-full flex-col bg-[var(--c-ink)] text-[var(--c-ink-fg)]", className)}>
      <div className="flex h-14 shrink-0 items-center gap-2.5 px-4">
        <BrandMark className="size-6" />
        <span className="truncate text-[14px] font-semibold tracking-[-0.011em]">{t("console.nav.label")}</span>
      </div>

      <div className={cn(styles.inkScroll, "min-h-0 flex-1 overflow-y-auto px-2 pb-4")}>
        {nav.map((group) => (
          <div key={group.id} className="pt-4 first:pt-1">
            <h2 className="px-2.5 pb-1.5 text-[11px] font-medium text-[var(--c-ink-faint)]">{t(group.label)}</h2>
            <ul className="grid gap-px">
              {group.items.map((item) => {
                const Icon = consoleIcon(item.icon);
                const isActive = active?.item.id === item.id;
                const count = item.badge ? consoleBadgeCount(item.badge, pulse) : 0;
                const shown = count > 0 ? compactCount(count) : null;
                return (
                  <li key={item.id}>
                    <PrefetchLink
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        "relative flex h-8 items-center gap-2.5 rounded-[var(--r-control)] px-2.5 text-[13px] text-[var(--c-ink-muted)] outline-none transition-colors duration-[var(--dur-1)] ease-[var(--ease-out)] max-lg:h-11",
                        "hover:bg-[var(--c-ink-hover)] hover:text-[var(--c-ink-fg)] focus-visible:ring-2 focus-visible:ring-[var(--c-ink-accent)]",
                        isActive && "bg-[var(--c-ink-active)] font-medium text-[var(--c-ink-fg)] before:absolute before:inset-y-1.5 before:start-0 before:w-0.5 before:rounded-full before:bg-[var(--c-ink-accent)]",
                      )}
                    >
                      <Icon aria-hidden="true" className={cn("size-4 shrink-0", isActive ? "text-[var(--c-ink-accent)]" : "text-[var(--c-ink-faint)]")} />
                      <span className="min-w-0 flex-1 truncate">{t(item.label)}</span>
                      {shown && (
                        <span
                          title={shown.exact}
                          className={cn(
                            "num shrink-0 rounded-full px-1.5 text-[11px] leading-[18px] font-medium",
                            item.badge === "alarms" || item.badge === "kill" ? "bg-[oklch(0.55_0.19_17/0.22)] text-[oklch(0.82_0.1_17)]" : "bg-[oklch(0.76_0.1_205/0.16)] text-[var(--c-ink-accent)]",
                          )}
                        >
                          <span className="sr-only">{t("console.nav.badge", { count })}</span>
                          <span aria-hidden="true">{shown.text}</span>
                        </span>
                      )}
                    </PrefetchLink>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <div className="shrink-0 border-t border-[var(--c-ink-line)] px-4 py-3">
        <p className="truncate text-[13px] font-semibold tracking-[-0.011em] [font-family:var(--font-sans)]">{footer.brand}</p>
        <p className="mt-0.5 flex flex-wrap gap-x-2 font-mono text-[11px] text-[var(--c-ink-faint)]">
          <bdi dir="ltr">{t("console.shell.build", { id: footer.build })}</bdi>
          <bdi dir="ltr">{t("console.shell.node", { version: footer.node })}</bdi>
        </p>
      </div>
    </nav>
  );
}
