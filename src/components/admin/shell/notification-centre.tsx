"use client";
/**
 * The notification centre (P2 SHELL; platform.md PLA-§22.6, §18.1; PL-13 tenant side), `/app/<h>/notifications`:
 * filters by group (All · Orders · Team · Store · Plan · Integrations · Security · Platform) as links, the reader's
 * rows grouped by day in the store's time zone, 50 per page with Previous / Next (`KeysetPager`, `?before=`), and on a
 * phone the first 25 with "Show older" for the rest. A row is two lines (title, then body and time), with a 3 px bar
 * at the inline start while unread; a click marks it read and opens its link when the link matches the PLA-§18.1
 * rule, else the link stays plain text. "Mark all read". The quiet empty state. Rows carry ids, counts and short
 * labels only, never customer data (§18.1).
 */
import { BellIcon, BotIcon, CheckCheckIcon, HeartPulseIcon, PlugIcon, ReceiptTextIcon, ShieldCheckIcon, SparklesIcon, StoreIcon, UsersRoundIcon, WalletIcon, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { markNotificationsReadAction } from "@/app/app/[store]/notifications/actions";
import { useAdminLocale, useT } from "@/lib/i18n/admin/client";
import type { NotificationItem } from "@/lib/platform/notify";
import { cn } from "@/lib/utils";
import { KeysetPager } from "../common/keyset-pager";
import { formatDay } from "../common/primitive-logic";
import { FOCUS_RING, NUM, TOUCH } from "../common/ui-classes";
import { CENTRE_GROUPS, CENTRE_PAGE_PHONE, groupByDay, notificationHref, type CentreGroup } from "./pulse-state";
import { useStore } from "./store-context";
import { useActionError } from "./use-action-error";

const GROUP_ICON: Record<string, LucideIcon> = {
  orders: ReceiptTextIcon,
  team: UsersRoundIcon,
  store: StoreIcon,
  plan: WalletIcon,
  integrations: PlugIcon,
  security: ShieldCheckIcon,
  platform: SparklesIcon,
  ai: BotIcon,
  health: HeartPulseIcon,
};

export interface NotificationCentreProps {
  items: NotificationItem[];
  group: CentreGroup | null;
  next: string | null;
  prev: string | null;
  /** the server's clock when the rows were read (the day groups stay the same on both sides) */
  now: number;
}

export function NotificationCentre(p: NotificationCentreProps) {
  const t = useT();
  const locale = useAdminLocale();
  const store = useStore();
  const router = useRouter();
  const actions = useActionError();
  const [read, setRead] = useState<ReadonlySet<number> | "all">(() => new Set());
  const [expanded, setExpanded] = useState(false);
  const isRead = (n: NotificationItem) => n.read || read === "all" || read.has(n.id);
  const anyUnread = p.items.some((n) => !isRead(n));
  const time = new Intl.DateTimeFormat(locale === "ar" ? "ar-MA-u-nu-latn" : locale, { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: store.timeZone });
  const dayLabel = (day: string) => (day === "today" ? t("shell.notifications.today") : day === "yesterday" ? t("shell.notifications.yesterday") : formatDay(`${day}T12:00:00Z`, locale));

  const markRead = async (ids: number[] | "all") => {
    setRead((r) => (ids === "all" || r === "all" ? "all" : new Set([...r, ...ids])));
    const res = await actions.run(() => markNotificationsReadAction(ids));
    if (res.ok && ids === "all") router.refresh();
  };

  const open = (n: NotificationItem) => {
    if (!isRead(n)) void markRead([n.id]);
    const href = notificationHref(n.link);
    if (href) router.push(href);
  };

  // the row's index across the day groups: a phone shows the first 25 until "Show older"
  const indexed = p.items.map((n, i) => ({ ...n, index: i }));
  const groups = groupByDay(indexed, p.now, store.timeZone);
  const phoneCut = !expanded && p.items.length > CENTRE_PAGE_PHONE;
  const filterHref = (g: CentreGroup | null) => store.href(g ? `/notifications?group=${g}` : "/notifications");
  const chip = (active: boolean) =>
    cn(
      "inline-flex h-9 shrink-0 items-center rounded-full px-3.5 text-[13px] font-medium transition-colors duration-[var(--dur-1)]",
      active ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground",
      FOCUS_RING,
      TOUCH,
    );

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-8 pb-16 sm:px-8 sm:pt-10">
      <header className="flex flex-col gap-4 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid min-w-0 gap-1.5">
          <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.02em]">{t("shell.notifications.title")}</h1>
          <p className="text-sm text-pretty text-muted-foreground">{t("shell.notifications.lead", { store: store.name })}</p>
        </div>
        <Button type="button" variant="outline" size="lg" disabled={!anyUnread} onClick={() => void markRead("all")} className={cn("gap-2 self-start rounded-full sm:self-auto", FOCUS_RING, TOUCH)}>
          <CheckCheckIcon aria-hidden="true" />
          {t("shell.notifications.mark_all")}
        </Button>
      </header>

      <nav aria-label={t("shell.notifications.filter")} className="adm-scroll -mx-4 mb-5 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        <Link href={filterHref(null)} aria-current={p.group === null ? "page" : undefined} className={chip(p.group === null)}>
          {t("shell.notifications.group.all")}
        </Link>
        {CENTRE_GROUPS.map((g) => (
          <Link key={g} href={filterHref(g)} aria-current={p.group === g ? "page" : undefined} className={chip(p.group === g)}>
            {t(`shell.notifications.group.${g}`)}
          </Link>
        ))}
      </nav>

      {p.items.length === 0 ? (
        <div className="grid justify-items-center gap-3 rounded-[var(--r-card)] px-6 py-14 text-center ring-1 ring-border ring-inset">
          <span aria-hidden="true" className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground">
            <BellIcon className="size-4.5" />
          </span>
          <p className="max-w-80 text-sm leading-relaxed text-pretty text-muted-foreground">{t(p.group ? "shell.notifications.empty_group" : "shell.notifications.empty")}</p>
          {p.prev !== null && <KeysetPager next={null} prev={p.prev} param="before" />}
        </div>
      ) : (
        <div className="grid gap-6">
          {groups.map((g) => (
            <section key={g.day} aria-label={dayLabel(g.day)} className={cn("grid gap-2", phoneCut && g.items.every((n) => n.index >= CENTRE_PAGE_PHONE) && "max-md:hidden")}>
              <h2 className="text-[11px] font-medium text-muted-foreground">{dayLabel(g.day)}</h2>
              <ul className="divide-y divide-border overflow-hidden rounded-[var(--r-card)] bg-card ring-1 ring-border ring-inset">
                {g.items.map((n) => {
                  const Icon = GROUP_ICON[n.group] ?? BellIcon;
                  const unread = !isRead(n);
                  const href = notificationHref(n.link);
                  return (
                    <li key={n.id} className={cn(phoneCut && n.index >= CENTRE_PAGE_PHONE && "max-md:hidden")}>
                      <button
                        type="button"
                        onClick={() => open(n)}
                        data-unread={unread ? "" : undefined}
                        className={cn("relative flex w-full items-start gap-3 px-4 py-3 text-start transition-colors duration-[var(--dur-1)] hover:bg-accent", FOCUS_RING)}
                      >
                        {unread && <span aria-hidden="true" className="absolute inset-y-3 start-0 w-[3px] rounded-e-full bg-brand" />}
                        <span aria-hidden="true" className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-[var(--r-chip)] bg-muted text-muted-foreground">
                          <Icon className="size-4" />
                        </span>
                        <span className="grid min-w-0 flex-1 gap-0.5">
                          <span className={cn("text-sm leading-snug text-pretty", unread ? "font-medium text-foreground" : "text-foreground/80")}>
                            {n.title}
                            {unread && <span className="sr-only"> · {t("shell.notifications.unread")}</span>}
                          </span>
                          <span className="flex min-w-0 items-baseline gap-2 text-xs text-muted-foreground">
                            {n.body && <span className="min-w-0 truncate">{n.body}</span>}
                            {/* a link outside the rule is shown, never followed (PLA-§18.1) */}
                            {!href && n.link && (
                              <bdi dir="ltr" className="min-w-0 truncate font-mono text-[11px]">
                                {n.link}
                              </bdi>
                            )}
                            <time dateTime={n.createdAt} className={cn("ms-auto shrink-0", NUM)}>
                              {time.format(Date.parse(n.createdAt))}
                            </time>
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          {phoneCut && (
            <Button type="button" variant="outline" size="lg" onClick={() => setExpanded(true)} className={cn("w-full md:hidden", FOCUS_RING, TOUCH)}>
              {t("shell.notifications.older")}
            </Button>
          )}
          <KeysetPager next={p.next} prev={p.prev} param="before" />
        </div>
      )}
    </div>
  );
}
