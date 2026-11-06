"use client";
/**
 * `CallingWindowEditor`, the store's one hours editor (P4 CALL CENTER; operations.md OPE-§5.5, OD9, OD57, OD63, OPS-28;
 * core D73). `/team/callcenter` mounts it, and P3's "After the order" card imports it with the same props (LAN-§8.4):
 *
 *   { window: EffectiveWindow; canEdit: boolean; compact?: boolean; onSaved?(w: EffectiveWindow): void }
 *
 * ISO weekdays 1-7, Monday first, day names from Intl in the viewer's language; ≤ 3 HH:MM ranges a day (a range that
 * ends before it starts crosses midnight and belongs to its start day); ≤ 60 closed dates; the store time zone named;
 * a live "Today" line from `hoursText`. While the window was never confirmed (`configured: false`) it says these are
 * starting hours and offers "Use these hours", a save that sets `savedAt` (the only thing that lets a page promise an
 * hour). Saves go through `saveCallingWindowAction`, which writes `ops.callingWindow` and nothing else.
 *
 * `WeekTable` is the seven-day table alone; the dated schedules (overrides) reuse it.
 */
import "../queue/queue.css";
import { CheckIcon, CopyIcon, Loader2Icon, MoonIcon, PlusIcon, XIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveCallingWindowAction } from "@/lib/callcenter/window-actions";
import { hoursText, type EffectiveWindow, type IsoWeekday, type Range } from "@/lib/callcenter/window";
import { useAdminLocale, useT } from "@/lib/i18n/admin/client";
import { cn } from "@/lib/utils";
import { settle } from "../orders/ops-ui";

export const WEEKDAYS: readonly IsoWeekday[] = [1, 2, 3, 4, 5, 6, 7];
const MAX_RANGES = 3;
const MAX_CLOSED = 60;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export type WeekDays = Record<IsoWeekday, Range[]>;

/** "Monday" … "Sunday" in the viewer's language (2024-01-01 was a Monday). */
export function weekdayNames(locale: string, style: "long" | "short" = "long"): Record<IsoWeekday, string> {
  const f = new Intl.DateTimeFormat(locale, { weekday: style, timeZone: "UTC" });
  return Object.fromEntries(WEEKDAYS.map((d) => [d, f.format(new Date(Date.UTC(2024, 0, d)))])) as Record<IsoWeekday, string>;
}

const rangeError = (r: Range) => !HHMM.test(r.from) || !HHMM.test(r.to) || r.from === r.to;
export const weekValid = (days: WeekDays) => WEEKDAYS.every((d) => days[d].length <= MAX_RANGES && days[d].every((r) => !rangeError(r)));
const sameWeek = (a: WeekDays, b: WeekDays) => JSON.stringify(a) === JSON.stringify(b);
export const cloneWeek = (w: WeekDays): WeekDays => Object.fromEntries(WEEKDAYS.map((d) => [d, w[d].map((r) => ({ ...r }))])) as WeekDays;

/** The seven-day table (see the header). */
export function WeekTable({ days, onChange, disabled, compact, idPrefix }: { days: WeekDays; onChange: (d: WeekDays) => void; disabled: boolean; compact?: boolean; idPrefix: string }) {
  const t = useT();
  const locale = useAdminLocale();
  const names = useMemo(() => weekdayNames(locale), [locale]);
  const set = (d: IsoWeekday, list: Range[]) => onChange({ ...days, [d]: list });
  return (
    <ol className="grid divide-y divide-border/70">
      {WEEKDAYS.map((d) => {
        const list = days[d];
        return (
          <li key={d} className={cn("grid gap-2 sm:items-start", compact ? "py-2 sm:grid-cols-[9.5rem_1fr]" : "py-2.5 sm:grid-cols-[11rem_1fr]")}>
            <div className="flex min-h-9 flex-wrap items-center justify-between gap-x-2 sm:flex-col sm:items-start sm:justify-center sm:gap-0.5">
              <span className="q-sm font-medium text-foreground">{names[d]}</span>
              {!disabled && d === 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="q-xs h-auto min-h-7 gap-1 px-1.5 py-1 text-start whitespace-normal text-muted-foreground sm:-ms-1.5"
                  onClick={() => onChange(Object.fromEntries(WEEKDAYS.map((x) => [x, list.map((r) => ({ ...r }))])) as WeekDays)}
                >
                  <CopyIcon className="size-3.5 shrink-0" aria-hidden="true" />
                  {t("ops.cc.window.copyAll", { day: names[1] })}
                </Button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {list.length === 0 && <span className="q-sm inline-flex h-9 items-center text-muted-foreground">{t("ops.cc.window.closed")}</span>}
              {list.map((r, i) => {
                const crosses = HHMM.test(r.from) && HHMM.test(r.to) && r.to < r.from;
                const bad = rangeError(r);
                const id = `${idPrefix}-${d}-${i}`;
                return (
                  <div key={i} className={cn("flex items-center gap-1 rounded-[10px] border bg-background ps-1 pe-0.5", bad ? "border-destructive/60" : "border-border")}>
                    <label htmlFor={`${id}-f`} className="sr-only">
                      {t("ops.cc.window.from")}
                    </label>
                    <Input
                      id={`${id}-f`}
                      type="time"
                      step={60}
                      value={r.from}
                      disabled={disabled}
                      onChange={(e) => set(d, list.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)))}
                      className="q-num h-8 w-[7.5rem] border-0 bg-transparent px-1.5 shadow-none focus-visible:ring-0"
                      dir="ltr"
                    />
                    <span className="text-muted-foreground" aria-hidden="true">
                      –
                    </span>
                    <label htmlFor={`${id}-t`} className="sr-only">
                      {t("ops.cc.window.to")}
                    </label>
                    <Input
                      id={`${id}-t`}
                      type="time"
                      step={60}
                      value={r.to}
                      disabled={disabled}
                      aria-invalid={bad || undefined}
                      onChange={(e) => set(d, list.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)))}
                      className="q-num h-8 w-[7.5rem] border-0 bg-transparent px-1.5 shadow-none focus-visible:ring-0"
                      dir="ltr"
                    />
                    {crosses && (
                      <span className="q-2xs inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                        <MoonIcon className="size-3" aria-hidden="true" />
                        {t("ops.cc.window.nextDay")}
                      </span>
                    )}
                    {!disabled && (
                      <Button type="button" variant="ghost" size="icon" className="size-7 text-muted-foreground" aria-label={t("ops.cc.window.removeRange")} onClick={() => set(d, list.filter((_, j) => j !== i))}>
                        <XIcon className="size-3.5" aria-hidden="true" />
                      </Button>
                    )}
                  </div>
                );
              })}
              {!disabled && list.length < MAX_RANGES && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-9 gap-1 text-muted-foreground"
                  onClick={() => set(d, [...list, list.length ? { from: list[list.length - 1]!.to, to: "21:00" } : { from: "09:30", to: "13:00" }])}
                >
                  <PlusIcon className="size-3.5" aria-hidden="true" />
                  {t("ops.cc.window.addRange")}
                </Button>
              )}
              {list.some(rangeError) && (
                <span role="alert" className="q-xs basis-full text-destructive">
                  {t("ops.cc.window.sameTime")}
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

const noSubscribe = () => () => {};

/** The calling-window editor (see the header). */
export function CallingWindowEditor({ window: w, canEdit, compact, onSaved }: { window: EffectiveWindow; canEdit: boolean; compact?: boolean; onSaved?(w: EffectiveWindow): void }) {
  const t = useT();
  const locale = useAdminLocale();
  const router = useRouter();
  const uid = useId();
  const [days, setDays] = useState<WeekDays>(() => cloneWeek(w.days));
  const [closed, setClosed] = useState<string[]>(() => [...w.closedDates]);
  const [newDate, setNewDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [configured, setConfigured] = useState(w.configured);
  const [base, setBase] = useState(() => ({ days: cloneWeek(w.days), closed: [...w.closedDates] }));

  const dirty = !sameWeek(days, base.days) || closed.join() !== base.closed.join();
  const valid = weekValid(days);
  const draft: EffectiveWindow = { ...w, days, closedDates: closed, configured };
  // The Today line reads the clock, so it renders after mount only (a server render a minute earlier would not hydrate).
  const mounted = useSyncExternalStore(noSubscribe, () => true, () => false);
  const today = useMemo(() => {
    if (!mounted) return null;
    try {
      return hoursText(draft, locale, locale, new Date());
    } catch {
      return "";
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, closed, locale, mounted]);

  async function save() {
    if (!valid || busy) return;
    setBusy(true);
    const res = await settle<{ savedAt: string }>(saveCallingWindowAction({ days, closedDates: closed }));
    setBusy(false);
    if (!res.ok) {
      toast.error(t(res.error === "forbidden" || res.error === "invalid" || res.error === "network" ? `ops.error.${res.error}` : "ops.error.generic"));
      return;
    }
    const saved: EffectiveWindow = { ...w, days, closedDates: [...closed].sort(), configured: true };
    setConfigured(true);
    setClosed(saved.closedDates as string[]);
    setBase({ days: cloneWeek(days), closed: [...saved.closedDates] });
    toast.success(t("ops.cc.window.saved"));
    onSaved?.(saved);
    router.refresh();
  }

  function addDate() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate) || closed.includes(newDate) || closed.length >= MAX_CLOSED) return;
    setClosed([...closed, newDate].sort());
    setNewDate("");
  }

  const dateFmt = new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const dateLabel = (ymd: string) => dateFmt.format(new Date(`${ymd}T12:00:00Z`));

  return (
    <div className={cn("q-root grid", compact ? "gap-3" : "gap-5")}>
      {!configured && (
        <div className="cc-info flex flex-col gap-3 rounded-[14px] border p-3.5 sm:flex-row sm:items-center sm:justify-between">
          <p className="q-sm text-foreground">{t("ops.cc.window.starting")}</p>
          {canEdit && (
            <Button type="button" size="sm" className="shrink-0 gap-1.5" disabled={busy || !valid} onClick={save}>
              {busy ? <Loader2Icon className="size-4 animate-spin" aria-hidden="true" /> : <CheckIcon className="size-4" aria-hidden="true" />}
              {t("ops.cc.window.useThese")}
            </Button>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className="q-xs text-muted-foreground">{t("ops.cc.window.tz", { tz: w.tz })}</p>
        <p className="q-xs q-num text-muted-foreground" aria-live="polite">
          {today === null ? "\u00a0" : today ? t("ops.cc.window.today", { hours: today }) : t("ops.cc.window.todayClosed")}
        </p>
      </div>
      <WeekTable days={days} onChange={setDays} disabled={!canEdit} compact={compact} idPrefix={`${uid}-w`} />

      <div className="grid gap-2.5">
        <div className="grid gap-0.5">
          <h3 className="q-sm font-medium text-foreground">{t("ops.cc.window.closedDates")}</h3>
          <p className="q-xs text-muted-foreground">{t("ops.cc.window.closedDatesHint")}</p>
        </div>
        {closed.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {closed.map((d) => (
              <li key={d} className="q-xs q-num inline-flex h-7 items-center gap-1 rounded-full border border-border bg-background ps-2.5 pe-1 text-foreground">
                {dateLabel(d)}
                {canEdit && (
                  <button
                    type="button"
                    className="grid size-5 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                    aria-label={t("ops.cc.window.removeDate", { date: dateLabel(d) })}
                    onClick={() => setClosed(closed.filter((x) => x !== d))}
                  >
                    <XIcon className="size-3" aria-hidden="true" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {canEdit && (
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor={`${uid}-date`} className="sr-only">
              {t("ops.cc.window.addDate")}
            </label>
            <Input id={`${uid}-date`} type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="q-num h-9 w-44" dir="ltr" disabled={closed.length >= MAX_CLOSED} />
            <Button type="button" variant="outline" size="sm" className="h-9 gap-1" disabled={!newDate || closed.length >= MAX_CLOSED} onClick={addDate}>
              <PlusIcon className="size-3.5" aria-hidden="true" />
              {t("ops.cc.window.addDate")}
            </Button>
            {closed.length >= MAX_CLOSED && <span className="q-xs text-muted-foreground">{t("ops.cc.window.datesMax")}</span>}
          </div>
        )}
      </div>

      {canEdit && (configured || dirty) && (
        <div className="flex items-center justify-end gap-2">
          {dirty && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => {
                setDays(cloneWeek(base.days));
                setClosed([...base.closed]);
              }}
            >
              {t("ops.cc.discard")}
            </Button>
          )}
          <Button type="button" size="sm" className="gap-1.5" disabled={!dirty || !valid || busy} onClick={save}>
            {busy && <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />}
            {t("ops.cc.window.save")}
          </Button>
        </div>
      )}
    </div>
  );
}
