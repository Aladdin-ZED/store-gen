"use client";
/**
 * The health strip (OPE-§28.1, §28.2): one tile per connected target (Google Sheets, each pixel's server events as
 * "Meta …1234", Telegram). The state is a word in its token colour, then the backlog, the oldest waiting age, the last
 * success and the last error in plain words (`int.cause.*`). Ids are isolated left to right inside RTL text.
 */
import { AlertCircleIcon, ArrowUpRightIcon, MessageCircleIcon, RadioTowerIcon, SheetIcon, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { HubTile } from "@/lib/integrations/hub.server";
import { useAdminLocale, useT } from "@/lib/i18n/admin/client";
import { cn } from "@/lib/utils";
import { useStore } from "../shell/store-context";
import { age, HEALTH_TONE, kindKey, num, platformName, relTime } from "./hub-format";
import { useNow } from "./hub-states";
import { StateBadge } from "./state-badge";

const ICON: Record<string, LucideIcon> = { sheets: SheetIcon, capi: RadioTowerIcon, telegram: MessageCircleIcon };
const PAGE: Record<string, `/${string}`> = { sheets: "/integrations/sheets", capi: "/integrations/pixels", telegram: "/integrations/telegram" };

export function HealthStrip({ tiles, now: serverNow, canOpen }: { tiles: HubTile[]; now: number; canOpen: boolean }) {
  const t = useT();
  return (
    <section aria-labelledby="int-health-title" className="grid gap-3">
      <h2 id="int-health-title" className="text-[0.95rem] font-semibold tracking-[-0.01em]">
        {t("int.health.title")}
      </h2>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {tiles.map((tile, i) => (
          <li key={`${tile.kind}:${tile.targetId}`} className="adm-rise" style={{ ["--i" as string]: i }}>
            <Tile tile={tile} serverNow={serverNow} canOpen={canOpen} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function Tile({ tile, serverNow, canOpen }: { tile: HubTile; serverNow: number; canOpen: boolean }) {
  const t = useT();
  const locale = useAdminLocale();
  const store = useStore();
  const now = useNow(serverNow);
  const Icon = ICON[tile.kind] ?? RadioTowerIcon;
  const tone = HEALTH_TONE[tile.state] ?? "neutral";
  const target =
    tile.kind === "capi" && tile.last4
      ? t("int.health.pixel", { platform: platformName(tile.platform), last4: tile.last4 })
      : tile.kind === "telegram" && tile.last4
        ? t("int.health.chat", { last4: tile.last4 })
        : null;
  const href = PAGE[tile.kind];

  return (
    <article className="adm-surface flex h-full flex-col gap-4 p-4 sm:p-5">
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-foreground/[0.05] text-foreground/70">
            <Icon className="size-4" aria-hidden="true" />
          </span>
          <div className="grid min-w-0">
            <h3 className="truncate text-sm font-semibold tracking-[-0.01em]">{t(kindKey(tile.kind))}</h3>
            {target && (
              <p className="truncate text-xs text-muted-foreground">
                <bdi className="font-mono tabular-nums">
                  {target}
                </bdi>
              </p>
            )}
          </div>
        </div>
        <StateBadge tone={tone} live={tile.state === "ok"}>
          {t(`int.health.state.${tile.state}`)}
        </StateBadge>
      </header>

      <dl className="grid grid-cols-3 divide-x divide-foreground/[0.07] rtl:divide-x-reverse">
        <Metric label={t("int.health.metric.waiting")} value={num(tile.backlog, locale)} warn={tile.backlog > 0 && tile.state !== "ok"} />
        <Metric label={t("int.health.metric.oldest")} value={tile.oldestPendingAt ? age(tile.oldestPendingAt, locale, now) : t("int.health.none")} muted={!tile.oldestPendingAt} />
        <Metric label={t("int.health.metric.lastOk")} value={tile.lastOkAt ? relTime(tile.lastOkAt, locale, now) : t("int.health.never")} muted={!tile.lastOkAt} />
      </dl>

      {(tile.lastErrorKey || (canOpen && href)) && (
        <footer className="mt-auto flex min-w-0 items-center justify-between gap-3 border-t border-foreground/[0.06] pt-3">
          {tile.lastErrorKey ? (
            <p className={cn("flex min-w-0 items-start gap-1.5 text-xs", tile.state === "failing" ? "text-destructive" : "text-muted-foreground")}>
              <AlertCircleIcon className="mt-px size-3.5 shrink-0" aria-hidden="true" />
              <span className="line-clamp-2">{t("int.health.lastError", { cause: t(tile.lastErrorKey) })}</span>
            </p>
          ) : (
            <span />
          )}
          {canOpen && href && (
            <Link
              href={store.href(href)}
              className="-my-2 inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-medium text-foreground/80 hover:bg-muted hover:text-foreground sm:min-h-8"
            >
              {t("int.health.open")}
              <ArrowUpRightIcon className="size-3.5 rtl:-scale-x-100" aria-hidden="true" />
            </Link>
          )}
        </footer>
      )}
    </article>
  );
}

function Metric({ label, value, warn = false, muted = false }: { label: string; value: string; warn?: boolean; muted?: boolean }) {
  return (
    <div className="grid min-w-0 gap-1 px-3 first:ps-0 last:pe-0">
      <dt className="truncate text-[0.7rem] font-medium text-muted-foreground">{label}</dt>
      <dd className={cn("truncate text-sm font-semibold tabular-nums", warn && "text-warn-ink", muted && "font-medium text-muted-foreground")} suppressHydrationWarning>
        {value}
      </dd>
    </div>
  );
}
