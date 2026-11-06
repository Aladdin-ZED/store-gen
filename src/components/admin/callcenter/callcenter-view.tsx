"use client";
/**
 * `/app/<h>/team/callcenter` (P4 CALL CENTER; operations.md OPE-§5.5, §5.6, §6.2, §7.4, OD9, OD10, OD57, OD63, OPS-28;
 * core D73, §I.8). Four tabs kept in the URL (`?tab=`):
 *
 *   hours     CallingWindowEditor; "Open calls now" (2 h, a banner with the end time); the dated schedules (≤ 4,
 *             non-overlapping, the "Ramadan hours" preset fills the ranges and never the dates)
 *   retries   the retry ladder (1-10 steps: after n minutes / at HH:MM with a minimum gap / next open day at HH:MM),
 *             the busy retry, what happens after the last step, beside the read-only best-hours strip; assignment
 *             mode with the rebalance minutes; leases, callback grace, duplicate window, first-touch target, agent
 *             history and the rescue calls
 *   scripts   ./scripts.tsx
 *   cities    city aliases (≤ 200), each typed spelling mapped to a CityKey
 *
 * Every write is `callcenter.configure` and touches the `ops` key (or the script rows) only. A viewer without the key,
 * View as store or a read-only store sees the same screen with the fields disabled.
 */
import { CalendarRangeIcon, ChevronDownIcon, ChevronUpIcon, Loader2Icon, PhoneOutgoingIcon, PlusIcon, SparklesIcon, Trash2Icon, XIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";
import { toast } from "sonner";
import { openCallsNowAction, saveOpsSettingsAction, saveWindowOverridesAction } from "@/app/app/[store]/team/callcenter/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RAMADAN_PRESET, type LadderStep } from "@/lib/callcenter/defaults";
import type { CallCenterView as View } from "@/lib/callcenter/settings-view.server";
import type { EffectiveWindow } from "@/lib/callcenter/window";
import { useAdminLocale, useT } from "@/lib/i18n/admin/client";
import { cityKey, cityLabel, type CityKey } from "@/lib/orders/address";
import { cn } from "@/lib/utils";
import { settle } from "../orders/ops-ui";
import { BestHours } from "../queue/board";
import { clock } from "../queue/time";
import { CallingWindowEditor, cloneWeek, WEEKDAYS, WeekTable, weekValid, type WeekDays } from "./calling-window";
import { CityPicker, errorKey, NumField, numOk, SaveBar, Section, type NumValue } from "./parts";
import { ScriptsEditor } from "./scripts";

export const CC_TABS = ["hours", "retries", "scripts", "cities"] as const;
export type CcTab = (typeof CC_TABS)[number];

export function CallCenterView({ view, tab: initialTab, canEdit }: { view: View; tab: CcTab; canEdit: boolean }) {
  const t = useT();
  const [tab, setTab] = useState<CcTab>(initialTab);
  function go(next: CcTab) {
    setTab(next);
    try {
      const u = new URL(window.location.href);
      if (next === "hours") u.searchParams.delete("tab");
      else u.searchParams.set("tab", next);
      window.history.replaceState(null, "", u);
    } catch {
      // the URL is a convenience only
    }
  }
  return (
    <div className="grid gap-5">
      {!canEdit && <p className="q-sm rounded-[12px] border border-border bg-muted/40 px-3.5 py-2.5 text-muted-foreground">{t("ops.cc.readOnly")}</p>}
      <nav aria-label={t("ops.cc.title")} className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul role="tablist" className="flex min-w-max gap-1 border-b border-border">
          {CC_TABS.map((id) => (
            <li key={id} role="presentation">
              <button
                type="button"
                role="tab"
                id={`cc-tab-${id}`}
                aria-selected={tab === id}
                aria-controls={`cc-panel-${id}`}
                onClick={() => go(id)}
                className={cn(
                  "q-sm relative -mb-px h-10 px-3 font-medium transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                  tab === id ? "text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t(`ops.cc.tab.${id}`)}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <div role="tabpanel" id={`cc-panel-${tab}`} aria-labelledby={`cc-tab-${tab}`} className="grid gap-5">
        {tab === "hours" && <HoursTab view={view} canEdit={canEdit} />}
        {tab === "retries" && <RetriesTab view={view} canEdit={canEdit} />}
        {tab === "scripts" && <ScriptsEditor view={view} canEdit={canEdit} />}
        {tab === "cities" && <CitiesTab view={view} canEdit={canEdit} />}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* hours                                                               */
/* ------------------------------------------------------------------ */

function HoursTab({ view, canEdit }: { view: View; canEdit: boolean }) {
  const t = useT();
  const [w, setW] = useState<EffectiveWindow>(view.window);
  return (
    <>
      <Section id="cc-hours" title={t("ops.cc.window.title")} hint={t("ops.cc.window.hint")} aside={<OpenCalls until={view.ops.openOverrideUntil} tz={view.window.tz} canEdit={canEdit} />}>
        <CallingWindowEditor window={w} canEdit={canEdit} onSaved={setW} />
      </Section>
      <Overrides initial={view.ops.windowOverrides} tz={view.window.tz} canEdit={canEdit} />
    </>
  );
}

function OpenCalls({ until: initial, tz, canEdit }: { until: string | null; tz: string; canEdit: boolean }) {
  const t = useT();
  const locale = useAdminLocale();
  const [until, setUntil] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const open = until !== null && Date.parse(until) > now;
  async function run() {
    setBusy(true);
    const res = await settle<{ until: string }>(openCallsNowAction());
    setBusy(false);
    if (!res.ok) return void toast.error(t(errorKey(res.error)));
    setUntil(res.data.until);
    setNow(Date.now());
    toast.success(t("ops.cc.open.done", { time: clock(res.data.until, tz, locale) }));
  }
  if (open)
    return (
      <p role="status" className="cc-info q-sm q-num inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-foreground">
        <PhoneOutgoingIcon className="size-4" aria-hidden="true" />
        {t("ops.cc.open.until", { time: clock(until!, tz, locale) })}
      </p>
    );
  if (!canEdit) return null;
  return (
    <div className="grid justify-items-start gap-1 sm:justify-items-end">
      <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={busy} onClick={run}>
        {busy ? <Loader2Icon className="size-4 animate-spin" aria-hidden="true" /> : <PhoneOutgoingIcon className="size-4" aria-hidden="true" />}
        {t("ops.cc.open.button")}
      </Button>
      <span className="q-xs text-muted-foreground">{t("ops.cc.open.hint")}</span>
    </div>
  );
}

type Override = { label: string; from: string; to: string; days: WeekDays };
const MAX_OVERRIDES = 4;
const emptyWeek = (): WeekDays => Object.fromEntries(WEEKDAYS.map((d) => [d, []])) as unknown as WeekDays;

/** The first problem of the list: missing or reversed dates, then an overlap (sorted by first day). */
function overridesProblem(list: Override[]): "dates" | "overlap" | "ranges" | null {
  if (list.some((o) => !/^\d{4}-\d{2}-\d{2}$/.test(o.from) || !/^\d{4}-\d{2}-\d{2}$/.test(o.to) || o.to < o.from)) return "dates";
  const sorted = [...list].sort((a, b) => a.from.localeCompare(b.from));
  if (sorted.some((o, i) => i > 0 && o.from <= sorted[i - 1]!.to)) return "overlap";
  if (list.some((o) => !weekValid(o.days) || o.label.length > 40)) return "ranges";
  return null;
}

function Overrides({ initial, tz, canEdit }: { initial: View["ops"]["windowOverrides"]; tz: string; canEdit: boolean }) {
  const t = useT();
  const locale = useAdminLocale();
  const router = useRouter();
  const uid = useId();
  const toState = (l: View["ops"]["windowOverrides"]): Override[] => l.map((o) => ({ label: o.label, from: o.from, to: o.to, days: cloneWeek(o.days) }));
  const [list, setList] = useState<Override[]>(() => toState(initial));
  const [base, setBase] = useState(() => JSON.stringify(toState(initial)));
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(list) !== base;
  const problem = overridesProblem(list);
  const today = useMemo(() => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()), [tz]);
  const set = (i: number, o: Partial<Override>) => setList(list.map((x, j) => (j === i ? { ...x, ...o } : x)));

  async function save() {
    if (problem || busy) return;
    setBusy(true);
    const res = await settle<{ count: number }>(saveWindowOverridesAction(list.map((o) => ({ label: o.label.trim(), from: o.from, to: o.to, days: o.days }))));
    setBusy(false);
    if (!res.ok) return void toast.error(t(errorKey(res.error)));
    setBase(JSON.stringify(list));
    toast.success(t("ops.cc.ovr.saved"));
    router.refresh();
  }

  return (
    <Section
      id="cc-ovr"
      title={t("ops.cc.ovr.title")}
      hint={t("ops.cc.ovr.hint")}
      aside={
        canEdit && list.length < MAX_OVERRIDES ? (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              title={t("ops.cc.ovr.ramadanHint")}
              onClick={() => setList([...list, { label: t("ops.cc.ovr.ramadanLabel"), from: "", to: "", days: Object.fromEntries(WEEKDAYS.map((d) => [d, RAMADAN_PRESET.map((r) => ({ ...r }))])) as unknown as WeekDays }])}
            >
              <SparklesIcon className="size-4" aria-hidden="true" />
              {t("ops.cc.ovr.ramadan")}
            </Button>
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setList([...list, { label: "", from: "", to: "", days: emptyWeek() }])}>
              <PlusIcon className="size-4" aria-hidden="true" />
              {t("ops.cc.ovr.add")}
            </Button>
          </div>
        ) : null
      }
    >
      {list.length === 0 ? (
        <p className="q-sm flex items-center gap-2 rounded-[12px] border border-dashed border-border px-3.5 py-3 text-muted-foreground">
          <CalendarRangeIcon className="size-4 shrink-0" aria-hidden="true" />
          {t("ops.cc.ovr.empty")}
        </p>
      ) : (
        <ol className="grid gap-3">
          {list.map((o, i) => {
            const active = o.from && o.to && o.from <= today && today <= o.to;
            const fromLabel = o.from ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${o.from}T12:00:00Z`)) : "";
            return (
              <li key={i} className="grid gap-3 rounded-[14px] border border-border bg-background p-3 sm:p-4">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="grid min-w-40 flex-1 gap-1.5">
                    <label htmlFor={`${uid}-l${i}`} className="q-xs font-medium text-muted-foreground">
                      {t("ops.cc.ovr.label")}
                    </label>
                    <Input id={`${uid}-l${i}`} value={o.label} maxLength={40} disabled={!canEdit} placeholder={t("ops.cc.ovr.ramadanLabel")} onChange={(e) => set(i, { label: e.target.value })} className="h-9" />
                  </div>
                  <div className="grid gap-1.5">
                    <label htmlFor={`${uid}-f${i}`} className="q-xs font-medium text-muted-foreground">
                      {t("ops.cc.ovr.from")}
                    </label>
                    <Input id={`${uid}-f${i}`} type="date" value={o.from} disabled={!canEdit} onChange={(e) => set(i, { from: e.target.value })} className="q-num h-9 w-40" dir="ltr" />
                  </div>
                  <div className="grid gap-1.5">
                    <label htmlFor={`${uid}-t${i}`} className="q-xs font-medium text-muted-foreground">
                      {t("ops.cc.ovr.to")}
                    </label>
                    <Input id={`${uid}-t${i}`} type="date" value={o.to} min={o.from || undefined} disabled={!canEdit} onChange={(e) => set(i, { to: e.target.value })} className="q-num h-9 w-40" dir="ltr" />
                  </div>
                  {active && <span className="q-2xs mb-2 rounded-full bg-[color-mix(in_oklab,var(--q-ok)_14%,transparent)] px-2 py-0.5 font-medium text-[var(--q-ok)]">{t("ops.cc.ovr.active")}</span>}
                  {canEdit && (
                    <Button type="button" variant="ghost" size="icon" className="ms-auto size-9 text-muted-foreground" aria-label={t("ops.cc.ovr.remove", { label: o.label || fromLabel })} onClick={() => setList(list.filter((_, j) => j !== i))}>
                      <Trash2Icon className="size-4" aria-hidden="true" />
                    </Button>
                  )}
                </div>
                <WeekTable days={o.days} onChange={(days) => set(i, { days })} disabled={!canEdit} compact idPrefix={`${uid}-o${i}`} />
              </li>
            );
          })}
        </ol>
      )}
      {list.length >= MAX_OVERRIDES && <p className="q-xs text-muted-foreground">{t("ops.cc.ovr.max")}</p>}
      {dirty && problem && (
        <p role="alert" className="q-sm text-destructive">
          {t(problem === "dates" ? "ops.cc.ovr.errDates" : problem === "overlap" ? "ops.cc.ovr.errOverlap" : "ops.cc.window.sameTime")}
        </p>
      )}
      {canEdit && <SaveBar dirty={dirty} valid={!problem} busy={busy} onSave={save} onDiscard={() => setList(JSON.parse(base) as Override[])} label={t("ops.cc.ovr.save")} />}
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* retries, assignment and timings                                     */
/* ------------------------------------------------------------------ */

type Form = {
  ladder: LadderStep[];
  busyRetryMinutes: NumValue;
  unreachable: "close" | "keep_open";
  keepOpenDays: NumValue;
  assignment: "pull" | "round_robin" | "manual";
  rebalanceMinutes: NumValue;
  leaseMinutes: NumValue;
  callbackGraceMinutes: NumValue;
  duplicateWindowDays: NumValue;
  firstTouchTargetMin: NumValue;
  agentHistoryDays: NumValue;
  rescueMax: NumValue;
  rescueRetry: NumValue;
};

const formOf = (o: View["ops"]): Form => ({
  ladder: o.ladder.map((s) => ({ ...s })),
  busyRetryMinutes: o.busyRetryMinutes,
  unreachable: o.unreachable,
  keepOpenDays: o.keepOpenDays,
  assignment: o.assignment,
  rebalanceMinutes: o.rebalanceMinutes,
  leaseMinutes: o.leaseMinutes,
  callbackGraceMinutes: o.callbackGraceMinutes,
  duplicateWindowDays: o.duplicateWindowDays,
  firstTouchTargetMin: o.firstTouchTargetMin,
  agentHistoryDays: o.agentHistoryDays,
  rescueMax: o.rescue.maxCalls,
  rescueRetry: o.rescue.retryMinutes,
});

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const stepOk = (s: LadderStep) =>
  s.kind === "after" ? numOk(s.minutes, 5, 2880) : s.kind === "at" ? HHMM.test(s.time) && (s.minGapMinutes === undefined || numOk(s.minGapMinutes, 0, 1440)) : HHMM.test(s.time);

function formValid(f: Form): boolean {
  return (
    f.ladder.length >= 1 &&
    f.ladder.length <= 10 &&
    f.ladder.every(stepOk) &&
    numOk(f.busyRetryMinutes, 5, 120) &&
    numOk(f.keepOpenDays, 1, 14) &&
    numOk(f.rebalanceMinutes, 5, 240) &&
    numOk(f.leaseMinutes, 5, 30) &&
    numOk(f.callbackGraceMinutes, 0, 60) &&
    numOk(f.duplicateWindowDays, 0, 14) &&
    numOk(f.firstTouchTargetMin, 5, 240) &&
    numOk(f.agentHistoryDays, 1, 30) &&
    numOk(f.rescueMax, 0, 5) &&
    numOk(f.rescueRetry, 15, 240)
  );
}

function RetriesTab({ view, canEdit }: { view: View; canEdit: boolean }) {
  const t = useT();
  const router = useRouter();
  const uid = useId();
  const [form, setForm] = useState<Form>(() => formOf(view.ops));
  const [base, setBase] = useState(() => JSON.stringify(formOf(view.ops)));
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(form) !== base;
  const valid = formValid(form);
  const f = <K extends keyof Form>(k: K, v: Form[K]) => setForm({ ...form, [k]: v });
  const n = (v: NumValue) => v as number;

  async function save() {
    if (!valid || busy) return;
    setBusy(true);
    const res = await settle<{ fields: string[] }>(
      saveOpsSettingsAction({
        ladder: form.ladder,
        busyRetryMinutes: n(form.busyRetryMinutes),
        unreachable: form.unreachable,
        keepOpenDays: n(form.keepOpenDays),
        assignment: form.assignment,
        rebalanceMinutes: n(form.rebalanceMinutes),
        leaseMinutes: n(form.leaseMinutes),
        callbackGraceMinutes: n(form.callbackGraceMinutes),
        duplicateWindowDays: n(form.duplicateWindowDays),
        firstTouchTargetMin: n(form.firstTouchTargetMin),
        agentHistoryDays: n(form.agentHistoryDays),
        rescue: { maxCalls: n(form.rescueMax), retryMinutes: n(form.rescueRetry) },
      }),
    );
    setBusy(false);
    if (!res.ok) return void toast.error(t(errorKey(res.error)));
    setBase(JSON.stringify(form));
    toast.success(t("ops.cc.saved"));
    router.refresh();
  }

  const d = !canEdit;
  return (
    <>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] xl:items-start">
        <Section id="cc-ladder" title={t("ops.cc.ladder.title")} hint={t("ops.cc.ladder.hint")}>
          <LadderEditor steps={form.ladder} onChange={(l) => f("ladder", l)} disabled={d} />
          <div className="grid gap-4 border-t border-border/70 pt-4 sm:grid-cols-2">
            <NumField id={`${uid}-busy`} label={t("ops.cc.busy")} hint={t("ops.cc.busy.hint")} value={form.busyRetryMinutes} min={5} max={120} onChange={(v) => f("busyRetryMinutes", v)} disabled={d} unit={t("ops.cc.unit.min")} />
            <fieldset className="grid content-start gap-2">
              <legend className="q-sm mb-1.5 font-medium text-foreground">{t("ops.cc.unreachable.title")}</legend>
              {(["close", "keep_open"] as const).map((k) => (
                <label key={k} className="q-sm flex cursor-pointer items-center gap-2.5 text-foreground has-[:disabled]:cursor-default">
                  <input type="radio" name={`${uid}-unr`} value={k} checked={form.unreachable === k} disabled={d} onChange={() => f("unreachable", k)} className="size-4 accent-[var(--foreground)]" />
                  {t(`ops.cc.unreachable.${k}`)}
                </label>
              ))}
              {form.unreachable === "keep_open" && (
                <div className="ps-6.5 pt-1">
                  <NumField id={`${uid}-keep`} label={t("ops.cc.unreachable.days")} value={form.keepOpenDays} min={1} max={14} onChange={(v) => f("keepOpenDays", v)} disabled={d} unit={t("ops.cc.unit.days")} />
                </div>
              )}
            </fieldset>
          </div>
        </Section>
        <BestHours cells={view.bestHours} />
      </div>

      <Section id="cc-assign" title={t("ops.cc.assign.title")} hint={t("ops.cc.assign.hint")}>
        <fieldset className="grid gap-2 sm:grid-cols-3">
          <legend className="sr-only">{t("ops.cc.assign.title")}</legend>
          {(["pull", "round_robin", "manual"] as const).map((k) => (
            <label
              key={k}
              className={cn(
                "grid cursor-pointer gap-1 rounded-[14px] border p-3.5 transition-colors duration-150 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/50 has-[:disabled]:cursor-default",
                form.assignment === k ? "border-foreground/70 bg-muted/50" : "border-border hover:border-foreground/30",
              )}
            >
              <span className="q-sm flex items-center gap-2 font-medium text-foreground">
                <input type="radio" name={`${uid}-asg`} value={k} checked={form.assignment === k} disabled={d} onChange={() => f("assignment", k)} className="size-4 accent-[var(--foreground)]" />
                {t(`ops.cc.assign.${k}`)}
              </span>
              <span className="q-xs ps-6 text-muted-foreground">{t(`ops.cc.assign.${k}.hint`)}</span>
            </label>
          ))}
        </fieldset>
        {form.assignment === "round_robin" && (
          <NumField id={`${uid}-reb`} label={t("ops.cc.assign.rebalance")} hint={t("ops.cc.assign.rebalanceHint")} value={form.rebalanceMinutes} min={5} max={240} onChange={(v) => f("rebalanceMinutes", v)} disabled={d} unit={t("ops.cc.unit.min")} />
        )}
      </Section>

      <Section id="cc-timing" title={t("ops.cc.timing.title")}>
        <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
          <NumField id={`${uid}-lease`} label={t("ops.cc.timing.lease")} hint={t("ops.cc.timing.leaseHint")} value={form.leaseMinutes} min={5} max={30} onChange={(v) => f("leaseMinutes", v)} disabled={d} unit={t("ops.cc.unit.min")} />
          <NumField id={`${uid}-grace`} label={t("ops.cc.timing.grace")} value={form.callbackGraceMinutes} min={0} max={60} onChange={(v) => f("callbackGraceMinutes", v)} disabled={d} unit={t("ops.cc.unit.min")} />
          <NumField id={`${uid}-ft`} label={t("ops.cc.timing.firstTouch")} hint={t("ops.cc.timing.firstTouchHint")} value={form.firstTouchTargetMin} min={5} max={240} onChange={(v) => f("firstTouchTargetMin", v)} disabled={d} unit={t("ops.cc.unit.min")} />
          <NumField id={`${uid}-dup`} label={t("ops.cc.timing.duplicate")} hint={t("ops.cc.timing.duplicateHint")} value={form.duplicateWindowDays} min={0} max={14} onChange={(v) => f("duplicateWindowDays", v)} disabled={d} unit={t("ops.cc.unit.days")} />
          <NumField id={`${uid}-hist`} label={t("ops.cc.timing.history")} value={form.agentHistoryDays} min={1} max={30} onChange={(v) => f("agentHistoryDays", v)} disabled={d} unit={t("ops.cc.unit.days")} />
          <NumField id={`${uid}-rmax`} label={t("ops.cc.timing.rescueMax")} hint={t("ops.cc.timing.rescueHint")} value={form.rescueMax} min={0} max={5} onChange={(v) => f("rescueMax", v)} disabled={d} />
          <NumField id={`${uid}-rret`} label={t("ops.cc.timing.rescueRetry")} value={form.rescueRetry} min={15} max={240} onChange={(v) => f("rescueRetry", v)} disabled={d} unit={t("ops.cc.unit.min")} />
        </div>
      </Section>
      {canEdit && <SaveBar dirty={dirty} valid={valid} busy={busy} onSave={save} onDiscard={() => setForm(JSON.parse(base) as Form)} />}
    </>
  );
}

function LadderEditor({ steps, onChange, disabled }: { steps: LadderStep[]; onChange: (s: LadderStep[]) => void; disabled: boolean }) {
  const t = useT();
  const uid = useId();
  const set = (i: number, s: LadderStep) => onChange(steps.map((x, j) => (j === i ? s : x)));
  const move = (i: number, by: -1 | 1) => {
    const j = i + by;
    if (j < 0 || j >= steps.length) return;
    const next = [...steps];
    [next[i], next[j]] = [next[j]!, next[i]!];
    onChange(next);
  };
  const kindOf = (k: LadderStep["kind"], prev: LadderStep): LadderStep =>
    k === "after" ? { kind: "after", minutes: prev.kind === "after" ? prev.minutes : 60 } : k === "at" ? { kind: "at", time: "time" in prev ? prev.time : "18:30" } : { kind: "next_day_at", time: "time" in prev ? prev.time : "11:00" };
  return (
    <div className="grid gap-2">
      <p className="q-xs text-muted-foreground">{t("ops.cc.ladder.first")}</p>
      <ol className="grid gap-2">
        {steps.map((s, i) => {
          const bad = !stepOk(s);
          return (
            <li key={i} className={cn("flex flex-wrap items-center gap-2 rounded-[12px] border bg-background p-2 ps-3", bad ? "border-destructive/60" : "border-border")}>
              <span className="q-xs q-num w-full font-medium text-muted-foreground sm:w-28">{t("ops.cc.ladder.step", { n: i + 1 })}</span>
              <Select value={s.kind} disabled={disabled} onValueChange={(k) => set(i, kindOf(k as LadderStep["kind"], s))}>
                <SelectTrigger size="sm" className="w-44" aria-label={t("ops.cc.ladder.kind")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["after", "at", "next_day_at"] as const).map((k) => (
                    <SelectItem key={k} value={k}>
                      {t(`ops.cc.ladder.kind.${k}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {s.kind === "after" ? (
                <span className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    min={5}
                    max={2880}
                    value={Number.isFinite(s.minutes) ? s.minutes : ""}
                    disabled={disabled}
                    aria-label={t("ops.cc.ladder.minutes")}
                    aria-invalid={bad || undefined}
                    onChange={(e) => set(i, { kind: "after", minutes: e.target.value === "" ? Number.NaN : Number(e.target.value) })}
                    className="q-num h-8 w-24"
                    dir="ltr"
                  />
                  <span className="q-sm text-muted-foreground">{t("ops.cc.unit.min")}</span>
                </span>
              ) : (
                <span className="flex flex-wrap items-center gap-1.5">
                  <Input type="time" step={60} value={s.time} disabled={disabled} aria-label={t("ops.cc.ladder.time")} onChange={(e) => set(i, { ...s, time: e.target.value })} className="q-num h-8 w-[6.5rem]" dir="ltr" />
                  {s.kind === "at" && (
                    <>
                      <label htmlFor={`${uid}-gap${i}`} className="q-xs text-muted-foreground">
                        {t("ops.cc.ladder.minGap")}
                      </label>
                      <Input
                        id={`${uid}-gap${i}`}
                        type="number"
                        min={0}
                        max={1440}
                        placeholder="60"
                        value={s.minGapMinutes ?? ""}
                        disabled={disabled}
                        onChange={(e) => set(i, e.target.value === "" ? { kind: "at", time: s.time } : { kind: "at", time: s.time, minGapMinutes: Number(e.target.value) })}
                        className="q-num h-8 w-20"
                        dir="ltr"
                      />
                      <span className="q-sm text-muted-foreground">{t("ops.cc.unit.min")}</span>
                    </>
                  )}
                </span>
              )}
              {!disabled && (
                <span className="ms-auto flex items-center">
                  <Button type="button" variant="ghost" size="icon" className="size-8 text-muted-foreground" disabled={i === 0} aria-label={t("ops.cc.up")} onClick={() => move(i, -1)}>
                    <ChevronUpIcon className="size-4" aria-hidden="true" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="size-8 text-muted-foreground" disabled={i === steps.length - 1} aria-label={t("ops.cc.down")} onClick={() => move(i, 1)}>
                    <ChevronDownIcon className="size-4" aria-hidden="true" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="size-8 text-muted-foreground" disabled={steps.length <= 1} aria-label={t("ops.cc.ladder.remove")} onClick={() => onChange(steps.filter((_, j) => j !== i))}>
                    <XIcon className="size-4" aria-hidden="true" />
                  </Button>
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap items-center gap-3">
        {!disabled && steps.length < 10 && (
          <Button type="button" variant="ghost" size="sm" className="gap-1 text-muted-foreground" onClick={() => onChange([...steps, { kind: "after", minutes: 180 }])}>
            <PlusIcon className="size-3.5" aria-hidden="true" />
            {t("ops.cc.ladder.add")}
          </Button>
        )}
        <span className="q-xs text-muted-foreground">{t("ops.cc.ladder.last", { n: steps.length + 1 })}</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* city aliases                                                        */
/* ------------------------------------------------------------------ */

const MAX_ALIASES = 200;

function CitiesTab({ view, canEdit }: { view: View; canEdit: boolean }) {
  const t = useT();
  const locale = useAdminLocale();
  const router = useRouter();
  const uid = useId();
  const initial = () => Object.entries(view.ops.cityAliases).map(([typed, key]) => ({ typed, key: key as string }));
  const [rows, setRows] = useState(initial);
  const [base, setBase] = useState(() => JSON.stringify(initial()));
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(rows) !== base;
  const norm = (s: string) => s.trim().toLowerCase();
  const dupes = new Set(rows.map((r) => norm(r.typed)).filter((k, i, a) => k && a.indexOf(k) !== i));
  const valid = rows.length <= MAX_ALIASES && rows.every((r) => r.typed.trim() && r.typed.trim().length <= 40 && r.key && !dupes.has(norm(r.typed)));

  async function save() {
    if (!valid || busy) return;
    setBusy(true);
    const res = await settle<{ fields: string[] }>(saveOpsSettingsAction({ cityAliases: Object.fromEntries(rows.map((r) => [r.typed.trim(), r.key])) }));
    setBusy(false);
    if (!res.ok) return void toast.error(t(errorKey(res.error)));
    setBase(JSON.stringify(rows));
    toast.success(t("ops.cc.saved"));
    router.refresh();
  }

  return (
    <Section
      id="cc-cities"
      title={t("ops.cc.cities.title")}
      hint={t("ops.cc.cities.hint")}
      aside={<span className="q-xs q-num text-muted-foreground">{t("ops.cc.cities.count", { n: rows.length, max: MAX_ALIASES })}</span>}
    >
      {rows.length === 0 ? (
        <p className="q-sm rounded-[12px] border border-dashed border-border px-3.5 py-3 text-muted-foreground">{t("ops.cc.cities.empty")}</p>
      ) : (
        <ul className="grid gap-2">
          <li aria-hidden="true" className="q-2xs hidden grid-cols-[minmax(0,1fr)_14rem_2.25rem] gap-3 px-1 font-medium text-muted-foreground sm:grid">
            <span>{t("ops.cc.cities.typed")}</span>
            <span>{t("ops.cc.cities.city")}</span>
            <span />
          </li>
          {rows.map((r, i) => {
            const guess = r.typed.trim() ? cityKey(r.typed) : null;
            return (
              <li key={i} className="grid gap-2 rounded-[12px] border border-border p-2.5 sm:grid-cols-[minmax(0,1fr)_14rem_2.25rem] sm:items-center sm:gap-3 sm:border-0 sm:p-0 sm:px-1">
                <label htmlFor={`${uid}-a${i}`} className="sr-only">
                  {t("ops.cc.cities.typed")}
                </label>
                <Input
                  id={`${uid}-a${i}`}
                  value={r.typed}
                  maxLength={40}
                  disabled={!canEdit}
                  aria-invalid={dupes.has(norm(r.typed)) || undefined}
                  onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, typed: e.target.value } : x)))}
                  className="h-9"
                />
                <CityPicker id={`${uid}-c${i}`} value={r.key} disabled={!canEdit} onChange={(k) => setRows(rows.map((x, j) => (j === i ? { ...x, key: k } : x)))} />
                {canEdit && (
                  <Button type="button" variant="ghost" size="icon" className="size-9 justify-self-end text-muted-foreground" aria-label={t("ops.cc.cities.remove")} onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                    <XIcon className="size-4" aria-hidden="true" />
                  </Button>
                )}
                {dupes.has(norm(r.typed)) && <p className="q-xs text-destructive sm:col-span-3">{t("ops.cc.cities.errDup")}</p>}
                {!r.key && guess && canEdit && (
                  <button type="button" className="q-xs justify-self-start text-start text-muted-foreground underline-offset-2 hover:underline sm:col-span-3" onClick={() => setRows(rows.map((x, j) => (j === i ? { ...x, key: guess } : x)))}>
                    {t("ops.cc.cities.guess", { city: cityLabel(guess as CityKey, locale) })}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {canEdit && rows.length < MAX_ALIASES && (
        <Button type="button" variant="outline" size="sm" className="justify-self-start gap-1.5" onClick={() => setRows([...rows, { typed: "", key: "" }])}>
          <PlusIcon className="size-4" aria-hidden="true" />
          {t("ops.cc.cities.add")}
        </Button>
      )}
      {canEdit && <SaveBar dirty={dirty} valid={valid} busy={busy} onSave={save} onDiscard={() => setRows(JSON.parse(base) as { typed: string; key: string }[])} />}
    </Section>
  );
}
