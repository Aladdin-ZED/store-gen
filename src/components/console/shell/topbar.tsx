"use client";
/**
 * The console topbar (platform.md PLA-§4.2, PD25, PD38, PD56; design.md DES-§16.5): the one frosted surface. Start to
 * end: the menu button (below 1024 px), the Platform badge (every console route, 360 px included), the breadcrumb, the
 * address-mode chip, the pulse freshness (a dot with its text, never a bare dot), the ⌘K button, the step-up chip
 * ("Verified · 4:12" while `stepUpUntil` is ahead), the view-as chip ("Viewing @handle · mm:ss" from the pulse), the
 * staff bell with the unread count, and the staff menu (my account, my stores, density, theme, shortcuts, sign out).
 *
 *   <ConsoleTopbar facts={{ address, stepUpUntil, user }} onOpenNav={() => setNavOpen(true)} />
 */
import { BellIcon, ChevronRightIcon, EyeIcon, GlobeIcon, MenuIcon, SearchIcon, ShieldCheckIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import type { ReactNode } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { logout } from "@/lib/auth/actions";
import { useT } from "@/lib/i18n/admin/client";
import { cn } from "@/lib/utils";
import { countdownText, durationText } from "../format";
import { activeConsoleItem } from "../nav";
import { PrefetchLink } from "../prefetch-link";
import { useConsoleShell, useHydrated, useNow } from "./context";
import { useConsolePulse } from "./pulse-provider";
import styles from "./console.module.css";

export interface TopbarFacts {
  /** how stores are addressed right now (core §C.1): path mode on the platform host, or subdomains of `root` */
  address: { mode: "path" } | { mode: "subdomains"; root: string };
  /** step_up_at + 5 min (PLA-§Q.32), ISO; null when the session never stepped up */
  stepUpUntil: string | null;
  user: { name: string; email: string; role: string };
}

const iconButton =
  "relative inline-flex size-8 shrink-0 items-center justify-center rounded-[var(--r-control)] text-muted-foreground outline-none transition-colors duration-[var(--dur-1)] ease-[var(--ease-out)] hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-[var(--ring)] max-md:size-11";

function Chip({ tone, icon, children, title, className }: { tone: "neutral" | "success" | "imp"; icon: ReactNode; children: ReactNode; title?: string; className?: string }) {
  return (
    <span
      title={title}
      suppressHydrationWarning
      className={cn(
        "num inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium whitespace-nowrap",
        tone === "neutral" && "bg-secondary text-muted-foreground",
        tone === "success" && "bg-[var(--c-success-soft)] text-[oklch(0.42_0.09_150)] dark:text-[oklch(0.82_0.1_150)]",
        tone === "imp" && "bg-[var(--c-imp-soft)] text-[var(--c-imp-ink)]",
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

/** "Live" / "Updated 2 min ago" / "Not updating, last update 3 min ago": the dot only carries the live state. */
function PulseFreshness() {
  const t = useT();
  const pulse = useConsolePulse();
  const now = useNow(5_000);
  // until hydrated, the server's view (a fresh pulse): a slow first load must not hydrate "Live" into "Updated 2 min ago"
  const hydrated = useHydrated();
  const { okAt } = pulse;
  const failed = hydrated && pulse.failed;
  const stale = hydrated && pulse.stale;
  const ago = okAt === null ? null : durationText(now - okAt);
  const agoText = ago ? t("console.time.ago", { d: ago }) : t("console.time.now");
  const live = okAt !== null && !failed && !stale;
  const label = okAt === null ? t("console.pulse.waiting") : failed ? t("console.pulse.failed", { ago: agoText }) : stale ? t("console.pulse.updated", { ago: agoText }) : t("console.pulse.live");
  return (
    <span role="status" title={t("console.pulse.hint")} className="inline-flex h-7 shrink-0 items-center gap-1.5 px-1.5 text-[12px] text-muted-foreground">
      <span aria-hidden="true" className={cn("size-1.5 rounded-full transition-colors duration-[var(--dur-2)]", live ? "bg-[oklch(0.62_0.13_160)] shadow-[0_0_0_3px_oklch(0.62_0.13_160/0.18)]" : "bg-[color-mix(in_oklch,var(--foreground)_28%,transparent)]")} />
      <span className="max-sm:sr-only">{label}</span>
    </span>
  );
}

function StepUpChip({ until }: { until: string }) {
  const t = useT();
  const now = useNow(1_000);
  const hydrated = useHydrated();
  const left = Date.parse(until) - now;
  if (!hydrated || !(left > 0)) return null;
  return (
    <Chip tone="success" title={t("console.stepup.hint")} icon={<ShieldCheckIcon aria-hidden="true" className="size-3.5" />} className="max-md:hidden">
      {t("console.stepup.chip", { left: countdownText(left) })}
    </Chip>
  );
}

function ViewAsChip() {
  const t = useT();
  const { pulse } = useConsolePulse();
  const now = useNow(1_000);
  const hydrated = useHydrated();
  const imp = pulse?.impersonation ?? null;
  if (!imp || !hydrated) return null;
  const left = Date.parse(imp.endsAt) - now;
  if (!(left > 0)) return null;
  return (
    <Link href={`/app/${imp.handle}`} title={t("console.impersonation.chip_hint")} className="shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]">
      <Chip tone="imp" icon={<EyeIcon aria-hidden="true" className="size-3.5" />}>
        <bdi dir="ltr" className="max-sm:hidden" suppressHydrationWarning>
          {t("console.impersonation.chip", { handle: imp.handle, left: countdownText(left) })}
        </bdi>
        <span className="sm:hidden" suppressHydrationWarning>
          {countdownText(left)}
        </span>
      </Chip>
    </Link>
  );
}

function Bell() {
  const t = useT();
  const { pulse } = useConsolePulse();
  const unread = pulse?.unread ?? 0;
  return (
    <PrefetchLink href="/admin/notifications" aria-label={unread > 0 ? t("console.bell.unread", { count: unread }) : t("console.bell.label")} className={iconButton}>
      <BellIcon aria-hidden="true" className="size-4" />
      {unread > 0 && (
        <span aria-hidden="true" className="num absolute -top-0.5 -end-0.5 min-w-4 rounded-full bg-brand px-1 text-center text-[10px] leading-4 font-semibold text-brand-foreground ring-2 ring-background max-md:top-1.5 max-md:end-1.5">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </PrefetchLink>
  );
}

function StaffMenu({ user }: { user: TopbarFacts["user"] }) {
  const t = useT();
  const shell = useConsoleShell();
  const { theme, setTheme } = useTheme();
  const initial = Array.from((user.name || user.email).trim())[0]?.toUpperCase() ?? "?";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label={t("console.menu.label")} className={cn(iconButton, "text-foreground")}>
        <span aria-hidden="true" className="inline-flex size-6 items-center justify-center rounded-full bg-[var(--c-ink)] text-[11px] font-semibold text-[var(--c-ink-fg)]">
          {initial}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="grid gap-0.5 font-normal">
          <span className="truncate text-[13px] font-medium">{user.name || user.email}</span>
          <bdi dir="ltr" className="truncate text-[12px] text-muted-foreground">
            {user.email}
          </bdi>
          <span className="text-[11px] text-muted-foreground">{t(`console.role.${user.role}`)}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/app/account">{t("console.menu.account")}</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/app">{t("console.menu.stores")}</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[11px] font-medium text-muted-foreground">{t("console.menu.density")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={shell.density} onValueChange={(v) => shell.setDensity(v === "comfortable" ? "comfortable" : "compact")}>
          <DropdownMenuRadioItem value="compact">{t("console.menu.density.compact")}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="comfortable">{t("console.menu.density.comfortable")}</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[11px] font-medium text-muted-foreground">{t("console.menu.theme")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme ?? "system"} onValueChange={setTheme}>
          <DropdownMenuRadioItem value="system">{t("console.menu.theme.system")}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="light">{t("console.menu.theme.light")}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">{t("console.menu.theme.dark")}</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => shell.openShortcuts()}>{t("console.menu.shortcuts")}</DropdownMenuItem>
        <DropdownMenuSeparator />
        <form action={logout}>
          <DropdownMenuItem asChild>
            <button type="submit" className="w-full">
              {t("console.menu.sign_out")}
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ConsoleTopbar({ facts, onOpenNav }: { facts: TopbarFacts; onOpenNav(): void }) {
  const t = useT();
  const shell = useConsoleShell();
  const pathname = usePathname();
  const here = activeConsoleItem(shell.nav, pathname);
  const address = facts.address.mode === "path" ? { text: t("console.address.path"), hint: t("console.address.path_hint") } : { text: t("console.address.subdomains", { root: facts.address.root }), hint: t("console.address.subdomains_hint", { root: facts.address.root }) };

  return (
    <header className={cn(styles.glass, "sticky top-0 z-40 flex h-14 shrink-0 items-center gap-2 border-b border-[var(--c-hairline)] px-3 md:px-4 lg:px-6")}>
      <button type="button" onClick={onOpenNav} aria-label={t("console.nav.open")} className={cn(iconButton, "lg:hidden")}>
        <MenuIcon aria-hidden="true" className="size-4" />
      </button>

      <span className="inline-flex h-6 shrink-0 items-center rounded-full bg-brand-soft px-2.5 text-[12px] font-semibold text-[var(--c-brand-ink)] ring-1 ring-[color-mix(in_oklch,var(--brand)_45%,transparent)] ring-inset">
        {t("console.badge")}
      </span>

      <nav aria-label={t("console.shell.breadcrumb")} className="min-w-0 max-sm:hidden">
        <ol className="flex min-w-0 items-center gap-1 text-[13px]">
          {here && here.item.id !== "overview" && (
            <>
              <li className="shrink-0 text-muted-foreground max-md:hidden">{t(here.group.label)}</li>
              <li aria-hidden="true" className="shrink-0 text-muted-foreground/60 max-md:hidden">
                <ChevronRightIcon className="size-3.5 rtl:-scale-x-100" />
              </li>
            </>
          )}
          {here && (
            <li className="min-w-0 truncate font-medium" aria-current="page">
              {t(here.item.label)}
            </li>
          )}
        </ol>
      </nav>

      <div className="ms-auto flex min-w-0 items-center gap-1 md:gap-1.5">
        <Chip tone="neutral" title={address.hint} icon={<GlobeIcon aria-hidden="true" className="size-3.5" />} className="max-xl:hidden">
          {address.text}
        </Chip>
        <PulseFreshness />
        <button
          type="button"
          onClick={() => shell.openPalette()}
          aria-label={t("console.cmdk.open")}
          aria-keyshortcuts="Meta+K Control+K"
          className={cn(
            iconButton,
            "md:h-8 md:w-auto md:min-w-52 md:justify-start md:gap-2 md:border md:border-[var(--c-hairline)] md:bg-background/60 md:px-2.5 md:text-[13px]",
          )}
        >
          <SearchIcon aria-hidden="true" className="size-4 shrink-0" />
          <span className="flex-1 truncate text-start max-md:hidden">{t("console.cmdk.open")}</span>
          <kbd aria-hidden="true" className="hidden h-5 items-center rounded-[5px] border border-border px-1.5 font-mono text-[11px] leading-none md:inline-flex">
            ⌘K
          </kbd>
        </button>
        {facts.stepUpUntil && <StepUpChip until={facts.stepUpUntil} />}
        <ViewAsChip />
        <Bell />
        <StaffMenu user={facts.user} />
      </div>
    </header>
  );
}
