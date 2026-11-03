"use client";
/**
 * The staff notifications page body (platform.md PLA-§18.1, PL-13): the `platform_staff` rows this staff member may
 * read, newest first, rendered in their locale on the server. All / Unread filter and keyset paging in the URL
 * (`?filter=unread&before=<id>`), the severity as icon + text, "New" on unread rows, "Mark read" per row and "Mark all
 * read" (one read row per unread id, at most 200), both through `markStaffNotificationsReadAction`, then `refresh()`
 * and a toast. Opening a row's link marks it read first.
 *
 *   <StaffFeed items={rows} filter="all" older={nextBefore} newer={before !== null} />
 */
import { AlertTriangleIcon, CheckCircle2Icon, InfoIcon, OctagonAlertIcon, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { markStaffNotificationsReadAction } from "@/app/admin/(console)/notifications/actions";
import { useT } from "@/lib/i18n/admin/client";
import type { NotificationItem } from "@/lib/platform/notify";
import { cn } from "@/lib/utils";
import { Ago } from "../ago";
import { ConsolePanel, QuietEmpty } from "../panel";
import { PrefetchLink } from "../prefetch-link";

type Severity = "info" | "success" | "warn" | "danger";

const SEVERITY: Record<Severity, { icon: LucideIcon; tone: string }> = {
  info: { icon: InfoIcon, tone: "text-[var(--c-info-ink)]" },
  success: {
    icon: CheckCircle2Icon,
    tone: "text-[oklch(0.52_0.11_160)] dark:text-[oklch(0.78_0.11_160)]",
  },
  warn: {
    icon: AlertTriangleIcon,
    tone: "text-[oklch(0.55_0.11_95)] dark:text-[oklch(0.84_0.11_95)]",
  },
  danger: { icon: OctagonAlertIcon, tone: "text-[var(--c-danger-ink)]" },
};

const severityOf = (s: string): Severity => (s === "success" || s === "warn" || s === "danger" ? s : "info");

const segment =
  "inline-flex h-[var(--ctl)] items-center rounded-[calc(var(--r-control)-2px)] px-3 text-[12px] font-medium outline-none transition-colors duration-[var(--dur-1)] focus-visible:ring-2 focus-visible:ring-[var(--ring)] max-md:h-11";
const quietButton =
  "inline-flex h-[var(--ctl)] shrink-0 items-center rounded-[var(--r-control)] px-2.5 text-[12px] font-medium shadow-[inset_0_0_0_1px_var(--border)] outline-none transition-colors duration-[var(--dur-1)] hover:bg-accent focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-60 max-md:h-11";

export function StaffFeed({ items, filter, older, newer, at }: { items: NotificationItem[]; filter: "all" | "unread"; older: number | null; newer: boolean; at: string }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [marked, setMarked] = useState<ReadonlySet<number>>(new Set());
  const isUnread = (n: NotificationItem) => !n.read && !marked.has(n.id);
  const unreadShown = items.filter(isUnread).map((n) => n.id);

  const mark = (ids: number[] | "all", quiet = false) =>
    start(async () => {
      const res = await markStaffNotificationsReadAction({ ids });
      if (!res.ok) {
        toast.error(t("console.err.mark"));
        return;
      }
      setMarked((prev) => new Set([...prev, ...(ids === "all" ? unreadShown : ids)]));
      if (!quiet) toast.success(t("console.notifications.marked"));
      router.refresh();
    });

  const href = (q: { filter?: string; before?: number | null }) => {
    const p = new URLSearchParams();
    if ((q.filter ?? filter) === "unread") p.set("filter", "unread");
    if (q.before) p.set("before", String(q.before));
    const s = p.toString();
    return s ? `/admin/notifications?${s}` : "/admin/notifications";
  };

  return (
    <ConsolePanel
      title={t("console.notifications.title")}
      at={at}
      aside={
        <div className="flex shrink-0 items-center gap-2 py-1.5">
          {unreadShown.length > 0 && (
            <button type="button" disabled={pending} onClick={() => mark("all")} className={cn(quietButton, "max-sm:hidden")}>
              {t("console.notifications.mark_all")}
            </button>
          )}
          <div role="group" aria-label={t("console.notifications.filter")} className="flex shrink-0 items-center gap-0.5 rounded-[var(--r-control)] bg-secondary p-0.5">
            {(["all", "unread"] as const).map((f) => (
              <PrefetchLink
                key={f}
                href={href({ filter: f, before: null })}
                aria-current={filter === f ? "page" : undefined}
                className={cn(segment, filter === f ? "bg-background text-foreground shadow-[0_1px_2px_oklch(0.2_0.01_230/0.08)]" : "text-muted-foreground hover:text-foreground")}
              >
                {t(`console.notifications.${f}`)}
              </PrefetchLink>
            ))}
          </div>
        </div>
      }
    >
      {unreadShown.length > 0 && (
        <div className="border-b border-[var(--c-hairline)] px-4 py-2 sm:hidden">
          <button type="button" disabled={pending} onClick={() => mark("all")} className={cn(quietButton, "w-full justify-center")}>
            {t("console.notifications.mark_all")}
          </button>
        </div>
      )}
      {items.length === 0 ? (
        <QuietEmpty
          text={t(filter === "unread" ? "console.empty.notifications_unread" : "console.empty.notifications")}
          action={
            filter === "unread"
              ? {
                  href: href({ filter: "all", before: null }),
                  label: t("console.notifications.all"),
                }
              : null
          }
        />
      ) : (
        <ul className="divide-y divide-[var(--c-hairline)]">
          {items.map((n) => {
            const sev = severityOf(n.severity);
            const { icon: Icon, tone } = SEVERITY[sev];
            const unread = isUnread(n);
            const relative = n.link?.startsWith("/admin") ?? false;
            return (
              <li key={n.id} className={cn("flex min-w-0 items-start gap-3 px-4 py-3 last:rounded-b-[var(--r-card)] max-sm:flex-wrap", unread && "bg-[color-mix(in_oklch,var(--brand)_4%,transparent)]")}>
                <span className={cn("mt-0.5 inline-flex shrink-0 items-center gap-1 text-[11px] font-medium", tone)}>
                  <Icon aria-hidden="true" className="size-4" />
                  <span className="sr-only">{t(`console.notifications.severity.${sev}`)}</span>
                </span>
                <div className="grid min-w-0 flex-1 gap-0.5">
                  <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className={cn("min-w-0 text-[13px] text-pretty", unread ? "font-semibold" : "font-medium")}>{n.title}</span>
                    {unread && <span className="shrink-0 rounded-full bg-brand-soft px-1.5 text-[11px] leading-[18px] font-medium text-[var(--c-brand-ink)]">{t("console.notifications.new")}</span>}
                  </p>
                  {n.body && <p className="text-[12px] leading-relaxed text-pretty whitespace-pre-line text-muted-foreground">{n.body}</p>}
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5 text-[12px] text-muted-foreground">
                    <Ago iso={n.createdAt} className="num" />
                    <span>{t(`console.notifications.severity.${sev}`)}</span>
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5 max-sm:basis-full max-sm:ps-7">
                  {n.link &&
                    (relative ? (
                      <PrefetchLink href={n.link} onClick={() => unread && mark([n.id], true)} className={quietButton}>
                        {t("console.notifications.open")}
                      </PrefetchLink>
                    ) : (
                      <a href={n.link} onClick={() => unread && mark([n.id], true)} className={quietButton}>
                        {t("console.notifications.open")}
                      </a>
                    ))}
                  {unread && (
                    <button type="button" disabled={pending} onClick={() => mark([n.id])} className={cn(quietButton, "shadow-none text-muted-foreground hover:text-foreground")}>
                      {t("console.notifications.mark")}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {(older !== null || newer) && (
        <nav className="flex items-center justify-between gap-2 border-t border-[var(--c-hairline)] px-4 py-2">
          {newer ? (
            <PrefetchLink href={href({ before: null })} className={quietButton}>
              {t("console.notifications.newest")}
            </PrefetchLink>
          ) : (
            <span />
          )}
          {older !== null && (
            <PrefetchLink href={href({ before: older })} className={quietButton}>
              {t("console.notifications.older")}
            </PrefetchLink>
          )}
        </nav>
      )}
    </ConsolePanel>
  );
}
