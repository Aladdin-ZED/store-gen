"use client";
/**
 * The deliveries log (`#deliveries`, OPE-§28.1): the store's outbox rows newest first, 100 per page and at most 10 pages
 * back, filtered by kind and state. A table on a desktop, two-line rows on a phone. A row is a masked summary (the
 * order id, the event, the amount; never a phone, a name or a sealed payload, OPE-§28.3 (4)); ids, times and pixel
 * targets are isolated left to right inside RTL text.
 *
 * Replay on dead rows, Send again on done Telegram rows, "Replay all dead of this kind" (≤ 50), for
 * `integrations.manage` outside "view as store" only. The list refreshes when the pulse's `syncFailed` changes: it
 * listens to the one poller of the browser (core D57, `BroadcastChannel("sg-pulse:<storeId>")`, P2) and never polls.
 */
import { ChevronDownIcon, Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { DeliveryRow } from "@/lib/integrations/deliveries";
import type { HubKind } from "@/lib/integrations/hub.server";
import { useAdminLocale, useT } from "@/lib/i18n/admin/client";
import { cn } from "@/lib/utils";
import { listDeliveriesAction } from "@/app/app/[store]/integrations/actions";
import { useStore } from "../shell/store-context";
import { usePulse } from "../shell/use-pulse";
import { clock, DELIVERY_TONE, money, num, platformName, relTime } from "./hub-format";
import { InlineError, useNow } from "./hub-states";
import { refusalText, ReplayAllButton, ReplayButton } from "./replay-button";
import { StateBadge } from "./state-badge";

type DeliveryState = DeliveryRow["state"];
const STATES: readonly DeliveryState[] = ["dead", "pending", "running", "done", "cancelled"];
const ALL = "all";

/** Telegram (R2: webhook) done rows may be sent again (core §H.1 rev 4); capi and mail never. */
const RESENDABLE = new Set(["telegram", "webhook"]);

export interface DeliveriesLimits {
  /** pages back (OPE-§L) */
  pages: number;
  /** rows per "Replay all" call */
  replayAll: number;
}

export function DeliveriesLog({
  initial,
  filters: opening,
  kinds,
  deadByKind,
  canReplay,
  limits,
  now: serverNow,
}: {
  initial: { rows: DeliveryRow[]; next: string | null } | null;
  /** the filters the page opened with (`?kind=…&state=…`) */
  filters: { kind?: HubKind; state?: DeliveryState };
  kinds: readonly HubKind[];
  deadByKind: Partial<Record<HubKind, number>> | null;
  canReplay: boolean;
  limits: DeliveriesLimits;
  now: number;
}) {
  const t = useT();
  const router = useRouter();
  const now = useNow(serverNow);
  const [kind, setKind] = useState<HubKind | typeof ALL>(opening.kind ?? ALL);
  const [state, setState] = useState<DeliveryState | typeof ALL>(opening.state ?? ALL);
  const [rows, setRows] = useState<DeliveryRow[]>(initial?.rows ?? []);
  const [next, setNext] = useState<string | null>(initial?.next ?? null);
  const [pages, setPages] = useState(1);
  const [error, setError] = useState<string | null>(initial ? null : t("int.deliveries.loadError"));
  const [loading, setLoading] = useState(false);
  const [queued, setQueued] = useState<ReadonlySet<string>>(new Set());
  const [, startRefresh] = useTransition();
  const filters = useRef({ kind, state });
  useEffect(() => {
    filters.current = { kind, state };
  }, [kind, state]);
  const seq = useRef(0);

  const load = useCallback(
    async (opts: { after?: string; kind: HubKind | typeof ALL; state: DeliveryState | typeof ALL }) => {
      const mine = ++seq.current;
      setLoading(true);
      try {
        const res = await listDeliveriesAction({
          ...(opts.kind !== ALL ? { kind: opts.kind } : {}),
          ...(opts.state !== ALL ? { state: opts.state } : {}),
          ...(opts.after ? { after: opts.after } : {}),
        });
        if (mine !== seq.current) return;
        if (!res.ok) {
          setError(refusalText(t, res));
          return;
        }
        setError(null);
        if (opts.after) {
          setRows((r) => [...r, ...res.data.rows.filter((x) => !r.some((y) => y.id === x.id))]);
          setPages((p) => p + 1);
        } else {
          setRows(res.data.rows);
          setPages(1);
          setQueued(new Set());
        }
        setNext(res.data.next);
      } catch {
        if (mine === seq.current) setError(t("int.deliveries.loadError"));
      } finally {
        if (mine === seq.current) setLoading(false);
      }
    },
    [t],
  );

  const refresh = useCallback(() => {
    void load({ ...filters.current });
    startRefresh(() => router.refresh());
  }, [load, router]);

  // the pulse's syncFailed changed: refresh the first page (P2's one poller per browser, core D57; no poll here, CCR r1-p5-15)
  const syncFailed = usePulse().body?.counts?.syncFailed;
  const lastSyncFailed = useRef<number | null>(null);
  useEffect(() => {
    if (typeof syncFailed !== "number") return;
    if (lastSyncFailed.current !== null && syncFailed !== lastSyncFailed.current) refresh();
    lastSyncFailed.current = syncFailed;
  }, [syncFailed, refresh]);

  const filtered = kind !== ALL || state !== ALL;
  const replayKinds = canReplay ? (kind === ALL ? kinds : [kind]).filter((k) => (deadByKind?.[k] ?? 0) > 0) : [];

  const mark = (id: string, on: boolean) =>
    setQueued((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });

  return (
    <section id="deliveries" aria-labelledby="int-deliveries-title" className="grid scroll-mt-24 gap-4">
      <header className="grid gap-1">
        <h2 id="int-deliveries-title" className="text-[0.95rem] font-semibold tracking-[-0.01em]">
          {t("int.deliveries.title")}
        </h2>
        <p className="max-w-[70ch] text-sm text-pretty text-muted-foreground">{t("int.deliveries.lead")}</p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={kind}
          onValueChange={(v) => {
            const k = v as HubKind | typeof ALL;
            setKind(k);
            void load({ kind: k, state });
          }}
        >
          <SelectTrigger aria-label={t("int.deliveries.filter.kind")} className="h-11 min-w-[9.5rem] max-sm:flex-1 sm:h-8">
            <SelectValue>{kind === ALL ? t("int.deliveries.filter.allKinds") : t(`int.deliveries.kind.${kind}`)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("int.deliveries.filter.allKinds")}</SelectItem>
            {kinds.map((k) => (
              <SelectItem key={k} value={k}>
                {t(`int.deliveries.kind.${k}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={state}
          onValueChange={(v) => {
            const s = v as DeliveryState | typeof ALL;
            setState(s);
            void load({ kind, state: s });
          }}
        >
          <SelectTrigger aria-label={t("int.deliveries.filter.state")} className="h-11 min-w-[9.5rem] max-sm:flex-1 sm:h-8">
            <SelectValue>{state === ALL ? t("int.deliveries.filter.allStates") : t(`int.deliveries.state.${state}`)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("int.deliveries.filter.allStates")}</SelectItem>
            {STATES.map((s) => (
              <SelectItem key={s} value={s}>
                {t(`int.deliveries.state.${s}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {loading && <Loader2Icon className="size-4 animate-spin text-muted-foreground" aria-label="…" />}
        {replayKinds.length > 0 && (
          <div className="flex flex-wrap gap-2 sm:ms-auto">
            {replayKinds.map((k) => (
              <ReplayAllButton key={k} kind={k} count={deadByKind?.[k] ?? 0} max={limits.replayAll} onDone={refresh} />
            ))}
          </div>
        )}
      </div>

      {error ? (
        <InlineError text={error} onRetry={() => void load({ kind, state })} />
      ) : rows.length === 0 ? (
        <EmptyRows text={filtered ? t("int.deliveries.filtered") : t("int.deliveries.empty")} />
      ) : (
        <>
          <DesktopTable rows={rows} queued={queued} canReplay={canReplay} now={now} onMark={mark} />
          <PhoneList rows={rows} queued={queued} canReplay={canReplay} now={now} onMark={mark} />
        </>
      )}

      {!error && rows.length > 0 && (next || pages >= limits.pages) && (
        <div className="flex justify-center">
          {next ? (
            <Button variant="ghost" className="h-11 sm:h-9" disabled={loading} onClick={() => void load({ kind, state, after: next })}>
              {t("int.deliveries.older")}
              <ChevronDownIcon aria-hidden="true" />
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">{t("int.deliveries.end")}</p>
          )}
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* rows                                                                */
/* ------------------------------------------------------------------ */

interface RowsProps {
  rows: DeliveryRow[];
  queued: ReadonlySet<string>;
  canReplay: boolean;
  now: number;
  onMark: (id: string, on: boolean) => void;
}

function useRowText() {
  const t = useT();
  const locale = useAdminLocale();
  const store = useStore();
  return {
    t,
    locale,
    when: (iso: string) => clock(iso, locale, store.timeZone),
    target: (r: DeliveryRow) => targetText(r, t),
    result: (r: DeliveryRow) => (r.lastErrorKey ? t(r.lastErrorKey) : r.lastStatus !== null ? t("int.deliveries.http", { status: r.lastStatus }) : null),
    amount: (r: DeliveryRow) => (r.summary.amountCents !== null ? money(r.summary.amountCents, store.currency, locale) : null),
  };
}

function targetText(r: DeliveryRow, t: (k: string, v?: Record<string, string | number>) => string): string | null {
  if (!r.target) return null;
  const [head, tail] = r.target.split(":");
  if (r.kind === "capi" && head && tail) return t("int.health.pixel", { platform: platformName(head), last4: tail });
  if (r.kind === "telegram" && tail) return t("int.health.chat", { last4: tail });
  return r.target;
}

function rowAction(r: DeliveryRow, queued: boolean, canReplay: boolean): "replay" | "sendAgain" | null {
  if (!canReplay || queued) return null;
  if (r.state === "dead") return "replay";
  if (r.state === "done" && RESENDABLE.has(r.kind)) return "sendAgain";
  return null;
}

function RowState({ r, queued }: { r: DeliveryRow; queued: boolean }) {
  const t = useT();
  const s = queued ? "queued" : r.state;
  return (
    <StateBadge tone={DELIVERY_TONE[s] ?? "neutral"} live={s === "running"}>
      {queued ? t("int.deliveries.queued") : t(`int.deliveries.state.${r.state}`)}
    </StateBadge>
  );
}

const Dash = () => <span className="text-muted-foreground/60">–</span>;

function DesktopTable({ rows, queued, canReplay, now, onMark }: RowsProps) {
  const x = useRowText();
  const { t, locale } = x;
  return (
    <div className="adm-surface adm-scroll hidden max-h-[44rem] overflow-auto md:block">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 bg-card">
          <tr className="text-[0.7rem] font-medium text-muted-foreground shadow-[inset_0_-1px_0_var(--border)]">
            <Th>{t("int.deliveries.col.when")}</Th>
            <Th>{t("int.deliveries.col.delivery")}</Th>
            <Th>{t("int.deliveries.col.target")}</Th>
            <Th>{t("int.deliveries.col.state")}</Th>
            <Th>{t("int.deliveries.col.attempts")}</Th>
            <Th>{t("int.deliveries.col.result")}</Th>
            <Th>{t("int.deliveries.col.order")}</Th>
            <th scope="col" className="w-px px-4 py-2.5">
              <span className="sr-only">{t("int.deliveries.replay")}</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-foreground/[0.05]">
          {rows.map((r) => {
            const q = queued.has(r.id);
            const action = rowAction(r, q, canReplay);
            const target = x.target(r);
            const result = x.result(r);
            const amount = x.amount(r);
            return (
              <tr key={r.id} className="align-middle transition-colors hover:bg-foreground/[0.02]">
                <td className="px-4 py-2.5 whitespace-nowrap text-foreground/80 tabular-nums" suppressHydrationWarning>
                  <bdi dir="ltr" suppressHydrationWarning>{x.when(r.at)}</bdi>
                </td>
                <td className="px-4 py-2.5">
                  <div className="grid leading-tight">
                    <span className="font-medium whitespace-nowrap">{t(`int.deliveries.kind.${r.kind}`)}</span>
                    <bdi dir="ltr" className="font-mono text-xs text-muted-foreground">
                      {r.summary.event ?? r.topic}
                    </bdi>
                  </div>
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap">{target ? <bdi className="font-mono text-xs">{target}</bdi> : <Dash />}</td>
                <td className="px-4 py-2.5">
                  <RowState r={r} queued={q} />
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap tabular-nums">
                  <div className="grid leading-tight">
                    <span>{num(r.attempts, locale)}</span>
                    {r.nextAt && !q && (
                      <span className="text-xs text-muted-foreground" suppressHydrationWarning>
                        {t("int.deliveries.nextIn", { when: relTime(r.nextAt, locale, now) })}
                      </span>
                    )}
                  </div>
                </td>
                <td className={cn("max-w-[16rem] px-4 py-2.5", r.state === "dead" ? "text-destructive" : "text-muted-foreground")}>
                  {result ? <span className="line-clamp-2 text-xs">{result}</span> : <Dash />}
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap">
                  {r.summary.orderId || amount ? (
                    <div className="grid leading-tight">
                      {r.summary.orderId ? <bdi dir="ltr" className="font-mono text-xs">{r.summary.orderId}</bdi> : <Dash />}
                      {amount && (
                        <bdi dir="ltr" className="text-xs text-muted-foreground tabular-nums">
                          {amount}
                        </bdi>
                      )}
                    </div>
                  ) : (
                    <Dash />
                  )}
                </td>
                <td className="px-4 py-2 text-end">
                  {action && <ReplayButton id={r.id} mode={action} onQueued={() => onMark(r.id, true)} onRollback={() => onMark(r.id, false)} />}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th scope="col" className="px-4 py-2.5 text-start font-medium whitespace-nowrap">
      {children}
    </th>
  );
}

function PhoneList({ rows, queued, canReplay, onMark }: RowsProps) {
  const x = useRowText();
  const { t } = x;
  return (
    <ul className="adm-surface divide-y divide-foreground/[0.06] md:hidden">
      {rows.map((r) => {
        const q = queued.has(r.id);
        const action = rowAction(r, q, canReplay);
        const result = x.result(r);
        const amount = x.amount(r);
        return (
          <li key={r.id} className="grid gap-2 px-4 py-3">
            <div className="flex min-w-0 items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <RowState r={r} queued={q} />
                <span className="truncate text-sm font-medium">
                  {t(`int.deliveries.kind.${r.kind}`)}{" "}
                  <bdi dir="ltr" className="font-mono text-xs font-normal text-muted-foreground">
                    {r.summary.event ?? r.topic}
                  </bdi>
                </span>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums" suppressHydrationWarning>
                <bdi dir="ltr" suppressHydrationWarning>{x.when(r.at)}</bdi>
              </span>
            </div>
            <div className="flex min-w-0 items-center justify-between gap-3">
              <p className="min-w-0 truncate text-xs text-muted-foreground">
                {r.summary.orderId && (
                  <bdi dir="ltr" className="font-mono text-foreground/80">
                    {r.summary.orderId}
                  </bdi>
                )}
                {amount && (
                  <>
                    {r.summary.orderId && " · "}
                    <bdi dir="ltr" className="tabular-nums">
                      {amount}
                    </bdi>
                  </>
                )}
                {result && (
                  <>
                    {(r.summary.orderId || amount) && " · "}
                    <span className={cn(r.state === "dead" && "text-destructive")}>{result}</span>
                  </>
                )}
                {!r.summary.orderId && !amount && !result && t("int.deliveries.attempts", { n: r.attempts })}
              </p>
              {action && <ReplayButton id={r.id} mode={action} className="shrink-0" onQueued={() => onMark(r.id, true)} onRollback={() => onMark(r.id, false)} />}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** No deliveries yet (or none under the filters): three quiet skeleton rows and one sentence. */
function EmptyRows({ text }: { text: string }) {
  return (
    <div className="adm-surface-flat grid gap-4 p-5">
      <div aria-hidden="true" className="grid gap-2.5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3" style={{ opacity: 1 - i * 0.28 }}>
            <div className="h-5 w-14 rounded-full bg-foreground/[0.06]" />
            <div className="h-3 w-28 rounded-full bg-foreground/[0.06]" />
            <div className="ms-auto h-3 w-16 rounded-full bg-foreground/[0.05]" />
          </div>
        ))}
      </div>
      <p className="text-sm text-pretty text-muted-foreground">{text}</p>
    </div>
  );
}

