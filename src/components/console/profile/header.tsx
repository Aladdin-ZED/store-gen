"use client";
/**
 * The store profile's header and banners (platform.md PLA-§7.1, PL-07; TN-03, PD35, PD45, PD54, PD56), on every tab.
 *
 * Left: the 48 px Monogram, the name, `@handle` with Copy, the StatusPill (it opens the lifecycle menu), the mode
 * badge, the plan chip, market · currency · time zone, the creation date and age, the owner (first name, the e-mail
 * as PD35 allows, a link to the person) and the Internal chip (plan `internal` or store #1). Right: the 40 px health
 * ring (hover: the seven groups and the console flags), the open requests badge, View as store (`V`), Open live store
 * (disabled with its reason when the store is not live), Message and ⋯ (the lifecycle actions, Export data, Copy store
 * id; each hidden without its permission, disabled with the reason when the edge is not allowed from the status).
 * Banners: another staff member viewing the store, this staff member's own view with End, a waiting purge request,
 * a closed store's reopen deadline and a scheduled deletion's date.
 *
 * Lifecycle items only open the LifecycleSheet (never a chord, ⌘K or a bulk bar). `V` and `?sheet=view-as` (the
 * queue's V, ⌘K "Start view as…") open the start sheet.
 *
 *   <ProfileHeader header={h} menu={items} grants={…} armSeconds={5} stepUpUntil={iso} notice={notice} ticketRequired={false} />
 */
import { ArrowUpRightIcon, CopyIcon, EllipsisIcon, EyeIcon, InboxIcon, MailIcon, PackageIcon, ShieldAlertIcon, Trash2Icon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { endImpersonationAction } from "@/app/admin/(console)/stores/[id]/actions";
import { CopyButton, writeClipboard } from "@/components/admin/common/copy-button";
import { HealthRing } from "@/components/admin/common/health-ring";
import { ModeBadge } from "@/components/admin/common/mode-badge";
import { Monogram } from "@/components/admin/common/monogram";
import { StatusPill } from "@/components/admin/common/status-pill";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { HEALTH_CAPS, type HealthGroup } from "@/lib/health/types";
import { useT } from "@/lib/i18n/admin/client";
import type { StoreHeader } from "@/lib/platform/profile/header";
import type { LifecycleMenuItem } from "@/lib/platform/profile/menu";
import { cn } from "@/lib/utils";
import { isEditable, overlayOpen } from "../_compat/chords";
import { absoluteTime, durationText } from "../format";
import { StartViewSheet, type ViewAsNotice } from "../impersonation/start-sheet";
import { LifecycleSheet } from "../lifecycle/sheet";
import { MessageDialog } from "../messages/message-dialog";
import { PrefetchLink } from "../prefetch-link";
import { button, Kbd } from "../queue/decision-dialogs";
import { useConsoleShell, useNow } from "../shell/context";
import { ExportDialog } from "./export-panel";

export interface ProfileGrants {
  viewAs: boolean;
  message: boolean;
  /** super_admin with `stores.close` (PLA-§7.14) */
  exportData: boolean;
}

const GROUPS = Object.keys(HEALTH_CAPS) as HealthGroup[];
const chip = "inline-flex h-6 shrink-0 items-center gap-1 rounded-[var(--r-chip)] px-2 text-[11.5px] font-medium whitespace-nowrap";

export function ProfileHeader({
  header,
  menu,
  grants,
  armSeconds,
  stepUpUntil,
  notice,
  ticketRequired,
}: {
  header: StoreHeader;
  menu: LifecycleMenuItem[];
  grants: ProfileGrants;
  armSeconds: number;
  stepUpUntil: string | null;
  notice: ViewAsNotice;
  ticketRequired: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const { timeZone } = useConsoleShell();
  const s = header.store;
  const [sheet, setSheet] = useState<{ item: LifecycleMenuItem; n: number } | null>(null);
  const [viewAs, setViewAs] = useState(0);
  const [message, setMessage] = useState(false);
  const [exporting, setExporting] = useState(0);
  const opened = useRef(0);

  const openViewAs = useCallback(() => {
    if (grants.viewAs) setViewAs((n) => n + 1);
  }, [grants.viewAs]);

  // `?sheet=view-as` (the queue's V) and `?view_as=1` (⌘K "Start view as…") open the start sheet; closing it leaves the URL
  const fromUrl = grants.viewAs && (search.get("sheet") === "view-as" || search.get("view_as") === "1");
  const closeViewAs = () => {
    setViewAs(0);
    if (fromUrl) {
      const next = new URLSearchParams(search.toString());
      next.delete("sheet");
      next.delete("view_as");
      router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
    }
  };

  // V: View as store (never with a modifier, in a text field, under an overlay, or as a "G" chord's second key)
  useEffect(() => {
    let gAt = 0;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || isEditable(e.target) || overlayOpen()) return;
      const k = e.key.toLowerCase();
      if (k === "g") {
        gAt = Date.now();
        return;
      }
      const chord = gAt && Date.now() - gAt <= 1_200;
      gAt = 0;
      if (chord || k !== "v") return;
      e.preventDefault();
      openViewAs();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openViewAs]);

  const openSheet = (item: LifecycleMenuItem) => {
    if (item.disabledKey) return;
    opened.current += 1;
    setSheet({ item, n: opened.current });
  };

  const now = useNow(60_000);
  const age = durationText(now - Date.parse(s.createdAt));
  const owner = header.owners[0] ?? null;
  const lifecycle = menu;

  return (
    <>
      <header className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div className="flex min-w-0 items-start gap-3.5">
          <Monogram name={s.name} seed={s.id} size={48} />
          <div className="grid min-w-0 gap-1.5">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <h1 className="min-w-0 truncate text-[20px] leading-tight font-semibold tracking-[-0.014em]" title={s.name}>
                {s.name}
              </h1>
              {s.handle && (
                <span className="inline-flex items-center gap-0.5 text-[13px] text-muted-foreground">
                  <bdi dir="ltr" className="font-mono">
                    @{s.handle}
                  </bdi>
                  <CopyButton value={s.handle} label={t("console.profile.copy_handle")} toastMessage={t("console.profile.copied")} size="icon-xs" />
                </span>
              )}
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <StatusMenu status={s.status} items={lifecycle} onPick={openSheet} reasonCode={s.statusReason} />
              <ModeBadge mode={s.mode} />
              <PrefetchLink href={`/admin/plans/${s.plan.id}`} className={cn(chip, "bg-secondary text-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-[var(--ring)]")} title={t("console.profile.plan_hint")}>
                {s.plan.name ?? s.plan.id}
              </PrefetchLink>
              {s.internal && <span className={cn(chip, "bg-[color-mix(in_oklch,var(--brand)_10%,transparent)] text-[var(--c-brand-ink)]")}>{t("console.profile.internal")}</span>}
            </div>
            <p className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-[12.5px] text-muted-foreground">
              <span>
                {s.market} · {s.currency} · <bdi dir="ltr">{s.timezone}</bdi>
              </span>
              <time dateTime={s.createdAt} title={absoluteTime(s.createdAt, timeZone)} suppressHydrationWarning>
                {t("console.profile.created", { date: shortDate(s.createdAt, timeZone), age: age ?? t("console.time.now") })}
              </time>
              {owner && (
                <>
                  <span className="min-w-0">
                    {t("console.profile.owner")}{" "}
                    <PrefetchLink href={`/admin/users/${owner.userId}`} className="font-medium text-foreground outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--ring)]">
                      {owner.firstName}
                    </PrefetchLink>{" "}
                    <bdi dir="ltr" className="break-all">
                      {owner.email}
                    </bdi>
                    {header.owners.length > 1 && <> {t("console.profile.more_owners", { count: header.owners.length - 1 })}</>}
                  </span>
                </>
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <HealthHover health={header.health} />
          {header.openRequests > 0 && (
            <PrefetchLink href={`/admin/queue?tab=requests&q=${encodeURIComponent(s.handle ?? s.id)}`} className={cn(chip, "h-[var(--ctl)] bg-[var(--c-warn-soft)] px-2.5 text-[12px] text-foreground outline-none hover:bg-[color-mix(in_oklch,var(--c-warn-soft)_80%,var(--foreground)_6%)] focus-visible:ring-2 focus-visible:ring-[var(--ring)] max-md:h-11")}>
              <InboxIcon aria-hidden="true" className="size-3.5" />
              {t("console.profile.requests", { count: header.openRequests })}
            </PrefetchLink>
          )}
          {grants.viewAs && (
            <button type="button" onClick={openViewAs} className={cn(button.base, button.secondary)}>
              <EyeIcon aria-hidden="true" className="size-3.5" />
              {t("console.profile.view_as")}
              <Kbd>V</Kbd>
            </button>
          )}
          {"url" in header.live ? (
            <a href={header.live.url} target="_blank" rel="noopener noreferrer" className={cn(button.base, button.secondary)}>
              <ArrowUpRightIcon aria-hidden="true" className="size-3.5 rtl:-scale-x-100" />
              {t("console.profile.open_live")}
            </a>
          ) : (
            <span className={cn(button.base, button.secondary, "cursor-not-allowed opacity-50")} aria-disabled="true" title={t(`console.profile.live_disabled.${header.live.disabled}`)}>
              <ArrowUpRightIcon aria-hidden="true" className="size-3.5 rtl:-scale-x-100" />
              {t("console.profile.open_live")}
              <span className="sr-only">{t(`console.profile.live_disabled.${header.live.disabled}`)}</span>
            </span>
          )}
          {grants.message && (
            <button type="button" onClick={() => setMessage(true)} className={cn(button.base, button.secondary)}>
              <MailIcon aria-hidden="true" className="size-3.5" />
              {t("console.profile.message")}
            </button>
          )}
          <MoreMenu items={lifecycle} onPick={openSheet} storeId={s.id} canExport={grants.exportData} onExport={() => setExporting((n) => n + 1)} />
        </div>
      </header>

      <Banners header={header} />

      {sheet && (
        <LifecycleSheet
          key={sheet.n}
          open
          onOpenChange={(o) => !o && setSheet(null)}
          item={sheet.item}
          store={{ id: s.id, name: s.name, handle: s.handle }}
          armSeconds={armSeconds}
          stepUpUntil={stepUpUntil}
        />
      )}
      {(viewAs > 0 || fromUrl) && (
        <StartViewSheet
          key={viewAs}
          open
          onOpenChange={(o) => !o && closeViewAs()}
          store={{ id: s.id, name: s.name, handle: s.handle, status: s.status }}
          notice={notice}
          ticketRequired={ticketRequired}
        />
      )}
      {grants.message && <MessageDialog open={message} onOpenChange={setMessage} stores={[{ id: s.id, name: s.name, handle: s.handle }]} />}
      {exporting > 0 && <ExportDialog key={exporting} open onOpenChange={(o) => !o && setExporting(0)} storeId={s.id} store={s.name} />}
    </>
  );
}

/* ------------------------------------------------------------------ */

function StatusMenu({ status, items, onPick, reasonCode }: { status: StoreHeader["store"]["status"]; items: LifecycleMenuItem[]; onPick(i: LifecycleMenuItem): void; reasonCode: string | null }) {
  const t = useT();
  const any = items.length > 0;
  const reason = reasonCode ? t(`console.reason.${reasonCode}`) : null;
  if (!any) {
    return (
      <span className="inline-flex items-center gap-1.5" title={reason ?? undefined}>
        <StatusPill status={status} />
      </span>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("console.profile.status_menu", { status: t(`console.status.${status}`) })}
        title={reason ? t("console.profile.status_reason", { reason }) : undefined}
        className="inline-flex items-center gap-1 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] data-[state=open]:ring-2 data-[state=open]:ring-[var(--ring)]"
      >
        <StatusPill status={status} />
        <svg aria-hidden="true" viewBox="0 0 12 12" className="size-3 text-muted-foreground">
          <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel className="grid gap-0.5 font-normal">
          <span className="text-[12px] font-medium">{t("console.profile.lifecycle")}</span>
          {reason && <span className="text-[11.5px] text-muted-foreground">{t("console.profile.status_reason", { reason })}</span>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <LifecycleItems items={items} onPick={onPick} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function LifecycleItems({ items, onPick }: { items: LifecycleMenuItem[]; onPick(i: LifecycleMenuItem): void }) {
  const t = useT();
  return (
    <>
      {items.map((i) => (
        <DropdownMenuItem
          key={i.action}
          disabled={!!i.disabledKey}
          onSelect={() => onPick(i)}
          className={cn("grid items-start gap-0.5 py-1.5", i.danger && !i.disabledKey && "text-[var(--c-danger-ink)] focus:text-[var(--c-danger-ink)]")}
        >
          <span className="flex items-center gap-2 text-[13px]">
            {i.action === "purge" || i.action === "schedule_deletion" ? <Trash2Icon aria-hidden="true" className="size-3.5" /> : <ShieldAlertIcon aria-hidden="true" className="size-3.5 opacity-70" />}
            {t(`console.lifecycle.menu.${i.action}`)}
            {i.stepUp && <span className="ms-auto text-[10.5px] font-normal text-muted-foreground">{t("console.lifecycle.menu.step_up")}</span>}
          </span>
          {i.disabledKey && <span className="ps-5.5 text-[11.5px] leading-snug text-muted-foreground">{t(i.disabledKey)}</span>}
        </DropdownMenuItem>
      ))}
    </>
  );
}

function MoreMenu({ items, onPick, storeId, canExport, onExport }: { items: LifecycleMenuItem[]; onPick(i: LifecycleMenuItem): void; storeId: string; canExport: boolean; onExport(): void }) {
  const t = useT();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label={t("console.profile.more")} className={cn(button.base, button.secondary, "w-[var(--ctl)] px-0 max-md:w-11")}>
        <EllipsisIcon aria-hidden="true" className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        {items.length > 0 && (
          <>
            <DropdownMenuLabel className="text-[12px] font-medium">{t("console.profile.lifecycle")}</DropdownMenuLabel>
            <LifecycleItems items={items} onPick={onPick} />
            <DropdownMenuSeparator />
          </>
        )}
        {canExport && (
          <DropdownMenuItem onSelect={onExport} className="gap-2 text-[13px]">
            <PackageIcon aria-hidden="true" className="size-3.5" />
            {t("console.profile.export")}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onSelect={() => {
            void writeClipboard(storeId).then((ok) => (ok ? toast.success(t("console.profile.copied")) : toast.error(t("console.profile.copy_failed"))));
          }}
          className="gap-2 text-[13px]"
        >
          <CopyIcon aria-hidden="true" className="size-3.5" />
          {t("console.profile.copy_id")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The 40 px ring with the seven group penalties and the console flags on hover (staff-only flags, PLA-§6.3.3). */
function HealthHover({ health }: { health: StoreHeader["health"] }) {
  const t = useT();
  if (!health) {
    return (
      <span className="inline-flex items-center gap-2 text-[12px] text-muted-foreground" title={t("console.profile.health_none")}>
        <HealthRing score={null} attention={0} size={40} computedAt={null} surface="console" />
        <span className="max-sm:sr-only">{t("console.profile.health_none")}</span>
      </span>
    );
  }
  return (
    <HoverCard openDelay={150} closeDelay={80}>
      <HoverCardTrigger asChild>
        <button type="button" aria-label={t("console.profile.health_label", { score: health.score })} className="inline-flex items-center gap-2 rounded-full pe-1 outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]">
          <HealthRing score={health.score} attention={(Math.max(0, Math.min(3, health.attention)) as 0 | 1 | 2 | 3)} size={40} computedAt={health.computedAt} dirty={health.dirty} surface="console" />
          {health.flags.length > 0 && <span className={cn(chip, "bg-[var(--c-warn-soft)] text-foreground")}>{t("console.profile.flags", { count: health.flags.length })}</span>}
        </button>
      </HoverCardTrigger>
      <HoverCardContent align="end" className="w-72 p-0">
        <div className="grid gap-2 px-3.5 py-3">
          <p className="text-[12px] font-medium">{t("console.profile.health_groups")}</p>
          <ul className="grid gap-1">
            {GROUPS.map((g) => (
              <li key={g} className="grid grid-cols-[1fr_auto] items-center gap-2 text-[12px]">
                <span className="text-muted-foreground">{t(`console.hgroup.${g}`)}</span>
                <span className="num">{health.components[g] ? `−${health.components[g]}` : "0"}</span>
              </li>
            ))}
          </ul>
        </div>
        {health.flags.length > 0 && (
          <div className="grid gap-1.5 border-t border-[var(--c-hairline)] px-3.5 py-3">
            <p className="text-[12px] font-medium">{t("console.profile.health_flags")}</p>
            <div className="flex flex-wrap gap-1">
              {health.flags.map((f) => (
                <span key={f.code} className={cn(chip, f.severity >= 3 ? "bg-[var(--c-danger-soft)] text-[var(--c-danger-ink)]" : "bg-[var(--c-warn-soft)] text-foreground")}>
                  {t(`console.hflag.${f.code}`)}
                </span>
              ))}
            </div>
          </div>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}

function Banner({ tone, icon, children, action }: { tone: "imp" | "warn" | "danger" | "neutral"; icon: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <div
      role="status"
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[var(--r-control)] px-3.5 py-2.5 text-[13px]",
        tone === "imp" && "bg-[oklch(0.95_0.04_295)] text-[oklch(0.36_0.12_295)] dark:bg-[oklch(0.3_0.07_295)] dark:text-[oklch(0.9_0.05_295)]",
        tone === "warn" && "bg-[var(--c-warn-soft)]",
        tone === "danger" && "bg-[var(--c-danger-soft)] text-[var(--c-danger-ink)]",
        tone === "neutral" && "bg-secondary",
      )}
    >
      <span className="flex min-w-0 flex-1 items-start gap-2">
        <span className="mt-0.5 shrink-0">{icon}</span>
        <span className="min-w-0">{children}</span>
      </span>
      {action}
    </div>
  );
}

function Banners({ header }: { header: StoreHeader }) {
  const t = useT();
  const { timeZone } = useConsoleShell();
  const now = useNow(30_000);
  const [ending, startEnd] = useTransition();
  const mine = header.impersonations.find((v) => v.self && Date.parse(v.expiresAt) > now);
  const others = header.impersonations.filter((v) => !v.self && Date.parse(v.expiresAt) > now);
  const list: ReactNode[] = [];
  if (mine) {
    list.push(
      <Banner
        key="mine"
        tone="imp"
        icon={<EyeIcon aria-hidden="true" className="size-3.5" />}
        action={
          <button type="button" disabled={ending} onClick={() => startEnd(() => void endImpersonationAction())} className={cn(button.base, "h-7 bg-card px-2.5 text-[12px] text-foreground shadow-[inset_0_0_0_1px_var(--border)] hover:bg-accent")}>
            {t("console.impersonation.end")}
          </button>
        }
      >
        {t("console.profile.banner.viewing_self", { until: clock(mine.expiresAt, timeZone) })}
      </Banner>,
    );
  }
  for (const v of others) {
    list.push(
      <Banner key={`v-${v.staffUserId}`} tone="imp" icon={<EyeIcon aria-hidden="true" className="size-3.5" />}>
        {t("console.profile.banner.viewing", { name: v.staffName ?? t("console.profile.banner.a_staff_member"), until: clock(v.expiresAt, timeZone) })}
      </Banner>,
    );
  }
  if (header.pendingPurge) {
    const p = header.pendingPurge;
    list.push(
      <Banner key="purge" tone="danger" icon={<Trash2Icon aria-hidden="true" className="size-3.5" />}>
        {p.mode === "four_eyes" ? t("console.profile.banner.purge_four_eyes") : t("console.profile.banner.purge_delayed", { date: p.executeAfter ? absoluteTime(p.executeAfter, timeZone) : "" })}
      </Banner>,
    );
  }
  if (header.reopenDeadline) {
    list.push(
      <Banner key="deadline" tone="warn" icon={<ShieldAlertIcon aria-hidden="true" className="size-3.5" />}>
        {header.store.status === "scheduled_deletion"
          ? t("console.profile.banner.deletion", { date: absoluteTime(header.reopenDeadline, timeZone) })
          : t("console.profile.banner.reopen_until", { date: absoluteTime(header.reopenDeadline, timeZone) })}
      </Banner>,
    );
  }
  if (!list.length) return null;
  return <div className="grid gap-2">{list}</div>;
}

const clock = (iso: string, timeZone: string) => {
  try {
    return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone }).format(new Date(iso));
  } catch {
    return iso.slice(11, 16);
  }
};

const shortDate = (iso: string, timeZone: string) => {
  try {
    return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
};
