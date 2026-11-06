"use client";
/**
 * The manager board `/app/<h>/queue/board` (P4 CALL CENTER; operations.md OPE-§14.1, OD33, OD38, OD44, OD54; core §I.6
 * data rules, §I.8). The server hands the first `BoardState`; from there the board polls
 * `GET /ops/state?view=board` every 15 s while the tab is visible, with `If-None-Match` (304 = nothing changed), and
 * says honestly how old its figures are ("Updated 12 s ago", a warning past 2 minutes).
 *
 *   tiles        each with its definition on hover; placed / confirmed / delivered never share a tile (OD38); a rate
 *                only from its minimum n ("needs 30"); First touch turns red above 0
 *   agents       presence as text + icon, the held order and since when, today's figures, first-call p50 (n ≥ 20),
 *                cap use; Assign orders (the to-call view, where the bulk bar assigns) and Release current order
 *   sheet        "Agents named in your sheet" with Map to a member… (only when such labels exist; a mapped label
 *                leaves this table and shows on the agent)
 *   best hours   24 cells of the store day, jade by contact rate, grey "needs 30" under 30 attempts (OD44)
 */
import "./queue.css";
import { CircleDotIcon, CoffeeIcon, InfoIcon, Loader2Icon, MoonIcon, RefreshCwIcon, UserPlusIcon, UsersRoundIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { assignOrderAction } from "@/app/app/[store]/orders/actions";
import { mapAgentLabelAction } from "@/app/app/[store]/team/agents/actions";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { BoardAgentRow, BoardState, BestHourCell } from "@/lib/callcenter/board.server";
import type { MessageKey } from "@/lib/i18n/admin";
import { useAdminLocale, useT } from "@/lib/i18n/admin/client";
import type { Kpi } from "@/lib/orders/profile";
import { cn } from "@/lib/utils";
import { settle } from "../orders/ops-ui";
import { EmptyTable } from "./empty-table";
import { opsPath } from "./outbox";
import { QSheet } from "./sheet";
import { ago, clock, num, pct, ymdLabel } from "./time";

const POLL_MS = 15_000;
const STALE_MS = 120_000;

export interface BoardMember {
  userId: string;
  name: string;
}

export function Board({
  initial,
  handle,
  tz,
  members,
  perms,
  hrefs,
}: {
  initial: BoardState;
  handle: string;
  tz: string;
  /** the call takers a sheet label can map to */
  members: BoardMember[];
  perms: { configure: boolean; assign: boolean; readOnly: boolean };
  hrefs: { toCall: string; team: string; orders: string };
}) {
  const t = useT();
  const [state, setState] = useState(initial);
  const [fetchedAt, setFetchedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const etag = useRef<string | null>(null);

  const poll = useCallback(
    async (force = false) => {
      if (!force && document.visibilityState !== "visible") return;
      try {
        const res = await fetch(`${opsPath(handle, "state")}?view=board`, { headers: etag.current && !force ? { "If-None-Match": etag.current } : {}, credentials: "same-origin", cache: "no-store" });
        if (res.status === 304) {
          setFetchedAt(Date.now());
          setFailed(false);
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        etag.current = res.headers.get("ETag");
        setState((await res.json()) as BoardState);
        setFetchedAt(Date.now());
        setFailed(false);
      } catch {
        setFailed(true);
      }
    },
    [handle],
  );

  useEffect(() => {
    const id = setInterval(() => void poll(), POLL_MS);
    const tick = setInterval(() => setNow(Date.now()), 1_000);
    const onVis = () => document.visibilityState === "visible" && void poll();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [poll]);

  const refresh = async () => {
    setBusy(true);
    await poll(true);
    setBusy(false);
  };

  const age = Math.max(0, now - Math.min(fetchedAt, Date.parse(state.computedAt) || fetchedAt));
  const stale = age > STALE_MS;

  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className={cn("q-xs inline-flex items-center gap-1.5", stale ? "font-medium text-destructive" : "text-muted-foreground")} aria-live="polite">
          <span className={cn("size-1.5 rounded-full", stale ? "bg-destructive" : "bg-emerald-500")} aria-hidden="true" />
          {stale ? t("ops.board.stale", { minutes: Math.floor(age / 60_000) }) : age < 3_000 ? t("ops.board.updated.now") : t("ops.board.updated", { seconds: Math.floor(age / 1_000) })}
        </span>
        <Button variant="ghost" size="sm" onClick={() => void refresh()} disabled={busy} className="h-7 gap-1.5 px-2 text-xs text-muted-foreground">
          <RefreshCwIcon className={cn("size-3.5", busy && "animate-spin")} aria-hidden="true" />
          {t("ops.board.refresh")}
        </Button>
        {failed && !stale && <span className="q-xs text-muted-foreground">{t("ops.board.pollFailed")}</span>}
      </div>

      <Tiles state={state} now={now} />

      <AgentsTable agents={state.agents} perms={perms} hrefs={hrefs} tz={tz} onChanged={() => void poll(true)} />

      {state.sheetAgents.length > 0 && <SheetAgents rows={state.sheetAgents} members={members} canMap={perms.configure && !perms.readOnly} onChanged={() => void poll(true)} />}

      <BestHours cells={state.bestHours} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* tiles                                                               */
/* ------------------------------------------------------------------ */

function Tiles({ state, now }: { state: BoardState; now: number }) {
  const t = useT();
  const locale = useAdminLocale();
  const c = state.tiles;
  const abandoners = state.agents.filter((a) => a.abandoned > 0).map((a) => a.name);
  const rate = c.confirmationRateToday;
  const tiles: { id: string; label: MessageKey; hint: MessageKey; value: number; sub?: string; tone?: "danger"; hintVars?: Record<string, string | number> }[] = [
    { id: "to_call", label: "ops.tile.to_call", hint: "ops.tile.to_call.hint", value: c.toCallNow },
    {
      id: "callbacks",
      label: "ops.tile.callbacks",
      hint: "ops.tile.callbacks.hint",
      value: c.callbacksDue,
      ...(c.oldestCallbackOverdueMin !== null && c.oldestCallbackOverdueMin > 0 ? { sub: t("ops.tile.sub.late", { minutes: num(c.oldestCallbackOverdueMin, locale) }) } : {}),
    },
    { id: "retry", label: "ops.tile.retry", hint: "ops.tile.retry.hint", value: c.waitingRetry },
    { id: "first_touch", label: "ops.tile.first_touch", hint: "ops.tile.first_touch.hint", value: c.firstTouchBreaches, ...(c.firstTouchBreaches > 0 ? { tone: "danger" as const } : {}) },
    { id: "confirmed_today", label: "ops.tile.confirmed_today", hint: "ops.tile.confirmed_today.hint", value: c.confirmedToday },
    {
      id: "decided_today",
      label: "ops.tile.decided_today",
      hint: "ops.tile.decided_today.hint",
      hintVars: { min: rate.min },
      value: c.decidedToday,
      sub: "value" in rate ? t("ops.tile.sub.rate", { rate: pct(rate.value, locale), n: num(rate.n, locale) }) : t("ops.tile.needs", { min: rate.min }),
    },
    {
      id: "abandoned_today",
      label: "ops.tile.abandoned_today",
      hint: "ops.tile.abandoned_today.hint",
      value: c.abandonedToday,
      ...(abandoners.length ? { sub: t("ops.tile.sub.by", { names: abandoners.slice(0, 3).join(", ") + (abandoners.length > 3 ? "…" : "") }) } : {}),
    },
    {
      id: "delivery_problems",
      label: "ops.tile.delivery_problems",
      hint: "ops.tile.delivery_problems.hint",
      value: c.deliveryRescue,
      ...(c.oldestRescueMin !== null ? { sub: t("ops.tile.sub.oldest", { age: ago(now - c.oldestRescueMin * 60_000, now, locale) }) } : {}),
    },
    { id: "to_ship", label: "ops.tile.to_ship", hint: "ops.tile.to_ship.hint", value: c.toShip, ...(c.oldestToShipDays !== null && c.toShip > 0 ? { sub: t("ops.tile.sub.oldest_days", { days: num(c.oldestToShipDays, locale) }) } : {}) },
    { id: "on_hold", label: "ops.tile.on_hold", hint: "ops.tile.on_hold.hint", value: c.holds, ...(c.nextHoldDay ? { sub: t("ops.tile.sub.next", { day: ymdLabel(c.nextHoldDay, locale) }) } : {}) },
  ];
  return (
    <section aria-labelledby="board-tiles">
      <h2 id="board-tiles" className="sr-only">
        {t("ops.board.tiles")}
      </h2>
      <ul className="grid grid-cols-2 gap-px overflow-hidden rounded-[18px] border border-border bg-border sm:grid-cols-3 lg:grid-cols-5">
        {tiles.map((x) => (
          <li key={x.id} className="bg-card">
            <Tooltip>
              <TooltipTrigger asChild>
                <div tabIndex={0} data-tone={x.tone} className="group grid h-full min-h-[104px] content-start gap-1 px-4 py-3.5 outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset">
                  <span className="q-xs flex items-center gap-1 text-muted-foreground">
                    <span className="truncate">{t(x.label)}</span>
                    <InfoIcon className="size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-60 group-focus-visible:opacity-60" aria-hidden="true" />
                  </span>
                  <span className={cn("q-num text-[1.75rem] leading-none font-semibold", x.tone === "danger" ? "text-destructive" : "text-foreground")}>{num(x.value, locale)}</span>
                  {x.sub && <span className="q-2xs q-num truncate text-muted-foreground">{x.sub}</span>}
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-64 text-pretty">
                {t(x.hint, x.hintVars)}
              </TooltipContent>
            </Tooltip>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* agents                                                              */
/* ------------------------------------------------------------------ */

function PresenceText({ a }: { a: Pick<BoardAgentRow, "presence" | "live"> }) {
  const t = useT();
  const p = a.presence === "online" && !a.live ? "offline" : a.presence;
  const Icon = p === "online" ? CircleDotIcon : p === "break" ? CoffeeIcon : MoonIcon;
  return (
    <span className={cn("q-xs inline-flex items-center gap-1.5 whitespace-nowrap", p === "online" ? "text-emerald-700 dark:text-emerald-300" : "text-muted-foreground")}>
      <Icon className="size-3.5" aria-hidden="true" />
      {t(`ops.board.agent.presence.${p}`)}
    </span>
  );
}

function kpiText(k: Kpi, fmt: (v: number) => string, t: ReturnType<typeof useT>, locale: string): ReactNode {
  if (!("value" in k)) return <span className="text-muted-foreground">{t("ops.counter.needs", { min: k.min })}</span>;
  return (
    <>
      <bdi dir="ltr" className="font-medium text-foreground">
        {fmt(k.value)}
      </bdi>{" "}
      <span className="text-muted-foreground">· {t("ops.counter.n", { n: new Intl.NumberFormat(`${locale}-u-nu-latn`).format(k.n) })}</span>
    </>
  );
}

function AgentsTable({
  agents,
  perms,
  hrefs,
  tz,
  onChanged,
}: {
  agents: BoardAgentRow[];
  perms: { assign: boolean; readOnly: boolean };
  hrefs: { toCall: string; team: string; orders: string };
  tz: string;
  onChanged: () => void;
}) {
  const t = useT();
  const locale = useAdminLocale();
  const [releasing, setReleasing] = useState<string | null>(null);
  const release = async (orderId: string) => {
    setReleasing(orderId);
    const res = await settle(assignOrderAction(orderId, null));
    setReleasing(null);
    if (!res.ok) toast.error(t(`ops.error.${res.error}` as MessageKey) === `ops.error.${res.error}` ? t("ops.error.generic") : t(`ops.error.${res.error}` as MessageKey));
    else {
      toast.success(t("ops.board.released"));
      onChanged();
    }
  };
  const minutes = (v: number) => t("ops.me.min", { v: num(Math.round(v), locale) });
  const canAct = perms.assign && !perms.readOnly;

  return (
    <section aria-labelledby="board-agents" className="grid gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="board-agents" className="q-md font-semibold text-foreground">
          {t("ops.board.agents")}
        </h2>
        <span className="q-xs text-muted-foreground">{t("ops.board.liveCount", { live: num(agents.filter((a) => a.live).length, locale), total: num(agents.length, locale) })}</span>
      </div>
      {agents.length === 0 ? (
        <EmptyTable
          cols={6}
          text={t("ops.board.empty")}
          action={
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <Link href={hrefs.team}>
                <UserPlusIcon className="size-4" aria-hidden="true" />
                {t("ops.board.invite")}
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-[18px] border border-border bg-card">
          {/* desktop: one line per agent */}
          <table className="hidden w-full text-start text-sm md:table">
            <thead>
              <tr className="q-2xs border-b border-border text-muted-foreground [&>th]:px-3 [&>th]:py-2.5 [&>th]:text-start [&>th]:font-medium">
                <th>{t("ops.board.col.agent")}</th>
                <th>{t("ops.board.col.current")}</th>
                <th className="!text-end">{t("ops.board.col.decided")}</th>
                <th className="!text-end">{t("ops.board.col.confirmed")}</th>
                <th className="!text-end">{t("ops.board.col.attempts")}</th>
                <th className="!text-end">{t("ops.board.col.reveals")}</th>
                <th className="!text-end">{t("ops.board.col.abandoned")}</th>
                <th className="!text-end">{t("ops.board.col.skipped")}</th>
                <th className="!text-end">{t("ops.board.col.lookups")}</th>
                <th>{t("ops.board.col.first_touch")}</th>
                <th>{t("ops.board.col.cap")}</th>
                {canAct && <th className="w-0" />}
              </tr>
            </thead>
            <tbody className="q-num">
              {agents.map((a) => (
                <tr key={a.userId} className="border-b border-border/70 last:border-0 [&>td]:px-3 [&>td]:py-2.5">
                  <td>
                    <div className="grid gap-0.5">
                      <span className="font-medium text-foreground">{a.name}</span>
                      <PresenceText a={a} />
                    </div>
                  </td>
                  <td className="q-xs">
                    {a.current ? (
                      <span className="grid gap-0.5">
                        <Link href={`${hrefs.orders}?order=${a.current.orderId}`} className="font-mono text-foreground hover:underline">
                          {a.current.orderId}
                        </Link>
                        <span className="text-muted-foreground">{t("ops.board.since", { time: clock(a.current.since, tz, locale) })}</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">{t("ops.board.agent.idle")}</span>
                    )}
                  </td>
                  <td className="text-end">{num(a.decided, locale)}</td>
                  <td className="text-end">{num(a.confirmed, locale)}</td>
                  <td className="text-end">{num(a.attempts, locale)}</td>
                  <td className="text-end">{num(a.reveals, locale)}</td>
                  <td className="text-end">{num(a.abandoned, locale)}</td>
                  <td className="text-end">{num(a.skipped, locale)}</td>
                  <td className="text-end">{num(a.lookupsHour, locale)}</td>
                  <td className="q-xs whitespace-nowrap">{kpiText(a.firstTouchP50Min, minutes, t, locale)}</td>
                  <td className="q-xs whitespace-nowrap">
                    <CapUse used={a.decided} cap={a.dailyCap} />
                  </td>
                  {canAct && (
                    <td>
                      <RowActions a={a} hrefs={hrefs} releasing={releasing} onRelease={release} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {/* phone: two lines per agent */}
          <ul className="divide-y divide-border md:hidden">
            {agents.map((a) => (
              <li key={a.userId} className="grid gap-2 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate font-medium text-foreground">{a.name}</span>
                  <PresenceText a={a} />
                </div>
                <p className="q-xs q-num text-muted-foreground">
                  {t("ops.board.phoneLine", { decided: num(a.decided, locale), confirmed: num(a.confirmed, locale), attempts: num(a.attempts, locale) })}
                  {a.current && (
                    <>
                      {" · "}
                      <Link href={`${hrefs.orders}?order=${a.current.orderId}`} className="font-mono text-foreground">
                        {a.current.orderId}
                      </Link>
                    </>
                  )}
                </p>
                {canAct && (
                  <div className="flex flex-wrap gap-2">
                    <RowActions a={a} hrefs={hrefs} releasing={releasing} onRelease={release} inline />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function CapUse({ used, cap }: { used: number; cap: number | null }) {
  const t = useT();
  const locale = useAdminLocale();
  if (cap === null) return <span className="text-muted-foreground">{t("ops.board.cap.none")}</span>;
  const share = Math.min(1, used / Math.max(1, cap));
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-1.5 w-12 overflow-hidden rounded-full bg-foreground/[0.07]" aria-hidden="true">
        <span className={cn("block h-full rounded-full", share >= 1 ? "bg-destructive" : "bg-foreground/45")} style={{ inlineSize: `${share * 100}%` }} />
      </span>
      <bdi dir="ltr">{t("ops.board.cap.of", { used: num(used, locale), cap: num(cap, locale) })}</bdi>
    </span>
  );
}

function RowActions({
  a,
  hrefs,
  releasing,
  onRelease,
  inline,
}: {
  a: BoardAgentRow;
  hrefs: { toCall: string };
  releasing: string | null;
  onRelease: (orderId: string) => void;
  inline?: boolean;
}) {
  const t = useT();
  return (
    <span className={cn("flex items-center gap-1", !inline && "justify-end")}>
      <Button asChild variant="ghost" size="sm" className="h-8 px-2.5 text-xs whitespace-nowrap">
        <Link href={hrefs.toCall}>{t("ops.board.action.assign")}</Link>
      </Button>
      {a.current && (
        <Button variant="ghost" size="sm" className="h-8 px-2.5 text-xs whitespace-nowrap" disabled={releasing === a.current.orderId} onClick={() => onRelease(a.current!.orderId)}>
          {releasing === a.current.orderId && <Loader2Icon className="size-3.5 animate-spin" aria-hidden="true" />}
          {t("ops.board.action.release")}
        </Button>
      )}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* sheet agents (OD54)                                                 */
/* ------------------------------------------------------------------ */

function SheetAgents({ rows, members, canMap, onChanged }: { rows: BoardState["sheetAgents"]; members: BoardMember[]; canMap: boolean; onChanged: () => void }) {
  const t = useT();
  const locale = useAdminLocale();
  const [label, setLabel] = useState<string | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const map = async () => {
    if (!label || !pick) return;
    setSaving(true);
    const res = await settle<{ label: string; userId: string }>(mapAgentLabelAction(label, pick));
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error === "limit" ? t("ops.board.labels_limit") : t("ops.error.generic"));
      return;
    }
    toast.success(t("ops.board.sheet.mapped", { member: members.find((m) => m.userId === pick)?.name ?? "" }));
    setLabel(null);
    setPick(null);
    onChanged();
  };
  return (
    <section aria-labelledby="board-sheet" className="grid gap-3">
      <div className="grid gap-1">
        <h2 id="board-sheet" className="q-md font-semibold text-foreground">
          {t("ops.board.sheet.title")}
        </h2>
        <p className="q-sm max-w-prose text-muted-foreground">{t("ops.board.sheet.hint")}</p>
      </div>
      <ul className="divide-y divide-border overflow-hidden rounded-[18px] border border-border bg-card">
        {rows.map((r) => (
          <li key={r.label} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3">
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <UsersRoundIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <bdi className="truncate font-medium text-foreground">{r.label}</bdi>
            </span>
            <span className="q-xs q-num text-muted-foreground">{t("ops.board.sheet.line", { decided: num(r.decided, locale), confirmed: num(r.confirmed, locale) })}</span>
            <span className="q-xs q-num">{kpiText(r.confirmationRate, (v) => pct(v, locale), t, locale)}</span>
            {canMap && (
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setLabel(r.label)}>
                {t("ops.board.sheet.map")}
              </Button>
            )}
          </li>
        ))}
      </ul>
      <QSheet open={label !== null} onOpenChange={(o) => !o && setLabel(null)} title={t("ops.board.sheet.map")} description={t("ops.board.sheet.pick", { label: label ?? "" })}>
        <div className="grid gap-2 p-4 sm:p-5">
          {members.length === 0 ? (
            <p className="q-sm text-muted-foreground">{t("ops.board.empty")}</p>
          ) : (
            <div role="radiogroup" aria-label={t("ops.board.sheet.map")} className="grid max-h-[50dvh] gap-1 overflow-y-auto">
              {members.map((m) => (
                <button
                  key={m.userId}
                  type="button"
                  role="radio"
                  aria-checked={pick === m.userId}
                  onClick={() => setPick(m.userId)}
                  className={cn(
                    "flex min-h-11 items-center justify-between gap-3 rounded-xl px-3 text-start text-sm transition-colors",
                    pick === m.userId ? "bg-foreground/[0.06] font-medium text-foreground ring-1 ring-foreground/20 ring-inset" : "text-foreground/85 hover:bg-foreground/[0.04]",
                  )}
                >
                  {m.name}
                  <span className={cn("size-3.5 rounded-full border", pick === m.userId ? "border-[5px] border-foreground" : "border-foreground/30")} aria-hidden="true" />
                </button>
              ))}
            </div>
          )}
          <Button className="mt-2 h-11" disabled={!pick || saving} onClick={() => void map()}>
            {saving && <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />}
            {t("ops.board.sheet.confirm")}
          </Button>
        </div>
      </QSheet>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* best hours (OD44)                                                   */
/* ------------------------------------------------------------------ */

/** jade: hue 165, lighter → deeper with the rate (never orange) */
const jade = (rate: number) => `oklch(${(0.93 - rate * 0.38).toFixed(3)} ${(0.05 + rate * 0.09).toFixed(3)} 165)`;

export function BestHours({ cells }: { cells: BestHourCell[] }) {
  const t = useT();
  const locale = useAdminLocale();
  const byHour = new Map(cells.map((c) => [c.hour, c]));
  const hours = Array.from({ length: 24 }, (_, h) => h);
  const any = cells.some((c) => c.inWindow);
  return (
    <section aria-labelledby="board-best" className="grid gap-3">
      <div className="grid gap-1">
        <h2 id="board-best" className="q-md font-semibold text-foreground">
          {t("ops.board.best.title")}
        </h2>
        <p className="q-sm max-w-prose text-muted-foreground">{t("ops.board.best.hint")}</p>
      </div>
      <div className="rounded-[18px] border border-border bg-card p-4">
        <ol className="grid grid-cols-12 gap-1 md:grid-cols-24" dir="ltr">
          {hours.map((h) => {
            const c = byHour.get(h);
            const inWindow = !!c?.inWindow;
            const rate = c && "value" in c.contactRate ? c.contactRate.value : null;
            const label = !inWindow
              ? t("ops.board.best.outside", { hour: h })
              : rate !== null
                ? t("ops.board.best.cell", { hour: h, rate: pct(rate, locale), n: num(c!.contactRate.n, locale) })
                : t("ops.board.best.needs", { hour: h });
            return (
              <li key={h} className="grid gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      tabIndex={inWindow ? 0 : -1}
                      aria-label={label}
                      className={cn(
                        "block h-9 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                        !inWindow && "bg-[repeating-linear-gradient(135deg,transparent_0_4px,color-mix(in_oklab,var(--foreground)_6%,transparent)_4px_5px)]",
                        inWindow && rate === null && "bg-foreground/[0.08]",
                      )}
                      style={inWindow && rate !== null ? { background: jade(rate) } : undefined}
                    />
                  </TooltipTrigger>
                  <TooltipContent side="top">{label}</TooltipContent>
                </Tooltip>
                <span className="q-2xs q-num text-center text-muted-foreground">{h % 3 === 0 ? h : ""}</span>
              </li>
            );
          })}
        </ol>
        <div className="q-2xs mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-14 rounded-full" style={{ background: `linear-gradient(to right, ${jade(0.1)}, ${jade(0.9)})` }} aria-hidden="true" />
            {t("ops.board.best.legend")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-foreground/[0.08]" aria-hidden="true" />
            {t("ops.board.best.legendNeeds")}
          </span>
          {!any && <span>{t("ops.board.best.noWindow")}</span>}
        </div>
      </div>
    </section>
  );
}
