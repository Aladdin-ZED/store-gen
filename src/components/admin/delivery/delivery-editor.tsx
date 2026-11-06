"use client";
/**
 * Settings → Delivery zones (landing.md LAN-§7.3; docs/STORE-SAAS.md §I.8): the master switch and the landing
 * sub-switch, the live card "What a shopper in [city] sees right now" (the page's own composer, `composeLine` over
 * `buildZoneTable`, at the browser's now: never a mock), the zones column (360 px) beside the cities, then the calendar.
 * Below 768 px: one column, zones as cards, the cities in a full-height sheet with a sticky search.
 *
 * Every change is one optimistic write with Undo (src/components/admin/landing/optimistic.ts); a zone problem the
 * server finds rolls the list back and sits on the card it names. Markets without a city list get the typical-days
 * field of `policies.delivery` instead of zones.
 */
import { MapPinnedIcon } from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { composeLine, type DeliveryLine } from "@/lib/delivery/line";
import { buildZoneTable } from "@/lib/delivery/table";
import type { DeliveryZoneRow, ZoneInput, ZoneProblem } from "@/lib/delivery/types";
import { useAdminLocale, useT } from "@/lib/i18n/admin/client";
import { formatMoney } from "@/lib/markets/info";
import type { CheckoutSetting } from "@/lib/settings/keys/checkout";
import { cn } from "@/lib/utils";
import { actionMessage, type ActionResult } from "../lib/action-result";
import { newOpId, UNDO_MS, useNow, useOptimistic } from "../landing/optimistic";
import { Field, SettingsSection, TextInput } from "../settings/form-kit";
import { ReadOnly } from "../landing/read-only";
import { CalendarCard } from "./calendar";
import { CitiesColumn } from "./cities";
import { blankZone, moveCities, problemMessage, starterZones, STAR, toInputs, type CityRow, type DeliveryEditorData } from "./model";
import { ZonesColumn } from "./zones";

export type { DeliveryEditorData } from "./model";

type Calendar = CheckoutSetting["calendar"];
type ZonesResult = { zones: DeliveryZoneRow[]; problems: ZoneProblem[]; busy?: true };

export interface DeliveryActions {
  saveZones: (opId: string, zones: ZoneInput[]) => Promise<ActionResult<ZonesResult>>;
  saveCalendar: (opId: string, patch: Partial<Pick<Calendar, "workdays" | "cutoffHour" | "holidays" | "confirmationLeadDays">>) => Promise<ActionResult<Calendar>>;
  addFixedHolidays: (opId: string, year: number) => Promise<ActionResult<Calendar>>;
  markHolidaysReviewed: (opId: string, year: number) => Promise<ActionResult<Calendar>>;
  applyLeadSuggestion: (opId: string) => Promise<ActionResult<{ calendar: Calendar; applied: boolean }>>;
  setZonesEnabled: (opId: string, on: boolean) => Promise<ActionResult<{ zonesEnabled: boolean }>>;
  setLineOnLanding: (opId: string, on: boolean) => Promise<ActionResult<{ lineOnLanding: boolean }>>;
  saveTypicalDays: (opId: string, days: [number, number] | null) => Promise<ActionResult<{ typicalDays: [number, number] | null }>>;
}

export function DeliveryEditor({ data, actions }: { data: DeliveryEditorData; actions: DeliveryActions }) {
  const t = useT();
  const locale = useAdminLocale();
  const { canWrite } = data;

  /* ---- zones ---- */
  const sent = useRef<DeliveryZoneRow[]>(data.zones);
  // the server's problems with the list they were found in (a problem names its zone by name)
  const [problems, setProblems] = useState<{ items: ZoneProblem[]; list: DeliveryZoneRow[] }>({ items: [], list: [] });
  const [open, setOpen] = useState<string | null>(null);
  const zonesW = useOptimistic<DeliveryZoneRow[], ZonesResult>(data.zones, (list, opId) => actions.saveZones(opId, toInputs(list)), {
    fromResult: (d) => d.zones,
    reject: (d) => {
      if (d.busy) return t("landing.dz.busy");
      setProblems({ items: d.problems, list: sent.current });
      return d.problems.length ? t("landing.dz.problems") : null;
    },
  });
  const zones = zonesW.value;
  const label = (key: string) => data.cities.find((c) => c.key === key)?.[locale === "ar" ? "ar" : "fr"] ?? key;
  const problemByZone = useMemo(() => {
    const out: Record<string, string> = {};
    for (const p of problems.items) {
      const zone = problems.list.find((z) => z.name === p.zone) ?? (p.zone ? undefined : problems.list[0]);
      if (!zone || out[zone.id]) continue;
      const m = problemMessage(p, label);
      out[zone.id] = t(m.key, m.vars);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [problems, t]);

  const commitZones = async (next: DeliveryZoneRow[], message: string) => {
    sent.current = next;
    const openIndex = open ? next.findIndex((z) => z.id === open) : -1;
    const r = await zonesW.save(next, message);
    // a refusal was toasted (and rolled back); zone problems sit on their cards
    if (r.ok) {
      setProblems({ items: [], list: [] });
      if (openIndex >= 0) setOpen(r.data.zones[openIndex]?.id ?? null);
    }
  };
  const addZone = () => {
    const z = blankZone(t("landing.dz.zones.newName", { n: zones.length + 1 }));
    void commitZones([...zones, z], t("landing.dz.saved.added"));
    setOpen(z.id);
  };
  const startWithThree = () => {
    const names = locale === "ar" ? { casa: "الدار البيضاء", major: "المدن الكبرى", rest: "باقي المغرب" } : { casa: "Casablanca", major: "Grandes villes", rest: "Reste du Maroc" };
    void commitZones(starterZones(data.cities, names), t("landing.dz.saved.starter"));
  };
  const onMoveCities = (keys: string[], to: string | null) => {
    if (!keys.length) return;
    const dest = to ? zones.find((z) => z.id === to)?.name : null;
    void commitZones(moveCities(zones, keys, to), dest ? t("landing.dz.saved.moved", { n: keys.length, zone: dest }) : t("landing.dz.saved.unassigned", { n: keys.length }));
  };

  /* ---- switches ---- */
  const enabledW = useOptimistic(data.checkout.zonesEnabled, (on, opId) => actions.setZonesEnabled(opId, on), { fromResult: (d) => d.zonesEnabled });
  const lineW = useOptimistic(data.checkout.lineOnLanding, (on, opId) => actions.setLineOnLanding(opId, on), { fromResult: (d) => d.lineOnLanding });

  /* ---- calendar ---- */
  const calW = useOptimistic<Calendar, Calendar>(
    data.checkout.calendar,
    (c, opId) => actions.saveCalendar(opId, { workdays: c.workdays, cutoffHour: c.cutoffHour, holidays: c.holidays, confirmationLeadDays: c.confirmationLeadDays }),
    { fromResult: (d) => d },
  );
  const calServer = async (call: (opId: string) => Promise<ActionResult<Calendar>>, message: string) => {
    const prev = calW.latest.current;
    let res: ActionResult<Calendar>;
    try {
      res = await call(newOpId());
    } catch {
      res = { ok: false, error: "network", message: "landing.common.network" };
    }
    if (!res.ok) return void toast.error(actionMessage(res, t("landing.common.failed")));
    calW.set(res.data);
    toast.success(message, { duration: UNDO_MS, action: { label: t("landing.common.undo"), onClick: () => void calW.save(prev, t("landing.common.undone"), { undo: false }) } });
  };

  const applySuggestion = async (op: string): Promise<ActionResult<Calendar>> => {
    const r = await actions.applyLeadSuggestion(op);
    if (!r.ok) return r;
    return r.data.applied ? { ok: true, data: r.data.calendar } : { ok: false, error: "invalid", message: "landing.dz.cal.noSuggestion" };
  };

  /* ---- the live card ---- */
  const now = useNow();

  const unassigned = data.cities.filter((c) => !zones.some((z) => (z.cities as readonly string[]).includes(c.key))).length;
  const starOwner = zones.find((z) => z.cities.includes(STAR));
  const needsValues = zones.some((z) => !z.notServed && z.etaMinDays === null && z.feeCents === null);

  if (!data.hasCityList) {
    return (
      <>
        {!canWrite && <ReadOnly />}
        <TypicalDaysCard initial={data.typicalDays} canWrite={data.canWritePolicies} save={actions.saveTypicalDays} />
        <CalendarCard
          calendar={calW.value}
          canWrite={canWrite}
          market={data.market}
          today={data.today}
          confirmationCall={data.checkout.confirmationCall}
          suggestion={data.suggestion}
          onPatch={(patch, message) => void calW.save({ ...calW.latest.current, ...patch }, message)}
          onAddFixed={(y) => void calServer((op) => actions.addFixedHolidays(op, y), t("landing.dz.cal.saved.fixed", { year: y }))}
          onReviewed={(y) => void calServer((op) => actions.markHolidaysReviewed(op, y), t("landing.dz.cal.saved.reviewed", { year: y }))}
          onApplySuggestion={() => void calServer(applySuggestion, t("landing.dz.cal.saved.lead"))}
        />
      </>
    );
  }

  return (
    <>
      {!canWrite && <ReadOnly />}
      <SettingsSection title={t("landing.dz.title")} description={t("landing.dz.description")}>
        <div className="grid gap-1">
          <SwitchRow
            label={t("landing.dz.enabled")}
            hint={t("landing.dz.enabledHint")}
            checked={enabledW.value}
            disabled={!canWrite}
            onChange={(v) => void enabledW.save(v, v ? t("landing.dz.saved.enabledOn") : t("landing.dz.saved.enabledOff"))}
          />
          <SwitchRow
            label={t("landing.dz.onLanding")}
            hint={t("landing.dz.onLandingHint")}
            checked={lineW.value}
            disabled={!canWrite || !enabledW.value}
            inset
            onChange={(v) => void lineW.save(v, v ? t("landing.dz.saved.lineOn") : t("landing.dz.saved.lineOff"))}
          />
        </div>
        <LiveCard data={data} zones={zones} calendar={calW.value} enabled={enabledW.value} onLanding={lineW.value} now={now} />
      </SettingsSection>

      {zones.length === 0 ? (
        <ZonesEmpty canWrite={canWrite} onStart={startWithThree} onAdd={addZone} />
      ) : (
        <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-[22.5rem_minmax(0,1fr)]">
          <div className="adm-surface grid gap-3 p-3 sm:p-4">
            {needsValues && (
              <p role="status" className="rounded-xl bg-foreground/[0.04] px-3 py-2.5 text-sm leading-relaxed ring-1 ring-border">
                {t("landing.dz.fillIn")}
              </p>
            )}
            <ZonesColumn
              zones={zones}
              canWrite={canWrite}
              currency={data.currency}
              moneyLocale={data.moneyLocale}
              problems={problemByZone}
              open={open}
              onOpen={setOpen}
              onChange={(next, message) => void commitZones(next, message)}
              onAdd={addZone}
            />
            <Sheet>
              <SheetTrigger asChild>
                <Button type="button" variant="outline" className="h-11 gap-2 rounded-xl md:hidden">
                  <MapPinnedIcon aria-hidden="true" className="size-4" />
                  {starOwner ? t("landing.dz.cities.open") : t("landing.dz.cities.openUnassigned", { n: unassigned })}
                </Button>
              </SheetTrigger>
              <SheetContent side="bottom" className="h-[100dvh] gap-0 p-0">
                <SheetHeader className="border-b border-border/70 px-4 py-3">
                  <SheetTitle>{t("landing.dz.cities.title")}</SheetTitle>
                  <SheetDescription>{t("landing.dz.cities.sheetHint")}</SheetDescription>
                </SheetHeader>
                <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
                  <CitiesColumn cities={data.cities} zones={zones} canWrite={canWrite} onMove={onMoveCities} className="pt-3" />
                </div>
              </SheetContent>
            </Sheet>
          </div>
          <div className="adm-surface hidden max-h-[calc(100dvh-7rem)] overflow-y-auto p-4 adm-scroll md:block md:sticky md:top-20">
            <CitiesColumn cities={data.cities} zones={zones} canWrite={canWrite} onMove={onMoveCities} />
          </div>
        </div>
      )}

      <CalendarCard
        calendar={calW.value}
        canWrite={canWrite}
        market={data.market}
        today={data.today}
        confirmationCall={data.checkout.confirmationCall}
        suggestion={data.suggestion}
        onPatch={(patch, message) => void calW.save({ ...calW.latest.current, ...patch }, message)}
        onAddFixed={(y) => void calServer((op) => actions.addFixedHolidays(op, y), t("landing.dz.cal.saved.fixed", { year: y }))}
        onReviewed={(y) => void calServer((op) => actions.markHolidaysReviewed(op, y), t("landing.dz.cal.saved.reviewed", { year: y }))}
        onApplySuggestion={() => void calServer(applySuggestion, t("landing.dz.cal.saved.lead"))}
      />
    </>
  );
}

function SwitchRow({ label, hint, checked, disabled, inset, onChange }: { label: string; hint: string; checked: boolean; disabled?: boolean; inset?: boolean; onChange: (v: boolean) => void }) {
  const id = useId();
  return (
    <div className={cn("flex min-h-14 items-center justify-between gap-4 py-2", inset && "ms-4 border-s border-border ps-4")}>
      <label htmlFor={id} className={cn("grid gap-0.5", disabled && "opacity-60")}>
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xs leading-relaxed text-muted-foreground">{hint}</span>
      </label>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  );
}

/** "What a shopper in [city] sees right now": the landing line for one city, from the same composer as the page. */
function LiveCard({ data, zones, calendar, enabled, onLanding, now }: { data: DeliveryEditorData; zones: DeliveryZoneRow[]; calendar: Calendar; enabled: boolean; onLanding: boolean; now: Date | null }) {
  const t = useT();
  const id = useId();
  const adminLocale = useAdminLocale();
  const nameOf = (c: CityRow) => (adminLocale === "ar" ? c.ar : c.fr);
  const firstCity = data.cities.find((c) => c.key === "casablanca") ?? data.cities[0];
  const [cityKey, setCityKey] = useState<string>(firstCity?.key ?? "");
  const city: CityRow | undefined = data.cities.find((c) => c.key === cityKey);
  const lead = data.checkout.confirmationCall ? (calendar.confirmationLeadDays ?? 0) : 0;
  const line: DeliveryLine | null = useMemo(() => {
    if (!now) return null;
    const table = buildZoneTable(zones, { tz: data.tz, workdays: calendar.workdays, cutoffHour: calendar.cutoffHour, holidays: calendar.holidays.filter((d) => d >= data.today), leadDays: lead }, data.cities);
    const cityLabel = city ? (data.pageLocale === "ar" ? city.ar : data.pageLocale === "en" ? (city.en ?? city.fr) : city.fr) : "";
    return composeLine({
      table,
      city: city ? { value: city.value, label: cityLabel } : null,
      locale: data.pageLocale,
      dateLocale: data.moneyLocale,
      now,
      confirmationCall: data.checkout.confirmationCall,
      fee: data.pageFee === null ? null : data.pageFee === 0 ? { free: true } : { free: false, text: formatMoney(data.pageFee, data.currency, data.moneyLocale) },
      whatsapp: data.checkout.notServedWhatsapp ? data.whatsapp : null,
    });
  }, [now, zones, calendar, lead, city, data]);

  const off = !enabled ? t("landing.dz.live.off") : !onLanding ? t("landing.dz.live.offLanding") : null;
  return (
    <div className="grid gap-3 rounded-2xl bg-foreground/[0.025] p-4 ring-1 ring-border/80">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label htmlFor={`${id}-city`} className="font-medium">
          {t("landing.dz.live.title")}
        </label>
        <Select value={cityKey} onValueChange={setCityKey}>
          <SelectTrigger id={`${id}-city`} className="h-9 min-w-40 rounded-lg bg-background">
            {/* the name is given, not read from the closed list's items (empty until they mount) */}
            <SelectValue>{city ? <bdi>{nameOf(city)}</bdi> : null}</SelectValue>
          </SelectTrigger>
          <SelectContent position="popper" className="max-h-72 rounded-xl">
            {data.cities.map((c) => (
              <SelectItem key={c.key} value={c.key}>
                {nameOf(c)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-muted-foreground">{t("landing.dz.live.sees")}</span>
      </div>
      {off ? (
        <p className="text-sm text-muted-foreground">{off}</p>
      ) : !line ? (
        <div className="adm-shimmer h-5 w-2/3 rounded-full" />
      ) : line.state === "none" ? (
        <p className="text-sm text-muted-foreground">{t("landing.dz.live.none")}</p>
      ) : (
        <div lang={data.pageLocale} dir={data.pageLocale === "ar" ? "rtl" : "ltr"} className="grid gap-2">
          {line.state === "not_served" ? (
            <>
              <p className="text-[0.95rem] font-medium">{line.lead}</p>
              {line.cta ? (
                <span className="inline-flex h-10 w-fit items-center rounded-full bg-foreground px-4 text-sm font-medium text-background">{line.cta.label}</span>
              ) : (
                <p className="text-xs text-muted-foreground" lang={undefined} dir="auto">
                  {t("landing.dz.live.noWhatsapp")}
                </p>
              )}
            </>
          ) : (
            <p className="text-[0.95rem] leading-relaxed">
              {line.lead}
              {line.marker && <span className="text-muted-foreground"> {line.marker}</span>}
              {line.tail && (
                <>
                  {" · "}
                  <bdi dir="ltr">{line.tail}</bdi>
                </>
              )}
            </p>
          )}
        </div>
      )}
      {data.checkout.confirmationCall && calendar.confirmationLeadDays === null && enabled && <p className="text-xs leading-relaxed text-muted-foreground">{t("landing.dz.live.leadUnset")}</p>}
      {data.pageFee === null && enabled && onLanding && <p className="text-xs leading-relaxed text-muted-foreground">{t("landing.dz.live.noFee")}</p>}
    </div>
  );
}

function ZonesEmpty({ canWrite, onStart, onAdd }: { canWrite: boolean; onStart: () => void; onAdd: () => void }) {
  const t = useT();
  return (
    <section className="adm-surface grid gap-6 p-5 sm:p-8 md:grid-cols-[minmax(0,1fr)_18rem] md:items-center">
      <div className="grid content-center gap-3">
        <h3 className="text-[1rem] font-semibold tracking-[-0.01em]">{t("landing.dz.empty.title")}</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">{t("landing.dz.empty.teach")}</p>
        {canWrite && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button type="button" className="h-11 rounded-xl px-4 sm:h-10" onClick={onStart}>
              {t("landing.dz.empty.start")}
            </Button>
            <Button type="button" variant="ghost" className="h-11 rounded-xl sm:h-10" onClick={onAdd}>
              {t("landing.dz.zones.addEmpty")}
            </Button>
          </div>
        )}
      </div>
      <div aria-hidden="true" className="grid gap-2 opacity-70">
        {[0.9, 0.75, 0.6].map((o, i) => (
          <div key={i} className="grid gap-1.5 rounded-xl bg-card px-3 py-3 ring-1 ring-border" style={{ opacity: o }}>
            <div className="h-2.5 w-24 rounded-full bg-foreground/15" />
            <div className="h-2 w-16 rounded-full bg-foreground/10" />
            <div className="flex gap-2">
              <div className="h-2 w-20 rounded-full bg-foreground/10" />
              <div className="h-2 w-10 rounded-full bg-foreground/10" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Markets without a city list: "Usually delivered in [min] to [max] days" (`policies.delivery.typicalDays`). */
function TypicalDaysCard({ initial, canWrite, save }: { initial: [number, number] | null; canWrite: boolean; save: DeliveryActions["saveTypicalDays"] }) {
  const t = useT();
  const [min, setMin] = useState(initial?.[0]?.toString() ?? "");
  const [max, setMax] = useState(initial?.[1]?.toString() ?? "");
  const [error, setError] = useState<string | undefined>();
  const w = useOptimistic(initial, (v, opId) => save(opId, v), { fromResult: (d) => d.typicalDays });
  const commit = () => {
    const a = min.trim() === "" ? null : Number(min);
    const b = max.trim() === "" ? null : Number(max);
    if ((a === null) !== (b === null)) return setError(t("landing.dz.form.daysBoth"));
    if (a !== null && b !== null && (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b > 30)) return setError(t("landing.dz.form.daysRange", { max: 30 }));
    if (a !== null && b !== null && a > b) return setError(t("landing.dz.form.daysOrder"));
    setError(undefined);
    const next: [number, number] | null = a === null || b === null ? null : [a, b];
    if (JSON.stringify(next) !== JSON.stringify(w.latest.current)) void w.save(next, t("landing.dz.typical.saved"));
  };
  return (
    <SettingsSection title={t("landing.dz.typical.title")} description={t("landing.dz.typical.description")}>
      <Field label={t("landing.dz.form.days")} hint={t("landing.dz.typical.hint")} error={error}>
        {(f) => (
          <div className="flex items-center gap-2">
            <TextInput {...f} inputMode="numeric" aria-label={t("landing.dz.form.daysMin")} className="w-20 text-center tabular-nums" value={min} disabled={!canWrite} onChange={(e) => setMin(e.target.value)} onBlur={commit} />
            <span className="text-sm text-muted-foreground">{t("landing.dz.form.to")}</span>
            <TextInput inputMode="numeric" aria-label={t("landing.dz.form.daysMax")} className="w-20 text-center tabular-nums" value={max} disabled={!canWrite} onChange={(e) => setMax(e.target.value)} onBlur={commit} />
            <span className="text-sm text-muted-foreground">{t("landing.dz.form.days")}</span>
          </div>
        )}
      </Field>
    </SettingsSection>
  );
}
