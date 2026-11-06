"use client";
/**
 * The calendar card of the delivery editor (landing.md LAN-§7.3, §7.2, OPS-12): the working days, the order cut-off,
 * the confirmation lead with the server's suggestion (applied only by a tap), the holidays with "Add the fixed holidays
 * of <year>" (Morocco), the movable holidays as empty slots (they follow the moon sighting, never pre-filled) and
 * "I reviewed the holidays for <year>". Every change is one optimistic write.
 */
import { CalendarPlusIcon, CheckIcon, SparklesIcon, XIcon } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MA_FIXED_HOLIDAYS, MA_MOVABLE_HOLIDAYS } from "@/lib/delivery/holidays-ma";
import { MAX_LEAD_DAYS } from "@/lib/landing/limits";
import { useAdminLocale, useT } from "@/lib/i18n/admin/client";
import type { CheckoutSetting } from "@/lib/settings/keys/checkout";
import { cn } from "@/lib/utils";
import { SettingsSection } from "../settings/form-kit";

type Calendar = CheckoutSetting["calendar"];

const CUTOFFS = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
const pad = (n: number) => String(n).padStart(2, "0");

export function CalendarCard({
  calendar,
  canWrite,
  market,
  today,
  confirmationCall,
  suggestion,
  onPatch,
  onAddFixed,
  onReviewed,
  onApplySuggestion,
}: {
  calendar: Calendar;
  canWrite: boolean;
  market: string;
  today: string;
  confirmationCall: boolean;
  suggestion: { days: number; count: number } | null;
  onPatch: (patch: Partial<Calendar>, message: string) => void;
  onAddFixed: (year: number) => void;
  onReviewed: (year: number) => void;
  onApplySuggestion: () => void;
}) {
  const t = useT();
  const locale = useAdminLocale();
  const id = useId();
  const [date, setDate] = useState("");
  const year = Number(today.slice(0, 4));
  const morocco = market === "MA";
  const upcoming = calendar.holidays.filter((d) => d >= today);
  const past = calendar.holidays.length - upcoming.length;
  const missing = (y: number) => MA_FIXED_HOLIDAYS.map((h) => `${y}-${h.md}`).filter((d) => d >= today && !calendar.holidays.includes(d)).length;
  const fixedYear = missing(year) > 0 ? year : missing(year + 1) > 0 ? year + 1 : null;
  const reviewed = calendar.holidaysReviewedYear !== null && calendar.holidaysReviewedYear >= year;
  const dayName = (iso: number) => new Intl.DateTimeFormat(locale === "ar" ? "ar-MA" : locale, { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, iso)));
  const dateText = (ymd: string) => new Intl.DateTimeFormat(locale === "ar" ? "ar-MA" : locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC", numberingSystem: "latn" }).format(new Date(`${ymd}T00:00:00Z`));
  const holidayName = (ymd: string) => MA_FIXED_HOLIDAYS.find((h) => ymd.endsWith(h.md))?.label[locale];
  const lead = calendar.confirmationLeadDays;

  const toggleDay = (d: number) => {
    const has = calendar.workdays.includes(d);
    if (has && calendar.workdays.length === 1) return;
    onPatch({ workdays: has ? calendar.workdays.filter((x) => x !== d) : [...calendar.workdays, d].sort((a, b) => a - b) }, t("landing.dz.cal.saved.days"));
  };
  const addDate = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || calendar.holidays.includes(date)) return;
    onPatch({ holidays: [...calendar.holidays, date].sort() }, t("landing.dz.cal.saved.holiday"));
    setDate("");
  };

  return (
    <SettingsSection title={t("landing.dz.cal.title")} description={t("landing.dz.cal.description")}>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="grid content-start gap-2">
          <span id={`${id}-days`} className="text-sm font-medium">
            {t("landing.dz.cal.workdays")}
          </span>
          <div role="group" aria-labelledby={`${id}-days`} className="flex flex-wrap gap-1.5">
            {[1, 2, 3, 4, 5, 6, 7].map((d) => {
              const on = calendar.workdays.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  disabled={!canWrite}
                  onClick={() => toggleDay(d)}
                  className={cn(
                    "h-11 min-w-12 rounded-xl px-2 text-sm font-medium ring-1 transition-colors duration-200 ease-out outline-none ring-inset focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-default",
                    on ? "bg-foreground text-background ring-foreground" : "text-muted-foreground ring-border hover:text-foreground",
                  )}
                >
                  {dayName(d)}
                </button>
              );
            })}
          </div>
        </div>
        <div className="grid content-start gap-1.5">
          <label htmlFor={`${id}-cut`} className="text-sm font-medium">
            {t("landing.dz.cal.cutoff")}
          </label>
          <Select
            value={calendar.cutoffHour === null ? "none" : String(calendar.cutoffHour)}
            disabled={!canWrite}
            onValueChange={(v) => onPatch({ cutoffHour: v === "none" ? null : Number(v) }, t("landing.dz.cal.saved.cutoff"))}
          >
            <SelectTrigger id={`${id}-cut`} className="h-11 w-full max-w-60 rounded-xl bg-background sm:h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" className="rounded-xl">
              <SelectItem value="none">{t("landing.dz.cal.cutoffNone")}</SelectItem>
              {CUTOFFS.map((h) => (
                <SelectItem key={h} value={String(h)}>
                  <bdi dir="ltr">{`${pad(h)}:00`}</bdi>
                </SelectItem>
              ))}
              {calendar.cutoffHour !== null && !CUTOFFS.includes(calendar.cutoffHour) && (
                <SelectItem value={String(calendar.cutoffHour)}>
                  <bdi dir="ltr">{`${pad(calendar.cutoffHour)}:00`}</bdi>
                </SelectItem>
              )}
            </SelectContent>
          </Select>
          <p className="text-xs leading-relaxed text-muted-foreground">{t("landing.dz.cal.cutoffHint")}</p>
        </div>
      </div>

      {confirmationCall && (
        <div className="grid gap-2 border-t border-border/70 pt-5">
          <span id={`${id}-lead`} className="text-sm font-medium">
            {t("landing.dz.cal.lead")}
          </span>
          <div role="radiogroup" aria-labelledby={`${id}-lead`} className="flex flex-wrap gap-1.5">
            {Array.from({ length: MAX_LEAD_DAYS + 1 }, (_, n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={lead === n}
                disabled={!canWrite}
                onClick={() => onPatch({ confirmationLeadDays: n }, t("landing.dz.cal.saved.lead"))}
                className={cn(
                  "h-11 rounded-xl px-3.5 text-sm ring-1 transition-colors duration-200 ease-out outline-none ring-inset focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-default sm:h-10",
                  lead === n ? "bg-foreground font-medium text-background ring-foreground" : "text-muted-foreground ring-border hover:text-foreground",
                )}
              >
                {n === 0 ? t("landing.dz.cal.leadSame") : t("landing.dz.cal.leadDays", { n })}
              </button>
            ))}
          </div>
          {lead === null && <p className="text-xs leading-relaxed text-muted-foreground">{t("landing.dz.cal.leadUnset")}</p>}
          {suggestion && suggestion.days !== lead && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-foreground/[0.035] px-3 py-2 text-sm ring-1 ring-border">
              <SparklesIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">{t("landing.dz.cal.suggestion", { n: suggestion.days, count: suggestion.count })}</span>
              {canWrite && (
                <Button type="button" variant="outline" size="sm" className="h-9 rounded-lg" onClick={onApplySuggestion}>
                  {t("landing.dz.cal.suggestionUse", { n: suggestion.days })}
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      <div className="grid gap-3 border-t border-border/70 pt-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-sm font-medium">{t("landing.dz.cal.holidays")}</span>
          {past > 0 && <span className="text-xs text-muted-foreground">{t("landing.dz.cal.past", { n: past })}</span>}
        </div>
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("landing.dz.cal.noHolidays")}</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {upcoming.map((d) => (
              <li key={d} className="flex h-9 items-center gap-1 rounded-full bg-foreground/[0.05] ps-3 pe-1 text-xs ring-1 ring-border">
                <bdi dir="ltr" className="tabular-nums">
                  {dateText(d)}
                </bdi>
                {holidayName(d) && <span className="text-muted-foreground">· {holidayName(d)}</span>}
                {canWrite && (
                  <button
                    type="button"
                    aria-label={t("landing.dz.cal.removeHoliday", { date: dateText(d) })}
                    onClick={() => onPatch({ holidays: calendar.holidays.filter((x) => x !== d) }, t("landing.dz.cal.saved.holidayRemoved"))}
                    className="flex size-7 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-foreground/[0.06] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
                  >
                    <XIcon aria-hidden="true" className="size-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {canWrite && (
          <div className="flex flex-wrap items-end gap-2">
            {morocco && fixedYear !== null && (
              <Button type="button" variant="outline" className="h-11 gap-1.5 rounded-xl sm:h-10" onClick={() => onAddFixed(fixedYear)}>
                <CalendarPlusIcon aria-hidden="true" className="size-4" />
                {t("landing.dz.cal.addFixed", { year: fixedYear })}
              </Button>
            )}
            <div className="grid gap-1.5">
              <label htmlFor={`${id}-date`} className="text-xs font-medium text-muted-foreground">
                {t("landing.dz.cal.addDate")}
              </label>
              <div className="flex gap-2">
                <input
                  id={`${id}-date`}
                  type="date"
                  min={today}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  dir="ltr"
                  className="h-11 rounded-xl bg-background px-3 text-sm ring-1 ring-border outline-none focus-visible:ring-2 focus-visible:ring-ring/60 sm:h-10"
                />
                <Button type="button" variant="outline" className="h-11 rounded-xl sm:h-10" disabled={!date} onClick={addDate}>
                  {t("landing.dz.cal.add")}
                </Button>
              </div>
            </div>
          </div>
        )}
        {morocco && (
          <div className="grid gap-2 rounded-xl bg-foreground/[0.025] p-3 ring-1 ring-border/70">
            <p className="text-xs leading-relaxed text-muted-foreground">{t("landing.dz.cal.movableNote")}</p>
            <ul className="grid gap-1 sm:grid-cols-2">
              {MA_MOVABLE_HOLIDAYS.map((h) => (
                <li key={h.id} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm">
                  <span>{h.label[locale]}</span>
                  <span className="text-xs text-muted-foreground italic">{t("landing.dz.cal.notAnnounced")}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {reviewed ? (
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <CheckIcon aria-hidden="true" className="size-4" />
              {t("landing.dz.cal.reviewedDone", { year })}
            </span>
          ) : (
            canWrite && (
              <Button type="button" variant="ghost" className="h-11 rounded-xl sm:h-10" onClick={() => onReviewed(year)}>
                {t("landing.dz.cal.reviewed", { year })}
              </Button>
            )
          )}
        </div>
      </div>
    </SettingsSection>
  );
}
