"use client";
/**
 * Settings → Audit on screen (P2 SHELL; platform.md PLA-§22.10.6, PD75): the store's activity, newest first.
 *
 * - Each row: the time in the store's time zone, the actor chip (text and icon, never a bare dot: Member · Store Gen ·
 *   Support view · System · API) with the display name, the sentence (`shell.audit.<action>`, else the raw action in
 *   mono), the target link and the redacted meta summary. Support-view rows carry the `#imp-<id>` anchor the
 *   impersonation notifications land on, and are highlighted when targeted.
 * - Filters: actor kind, area and a date range, as a GET form (the URL is the state), with Clear.
 * - `KeysetPager` (50 a page). Below 640 px a row is two lines: actor and time, then the sentence.
 */
import { BotIcon, Building2Icon, EyeIcon, KeyRoundIcon, UserIcon, XIcon, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/admin/common/empty-state";
import { KeysetPager } from "@/components/admin/common/keyset-pager";
import { FIELD_INPUT, NativeSelect, SettingsCard } from "@/components/admin/common/settings-kit";
import { FOCUS_RING } from "@/components/admin/common/ui-classes";
import { useAdminLocale, useT } from "@/lib/i18n/admin/client";
import { cn } from "@/lib/utils";
import type { AuditViewRow } from "@/app/app/[store]/settings/audit/data";

const ACTORS: Record<AuditViewRow["actorKind"], { icon: LucideIcon; chip: string }> = {
  user: { icon: UserIcon, chip: "bg-muted text-foreground" },
  platform: { icon: Building2Icon, chip: "bg-info-soft text-info-ink" },
  impersonation: { icon: EyeIcon, chip: "bg-imp-bg text-imp-ink" },
  system: { icon: BotIcon, chip: "bg-muted text-muted-foreground" },
  api: { icon: KeyRoundIcon, chip: "bg-brand-soft text-brand" },
};
const AREAS = ["pages", "orders", "team", "settings", "integrations", "security", "platform"] as const;

function stamp(iso: string, timeZone: string, locale: string): { day: string; time: string } {
  const d = new Date(iso);
  try {
    return {
      day: new Intl.DateTimeFormat(locale, {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone,
      }).format(d),
      time: new Intl.DateTimeFormat(locale, {
        hour: "2-digit",
        minute: "2-digit",
        timeZone,
      }).format(d),
    };
  } catch {
    return { day: iso.slice(0, 10), time: iso.slice(11, 16) };
  }
}

export function AuditView({
  rows,
  timeZone,
  filters,
  next,
  prev,
}: {
  rows: AuditViewRow[];
  timeZone: string;
  filters: { actor: string; area: string; from: string; to: string };
  next: string | null;
  prev: string | null;
}) {
  const t = useT();
  const locale = useAdminLocale();
  const pathname = usePathname();
  const filtered = Object.values(filters).some(Boolean);

  return (
    <SettingsCard title={t("shell.settings.audit")} description={t("shell.audit.lead", { zone: timeZone.replace(/_/g, " ") })}>
      <form method="get" action={pathname} className="grid grid-cols-2 gap-3 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto] lg:items-end">
        <label className="grid min-w-0 gap-1.5 text-[13px] font-medium">
          {t("shell.audit.filter.actor")}
          <NativeSelect name="actor" defaultValue={filters.actor}>
            <option value="">{t("shell.audit.filter.all")}</option>
            {(Object.keys(ACTORS) as AuditViewRow["actorKind"][]).map((k) => (
              <option key={k} value={k}>
                {t(`shell.audit.actor.${k}`)}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="grid min-w-0 gap-1.5 text-[13px] font-medium">
          {t("shell.audit.filter.area")}
          <NativeSelect name="area" defaultValue={filters.area}>
            <option value="">{t("shell.audit.filter.all")}</option>
            {AREAS.map((a) => (
              <option key={a} value={a}>
                {t(`shell.audit.area.${a}`)}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="grid min-w-0 gap-1.5 text-[13px] font-medium">
          {t("shell.audit.filter.from")}
          <input type="date" name="from" defaultValue={filters.from} className={cn(FIELD_INPUT, "w-full min-w-0 border border-input px-3")} />
        </label>
        <label className="grid min-w-0 gap-1.5 text-[13px] font-medium">
          {t("shell.audit.filter.to")}
          <input type="date" name="to" defaultValue={filters.to} className={cn(FIELD_INPUT, "w-full min-w-0 border border-input px-3")} />
        </label>
        <div className="col-span-2 flex items-center gap-2 lg:col-span-1">
          <Button type="submit" variant="outline" className="max-md:h-11 max-md:flex-1 md:h-10">
            {t("shell.audit.filter.apply")}
          </Button>
          {filtered && (
            <Button asChild variant="ghost" className="max-md:h-11 md:h-10">
              <Link href={pathname}>
                <XIcon aria-hidden="true" />
                {t("shell.audit.filter.clear")}
              </Link>
            </Button>
          )}
        </div>
      </form>

      {rows.length === 0 ? (
        <EmptyState compact title={t(filtered ? "shell.audit.empty_filtered" : "shell.audit.empty")} description={filtered ? undefined : t("shell.audit.empty_lead")} />
      ) : (
        <ol className="grid divide-y divide-[color-mix(in_oklch,var(--foreground)_9%,transparent)]">
          {rows.map((r) => {
            const actor = ACTORS[r.actorKind];
            const Icon = actor.icon;
            const when = stamp(r.at, timeZone, locale);
            return (
              <li
                key={r.id}
                id={r.anchor ?? undefined}
                className="grid scroll-mt-24 gap-x-4 gap-y-1 py-3 target:rounded-[var(--r-control)] target:bg-imp-bg/40 sm:grid-cols-[9.5rem_minmax(0,1fr)] sm:items-baseline"
              >
                <div className="flex items-center justify-between gap-2 sm:grid sm:justify-start sm:gap-1.5">
                  <span className={cn("inline-flex w-fit max-w-full items-center gap-1.5 rounded-[var(--r-chip)] px-1.5 py-0.5 text-[11px] font-medium", actor.chip)}>
                    <Icon aria-hidden="true" className="size-3 shrink-0" />
                    <span className="truncate">{t(`shell.audit.actor.${r.actorKind}`)}</span>
                  </span>
                  <time dateTime={r.at} className="text-xs text-muted-foreground tabular-nums">
                    {when.day} · <bdi>{when.time}</bdi>
                  </time>
                </div>
                <div className="grid min-w-0 gap-0.5">
                  <p className="text-sm">
                    {r.actorName && <span className="font-medium">{r.actorName} </span>}
                    {r.sentence ? (
                      <span className={cn(r.actorName && "text-muted-foreground")}>{t(r.sentence)}</span>
                    ) : (
                      <code dir="ltr" className="rounded-[var(--r-chip)] bg-muted px-1 py-0.5 font-mono text-[12px]">
                        {r.action}
                      </code>
                    )}
                    {r.target && (
                      <>
                        {" · "}
                        <Link href={r.target.href} className={cn("font-medium underline-offset-4 hover:underline", FOCUS_RING)}>
                          {r.target.label}
                        </Link>
                      </>
                    )}
                  </p>
                  {r.metaSummary && (
                    <p dir="auto" className="truncate font-mono text-[11.5px] text-muted-foreground">
                      {r.metaSummary}
                    </p>
                  )}
                  {r.note && (
                    <p dir="auto" className="line-clamp-3 text-[13px] text-muted-foreground">
                      <span className="font-medium text-foreground">{t("shell.audit.note")}</span> {r.note}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <KeysetPager next={next} prev={prev} param="before" />
    </SettingsCard>
  );
}
