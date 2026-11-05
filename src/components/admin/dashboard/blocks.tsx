"use client";
/**
 * The dashboard's client blocks (P2 SHELL; platform.md PLA-§22.17; docs/STORE-SAAS.md §I.6, §I.8): what each streamed
 * block draws once the server settled its panel. Every string is the viewer's language (`useT`); every number comes
 * from the pure composer (./compose.ts), so the honesty rules (no made-up 0, a rate with its n, R2 numbers as a hint)
 * hold here by construction:
 *
 *   <DashboardHeader greeting="shell.dash.greeting.morning" name="Salma" today="Tuesday 4 November" range="7d" />
 *   <KpiTiles tiles={composeTiles(…)} currency="MAD" />          the six COD tiles
 *   <Funnel steps={funnelSteps(…)} days={7} />                   orders → confirmed → (R2 steps as the neutral line)
 *   <WorkLists queue={…} sheet={…} />                            counters from the live pulse, then the server reads
 *   <DashboardAddress … />                                       the address card after the first publish, dismissible
 *   <IntegrationTiles integrations={…} sheet={…} canSync />      P5's rows, or R1.0's Sheets tile before them
 */
import { ArrowRightIcon, ReceiptTextIcon, SparklesIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import type { DashboardRange, Panel, SheetHealth } from "@/lib/admin-data/dashboard";
import type { IntegrationHealthRow, SheetsBacklog } from "@/lib/integrations/health";
import { formatMoney, formatNumber } from "@/lib/markets/money";
import type { MessageKey } from "@/lib/i18n/admin";
import { useAdminLocale, useT } from "@/lib/i18n/admin/client";
import type { QueueCounts } from "@/lib/orders/profile";
import type { StoreRow } from "@/lib/tenancy/types";
import { cn } from "@/lib/utils";
import { AddressCard } from "../common/address-card";
import { FunnelChart } from "../common/funnel-chart";
import { KpiTile } from "../common/kpi-tile";
import { formatDay } from "../common/primitive-logic";
import { FOCUS_RING, NUM, TOUCH } from "../common/ui-classes";
import { useStore } from "../shell/store-context";
import { usePulse } from "../shell/use-pulse";
import { TestOrderSlot, CampaignSlot } from "../landing/address-slots";
import { workLines, type FunnelStepSpec, type TileSpec } from "./compose";
import { SheetHealthCard } from "./sheet-health";

/* ------------------------------------------------------------------ */
/* header                                                              */
/* ------------------------------------------------------------------ */

const RANGES: readonly DashboardRange[] = ["7d", "28d"];

export function DashboardHeader({ greeting, name, today, range }: { greeting: MessageKey; name: string; today: string; range: DashboardRange }) {
  const t = useT();
  const store = useStore();
  const pill = cn(buttonVariants({ variant: "outline", size: "lg" }), "rounded-full", FOCUS_RING, TOUCH);
  return (
    <header className="flex flex-col gap-5 pb-6 sm:flex-row sm:items-end sm:justify-between sm:pb-8">
      <div className="grid min-w-0 gap-1.5">
        <p className="text-[13px] text-muted-foreground">{today}</p>
        <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.02em] text-balance sm:text-[30px]">
          {t("shell.dash.title", { greeting: t(greeting), name })}
        </h1>
        <p className="text-sm text-pretty text-muted-foreground">{t("shell.dash.lead")}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {/* the KPI and funnel period: a link, so the server reads the other range (store time zone) */}
        <div role="group" aria-label={t("shell.dash.range")} className="inline-flex rounded-full bg-muted p-0.5 ring-1 ring-border ring-inset">
          {RANGES.map((r) => (
            <Link
              key={r}
              href={r === "7d" ? store.href("") : `${store.href("")}?range=${r}`}
              scroll={false}
              aria-current={r === range ? "true" : undefined}
              className={cn(
                "inline-flex h-9 min-w-16 items-center justify-center rounded-full px-3 text-[13px] font-medium tabular-nums transition-colors duration-[var(--dur-1)]",
                r === range ? "bg-card text-foreground shadow-xs ring-1 ring-border ring-inset" : "text-muted-foreground hover:text-foreground",
                FOCUS_RING,
                TOUCH,
              )}
            >
              {t(`shell.dash.range.${r}`)}
            </Link>
          ))}
        </div>
        {store.can("orders.read") && (
          <Link href={store.href("/orders")} className={cn(pill, "gap-2")}>
            <ReceiptTextIcon aria-hidden="true" />
            {t("shell.dash.orders")}
          </Link>
        )}
        {store.can("pages.write") && (
          <Link href={store.href("/generate")} className={cn(buttonVariants({ variant: "brand", size: "lg" }), "gap-2 rounded-full", FOCUS_RING, TOUCH)}>
            <SparklesIcon aria-hidden="true" />
            {t("shell.dash.generate")}
          </Link>
        )}
      </div>
    </header>
  );
}

/** A block's card: one surface, a quiet heading, the content. */
export function Block({ title, action, children, className }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn("grid min-w-0 content-start gap-4 rounded-[var(--r-card)] bg-card p-5 text-card-foreground ring-1 ring-border ring-inset", className)}>
      {(title || action) && (
        <div className="flex min-h-6 items-center justify-between gap-3">
          {title && <h2 className="text-[13px] font-medium text-muted-foreground">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* KPI tiles                                                           */
/* ------------------------------------------------------------------ */

export function KpiTiles({ tiles, currency }: { tiles: TileSpec[]; currency: string }) {
  const t = useT();
  const locale = useAdminLocale();
  const value = (tile: TileSpec): string => {
    if (tile.value === null) return "";
    if (tile.kind === "money") return formatMoney(tile.value / 100, currency, locale);
    if (tile.kind === "duration") return t("shell.dash.tile.minutes", { count: tile.value });
    return formatNumber(tile.value, locale, 0);
  };
  return (
    <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 xl:grid-cols-3">
      {tiles.map((tile, i) => (
        <div key={tile.id} data-tile={tile.id} className="adm-rise grid" style={{ ["--i" as string]: i }}>
          <KpiTile
            kind={tile.kind}
            label={t(tile.label.key, tile.label.vars)}
            value={value(tile)}
            hint={t(tile.hint.key, tile.hint.vars)}
            n={tile.n}
            spark={tile.spark}
            emphasis={tile.emphasis}
            delta={tile.delta ? { value: tile.delta.pct, period: t("shell.dash.tile.vs", { days: tile.delta.days }) } : undefined}
          />
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* funnel                                                              */
/* ------------------------------------------------------------------ */

export function Funnel({ steps, days }: { steps: FunnelStepSpec[]; days: number }) {
  const t = useT();
  return <FunnelChart steps={steps.map((s) => ({ id: s.id, label: t(s.label), value: s.value }))} period={t("shell.dash.funnel.period", { days })} />;
}

/* ------------------------------------------------------------------ */
/* work lists                                                          */
/* ------------------------------------------------------------------ */

/** The work lists as counters with "See all" into the saved view; the live pulse's counts win over the server's. */
export function WorkLists({ queue, sheet, title }: { queue: Panel<QueueCounts> | null; sheet: Panel<SheetHealth> | null; title: string }) {
  const t = useT();
  const store = useStore();
  const pulse = usePulse();
  const lines = workLines({ queue, pulse: pulse.body?.counts ?? null, sheet, can: store.can });
  if (!lines.length) return null;
  return (
    <Block title={title}>
      <ul className="-my-1 divide-y divide-border">
        {lines.map((line) => (
          <li key={line.id}>
            <Link
              href={store.href(line.path)}
              className={cn("group -mx-2 flex min-h-11 items-center justify-between gap-3 rounded-[var(--r-control)] px-2 py-2 transition-colors duration-[var(--dur-1)] hover:bg-muted", FOCUS_RING)}
            >
              <span className={cn("min-w-0 text-sm text-pretty", line.count === 0 ? "text-muted-foreground" : "text-foreground", NUM)}>{t(line.key, { count: line.count })}</span>
              <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground group-hover:text-foreground">
                {t("shell.dash.work.see_all")}
                <ArrowRightIcon aria-hidden="true" className="size-3.5 rtl:rotate-180" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Block>
  );
}

/* ------------------------------------------------------------------ */
/* address card (PD61, UX-05)                                          */
/* ------------------------------------------------------------------ */

const addressKey = (storeId: string, viewerId: string) => `sg:dash-address-hidden:${storeId}:${viewerId}`;

/** The address card after the first publish, until this viewer hides it (it stays on the pages list). */
export function DashboardAddress({ store: row, live, pageId }: { store: Pick<StoreRow, "id" | "handle" | "name" | "status">; live: boolean; pageId: string | null }) {
  const t = useT();
  const store = useStore();
  // hidden until the browser says otherwise: no flash of a card the viewer already dismissed
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = window.localStorage.getItem(addressKey(store.id, store.viewerId)) === "1";
    } catch {
      // storage blocked: the card shows
    }
    const timer = setTimeout(() => setHidden(dismissed), 0);
    return () => clearTimeout(timer);
  }, [store.id, store.viewerId]);
  if (hidden) return null;
  const hide = () => {
    try {
      window.localStorage.setItem(addressKey(store.id, store.viewerId), "1");
    } catch {
      // storage blocked: hidden for this visit only
    }
    setHidden(true);
  };
  const canPages = store.can("pages.write");
  return (
    <div className="relative">
      <AddressCard
        store={row}
        live={live}
        pageId={pageId}
        slots={canPages ? { testOrder: <TestOrderSlot pageId={pageId} live={live} />, campaign: <CampaignSlot /> } : undefined}
      />
      <Button type="button" variant="ghost" size="icon" onClick={hide} aria-label={t("shell.dash.address.hide")} title={t("shell.dash.address.hide")} className={cn("absolute end-2 top-2 text-muted-foreground", FOCUS_RING, TOUCH)}>
        <XIcon aria-hidden="true" />
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* integrations                                                        */
/* ------------------------------------------------------------------ */

const STATE_DOT: Record<IntegrationHealthRow["state"], string> = { ok: "bg-success", warn: "bg-warn", failing: "bg-destructive", off: "bg-muted-foreground/40" };

/** P5's rows as tiles in the Sheets tile's pattern; before P5 (rows unavailable), R1.0's Sheets tile alone. */
export function IntegrationTiles({ integrations, sheet, canSync, title }: { integrations: Panel<{ rows: IntegrationHealthRow[]; sheets: SheetsBacklog | null }>; sheet: Panel<SheetHealth>; canSync: boolean; title: string }) {
  const t = useT();
  const locale = useAdminLocale();
  const store = useStore();
  const rows = integrations.ok ? integrations.data.rows : [];
  const sheetsRow = rows.some((r) => r.kind === "sheets");
  const showSheet = sheet.ok && !sheetsRow;
  if (!rows.length && !showSheet) return null;
  return (
    <div className="grid content-start gap-3">
      {showSheet && <SheetHealthCard health={sheet.data} canSync={canSync} />}
      {rows.length > 0 && (
        <Block
          title={title}
          action={
            store.can("integrations.manage") ? (
              <Link href={store.href("/integrations/sheets")} className={cn("text-xs font-medium text-muted-foreground hover:text-foreground", FOCUS_RING)}>
                {t("shell.dash.integrations.manage")}
              </Link>
            ) : undefined
          }
        >
          <ul className="-my-1 divide-y divide-border">
            {rows.map((r) => (
              <li key={`${r.kind}:${r.targetId}`} data-kind={r.kind} data-state={r.state} className="flex items-center gap-3 py-2.5">
                <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", STATE_DOT[r.state])} />
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className="truncate text-sm text-foreground">{t(`shell.dash.integrations.kind.${r.kind}`)}</span>
                  <span className={cn("truncate text-xs text-muted-foreground", NUM)}>
                    {r.lastErrorKey && r.state !== "ok" ? t(r.lastErrorKey) : r.lastOkAt ? t("shell.dash.integrations.last_ok", { date: formatDay(r.lastOkAt, locale) }) : t("shell.dash.integrations.never")}
                  </span>
                </span>
                {r.backlog > 0 && <span className={cn("shrink-0 text-xs text-muted-foreground", NUM)}>{t("shell.dash.integrations.backlog", { count: r.backlog })}</span>}
                <span className="shrink-0 text-xs font-medium text-foreground/80">{t(`shell.dash.integrations.state.${r.state}`)}</span>
              </li>
            ))}
          </ul>
        </Block>
      )}
    </div>
  );
}
