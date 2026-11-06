"use client";
/**
 * The store profile's Activity tab (platform.md PLA-§7.7, §7.8; core §F.5, PD56): a segmented control kept in the URL
 * (`?view=timeline`) between
 *   - Audit: every audit row of the store merged with its view-as sessions, newest first, keyset by id (50); filters
 *     actor kind (member, platform, support view, system, API), area, staff member and dates, all in the URL; a row
 *     says the time, the actor (member, staff with role, "System"), the action sentence (`console.audit.<action>`, else
 *     the raw action in mono), the target, a short meta summary (already redacted by src/lib/audit.ts) and, for
 *     super_admins, the short IP hash;
 *   - Timeline: the merged stream (lifecycle, decisions, plan changes, milestones, views, decision and warning notes,
 *     exports, renames), 50 per page; a decision shows its note.
 *
 *   <ActivityTab storeId={id} view="audit" audit={panel} timeline={null} filter={…} staff={[…]} />
 */
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useT } from "@/lib/i18n/admin/client";
import { renderMarkdownLite } from "@/lib/platform/markdown-lite";
import type { Panel } from "@/lib/platform/panel";
import type { ActivityFilter, ActivityPage, ActivityRow } from "@/lib/platform/profile/activity";
import type { Timeline } from "@/lib/platform/profile/timeline";
import { cn } from "@/lib/utils";
import { Ago } from "../ago";
import { PanelError, PanelUnavailable, QuietEmpty } from "../panel";
import { PrefetchLink } from "../prefetch-link";
import { OlderLink } from "./older-link";
import { profileHref } from "./tabs";
import { timelineSentence } from "./timeline-text";

const ACTORS = ["user", "platform", "impersonation", "system", "api"] as const;
const AREAS = ["auth", "pages", "orders", "team", "settings", "integrations", "platform"] as const;

export function ActivityTab({
  storeId,
  view,
  audit,
  timeline,
  filter,
  staff,
}: {
  storeId: string;
  view: "audit" | "timeline";
  audit: Panel<ActivityPage> | null;
  timeline: Panel<Timeline> | null;
  filter: ActivityFilter;
  staff: { id: string; name: string }[];
}) {
  const t = useT();
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label={t("console.activity_tab.view")} className="inline-flex rounded-[var(--r-control)] bg-secondary p-0.5">
          {(["audit", "timeline"] as const).map((v) => (
            <PrefetchLink
              key={v}
              href={profileHref(storeId, "activity", v === "timeline" ? "view=timeline" : "")}
              aria-current={view === v ? "page" : undefined}
              className={cn(
                "inline-flex h-7 items-center rounded-[calc(var(--r-control)-2px)] px-3 text-[12.5px] font-medium text-muted-foreground outline-none transition-colors duration-[var(--dur-1)] focus-visible:ring-2 focus-visible:ring-[var(--ring)] max-md:h-10",
                view === v && "bg-card text-foreground shadow-[0_1px_2px_oklch(0.2_0.01_230/0.12),inset_0_0_0_1px_var(--c-hairline)]",
              )}
            >
              {t(`console.activity_tab.${v}`)}
            </PrefetchLink>
          ))}
        </nav>
        {view === "audit" && <AuditFilters filter={filter} staff={staff} />}
      </div>
      {view === "audit" && audit && <AuditList p={audit} />}
      {view === "timeline" && timeline && <TimelineList p={timeline} />}
    </div>
  );
}

function AuditFilters({ filter, staff }: { filter: ActivityFilter; staff: { id: string; name: string }[] }) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const set = (k: string, v: string) => {
    const q = new URLSearchParams(search.toString());
    if (v) q.set(k, v);
    else q.delete(k);
    q.delete("before");
    router.push(`${pathname}${q.size ? `?${q}` : ""}`, { scroll: false });
  };
  const field = "h-[var(--ctl)] rounded-[var(--r-control)] bg-card px-2.5 text-[13px] shadow-[inset_0_0_0_1px_var(--border)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] max-md:h-11";
  return (
    <div role="group" aria-label={t("console.activity_tab.filters")} className="flex flex-wrap items-end gap-2">
      <label className="grid gap-1 text-[11.5px] text-muted-foreground">
        {t("console.activity_tab.actor")}
        <select className={field} value={filter.actorKind ?? ""} onChange={(e) => set("actor", e.target.value)}>
          <option value="">{t("console.orders_tab.filter.any")}</option>
          {ACTORS.map((a) => (
            <option key={a} value={a}>
              {t(`console.activity_tab.actor.${a}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-[11.5px] text-muted-foreground">
        {t("console.activity_tab.area")}
        <select className={field} value={filter.area ?? ""} onChange={(e) => set("area", e.target.value)}>
          <option value="">{t("console.orders_tab.filter.any")}</option>
          {AREAS.map((a) => (
            <option key={a} value={a}>
              {t(`console.activity_tab.area.${a}`)}
            </option>
          ))}
        </select>
      </label>
      {staff.length > 0 && (
        <label className="grid gap-1 text-[11.5px] text-muted-foreground">
          {t("console.activity_tab.staff")}
          <select className={cn(field, "max-w-[180px]")} value={filter.staffId ?? ""} onChange={(e) => set("staff", e.target.value)}>
            <option value="">{t("console.orders_tab.filter.any")}</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="grid gap-1 text-[11.5px] text-muted-foreground">
        {t("console.orders_tab.filter.from")}
        <input type="date" className={cn(field, "num")} value={filter.from ?? ""} onChange={(e) => set("from", e.target.value)} />
      </label>
      <label className="grid gap-1 text-[11.5px] text-muted-foreground">
        {t("console.orders_tab.filter.to")}
        <input type="date" className={cn(field, "num")} value={filter.to ?? ""} onChange={(e) => set("to", e.target.value)} />
      </label>
    </div>
  );
}

function metaSummary(meta: Record<string, unknown> | null): string {
  if (!meta) return "";
  return Object.entries(meta)
    .filter(([, v]) => v !== null && (typeof v === "string" || typeof v === "number" || typeof v === "boolean"))
    .slice(0, 3)
    .map(([k, v]) => `${k}: ${String(v).slice(0, 40)}`)
    .join(" · ");
}

function AuditList({ p }: { p: Panel<ActivityPage> }) {
  const t = useT();
  const sentence = (action: string) => {
    const key = `console.audit.${action}`;
    const s = t(key);
    return s === key ? null : s;
  };
  const actor = (r: Extract<ActivityRow, { type: "audit" }>) => {
    const a = r.actor;
    if (a.kind === "system") return t("console.feed.actor.system");
    if (a.kind === "user") return a.name ?? t("console.feed.actor.member");
    if (a.kind === "impersonation") return t("console.activity_tab.during_view", { name: a.impersonator ?? a.name ?? t("console.feed.actor.staff") });
    return a.name ?? t("console.feed.actor.staff");
  };
  return (
    <section aria-label={t("console.activity_tab.audit")} className="min-w-0 overflow-hidden rounded-[var(--r-card)] bg-card shadow-[inset_0_0_0_1px_var(--c-hairline)]">
      {p.state === "error" ? (
        <PanelError reference={p.ref} />
      ) : p.state === "unavailable" ? (
        <PanelUnavailable />
      ) : p.data.rows.length === 0 ? (
        <QuietEmpty text={t("console.activity_tab.empty")} />
      ) : (
        <>
          <ol>
            {p.data.rows.map((r) =>
              r.type === "audit" ? (
                <li key={`a${r.id}`} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 border-b border-[var(--c-hairline)] px-4 py-2.5 last:border-b-0 md:grid-cols-[minmax(0,1.3fr)_minmax(0,0.8fr)_minmax(0,1fr)_112px] md:items-baseline">
                  <span className="min-w-0 text-[13px]">
                    {sentence(r.action) ?? (
                      <bdi dir="ltr" className="font-mono text-[12px]">
                        {r.action}
                      </bdi>
                    )}
                    {r.target && (
                      <bdi dir="ltr" className="ms-1.5 font-mono text-[11.5px] text-muted-foreground">
                        {r.target.slice(0, 26)}
                      </bdi>
                    )}
                  </span>
                  <Ago iso={r.at} className="text-end text-[12px] text-muted-foreground md:order-last" />
                  <span className="min-w-0 truncate text-[12px] text-muted-foreground">{actor(r)}</span>
                  <span className="min-w-0 truncate text-[11.5px] text-muted-foreground max-md:col-span-2">
                    {metaSummary(r.meta)}
                    {r.ipHash && (
                      <bdi dir="ltr" className="ms-1.5 font-mono">
                        ip {r.ipHash}
                      </bdi>
                    )}
                  </span>
                </li>
              ) : (
                <li key={`v${r.id}`} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 border-b border-[var(--c-hairline)] bg-[color-mix(in_oklch,oklch(0.6_0.14_295)_6%,transparent)] px-4 py-2.5 last:border-b-0">
                  <span className="min-w-0 text-[13px]">
                    {t("console.activity_tab.view_row", { name: r.staff ?? t("console.feed.actor.staff"), reason: t(`console.impersonation.reason.${r.reason}`) })}
                    {r.ticketRef && <span className="ms-1.5 text-[12px] text-muted-foreground">{t("console.activity_tab.ticket", { ref: r.ticketRef })}</span>}
                  </span>
                  <Ago iso={r.at} className="text-end text-[12px] text-muted-foreground" />
                  <span className="col-span-2 text-[12px] text-muted-foreground">{r.endedAt ? t("console.activity_tab.view_ended", { why: t(`console.activity_tab.view_end.${r.endedReason ?? "ended"}`) }) : t("console.activity_tab.view_live")}</span>
                </li>
              ),
            )}
          </ol>
          <OlderLink param="before" next={p.data.next} />
        </>
      )}
    </section>
  );
}

function TimelineList({ p }: { p: Panel<Timeline> }) {
  const t = useT();
  return (
    <section aria-label={t("console.activity_tab.timeline")} className="min-w-0 overflow-hidden rounded-[var(--r-card)] bg-card shadow-[inset_0_0_0_1px_var(--c-hairline)]">
      {p.state === "error" ? (
        <PanelError reference={p.ref} />
      ) : p.state === "unavailable" ? (
        <PanelUnavailable />
      ) : p.data.events.length === 0 ? (
        <QuietEmpty text={t("console.strip.timeline.none")} />
      ) : (
        <>
          <ol className="relative px-4 py-2 ps-8 before:absolute before:inset-y-4 before:start-[19px] before:w-px before:bg-[var(--c-hairline)]">
            {p.data.events.map((e) => {
              const s = timelineSentence(t, e);
              return (
                <li key={`${e.source}:${e.id}`} className="relative grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 py-2">
                  <span aria-hidden="true" className={cn("absolute -start-[17px] top-[13px] size-2 rounded-full ring-2 ring-card", e.source === "note" ? "bg-[oklch(0.8_0.15_95)]" : e.source === "view" ? "bg-[oklch(0.6_0.14_295)]" : e.source === "review" ? "bg-[var(--brand)]" : "bg-[color-mix(in_oklch,var(--foreground)_35%,transparent)]")} />
                  <div className="min-w-0 text-[13px]">
                    {s.known ? s.text : <bdi dir="ltr" className="font-mono text-[12px]">{s.text}</bdi>}
                    <span className="block text-[12px] text-muted-foreground">{e.actor.kind === "system" ? t("console.feed.actor.system") : e.actor.kind === "member" ? t("console.feed.actor.member") : (e.actor.name ?? t("console.feed.actor.staff"))}</span>
                    {e.note && <div className="mt-1 rounded-[var(--r-control)] bg-[color-mix(in_oklch,var(--muted)_55%,transparent)] px-2.5 py-1.5 text-[12.5px] [&_p]:my-0">{renderMarkdownLite(e.note)}</div>}
                  </div>
                  <Ago iso={e.at} className="text-[12px] text-muted-foreground" />
                </li>
              );
            })}
          </ol>
          <OlderLink param="cursor" next={p.data.next} />
        </>
      )}
    </section>
  );
}
