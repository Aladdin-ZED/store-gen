"use client";
/**
 * The overview's Activity feed (platform.md PLA-§5.4, PL-05): the last 50 FEED_ACTIONS audit rows. Row: icon, the
 * sentence `console.feed.<action>`, the store chip, the actor (staff name, "System" or "Store owner"; analysts see no
 * staff names, the server already left them out) and the relative time. When `pulse.auditHead` moves past the newest
 * row shown, the page refreshes (PD39) and the new rows rise in (6 px + fade, 180 ms, at most 12 animated; reduced
 * motion: opacity only). Below 768 px the list shows 10 rows and "Show more".
 *
 *   <ActivityFeedPanel feed={await activityFeed(ctx)} at={…} />
 */
import { ActivityIcon, BadgeCheckIcon, CircleSlashIcon, DoorClosedIcon, DoorOpenIcon, EyeIcon, FlagIcon, OctagonPauseIcon, RotateCcwIcon, ShieldMinusIcon, SparklesIcon, StoreIcon, TrophyIcon, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n/admin/client";
import type { ActivityFeed, FeedAction } from "@/lib/platform/overview";
import { cn } from "@/lib/utils";
import { Ago } from "../ago";
import { ConsolePanel, QuietEmpty } from "../panel";
import { PrefetchLink } from "../prefetch-link";
import { useConsolePulse } from "../shell/pulse-provider";
import styles from "../shell/console.module.css";

const ICON: Record<FeedAction, LucideIcon> = {
  "store.created": StoreIcon,
  "store.milestone.reached": TrophyIcon,
  "platform.signup.approved": BadgeCheckIcon,
  "platform.signup.rejected": CircleSlashIcon,
  "platform.store.restricted": ShieldMinusIcon,
  "platform.store.suspended": OctagonPauseIcon,
  "platform.store.restored": RotateCcwIcon,
  "store.closed": DoorClosedIcon,
  "store.reopened": DoorOpenIcon,
  "store.mode_changed": SparklesIcon,
  "platform.kill.changed": FlagIcon,
  "platform.impersonation.started": EyeIcon,
};

const ANIMATE_MAX = 12;
const PHONE_ROWS = 10;

export function ActivityFeedPanel({ feed, at }: { feed: ActivityFeed; at: string }) {
  const t = useT();
  const router = useRouter();
  const { pulse } = useConsolePulse();
  const [more, setMore] = useState(false);
  // rows newer than the previous render's newest arrived with a pulse (state adjusted during render, no effect)
  const newest = feed.rows[0]?.id ?? 0;
  const [track, setTrack] = useState<{ newest: number; fresh: ReadonlySet<number> }>(() => ({ newest, fresh: new Set() }));
  if (newest !== track.newest) {
    setTrack({ newest, fresh: new Set(feed.rows.filter((r) => r.id > track.newest).slice(0, ANIMATE_MAX).map((r) => r.id)) });
  }
  const fresh = track.fresh;

  // the pulse saw a newer audit row than this page: refresh once per move
  const asked = useRef(feed.head);
  useEffect(() => {
    const head = pulse?.auditHead ?? 0;
    if (head > asked.current) {
      asked.current = head;
      router.refresh();
    }
  }, [pulse?.auditHead, router]);

  const actorText = (a: ActivityFeed["rows"][number]["actor"]) => (a.kind === "system" ? t("console.feed.actor.system") : a.kind === "member" ? t("console.feed.actor.member") : (a.name ?? t("console.feed.actor.staff")));

  return (
    <ConsolePanel title={t("console.feed.title")} at={at}>
      {feed.rows.length === 0 ? (
        <QuietEmpty text={t("console.empty.feed")} />
      ) : (
        <>
          <ol className="divide-y divide-[var(--c-hairline)]">
            {feed.rows.map((r, i) => {
              const Icon = ICON[r.action] ?? ActivityIcon;
              return (
                <li key={r.id} className={cn("flex min-w-0 items-start gap-3 px-4 py-2", fresh.has(r.id) && styles.rise, !more && i >= PHONE_ROWS && "max-md:hidden")}>
                  <span aria-hidden="true" className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                    <Icon className="size-3.5" />
                  </span>
                  <div className="grid min-w-0 flex-1 gap-0.5">
                    <p className="flex min-w-0 items-baseline gap-2 text-[13px]">
                      <span className="min-w-0 truncate">{t(`console.feed.${r.action}`, r.vars)}</span>
                      <Ago iso={r.at} className="num ms-auto shrink-0 text-[11px] text-muted-foreground" />
                    </p>
                    <p className="flex min-w-0 items-center gap-1.5 text-[12px] text-muted-foreground">
                      {r.store && (
                        <>
                          <PrefetchLink href={`/admin/stores/${r.store.id}`} className="min-w-0 truncate rounded-[var(--r-chip)] outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-[var(--ring)]">
                            {r.store.handle ? <bdi dir="ltr">@{r.store.handle}</bdi> : r.store.name || <bdi dir="ltr">{r.store.id}</bdi>}
                          </PrefetchLink>
                          <span aria-hidden="true">·</span>
                        </>
                      )}
                      <span className="shrink-0 truncate">{actorText(r.actor)}</span>
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
          {!more && feed.rows.length > PHONE_ROWS && (
            <div className="border-t border-[var(--c-hairline)] px-4 py-1.5 md:hidden">
              <button type="button" onClick={() => setMore(true)} className="inline-flex h-11 w-full items-center justify-center rounded-[var(--r-control)] text-[13px] font-medium text-[var(--c-brand-ink)] outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-[var(--ring)]">
                {t("console.feed.more")}
              </button>
            </div>
          )}
        </>
      )}
    </ConsolePanel>
  );
}
