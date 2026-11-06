"use client";
/**
 * The topbar's bell and its panel (P2 SHELL; platform.md PLA-§22.6, §18.1; docs/STORE-SAAS.md §I.4; PL-13): the
 * unread count from the pulse ("9+" above nine), a 380 px popover on a wide screen and a full-height sheet below
 * 768 px. Rows come from `bellNotificationsAction` (the reader's newest 20, this store and their own), grouped by day
 * in the store's time zone: the group's icon, the title, a one-line body, the relative time, and a 3 px bar at the
 * inline start while unread (functional, not decoration). A click marks the row read and opens its link; "Mark all
 * read"; "All notifications" opens the centre. The panel re-reads when the pulse's unread count moves while it is open.
 */
import { BellIcon, BotIcon, CheckCheckIcon, HeartPulseIcon, PlugIcon, ReceiptTextIcon, ShieldCheckIcon, SparklesIcon, StoreIcon, UsersRoundIcon, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { bellNotificationsAction, markNotificationsReadAction } from "@/app/app/[store]/notifications/actions";
import { useIsMobile } from "@/hooks/use-mobile";
import { dirOf, type AdminLocale } from "@/lib/i18n/admin";
import { useAdminLocale, useT } from "@/lib/i18n/admin/client";
import type { NotificationItem } from "@/lib/platform/notify";
import { cn } from "@/lib/utils";
import { formatDay } from "../common/primitive-logic";
import { SheetCloseX } from "../common/sheet-close";
import { FOCUS_RING, NUM, TOUCH } from "../common/ui-classes";
import { bellCount, groupByDay, notificationHref } from "./pulse-state";
import { useStore } from "./store-context";
import { usePulse } from "./use-pulse";

const GROUP_ICON: Record<string, LucideIcon> = {
  orders: ReceiptTextIcon,
  team: UsersRoundIcon,
  store: StoreIcon,
  integrations: PlugIcon,
  security: ShieldCheckIcon,
  platform: SparklesIcon,
  ai: BotIcon,
  health: HeartPulseIcon,
};

/** "3 min ago", "yesterday" … in the viewer's locale (Western digits in Arabic). */
function relative(iso: string, now: number, locale: AdminLocale): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  const s = Math.max(0, Math.round((now - ms) / 1000));
  const rtf = new Intl.RelativeTimeFormat(locale === "ar" ? "ar-MA-u-nu-latn" : locale, { numeric: "auto", style: "short" });
  if (s < 60) return rtf.format(0, "second");
  if (s < 3600) return rtf.format(-Math.floor(s / 60), "minute");
  if (s < 86_400) return rtf.format(-Math.floor(s / 3600), "hour");
  return rtf.format(-Math.floor(s / 86_400), "day");
}

type Load = { state: "loading" | "ready" | "error"; items: NotificationItem[]; at: number };

function BellPanel({ onNavigate }: { onNavigate(): void }) {
  const t = useT();
  const locale = useAdminLocale();
  const store = useStore();
  const router = useRouter();
  const pulse = usePulse();
  const [load, setLoad] = useState<Load>({ state: "loading", items: [], at: 0 });
  const seq = useRef(0);

  const fetchRows = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const res = await bellNotificationsAction();
      if (mine !== seq.current) return;
      const at = Date.now();
      setLoad(res.ok ? { state: "ready", items: res.data, at } : (l) => ({ ...l, state: "error", at }));
    } catch {
      if (mine === seq.current) setLoad((l) => ({ ...l, state: "error", at: Date.now() }));
    }
  }, []);

  // first open, and again when the pulse says the unread count moved
  const unread = pulse.body?.unread ?? 0;
  useEffect(() => {
    const timer = setTimeout(() => void fetchRows(), 0);
    return () => clearTimeout(timer);
  }, [fetchRows, unread]);

  const markRead = (ids: number[] | "all") => {
    setLoad((l) => ({ ...l, items: l.items.map((n) => (ids === "all" || ids.includes(n.id) ? { ...n, read: true } : n)) }));
    void markNotificationsReadAction(ids).catch(() => undefined);
  };

  const open = (n: NotificationItem) => {
    if (!n.read) markRead([n.id]);
    const href = notificationHref(n.link);
    onNavigate();
    if (href) router.push(href);
  };

  // the times read against the moment the rows arrived (a render stays pure)
  const now = load.at;
  const groups = groupByDay(load.items, now, store.timeZone);
  const anyUnread = load.items.some((n) => !n.read);
  const dayLabel = (day: string) => (day === "today" ? t("shell.notifications.today") : day === "yesterday" ? t("shell.notifications.yesterday") : formatDay(`${day}T12:00:00Z`, locale));

  return (
    <div className="flex max-h-[inherit] min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold tracking-[-0.006em]">{t("shell.notifications.title")}</h2>
        <Button type="button" variant="ghost" size="sm" disabled={!anyUnread} onClick={() => markRead("all")} className={cn("h-8 gap-1.5 text-xs text-muted-foreground", TOUCH)}>
          <CheckCheckIcon aria-hidden="true" className="size-3.5" />
          {t("shell.notifications.mark_all")}
        </Button>
      </div>
      <div className="adm-scroll min-h-0 flex-1 overflow-y-auto" aria-busy={load.state === "loading" || undefined}>
        {load.state === "loading" && load.items.length === 0 ? (
          <ul aria-hidden="true" className="grid gap-px p-2">
            {[0, 1, 2, 3].map((i) => (
              <li key={i} className="flex gap-3 rounded-[var(--r-control)] px-3 py-2.5">
                <span className="size-7 shrink-0 rounded-[var(--r-chip)] bg-muted" />
                <span className="grid flex-1 gap-1.5 pt-0.5">
                  <span className="h-3 w-2/3 rounded bg-muted" />
                  <span className="h-2.5 w-11/12 rounded bg-muted/70" />
                </span>
              </li>
            ))}
          </ul>
        ) : load.state === "error" && load.items.length === 0 ? (
          <div role="alert" className="grid justify-items-start gap-3 px-4 py-6 text-sm text-muted-foreground">
            <p>{t("shell.notifications.load_failed")}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => void fetchRows()} className={TOUCH}>
              {t("shell.err.retry")}
            </Button>
          </div>
        ) : groups.length === 0 ? (
          <div className="grid justify-items-center gap-3 px-6 py-10 text-center">
            <span aria-hidden="true" className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground">
              <BellIcon className="size-4.5" />
            </span>
            <p className="max-w-64 text-[13px] leading-relaxed text-pretty text-muted-foreground">{t("shell.notifications.empty")}</p>
          </div>
        ) : (
          groups.map((g) => (
            <section key={g.day} aria-label={dayLabel(g.day)} className="pb-1">
              <h3 className="sticky top-0 z-10 bg-popover/95 px-4 pt-3 pb-1 text-[11px] font-medium text-muted-foreground">{dayLabel(g.day)}</h3>
              <ul className="grid gap-px px-2">
                {g.items.map((n) => {
                  const Icon = GROUP_ICON[n.group] ?? BellIcon;
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => open(n)}
                        className={cn(
                          "relative flex w-full items-start gap-3 rounded-[var(--r-control)] px-3 py-2.5 text-start transition-colors duration-[var(--dur-1)] hover:bg-accent",
                          FOCUS_RING,
                        )}
                      >
                        {!n.read && <span aria-hidden="true" className="absolute inset-y-2 start-0 w-[3px] rounded-full bg-brand" />}
                        <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-[var(--r-chip)] bg-muted text-muted-foreground">
                          <Icon className="size-3.5" />
                        </span>
                        <span className="grid min-w-0 flex-1 gap-0.5">
                          <span className={cn("truncate text-[13px] leading-snug", n.read ? "text-foreground/80" : "font-medium text-foreground")}>{n.title}</span>
                          {n.body && <span className="truncate text-xs text-muted-foreground">{n.body}</span>}
                        </span>
                        <time dateTime={n.createdAt} className={cn("shrink-0 pt-0.5 text-[11px] text-muted-foreground", NUM)}>
                          {relative(n.createdAt, now, locale)}
                        </time>
                        {!n.read && <span className="sr-only">{t("shell.notifications.unread")}</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </div>
      <div className="border-t border-border p-2">
        <Link
          href={store.href("/notifications")}
          onClick={onNavigate}
          className={cn("flex h-9 items-center justify-center rounded-[var(--r-control)] text-[13px] font-medium text-foreground/80 hover:bg-accent hover:text-foreground", FOCUS_RING, TOUCH)}
        >
          {t("shell.notifications.all")}
        </Link>
      </div>
    </div>
  );
}

function BellButton({ count, label, ...props }: { count: string | null; label: string } & ComponentProps<"button">): ReactNode {
  return (
    <Button type="button" variant="ghost" size="icon" aria-label={label} className={cn("relative rounded-full text-muted-foreground hover:text-foreground", TOUCH)} {...props}>
      <BellIcon />
      {count && (
        <span aria-hidden="true" className={cn("absolute -top-0.5 -end-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-semibold leading-none text-brand-foreground ring-2 ring-background", NUM)}>
          {count}
        </span>
      )}
    </Button>
  );
}

export function NotificationBell() {
  const t = useT();
  const locale = useAdminLocale();
  const mobile = useIsMobile();
  const pulse = usePulse();
  const [open, setOpen] = useState(false);
  const unread = pulse.body?.unread ?? 0;
  const count = bellCount(unread);
  const label = t("shell.notifications.bell", { count: unread });

  if (mobile) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <BellButton count={count} label={label} onClick={() => setOpen(true)} />
        <SheetContent side={dirOf(locale) === "rtl" ? "left" : "right"} dir={dirOf(locale)} lang={locale} showCloseButton={false} className="w-full gap-0 p-0 sm:max-w-full">
          <SheetHeader className="sr-only">
            <SheetTitle>{t("shell.notifications.title")}</SheetTitle>
            <SheetDescription>{label}</SheetDescription>
          </SheetHeader>
          <SheetCloseX />
          {open && <BellPanel onNavigate={() => setOpen(false)} />}
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <BellButton count={count} label={label} />
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="flex max-h-[min(34rem,calc(100svh-6rem))] w-[380px] flex-col overflow-hidden rounded-[var(--r-sheet)] p-0">
        {open && <BellPanel onNavigate={() => setOpen(false)} />}
      </PopoverContent>
    </Popover>
  );
}
